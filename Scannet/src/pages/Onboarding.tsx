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
  const [guardando, setGuardando]         = useState(false)
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null)

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
    if (guardando) return
    setGuardando(true)
    // Obtener uid desde sesión activa como fuente de verdad
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id ?? user?.id

    if (uid) {
      // Actualizar perfil financiero
      const { error: profileError } = await supabase.from('perfil_usuario').update({
        gasto_mensual_estimado: datos.gasto_mensual_estimado ? Number(datos.gasto_mensual_estimado) : null,
        ahorro_deseado:         datos.ahorro_deseado         ? Number(datos.ahorro_deseado)         : null,
      }).eq('id', uid)
      if (profileError) console.error('[Onboarding] perfil_usuario update error:', profileError)

      // Insertar gastos fijos en la tabla gasto_fijo para que aparezcan en el donut
      if (gastosFijos.length > 0) {
        const { error: gastosError } = await supabase.from('gasto_fijo').insert(
          gastosFijos.map(g => ({
            usuario_id:   uid,
            nombre:       g.nombre,
            precio:       parseFloat(g.precio),
            emoji:        null,
            categoria_id: null,
          }))
        )
        if (gastosError) {
          console.error('[Onboarding] gasto_fijo insert error:', gastosError)
          setErrorGuardado(`Error guardando gastos fijos: ${gastosError.message}`)
          setGuardando(false)
          return
        }
      }
    } else {
      console.error('[Onboarding] guardarYSalir llamado sin sesión activa')
      setErrorGuardado('No hay sesión activa. Vuelve a iniciar sesión.')
      setGuardando(false)
      return
    }
    navigate('/')
  }

  const siguiente = () => {
    // Paso 1 (gasto estimado) es obligatorio — sin él la barra de presupuesto no funciona
    if (paso === 0 && (!datos.gasto_mensual_estimado || Number(datos.gasto_mensual_estimado) <= 0)) return
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
              <div className="flex items-center gap-1 flex-shrink-0 rounded-input px-2 py-2" style={{ ...inputStyle, border: '0.5px solid var(--border)' }}>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={nuevoPrecio}
                  onChange={e => { if (e.target.value.length <= 7) setNuevoPrecio(e.target.value) }}
                  className="outline-none bg-transparent text-body text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  style={{
                    color: 'var(--text-primary)',
                    width: `${Math.max(2, nuevoPrecio.length || 1)}ch`,
                    minWidth: '2ch',
                    maxWidth: '7ch',
                  }}
                  onFocus={e => (e.target.parentElement!.style.borderColor = 'var(--color-brand)')}
                  onBlur={e => (e.target.parentElement!.style.borderColor = 'var(--border)')}
                  onKeyDown={e => e.key === 'Enter' && agregarGasto()}
                />
                <span className="text-caption flex-shrink-0" style={{ color: 'var(--text-muted)' }}>€</span>
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

        {/* Error al guardar */}
        {errorGuardado && (
          <p className="text-caption mt-4" style={{ color: '#DC2626' }}>{errorGuardado}</p>
        )}

        {/* Botones de navegación */}
        <div className="flex gap-3 mt-4">
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
            disabled={guardando || (paso === 0 && (!datos.gasto_mensual_estimado || Number(datos.gasto_mensual_estimado) <= 0))}
            className="flex-1 rounded-btn py-[10px] text-body font-medium text-white disabled:opacity-40"
            style={{ background: 'var(--color-brand)' }}
          >
            {guardando ? 'Guardando...' : esUltimoPaso ? 'Empezar →' : 'Siguiente →'}
          </button>
        </div>
      </div>
    </div>
  )
}
