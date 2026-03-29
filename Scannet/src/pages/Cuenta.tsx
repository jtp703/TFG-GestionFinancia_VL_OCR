import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'

/** Devuelve las 2 primeras iniciales de un email */
function initials(email: string): string {
  if (!email) return '?'
  const parts = email.split('@')[0].split(/[._-]/)
  return parts.slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?'
}

/** Vista de cuenta: avatar, email, toggle de tema y logout */
export function Cuenta() {
  const { user, signOut }   = useAuth()
  const { theme, toggle }   = useTheme()
  const navigate            = useNavigate()
  const [modal, setModal]   = useState(false)

  async function handleLogout() {
    await signOut()
    navigate('/login')
  }

  const email = user?.email ?? ''

  return (
    <div className="p-6 max-w-sm mx-auto space-y-6" style={{ color: 'var(--text-primary)' }}>

      {/* Avatar + email */}
      <div className="flex flex-col items-center gap-3 pt-4">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-semibold text-white select-none"
          style={{ background: 'var(--color-brand)' }}
        >
          {initials(email)}
        </div>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{email}</p>
      </div>

      {/* Separador */}
      <div style={{ borderTop: '1px solid var(--border)' }} />

      {/* Toggle de tema */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Tema</span>
        <button
          onClick={toggle}
          aria-label="Cambiar tema"
          className="relative w-14 h-7 rounded-full overflow-hidden transition-colors duration-200"
          style={{ background: theme === 'dark' ? 'var(--color-brand)' : 'var(--border)' }}
        >
          {/* Icono sol — visible en modo claro */}
          <svg
            className="absolute left-1.5 top-1/2 -translate-y-1/2 transition-opacity duration-200"
            style={{ opacity: theme === 'dark' ? 0 : 1 }}
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
          {/* Icono luna — visible en modo oscuro */}
          <svg
            className="absolute right-1.5 top-1/2 -translate-y-1/2 transition-opacity duration-200"
            style={{ opacity: theme === 'dark' ? 1 : 0 }}
            width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
          {/* Bolita deslizante */}
          <span
            className="absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform duration-200"
            style={{ transform: theme === 'dark' ? 'translateX(30px)' : 'translateX(2px)' }}
          />
        </button>
      </div>

      {/* Separador */}
      <div style={{ borderTop: '1px solid var(--border)' }} />

      {/* Botón logout */}
      <button
        onClick={() => setModal(true)}
        className="w-full py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
        style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}
      >
        Cerrar sesión
      </button>

      {/* Modal de confirmación */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setModal(false)}
        >
          <div
            className="w-full max-w-xs rounded-2xl p-6 space-y-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}
          >
            <p className="font-semibold text-center">¿Cerrar sesión?</p>
            <p className="text-sm text-center" style={{ color: 'var(--text-muted)' }}>
              Tendrás que volver a iniciar sesión para acceder.
            </p>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setModal(false)}
                className="flex-1 py-2.5 rounded-xl text-sm transition-opacity hover:opacity-70"
                style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
                style={{ background: '#ef4444', color: '#fff' }}
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
