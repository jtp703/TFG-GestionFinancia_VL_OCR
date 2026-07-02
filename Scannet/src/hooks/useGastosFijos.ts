import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { notify } from '@/lib/toast'

export interface GastoFijo {
  id:           string
  nombre:       string
  precio:       number
  emoji:        string | null
  categoria_id: string | null
  categoria:    { id: string; nombre: string } | null
  activo:       boolean
}

export interface Categoria {
  id:     string
  nombre: string
}

type NuevoGasto = Omit<GastoFijo, 'id' | 'categoria' | 'activo'>

interface UseGastosFijosResult {
  gastosFijos: GastoFijo[]
  categorias:  Categoria[]
  loading:     boolean
  crear:       (data: NuevoGasto) => Promise<boolean>
  actualizar:  (id: string, data: Partial<NuevoGasto>) => Promise<boolean>
  eliminar:    (id: string) => Promise<boolean>
}

/** CRUD de gastos fijos mensuales del usuario autenticado. */
export function useGastosFijos(): UseGastosFijosResult {
  const [gastosFijos, setGastosFijos] = useState<GastoFijo[]>([])
  const [categorias, setCategorias]   = useState<Categoria[]>([])
  const [loading, setLoading]         = useState(true)

  const cargar = useCallback(async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setLoading(false); return }

    const [{ data: gastos, error: gastosErr }, { data: cats }] = await Promise.all([
      supabase
        .from('gasto_fijo')
        .select('id, nombre, precio, emoji, categoria_id, activo, categoria:categoria_id(id, nombre)')
        .eq('usuario_id', session.user.id)
        .eq('activo', true)
        .order('created_at', { ascending: true }),
      supabase
        .from('categoria')
        .select('id, nombre')
        .order('nombre'),
    ])
    if (gastosErr) console.error('[useGastosFijos] cargar error:', gastosErr)

    const normalizado: GastoFijo[] = (gastos ?? []).map((g: any) => ({
      ...g,
      categoria: Array.isArray(g.categoria) ? (g.categoria[0] ?? null) : (g.categoria ?? null),
    }))
    setGastosFijos(normalizado)
    setCategorias(cats ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  async function crear(data: NuevoGasto): Promise<boolean> {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { notify.err('Sin sesión activa'); return false }
    const { error } = await supabase.from('gasto_fijo').insert({
      usuario_id:   session.user.id,
      nombre:       data.nombre,
      precio:       data.precio,
      emoji:        data.emoji,
      categoria_id: data.categoria_id,
    })
    if (error) { notify.err('Error al crear el gasto fijo'); return false }
    notify.ok('Gasto fijo creado')
    await cargar()
    return true
  }

  async function actualizar(id: string, data: Partial<NuevoGasto>): Promise<boolean> {
    const { error } = await supabase.from('gasto_fijo').update(data).eq('id', id)
    if (error) { notify.err('Error al actualizar el gasto fijo'); return false }
    notify.ok('Gasto fijo actualizado')
    await cargar()
    return true
  }

  async function eliminar(id: string): Promise<boolean> {
    const { error } = await supabase.from('gasto_fijo').update({ activo: false }).eq('id', id)
    if (error) { notify.err('Error al eliminar el gasto fijo'); return false }
    notify.ok('Gasto fijo eliminado')
    setGastosFijos(prev => prev.filter(g => g.id !== id))
    return true
  }

  return { gastosFijos, categorias, loading, crear, actualizar, eliminar }
}
