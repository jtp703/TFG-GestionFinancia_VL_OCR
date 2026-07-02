import type { TotalCategoria } from '@/hooks/useTickets'
import { getCategoryColor, getCategoryEmoji } from '@/lib/categoryColors'
import { useTheme } from '@/hooks/useTheme'

interface Props {
  totalesPorCategoria: Record<string, TotalCategoria>
  totalMes:            number
  catConGastosFijos:   Set<string>
  onSelectCategoria:   (catId: string) => void
}

/** Lista de categorías con emoji, porcentaje, importe y candado si tiene gastos fijos. */
export function CategoriaList({ totalesPorCategoria, totalMes, catConGastosFijos, onSelectCategoria }: Props) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const items = Object.entries(totalesPorCategoria).sort(([, a], [, b]) => b.total - a.total)

  return (
    <ul className="flex flex-col gap-1 px-4">
      {items.map(([catId, cat]) => {
        const pct   = totalMes > 0 ? (cat.total / totalMes) * 100 : 0
        const color = getCategoryColor(cat.nombre, isDark)
        const emoji = getCategoryEmoji(cat.nombre)
        const tieneGastosFijos = catConGastosFijos.has(catId)

        return (
          <li key={catId}>
            <button
              onClick={() => onSelectCategoria(catId)}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left"
              style={{ backgroundColor: 'var(--surface)' }}
            >
              {/* Burbuja emoji con color de fondo */}
              <span
                className="w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0"
                style={{ backgroundColor: color + '33' }}
              >
                {emoji}
              </span>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {cat.nombre}
                  </span>
                  {tieneGastosFijos && (
                    <span className="text-xs flex-shrink-0" title="Incluye gastos fijos">🔒</span>
                  )}
                </div>
                {/* Mini barra de progreso */}
                <div className="mt-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                  <div style={{ width: `${pct}%`, background: color, height: '100%', borderRadius: '9999px' }} />
                </div>
              </div>

              <div className="text-right flex-shrink-0 ml-2">
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {cat.total.toFixed(2)} €
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {pct.toFixed(0)}%
                </p>
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
