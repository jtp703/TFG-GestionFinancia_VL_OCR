# Scannet — Plan de desarrollo

> Actualizado: 2026-04-12 | Rama: `Feature-App-Stack`

---

## Estado de fases

| Fase | Nombre | Estado |
|------|--------|--------|
| 1 | Setup | ✅ |
| 2 | Base de datos | ✅ |
| 3 | Autenticación | ✅ |
| 4 | Navegación | ✅ |
| 5 | Gestionar Gastos | ✅ |
| 6 | Escanear Ticket | ✅ |
| 7 | Categorización | ✅ |
| 8 | Cuenta | ✅ |
| 8.1 | Mejoras pre-deploy | ✅ |
| 9 | QA y Deploy | ⏳ En curso |

---

## Fase actual — 9: QA y Deploy

### Bugs activos (bloquean funcionalidad real)

---

#### Bug A — `useTickets` está en modo mock hardcodeado
**Archivo:** `src/hooks/useTickets.ts:5`
**Síntoma:** El donut y la lista de gastos siempre muestran datos falsos, nunca los tickets reales de Supabase.
**Causa:** `const USE_MOCK = true` está hardcodeado. Nunca llama a `/api/tickets`.
**Fix:** Cambiar a `false` y verificar que `/api/tickets` devuelve datos reales del usuario autenticado.
**Prioridad:** 🔴 Alta — sin esto la app no muestra nada real.

---

#### Bug B — Bucket `tickets` no existe en Supabase Storage
**Síntoma:** `{"statusCode":"404","error":"Bucket not found"}` al guardar un ticket.
**Causa:** El bucket `tickets` nunca fue creado manualmente en el dashboard de Supabase.
**Fix (manual, sin código):**
1. Supabase Dashboard → Storage → New Bucket
2. Nombre: `tickets`
3. Tipo: **Private** (las imágenes no deben ser públicas)
4. Guardar
**Prioridad:** 🔴 Alta — sin el bucket, `subirImagen()` siempre falla.

---

#### Bug C — Upload de imagen devuelve 400
**Archivo:** `src/hooks/useScan.ts` → función `subirImagen()`
**Síntoma:** `POST .../storage/v1/object/tickets/.../timestamp.jpg 400 (Bad Request)`
**Causa probable:** El bucket no existe (Bug B) y/o la RLS policy de Storage no permite inserts autenticados.
**Fix:**
1. Primero resolver Bug B (crear el bucket).
2. En Supabase Dashboard → Storage → Policies → añadir política INSERT para usuarios autenticados:
   ```sql
   (bucket_id = 'tickets') AND (auth.uid()::text = (storage.foldername(name))[1])
   ```
**Prioridad:** 🟡 Media — el ticket se guarda igualmente sin imagen (degradación suave), pero la imagen_url queda vacía.

---

#### Bug D — Ticket guardado pero no aparece en el donut
**Causa:** Bug A (mock activo). Aunque el ticket se guarde correctamente en Supabase, `useTickets` nunca lo consulta.
**Fix:** Resolverlo al corregir Bug A.
**Prioridad:** 🔴 Alta (dependiente de Bug A).

---

#### Bug E — Los productos se guardan pero el ticket puede no guardarse
**Síntoma:** Los productos aparecen en Supabase pero el ticket no se ve reflejado.
**Causa probable:** El insert del ticket falla silenciosamente o devuelve error que no se propaga bien. Puede estar relacionado con el campo `total` que no existe en el schema de la tabla `ticket`.
**Fix:** Revisar el schema de `ticket` en Supabase — si no tiene columna `total`, añadirla o calcularla desde productos. Verificar en Supabase Dashboard → Table Editor → tabla `ticket`.
**Prioridad:** 🔴 Alta.

---

### Mejora F — Modelo OCR
**Estado actual:** OCR.space (extracción de texto) + DeepSeek-chat (parseo a JSON).
**Problema:** OCR.space no es óptimo para tickets con layout complejo, letra pequeña o baja calidad.
**Opciones evaluadas:**

| Opción | Calidad | Coste por ticket | Disponibilidad |
|--------|---------|------------------|----------------|
| OCR.space + DeepSeek | ⭐⭐ | ~$0.001 | Free tier limitado |
| **OpenAI GPT-4o mini** | ⭐⭐⭐⭐ | ~$0.01 | Requiere key OpenAI |
| **Claude 3 Haiku** | ⭐⭐⭐⭐ | ~$0.008 | Requiere key Anthropic |
| Gemini 2.0 Flash (con billing) | ⭐⭐⭐⭐ | ~$0.005 | Activar billing Google |

**Recomendación:** GPT-4o mini o Gemini con billing activado. Ambos hacen OCR + parseo en un solo paso (sin OCR.space).
**Decisión:** Pendiente de confirmar con el usuario qué API key tiene disponible.

---

### Tareas por orden de ejecución

| # | Tarea | Depende de | Estado |
|---|-------|------------|--------|
| 9.1 | Crear bucket `tickets` privado en Supabase Storage (manual) | — | ⏳ |
| 9.2 | Añadir RLS policy INSERT en Storage para usuarios autenticados | 9.1 | ⏳ |
| 9.3 | Verificar schema tabla `ticket` — confirmar columna `total` existe | — | ⏳ |
| 9.4 | Cambiar `USE_MOCK = false` en `useTickets.ts` | 9.3 | ✅ |
| 9.5 | Verificar que `/api/tickets` devuelve datos reales del usuario | 9.4 | ⏳ |
| 9.6 | Test end-to-end: escanear → verificar → guardar → ver en donut | 9.1–9.5 | ⏳ |
| 9.7 | Evaluar y migrar modelo OCR si calidad es insuficiente | 9.6 | ⏳ |

---

### Notas técnicas

- `USE_MOCK_OCR` en Vercel env vars está en `false` ✅ — el scan llama a la API real.
- `USE_MOCK` en `useTickets.ts` está en `true` ❌ — hay que cambiarlo a `false`.
- El campo `total` del ticket se calcula en el frontend como suma de `items`, pero la BD necesita tenerlo o calcularse en la query de `/api/tickets`.
- Vercel Production Branch: configurar `Feature-App-Stack` como rama de producción en el dashboard.
