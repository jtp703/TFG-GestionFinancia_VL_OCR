/**
 * Servidor local de desarrollo — reemplaza vercel dev para testear el modelo local.
 * Corre en puerto 3000 (mismo que espera el proxy de Vite).
 *
 * Uso:
 *   cd Scannet
 *   node local-dev-server.js
 */

require('dotenv').config({ path: '.env.local' })
const http  = require('http')
const https = require('https')
const url   = require('url')
const { createClient } = require('@supabase/supabase-js')

const PORT            = 3000
const LOCAL_MODEL_URL = process.env.LOCAL_MODEL_URL
const SUPABASE_URL    = process.env.SUPABASE_URL
const SUPABASE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Helpers ──────────────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', chunk => data += chunk)
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}) }
      catch { reject(new Error('JSON inválido')) }
    })
    req.on('error', reject)
  })
}

function fetchJson(targetUrl, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed  = new url.URL(targetUrl)
    const lib     = parsed.protocol === 'https:' ? https : http
    const reqOpts = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   options.method || 'GET',
      headers:  options.headers || {},
    }
    const req = lib.request(reqOpts, res => {
      let body = ''
      res.on('data', c => body += c)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }) }
        catch { resolve({ status: res.statusCode, data: body }) }
      })
    })
    req.on('error', reject)
    if (options.body) req.write(options.body)
    req.end()
  })
}

function send(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':'*',
  })
  res.end(payload)
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async function handleScan(req, res, body) {
  if (!LOCAL_MODEL_URL) return send(res, 500, { error: 'LOCAL_MODEL_URL no configurado' })

  const { image, metodo_pago, mimeType } = body
  if (!image) return send(res, 400, { error: 'No se recibió imagen' })

  const base64Image = image.startsWith('data:') ? image.split(',')[1] : image
  const metodoPago  = metodo_pago ?? 'efectivo'

  console.log('[scan] Enviando imagen al modelo local...')
  try {
    const payload = JSON.stringify({ image: base64Image, mimeType: mimeType ?? 'image/jpeg' })
    const result  = await fetchJson(`${LOCAL_MODEL_URL}/infer`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      body:    payload,
    })

    if (result.status !== 200) return send(res, 502, { error: `Error modelo: ${JSON.stringify(result.data)}` })

    const r = result.data
    console.log('[scan] Resultado:', JSON.stringify(r).slice(0, 120))
    return send(res, 200, {
      comercio:    r.comercio   ?? '',
      cif:         r.cif        ?? '',
      fecha:       r.fecha      ?? '',
      total:       Number(r.total) || 0,
      items:       (r.items ?? []).map(i => ({
        descripcion: i.descripcion ?? '',
        cantidad:    Number(i.cantidad) || 1,
        precio:      Number(i.precio)   || 0,
      })),
      metodo_pago: metodoPago,
    })
  } catch (err) {
    console.error('[scan] Error:', err.message)
    return send(res, 502, { error: `No se pudo conectar con el modelo: ${err.message}` })
  }
}

async function handleTickets(req, res, authToken) {
  if (!authToken) return send(res, 401, { error: 'No autorizado' })

  const { data: { user }, error: authError } = await supabase.auth.getUser(authToken)
  if (authError || !user) return send(res, 401, { error: 'Token inválido' })

  const now  = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const to   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]

  const { data: tickets, error } = await supabase
    .from('ticket')
    .select(`id, comercio, fecha, metodo_pago, verificado,
      categoria:categoria_id ( id, nombre ),
      lineas:ticket_producto ( id, cantidad, precio_total, producto:producto_id ( id, descripcion, precio_unitario ) )`)
    .eq('usuario_id', user.id)
    .gte('fecha', from)
    .lte('fecha', to)
    .order('fecha', { ascending: false })

  if (error) return send(res, 500, { error: error.message })

  const ticketsConTotal = (tickets ?? []).map(t => {
    const productos = (t.lineas ?? []).map(l => ({
      id:              l.producto?.id ?? l.id,
      descripcion:     l.producto?.descripcion ?? '',
      cantidad:        l.cantidad,
      precio_unitario: l.producto?.precio_unitario ?? 0,
      precio_total:    l.precio_total,
    }))
    const total = productos.reduce((sum, p) => sum + Number(p.precio_total), 0)
    const { lineas: _, ...ticketBase } = t
    return { ...ticketBase, productos, total }
  })

  const totalesPorCategoria = {}
  for (const t of ticketsConTotal) {
    const catId     = t.categoria?.id     ?? 'sin-categoria'
    const catNombre = t.categoria?.nombre ?? 'Sin categoría'
    if (!totalesPorCategoria[catId]) totalesPorCategoria[catId] = { nombre: catNombre, total: 0 }
    totalesPorCategoria[catId].total += t.total
  }

  const totalMes = ticketsConTotal.reduce((sum, t) => sum + t.total, 0)
  return send(res, 200, { tickets: ticketsConTotal, totalesPorCategoria, totalMes })
}

