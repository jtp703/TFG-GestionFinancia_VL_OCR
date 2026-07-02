# Decisiones de arquitectura web

## Stack definitivo [fijo, no proponer alternativas]

- Frontend: React 18 + Vite 5 + Tailwind 3 + React Router 6
- Backend: Vercel Serverless Functions (Node.js) — NO FastAPI, NO Python, NO Express persistente
- BD: Supabase (PostgreSQL + Auth + Storage + RLS por usuario)
- OCR: **OCR.space** (extracción texto) → **DeepSeek chat** (parseo JSON). RunPod descartado definitivamente.
- Categorización: DeepSeek API (módulo separado `/api/categorize.ts`, temperatura 0)
- Deploy: Vercel, rama `Feature-App-Stack-V6` como producción (no `main`)
- Toasts: `sonner` + wrapper `src/lib/toast.ts` (notify.ok/err/info/loading)
- Tests E2E: Playwright, directorio `e2e/`, script `npm run test:e2e`

## Modelo de datos

- Unidad mínima: producto (no ticket). Jerarquía: Usuario → Categoría → Comercio → Ticket → Producto
- `metodo_pago`: siempre lo aporta el usuario, nunca el modelo
- `verificado = true`: solo tras confirmación explícita del usuario en VerifyForm
- Duplicados detectados por (comercio + fecha). Al detectar → estado verify con banner, no error
- Categorías fijas v1.0: Alimentación, Transporte, Ocio, Hogar, Salud, Otros

## Patrones de código establecidos

- **ScanContext** (`src/context/ScanContext.tsx`): todo el estado del scan vive en React Context global, NO en el componente Scan. Persiste entre navegaciones. `useScan.ts` es un re-export del context.
- Máquina de estados scan: `idle | loading | verify | guardando | error | success`
- `ultimaImagen` se guarda con `useRef` en ScanContext (no useState) para no causar re-renders
- Errores en `guardar()` → siempre `setEstado('verify')`, nunca `'error'` (datos intactos, no relanza OCR)
- Canvas oculto para captura: evita dependencias externas de captura
- `formidable` eliminado — scan usa JSON con base64 (no multipart)
- Colores categoría: `CATEGORY_COLORS` como constante — extraíble a módulo global si crece
- DrillDown: siempre en DOM con translateX, no mount/unmount (animación suave)

## Validación de datos (pipeline scan)

Dos capas de validación:
1. **VerifyForm** (UX): valida antes de mostrar el dialog de confirmación. Campos: comercio no vacío, fecha no vacía, total > 0, todos los items con descripción, cantidades > 0. Campos inválidos con borde rojo + label "— obligatorio/a".
2. **ScanContext `guardar()`** (defensa): re-valida comercio, fecha y total antes del INSERT. Filtra items sin descripción o con cantidad ≤ 0 antes del bucle de inserción.

## Módulos API — separación estricta

- `scan.ts`: SOLO OCR (OCR.space → DeepSeek chat → JSON ticket). Rate limit 10/min.
- `categorize.ts`: SOLO categorización (recibe nombre comercio, devuelve categoría). Rate limit 30/min.
- `tickets.ts`: SOLO lectura BD (devuelve tickets+productos+totales del mes en curso)
- `_lib/rateLimit.ts`: Map en memoria por user.id, ventana 60s
- Frontend NUNCA llama directamente a OCR.space, DeepSeek API ni Supabase service role

## Deploy y entorno

- `vercel dev`: necesario para probar `/api/*` en local (NO `npm run dev` para functions)
- Variables: VITE_* solo en frontend. SUPABASE_SERVICE_ROLE_KEY, OCR_SPACE_API_KEY, DEEPSEEK_API_KEY solo en Functions
- Bucket `tickets`: privado. Paths (no URLs). Para mostrar imagen usar `createSignedUrl(path, segundos)`.
- RLS Storage: `(bucket_id = 'tickets') AND (auth.uid()::text = (storage.foldername(name))[1])`
- `VITE_USE_MOCK_OCR=true`: devuelve ticket Mercadona de prueba sin llamar a ninguna API
- Imagen comprimida antes de enviar: máx 1200px, quality 0.82 (evita límite 1MB de OCR.space)

## UX Scan — layout verify

- **Escritorio (md+):** columna imagen 38% (click abre lightbox fullscreen) + columna formulario 60% scrollable
- **Móvil:** carrusel scroll-snap horizontal. Panel 0: imagen. Panel 1: formulario. Dots indicadores abajo (pill animado que se expande en el activo, clickables para navegar).
- Dialog de confirmación antes de guardar: muestra comercio, fecha, método y total
- Timer: `tiempoOCR` en context, se muestra "Procesado en Xs" en el header de verify

## Admin y consentimiento (2026-05-25)

- **Role en BD**: `perfil_usuario.role TEXT DEFAULT 'user'`. Valores: `'user' | 'admin'`. Sin tabla roles separada (MVP).
- **Seguridad admin**: rutas `api/admin/*.ts` usan `SUPABASE_SERVICE_ROLE_KEY` (bypass RLS). Doble check: Bearer token válido + `role='admin'` en BD. El frontend NUNCA accede a datos de otros usuarios.
- **Consentimiento en ticket**: `ticket.consentimiento_entrenamiento BOOLEAN DEFAULT NULL`. `null`=no respondido, `true`=acepta. El dialog no setea `false` — rechazar deja `null` (privacidad por defecto).
- **Export JSONL**: incluye `image_url` (signed URL 7 días), `image_path` (ruta storage), `ground_truth` (JSON stringificado). Filtro `onlyConsented=true` por defecto.
- **ConsentDialog**: aparece en estado `consent` de la máquina de estados scan, antes del redirect. El usuario siempre puede responder "No, gracias" sin penalización.
- **Layout admin en Cuenta**: `max-w-4xl mx-auto` separado del `max-w-sm` de ajustes de cuenta (la tabla de tickets necesita ancho).

## Seguridad API

- Rate limiting en memoria (Map): suficiente para Vercel serverless individual, no distribuido
- AbortController 30s en todas las llamadas externas (OCR.space, DeepSeek)
- Errores internos: `console.error` en servidor, mensaje genérico al cliente
- Schema mínimo OCR: `comercio` y `total` requeridos → 422 si el modelo no los extrae
