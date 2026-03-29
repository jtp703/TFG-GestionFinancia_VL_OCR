import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import type { TotalCategoria } from '@/hooks/useTickets'
import { getCategoryColor } from '@/lib/categoryColors'
import { useTheme } from '@/hooks/useTheme'

interface Props {
  totalesPorCategoria: Record<string, TotalCategoria>
  totalMes: number
}

/** Gráfico de dona con el total del mes en el centro. Colores pastel en claro, eléctricos en oscuro. */
export function DonutChart({ totalesPorCategoria, totalMes }: Props) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const data = Object.entries(totalesPorCategoria).map(([, cat]) => ({
    name:  cat.nombre,
    value: cat.total,
    color: getCategoryColor(cat.nombre, isDark),
  }))

  return (
    <div className="relative w-full" style={{ height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={70}
            outerRadius={100}
            paddingAngle={2}
            dataKey="value"
            strokeWidth={0}
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>

      {/* Total en el centro */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
          Total mes
        </span>
        <span className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
          {totalMes.toFixed(2)} €
        </span>
      </div>
    </div>
  )
}
