# Funcionalidades implementadas en Scannet

## Auth + Onboarding (Fase 3 + mejoras Fase 9)

- Login/registro email+contraseña vía Supabase Auth
- `useAuth`: sesión con getSession + onAuthStateChange. Expone user, session, loading, signUp, signIn, signOut
- `ProtectedRoute`: spinner mientras carga, redirige a /login si sin sesión, redirige a /onboarding si `gasto_mensual_estimado` es null
- Onboarding 3 pasos (gasto mensual, ahorro deseado, gastos fijos) — errores no silenciosos, bloquea navegación si falla
- Trigger DB crea `perfil_usuario` automáticamente al registrar (SECURITY DEFINER)
- Sesión expirada: toast informativo + estado error (no pantalla en blanco)
- Login: diferencia "Credenciales incorrectas" (400) vs "Error del servidor"

## Navegación (Fase 4)

- Sidebar desktop (64px, sin labels) + BottomNav móvil (56px, con labels 11px)
- AppLayout con Outlet. Rutas protegidas bajo AppLayout, públicas fuera
- `useTheme`: claro/oscuro con localStorage. MutationObserver para sincronizar múltiples instancias

## Gastos — Donut + Drill-down (Fase 5)

- `api/tickets.ts`: autentica con JWT, suma precio_total en servidor, devuelve totales por categoría
- `DonutChart` (Recharts PieChart) + `CategoriaList` + `DrillDown` (siempre en DOM, translateX)
- `getCategoryColor(nombre, isDark)`: colores pastel/eléctrico según tema
- `EmptyState`: CTA "Escanear ticket" → /scan

## Gastos Fijos (Fase 8 + mejoras Fase 9)

- CRUD completo en panel lateral/bottom sheet
- `useGastosFijos`: notify.ok/err en crear, actualizar y eliminar
- `GastosFijosModal`: botones `disabled` durante operación, `window.confirm` antes de eliminar

## Scan + OCR (Fases 6, 8.1, 9)

### Captura
- Captura por cámara: getUserMedia (facingMode environment) + canvas oculto → Blob JPEG
- Captura desde galería: `<input type="file" accept="image/*">` → File
- Compresión antes de enviar: máx 1200px, quality 0.82

### Pipeline API
- `api/scan.ts`: OCR.space Engine 2 (español) → DeepSeek chat (temperature 0, JSON only)
- Rate limit: 10 escaneos/min por usuario
- AbortController 30s timeout en llamadas externas
- Schema mínimo: comercio + total requeridos → 422 si faltan
- Modo mock: `USE_MOCK_OCR=true` → ticket Mercadona sin llamar a ninguna API

### Estado global del scan
- `ScanContext` (`src/context/ScanContext.tsx`): React Context global, persiste entre navegaciones
- `useScan.ts` → re-export de ScanContext
- `ScanProvider` en `App.tsx` envuelve todo el árbol
- Máquina de estados: `idle | loading | verify | guardando | error | success`
- `tiempoOCR`: segundos que tardó el modelo, mostrado en header de verify

### UX verify
- **Escritorio:** imagen 38% (click-to-zoom lightbox overlay) + formulario 60% scrollable
- **Móvil:** carrusel scroll-snap horizontal con dots indicadores (pill animado, clickables)
- Dialog de confirmación antes de guardar (muestra comercio, fecha, método, total)
- Errores de guardado → vuelven a `verify` con datos intactos (no relanza OCR)
- Timer: "Procesado en Xs" junto al título

### Validación (VerifyForm + ScanContext)
- Capa 1 (UX): comercio no vacío, fecha no vacía, total > 0, items con descripción, cantidades > 0
- Campos inválidos: borde rojo + label con "— obligatorio/a"
- Capa 2 (defensa): validación antes del INSERT en ScanContext.guardar()
- Items sin descripción o cantidad ≤ 0 filtrados antes de insertar en BD

### Guardado
- `api/categorize.ts`: DeepSeek API, degradación suave si falla (categoria_id = null)
- Imagen subida a Supabase Storage: `tickets/{userId}/{timestamp}.jpg`
- Deduplicación de productos por (descripcion ilike + precio_unitario)
- Duplicados de ticket detectados por (comercio + fecha) → banner en verify, no error
- `notify.ok('Ticket guardado correctamente')` al éxito

## Cuenta (Fase 8)

- Avatar circular con iniciales del email (fondo brand)
- Toggle tema tipo switch (pill) — síncrono en UI, UPDATE Supabase async
- Prioridad tema: Supabase > localStorage > prefers-color-scheme
- Modal logout inline (overlay cierra el modal)

## Feedback global (Fase 9 — Foundation)

- `sonner` toast library. `src/lib/toast.ts`: notify.ok/err/info/loading/dismiss
- `<Toaster position="bottom-center" richColors closeButton />` en App.tsx
- Todas las operaciones async con feedback: crear, editar, eliminar gasto fijo; guardar ticket; errores de red/sesión

## Tests E2E (Fase 9 — Playwright)

- `playwright.config.ts`: Chromium, baseURL localhost:5173, reuseExistingServer, retries: 1
- `e2e/auth.spec.ts`: login error, doble-click protegido, ruta protegida, login correcto
- `e2e/scan.spec.ts`: carga, toggle método de pago, upload imagen mock
- `e2e/gastosFijos.spec.ts`: viewport iPhone 14, abrir panel, crear con toast, eliminar con dialog
- `e2e/home.spec.ts`: viewport móvil, nav links, donut o empty state
- Scripts: `npm run test:e2e`, `npm run test:e2e:ui`, `npm run test:e2e:report`
- Vars de entorno: `E2E_TEST_EMAIL`, `E2E_TEST_PASSWORD`
