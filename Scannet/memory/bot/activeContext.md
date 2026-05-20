---
Última actualización: 2026-05-20
---

## Estado actual de Scannet

- **Rama activa:** `Feature-App-Stack-V6` → producción en Vercel
- **Pipeline OCR:** OCR.space (texto) → DeepSeek chat (JSON). RunPod descartado.
- **Pipeline completo (Fases A–G):** completado al 100% en sesión 2026-05-20
- **Tests E2E:** 4 specs Playwright (`auth`, `scan`, `gastosFijos`, `home`)
- **Estado general:** estable, sin bugs conocidos críticos

## Lo que existe ahora mismo

### Arquitectura de estado del scan
- `ScanContext.tsx` (`src/context/ScanContext.tsx`) — todo el estado del scan vive en un React Context global que persiste entre navegaciones. Si el usuario escanea un ticket y cambia de pestaña, al volver los datos siguen ahí.
- `useScan.ts` — ahora es un re-export de `ScanContext`. Los imports existentes siguen funcionando sin cambios.
- `ScanProvider` envuelve todo el árbol en `App.tsx`.

### Pipeline scan completo
1. Usuario captura con cámara o galería
2. Imagen comprimida (máx 1200px, quality 0.82) → base64
3. `POST /api/scan` → OCR.space extrae texto → DeepSeek chat parsea a JSON
4. Validación de schema (comercio + total requeridos)
5. Estado `verify` → VerifyForm editable
6. Validación de formulario (comercio, fecha, total > 0, items válidos) antes de confirmar
7. Dialog de confirmación "¿Todo es correcto?"
8. `POST /api/categorize` → categoría asignada (degradación suave)
9. INSERT en `ticket` + `producto` + `ticket_producto`
10. `notify.ok('Ticket guardado')` + redirect a `/`

### UX verify (post-OCR)
- **Escritorio:** imagen izquierda (38%, click-to-zoom lightbox) + formulario derecha (scrollable)
- **Móvil:** carrusel scroll-snap horizontal, dots indicadores (pill animado), panel imagen | panel form
- Timer de procesamiento: "Procesado en Xs" junto al título
- Errores de guardado → vuelven a `verify` con datos intactos (no relanza OCR)

## Próximos pasos posibles

- Probar en local el flujo completo con `vercel dev` (necesita `.env.local` con las keys reales)
- Ejecutar tests E2E: `npm run test:e2e` (necesita cuenta de test `test-e2e@scannet.dev`)
- Verificar bucket `tickets` en Supabase Storage si no se creó aún (privado + RLS policy)
- Evaluar calidad OCR en tickets reales y ajustar prompt DeepSeek si hay campos que fallan
