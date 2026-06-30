import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SIGNED_URL_EXPIRY = 60 * 60 * 24 * 7 // 7 días

/** GET /api/admin/export?onlyConsented=true — exporta tickets como JSONL (solo admins) */
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

  const onlyConsented = req.query.onlyConsented !== 'false'

  let query = supabaseAdmin
    .from('ticket')
    .select('id, usuario_id, comercio, fecha, json_extraido, imagen_url, consentimiento_entrenamiento, timestamp')
    .eq('verificado', true)
    .order('timestamp', { ascending: true })

  if (onlyConsented) {
    query = query.eq('consentimiento_entrenamiento', true)
  }

  const { data: tickets, error } = await query

  if (error) return res.status(500).json({ error: error.message })

  // Marcar tickets exportados como ya consumidos (consent=false) para que no se
  // vuelvan a exportar. La acción es irreversible — el dataset se extrae una sola vez.
  if (onlyConsented && tickets && tickets.length > 0) {
    const ids = tickets.map((t: any) => t.id)
    await supabaseAdmin
      .from('ticket')
      .update({ consentimiento_entrenamiento: false })
      .in('id', ids)
  }

  const lines: string[] = []

  for (const ticket of tickets ?? []) {
    let imageUrl = ''

    if (ticket.imagen_url) {
      const { data: signed } = await supabaseAdmin.storage
        .from('tickets')
        .createSignedUrl(ticket.imagen_url, SIGNED_URL_EXPIRY)
      imageUrl = signed?.signedUrl ?? ''
    }

    const groundTruth = ticket.json_extraido
      ? JSON.stringify(ticket.json_extraido)
      : ''

    const line = JSON.stringify({
      image_url:                   imageUrl,
      image_path:                  ticket.imagen_url ?? '',
      ground_truth:                groundTruth,
      usuario_id:                  ticket.usuario_id,
      comercio:                    ticket.comercio ?? '',
      fecha:                       ticket.fecha ?? '',
      consentimiento_entrenamiento: ticket.consentimiento_entrenamiento,
      timestamp:                   ticket.timestamp,
    })

    lines.push(line)
  }

  const fecha = new Date().toISOString().split('T')[0]
  const filename = `scannet_export_${fecha}.jsonl`

  res.setHeader('Content-Type', 'application/x-ndjson')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  return res.status(200).send(lines.join('\n'))
}
