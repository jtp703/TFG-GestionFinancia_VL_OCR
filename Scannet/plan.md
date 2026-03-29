# Plan — Fase 8: Cuenta

## Estado del código al inicio
- `src/pages/Cuenta.tsx` — placeholder vacío
- `src/hooks/useTheme.ts` — toggle funciona, persiste en localStorage pero NO en perfil_usuario
- `src/hooks/useAuth.ts` — expone `user`, `session`, `signOut`
- `src/components/AppLayout.tsx` — contiene el toggle de tema; en esta fase se mueve a Cuenta

## Tareas Notion

| # | Tarea | Estado |
|---|-------|--------|
| 8.1 | Vista Cuenta (avatar iniciales + email del usuario) | Sin empezar |
| 8.2 | Toggle tema oscuro (persiste en perfil_usuario en Supabase) | Sin empezar |
| 8.3 | Modal de confirmación logout | Sin empezar |

---

## Pasos de implementación

### Paso 1 — Vista Cuenta + avatar (Tarea 8.1)
- Implementar `src/pages/Cuenta.tsx`
- Avatar circular con las iniciales del email (2 letras, fondo brand)
- Email del usuario debajo
- Sección con el toggle de tema (movido desde AppLayout)
- Botón "Cerrar sesión" que abre el modal

### Paso 2 — Toggle tema persistido en Supabase (Tarea 8.2)
- Al cambiar el tema, hacer UPDATE en `perfil_usuario` con `tema_preferido`
- Al cargar la app, leer `tema_preferido` de `perfil_usuario` y aplicarlo
- Prioridad: Supabase > localStorage > prefers-color-scheme
- Mover la lógica de carga inicial a `useTheme.ts`

### Paso 3 — Modal logout (Tarea 8.3)
- Componente inline en `Cuenta.tsx` (no hace falta fichero separado)
- Overlay oscuro + card centrada: "¿Cerrar sesión?" + "Cancelar" + "Cerrar sesión"
- Al confirmar: `signOut()` → redirige a `/login`

### Paso 4 — Limpiar AppLayout
- Eliminar el toggle de tema de `AppLayout.tsx` (ahora vive en Cuenta)

---

## Archivos a crear/modificar
- `src/pages/Cuenta.tsx` (modificar — implementación completa)
- `src/hooks/useTheme.ts` (modificar — persistencia en Supabase)
- `src/components/AppLayout.tsx` (modificar — eliminar toggle)
