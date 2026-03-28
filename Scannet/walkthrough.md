# Walkthrough — Scannet

Documento vivo. Se actualiza al finalizar cada fase.
Recoge qué se hizo, decisiones tomadas y cómo probar cada parte.

---

## Fase 1 — Setup del proyecto

### Qué se hizo
- Creado `package.json` con dependencias definitivas: React 18, Vite 5, TypeScript, Tailwind 3, React Router 6, Recharts, Supabase JS.
- Configurado `tsconfig.json` con alias `@/*` → `./src/*` para imports limpios.
- Creado `vite.config.ts` con el mismo alias de rutas.
- Creado `index.html` con carga de fuente Inter (weights 400 y 500) desde Google Fonts.
- Creado `tailwind.config.js` con **todos los tokens del STYLE_GUIDE** extendidos: colores de marca, fondos, superficies, categorías, tamaños tipográficos, border-radius y duraciones de transición.
- Creado `src/index.css` con variables CSS (`--bg`, `--surface`, `--color-brand`, `--text-primary`, `--text-muted`, `--border`) en `:root` (claro) y `.dark` (oscuro), más la transición global de tema de 200ms.
- Creado `vercel.json` con rewrite SPA + runtime `nodejs20.x` para las Functions.
- Creados `.env.local` y `.env.example` con las 6 variables necesarias.
- Creada estructura de carpetas: `src/components`, `src/pages`, `src/hooks`, `src/lib`, `api/`, `database/`, `public/`.

### Decisiones
- Se creó el proyecto manualmente en lugar de usar `npm create vite` porque el CLI es interactivo y el directorio ya tenía ficheros (CLAUDE.md, etc.).
- `darkMode: 'class'` en Tailwind para controlar el tema añadiendo/quitando la clase `dark` en `<html>`.

### Cómo probar
```bash
cd Scannet
npm install
npm run build   # debe compilar sin errores
npm run dev     # app vacía en http://localhost:5173
```

---

## Fase 2 — Base de datos

### Qué se hizo
- Creado `database/schema.sql` con las 4 tablas definitivas:
  - `categoria` — categorías fijas del sistema.
  - `perfil_usuario` — vinculada a `auth.users` con los datos del onboarding y preferencia de tema.
  - `ticket` — un ticket por escaneo, con FK a `categoria` y `auth.users`.
  - `producto` — líneas individuales de cada ticket, con FK a `ticket`.
