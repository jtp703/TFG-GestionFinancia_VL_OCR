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
  estado:        Estado
  resultado:     ResultadoOCR | null
  errorMsg:      string | null
  duplicado:     boolean
  metodoPago:    MetodoPago
  setMetodoPago: (m: MetodoPago) => void
  enviar:        (imageBlob: Blob) => Promise<void>
  guardar:       (datos: ResultadoOCR) => Promise<void>
  reintentar:    () => void
  cancelar:      () => void
}

/** Redimensiona y comprime una imagen a máx 1200px y calidad 0.8 para no superar el límite de OCR.space (1MB). */
async function comprimirImagen(blob: Blob, maxPx = 1200, quality = 0.82): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(blob)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale     = Math.min(1, maxPx / Math.max(img.width, img.height))
      const canvas    = document.createElement('canvas')
      canvas.width    = Math.round(img.width  * scale)
      canvas.height   = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(result => resolve(result ?? blob), 'image/jpeg', quality)
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(blob) }
    img.src = url
  })
}

export function useScan(): UseScanReturn {
  const [estado, setEstado]             = useState<Estado>('idle')
  const [resultado, setResultado]       = useState<ResultadoOCR | null>(null)
  const [errorMsg, setErrorMsg]         = useState<string | null>(null)
  const [duplicado, setDuplicado]       = useState(false)
  const [metodoPago, setMetodoPago]     = useState<MetodoPago>('efectivo')
  const [ultimaImagen, setUltimaImagen] = useState<Blob | null>(null)

  /** Envía la imagen al endpoint /api/scan (o devuelve mock si VITE_USE_MOCK_OCR=true) */
  async function enviar(imageBlob: Blob) {
    setUltimaImagen(imageBlob)
    setEstado('loading')
    setErrorMsg(null)
    setDuplicado(false)

    // Mock frontend — no necesita vercel dev ni conexión al modelo
    if (import.meta.env.VITE_USE_MOCK_OCR === 'true') {
      await new Promise(r => setTimeout(r, 800)) // simula latencia
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
      setEstado('verify')
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
      setErrorMsg('Sesión expirada. Vuelve a iniciar sesión.')
      setEstado('error')
      return
    }

    // Comprimir imagen (máx 1200px, calidad 0.82) antes de enviar — evita superar el límite de OCR.space
    const blobComprimido = await comprimirImagen(imageBlob)

    // Convertir blob a base64 en chunks para evitar stack overflow con imágenes grandes
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
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image:       base64,
          mimeType:    'image/jpeg',   // siempre JPEG tras la compresión
          metodo_pago: metodoPago,
        }),
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

  /** Sube la imagen a Supabase Storage y devuelve el path, o null si falla.
   *  Se guarda el path (no la URL) porque el bucket es privado.
   *  Para mostrar la imagen usar createSignedUrl(path, segundos). */
  async function subirImagen(blob: Blob, userId: string): Promise<string | null> {
    try {
      const path = `${userId}/${Date.now()}.jpg`
      const { error } = await supabase.storage
        .from('tickets')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: false })
      if (error) return null
      return path
    } catch {
      return null
    }
  }

  /** Convierte fecha a YYYY-MM-DD para Supabase.
   *  Acepta: DD/MM/YYYY, DD/MM/YYYY HH:mm:ss, YYYY-MM-DD, YYYY-MM-DDTHH:mm:ss */
  function toISODate(fecha: string): string {
    const dateOnly = fecha.split('T')[0].split(' ')[0].trim()
    const parts = dateOnly.split('/')
    if (parts.length === 3 && parts[0].length === 2) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`
    }
    return dateOnly
  }

  /** Guarda el ticket verificado en Supabase */
  async function guardar(datos: ResultadoOCR) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setErrorMsg('Sesión expirada.')
      setEstado('error')
      return
    }

    const fechaISO = toISODate(datos.fecha)

    // Detectar duplicado por comercio + fecha (total no está en el schema)
    const { data: duplicados } = await supabase
      .from('ticket')
      .select('id')
      .eq('usuario_id', session.user.id)
      .eq('comercio', datos.comercio)
      .eq('fecha', fechaISO)
      .limit(1)

    if (duplicados && duplicados.length > 0) {
      setDuplicado(true)
      setEstado('verify')   // se queda en verify con el banner de aviso
      return
    }

    setDuplicado(false)

    // Categorizar el comercio vía DeepSeek (degradación suave si falla)
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
      // Fallo silencioso — el ticket se guarda sin categoría
    }

    // Subir imagen a Supabase Storage (degradación suave si falla)
    const imagenUrl = ultimaImagen
      ? await subirImagen(ultimaImagen, session.user.id)
      : null

    // Insertar ticket
    const { data: ticket, error: ticketError } = await supabase
      .from('ticket')
      .insert({
        usuario_id:    session.user.id,
        comercio:      datos.comercio,
        fecha:         fechaISO,
        metodo_pago:   datos.metodo_pago,
        verificado:    true,
        json_extraido: datos,
        categoria_id:  categoriaId,
        imagen_url:    imagenUrl,
      })
      .select('id')
      .single()

    if (ticketError || !ticket) {
      setErrorMsg(ticketError?.message ?? 'Error al guardar el ticket')
      setEstado('error')
      return
    }

    // Insertar productos con deduplicación por (descripcion, precio_unitario)
    for (const item of datos.items) {
      // Buscar si ya existe un producto con mismo nombre (case-insensitive) y precio
      const { data: existente } = await supabase
        .from('producto')
        .select('id')
        .ilike('descripcion', item.descripcion)
        .eq('precio_unitario', item.precio)
        .maybeSingle()

      let productoId: string

      if (existente) {
        // Reutilizar el producto ya existente en el catálogo
        productoId = existente.id
      } else {
        // Crear nuevo producto en el catálogo
        const { data: nuevo, error: prodError } = await supabase
          .from('producto')
          .insert({ descripcion: item.descripcion, precio_unitario: item.precio })
          .select('id')
          .single()

        if (prodError || !nuevo) {
          setErrorMsg(prodError?.message ?? 'Error al guardar producto')
          setEstado('error')
          return
        }
        productoId = nuevo.id
      }

      // Asociar producto al ticket con cantidad y precio_total
      const { error: tpError } = await supabase
        .from('ticket_producto')
        .insert({
          ticket_id:    ticket.id,
          producto_id:  productoId,
          cantidad:     item.cantidad,
          precio_total: item.cantidad * item.precio,
        })

      if (tpError) {
        setErrorMsg(tpError.message)
        setEstado('error')
        return
      }
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
    setDuplicado(false)
    setUltimaImagen(null)
  }

  return { estado, resultado, errorMsg, duplicado, metodoPago, setMetodoPago, enviar, guardar, reintentar, cancelar }
}
