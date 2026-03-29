import { useNavigate } from 'react-router-dom'

/** Pantalla vacía cuando el usuario no tiene tickets en el mes en curso */
export function EmptyState() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col items-center justify-center gap-6 py-20 px-6 text-center">
      {/* Ilustración */}
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center"
        style={{ backgroundColor: 'var(--color-brand-light)' }}
      >
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--color-brand)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="12" y1="18" x2="12" y2="12" />
          <line x1="9" y1="15" x2="15" y2="15" />
        </svg>
      </div>

      <div>
        <p className="text-base font-medium" style={{ color: 'var(--text-primary)' }}>
          Aún no tienes gastos este mes
        </p>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Escanea tu primer ticket para empezar a registrar
        </p>
      </div>

      <button
        onClick={() => navigate('/scan')}
        className="px-6 py-2.5 rounded-full text-sm font-medium text-white"
        style={{ backgroundColor: 'var(--color-brand)' }}
      >
        Escanear ticket
      </button>
    </div>
  )
}
