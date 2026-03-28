# Plan — Fase 4: Navegación

## Estado del código al inicio
- `react-router-dom` ya instalado (v6)
- `BrowserRouter` + rutas públicas ya configuradas en `App.tsx`
- CSS variables + transición 200ms de tema ya definidas en `index.css`
- Clase `.dark` ya presente en `index.css`

## Tareas Notion

| # | Tarea | Estado |
|---|-------|--------|
| 4.1 | Router principal con React Router | Sin empezar |
| 4.2 | Bottom nav móvil (56px, iconos + labels) | Sin empezar |
| 4.3 | Sidebar desktop (64px, 3 iconos apilados) | Sin empezar |
| 4.4 | Sistema de temas claro/oscuro (CSS variables + transición 200ms) | Sin empezar |

---

## Pasos de implementación

### Paso 1 — Crear páginas stub (Home, Scan, Cuenta)
- `src/pages/Home.tsx` → vista placeholder de Gastos
- `src/pages/Scan.tsx` → vista placeholder de Escáner
- `src/pages/Cuenta.tsx` → vista placeholder de Cuenta
- Estas páginas se rellenarán en fases posteriores

### Paso 2 — Router principal (Tarea 4.1)
- Actualizar `App.tsx` con rutas protegidas: `/` (Home), `/scan` (Scan), `/cuenta` (Cuenta)
- Layout envolvente `AppLayout` que renderiza nav + `<Outlet />`
- Rutas públicas sin layout (/login, /registro, /onboarding)

### Paso 3 — Bottom nav móvil (Tarea 4.2)
- Crear `src/components/BottomNav.tsx`
- 56px de alto, fijo en bottom, 3 ítems: Gastos / Scan / Cuenta
- Ítem activo resaltado con `--color-brand`
- Solo visible en móvil (`md:hidden`)

### Paso 4 — Sidebar desktop (Tarea 4.3)
- Crear `src/components/Sidebar.tsx`
- 64px de ancho, fijo en left, 3 iconos apilados verticalmente
- Solo visible en desktop (`hidden md:flex`)

### Paso 5 — Hook y toggle de tema (Tarea 4.4)
- Crear `src/hooks/useTheme.ts` → gestiona clase `.dark` en `<html>`, persiste en `localStorage`
- Añadir toggle en `AppLayout` (o donde sea visible)

### Paso 6 — Crear `AppLayout`
- `src/components/AppLayout.tsx` → contenedor con Sidebar + BottomNav + `<Outlet />`
- Margen izquierdo en desktop para compensar sidebar

---

## Orden de ejecución
1. Páginas stub
2. AppLayout + rutas en App.tsx
3. BottomNav
4. Sidebar
5. useTheme + toggle
6. Verificar navegación completa

## Archivos a crear/modificar
- `src/pages/Home.tsx` (nuevo)
- `src/pages/Scan.tsx` (nuevo)
- `src/pages/Cuenta.tsx` (nuevo)
- `src/components/AppLayout.tsx` (nuevo)
- `src/components/BottomNav.tsx` (nuevo)
- `src/components/Sidebar.tsx` (nuevo)
- `src/hooks/useTheme.ts` (nuevo)
- `src/App.tsx` (modificar)
