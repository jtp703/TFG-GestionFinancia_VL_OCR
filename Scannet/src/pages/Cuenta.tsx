import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'

/** Devuelve las 2 primeras iniciales de un email */
function initials(email: string): string {
  const parts = email.split('@')[0].split(/[._-]/)
  return parts.slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || email[0].toUpperCase()
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
        <span className="text-sm font-medium">Tema oscuro</span>
        <button
          onClick={toggle}
          aria-label="Cambiar tema"
          className="relative w-11 h-6 rounded-full transition-colors duration-200"
          style={{ background: theme === 'dark' ? 'var(--color-brand)' : 'var(--border)' }}
        >
          <span
            className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200"
            style={{ transform: theme === 'dark' ? 'translateX(20px)' : 'translateX(0)' }}
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
