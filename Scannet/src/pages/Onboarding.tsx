import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/hooks/useAuth'

interface GastoFijoOnboarding {
  nombre: string
  precio: string
}

interface OnboardingData {
  gasto_mensual_estimado: string
  ahorro_deseado: string
}

const PASOS_NUMERICOS = [
  {
    pregunta: '¿Cuánto sueles gastar al mes?',
    campo: 'gasto_mensual_estimado' as keyof OnboardingData,
    sufijo: '€/mes',
    placeholder: '0',
  },
  {
    pregunta: '¿Cuánto quieres ahorrar al mes?',
    campo: 'ahorro_deseado' as keyof OnboardingData,
    sufijo: '€/mes',
    placeholder: '0',
  },
]

const inputStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '0.5px solid var(--border)',
  color: 'var(--text-primary)',
}

/** Cuestionario de perfil financiero tras el registro. Pasos presentados de uno en uno. */
export function Onboarding() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [paso, setPaso]   = useState(0)
  const [datos, setDatos] = useState<OnboardingData>({
    gasto_mensual_estimado: '',
    ahorro_deseado: '',
  })

  // Paso 3: lista de gastos fijos con nombre y precio
  const [gastosFijos, setGastosFijos]     = useState<GastoFijoOnboarding[]>([])
  const [nuevoNombre, setNuevoNombre]     = useState('')
  const [nuevoPrecio, setNuevoPrecio]     = useState('')

  const TOTAL = PASOS_NUMERICOS.length + 1  // 2 pasos numéricos + 1 paso gastos fijos
  const esUltimoPaso = paso === TOTAL - 1

  /** Añade un gasto fijo a la lista local (aún no persiste). */
  const agregarGasto = () => {
    const nombre = nuevoNombre.trim()
    const precio = parseFloat(nuevoPrecio)
    if (!nombre || isNaN(precio) || precio <= 0) return
    setGastosFijos(prev => [...prev, { nombre, precio: nuevoPrecio }])
    setNuevoNombre('')
    setNuevoPrecio('')
  }

  /** Elimina un gasto fijo de la lista local. */
  const quitarGasto = (idx: number) => {
    setGastosFijos(prev => prev.filter((_, i) => i !== idx))
  }

  /** Guarda el perfil y los gastos fijos en Supabase, luego redirige. */
  const guardarYSalir = async () => {
    if (user) {
      // Actualizar perfil financiero
      await supabase.from('perfil_usuario').update({
        gasto_mensual_estimado: datos.gasto_mensual_estimado ? Number(datos.gasto_mensual_estimado) : null,
        ahorro_deseado:         datos.ahorro_deseado         ? Number(datos.ahorro_deseado)         : null,
      }).eq('id', user.id)

      // Insertar gastos fijos en la tabla gasto_fijo para que aparezcan en el donut
      if (gastosFijos.length > 0) {
        await supabase.from('gasto_fijo').insert(
          gastosFijos.map(g => ({
            usuario_id: user.id,
            nombre:     g.nombre,
            precio:     parseFloat(g.precio),
            emoji:      null,
            categoria_id: null,
          }))
        )
      }
    }
    navigate('/')
  }

  const siguiente = () => {
    if (!esUltimoPaso) setPaso(p => p + 1)
    else guardarYSalir()
  }

  const omitir = () => {
    if (!esUltimoPaso) setPaso(p => p + 1)
    else guardarYSalir()
  }

  // Paso numérico (paso 0 y 1)
  const pasoNumerico = paso < PASOS_NUMERICOS.length ? PASOS_NUMERICOS[paso] : null

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'var(--bg)' }}
    >
      <div
        className="w-full max-w-[400px] rounded-card p-8"
        style={{ background: 'var(--surface)', border: '0.5px solid var(--border)' }}
      >
        {/* Indicador de progreso */}
        <p className="text-caption text-right mb-6" style={{ color: 'var(--text-muted)' }}>
          {paso + 1}/{TOTAL}
        </p>

        {/* Pasos numéricos (gasto estimado y ahorro) */}
        {pasoNumerico && (
          <>
            <h2 className="text-h2 mb-6" style={{ color: 'var(--text-primary)' }}>
              {pasoNumerico.pregunta}
            </h2>
            <div className="relative">
              <input
                type="number"
                min="0"
                placeholder={pasoNumerico.placeholder}
                value={datos[pasoNumerico.campo]}
                onChange={e => setDatos(d => ({ ...d, [pasoNumerico.campo]: e.target.value }))}
                className="w-full rounded-input px-3 py-2 text-body outline-none pr-16"
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = 'var(--color-brand)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')}
              />
              <span
                className="absolute right-3 top-1/2 -translate-y-1/2 text-caption"
                style={{ color: 'var(--text-muted)' }}
              >
                {pasoNumerico.sufijo}
              </span>
            </div>
          </>
        )}

        {/* Paso 3: gastos fijos con precio */}
        {esUltimoPaso && (
          <>
            <h2 className="text-h2 mb-2" style={{ color: 'var(--text-primary)' }}>
              ¿Tienes gastos fijos mensuales?
            </h2>
            <p className="text-caption mb-5" style={{ color: 'var(--text-muted)' }}>
              Añade alquiler, suscripciones, gimnasio… con su importe.
            </p>

            {/* Lista de gastos añadidos */}
            {gastosFijos.length > 0 && (
              <ul className="mb-4 space-y-2">
                {gastosFijos.map((g, idx) => (
                  <li
                    key={idx}
                    className="flex items-center justify-between px-3 py-2 rounded-lg"
                    style={{ background: 'var(--bg)', border: '0.5px solid var(--border)' }}
                  >
                    <span className="text-body truncate flex-1" style={{ color: 'var(--text-primary)' }}>
                      {g.nombre}
                    </span>
                    <span className="text-body font-medium mx-3 flex-shrink-0" style={{ color: 'var(--text-primary)' }}>
                      {parseFloat(g.precio).toFixed(2)} €/mes
                    </span>
                    <button
                      onClick={() => quitarGasto(idx)}
                      className="flex-shrink-0 text-sm"
                      style={{ color: '#ef4444' }}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Formulario para añadir un gasto */}
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                placeholder="Nombre (ej: Alquiler)"
                value={nuevoNombre}
                onChange={e => setNuevoNombre(e.target.value)}
                className="flex-1 rounded-input px-3 py-2 text-body outline-none"
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = 'var(--color-brand)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                onKeyDown={e => e.key === 'Enter' && agregarGasto()}
              />
              <div className="relative w-24">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={nuevoPrecio}
                  onChange={e => setNuevoPrecio(e.target.value)}
                  className="w-full rounded-input px-3 py-2 text-body outline-none pr-5"
                  style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = 'var(--color-brand)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                  onKeyDown={e => e.key === 'Enter' && agregarGasto()}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-caption" style={{ color: 'var(--text-muted)' }}>€</span>
              </div>
              <button
                onClick={agregarGasto}
                disabled={!nuevoNombre.trim() || !nuevoPrecio || parseFloat(nuevoPrecio) <= 0}
                className="rounded-btn px-3 py-2 text-body font-medium text-white flex-shrink-0"
                style={{ background: 'var(--color-brand)', opacity: (!nuevoNombre.trim() || !nuevoPrecio) ? 0.4 : 1 }}
              >
                +
              </button>
            </div>
          </>
        )}

        {/* Botones de navegación */}
        <div className="flex gap-3 mt-8">
          <button
            onClick={omitir}
            className="flex-1 rounded-btn py-[10px] text-body"
            style={{
              background: 'transparent',
              border: '0.5px solid var(--border)',
              color: 'var(--text-muted)',
            }}
          >
            Omitir
          </button>
          <button
            onClick={siguiente}
            className="flex-1 rounded-btn py-[10px] text-body font-medium text-white"
            style={{ background: 'var(--color-brand)' }}
          >
            {esUltimoPaso ? 'Empezar →' : 'Siguiente →'}
          </button>
        </div>
      </div>
    </div>
  )
}
