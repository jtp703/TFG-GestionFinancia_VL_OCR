---
Última actualización: 2026-04-16
---

## Estado actual de Scannet

- Fases 1–8.1 completadas al 100%
- OCR: pipeline OCR.space + DeepSeek chat activo en producción (RunPod descartado)
- Deploy: Vercel apunta a rama `Feature-App-Stack` como producción ✅
- Fase 9 — QA y Deploy: **en curso**

## Completado hoy (2026-04-16)

- Fix onboarding gastos fijos: el paso 3 ahora pide nombre + precio por cada gasto y los inserta en `gasto_fijo` (antes guardaba texto plano en `perfil_usuario.gastos_fijos` y nunca aparecían en el donut) ✅

## Completado (2026-04-12)

- `USE_MOCK = false` en `useTickets.ts` — donut ahora consulta Supabase real ✅
- try/catch en `getSession()` de `useTickets.ts` — evita hook colgado con token inválido ✅

## Bloqueado ahora mismo

- **Bucket `tickets` en Supabase Storage**: pendiente crear **manualmente**
  Dashboard → Storage → New bucket → nombre: `tickets` → Private
- **RLS policy INSERT Storage**: añadir tras crear el bucket
  ```sql
  (bucket_id = 'tickets') AND (auth.uid()::text = (storage.foldername(name))[1])
  ```

## Próximos pasos

1. Usuario crea bucket + RLS policy en Supabase (manual, tareas 9.1 y 9.2)
2. Verificar que `/api/tickets` devuelve datos reales tras desplegar (tarea 9.5)
3. Test e2e: escanear → verificar → guardar → ver en donut (tarea 9.6)
4. Evaluar calidad OCR.space (tarea 9.7)

## Rama activa

`Feature-App-Stack` → producción en Vercel. Nunca a `main`.
