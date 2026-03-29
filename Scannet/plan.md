# Plan — Fase 7: Categorización

## Estado del código al inicio
- `api/scan.ts` — devuelve JSON del ticket sin categoría
- `api/categorize.ts` — no existe aún
- `src/hooks/useScan.ts` — función `guardar()` hace INSERT en `ticket` sin `categoria_id`
- Tabla `categoria` — 6 filas fijas: Alimentación, Transporte, Ocio, Hogar, Salud, Otros

## Tareas Notion

| # | Tarea | Estado |
|---|-------|--------|
| 7.1 | Vercel Function POST /api/categorize (llamada a DeepSeek API) | Sin empezar |
| 7.2 | Integrar categorización en flujo post-OCR (tras /api/scan) | Sin empezar |

---

## Flujo de categorización

```
useScan.guardar(datos)
  └─ POST /api/categorize { comercio }
        └─ DeepSeek API → devuelve nombre de categoría
              └─ SELECT id FROM categoria WHERE nombre = ?
                    └─ INSERT ticket con categoria_id
```

La categorización es transparente para el usuario — ocurre en `guardar()` antes del INSERT,
sin pantalla adicional.

---

## Pasos de implementación

### Paso 1 — Vercel Function POST /api/categorize (Tarea 7.1)
- Crear `api/categorize.ts`
- Recibe: `{ comercio: string }` en el body JSON
- Autenticación: JWT en header Authorization
- Llama a DeepSeek API con un prompt que fuerza una de las 6 categorías fijas
- Devuelve: `{ categoria: string }` — nombre exacto de la categoría

### Paso 2 — Integrar en useScan (Tarea 7.2)
- En `useScan.ts`, función `guardar()`:
  1. Llamar a POST /api/categorize con el comercio
  2. Obtener el `id` de la categoría desde Supabase
  3. Añadir `categoria_id` al INSERT de `ticket`

---

## Archivos a crear/modificar
- `api/categorize.ts` (nuevo)
- `src/hooks/useScan.ts` (modificar — añadir llamada a /api/categorize en guardar())
