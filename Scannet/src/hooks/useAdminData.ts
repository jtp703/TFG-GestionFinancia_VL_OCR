import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'

export interface AdminUser {
  id:              string
  email:           string
  role:            string
  created_at:      string
  ticket_count:    number
  consented_count: number
}

export interface AdminTicket {
  id:                           string
  comercio:                     string
  fecha:                        string
  metodo_pago:                  string
  verificado:                   boolean
  json_extraido:                any
  imagen_url:                   string | null
  consentimiento_entrenamiento: boolean | null
  timestamp:                    string
}

interface UseAdminDataResult {
  users:        AdminUser[]
  loading:      boolean
  error:        string | null
  fetchUsers:   () => Promise<void>
  fetchTickets: (userId: string) => Promise<AdminTicket[]>
  exportUrl:    (onlyConsented?: boolean) => Promise<void>
}

/** Hook para el panel de administración — requiere role='admin'. */
export function useAdminData(): UseAdminDataResult {
  const [users, setUsers]     = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function getToken(): Promise<string | null> {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    const token = await getToken()
    if (!token) { setError('Sesión expirada'); setLoading(false); return }

    try {
      const res = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const body = await res.json()
        setError(body.error ?? 'Error al cargar usuarios')
      } else {
        const body = await res.json()
        setUsers(body.users ?? [])
      }
    } catch {
      setError('Error de red')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchTickets = useCallback(async (userId: string): Promise<AdminTicket[]> => {
    const token = await getToken()
    if (!token) return []

    try {
      const res = await fetch(`/api/admin/tickets?userId=${encodeURIComponent(userId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return []
      const body = await res.json()
      return body.tickets ?? []
    } catch {
      return []
    }
  }, [])

  const exportUrl = useCallback(async (onlyConsented = true) => {
    const token = await getToken()
    if (!token) return

    const param = onlyConsented ? 'true' : 'false'
    const res = await fetch(`/api/admin/export?onlyConsented=${param}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return

    const blob = await res.blob()
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = res.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') ?? 'export.jsonl'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [])

  return { users, loading, error, fetchUsers, fetchTickets, exportUrl }
}
