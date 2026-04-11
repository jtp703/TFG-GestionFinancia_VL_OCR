# Funcionalidades implementadas en Scannet

## Auth + Onboarding (Fase 3)

- Login/registro email+contraseña vía Supabase Auth
- `useAuth`: sesión con getSession + onAuthStateChange. Expone user, session, loading, signUp, signIn, signOut
- `ProtectedRoute`: spinner mientras carga, redirige a /login si sin sesión
- Onboarding 3 pasos (gasto mensual, ahorro deseado, gastos fijos) — omitibles → null (no "")
- Trigger DB crea `perfil_usuario` automáticamente al registrar (SECURITY DEFINER)

## Navegación (Fase 4)

- Sidebar desktop (64px, sin labels) + BottomNav móvil (56px, con labels 11px)
- AppLayout con Outlet. Rutas protegidas bajo AppLayout, públicas fuera
- `useTheme`: claro/oscuro con localStorage. MutationObserver para sincronizar múltiples instancias

## Gastos — Donut + Drill-down (Fase 5)

- `api/tickets.ts`: autentica con JWT, suma precio_total en servidor, devuelve totales por categoría
- `DonutChart` (Recharts PieChart) + `CategoriaList` + `DrillDown` (siempre en DOM, translateX)
- `getCategoryColor(nombre, isDark)`: colores pastel/eléctrico según tema
- `EmptyState`: CTA "Escanear ticket" → /scan

## Scan + OCR (Fase 6)

- `useScan`: máquina estados `idle | loading | verify | error | success`
- Captura por cámara: getUserMedia + canvas oculto → Blob JPEG
- Captura desde galería: `<input type="file" accept="image/*">` → File (es Blob)
- `api/scan.ts`: formidable para multipart, llama a RunPod Serverless, normaliza unicode, castea tipos
- `VerifyForm`: edición inline (sin borde salvo focus brand), add/delete filas, total recalculado

## Categorización (Fase 7)

- `api/categorize.ts`: DeepSeek API, temperature=0, valida en minúsculas, cae a "Otros" si no encaja
- Degradación suave: si falla categorización, ticket se guarda con `categoria_id = null`
- Módulo separado de scan.ts — nunca mezclar lógica OCR con categorización

## Cuenta (Fase 8)

- Avatar circular con iniciales del email (fondo brand)
- Toggle tema tipo switch (pill) — síncrono en UI, UPDATE Supabase async en background
- Prioridad tema: Supabase > localStorage > prefers-color-scheme
- Modal logout inline (overlay cierra el modal)

## Mejoras pre-deploy (Fase 8.1)

- Bug duplicados corregido: mantiene estado `verify` con `duplicado=true` (no cambia a `error`)
- `duplicado` movido al hook (useScan), no en el componente
- Imagen subida a Supabase Storage: `tickets/{userId}/{timestamp}.jpg` — degradación suave si falla
- `USE_MOCK_OCR=true`: devuelve ticket Mercadona de prueba para probar flujo sin modelo real
- `scan.ts` actualizado: formato `/v1/chat/completions` con imagen base64, normalización unicode