- Configurado **Row Level Security** en las 4 tablas: cada usuario solo accede a sus propios datos; `categoria` es de lectura pública.
- Añadido **trigger** `on_auth_user_created` que crea automáticamente una fila en `perfil_usuario` al registrarse un nuevo usuario.
- Insertadas las **6 categorías fijas** con `ON CONFLICT DO NOTHING` para idempotencia.
- Creado `src/lib/supabaseClient.ts` — instancia única del cliente Supabase para el frontend, usando `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

### Decisiones
- `perfil_usuario.id` es el mismo UUID que `auth.users.id` (no una FK separada) para simplificar los joins.
- El trigger usa `SECURITY DEFINER` para poder insertar en `perfil_usuario` sin que el RLS lo bloquee durante el registro.
- Las categorías usan `ON CONFLICT (nombre) DO NOTHING` para que el script sea re-ejecutable sin errores.

### Cómo probar
1. Ir a Supabase → SQL Editor → pegar y ejecutar `database/schema.sql`.
2. Verificar en Table Editor que existen las 4 tablas y que `categoria` tiene 6 filas.
3. Registrar un usuario de prueba desde Supabase Auth → comprobar que se crea automáticamente su fila en `perfil_usuario`.

---

## Fase 3 — Autenticación

### Qué se hizo
- **`src/hooks/useAuth.ts`** — hook centralizado que:
  - Carga la sesión al montar con `getSession()`.
  - Escucha cambios en tiempo real con `onAuthStateChange`.
  - Expone `user`, `session`, `loading`, `signUp`, `signIn`, `signOut`.
- **`src/components/ProtectedRoute.tsx`** — wrapper que muestra un spinner mientras carga y redirige a `/login` si no hay usuario autenticado.
- **`src/pages/Login.tsx`** — card centrada (máx. 400px), sin barra de navegación. Campos email + contraseña con focus ring brand. Enlace a `/registro`. Redirige a `/` tras login correcto.
- **`src/pages/Registro.tsx`** — mismo estilo que Login. Incluye confirmación de contraseña. Redirige a `/onboarding` tras registro correcto.
- **`src/pages/Onboarding.tsx`** — 3 preguntas presentadas de una en una con indicador `1/3, 2/3, 3/3`. Cada paso tiene "Omitir" (ghost) y "Siguiente →" (brand). Al finalizar guarda los datos en `perfil_usuario` y redirige a `/`.
- **`src/App.tsx`** — router principal con rutas públicas (`/login`, `/registro`, `/onboarding`) y ruta protegida (`/`) envuelta en `ProtectedRoute`.

### Decisiones
- El onboarding guarda `null` en los campos omitidos, no cadenas vacías, para mantener la semántica de "no respondido".
- `signUp` de Supabase crea el usuario en `auth.users`, el trigger de Fase 2 crea su `perfil_usuario` automáticamente — el onboarding solo hace `UPDATE`, nunca `INSERT`.
- Los estilos de inputs usan `style` inline con variables CSS en lugar de clases Tailwind para que hereden correctamente el tema claro/oscuro sin necesidad de purga manual.

### Cómo probar
```bash
npm run dev
```
1. Navegar a `http://localhost:5173` → debe redirigir a `/login`.
2. Ir a `/registro` → crear una cuenta → debe redirigir a `/onboarding`.
3. Completar u omitir los 3 pasos → debe redirigir a `/` (placeholder "en construcción").
4. Cerrar pestaña y volver a `/` → debe redirigir a `/login` (sesión expirada o no persistida).
5. Hacer login con las credenciales creadas → debe entrar a `/`.

> **Requisito previo:** tener `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` rellenos en `.env.local`.

---

## Fase 4 — Navegación

### Qué se hizo

**Archivos creados:**
- `src/pages/Home.tsx` — Placeholder de la vista Gastos (Fase 5)
- `src/pages/Scan.tsx` — Placeholder de la vista Escanear (Fase 6)
- `src/pages/Cuenta.tsx` — Placeholder de la vista Cuenta (Fase 8)
- `src/components/AppLayout.tsx` — Layout envolvente con Sidebar + BottomNav + Outlet + toggle de tema
- `src/components/BottomNav.tsx` — Navegación inferior móvil, 56px, 3 ítems
- `src/components/Sidebar.tsx` — Navegación lateral desktop, 64px, 3 iconos
- `src/hooks/useTheme.ts` — Hook de tema claro/oscuro con persistencia en localStorage

**Archivos modificados:**
- `src/App.tsx` — Rutas protegidas agrupadas bajo AppLayout; rutas públicas sin layout

### Decisiones tomadas

- **ProtectedRoute como wrapper del layout**: `ProtectedRoute` envuelve `AppLayout` en `App.tsx`. Dado que `ProtectedRoute` renderiza `{children}` y `AppLayout` contiene `<Outlet />`, React Router resuelve las rutas anidadas correctamente.
- **Toggle de tema en AppLayout**: El botón sol/luna vive en la esquina superior derecha del contenido principal. En Fase 8 se moverá al interior de la vista Cuenta.
- **`useTheme` respeta `prefers-color-scheme`**: Si el usuario no tiene preferencia guardada en `localStorage`, se usa la preferencia del sistema operativo.
- **Iconos SVG inline**: Sin dependencias externas de iconos para mantener el bundle ligero.
- **`end` prop en NavLink de `/`**: Evita que la ruta raíz quede activa en todas las rutas.

### Cómo probar

```bash
vercel dev   # Puerto 3000
```

1. Login con usuario existente → redirige a `/`
2. Verificar que aparece la BottomNav en móvil (< 768px) y la Sidebar en desktop (≥ 768px)
3. Navegar entre Gastos, Escanear y Cuenta — ítem activo resaltado en verde
4. Pulsar el botón de tema (luna/sol) — la UI cambia con transición 200ms
5. Recargar la página — el tema persiste
6. Acceder a `/login` directamente — no muestra nav (ruta pública sin layout)
