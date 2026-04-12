import { useState, useMemo } from 'react'
import { useTickets } from '@/hooks/useTickets'
import { usePerfil } from '@/hooks/usePerfil'
import { useGastosFijos } from '@/hooks/useGastosFijos'
import { EmptyState } from '@/components/EmptyState'
import { DonutChart } from '@/components/DonutChart'
import { CategoriaList } from '@/components/CategoriaList'
import { DrillDown } from '@/components/DrillDown'
import { GastosFijosModal } from '@/components/GastosFijosModal'
import type { TotalCategoria } from '@/hooks/useTickets'

/** Vista principal de Gastos del mes en curso */
export function Home() {
  const { tickets, totalesPorCategoria, totalMes, loading, error } = useTickets()
  const { perfil }                                                  = usePerfil()
  const { gastosFijos, categorias, crear, actualizar, eliminar }   = useGastosFijos()
  const [catSeleccionada, setCatSeleccionada]                      = useState<string | null>(null)
  const [modalGastos, setModalGastos]                              = useState(false)

  // Combinar totales de tickets + gastos fijos por categoría
  const totalesCombinados = useMemo<Record<string, TotalCategoria>>(() => {
    const combinados: Record<string, TotalCategoria> = { ...totalesPorCategoria }
    for (const gf of gastosFijos) {
      const catId     = gf.categoria_id ?? 'sin-categoria'
      const catNombre = gf.categoria?.nombre ?? 'Sin categoría'
      if (!combinados[catId]) combinados[catId] = { nombre: catNombre, total: 0 }
      combinados[catId] = { ...combinados[catId], total: combinados[catId].total + gf.precio }
    }
    return combinados
  }, [totalesPorCategoria, gastosFijos])

  const totalCombinado = useMemo(
    () => totalMes + gastosFijos.reduce((s, g) => s + g.precio, 0),
    [totalMes, gastosFijos]
  )

  // Qué categorías tienen gastos fijos (para mostrar el candado)
  const catConGastosFijos = useMemo(() => {
    const set = new Set<string>()
    for (const gf of gastosFijos) set.add(gf.categoria_id ?? 'sin-categoria')
    return set
  }, [gastosFijos])

  const categoriaActiva = catSeleccionada ? totalesCombinados[catSeleccionada] ?? null : null
  const hayDatos        = !loading && !error && (tickets.length > 0 || gastosFijos.length > 0)
  const sinDatos        = !loading && !error && tickets.length === 0 && gastosFijos.length === 0

  // Indicador de presupuesto (mini barra inline, sin card)
  const gastoEstimado = perfil?.gasto_mensual_estimado ?? 0
  const pctPresupuesto = gastoEstimado > 0 ? Math.min((totalCombinado / gastoEstimado) * 100, 100) : 0
  const colorPresupuesto = pctPresupuesto < 75 ? '#22c55e' : pctPresupuesto < 100 ? '#f97316' : '#ef4444'

  return (
    <div className="flex flex-col pb-4">
      {/* Cabecera */}
      <div className="px-4 pt-2 pb-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            Gastos de {new Date().toLocaleString('es-ES', { month: 'long', year: 'numeric' })}
          </h1>
          {/* Mini indicador de presupuesto — solo si hay estimado */}
          {gastoEstimado > 0 && !loading && (
            <div className="flex items-center gap-2 mt-1">
              <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                <div style={{ width: `${pctPresupuesto}%`, background: colorPresupuesto, height: '100%' }} />
              </div>
              <span className="text-xs" style={{ color: colorPresupuesto }}>
                {totalCombinado.toFixed(0)} / {gastoEstimado.toFixed(0)} €
              </span>
            </div>
          )}
        </div>
        {/* Botón gastos fijos */}
        <button
          onClick={() => setModalGastos(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
        >
          🔒 <span>Fijos</span>
        </button>
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

      {/* Sin datos */}
      {sinDatos && <EmptyState />}

      {/* Con datos */}
      {hayDatos && (
        <>
          <DonutChart
            totalesPorCategoria={totalesCombinados}
            totalMes={totalCombinado}
            onSelectCategoria={setCatSeleccionada}
          />
          <div className="mt-4">
            <CategoriaList
              totalesPorCategoria={totalesCombinados}
              totalMes={totalCombinado}
              catConGastosFijos={catConGastosFijos}
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
        gastosFijos={gastosFijos}
        onClose={() => setCatSeleccionada(null)}
      />

      {/* Modal gastos fijos */}
      <GastosFijosModal
        open={modalGastos}
        onClose={() => setModalGastos(false)}
        gastosFijos={gastosFijos}
        categorias={categorias}
        onCrear={crear}
        onActualizar={actualizar}
        onEliminar={eliminar}
      />
    </div>
  )
}
