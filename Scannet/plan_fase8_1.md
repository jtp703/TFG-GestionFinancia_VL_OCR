# Plan — Fase 8.1: Mejoras pre-deploy

## Contexto
Antes de pasar a la Fase 9 (deploy), se implementan mejoras detectadas en el análisis
de `actualStatus.md` que son necesarias para poder probar el flujo completo en local.

## Tareas

| # | Tarea | Prioridad | Motivo |
|---|-------|-----------|--------|
| 8.1.1 | Subida de imagen desde galería en Scan | Alta | Sin cámara no se puede probar el OCR |
| 8.1.2 | Corregir bug de duplicados (error → verify) | Media | El flujo de corrección está roto |
| 8.1.3 | Guardar imagen en Supabase Storage | Baja | `imagen_url` siempre null en BD |

---

## Tarea 8.1.1 — Subida de imagen desde galería

### Qué se hace
Añadir un botón "Subir imagen" en el estado IDLE de `Scan.tsx`, junto al botón de captura.
Al seleccionar un archivo, se pasa directamente a `enviar()` igual que un frame de cámara.

### Comportamiento esperado
- En móvil con cámara: aparecen ambas opciones (capturar foto + subir desde galería)
- En escritorio sin cámara: el visor muestra el error de permisos, pero el botón
  "Subir imagen" sigue activo y funcional
- El archivo seleccionado pasa por el mismo flujo: loading → verify → success/error

### Archivos a modificar
- `src/pages/Scan.tsx` — añadir `<input type="file">` en el área de controles inferiores

### Cambios en el hook
Ninguno. `enviar(blob: Blob)` ya acepta cualquier Blob — un `File` es un Blob.

---

## Tarea 8.1.2 — Corregir bug de duplicados

### El bug actual
En `useScan.ts`, al detectar un duplicado:
```ts
setEstado('error')  // lleva a pantalla de error — el usuario no puede editar
```
En `Scan.tsx`, el flag `duplicado` siempre se resetea a `false` antes de guardar:
```ts
setDuplicado(false)   // el banner en VerifyForm nunca se muestra
await guardar(datos)
```

### Comportamiento correcto
1. Detectar duplicado → mantener estado `'verify'` con el banner de aviso visible
2. El usuario puede editar comercio, fecha o total para desambiguar
3. Al volver a confirmar → si sigue siendo duplicado, bloquear con mensaje claro
4. Si el usuario edita y ya no es duplicado → guardar normalmente

### Cambios necesarios
- `src/hooks/useScan.ts` — la detección de duplicado debe devolver un flag,
  no cambiar el estado a `'error'`
- `src/pages/Scan.tsx` — pasar el flag `duplicado` a `VerifyForm` cuando sea `true`

### Archivos a modificar
- `src/hooks/useScan.ts`
- `src/pages/Scan.tsx`

---

## Tarea 8.1.3 — Guardar imagen en Supabase Storage

### Qué se hace
1. Crear bucket privado `tickets` en Supabase Storage (manual en el dashboard)
2. En `useScan.ts`, antes del INSERT del ticket:
   - Subir el blob al bucket: `{usuario_id}/{timestamp}.jpg`
   - Obtener la URL firmada
   - Incluir `imagen_url` en el INSERT

### Consideraciones
- Si la subida falla → el ticket se guarda igualmente sin imagen (degradación suave)
- El bucket debe ser **privado** — las URLs son firmadas con expiración
- El blob de la última imagen se conserva en `ultimaImagen` dentro del hook,
  por lo que está disponible en `guardar()`

### Archivos a modificar
- `src/hooks/useScan.ts`

### Requisito previo (manual)
Crear el bucket `tickets` en Supabase Dashboard → Storage → New bucket → Private.

---

## Orden de implementación

1. **8.1.1** (subida de imagen) — desbloquea las pruebas del OCR inmediatamente
2. **8.1.2** (bug duplicados) — corrección de comportamiento antes del deploy
3. **8.1.3** (guardar imagen) — opcional para TFG, conveniente para re-entrenamiento futuro

---

## Archivos a modificar en total
- `src/pages/Scan.tsx`
- `src/hooks/useScan.ts`
