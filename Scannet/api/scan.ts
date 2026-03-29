import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import formidable from 'formidable'
import fs from 'fs'

export const config = { api: { bodyParser: false } }

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/** Parsea el multipart/form-data y devuelve { fields, files } */
function parseForm(req: VercelRequest): Promise<{ fields: formidable.Fields; files: formidable.Files }> {
  return new Promise((resolve, reject) => {
    const form = formidable({ maxFileSize: 10 * 1024 * 1024 })
    form.parse(req, (err, fields, files) => {
      if (err) reject(err)
      else resolve({ fields, files })
    })
  })
}

/** POST /api/scan — recibe imagen, llama a HuggingFace Inference API, devuelve JSON del ticket */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Autenticar usuario
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'No autorizado' })

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Token inválido' })

  // Parsear multipart
  let fields: formidable.Fields
  let files: formidable.Files
  try {
    ({ fields, files } = await parseForm(req))
  } catch {
    return res.status(400).json({ error: 'Error al procesar el formulario' })
  }

  const imageFile = Array.isArray(files.image) ? files.image[0] : files.image
  if (!imageFile) return res.status(400).json({ error: 'No se recibió imagen' })

  const metodoPago = Array.isArray(fields.metodo_pago)
    ? fields.metodo_pago[0]
    : (fields.metodo_pago ?? 'efectivo')

  // Leer imagen y convertir a base64
  const imageBuffer = fs.readFileSync(imageFile.filepath)
  const base64Image = imageBuffer.toString('base64')
  const mimeType = imageFile.mimetype ?? 'image/jpeg'

  // Llamar a HuggingFace Inference API
  const hfToken = process.env.HF_API_TOKEN
  const modelId = process.env.HF_MODEL_ID ?? 'Lacax/Tickets'

  if (!hfToken) return res.status(500).json({ error: 'HF_API_TOKEN no configurado' })

  let ocrResult: any
  try {
    const hfResponse = await fetch(
      `https://api-inference.huggingface.co/models/${modelId}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${hfToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: {
            image: `data:${mimeType};base64,${base64Image}`,
            question: 'Extrae los datos del ticket: comercio, CIF, fecha, total e items con descripcion, cantidad y precio.',
          },
        }),
      }
    )

    if (!hfResponse.ok) {
      const errText = await hfResponse.text()
      return res.status(502).json({ error: `Error del modelo OCR: ${errText}` })
    }

    const raw = await hfResponse.json()

    // El modelo devuelve texto JSON — parsearlo
    const text: string = raw?.generated_text ?? raw?.answer ?? JSON.stringify(raw)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return res.status(422).json({ error: 'El modelo no devolvió JSON válido', raw: text })

    ocrResult = JSON.parse(jsonMatch[0])
  } catch (err: any) {
    return res.status(502).json({ error: `Fallo al llamar al modelo: ${err.message}` })
  }

  return res.status(200).json({
    comercio:    ocrResult.comercio   ?? '',
    cif:         ocrResult.cif        ?? '',
    fecha:       ocrResult.fecha      ?? '',
    total:       ocrResult.total      ?? 0,
    items:       ocrResult.items      ?? [],
    metodo_pago: metodoPago,
  })
}
