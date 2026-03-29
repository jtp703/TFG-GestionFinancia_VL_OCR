import type { Ticket, TotalCategoria } from '@/hooks/useTickets'

interface Props {
  catId: string | null
  categoria: TotalCategoria | null
  tickets: Ticket[]
  onClose: () => void
}

/** Panel de detalle por categoría. Móvil: pantalla completa. Desktop: slide desde la derecha 200ms, 360px ancho. */
export function DrillDown({ catId, categoria, tickets, onClose }: Props) {
  const visible = catId !== null

  const ticketsFiltrados = tickets.filter(t =>
    catId === 'sin-categoria'
      ? t.categoria === null
      : t.categoria?.id === catId
  )

  return (
    <>
      {/* Overlay oscuro — solo móvil */}
      <div
        className="md:hidden fixed inset-0 z-40 transition-opacity duration-200"
        style={{
          backgroundColor: 'rgba(0,0,0,0.3)',
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? 'auto' : 'none',
        }}
        onClick={onClose}
      />

      {/* Panel deslizante */}
      <div
        className="fixed top-0 right-0 bottom-0 z-50 flex flex-col w-full md:w-[360px]"
        style={{
          backgroundColor: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          transform: visible ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 200ms ease-out',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <button
            onClick={onClose}
            className="flex items-center gap-1 text-sm"
            style={{ color: 'var(--color-brand)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Volver
          </button>
          <span className="font-semibold text-base flex-1" style={{ color: 'var(--text-primary)' }}>
            {categoria?.nombre ?? ''}
          </span>
          <span className="text-sm font-semibold" style={{ color: 'var(--color-brand)' }}>
            {categoria?.total.toFixed(2)} €
          </span>
        </div>

        {/* Lista de tickets */}
        <ul className="flex-1 overflow-y-auto">
          {ticketsFiltrados.length === 0 && (
            <li className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              Sin tickets en esta categoría
            </li>
          )}
          {ticketsFiltrados.map(t => (
            <li
              key={t.id}
              className="flex items-center gap-3 px-4 py-3"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                  {t.comercio ?? 'Sin comercio'}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {t.fecha ?? '—'}
                </p>
              </div>
              <span className="text-sm font-semibold flex-shrink-0" style={{ color: 'var(--text-primary)' }}>
                {t.total.toFixed(2)} €
              </span>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}
