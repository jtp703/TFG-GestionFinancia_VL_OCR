# Progreso del dominio web — Scannet

## Fases completadas

| Fase | Nombre | Estado |
|------|--------|--------|
| 1 | Setup (package.json, tsconfig, vite, tailwind, vercel.json, .env) | ✅ |
| 2 | BD (schema.sql, 4 tablas, RLS, trigger perfil_usuario, 6 categorías) | ✅ |
| 3 | Auth (useAuth, ProtectedRoute, Login, Registro, Onboarding 3 pasos) | ✅ |
| 4 | Nav (AppLayout, BottomNav, Sidebar, useTheme localStorage) | ✅ |
| 5 | Gastos (api/tickets.ts, useTickets, DonutChart, CategoriaList, DrillDown) | ✅ |
| 6 | Scan (api/scan.ts, useScan, VerifyForm, Scan.tsx — cámara + galería) | ✅ |
| 7 | Categorización (api/categorize.ts, integración useScan) | ✅ |
| 8 | Cuenta (Cuenta.tsx, useTheme Supabase, logout modal) | ✅ |
| 8.1 | Pre-deploy: bug duplicados, galería, imagen_url Storage, USE_MOCK_OCR | ✅ |
| 9 | Pipeline completo impoluto (Fases A–G) | ✅ 2026-05-20 |

## Fase 9 — detalle de lo completado (2026-05-20)

### A — Foundation
- `sonner` instalado. `<Toaster>` en App.tsx. `src/lib/toast.ts` (notify.ok/err/info/loading)
- `VerifyForm` con estado `guardando` + `disabled` en botón durante operación async

### B — Auth
- `ProtectedRoute` consulta `perfil_usuario.gasto_mensual_estimado` → redirige a `/onboarding` si null
- `Login.tsx`: toast de error diferenciando credenciales incorrectas vs error servidor
- `Onboarding.tsx`: errores no silenciosos → toast + bloqueo de navegación si falla
- Sesión expirada: `notify.info()` + `setEstado('error')` en useScan; 401 de API también notificado

### C — Scan UX
- Estado `'guardando'` en máquina de estados (spinner "Guardando ticket…" en Scan.tsx)
- `notify.ok('Ticket guardado correctamente')` al éxito
- Errores de guardado → `setEstado('verify')` en lugar de `'error'` (datos intactos, sin relanzar OCR)
- VerifyForm scroll automático al montar
- Dialog de confirmación "¿Todo es correcto?" antes de guardar
- Layout escritorio: imagen izquierda (38%, click-to-zoom lightbox) + formulario derecha
- Layout móvil: carrusel scroll-snap + dots indicadores (pill animado, clickables)
- Timer OCR: `tiempoOCR` en estado, "Procesado en Xs" en header de verify
- Bloqueo de guardado si total = 0 €
- Validación completa en VerifyForm: comercio, fecha, items con descripción, cantidades > 0
- Campos inválidos resaltados con borde rojo + label "— obligatorio/a"
- Validación defensiva en `guardar()` del context antes del INSERT

### D — Gastos Fijos
- `useGastosFijos`: notify.ok/err en crear, actualizar y eliminar
- `GastosFijosModal`: `disabled` en botones durante operación + `window.confirm` antes de eliminar

### E — Seguridad API
- `api/_lib/rateLimit.ts`: Map en memoria, 10 req/min en `/api/scan`, 30/min en `/api/categorize`
- `fetchWithTimeout` (AbortController 30s) en scan.ts y categorize.ts
- Errores internos saneados: solo mensajes genéricos al cliente, detalles en `console.error`
- Validación schema OCR: `comercio` y `total` requeridos → 422 si faltan

### F — Tests E2E
- Playwright instalado. `playwright.config.ts` con webServer (reuseExistingServer)
- `e2e/auth.spec.ts`: login error, doble-click, ruta protegida, login correcto
- `e2e/scan.spec.ts`: carga página, toggle método, upload mock (skip si no mock)
- `e2e/gastosFijos.spec.ts`: abrir panel, crear con toast, eliminar con dialog
- `e2e/home.spec.ts`: nav visible móvil, links, donut o empty state

### G — Limpieza
- `.env.example`: eliminadas HF_API_TOKEN, HF_MODEL_ID, RUNPOD_API_KEY, NOTION_TOKEN, DOCKER_TOKEN, GEMINI_API_KEY
- Código HF/RunPod/Florence-2: solo presente en docs, no en código activo

### Arquitectura nueva — ScanContext (2026-05-20)
- `src/context/ScanContext.tsx`: todo el estado de scan migrado a React Context global
- `useScan.ts` → re-export de ScanContext (compatibilidad total con imports existentes)
- `App.tsx`: `<ScanProvider>` envuelve el router → estado persiste entre navegaciones
- `ultimaImagen` usa `useRef` (no `useState`) para no causar re-renders innecesarios
- Al guardar con éxito: `cancelar()` limpia el context antes de navegar a `/`

## Bugs corregidos

- [sin fecha] MutationObserver en useTheme: colores donut no se actualizaban al cambiar tema
- 2026-04-11 Bug duplicados: `setEstado('error')` → mantener `verify` con flag `duplicado=true`
- 2026-04-11 `huggingface_hub` pin incompatible con transformers
- 2026-05-20 Ticket sin nombre guardado: faltaba validación de campos obligatorios en VerifyForm
- 2026-05-20 Estado scan perdido al cambiar de pestaña: migrado a Context global (ScanContext)
- 2026-05-20 Doble click en "Confirmar": estado `guardando` + `disabled` + dialog intermedio
- 2026-05-20 Error DB relanzaba OCR: errores en `guardar()` vuelven a `verify`, no a `error`

## Errores conocidos (no bloqueantes)

- `vercel dev` sin `.env.local`: "supabaseUrl is required" → normal, necesita variables de entorno
- `/api/categorize 500` con `npm run dev`: usar `vercel dev` para probar functions
- React Router v6 deprecation warnings: no crítico para v1.0
