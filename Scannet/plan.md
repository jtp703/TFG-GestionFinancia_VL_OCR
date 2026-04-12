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

#### Bug A — `useTickets` estaba en modo mock hardcodeado ✅ RESUELTO
**Archivo:** `src/hooks/useTickets.ts:5`
**Fix aplicado:** `USE_MOCK = false` + try/catch en `getSession()`. El donut consulta Supabase real.

---

#### Bug B — Bucket `tickets` creado ✅ / RLS policy añadida ✅
**Estado:** Bucket Private creado + política INSERT para usuarios autenticados aplicada.
**Pendiente verificar:** que `subirImagen()` ya no devuelve 400 en el próximo scan real.

---

#### Bug C — Upload de imagen sigue fallando (pendiente de verificar)
**Archivo:** `src/hooks/useScan.ts` → función `subirImagen()`
**Síntoma:** El bucket y la RLS policy ya existen, pero el upload puede seguir fallando.
**Causa probable:** La función usa `getPublicUrl` sobre un bucket **Private** — las URLs públicas no funcionan en buckets privados.
**Fix necesario:**
- Cambiar `getPublicUrl` por `createSignedUrl` para generar URLs temporales firmadas, o
- Guardar solo el `path` en `imagen_url` y generar la signed URL al mostrarla.
**Prioridad:** 🟡 Media — el ticket se guarda igualmente sin imagen (degradación suave).

---

#### Bug D — Pantalla principal de gastos no muestra datos
**Síntoma:** La sección de gastos aparece vacía aunque haya tickets guardados en Supabase.
**Causas posibles:**
1. Bug A ya resuelto — si había tickets previos, deberían aparecer ahora tras el deploy.
2. No hay tickets en Supabase del mes en curso para ese usuario.
3. `/api/tickets` devuelve error silencioso — verificar en Network tab del navegador.
**Fix:** Desplegar el cambio `USE_MOCK = false` y comprobar respuesta de `/api/tickets`. Si devuelve array vacío, el problema es que no hay tickets guardados aún.
**Prioridad:** 🔴 Alta — bloquea la funcionalidad principal.

---

#### Bug E — Gastos predefinidos del perfil no se usan
**Síntoma:** El usuario introduce un gasto estimado mensual en su perfil pero no se refleja en ningún sitio de la app (sin comparativa, sin barra de progreso, sin alerta).
**Causa:** La funcionalidad nunca fue implementada — el campo se guarda en BD pero el frontend no lo consume.
**Fix necesario:**
- Leer `gasto_estimado` del perfil del usuario en la pantalla de gastos.
- Mostrar comparativa: gasto real del mes vs. gasto estimado (barra de progreso o indicador visual).
**Prioridad:** 🔴 Alta — es una funcionalidad core prometida al usuario.

---

#### Bug F — Productos duplicados al guardar tickets
**Síntoma:** Cada vez que se guarda un ticket, sus productos se insertan como registros nuevos aunque ya existan con el mismo nombre y precio.
**Causa:** `useScan.ts` hace un `INSERT` directo en `producto` sin comprobar si ya existe un producto con la misma descripción y precio.
**Fix necesario — lógica de deduplicación:**
1. Antes de insertar un producto, buscar en la tabla `producto` si existe uno con `descripcion = X AND precio_unitario = Y` (independientemente del ticket).
2. Si existe → asociarlo al ticket actual mediante una tabla intermedia `ticket_producto`.
3. Si no existe → crearlo en `producto` y luego asociarlo.
**Cambio de schema requerido:**
- Crear tabla `ticket_producto` (relación N:M entre `ticket` y `producto`):
  ```sql
  CREATE TABLE ticket_producto (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id   uuid NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
    producto_id uuid NOT NULL REFERENCES producto(id) ON DELETE CASCADE,
    cantidad    numeric NOT NULL DEFAULT 1,
    UNIQUE (ticket_id, producto_id)
  );
  ```
