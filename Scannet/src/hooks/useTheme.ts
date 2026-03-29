import { useState, useEffect } from 'react'

type Theme = 'light' | 'dark'

function readThemeFromDOM(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

/** Gestiona el tema claro/oscuro. Persiste en localStorage y aplica clase .dark en <html>.
 *  Usa MutationObserver para que todas las instancias del hook se sincronicen entre sí. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('theme') as Theme | null
    if (stored) return stored
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  // Aplica el tema al DOM y lo persiste
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    localStorage.setItem('theme', theme)
  }, [theme])

  // Sincroniza esta instancia cuando otra instancia cambia la clase en <html>
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(readThemeFromDOM())
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    return () => observer.disconnect()
  }, [])

  const toggle = () => setTheme(prev => (prev === 'dark' ? 'light' : 'dark'))

  return { theme, toggle }
}
