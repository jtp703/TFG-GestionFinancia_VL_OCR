# Plan — Fase 6: Escanear Ticket

## Estado del código al inicio
- `src/pages/Scan.tsx` — placeholder vacío
- `api/tickets.ts` — ya existe (Fase 5)
- `api/scan.ts` — no existe aún
- Schema: tablas `ticket`, `producto` definidas con todos los campos necesarios

## Tareas Notion

| # | Tarea | Estado |
|---|-------|--------|
| 6.1 | Estado 1: Visor de cámara (Web API) | Sin empezar |
| 6.2 | Selector método de pago toggle (Efectivo / Tarjeta) | Sin empezar |
| 6.3 | Vercel Function POST /api/scan (llamada a HuggingFace Inference API) | Sin empezar |
| 6.4 | Estado 2: Tabla de verificación editable (campos inline) | Sin empezar |
| 6.5 | Añadir / eliminar filas de producto en verificación | Sin empezar |
| 6.6 | Guardar ticket + productos en Supabase (verificado=true) | Sin empezar |
| 6.7 | Detección de duplicados (comercio + fecha + total) | Sin empezar |
| 6.8 | Manejo de error OCR (Reintentar / Cancelar) | Sin empezar |

---

## Flujo de la vista Scan

```
Estado IDLE
  └─ Visor cámara + toggle método de pago + botón "Escanear"
        │
        ▼
Estado LOADING
  └─ Spinner "Procesando ticket..."
        │
        ├─ Error OCR → Estado ERROR (Reintentar / Cancelar)
        │
        ▼
Estado VERIFY
  └─ Tabla editable con datos OCR
     - Comercio, fecha, total (editables)
     - Tabla productos: descripcion, cantidad, precio (editables inline)
     - Botones: + Añadir fila / × eliminar fila
     - Alerta si duplicado detectado
     - Botón "Confirmar y guardar"
        │
        ▼
Estado SUCCESS
  └─ Feedback "Ticket guardado" → redirige a /
```

---

## Pasos de implementación

### Paso 1 — Vercel Function POST /api/scan (Tarea 6.3)
- Crear `api/scan.ts`
- Recibe: multipart/form-data con `image` (archivo) + `metodo_pago`
- Llama a HuggingFace Inference API con el modelo `HF_MODEL_ID`
- Devuelve: JSON con `{ comercio, cif, fecha, total, items[] }`

### Paso 2 — Hook useScan
- Crear `src/hooks/useScan.ts`
- Gestiona el estado de la máquina: `idle | loading | verify | error | success`
- Expone: `{ estado, resultado, error, metodo_pago, setMetodoPago, enviar, guardar, reintentar }`

### Paso 3 — Vista Scan.tsx (Tareas 6.1 y 6.2)
- Estado IDLE: `<video>` con stream de cámara (getUserMedia) + botón captura
- Toggle Efectivo / Tarjeta debajo del visor
- Botón "Escanear" envía la imagen capturada al hook

### Paso 4 — Tabla de verificación (Tareas 6.4 y 6.5)
- Componente `src/components/VerifyForm.tsx`
- Campos cabecera editables: comercio, fecha, método de pago
- Tabla productos con celdas editables inline
- Botones añadir fila (+) y eliminar fila (×) por producto
- Muestra alerta si se detecta duplicado

### Paso 5 — Guardar en Supabase (Tareas 6.6 y 6.7)
- En `useScan.ts`, función `guardar()`:
  - Detecta duplicados: consulta ticket con mismo comercio + fecha + total
  - Si no hay duplicado: INSERT en `ticket` + INSERT productos en `producto`
  - Marca `verificado = true`

### Paso 6 — Manejo de errores (Tarea 6.8)
- Estado ERROR en la máquina de estados
- Botón "Reintentar" (vuelve a idle con la misma imagen)
- Botón "Cancelar" (vuelve a idle limpio)

---

## Archivos a crear/modificar
- `api/scan.ts` (nuevo)
- `src/hooks/useScan.ts` (nuevo)
- `src/components/VerifyForm.tsx` (nuevo)
- `src/pages/Scan.tsx` (modificar)
