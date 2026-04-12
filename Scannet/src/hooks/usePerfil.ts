import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

interface Perfil {
  gasto_mensual_estimado: number | null
  ahorro_deseado:         number | null
}

interface UsePerfilResult {
  perfil:  Perfil | null
  loading: boolean
}

/** Obtiene el perfil del usuario autenticado desde perfil_usuario. */
export function usePerfil(): UsePerfilResult {
  const [perfil, setPerfil]   = useState<Perfil | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setLoading(false); return }

      const { data } = await supabase
        .from('perfil_usuario')
        .select('gasto_mensual_estimado, ahorro_deseado')
        .eq('id', session.user.id)
        .single()

      setPerfil(data ?? null)
      setLoading(false)
    }
    load()
  }, [])

  return { perfil, loading }
}
