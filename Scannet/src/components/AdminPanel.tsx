import { useEffect, useState } from 'react'
import { useAdminData, type AdminTicket, type AdminUser } from '../hooks/useAdminData'

function JsonPreview({ data }: { data: any }) {
  const [open, setOpen] = useState(false)
  if (!data) return <span style={{ color: 'var(--text-muted)' }}>—</span>

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="text-xs px-2 py-0.5 rounded transition-opacity hover:opacity-70"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
      >
        {open ? 'Ocultar' : 'Ver JSON'}
      </button>
      {open && (
        <pre
          className="mt-2 text-xs overflow-x-auto rounded p-2 max-h-48"
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        >
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  )
}

function UserRow({ user, fetchTickets }: { user: AdminUser; fetchTickets: (id: string) => Promise<AdminTicket[]> }) {
  const [open, setOpen]       = useState(false)
  const [tickets, setTickets] = useState<AdminTicket[] | null>(null)
  const [loading, setLoading] = useState(false)

  async function toggle() {
    if (loading) return
    if (!open && tickets === null) {
      setLoading(true)
      try {
        const data = await fetchTickets(user.id)
        setTickets(data)
        setOpen(true)
      } finally {
        setLoading(false)
      }
      return
    }
    setOpen(v => !v)
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--border)' }}
    >
      {/* Cabecera de fila */}
      <button
        onClick={toggle}
        disabled={loading}
        className="w-full flex items-center justify-between px-4 py-3 text-left transition-opacity hover:opacity-80 disabled:opacity-60 disabled:cursor-wait"
        style={{ background: 'var(--surface)', color: 'var(--text-primary)' }}
      >
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">{user.email || '(sin email)'}</span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {user.ticket_count} tickets · {user.consented_count} con consentimiento
            {user.role === 'admin' && (
              <span className="ml-2 px-1.5 py-0.5 rounded text-xs font-medium"
                style={{ background: 'var(--color-brand)', color: '#fff' }}>
                admin
              </span>
            )}
          </span>
        </div>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Tickets expandidos */}
      {open && (
        <div className="px-4 pb-4 pt-2" style={{ background: 'var(--bg)' }}>
          {loading && (
            <p className="text-sm py-4 text-center" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
          )}
          {!loading && tickets && tickets.length === 0 && (
            <p className="text-sm py-4 text-center" style={{ color: 'var(--text-muted)' }}>Sin tickets.</p>
          )}
          {!loading && tickets && tickets.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[480px]">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                    <th className="py-2 text-left font-medium">Comercio</th>
                    <th className="py-2 text-left font-medium">Fecha</th>
                    <th className="py-2 text-left font-medium">Consent.</th>
                    <th className="py-2 text-left font-medium">JSON</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map(t => (
                    <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="py-2 pr-3" style={{ color: 'var(--text-primary)' }}>{t.comercio}</td>
                      <td className="py-2 pr-3" style={{ color: 'var(--text-muted)' }}>{t.fecha}</td>
                      <td className="py-2 pr-3">
                        {t.consentimiento_entrenamiento === true && (
                          <span style={{ color: '#22c55e' }}>✓ Sí</span>
                        )}
                        {t.consentimiento_entrenamiento === false && (
                          <span style={{ color: '#ef4444' }}>✗ No</span>
                        )}
                        {t.consentimiento_entrenamiento === null && (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td className="py-2">
                        <JsonPreview data={t.json_extraido} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Panel de administración visible solo para usuarios con role='admin'. */
export function AdminPanel() {
  const { users, loading, error, fetchUsers, fetchTickets, exportUrl } = useAdminData()
  const [exporting, setExporting] = useState(false)

  useEffect(() => { fetchUsers() }, [fetchUsers])

  // Mostrar solo usuarios con al menos un ticket consentido (los demás no aportan al dataset).
  const usersConConsentimiento = users.filter(u => u.consented_count > 0)
  const totalConsented = usersConConsentimiento.reduce((s, u) => s + u.consented_count, 0)

  async function handleExport() {
    const ok = window.confirm(
      `Vas a exportar ${totalConsented} ticket(s) con consentimiento.\n\n` +
      `Esta acción es IRREVERSIBLE: con el fin de no repetir datos, los tickets exportados ` +
      `dejarán de aparecer en futuras exportaciones. Solo podrás extraerlos una vez.\n\n` +
      `¿Continuar?`
    )
    if (!ok) return
    setExporting(true)
    try {
      await exportUrl(true)
      // Refrescar tras exportar para reflejar el estado actual del dataset
      await fetchUsers()
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            Panel de Administración
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {usersConConsentimiento.length} usuarios · {totalConsented} tickets con consentimiento
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || totalConsented === 0}
          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
          style={{ background: 'var(--color-brand)', color: '#fff' }}
        >
          {exporting ? 'Exportando…' : `Exportar dataset (${totalConsented})`}
        </button>
      </div>

      {/* Estados de carga / error */}
      {loading && (
        <div className="flex justify-center py-8">
          <div className="w-7 h-7 rounded-full border-2 animate-spin"
            style={{ borderColor: 'var(--color-brand)', borderTopColor: 'transparent' }} />
        </div>
      )}
      {error && (
        <p className="text-sm text-center py-4" style={{ color: '#ef4444' }}>{error}</p>
      )}

      {/* Lista de usuarios */}
      {!loading && !error && (
        <div className="space-y-2">
          {usersConConsentimiento.map(u => (
            <UserRow key={u.id} user={u} fetchTickets={fetchTickets} />
          ))}
          {usersConConsentimiento.length === 0 && (
            <div
              className="rounded-xl p-6 text-center space-y-2"
              style={{ background: 'var(--surface)', border: '1px dashed var(--border)' }}
            >
              <div className="text-2xl">📭</div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                No hay tickets pendientes de exportar
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                A la espera de que los usuarios suban tickets de prueba y den su consentimiento.
                Los tickets ya exportados no vuelven a aparecer aquí.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
