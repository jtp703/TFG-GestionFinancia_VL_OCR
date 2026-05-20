import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from './_lib/rateLimit'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CATEGORIAS = ['Alimentación', 'Transporte', 'Ocio', 'Hogar', 'Salud', 'Otros'] as const
const TIMEOUT_MS = 30_000

function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer))
}

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

  // Rate limit: máx 30 categorizaciones por minuto por usuario
  if (!checkRateLimit(`cat:${user.id}`, 30)) {
    return res.status(429).json({ error: 'Demasiadas peticiones. Espera un momento.' })
  }

  const { comercio, items } = req.body ?? {}
  if (!comercio) return res.status(400).json({ error: 'Falta el campo comercio' })

  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'Configuración de servidor incompleta' })

  const itemsDesc = ((items ?? []) as any[]).slice(0, 8).map((i: any) => i.descripcion).filter(Boolean).join(', ')
  const contexto = itemsDesc ? `\nProductos del ticket: ${itemsDesc}` : ''
  const prompt = `Clasifica este establecimiento en exactamente una de estas categorías: ${CATEGORIAS.join(', ')}.
Nota: bares, cafeterías, restaurantes y cualquier establecimiento de comida o bebida preparada → Ocio.
Comercio: "${comercio}"${contexto}
Responde únicamente con el nombre de la categoría, sin explicación ni puntuación adicional.`

  try {
    const response = await fetchWithTimeout('https://api.deepseek.com/chat/completions', {
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
      console.error('[categorize] DeepSeek error:', await response.text())
      return res.status(502).json({ error: 'Error al categorizar el ticket' })
    }

    const data = await response.json()
    const raw: string = data.choices?.[0]?.message?.content?.trim() ?? ''

    // Validar que la respuesta es una de las categorías permitidas
    const categoria = CATEGORIAS.find(c => raw.toLowerCase().includes(c.toLowerCase())) ?? 'Otros'

    return res.status(200).json({ categoria })
  } catch (err: any) {
    console.error('[categorize] fetch error:', err.message)
    return res.status(504).json({ error: 'El servicio de categorización no respondió a tiempo' })
  }
}
