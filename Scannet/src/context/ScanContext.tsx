import { createContext, useContext, useState, useRef, type ReactNode } from 'react'
import { supabase } from '../lib/supabaseClient'
import { notify } from '../lib/toast'

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

type Estado = 'idle' | 'loading' | 'verify' | 'guardando' | 'consent' | 'error' | 'success'

interface ScanState {
  estado:           Estado
  resultado:        ResultadoOCR | null
  errorMsg:         string | null
  duplicado:        boolean
  imagenPreview:    string | null
  tiempoOCR:        number | null
  metodoPago:       MetodoPago
  ticketGuardadoId: string | null
  setMetodoPago:    (m: MetodoPago) => void
  enviar:           (imageBlob: Blob) => Promise<void>
  guardar:          (datos: ResultadoOCR) => Promise<void>
  reintentar:       () => void
  cancelar:         () => void
}

const ScanContext = createContext<ScanState | null>(null)

async function comprimirImagen(blob: Blob, maxPx = 1200, quality = 0.82): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(blob)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale  = Math.min(1, maxPx / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(img.width  * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(r => resolve(r ?? blob), 'image/jpeg', quality)
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(blob) }
    img.src = url
  })
}

export function ScanProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado]                     = useState<Estado>('idle')
  const [resultado, setResultado]               = useState<ResultadoOCR | null>(null)
  const [errorMsg, setErrorMsg]                 = useState<string | null>(null)
  const [duplicado, setDuplicado]               = useState(false)
  const [imagenPreview, setImagenPreview]       = useState<string | null>(null)
  const [tiempoOCR, setTiempoOCR]               = useState<number | null>(null)
  const [metodoPago, setMetodoPago]             = useState<MetodoPago>('efectivo')
  const [ticketGuardadoId, setTicketGuardadoId] = useState<string | null>(null)
  // useRef so the blob survives navigation without re-renders
  const ultimaImagenRef = useRef<Blob | null>(null)

  async function enviar(imageBlob: Blob) {
    ultimaImagenRef.current = imageBlob
    setImagenPreview(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(imageBlob) })
    setEstado('loading')
    setErrorMsg(null)
    setDuplicado(false)
    setTiempoOCR(null)
    const inicio = Date.now()

    if (import.meta.env.VITE_USE_MOCK_OCR === 'true') {
      await new Promise(r => setTimeout(r, 800))
      setResultado({
        comercio:    'MERCADONA, S.A.',
        cif:         'A-46103834',
        fecha:       '15/03/2025',
        total:       24.50,
        items: [
          { descripcion: 'LECHE ENTERA HACENDADO 1L', cantidad: 2, precio: 0.89 },
          { descripcion: 'PAN DE MOLDE TIERNO',        cantidad: 1, precio: 1.45 },
          { descripcion: 'PECHUGA PAVO LONCHAS',        cantidad: 1, precio: 2.35 },
          { descripcion: 'ACEITE OLIVA VIRGEN 1L',      cantidad: 1, precio: 4.99 },
          { descripcion: 'YOGUR NATURAL PACK 8',        cantidad: 2, precio: 1.89 },
          { descripcion: 'FRUTA VARIADA KG',            cantidad: 1, precio: 3.20 },
        ],
        metodo_pago: metodoPago,
      })
      setTiempoOCR(Math.round((Date.now() - inicio) / 1000))
      setEstado('verify')
      return
    }

    let session: any = null
    try {
      const { data } = await supabase.auth.getSession()
      session = data.session
    } catch { /* refresh token inválido */ }

    if (!session) {
      const msg = 'Sesión expirada. Vuelve a iniciar sesión.'
      setErrorMsg(msg); notify.info(msg); setEstado('error')
      return
    }

    const blobComprimido = await comprimirImagen(imageBlob)
    const arrayBuffer = await blobComprimido.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)
    let binary = ''
    const chunkSize = 8192
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
    }
    const base64 = btoa(binary)

    try {
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mimeType: 'image/jpeg', metodo_pago: metodoPago }),
      })
      const data = await response.json()
      if (!response.ok) {
        const msg = response.status === 401
          ? 'Sesión expirada. Vuelve a iniciar sesión.'
          : (data.error ?? 'Error desconocido del servidor')
        if (response.status === 401) notify.info(msg); else notify.err(msg)
        setErrorMsg(msg); setEstado('error')
        return
      }
      setTiempoOCR(Math.round((Date.now() - inicio) / 1000))
      setResultado({ ...data, metodo_pago: metodoPago })
      setEstado('verify')
    } catch (err: any) {
      setErrorMsg(err.message ?? 'Error de red'); setEstado('error')
    }
  }

  async function subirImagen(blob: Blob, userId: string): Promise<string | null> {
    try {
      const path = `${userId}/${Date.now()}.jpg`
      const { error } = await supabase.storage.from('tickets').upload(path, blob, { contentType: 'image/jpeg', upsert: false })
      if (error) return null
      return path
    } catch { return null }
  }

  function toISODate(fecha: string): string {
    const dateOnly = fecha.split('T')[0].split(' ')[0].trim()
    const parts = dateOnly.split(/[\/\-]/)
    if (parts.length === 3 && parts[0].length === 2) return `${parts[2]}-${parts[1]}-${parts[0]}`
    return dateOnly
  }

  async function guardar(datos: ResultadoOCR) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setErrorMsg('Sesión expirada.'); setEstado('error'); return }

    // Validación defensiva — el form ya bloquea esto, pero protegemos el INSERT
    if (!datos.comercio?.trim()) {
      notify.err('El nombre del comercio es obligatorio')
      setEstado('verify')
      return
    }
    if (!datos.fecha) {
      notify.err('La fecha es obligatoria')
      setEstado('verify')
      return
    }
    const totalCalculado = datos.items.reduce((s, i) => s + i.cantidad * i.precio, 0)
    if (totalCalculado <= 0 && datos.total <= 0) {
      notify.err('El total no puede ser 0 €')
      setEstado('verify')
      return
    }

    const fechaISO = toISODate(datos.fecha)

    const { data: duplicados } = await supabase
      .from('ticket').select('id')
      .eq('usuario_id', session.user.id).eq('comercio', datos.comercio).eq('fecha', fechaISO).limit(1)

    if (duplicados && duplicados.length > 0) { setDuplicado(true); setEstado('verify'); return }

    setDuplicado(false)
    setEstado('guardando')

    let categoriaId: string | null = null
    try {
      const catResponse = await fetch('/api/categorize', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ comercio: datos.comercio, items: datos.items }),
      })
      if (catResponse.ok) {
        const { categoria } = await catResponse.json()
        const { data: catRow } = await supabase.from('categoria').select('id').eq('nombre', categoria).single()
        categoriaId = catRow?.id ?? null
      }
    } catch { /* degradación suave */ }

    const imagenUrl = ultimaImagenRef.current
      ? await subirImagen(ultimaImagenRef.current, session.user.id)
      : null

    const { data: ticket, error: ticketError } = await supabase
      .from('ticket')
      .insert({
        usuario_id: session.user.id, comercio: datos.comercio, fecha: fechaISO,
        metodo_pago: datos.metodo_pago, verificado: true, json_extraido: datos,
        categoria_id: categoriaId, imagen_url: imagenUrl,
      })
      .select('id').single()

    if (ticketError || !ticket) {
      const msg = ticketError?.code === '23505'
        ? 'Ya existe un ticket igual. Revisa los datos.'
        : 'Error al guardar el ticket. Revisa los datos e inténtalo de nuevo.'
      notify.err(msg); setEstado('verify'); return
    }

    // Filtrar productos con descripción vacía o cantidad inválida antes de insertar
    const itemsValidos = datos.items.filter(i => i.descripcion.trim() && i.cantidad > 0)

    // Agregar líneas duplicadas (mismo descripcion+precio): la UNIQUE en ticket_producto
    // impide dos filas con el mismo (ticket_id, producto_id), así que sumamos cantidades.
    const itemsAgregados = Object.values(
      itemsValidos.reduce<Record<string, ProductoOCR>>((acc, item) => {
        const key = `${item.descripcion.trim().toLowerCase()}|${item.precio}`
        if (acc[key]) acc[key].cantidad += item.cantidad
        else acc[key] = { ...item, descripcion: item.descripcion.trim() }
        return acc
      }, {})
    )

    for (const item of itemsAgregados) {
      const { data: existente } = await supabase
        .from('producto').select('id')
        .ilike('descripcion', item.descripcion).eq('precio_unitario', item.precio).maybeSingle()

      let productoId: string
      if (existente) {
        productoId = existente.id
      } else {
        const { data: nuevo, error: prodError } = await supabase
          .from('producto').insert({ descripcion: item.descripcion, precio_unitario: item.precio }).select('id').single()
        if (prodError || !nuevo) { notify.err('Error al guardar un producto.'); setEstado('verify'); return }
        productoId = nuevo.id
      }

      const { error: tpError } = await supabase.from('ticket_producto').insert({
        ticket_id: ticket.id, producto_id: productoId,
        cantidad: item.cantidad, precio_total: item.cantidad * item.precio,
      })
      if (tpError) { notify.err('Error al asociar un producto al ticket.'); setEstado('verify'); return }
    }

    notify.ok('Ticket guardado correctamente')
    setTicketGuardadoId(ticket.id)
    setEstado('consent')
  }

  function reintentar() {
    if (ultimaImagenRef.current) enviar(ultimaImagenRef.current)
    else setEstado('idle')
  }

  function cancelar() {
    setEstado('idle'); setResultado(null); setErrorMsg(null); setDuplicado(false)
    ultimaImagenRef.current = null
    setImagenPreview(prev => { if (prev) URL.revokeObjectURL(prev); return null })
    setTiempoOCR(null); setTicketGuardadoId(null)
  }

  return (
    <ScanContext.Provider value={{
      estado, resultado, errorMsg, duplicado, imagenPreview, tiempoOCR,
      metodoPago, ticketGuardadoId, setMetodoPago, enviar, guardar, reintentar, cancelar,
    }}>
      {children}
    </ScanContext.Provider>
  )
}

export function useScan(): ScanState {
  const ctx = useContext(ScanContext)
  if (!ctx) throw new Error('useScan must be used inside ScanProvider')
  return ctx
}