- La tabla `producto` pasa a ser un catálogo compartido: `(descripcion, precio_unitario)` deben ser únicos.
  ```sql
  ALTER TABLE producto ADD CONSTRAINT producto_descripcion_precio_unique UNIQUE (descripcion, precio_unitario);
  ```
**Criterio de igualdad:** `descripcion` igual (case-insensitive) + `precio_unitario` igual.
**Prioridad:** 🔴 Alta — sin esto los datos en BD crecen sin control y las estadísticas son incorrectas.

---

#### Bug G — Storage: URL pública en bucket privado
**Archivo:** `src/hooks/useScan.ts:134`
**Síntoma:** `getPublicUrl` sobre bucket privado devuelve una URL inaccesible.
**Fix:** Usar `createSignedUrl(path, 3600)` en lugar de `getPublicUrl`, o guardar solo el path y firmar al mostrar.
**Prioridad:** 🟡 Media.

---

### Decisión de modelo OCR — vigente hasta que el flujo esté estable

**Modelo actual:** OCR.space (free tier) + DeepSeek-chat (de pago, crédito disponible).
**Decisión:** Mantener este modelo gratuito/barato hasta que todo el flujo de principio a fin funcione correctamente (escanear → verificar → guardar → ver en donut → deduplicar productos).

**Hoja de ruta de mejora del modelo (en orden):**
1. ✅ **Ahora:** OCR.space + DeepSeek-chat — funcional, gratuito/barato.
2. **Siguiente (cuando el flujo esté estable):** Migrar a un LLM con visión mejor entrenado para tickets (GPT-4o mini, Gemini con billing, o Claude Haiku) — un solo paso sin OCR.space.
3. **Final (si es posible):** Modelo propio fine-tuned (DeepSeek-VL con LoRA) desplegado en RunPod o similar.

---

### Tareas por orden de ejecución

| # | Tarea | Depende de | Estado |
|---|-------|------------|--------|
| 9.1 | Crear bucket `tickets` privado en Supabase Storage (manual) | — | ✅ |
| 9.2 | Añadir RLS policy INSERT en Storage para usuarios autenticados | 9.1 | ✅ |
| 9.3 | Schema `ticket_producto` — crear tabla intermedia + constraint único en `producto` | — | ✅ |
| 9.4 | Cambiar `USE_MOCK = false` en `useTickets.ts` | — | ✅ |
| 9.5 | Refactorizar insert de productos en `useScan.ts` — deduplicar por nombre+precio | 9.3 | ✅ |
| 9.6 | Implementar comparativa gasto estimado vs. real en pantalla de gastos | — | ✅ |
| 9.7 | Fix `subirImagen`: guardar path en lugar de URL pública (bucket privado) | — | ✅ |
| 9.8 | Verificar que `/api/tickets` devuelve datos reales tras deploy | 9.4 | ✅ |
| 9.9 | Test end-to-end: escanear → verificar → guardar → ver en donut | 9.1–9.8 | ✅ |
| 9.10 | Gastos fijos: tabla, hook, modal, integración donut + emojis + candado | — | ⚠️ Pendiente ejecutar SQL |
| 9.11 | Evaluar calidad OCR y migrar modelo cuando el flujo esté estable | 9.9 | ⏳ |

---

### Notas técnicas

- `USE_MOCK_OCR` en Vercel env vars → `false` ✅ — el scan llama a la API real.
- `USE_MOCK` en `useTickets.ts` → `false` ✅ — el donut consulta Supabase.
- El campo `total` del ticket se calcula en `/api/tickets` sumando productos — no necesita columna en BD.
- Bucket `tickets` creado como Private + RLS policy INSERT activa ✅.
- Rama de producción Vercel: `Feature-App-Stack` ✅.
- El modelo OCR se mantiene gratuito (OCR.space + DeepSeek) hasta que el flujo completo esté validado.
