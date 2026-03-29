import type { TotalCategoria } from '@/hooks/useTickets'
import { getCategoryColor } from '@/lib/categoryColors'
import { useTheme } from '@/hooks/useTheme'

interface Props {
  totalesPorCategoria: Record<string, TotalCategoria>
  totalMes: number
  onSelectCategoria: (catId: string) => void
}

/** Lista de categorías con porcentaje e importe. Al pulsar abre el drill-down. */
export function CategoriaList({ totalesPorCategoria, totalMes, onSelectCategoria }: Props) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const items = Object.entries(totalesPorCategoria).sort(([, a], [, b]) => b.total - a.total)

  return (
    <ul className="flex flex-col gap-1 px-4">
      {items.map(([catId, cat]) => {
        const pct   = totalMes > 0 ? (cat.total / totalMes) * 100 : 0
        const color = getCategoryColor(cat.nombre, isDark)

        return (
          <li key={catId}>
            <button
              onClick={() => onSelectCategoria(catId)}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left"
              style={{ backgroundColor: 'var(--surface)' }}
            >
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
              <span className="flex-1 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {cat.nombre}
              </span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {pct.toFixed(0)}%
              </span>
              <span className="text-sm font-semibold w-20 text-right" style={{ color: 'var(--text-primary)' }}>
                {cat.total.toFixed(2)} €
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
