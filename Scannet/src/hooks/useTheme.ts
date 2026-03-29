import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Theme = 'light' | 'dark'

function readThemeFromDOM(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

/** Gestiona el tema claro/oscuro.
 *  Prioridad al cargar: perfil_usuario (Supabase) > localStorage > prefers-color-scheme.
 *  Persiste en localStorage y en perfil_usuario al cambiar.
 *  MutationObserver sincroniza todas las instancias del hook en tiempo real. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('theme') as Theme | null
    if (stored) return stored
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  // Al montar: leer tema guardado en perfil_usuario y aplicarlo si difiere
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return
      const { data } = await supabase
        .from('perfil_usuario')
        .select('tema_preferido')
        .eq('id', session.user.id)
        .single()
      if (data?.tema_preferido && data.tema_preferido !== theme) {
        setTheme(data.tema_preferido as Theme)
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Aplica el tema al DOM y persiste en localStorage
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') root.classList.add('dark')
    else root.classList.remove('dark')
    localStorage.setItem('theme', theme)
  }, [theme])

  // Sincroniza esta instancia cuando otra instancia cambia la clase en <html>
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(readThemeFromDOM()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    // Persistir en Supabase de forma asíncrona (sin bloquear la UI)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      supabase
        .from('perfil_usuario')
        .update({ tema_preferido: next })
        .eq('id', session.user.id)
    })
  }

  return { theme, toggle }
}
