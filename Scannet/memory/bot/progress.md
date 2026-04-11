# Progreso del dominio web — Scannet

## Fases completadas

| Fase | Nombre | Estado |
|------|--------|--------|
| 1 | Setup (package.json, tsconfig, vite, tailwind, vercel.json, .env) | ✅ |
| 2 | BD (schema.sql, 4 tablas, RLS, trigger perfil_usuario, 6 categorías) | ✅ |
| 3 | Auth (useAuth, ProtectedRoute, Login, Registro, Onboarding 3 pasos) | ✅ |
| 4 | Nav (AppLayout, BottomNav, Sidebar, useTheme localStorage) | ✅ |
| 5 | Gastos (api/tickets.ts, useTickets, DonutChart, CategoriaList, DrillDown, colores adaptativos) | ✅ |
| 6 | Scan (api/scan.ts, useScan, VerifyForm, Scan.tsx — cámara + galería) | ✅ |
| 7 | Categorización (api/categorize.ts, integración useScan, fix MutationObserver useTheme) | ✅ |
| 8 | Cuenta (Cuenta.tsx, useTheme Supabase, eliminado toggle AppLayout) | ✅ |
| 8.1 | Pre-deploy: bug duplicados, galería, imagen_url Storage, USE_MOCK_OCR, scan.ts RunPod | ✅ |
| 9 | QA y Deploy | ❌ Pendiente |

## Bugs corregidos

- [sin fecha] MutationObserver en useTheme: colores donut no se actualizaban al cambiar tema
- 2026-04-11 Bug duplicados: `setEstado('error')` → mantener `verify` con flag `duplicado=true`
- 2026-04-11 `huggingface_hub` pin incompatible con transformers: sin pin, pip resuelve automáticamente

## Errores conocidos (no bloqueantes)

- `vercel dev` sin `.env.local`: "supabaseUrl is required" → normal, necesita variables de entorno
- `/api/categorize 500` con `npm run dev`: usar `vercel dev` para probar functions
- Supabase 400 en queries: verificar tipos en filtros (total como numeric, fecha como date)
- React Router v6 deprecation warnings: no crítico para v1.0

## Pendiente antes de Fase 9

- [ ] Crear bucket `tickets` privado en Supabase Dashboard → Storage → New bucket
- [ ] Probar flujo completo con `vercel dev` + modelo RunPod real
- [ ] Verificar ticket en Supabase: `verificado=true` e `imagen_url` relleno
- [ ] Actualizar `plan.md` con pasos de Fase 9
- [ ] Consultar Notion antes de empezar Fase 9
