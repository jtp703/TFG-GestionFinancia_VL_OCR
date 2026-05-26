import { useRef, useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useScan } from '../hooks/useScan'
import type { MetodoPago } from '../hooks/useScan'
import VerifyForm, { type VerifyFormState } from '../components/VerifyForm'
import { ConsentDialog } from '../components/ConsentDialog'

function toInputDate(f: string): string {
  const dateOnly = f.split('T')[0].split(' ')[0].trim()
  const parts = dateOnly.split('/')
  if (parts.length === 3 && parts[0].length === 2) return `${parts[2]}-${parts[1]}-${parts[0]}`
  return dateOnly
}

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.85)' }}
      onClick={onClose}
    >
      <img
        src={src}
        alt="Ticket ampliado"
        className="max-w-[92vw] max-h-[92vh] object-contain rounded-lg"
        onClick={e => e.stopPropagation()}
      />
      <button
        className="absolute top-4 right-4 text-white text-2xl leading-none"
        onClick={onClose}
        aria-label="Cerrar"
      >×</button>
    </div>
  )
}

/** Vista de escaneo de tickets — máquina de estados: idle → loading → verify | error → success */
export function Scan() {
  const navigate    = useNavigate()
  const videoRef    = useRef<HTMLVideoElement>(null)
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [camError, setCamError] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState(false)
  const [panelActivo, setPanelActivo] = useState(0)
  const carouselRef = useRef<HTMLDivElement>(null)

  const { estado, resultado, errorMsg, duplicado, imagenPreview, tiempoOCR, metodoPago, ticketGuardadoId, setMetodoPago, enviar, guardar, reintentar, cancelar } = useScan()

  // Estado del formulario de verificación elevado al padre para que ambos VerifyForm
  // (móvil y escritorio) compartan los cambios y no se pierdan al cruzar el breakpoint.
  const [verifyState, setVerifyState] = useState<VerifyFormState | null>(null)
  useEffect(() => {
    if (resultado) {
      setVerifyState({
        comercio: resultado.comercio,
        fecha:    toInputDate(resultado.fecha),
        metodo:   resultado.metodo_pago,
        items:    resultado.items,
      })
    } else {
      setVerifyState(null)
    }
  }, [resultado])

  // Iniciar cámara al montar (solo en estado idle)
  const startCamera = useCallback(async () => {
    setCamError(null)
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
      })
      setStream(s)
      if (videoRef.current) {
        videoRef.current.srcObject = s
      }
    } catch {
      setCamError('No se pudo acceder a la cámara. Comprueba los permisos.')
    }
  }, [])

  useEffect(() => {
    if (estado === 'idle') startCamera()
    // Detener stream al salir de idle
    return () => {
      if (estado !== 'idle' && stream) {
        stream.getTracks().forEach(t => t.stop())
      }
    }
  }, [estado]) // eslint-disable-line react-hooks/exhaustive-deps

  // Detener cámara al desmontar el componente
  useEffect(() => {
    return () => {
      stream?.getTracks().forEach(t => t.stop())
    }
  }, [stream])

  // Redirigir a / tras guardar (estado success ya no se usa, pero se mantiene por seguridad)
  useEffect(() => {
    if (estado === 'success') {
      const t = setTimeout(() => { cancelar(); navigate('/') }, 1500)
      return () => clearTimeout(t)
    }
  }, [estado, navigate]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Captura un frame del video y lo envía como Blob */
  function capturar() {
    const video  = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    canvas.width  = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)

    canvas.toBlob(blob => {
      if (blob) {
        stream?.getTracks().forEach(t => t.stop())
        enviar(blob)
      }
    }, 'image/jpeg', 0.92)
  }

  /** Selección de imagen desde galería/explorador */
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) enviar(file)
    e.target.value = ''   // permite re-seleccionar el mismo archivo
  }

  // --- Render por estado ---

  if (estado === 'consent' && ticketGuardadoId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-6"
        style={{ color: 'var(--text-primary)' }}>
        <div className="text-5xl">✓</div>
        <p className="text-lg font-medium">Ticket guardado</p>
        <ConsentDialog
          ticketId={ticketGuardadoId}
          onDone={() => { cancelar(); navigate('/') }}
        />
      </div>
    )
  }

  if (estado === 'success') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-6"
        style={{ color: 'var(--text-primary)' }}>
        <div className="text-5xl">✓</div>
        <p className="text-lg font-medium">Ticket guardado</p>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Volviendo a gastos…</p>
      </div>
    )
  }

  if (estado === 'verify' && resultado && verifyState) {
    return (
      <>
        {lightbox && imagenPreview && (
          <Lightbox src={imagenPreview} onClose={() => setLightbox(false)} />
        )}

        {/* ── Escritorio (md+): imagen izquierda · formulario derecha ── */}
        <div className="hidden md:flex h-full">
          {/* Columna imagen — scrollable junto al form, click para ampliar */}
          {imagenPreview && (
            <div
              className="w-[38%] flex-shrink-0 flex flex-col items-center justify-start p-4 overflow-y-auto cursor-zoom-in"
              style={{ background: '#000', borderRight: '1px solid var(--border)' }}
              onClick={() => setLightbox(true)}
              title="Clic para ampliar"
            >
              <img
                src={imagenPreview}
                alt="Ticket escaneado"
                className="w-full object-contain rounded"
                style={{ maxHeight: '80vh' }}
              />
              <p className="text-xs mt-2 opacity-50 select-none" style={{ color: '#fff' }}>
                Clic para ampliar
              </p>
            </div>
          )}

          {/* Columna formulario — scrollable */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="flex items-baseline gap-3 mb-4">
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                Verificar ticket
              </h2>
              {tiempoOCR !== null && (
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Procesado en {tiempoOCR}s
                </span>
              )}
            </div>
            <VerifyForm
              inicial={resultado}
              duplicado={duplicado}
              state={verifyState}
              setState={setVerifyState as React.Dispatch<React.SetStateAction<VerifyFormState>>}
              onConfirmar={guardar}
              onCancelar={cancelar}
            />
          </div>
        </div>

        {/* ── Móvil: carrusel horizontal con scroll-snap ── */}
        <div className="md:hidden flex flex-col" style={{ height: 'calc(100dvh - 64px - env(safe-area-inset-bottom, 8px))' }}>
          <div
            ref={carouselRef}
            className="flex flex-1 overflow-x-auto overflow-y-hidden"
            style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
            onScroll={e => {
              const el = e.currentTarget
              setPanelActivo(el.scrollLeft > el.clientWidth / 2 ? 1 : 0)
            }}
          >
            {/* Panel izquierda: imagen */}
            <div className="flex-shrink-0 w-full flex flex-col" style={{ scrollSnapAlign: 'start' }}>
              {imagenPreview
                ? (
                  <div className="flex flex-col h-full">
                    <div className="flex-1 flex items-center justify-center overflow-hidden" style={{ background: '#000' }}>
                      <img
                        src={imagenPreview}
                        alt="Ticket escaneado"
                        className="w-full object-contain"
                        style={{ maxHeight: '70dvh' }}
                      />
                    </div>
                  </div>
                )
                : (
                  <div className="flex items-center justify-center h-40" style={{ background: 'var(--bg)' }}>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Sin imagen</p>
                  </div>
                )
              }
            </div>

            {/* Panel derecha: formulario */}
            <div className="flex-shrink-0 w-full overflow-y-auto p-4 pb-8" style={{ scrollSnapAlign: 'start' }}>
              <div className="flex items-baseline gap-3 mb-4">
                <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Verificar ticket
                </h2>
                {tiempoOCR !== null && (
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Procesado en {tiempoOCR}s
                  </span>
                )}
              </div>
              <VerifyForm
                inicial={resultado}
                duplicado={duplicado}
                state={verifyState}
                setState={setVerifyState as React.Dispatch<React.SetStateAction<VerifyFormState>>}
                onConfirmar={guardar}
                onCancelar={cancelar}
              />
            </div>
          </div>

          {/* Dots indicadores */}
          <div className="flex justify-center gap-2 py-2" style={{ background: 'var(--bg)' }}>
            {[0, 1].map(i => (
              <button
                key={i}
                aria-label={i === 0 ? 'Imagen' : 'Formulario'}
                onClick={() => {
                  carouselRef.current?.scrollTo({ left: i * carouselRef.current.clientWidth, behavior: 'smooth' })
                }}
                className="rounded-full transition-all"
                style={{
                  width: panelActivo === i ? '20px' : '8px',
                  height: '8px',
                  background: panelActivo === i ? 'var(--color-brand)' : 'var(--border)',
                }}
              />
            ))}
          </div>
        </div>
      </>
    )
  }

  if (estado === 'error') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-5 p-6 text-center"
        style={{ color: 'var(--text-primary)' }}>
        <div className="text-4xl">✕</div>
        <p className="font-medium">Error al procesar el ticket</p>
        <p className="text-sm max-w-xs" style={{ color: 'var(--text-muted)' }}>
          {errorMsg ?? 'Algo salió mal. Inténtalo de nuevo.'}
        </p>
        <div className="flex gap-3 w-full max-w-xs">
          <button onClick={cancelar}
            className="flex-1 py-2.5 rounded-xl text-sm transition-opacity hover:opacity-70"
            style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            Cancelar
          </button>
          <button onClick={reintentar}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
            style={{ background: 'var(--color-brand)', color: '#fff' }}>
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  if (estado === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4"
        style={{ color: 'var(--text-muted)' }}>
        <div className="w-10 h-10 rounded-full border-4 animate-spin"
          style={{ borderColor: 'var(--color-brand)', borderTopColor: 'transparent' }} />
        <p className="text-sm">Procesando ticket…</p>
      </div>
    )
  }

  if (estado === 'guardando') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4"
        style={{ color: 'var(--text-muted)' }}>
        <div className="w-10 h-10 rounded-full border-4 animate-spin"
          style={{ borderColor: 'var(--color-brand)', borderTopColor: 'transparent' }} />
        <p className="text-sm">Guardando ticket…</p>
      </div>
    )
  }

  // Estado IDLE — visor de cámara
  return (
    <div
      className="flex flex-col"
      style={{
        color: 'var(--text-primary)',
        height: 'calc(100dvh - 64px - env(safe-area-inset-bottom, 8px))',
      }}
    >
      {/* Visor */}
      <div className="relative bg-black overflow-hidden" style={{ flex: '1 1 0', minHeight: 0 }}>
        {camError ? (
          <div className="flex items-center justify-center h-full px-6 text-center text-white text-sm">
            {camError}
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        )}
        {/* Marco de encuadre */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-64 h-96 rounded-2xl"
            style={{ border: '2px solid rgba(255,255,255,0.6)', boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)' }} />
        </div>
      </div>

      {/* Controles inferiores */}
      <div className="p-5 space-y-4" style={{ background: 'var(--bg)' }}>
        {/* Toggle método de pago */}
        <div className="flex items-center justify-center gap-3">
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Método de pago</span>
          <div className="inline-flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {(['efectivo', 'tarjeta'] as MetodoPago[]).map(m => (
              <button
                key={m}
                onClick={() => setMetodoPago(m)}
                className="px-4 py-1.5 text-sm capitalize transition-colors"
                style={{
                  background: metodoPago === m ? 'var(--color-brand)' : 'var(--surface)',
                  color: metodoPago === m ? '#fff' : 'var(--text-primary)',
                }}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Botón de captura + subir imagen */}
        <div className="flex items-center justify-center gap-6">
          {/* Subir desde galería */}
          <label
            className="flex flex-col items-center gap-1 cursor-pointer transition-opacity hover:opacity-70"
            style={{ color: 'var(--text-muted)' }}
          >
            <div className="w-11 h-11 rounded-full flex items-center justify-center"
              style={{ border: '1.5px solid var(--border)', background: 'var(--surface)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <span className="text-xs">Galería</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>

          {/* Capturar con cámara */}
          <button
            onClick={capturar}
            disabled={!!camError}
            className="w-16 h-16 rounded-full flex items-center justify-center transition-opacity disabled:opacity-40"
            style={{ background: 'var(--color-brand)' }}
            aria-label="Escanear ticket"
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Canvas oculto para captura de cámara */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}
