import { useState } from 'react'
import { useTickets } from '@/hooks/useTickets'
import { EmptyState } from '@/components/EmptyState'
import { DonutChart } from '@/components/DonutChart'
import { CategoriaList } from '@/components/CategoriaList'
import { DrillDown } from '@/components/DrillDown'

/** Vista principal de Gastos del mes en curso */
export function Home() {
  const { tickets, totalesPorCategoria, totalMes, loading, error } = useTickets()
  const [catSeleccionada, setCatSeleccionada] = useState<string | null>(null)

  const categoriaActiva = catSeleccionada ? totalesPorCategoria[catSeleccionada] ?? null : null
  const sinTickets = !loading && !error && tickets.length === 0

  return (
    <div className="flex flex-col pb-4">
      {/* Cabecera */}
      <div className="px-4 pt-2 pb-4">
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
          Gastos de {new Date().toLocaleString('es-ES', { month: 'long', year: 'numeric' })}
        </h1>
      </div>

      {/* Estado de carga */}
      {loading && (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--color-brand)' }} />
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-center py-8 text-sm" style={{ color: '#DC2626' }}>{error}</p>
      )}

      {/* Sin tickets */}
      {sinTickets && <EmptyState />}

      {/* Con datos */}
      {!loading && !error && tickets.length > 0 && (
        <>
          <DonutChart totalesPorCategoria={totalesPorCategoria} totalMes={totalMes} />
          <div className="mt-4">
            <CategoriaList
              totalesPorCategoria={totalesPorCategoria}
              totalMes={totalMes}
              onSelectCategoria={setCatSeleccionada}
            />
          </div>
        </>
      )}

      {/* Panel drill-down */}
      <DrillDown
        catId={catSeleccionada}
        categoria={categoriaActiva}
        tickets={tickets}
        onClose={() => setCatSeleccionada(null)}
      />
    </div>
  )
}
