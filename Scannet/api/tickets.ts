import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/** GET /api/tickets — devuelve tickets del mes en curso del usuario autenticado */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Extraer JWT del header Authorization
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'No autorizado' })

  // Verificar usuario con el JWT
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Token inválido' })

  // Rango del mes en curso
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const to   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]

  // Consultar tickets con productos (vía ticket_producto) y categoría
  const { data: tickets, error } = await supabase
    .from('ticket')
    .select(`
      id,
      comercio,
      fecha,
      metodo_pago,
      verificado,
      categoria:categoria_id ( id, nombre ),
      lineas:ticket_producto (
        id,
        cantidad,
        precio_total,
        producto:producto_id ( id, descripcion, precio_unitario )
      )
    `)
    .eq('usuario_id', user.id)
    .gte('fecha', from)
    .lte('fecha', to)
    .order('fecha', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })

  // Aplanar lineas al formato Producto esperado por el frontend y calcular totales
  const ticketsConTotal = (tickets ?? []).map((t: any) => {
    const productos = (t.lineas ?? []).map((l: any) => ({
      id:              l.producto?.id ?? l.id,
      descripcion:     l.producto?.descripcion ?? '',
      cantidad:        l.cantidad,
      precio_unitario: l.producto?.precio_unitario ?? 0,
      precio_total:    l.precio_total,
    }))
    const total = productos.reduce(
      (sum: number, p: any) => sum + Number(p.precio_total),
      0
    )
    const { lineas: _, ...ticketBase } = t
    return { ...ticketBase, productos, total }
  })

  // Agrupar totales por categoría
  const totalesPorCategoria: Record<string, { nombre: string; total: number }> = {}
  for (const t of ticketsConTotal) {
    const catId   = t.categoria?.id    ?? 'sin-categoria'
    const catNombre = t.categoria?.nombre ?? 'Sin categoría'
    if (!totalesPorCategoria[catId]) {
      totalesPorCategoria[catId] = { nombre: catNombre, total: 0 }
    }
    totalesPorCategoria[catId].total += t.total
  }

  const totalMes = ticketsConTotal.reduce((sum: number, t: any) => sum + t.total, 0)

  return res.status(200).json({ tickets: ticketsConTotal, totalesPorCategoria, totalMes })
}
