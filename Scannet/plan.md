# Plan — Fase 5: Gestionar Gastos

## Estado del código al inicio
- `src/pages/Home.tsx` — placeholder vacío
- `api/` — carpeta vacía, ninguna Function creada aún
- Recharts ya instalado en package.json
- Schema: tablas `ticket`, `producto`, `categoria` definidas

## Tareas Notion

| # | Tarea | Estado |
|---|-------|--------|
| 5.1 | Estado vacío con CTA a Scanner | Sin empezar |
| 5.2 | Vercel Function GET /api/tickets (mes en curso) | Sin empezar |
| 5.3 | Lista de categorías con porcentaje e importe | Sin empezar |
| 5.4 | Donut chart con Recharts (innerRadius, total en centro) | Sin empezar |
| 5.5 | Panel drill-down móvil (pantalla completa, botón volver) | Sin empezar |
| 5.6 | Panel drill-down desktop (slide desde derecha 200ms) | Sin empezar |

---

## Pasos de implementación

### Paso 1 — Vercel Function GET /api/tickets (Tarea 5.2)
- Crear `api/tickets.ts`
- Recibe: header `Authorization` con el JWT del usuario
- Consulta en Supabase: tickets del mes en curso con sus productos y categoría
- Devuelve: array de tickets con `{ id, comercio, fecha, total, categoria, productos[] }`
- Calcula el total por categoría en el servidor

### Paso 2 — Hook useTickets (consumo del API)
- Crear `src/hooks/useTickets.ts`
- Llama a GET /api/tickets con el token de sesión
- Expone: `{ tickets, totalesPorCategoria, totalMes, loading, error, refetch }`

### Paso 3 — Estado vacío (Tarea 5.1)
- Componente `src/components/EmptyState.tsx`
- Ilustración simple + texto "Aún no tienes gastos este mes" + botón "Escanear ticket" → `/scan`

### Paso 4 — Donut chart (Tarea 5.4)
- Componente `src/components/DonutChart.tsx`
- Recharts `PieChart` con `innerRadius` y `outerRadius`
- Total del mes en el centro (texto absoluto)
- Colores por categoría definidos como constante

### Paso 5 — Lista de categorías (Tarea 5.3)
- Componente `src/components/CategoriaList.tsx`
- Cada ítem: punto de color + nombre + porcentaje + importe
- Al pulsar → abre el drill-down de esa categoría

### Paso 6 — Panel drill-down (Tareas 5.5 y 5.6)
- Componente `src/components/DrillDown.tsx`
- Móvil: ocupa pantalla completa con botón "← Volver"
- Desktop: slide desde la derecha, 200ms, ancho ~360px
- Muestra lista de tickets de la categoría seleccionada con comercio, fecha e importe

### Paso 7 — Montar todo en Home.tsx
- Si `loading` → spinner
- Si sin tickets → `<EmptyState />`
- Si hay tickets → `<DonutChart />` + `<CategoriaList />` + `<DrillDown />`

---

## Archivos a crear/modificar
- `api/tickets.ts` (nuevo)
- `src/hooks/useTickets.ts` (nuevo)
- `src/components/EmptyState.tsx` (nuevo)
- `src/components/DonutChart.tsx` (nuevo)
- `src/components/CategoriaList.tsx` (nuevo)
- `src/components/DrillDown.tsx` (nuevo)
- `src/pages/Home.tsx` (modificar)
