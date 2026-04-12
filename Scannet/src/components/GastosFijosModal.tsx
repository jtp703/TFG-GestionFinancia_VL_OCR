import { useState } from 'react'
import type { GastoFijo, Categoria } from '@/hooks/useGastosFijos'
import { EMOJIS_GASTO } from '@/lib/categoryColors'

interface Props {
  open:        boolean
  onClose:     () => void
  gastosFijos: GastoFijo[]
  categorias:  Categoria[]
  onCrear:     (data: { nombre: string; precio: number; emoji: string | null; categoria_id: string | null }) => Promise<boolean>
  onActualizar:(id: string, data: { nombre?: string; precio?: number; emoji?: string | null; categoria_id?: string | null }) => Promise<boolean>
  onEliminar:  (id: string) => Promise<boolean>
}

const FORM_VACIO = { nombre: '', precio: '', emoji: '' as string | null, categoria_id: '' as string | null }

/** Modal de gestión de gastos fijos: listar, añadir, editar y eliminar. */
export function GastosFijosModal({ open, onClose, gastosFijos, categorias, onCrear, onActualizar, onEliminar }: Props) {
  const [editandoId, setEditandoId] = useState<string | 'nuevo' | null>(null)
  const [form, setForm]             = useState(FORM_VACIO)
  const [guardando, setGuardando]   = useState(false)

  function abrirNuevo() {
    setForm(FORM_VACIO)
    setEditandoId('nuevo')
  }

  function abrirEditar(g: GastoFijo) {
    setForm({ nombre: g.nombre, precio: String(g.precio), emoji: g.emoji, categoria_id: g.categoria_id })
    setEditandoId(g.id)
  }

  function cerrarForm() {
    setEditandoId(null)
    setForm(FORM_VACIO)
  }

  async function handleGuardar() {
    if (!form.nombre.trim() || !form.precio) return
    setGuardando(true)
    const payload = {
      nombre:       form.nombre.trim(),
      precio:       Number(form.precio),
      emoji:        form.emoji || null,
      categoria_id: form.categoria_id || null,
    }
    const ok = editandoId === 'nuevo'
      ? await onCrear(payload)
      : await onActualizar(editandoId!, payload)
    setGuardando(false)
    if (ok) cerrarForm()
  }

  async function handleEliminar(id: string) {
    setGuardando(true)
    await onEliminar(id)
    setGuardando(false)
    if (editandoId === id) cerrarForm()
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '8px 12px',
    fontSize: '0.875rem',
    width: '100%',
    outline: 'none',
  }

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 transition-opacity duration-200"
        style={{ backgroundColor: 'rgba(0,0,0,0.4)', opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed top-0 right-0 bottom-0 z-50 flex flex-col w-full md:w-[400px]"
        style={{
          backgroundColor: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 200ms ease-out',
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <button onClick={onClose} className="flex items-center gap-1 text-sm" style={{ color: 'var(--color-brand)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Volver
          </button>
          <span className="font-semibold text-base flex-1" style={{ color: 'var(--text-primary)' }}>
            🔒 Gastos fijos
          </span>
          {editandoId === null && (
            <button
              onClick={abrirNuevo}
              className="text-sm font-medium px-3 py-1 rounded-lg"
              style={{ background: 'var(--color-brand)', color: '#fff' }}
            >
              + Añadir
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Formulario (nuevo o editar) */}
          {editandoId !== null && (
            <div className="p-4 space-y-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {editandoId === 'nuevo' ? 'Nuevo gasto fijo' : 'Editar gasto fijo'}
              </p>

              {/* Selector de emoji */}
              <div>
                <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Emoji</p>
                <div className="flex flex-wrap gap-1">
                  {EMOJIS_GASTO.map(e => (
                    <button
                      key={e}
                      onClick={() => setForm(f => ({ ...f, emoji: f.emoji === e ? null : e }))}
                      className="w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-colors"
                      style={{
                        background: form.emoji === e ? 'var(--color-brand)' : 'var(--bg)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>

              {/* Nombre */}
              <div>
                <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Nombre</p>
                <input
                  style={inputStyle}
                  placeholder="Ej: Alquiler"
                  value={form.nombre}
                  onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                />
              </div>

              {/* Precio */}
              <div>
                <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Importe mensual (€)</p>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  style={inputStyle}
                  placeholder="0.00"
                  value={form.precio}
                  onChange={e => setForm(f => ({ ...f, precio: e.target.value }))}
                />
              </div>

              {/* Categoría */}
              <div>
                <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Categoría</p>
                <select
                  style={inputStyle}
                  value={form.categoria_id ?? ''}
                  onChange={e => setForm(f => ({ ...f, categoria_id: e.target.value || null }))}
                >
                  <option value="">Sin categoría</option>
                  {categorias.map(c => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </div>

              {/* Acciones del form */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={cerrarForm}
                  className="flex-1 py-2 rounded-xl text-sm"
                  style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleGuardar}
                  disabled={guardando || !form.nombre.trim() || !form.precio}
                  className="flex-1 py-2 rounded-xl text-sm font-medium"
                  style={{ background: 'var(--color-brand)', color: '#fff', opacity: guardando ? 0.6 : 1 }}
                >
                  {guardando ? '...' : 'Guardar'}
                </button>
              </div>
            </div>
          )}

          {/* Lista de gastos fijos */}
          {gastosFijos.length === 0 && editandoId === null && (
            <p className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              Sin gastos fijos. Pulsa "+ Añadir" para crear uno.
            </p>
          )}

          <ul>
            {gastosFijos.map(g => (
              <li
                key={g.id}
                className="flex items-center gap-3 px-4 py-3"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <span className="text-xl w-8 text-center flex-shrink-0">{g.emoji ?? '📦'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {g.nombre}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {g.categoria?.nombre ?? 'Sin categoría'}
                  </p>
                </div>
                <span className="text-sm font-semibold flex-shrink-0" style={{ color: 'var(--text-primary)' }}>
                  {g.precio.toFixed(2)} €/mes
                </span>
                {/* Editar */}
                <button
                  onClick={() => abrirEditar(g)}
                  className="flex-shrink-0 p-1.5 rounded-lg transition-opacity hover:opacity-60"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                {/* Eliminar */}
                <button
                  onClick={() => handleEliminar(g.id)}
                  className="flex-shrink-0 p-1.5 rounded-lg transition-opacity hover:opacity-60"
                  style={{ color: '#ef4444' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  )
}
