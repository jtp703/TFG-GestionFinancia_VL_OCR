import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/hooks/useAuth'

interface OnboardingData {
  gasto_mensual_estimado: string
  ahorro_deseado: string
  gastos_fijos: string
}

const PASOS = [
  {
    pregunta: '¿Cuánto sueles gastar al mes?',
    campo: 'gasto_mensual_estimado' as keyof OnboardingData,
    tipo: 'number',
    sufijo: '€/mes',
    placeholder: '0',
  },
  {
    pregunta: '¿Cuánto quieres ahorrar al mes?',
    campo: 'ahorro_deseado' as keyof OnboardingData,
    tipo: 'number',
    sufijo: '€/mes',
    placeholder: '0',
  },
  {
    pregunta: '¿Tienes gastos fijos mensuales?',
    campo: 'gastos_fijos' as keyof OnboardingData,
    tipo: 'textarea',
    sufijo: '',
    placeholder: 'Ej: alquiler, suscripciones, gimnasio...',
  },
]

/** Cuestionario de perfil financiero tras el registro. Pasos presentados de uno en uno. */
export function Onboarding() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [paso, setPaso] = useState(0)
  const [datos, setDatos] = useState<OnboardingData>({
    gasto_mensual_estimado: '',
    ahorro_deseado: '',
    gastos_fijos: '',
  })

  const pasoActual = PASOS[paso]
  const total = PASOS.length

  /** Guarda el perfil en Supabase y redirige a la app. */
  const guardarYSalir = async () => {
    if (user) {
      await supabase.from('perfil_usuario').update({
        gasto_mensual_estimado: datos.gasto_mensual_estimado ? Number(datos.gasto_mensual_estimado) : null,
        ahorro_deseado: datos.ahorro_deseado ? Number(datos.ahorro_deseado) : null,
        gastos_fijos: datos.gastos_fijos || null,
      }).eq('id', user.id)
    }
    navigate('/')
  }

  const siguiente = () => {
    if (paso < total - 1) setPaso(p => p + 1)
    else guardarYSalir()
  }

  const omitir = () => {
    if (paso < total - 1) setPaso(p => p + 1)
    else guardarYSalir()
  }

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
          {paso + 1}/{total}
        </p>

        {/* Pregunta */}
        <h2 className="text-h2 mb-6" style={{ color: 'var(--text-primary)' }}>
          {pasoActual.pregunta}
        </h2>

        {/* Input */}
        {pasoActual.tipo === 'textarea' ? (
          <textarea
            rows={4}
            placeholder={pasoActual.placeholder}
            value={datos[pasoActual.campo]}
            onChange={e => setDatos(d => ({ ...d, [pasoActual.campo]: e.target.value }))}
            className="w-full rounded-input px-3 py-2 text-body outline-none resize-none"
            style={{
              background: 'var(--surface)',
              border: '0.5px solid var(--border)',
              color: 'var(--text-primary)',
            }}
            onFocus={e => (e.target.style.borderColor = 'var(--color-brand)')}
            onBlur={e => (e.target.style.borderColor = 'var(--border)')}
          />
        ) : (
          <div className="relative">
            <input
              type="number"
              min="0"
              placeholder={pasoActual.placeholder}
              value={datos[pasoActual.campo]}
              onChange={e => setDatos(d => ({ ...d, [pasoActual.campo]: e.target.value }))}
              className="w-full rounded-input px-3 py-2 text-body outline-none pr-16"
              style={{
                background: 'var(--surface)',
                border: '0.5px solid var(--border)',
                color: 'var(--text-primary)',
              }}
              onFocus={e => (e.target.style.borderColor = 'var(--color-brand)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            />
            <span
              className="absolute right-3 top-1/2 -translate-y-1/2 text-caption"
              style={{ color: 'var(--text-muted)' }}
            >
              {pasoActual.sufijo}
            </span>
          </div>
        )}

        {/* Botones */}
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
            {paso < total - 1 ? 'Siguiente →' : 'Empezar →'}
          </button>
        </div>
      </div>
    </div>
  )
}
