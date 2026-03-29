import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export type MetodoPago = 'efectivo' | 'tarjeta'

export interface ProductoOCR {
  descripcion: string
  cantidad:    number
  precio:      number
}

export interface ResultadoOCR {
  comercio:    string
  cif:         string
  fecha:       string
  total:       number
  items:       ProductoOCR[]
  metodo_pago: MetodoPago
}

type Estado = 'idle' | 'loading' | 'verify' | 'error' | 'success'

interface UseScanReturn {
  estado:       Estado
  resultado:    ResultadoOCR | null
  errorMsg:     string | null
  metodoPago:   MetodoPago
  setMetodoPago: (m: MetodoPago) => void
  enviar:       (imageBlob: Blob) => Promise<void>
  guardar:      (datos: ResultadoOCR) => Promise<void>
  reintentar:   () => void
  cancelar:     () => void
}

export function useScan(): UseScanReturn {
  const [estado, setEstado]         = useState<Estado>('idle')
  const [resultado, setResultado]   = useState<ResultadoOCR | null>(null)
  const [errorMsg, setErrorMsg]     = useState<string | null>(null)
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('efectivo')
  const [ultimaImagen, setUltimaImagen] = useState<Blob | null>(null)

  /** Envía la imagen al endpoint /api/scan */
  async function enviar(imageBlob: Blob) {
    setUltimaImagen(imageBlob)
    setEstado('loading')
    setErrorMsg(null)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setErrorMsg('Sesión expirada. Vuelve a iniciar sesión.')
      setEstado('error')
      return
    }

    const form = new FormData()
    form.append('image', imageBlob, 'ticket.jpg')
    form.append('metodo_pago', metodoPago)

    try {
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
      })

      const data = await response.json()

      if (!response.ok) {
        setErrorMsg(data.error ?? 'Error desconocido del servidor')
        setEstado('error')
        return
      }

      setResultado({ ...data, metodo_pago: metodoPago })
      setEstado('verify')
    } catch (err: any) {
      setErrorMsg(err.message ?? 'Error de red')
      setEstado('error')
    }
  }

  /** Guarda el ticket verificado en Supabase, detectando duplicados previamente */
  async function guardar(datos: ResultadoOCR) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setErrorMsg('Sesión expirada.')
      setEstado('error')
      return
    }

    // Detectar duplicado por comercio + fecha + total
    const { data: duplicados } = await supabase
      .from('ticket')
      .select('id')
      .eq('usuario_id', session.user.id)
      .eq('comercio', datos.comercio)
      .eq('fecha', datos.fecha)
      .eq('total', datos.total)
      .limit(1)

    if (duplicados && duplicados.length > 0) {
      setErrorMsg('Ya existe un ticket con el mismo comercio, fecha y total.')
      setEstado('error')
      return
    }

    // Categorizar el comercio vía DeepSeek
    let categoriaId: string | null = null
    try {
      const catResponse = await fetch('/api/categorize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ comercio: datos.comercio }),
      })
      if (catResponse.ok) {
        const { categoria } = await catResponse.json()
        const { data: catRow } = await supabase
          .from('categoria')
          .select('id')
          .eq('nombre', categoria)
          .single()
        categoriaId = catRow?.id ?? null
      }
    } catch {
      // Si la categorización falla, se guarda el ticket sin categoría
    }

    // Insertar ticket
    const { data: ticket, error: ticketError } = await supabase
      .from('ticket')
      .insert({
        usuario_id:    session.user.id,
        comercio:      datos.comercio,
        fecha:         datos.fecha,
        metodo_pago:   datos.metodo_pago,
        verificado:    true,
        json_extraido: datos,
        categoria_id:  categoriaId,
      })
      .select('id')
      .single()

    if (ticketError || !ticket) {
      setErrorMsg(ticketError?.message ?? 'Error al guardar el ticket')
      setEstado('error')
      return
    }

    // Insertar productos
    const productos = datos.items.map(item => ({
      ticket_id:       ticket.id,
      descripcion:     item.descripcion,
      cantidad:        item.cantidad,
      precio_unitario: item.precio,
      precio_total:    item.cantidad * item.precio,
    }))

    const { error: prodError } = await supabase.from('producto').insert(productos)

    if (prodError) {
      setErrorMsg(prodError.message)
      setEstado('error')
      return
    }

    setEstado('success')
  }

  /** Vuelve a enviar la última imagen capturada */
  function reintentar() {
    if (ultimaImagen) enviar(ultimaImagen)
    else setEstado('idle')
  }

  /** Resetea al estado inicial */
  function cancelar() {
    setEstado('idle')
    setResultado(null)
    setErrorMsg(null)
    setUltimaImagen(null)
  }

  return { estado, resultado, errorMsg, metodoPago, setMetodoPago, enviar, guardar, reintentar, cancelar }
}
