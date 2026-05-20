import { useRef, useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useScan } from '../hooks/useScan'
import type { MetodoPago } from '../hooks/useScan'
import VerifyForm from '../components/VerifyForm'

/** Vista de escaneo de tickets — máquina de estados: idle → loading → verify | error → success */
export function Scan() {
  const navigate    = useNavigate()
  const videoRef    = useRef<HTMLVideoElement>(null)
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [camError, setCamError] = useState<string | null>(null)

  const { estado, resultado, errorMsg, duplicado, imagenPreview, metodoPago, setMetodoPago, enviar, guardar, reintentar, cancelar } = useScan()

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

  // Redirigir a / tras guardar con éxito
  useEffect(() => {
    if (estado === 'success') {
      const t = setTimeout(() => navigate('/'), 1500)
      return () => clearTimeout(t)
    }
  }, [estado, navigate])

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

  if (estado === 'verify' && resultado) {
    return (
      <div className="pb-8 max-w-lg mx-auto">
        {imagenPreview && (
          <div className="w-full overflow-hidden" style={{ maxHeight: '220px', background: '#000' }}>
            <img
              src={imagenPreview}
              alt="Ticket escaneado"
              className="w-full object-contain"
              style={{ maxHeight: '220px' }}
            />
          </div>
        )}
        <div className="p-4">
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Verificar ticket
          </h2>
          <VerifyForm
            inicial={resultado}
            duplicado={duplicado}
            onConfirmar={guardar}
            onCancelar={cancelar}
          />
        </div>
      </div>
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
