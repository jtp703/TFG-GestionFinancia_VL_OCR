import { useState, FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

/** Pantalla de inicio de sesión. Sin barra de navegación. Card centrada máx. 400px. */
export function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error } = await signIn(email, password)

    if (error) {
      setError('Email o contraseña incorrectos')
      setLoading(false)
      return
    }

    navigate('/')
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
        {/* Logo */}
        <h1 className="text-center text-h1 mb-8" style={{ color: 'var(--color-brand)' }}>
          Scannet
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Email */}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="w-full rounded-input px-3 py-2 text-body outline-none"
            style={{
              background: 'var(--surface)',
              border: '0.5px solid var(--border)',
              color: 'var(--text-primary)',
            }}
            onFocus={e => (e.target.style.borderColor = 'var(--color-brand)')}
            onBlur={e => (e.target.style.borderColor = 'var(--border)')}
          />

          {/* Contraseña */}
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="w-full rounded-input px-3 py-2 text-body outline-none"
            style={{
              background: 'var(--surface)',
              border: '0.5px solid var(--border)',
              color: 'var(--text-primary)',
            }}
            onFocus={e => (e.target.style.borderColor = 'var(--color-brand)')}
            onBlur={e => (e.target.style.borderColor = 'var(--border)')}
          />

          {/* Error */}
          {error && (
            <p className="text-caption" style={{ color: '#DC2626' }}>{error}</p>
          )}

          {/* CTA */}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-btn py-[10px] text-body font-medium text-white disabled:opacity-60"
            style={{ background: loading ? 'var(--color-brand-dark)' : 'var(--color-brand)' }}
          >
            {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
          </button>
        </form>

        {/* Enlace a registro */}
        <p className="text-center text-caption mt-6" style={{ color: 'var(--text-muted)' }}>
          ¿No tienes cuenta?{' '}
          <Link to="/registro" style={{ color: 'var(--color-brand)' }}>
            Regístrate aquí
          </Link>
        </p>
      </div>
    </div>
  )
}