async function handleCategorize(req, res, body, authToken) {
  if (!authToken) return send(res, 401, { error: 'No autorizado' })

  const { data: { user }, error: authError } = await supabase.auth.getUser(authToken)
  if (authError || !user) return send(res, 401, { error: 'Token inválido' })

  const { comercio, items } = body ?? {}
  if (!comercio) return send(res, 400, { error: 'Falta el campo comercio' })

  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return send(res, 500, { error: 'DEEPSEEK_API_KEY no configurado' })

  const CATEGORIAS = ['Alimentación', 'Transporte', 'Ocio', 'Hogar', 'Salud', 'Otros']
  const itemsDesc = (items ?? []).slice(0, 8).map(i => i.descripcion).filter(Boolean).join(', ')
  const contexto = itemsDesc ? `\nProductos del ticket: ${itemsDesc}` : ''
  const prompt = `Clasifica este establecimiento en exactamente una de estas categorías: ${CATEGORIAS.join(', ')}.
Nota: bares, cafeterías, restaurantes y cualquier establecimiento de comida o bebida preparada → Ocio.
Comercio: "${comercio}"${contexto}
Responde únicamente con el nombre de la categoría, sin explicación ni puntuación adicional.`

  try {
    const result = await fetchJson('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization':  `Bearer ${apiKey}`,
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: prompt }], max_tokens: 20, temperature: 0 })),
      },
      body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: prompt }], max_tokens: 20, temperature: 0 }),
    })
    if (result.status !== 200) return send(res, 502, { error: `Error DeepSeek: ${JSON.stringify(result.data)}` })
    const raw = result.data?.choices?.[0]?.message?.content?.trim() ?? ''
    const categoria = CATEGORIAS.find(c => raw.toLowerCase().includes(c.toLowerCase())) ?? 'Otros'
    console.log(`[categorize] comercio="${comercio}" → raw="${raw}" → categoria="${categoria}"`)
    return send(res, 200, { categoria })
  } catch (err) {
    return send(res, 502, { error: `Fallo al llamar a DeepSeek: ${err.message}` })
  }
}

// ── Servidor principal ────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' })
    return res.end()
  }

  const pathname    = url.parse(req.url).pathname
  const authHeader  = req.headers.authorization ?? ''
  const token       = authHeader.replace('Bearer ', '')

  try {
    if (req.method === 'POST' && pathname === '/api/scan') {
      const body = await readBody(req)
      return handleScan(req, res, body)
    }
    if (req.method === 'GET' && pathname === '/api/tickets') {
      return handleTickets(req, res, token)
    }
    if (req.method === 'POST' && pathname === '/api/categorize') {
      const body = await readBody(req)
      return handleCategorize(req, res, body, token)
    }
    send(res, 404, { error: 'Ruta no encontrada' })
  } catch (err) {
    console.error(err)
    send(res, 500, { error: err.message })
  }
})

server.listen(PORT, () => {
  console.log(`[local-dev-server] Corriendo en http://localhost:${PORT}`)
  console.log(`[local-dev-server] LOCAL_MODEL_URL = ${LOCAL_MODEL_URL ?? '(no configurado)'}`)
})
