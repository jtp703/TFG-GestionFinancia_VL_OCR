import { useEffect, useState } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
}

/** Expone el usuario y sesión activa, y métodos de autenticación. */
export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
  })

  useEffect(() => {
    // Carga la sesión inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState({ user: session?.user ?? null, session, loading: false })
    })

    // Escucha cambios de sesión (login, logout, refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ user: session?.user ?? null, session, loading: false })
    })

    return () => subscription.unsubscribe()
  }, [])

  /** Registra un nuevo usuario con email y contraseña. */
  const signUp = (email: string, password: string) =>
    supabase.auth.signUp({ email, password })

  /** Inicia sesión con email y contraseña. */
  const signIn = (email: string, password: string) =>
    supabase.auth.signInWithPassword({ email, password })

  /** Cierra la sesión activa. */
  const signOut = () => supabase.auth.signOut()

  return { ...state, signUp, signIn, signOut }
}
