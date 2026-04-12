import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/** Ticket de prueba para modo mock */
const MOCK_RESULT = {
  comercio: 'MERCADONA, S.A.',
  cif:      'A-46103834',
  fecha:    '15/03/2025',
  total:    24.50,
  items: [
    { descripcion: 'LECHE ENTERA HACENDADO 1L', cantidad: 2, precio: 0.89 },
    { descripcion: 'PAN DE MOLDE TIERNO',       cantidad: 1, precio: 1.45 },
    { descripcion: 'PECHUGA PAVO LONCHAS',       cantidad: 1, precio: 2.35 },
    { descripcion: 'ACEITE OLIVA VIRGEN 1L',     cantidad: 1, precio: 4.99 },
    { descripcion: 'YOGUR NATURAL PACK 8',       cantidad: 2, precio: 1.89 },
    { descripcion: 'FRUTA VARIADA KG',           cantidad: 1, precio: 3.20 },
  ],
}

/** POST /api/scan — recibe imagen en base64, llama a HuggingFace Inference API, devuelve JSON del ticket */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Modo mock — responde inmediatamente sin autenticar ni llamar al modelo
  if (process.env.USE_MOCK_OCR === 'true') {
    const metodo_pago = req.body?.metodo_pago ?? 'efectivo'
    return res.status(200).json({ ...MOCK_RESULT, metodo_pago })
  }

  // Autenticar usuario
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'No autorizado' })

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Token inválido' })

  const { image, metodo_pago, mimeType: mime } = req.body ?? {}
  if (!image) return res.status(400).json({ error: 'No se recibió imagen' })

  // La imagen llega como data URL o base64 puro
  const dataUrl: string = image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`
  const base64Image = dataUrl.split(',')[1]
  const mimeType: string = mime ?? (dataUrl.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg')
  const metodoPago: string = metodo_pago ?? 'efectivo'

  // Llamar a Gemini 1.5 Flash — visión + extracción de JSON
  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) return res.status(500).json({ error: 'GEMINI_API_KEY no configurado' })

  const PROMPT =
    'Extract the following information from the receipt and return it STRICTLY as a valid JSON object matching this structure:\n\n' +
    '{"comercio": "string", "cif": "string", "fecha": "string", "total": "number", "items": [{"cantidad": "int", "descripcion": "string", "precio": "number"}]}\n\n' +
    'NO other text. ONLY valid JSON.'

  let ocrResult: any
  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: mimeType, data: base64Image } },
              { text: PROMPT },
            ],
          }],
          generationConfig: { temperature: 0, maxOutputTokens: 1024 },
        }),
      }
    )

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      return res.status(502).json({ error: `Error Gemini: ${errText}` })
    }

    const raw = await geminiRes.json()
    const text: string = raw?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return res.status(422).json({ error: 'Gemini no devolvió JSON válido', raw: text })

    ocrResult = JSON.parse(jsonMatch[0])
  } catch (err: any) {
    return res.status(502).json({ error: `Fallo al llamar a Gemini: ${err.message}` })
  }

  return res.status(200).json({
    comercio:    ocrResult.comercio   ?? '',
    cif:         ocrResult.cif        ?? '',
    fecha:       ocrResult.fecha      ?? '',
    total:       ocrResult.total      ?? 0,
    items:       (ocrResult.items ?? []).map((item: any) => ({
      ...item,
      cantidad: Number(item.cantidad) || 1,
      precio:   Number(item.precio)   || 0,
    })),
    metodo_pago: metodoPago,
  })
}
