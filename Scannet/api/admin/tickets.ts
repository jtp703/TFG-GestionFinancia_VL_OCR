import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/** GET /api/admin/tickets?userId=xxx — tickets de un usuario (solo admins) */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'No autorizado' })

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Token inválido' })

  const { data: perfil } = await supabaseAdmin
    .from('perfil_usuario')
    .select('role')
    .eq('id', user.id)
    .single()

  if (perfil?.role !== 'admin') return res.status(403).json({ error: 'Acceso denegado' })

  const userId = req.query.userId as string
  if (!userId) return res.status(400).json({ error: 'userId requerido' })

  const { data: tickets, error } = await supabaseAdmin
    .from('ticket')
    .select('id, comercio, fecha, metodo_pago, verificado, json_extraido, imagen_url, consentimiento_entrenamiento, timestamp')
    .eq('usuario_id', userId)
    .order('timestamp', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json({ tickets: tickets ?? [] })
}
