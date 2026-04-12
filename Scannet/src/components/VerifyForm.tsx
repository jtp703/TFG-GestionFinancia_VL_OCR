import { useState } from 'react'
import type { ResultadoOCR, ProductoOCR, MetodoPago } from '../hooks/useScan'

interface Props {
  inicial:     ResultadoOCR
  duplicado:   boolean
  onConfirmar: (datos: ResultadoOCR) => void
  onCancelar:  () => void
}

/** Tabla de verificación editable post-OCR */
export default function VerifyForm({ inicial, duplicado, onConfirmar, onCancelar }: Props) {
  const [comercio, setComercio]   = useState(inicial.comercio)
  // Normaliza fecha a YYYY-MM-DD para el input type="date"
  // Acepta: DD/MM/YYYY, DD/MM/YYYY HH:mm:ss, YYYY-MM-DD, YYYY-MM-DDTHH:mm:ss
  function toInputDate(f: string): string {
    const dateOnly = f.split('T')[0].split(' ')[0].trim()
    const parts = dateOnly.split('/')
    if (parts.length === 3 && parts[0].length === 2) return `${parts[2]}-${parts[1]}-${parts[0]}`
    return dateOnly
  }
  const [fecha, setFecha] = useState(toInputDate(inicial.fecha))
  const [metodo, setMetodo]       = useState<MetodoPago>(inicial.metodo_pago)
  const [items, setItems]         = useState<ProductoOCR[]>(inicial.items)

  const total = items.reduce((s, i) => s + i.cantidad * i.precio, 0)

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

  function handleConfirmar() {
    onConfirmar({ ...inicial, comercio, fecha, total, metodo_pago: metodo, items })
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--surface)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    padding: '4px 8px',
    fontSize: '0.875rem',
    width: '100%',
  }

  return (
    <div style={{ color: 'var(--text-primary)' }} className="space-y-5">
      {duplicado && (
        <div className="rounded-lg px-4 py-3 text-sm font-medium"
          style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fbbf24' }}>
          ⚠️ Ya tienes un ticket con el mismo comercio, fecha e importe.
        </div>
      )}

      {/* Campos cabecera */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Comercio</label>
          <input style={inputStyle} value={comercio} onChange={e => setComercio(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Fecha</label>
          <input type="date" style={inputStyle} value={fecha} onChange={e => setFecha(e.target.value)} />
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
          {/* Cabecera */}
          <div className="grid text-xs px-3 py-2"
            style={{ gridTemplateColumns: '1fr 60px 70px 24px', gap: '8px', background: 'var(--bg)', color: 'var(--text-muted)' }}>
            <span>Descripción</span><span className="text-center">Cant.</span><span className="text-right">Precio</span><span />
          </div>
          {/* Filas */}
          {items.map((item, i) => (
            <div key={i} className="grid items-center px-3 py-1.5"
              style={{ gridTemplateColumns: '1fr 60px 70px 24px', gap: '8px', borderTop: '1px solid var(--border)' }}>
              <input style={inputStyle} value={item.descripcion}
                onChange={e => updateItem(i, 'descripcion', e.target.value)} />
              <input style={{ ...inputStyle, textAlign: 'center' }} type="number" min="1" value={item.cantidad}
                onChange={e => updateItem(i, 'cantidad', e.target.value)} />
              <input style={{ ...inputStyle, textAlign: 'right' }} type="number" step="0.01" min="0" value={item.precio}
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
        <button onClick={handleConfirmar}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
          style={{ background: 'var(--color-brand)', color: '#fff' }}>
          Confirmar y guardar
        </button>
      </div>
    </div>
  )
}
