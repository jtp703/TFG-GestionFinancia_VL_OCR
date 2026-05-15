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

const PROMPT =
  'Aquí está el texto extraído de un ticket español. Extrae la información y devuélvela ESTRICTAMENTE como un objeto JSON válido con esta estructura:\n\n' +
  '{"comercio": "string", "cif": "string", "fecha": "string", "total": "number", "items": [{"cantidad": "int", "descripcion": "string", "precio": "number"}]}\n\n' +
  'SOLO el JSON. Sin texto adicional ni explicaciones.'

/** POST /api/scan — paso 1: OCR.space extrae texto, paso 2: DeepSeek parsea a JSON */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Modo mock — responde inmediatamente sin llamar a ninguna API
  if (process.env.USE_MOCK_OCR === 'true') {
    const metodo_pago = req.body?.metodo_pago ?? 'efectivo'
    return res.status(200).json({ ...MOCK_RESULT, metodo_pago })
  }

  // Modelo local — llama al servidor Python local (DeepSeek-OCR-2 + DirectML)
  const localModelUrl = process.env.LOCAL_MODEL_URL
  if (localModelUrl) {
    const { image, metodo_pago, mimeType } = req.body ?? {}
    if (!image) return res.status(400).json({ error: 'No se recibió imagen' })

    const base64Image = image.startsWith('data:') ? image.split(',')[1] : image
    const metodoPago: string = metodo_pago ?? 'efectivo'

    try {
      const localRes = await fetch(`${localModelUrl}/infer`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ image: base64Image, mimeType: mimeType ?? 'image/jpeg' }),
      })
      if (!localRes.ok) {
        const err = await localRes.text()
        return res.status(502).json({ error: `Error modelo local: ${err}` })
      }
      const result = await localRes.json()
      return res.status(200).json({
        comercio:    result.comercio   ?? '',
        cif:         result.cif        ?? '',
        fecha:       result.fecha      ?? '',
        total:       Number(result.total) || 0,
        items:       (result.items ?? []).map((item: any) => ({
          descripcion: item.descripcion ?? '',
          cantidad:    Number(item.cantidad) || 1,
          precio:      Number(item.precio)   || 0,
        })),
        metodo_pago: metodoPago,
      })
    } catch (err: any) {
      return res.status(502).json({ error: `No se pudo conectar con el modelo local: ${err.message}` })
    }
  }

  // Autenticar usuario
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'No autorizado' })

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Token inválido' })

  const { image, metodo_pago, mimeType: mime } = req.body ?? {}
  if (!image) return res.status(400).json({ error: 'No se recibió imagen' })

  const dataUrl: string = image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`
  const base64Image = dataUrl.split(',')[1]
  const mimeType: string = mime ?? (dataUrl.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg')
  const metodoPago: string = metodo_pago ?? 'efectivo'

  // ── Paso 1: OCR.space — extrae texto del ticket ───────────────────────────
  const ocrKey = process.env.OCR_SPACE_API_KEY ?? 'helloworld'

  let rawText = ''
  try {
    const ocrRes = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        apikey:             ocrKey,
        base64Image:        `data:${mimeType};base64,${base64Image}`,
        language:           'spa',
        isOverlayRequired:  'false',
        OCREngine:          '2',
      }).toString(),
    })

    if (!ocrRes.ok) {
      const err = await ocrRes.text()
      return res.status(502).json({ error: `Error OCR.space: ${err}` })
    }

    const ocrData = await ocrRes.json()

    if (ocrData.IsErroredOnProcessing) {
      return res.status(502).json({ error: `OCR.space: ${ocrData.ErrorMessage?.[0] ?? 'error desconocido'}` })
    }

    rawText = ocrData?.ParsedResults?.[0]?.ParsedText ?? ''
  } catch (err: any) {
    return res.status(502).json({ error: `Fallo en OCR: ${err.message}` })
  }

  if (!rawText.trim()) {
    return res.status(422).json({ error: 'No se pudo extraer texto del ticket' })
  }

  // ── Paso 2: DeepSeek — parsea el texto a JSON estructurado ────────────────
  const deepseekKey = process.env.DEEPSEEK_API_KEY
  if (!deepseekKey) return res.status(500).json({ error: 'DEEPSEEK_API_KEY no configurado' })

  let ocrResult: any
  try {
    const dsRes = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${deepseekKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model:       'deepseek-chat',
        messages:    [{ role: 'user', content: `${PROMPT}\n\nTexto del ticket:\n${rawText}` }],
        max_tokens:  1024,
        temperature: 0,
      }),
    })

    if (!dsRes.ok) {
      const err = await dsRes.text()
      return res.status(502).json({ error: `Error DeepSeek: ${err}` })
    }

    const raw = await dsRes.json()
    const text: string = raw?.choices?.[0]?.message?.content ?? ''

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return res.status(422).json({ error: 'DeepSeek no devolvió JSON válido', raw: text })

    ocrResult = JSON.parse(jsonMatch[0])
  } catch (err: any) {
    return res.status(502).json({ error: `Fallo en DeepSeek: ${err.message}` })
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
