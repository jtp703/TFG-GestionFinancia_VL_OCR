import { useState, useEffect, useRef } from 'react'
import type { ResultadoOCR, ProductoOCR, MetodoPago } from '../hooks/useScan'
import { notify } from '../lib/toast'

interface Props {
  inicial:     ResultadoOCR
  duplicado:   boolean
  onConfirmar: (datos: ResultadoOCR) => Promise<void>
  onCancelar:  () => void
}

/** Tabla de verificación editable post-OCR */
export default function VerifyForm({ inicial, duplicado, onConfirmar, onCancelar }: Props) {
  const [guardando, setGuardando]         = useState(false)
  const [confirmando, setConfirmando]     = useState(false)
  const [intentoGuardar, setIntentoGuardar] = useState(false)
  const [comercio, setComercio]           = useState(inicial.comercio)
  const topRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  function toInputDate(f: string): string {
    const dateOnly = f.split('T')[0].split(' ')[0].trim()
    const parts = dateOnly.split('/')
    if (parts.length === 3 && parts[0].length === 2) return `${parts[2]}-${parts[1]}-${parts[0]}`
    return dateOnly
  }

  const [fecha, setFecha]   = useState(toInputDate(inicial.fecha))
  const [metodo, setMetodo] = useState<MetodoPago>(inicial.metodo_pago)
  const [items, setItems]   = useState<ProductoOCR[]>(inicial.items)

  const total = items.reduce((s, i) => s + i.cantidad * i.precio, 0)

  /** Valida todos los campos y devuelve el primer error, o null si todo está bien */
  function validar(): string | null {
    if (!comercio.trim())                               return 'El nombre del comercio es obligatorio'
    if (!fecha)                                          return 'La fecha es obligatoria'
    if (total <= 0)                                      return 'El total no puede ser 0 €'
    if (items.some(i => !i.descripcion.trim()))          return 'Todos los productos deben tener descripción'
    if (items.some(i => i.cantidad <= 0))                return 'La cantidad de cada producto debe ser mayor que 0'
    return null
  }

  function updateItem(index: number, field: keyof ProductoOCR, value: string) {
    setItems(prev => prev.map((item, i) =>
      i === index
        ? { ...item, [field]: field === 'descripcion' ? value : Number(value) }
        : item
    ))
  }

  function addItem() {
    setItems(prev => [...prev, { descripcion: '', cantidad: 1, precio: 0 }])
  }

  function removeItem(index: number) {
    setItems(prev => prev.filter((_, i) => i !== index))
  }

  async function handleGuardarConfirmado() {
    setConfirmando(false)
    setGuardando(true)
    try {
      await onConfirmar({ ...inicial, comercio, fecha, total, metodo_pago: metodo, items })
    } finally {
      setGuardando(false)
    }
  }

  function inputStyle(invalid = false): React.CSSProperties {
    return {
      background:   'var(--surface)',
      color:        'var(--text-primary)',
      border:       `1px solid ${invalid ? '#ef4444' : 'var(--border)'}`,
      borderRadius: '6px',
      padding:      '4px 8px',
      fontSize:     '0.875rem',
      width:        '100%',
    }
  }

  return (
    <div ref={topRef} style={{ color: 'var(--text-primary)' }} className="space-y-5 relative">
      {/* Dialog de confirmación — overlay sobre el form */}
      {confirmando && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}>
          <div className="rounded-2xl p-6 mx-4 w-full max-w-xs space-y-4 shadow-xl"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-base font-semibold text-center" style={{ color: 'var(--text-primary)' }}>
              ¿Todo es correcto?
            </p>
            <div className="text-sm space-y-1" style={{ color: 'var(--text-muted)' }}>
              <p><span className="font-medium" style={{ color: 'var(--text-primary)' }}>{comercio}</span></p>
              <p>{fecha} · {metodo}</p>
              <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{total.toFixed(2)} €</p>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setConfirmando(false)}
                className="flex-1 py-2 rounded-xl text-sm transition-opacity hover:opacity-70"
                style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                Revisar
              </button>
              <button
                onClick={handleGuardarConfirmado}
                className="flex-1 py-2 rounded-xl text-sm font-medium"
                style={{ background: 'var(--color-brand)', color: '#fff' }}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {duplicado && (
        <div className="rounded-lg px-4 py-3 text-sm font-medium"
          style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fbbf24' }}>
          ⚠️ Ya tienes un ticket con el mismo comercio, fecha e importe.
        </div>
      )}

      {/* Campos cabecera */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs mb-1" style={{ color: intentoGuardar && !comercio.trim() ? '#ef4444' : 'var(--text-muted)' }}>
            Comercio {intentoGuardar && !comercio.trim() && '— obligatorio'}
          </label>
          <input style={inputStyle(intentoGuardar && !comercio.trim())} value={comercio} onChange={e => setComercio(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: intentoGuardar && !fecha ? '#ef4444' : 'var(--text-muted)' }}>
            Fecha {intentoGuardar && !fecha && '— obligatoria'}
          </label>
          <input type="date" style={inputStyle(intentoGuardar && !fecha)} value={fecha} onChange={e => setFecha(e.target.value)} />
        </div>
      </div>

      {/* Toggle método de pago */}
      <div>
        <label className="block text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Método de pago</label>
        <div className="inline-flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {(['efectivo', 'tarjeta'] as MetodoPago[]).map(m => (
            <button
              key={m}
              onClick={() => setMetodo(m)}
              className="px-4 py-1.5 text-sm capitalize transition-colors"
              style={{
                background: metodo === m ? 'var(--color-brand)' : 'var(--surface)',
                color: metodo === m ? '#fff' : 'var(--text-primary)',
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla de productos */}
      <div>
        <label className="block text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Productos</label>
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <div className="grid text-xs px-3 py-2"
            style={{ gridTemplateColumns: '1fr 60px 70px 24px', gap: '8px', background: 'var(--bg)', color: 'var(--text-muted)' }}>
            <span>Descripción</span><span className="text-center">Cant.</span><span className="text-right">Precio</span><span />
          </div>
          {items.map((item, i) => (
            <div key={i} className="grid items-center px-3 py-1.5"
              style={{ gridTemplateColumns: '1fr 60px 70px 24px', gap: '8px', borderTop: '1px solid var(--border)' }}>
              <input style={inputStyle(intentoGuardar && !item.descripcion.trim())} value={item.descripcion}
                onChange={e => updateItem(i, 'descripcion', e.target.value)} />
              <input style={{ ...inputStyle(intentoGuardar && item.cantidad <= 0), textAlign: 'center' }} type="number" min="1" value={item.cantidad}
                onChange={e => updateItem(i, 'cantidad', e.target.value)} />
              <input style={{ ...inputStyle(), textAlign: 'right' }} type="number" step="0.01" min="0" value={item.precio}
                onChange={e => updateItem(i, 'precio', e.target.value)} />
              <button onClick={() => removeItem(i)}
                className="text-center leading-none transition-opacity hover:opacity-60"
                style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>×</button>
            </div>
          ))}
        </div>
        <button onClick={addItem}
          className="mt-2 text-sm transition-opacity hover:opacity-70"
          style={{ color: 'var(--color-brand)' }}>
          + Añadir producto
        </button>
      </div>

      {/* Total calculado */}
      <div className="flex justify-between text-sm font-medium pt-2"
        style={{ borderTop: '1px solid var(--border)' }}>
        <span style={{ color: 'var(--text-muted)' }}>Total calculado</span>
        <span>{total.toFixed(2)} €</span>
      </div>

      {/* Acciones */}
      <div className="flex gap-3 pt-1">
        <button onClick={onCancelar}
          className="flex-1 py-2.5 rounded-xl text-sm transition-opacity hover:opacity-70"
          style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          Cancelar
        </button>
        <button
          onClick={() => {
            setIntentoGuardar(true)
            const error = validar()
            if (error) { notify.err(error); return }
            setConfirmando(true)
          }}
          disabled={guardando}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: 'var(--color-brand)', color: '#fff' }}>
          {guardando ? 'Guardando…' : 'Confirmar y guardar'}
        </button>
      </div>
    </div>
  )
}
