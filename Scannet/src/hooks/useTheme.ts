import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Theme = 'light' | 'dark'

// Flag a nivel de módulo: la sincronización con Supabase solo ocurre una vez por carga de página,
// independientemente de cuántas instancias del hook se monten.
let _supabaseSynced = false

function readThemeFromDOM(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

/** Gestiona el tema claro/oscuro.
 *  Prioridad al cargar (una vez por sesión): perfil_usuario (Supabase) > localStorage > prefers-color-scheme.
 *  Persiste en localStorage y en perfil_usuario al cambiar.
 *  MutationObserver sincroniza todas las instancias del hook en tiempo real. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('theme') as Theme | null
    if (stored) return stored
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  // Leer tema_oscuro de Supabase solo una vez por carga de página
  useEffect(() => {
    if (_supabaseSynced) return
    _supabaseSynced = true

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return
      const { data } = await supabase
        .from('perfil_usuario')
        .select('tema_oscuro')
        .eq('id', session.user.id)
        .single()
      if (data == null) return
      const remoto: Theme = data.tema_oscuro ? 'dark' : 'light'
      if (remoto !== readThemeFromDOM()) setTheme(remoto)
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
        .update({ tema_oscuro: next === 'dark' })
        .eq('id', session.user.id)
    })
  }

  return { theme, toggle }
}
