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
  const { tickets, totalesPorCategoria, totalMes, loading, error }          = useTickets()
  const { perfil }                                                            = usePerfil()
  const { gastosFijos, categorias, crear, actualizar, eliminar, loading: loadingGastos } = useGastosFijos()
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
  const cargando        = loading || loadingGastos
  const hayDatos        = !cargando && !error && (tickets.length > 0 || gastosFijos.length > 0)
  const sinDatos        = !cargando && !error && tickets.length === 0 && gastosFijos.length === 0

  // Indicador de presupuesto con zona de ahorro
  const gastoEstimado  = perfil?.gasto_mensual_estimado ?? 0
  const ahorroDeseado  = perfil?.ahorro_deseado ?? 0
  // Límite real de gasto = presupuesto - ahorro deseado (o el presupuesto completo si no hay ahorro)
  const limiteGasto    = gastoEstimado > 0 && ahorroDeseado > 0
    ? Math.max(gastoEstimado - ahorroDeseado, 0)
    : gastoEstimado
  const pctLimite      = gastoEstimado > 0 ? (limiteGasto / gastoEstimado) * 100 : 100
  const pctGasto       = gastoEstimado > 0 ? Math.min((totalCombinado / gastoEstimado) * 100, 100) : 0
  const superaLimite   = limiteGasto > 0 && totalCombinado > limiteGasto
  const colorGasto     = superaLimite ? '#ef4444' : '#22c55e'

  return (
    <div className="flex flex-col pb-4">
      {/* Cabecera */}
      <div className="px-4 pt-2 pb-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            Gastos de {new Date().toLocaleString('es-ES', { month: 'long', year: 'numeric' })}
          </h1>
          {/* Barra de presupuesto con zona de ahorro */}
          {gastoEstimado > 0 && !cargando && (
            <div className="flex items-center gap-2 mt-1.5">
              {/* Barra */}
              <div className="relative w-28 h-2 rounded-full" style={{ background: 'var(--border)' }}>
                {/* Zona roja de fondo (reservada para ahorro) */}
                {ahorroDeseado > 0 && pctLimite < 100 && (
                  <div style={{
                    position: 'absolute', top: 0, bottom: 0,
                    left: `${pctLimite}%`, right: 0,
                    background: '#ef444430',
                    borderRadius: '0 9999px 9999px 0',
                  }} />
                )}
                {/* Progreso de gasto */}
                <div style={{
                  position: 'absolute', top: 0, bottom: 0, left: 0,
                  width: `${pctGasto}%`,
                  background: colorGasto,
                  borderRadius: '9999px',
                  transition: 'width 0.5s',
                }} />
                {/* Marcador naranja en el límite de ahorro */}
                {ahorroDeseado > 0 && pctLimite < 100 && (
                  <div style={{
                    position: 'absolute', top: '-3px', bottom: '-3px',
                    left: `${pctLimite}%`,
                    width: '2px',
                    background: '#f97316',
                    transform: 'translateX(-50%)',
                    borderRadius: '1px',
                  }} />
                )}
              </div>
              {/* Texto */}
              <span className="text-xs" style={{ color: colorGasto }}>
                {totalCombinado.toFixed(0)}€
                {' / '}
                <span style={{ color: 'var(--text-muted)' }}>
                  {gastoEstimado.toFixed(0)}€
                </span>
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
      {cargando && (
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
