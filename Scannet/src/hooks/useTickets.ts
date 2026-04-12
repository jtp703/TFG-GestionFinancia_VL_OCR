import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'

// ─── Mock data — poner a false cuando el API esté listo ───────────────────────
const USE_MOCK = false

const MOCK_TICKETS: Ticket[] = [
  { id: '1', comercio: 'Mercadona', fecha: '2026-03-01', metodo_pago: 'tarjeta', verificado: true, total: 67.30, categoria: { id: 'cat-1', nombre: 'Alimentación' }, productos: [] },
  { id: '2', comercio: 'Carrefour', fecha: '2026-03-05', metodo_pago: 'efectivo', verificado: true, total: 43.10, categoria: { id: 'cat-1', nombre: 'Alimentación' }, productos: [] },
  { id: '3', comercio: 'Repsol',    fecha: '2026-03-08', metodo_pago: 'tarjeta', verificado: true, total: 55.00, categoria: { id: 'cat-2', nombre: 'Transporte' },   productos: [] },
  { id: '4', comercio: 'Cinesa',    fecha: '2026-03-12', metodo_pago: 'tarjeta', verificado: true, total: 22.50, categoria: { id: 'cat-3', nombre: 'Ocio' },          productos: [] },
  { id: '5', comercio: 'Ikea',      fecha: '2026-03-15', metodo_pago: 'tarjeta', verificado: true, total: 89.99, categoria: { id: 'cat-4', nombre: 'Hogar' },         productos: [] },
  { id: '6', comercio: 'Farmacia',  fecha: '2026-03-18', metodo_pago: 'efectivo', verificado: true, total: 18.40, categoria: { id: 'cat-5', nombre: 'Salud' },        productos: [] },
  { id: '7', comercio: 'Dia',       fecha: '2026-03-22', metodo_pago: 'efectivo', verificado: true, total: 31.20, categoria: { id: 'cat-1', nombre: 'Alimentación' }, productos: [] },
]

const MOCK_TOTALES: Record<string, TotalCategoria> = {
  'cat-1': { nombre: 'Alimentación', total: 141.60 },
  'cat-2': { nombre: 'Transporte',   total: 55.00  },
  'cat-3': { nombre: 'Ocio',         total: 22.50  },
  'cat-4': { nombre: 'Hogar',        total: 89.99  },
  'cat-5': { nombre: 'Salud',        total: 18.40  },
}

const MOCK_TOTAL_MES = 327.49
// ──────────────────────────────────────────────────────────────────────────────

export interface Producto {
  id: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  precio_total: number
}

export interface Ticket {
  id: string
  comercio: string
  fecha: string
  metodo_pago: string
  verificado: boolean
  total: number
  categoria: { id: string; nombre: string } | null
  productos: Producto[]
}

export interface TotalCategoria {
  nombre: string
  total: number
}

interface UseTicketsResult {
  tickets: Ticket[]
  totalesPorCategoria: Record<string, TotalCategoria>
  totalMes: number
  loading: boolean
  error: string | null
  refetch: () => void
}

/** Obtiene los tickets del mes en curso del usuario autenticado vía /api/tickets */
export function useTickets(): UseTicketsResult {
  const [tickets, setTickets]                       = useState<Ticket[]>([])
  const [totalesPorCategoria, setTotalesPorCategoria] = useState<Record<string, TotalCategoria>>({})
  const [totalMes, setTotalMes]                     = useState(0)
  const [loading, setLoading]                       = useState(true)
  const [error, setError]                           = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)

    // Mock — eliminar cuando el API esté listo
    if (USE_MOCK) {
      setTimeout(() => {
        setTickets(MOCK_TICKETS)
        setTotalesPorCategoria(MOCK_TOTALES)
        setTotalMes(MOCK_TOTAL_MES)
        setLoading(false)
      }, 600) // simula latencia de red
      return
    }

    let session: any = null
    try {
      const { data } = await supabase.auth.getSession()
      session = data.session
    } catch {
      // getSession puede lanzar si el refresh token es inválido
    }
    if (!session) {
      setError('No autenticado')
      setLoading(false)
      return
    }

    const res = await window.fetch('/api/tickets', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })

    if (!res.ok) {
      setError('Error al cargar los tickets')
      setLoading(false)
      return
    }

    const data = await res.json()
    setTickets(data.tickets)
    setTotalesPorCategoria(data.totalesPorCategoria)
    setTotalMes(data.totalMes)
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  return { tickets, totalesPorCategoria, totalMes, loading, error, refetch: fetch }
}
