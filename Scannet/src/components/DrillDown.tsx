import { useState } from 'react'
import type { Ticket, TotalCategoria } from '@/hooks/useTickets'

interface Props {
  catId:     string | null
  categoria: TotalCategoria | null
  tickets:   Ticket[]
  onClose:   () => void
}

/** Panel de detalle por categoría con tickets expandibles y productos ordenables. */
export function DrillDown({ catId, categoria, tickets, onClose }: Props) {
  const visible = catId !== null
  const [expandedId, setExpandedId]   = useState<string | null>(null)
  const [sortDir, setSortDir]         = useState<'desc' | 'asc'>('desc')

  const ticketsFiltrados = tickets.filter(t =>
    catId === 'sin-categoria'
      ? t.categoria === null
      : t.categoria?.id === catId
  )

  function toggleTicket(id: string) {
    setExpandedId(prev => prev === id ? null : id)
  }

  function sortedProductos(t: Ticket) {
    return [...t.productos].sort((a, b) =>
      sortDir === 'desc'
        ? b.precio_total - a.precio_total
        : a.precio_total - b.precio_total
    )
  }

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

          {ticketsFiltrados.map(t => {
            const isOpen = expandedId === t.id
            const productos = sortedProductos(t)

            return (
              <li key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                {/* Cabecera del ticket — pulsar para expandir */}
                <button
                  onClick={() => toggleTicket(t.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
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
                  {/* Chevron */}
                  <svg
                    width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    style={{
                      color: 'var(--text-muted)',
                      flexShrink: 0,
                      transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 150ms',
                    }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {/* Productos expandidos */}
                {isOpen && (
                  <div style={{ background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
                    {/* Botón ordenar */}
                    <div className="flex justify-end px-4 py-2">
                      <button
                        onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
                        className="flex items-center gap-1 text-xs"
                        style={{ color: 'var(--color-brand)' }}
                      >
                        Precio
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          {sortDir === 'desc'
                            ? <polyline points="6 9 12 15 18 9" />
                            : <polyline points="18 15 12 9 6 15" />
                          }
                        </svg>
                      </button>
                    </div>

                    {productos.length === 0 ? (
                      <p className="px-4 pb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                        Sin productos registrados
                      </p>
                    ) : (
                      <ul className="pb-2">
                        {productos.map(p => (
                          <li
                            key={p.id}
                            className="flex items-center gap-2 px-4 py-1.5"
                          >
                            <span className="flex-1 text-xs truncate" style={{ color: 'var(--text-primary)' }}>
                              {p.descripcion}
                            </span>
                            <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                              {p.cantidad}×
                            </span>
                            <span className="text-xs font-medium flex-shrink-0 w-16 text-right" style={{ color: 'var(--text-primary)' }}>
                              {p.precio_total.toFixed(2)} €
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </>
  )
}
