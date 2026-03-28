import { useState, FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

/** Pantalla de registro. Mismo estilo que Login. Tras registrarse, redirige al onboarding. */
export function Registro() {
  const { signUp } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password !== confirm) {
      setError('Las contraseñas no coinciden')
      return
    }

    setLoading(true)
    const { error } = await signUp(email, password)

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    navigate('/onboarding')
  }

  const inputStyle = {
    background: 'var(--surface)',
    border: '0.5px solid var(--border)',
    color: 'var(--text-primary)',
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
        <h1 className="text-center text-h1 mb-8" style={{ color: 'var(--color-brand)' }}>
          Scannet
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="w-full rounded-input px-3 py-2 text-body outline-none"
            style={inputStyle}
            onFocus={e => (e.target.style.borderColor = 'var(--color-brand)')}
            onBlur={e => (e.target.style.borderColor = 'var(--border)')}
          />

          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="w-full rounded-input px-3 py-2 text-body outline-none"
            style={inputStyle}
            onFocus={e => (e.target.style.borderColor = 'var(--color-brand)')}
            onBlur={e => (e.target.style.borderColor = 'var(--border)')}
          />

          <input
            type="password"
            placeholder="Confirmar contraseña"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            required
            className="w-full rounded-input px-3 py-2 text-body outline-none"
            style={inputStyle}
            onFocus={e => (e.target.style.borderColor = 'var(--color-brand)')}
            onBlur={e => (e.target.style.borderColor = 'var(--border)')}
          />

          {error && (
            <p className="text-caption" style={{ color: '#DC2626' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-btn py-[10px] text-body font-medium text-white disabled:opacity-60"
            style={{ background: 'var(--color-brand)' }}
          >
            {loading ? 'Creando cuenta...' : 'Crear cuenta'}
          </button>
        </form>

        <p className="text-center text-caption mt-6" style={{ color: 'var(--text-muted)' }}>
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" style={{ color: 'var(--color-brand)' }}>
            Inicia sesión
          </Link>
        </p>
      </div>
    </div>
  )
}
