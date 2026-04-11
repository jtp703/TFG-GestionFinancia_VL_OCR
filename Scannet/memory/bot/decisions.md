# Decisiones de arquitectura web

## Stack definitivo [fijo, no proponer alternativas]

- Frontend: React 18 + Vite 5 + Tailwind 3 + React Router 6
- Backend: Vercel Serverless Functions (Node.js) — NO FastAPI, NO Python, NO Express persistente
- BD: Supabase (PostgreSQL + Auth + Storage + RLS por usuario)
- OCR: RunPod Serverless → `Lacax/deepseek_ocr_lora` (NO HF Inference API serverless)
- Categorización: DeepSeek API (módulo separado `/api/categorize.ts`, temperatura 0)
- Deploy: Vercel, rama `Feature-App-Stack` como producción (no `main`)

## Modelo de datos

- Unidad mínima: producto (no ticket). Jerarquía: Usuario → Categoría → Comercio → Ticket → Producto
- `metodo_pago`: siempre lo aporta el usuario, nunca el modelo
- `verificado = true`: solo tras confirmación explícita del usuario en VerifyForm
- Duplicados detectados por (comercio + fecha + total). Al detectar → estado verify con banner, no error
- Categorías fijas v1.0: Alimentación, Transporte, Ocio, Hogar, Salud, Otros

## Patrones de código establecidos

- `useScan`: máquina de estados (idle|loading|verify|error|success) — lógica centralizada en hook
- Canvas oculto para captura: evita dependencias externas de captura
- `formidable` para multipart en Vercel Functions (`bodyParser: false` requerido)
- `window.fetch` explícito en hooks para evitar colisión de nombres
- Colores categoría: `CATEGORY_COLORS` como constante — extraíble a módulo global si crece
- DrillDown: siempre en DOM con translateX, no mount/unmount (animación suave)

## Módulos API — separación estricta

- `scan.ts`: SOLO OCR (recibe imagen, llama RunPod, devuelve JSON ticket)
- `categorize.ts`: SOLO categorización (recibe nombre comercio, devuelve categoría)
- `tickets.ts`: SOLO lectura BD (devuelve tickets+productos+totales del mes en curso)
- Frontend NUNCA llama directamente a RunPod, DeepSeek API ni Supabase service role

## Deploy y entorno

- `vercel dev`: necesario para probar `/api/*` en local (NO `npm run dev` para functions)
- Variables: VITE_* solo en frontend. SUPABASE_SERVICE_ROLE_KEY, RUNPOD_API_KEY, DEEPSEEK_API_KEY solo en Functions
- Bucket `tickets`: privado. URLs firmadas. RLS: `auth.uid()::text = (storage.foldername(name))[1]`
- `USE_MOCK_OCR=false` en producción, `true` para desarrollo sin modelo real

## HuggingFace / RunPod

- HF Inference API serverless: NO funciona (DeepseekOCR2 no soportada, repo privado)
- RunPod Serverless: endpoint `https://api.runpod.ai/v2/{RUNPOD_ENDPOINT_ID}/runsync`
- Body: `{ input: { image: base64puro, mime_type: "image/jpeg" } }`
- Respuesta: `{ status: "COMPLETED", output: { comercio, cif, fecha, total, items } }`
- `pipeline_tag: image-text-to-text` añadido manualmente en model card de HF
