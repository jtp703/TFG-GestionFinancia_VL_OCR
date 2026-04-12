import { useState } from 'react'
import { useTickets } from '@/hooks/useTickets'
import { usePerfil } from '@/hooks/usePerfil'
import { EmptyState } from '@/components/EmptyState'
import { DonutChart } from '@/components/DonutChart'
import { CategoriaList } from '@/components/CategoriaList'
import { DrillDown } from '@/components/DrillDown'

/** Barra de progreso del presupuesto mensual estimado vs. gasto real. */
function PresupuestoBar({ totalMes, estimado }: { totalMes: number; estimado: number }) {
  const pct     = Math.min((totalMes / estimado) * 100, 100)
  const excedido = totalMes > estimado

  const color = pct < 75
    ? '#22c55e'   // verde
    : pct < 100
      ? '#f97316' // naranja
      : '#ef4444' // rojo

  return (
    <div className="mx-4 mb-4 rounded-2xl px-4 py-3 space-y-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
        <span>Presupuesto mensual</span>
        <span style={{ color, fontWeight: 600 }}>
          {excedido
            ? `+${(totalMes - estimado).toFixed(2)} € excedido`
            : `${(estimado - totalMes).toFixed(2)} € restantes`}
        </span>
      </div>

      {/* Barra */}
      <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>

      <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
        <span>{totalMes.toFixed(2)} € gastados</span>
        <span>{estimado.toFixed(2)} € estimados</span>
      </div>
    </div>
  )
}

/** Vista principal de Gastos del mes en curso */
export function Home() {
  const { tickets, totalesPorCategoria, totalMes, loading, error } = useTickets()
  const { perfil } = usePerfil()
  const [catSeleccionada, setCatSeleccionada] = useState<string | null>(null)

  const categoriaActiva = catSeleccionada ? totalesPorCategoria[catSeleccionada] ?? null : null
  const sinTickets = !loading && !error && tickets.length === 0
  const gastoEstimado = perfil?.gasto_mensual_estimado ?? 0

  return (
    <div className="flex flex-col pb-4">
      {/* Cabecera */}
      <div className="px-4 pt-2 pb-4">
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
          Gastos de {new Date().toLocaleString('es-ES', { month: 'long', year: 'numeric' })}
        </h1>
      </div>

      {/* Barra de presupuesto — solo si el usuario definió un gasto estimado */}
      {!loading && gastoEstimado > 0 && (
        <PresupuestoBar totalMes={totalMes} estimado={gastoEstimado} />
      )}

      {/* Datos del perfil financiero — ahorro deseado y gastos fijos */}
      {!loading && (perfil?.ahorro_deseado || perfil?.gastos_fijos) && (
        <div className="mx-4 mb-4 rounded-2xl px-4 py-3 space-y-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {perfil?.ahorro_deseado && perfil.ahorro_deseado > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span style={{ color: 'var(--text-muted)' }}>Ahorro objetivo</span>
              <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                {perfil.ahorro_deseado.toFixed(2)} €/mes
              </span>
            </div>
          )}
          {perfil?.gastos_fijos && (
            <div className="text-xs space-y-0.5">
              <p style={{ color: 'var(--text-muted)' }}>Gastos fijos</p>
              <p style={{ color: 'var(--text-primary)' }}>{perfil.gastos_fijos}</p>
            </div>
          )}
        </div>
      )}

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
          <DonutChart totalesPorCategoria={totalesPorCategoria} totalMes={totalMes} onSelectCategoria={setCatSeleccionada} />
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
