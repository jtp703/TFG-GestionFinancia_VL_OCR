import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

interface ConsentDialogProps {
  ticketId: string
  onDone:   () => void
}

/** Dialog post-scan que pregunta al usuario si permite usar su ticket para entrenamiento. */
export function ConsentDialog({ ticketId, onDone }: ConsentDialogProps) {
  const [loading, setLoading] = useState(false)

  async function respond(consent: boolean) {
    setLoading(true)
    if (consent) {
      await supabase
        .from('ticket')
        .update({ consentimiento_entrenamiento: true })
        .eq('id', ticketId)
    }
    setLoading(false)
    onDone()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6 space-y-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {/* Icono */}
        <div className="flex justify-center">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-xl"
            style={{ background: 'var(--color-brand)' }}
          >
            🤖
          </div>
        </div>

        {/* Texto */}
        <div className="text-center space-y-2">
          <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            ¿Nos ayudas a mejorar Scannet?
          </p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Tu ticket ha sido guardado correctamente.
            ¿Puedes compartirlo para entrenar el modelo de IA que lee los tickets?
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Los datos se usan solo para entrenamiento interno.
          </p>
        </div>

        {/* Botones */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={() => respond(false)}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm transition-opacity hover:opacity-70 disabled:opacity-40"
            style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}
          >
            No, gracias
          </button>
          <button
            onClick={() => respond(true)}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ background: 'var(--color-brand)', color: '#fff' }}
          >
            {loading ? '…' : 'Sí, contribuir'}
          </button>
        </div>
      </div>
    </div>
  )
}
