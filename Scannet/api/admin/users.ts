import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/** GET /api/admin/users — lista todos los usuarios con conteo de tickets (solo admins) */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'No autorizado' })

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Token inválido' })

  // Verificar que el usuario es admin
  const { data: perfil } = await supabaseAdmin
    .from('perfil_usuario')
    .select('role')
    .eq('id', user.id)
    .single()

  if (perfil?.role !== 'admin') return res.status(403).json({ error: 'Acceso denegado' })

  // Obtener todos los perfiles con conteo de tickets (total y con consentimiento)
  const { data: perfiles, error: perfilesError } = await supabaseAdmin
    .from('perfil_usuario')
    .select('id, role, created_at')
    .order('created_at', { ascending: false })

  if (perfilesError) return res.status(500).json({ error: perfilesError.message })

  // Obtener emails desde auth.admin
  const { data: authUsers, error: authUsersError } = await supabaseAdmin.auth.admin.listUsers()
  if (authUsersError) return res.status(500).json({ error: authUsersError.message })

  const emailMap: Record<string, string> = {}
  for (const u of authUsers.users) {
    emailMap[u.id] = u.email ?? ''
  }

  // Contar tickets por usuario (total y con consentimiento)
  const { data: ticketCounts } = await supabaseAdmin
    .from('ticket')
    .select('usuario_id, consentimiento_entrenamiento')

  const countMap: Record<string, { total: number; consented: number }> = {}
  for (const t of ticketCounts ?? []) {
    if (!countMap[t.usuario_id]) countMap[t.usuario_id] = { total: 0, consented: 0 }
    countMap[t.usuario_id].total++
    if (t.consentimiento_entrenamiento === true) countMap[t.usuario_id].consented++
  }

  const users = (perfiles ?? []).map((p: any) => ({
    id:              p.id,
    email:           emailMap[p.id] ?? '',
    role:            p.role,
    created_at:      p.created_at,
    ticket_count:    countMap[p.id]?.total    ?? 0,
    consented_count: countMap[p.id]?.consented ?? 0,
  }))

  return res.status(200).json({ users })
}
