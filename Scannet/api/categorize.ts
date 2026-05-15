import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CATEGORIAS = ['Alimentación', 'Transporte', 'Ocio', 'Hogar', 'Salud', 'Otros'] as const

/** POST /api/categorize — recibe { comercio } y devuelve { categoria } usando DeepSeek API */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Autenticar usuario
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'No autorizado' })

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Token inválido' })

  const { comercio, items } = req.body ?? {}
  if (!comercio) return res.status(400).json({ error: 'Falta el campo comercio' })

  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'DEEPSEEK_API_KEY no configurado' })

  const itemsDesc = ((items ?? []) as any[]).slice(0, 8).map((i: any) => i.descripcion).filter(Boolean).join(', ')
  const contexto = itemsDesc ? `\nProductos del ticket: ${itemsDesc}` : ''
  const prompt = `Clasifica este establecimiento en exactamente una de estas categorías: ${CATEGORIAS.join(', ')}.
Nota: bares, cafeterías, restaurantes y cualquier establecimiento de comida o bebida preparada → Ocio.
Comercio: "${comercio}"${contexto}
Responde únicamente con el nombre de la categoría, sin explicación ni puntuación adicional.`

  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 20,
        temperature: 0,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      return res.status(502).json({ error: `Error de DeepSeek API: ${errText}` })
    }

    const data = await response.json()
    const raw: string = data.choices?.[0]?.message?.content?.trim() ?? ''

    // Validar que la respuesta es una de las categorías permitidas
    const categoria = CATEGORIAS.find(c => raw.toLowerCase().includes(c.toLowerCase())) ?? 'Otros'

    return res.status(200).json({ categoria })
  } catch (err: any) {
    return res.status(502).json({ error: `Fallo al llamar a DeepSeek: ${err.message}` })
  }
}
