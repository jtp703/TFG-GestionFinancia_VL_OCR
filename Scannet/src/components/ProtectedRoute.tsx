import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabaseClient'

interface Props {
  children: React.ReactNode
}

/** Redirige a /login si no autenticado, a /onboarding si el perfil está incompleto. */
export function ProtectedRoute({ children }: Props) {
  const { user, loading } = useAuth()
  const [profileLoading, setProfileLoading] = useState(true)
  const [onboardingPending, setOnboardingPending] = useState(false)

  useEffect(() => {
    if (!user) {
      setProfileLoading(false)
      return
    }
    supabase
      .from('perfil_usuario')
      .select('gasto_mensual_estimado')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        setOnboardingPending(data?.gasto_mensual_estimado == null)
        setProfileLoading(false)
      })
  }, [user])

  if (loading || (user && profileLoading)) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: 'var(--bg)' }}>
        <div className="w-6 h-6 rounded-full border-2 border-brand animate-spin border-t-transparent" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (onboardingPending) return <Navigate to="/onboarding" replace />

  return <>{children}</>
}
