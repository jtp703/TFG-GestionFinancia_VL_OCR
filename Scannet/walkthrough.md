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

---

## Fase 5 — Gestionar Gastos

### Qué se hizo

**Archivos creados:**

- `api/tickets.ts` — Vercel Function GET /api/tickets: autentica con JWT, consulta tickets+productos+categoría del mes en curso, devuelve totales por categoría y total del mes
- `src/hooks/useTickets.ts` — hook que consume /api/tickets con el token de sesión y expone `tickets`, `totalesPorCategoria`, `totalMes`, `loading`, `error`, `refetch`
- `src/components/EmptyState.tsx` — pantalla vacía con ilustración y CTA "Escanear ticket" → `/scan`
- `src/components/DonutChart.tsx` — gráfico Recharts PieChart con innerRadius/outerRadius, total del mes centrado en texto absoluto
- `src/components/CategoriaList.tsx` — lista ordenada por importe: punto de color + nombre + porcentaje + importe; al pulsar abre drill-down
- `src/components/DrillDown.tsx` — panel deslizante: móvil pantalla completa, desktop 360px desde la derecha; transición 200ms; lista de tickets de la categoría

**Archivos modificados:**

- `src/pages/Home.tsx` — monta DonutChart + CategoriaList + DrillDown; gestiona estado de carga, error, vacío y categoría seleccionada
- `.env.local` — añadida variable `SUPABASE_URL` (sin prefijo VITE\_) para uso en Vercel Functions

### Decisiones tomadas

- **Cálculo del total en servidor**: `api/tickets.ts` suma `precio_total` de los productos para calcular el total por ticket y por categoría, evitando cálculos en el frontend.
- **Colores de categoría como constante compartida**: `CATEGORY_COLORS` duplicado en `DonutChart` y `CategoriaList` — suficiente para v1.0, extraíble a constante global si crece.
- **DrillDown siempre en el DOM**: el panel usa `transform: translateX(100%)` cuando está cerrado en lugar de montar/desmontar, para que la animación de entrada/salida sea suave.
- **`window.fetch` en useTickets**: se usa `window.fetch` explícitamente para evitar colisión de nombres con la función `fetch` definida en el hook.

### Cómo probar

```bash
vercel dev   # Puerto 3000 — necesario para que /api/tickets funcione
```

1. Login → la vista `/` muestra spinner mientras carga
2. Sin tickets → aparece EmptyState con botón "Escanear ticket"
3. Con tickets → aparece donut chart + lista de categorías
4. Pulsar una categoría → panel DrillDown se desliza desde la derecha
5. Pulsar "Volver" o el overlay → panel se cierra con animación 200ms

### Tarea adicional — Colores de categoría adaptativos (RUI-03.3)

**Archivos creados:**

- `src/lib/categoryColors.ts` — paleta pastel (claro) y eléctrica (oscuro) por categoría; función `getCategoryColor(nombre, isDark)`

**Archivos modificados:**

- `src/components/DonutChart.tsx` — usa `getCategoryColor` + `useTheme`
- `src/components/CategoriaList.tsx` — ídem

Los colores cambian en tiempo real al pulsar el toggle de tema.

---

---

## Fase 6 — Escanear Ticket

### Qué se hizo

**Archivos creados:**

- `api/scan.ts` — Vercel Function POST /api/scan: autentica con JWT, parsea multipart/form-data con `formidable`, llama a HuggingFace Inference API, extrae JSON del texto devuelto y lo devuelve normalizado
- `src/hooks/useScan.ts` — máquina de estados (`idle | loading | verify | error | success`): gestiona captura, llamada al API, detección de duplicados y guardado en Supabase
- `src/components/VerifyForm.tsx` — tabla de verificación editable post-OCR: campos cabecera (comercio, fecha, método), tabla de productos con edición inline, añadir/eliminar filas, total calculado, alerta de duplicado

**Archivos modificados:**

- `src/pages/Scan.tsx` — implementación completa con 5 estados visuales: visor de cámara (getUserMedia), spinner de carga, tabla de verificación, pantalla de error y confirmación de éxito

**Dependencias añadidas:**

- `formidable` + `@types/formidable` — parsing de multipart en la Vercel Function

### Decisiones tomadas

- **Máquina de estados en `useScan`**: Los 5 estados (`idle/loading/verify/error/success`) se gestionan en un único hook para mantener la lógica centralizada y la vista como render puro.
- **Detección de duplicados en cliente (Supabase directo)**: La comprobación de duplicados (comercio + fecha + total) se hace desde `useScan` usando el cliente Supabase del frontend con el JWT del usuario, sin necesitar un endpoint adicional.
- **Canvas oculto para captura**: Se usa un `<canvas>` oculto para capturar un frame del `<video>` y convertirlo a Blob JPEG, evitando dependencias externas.
- **`formidable` para multipart en Vercel Functions**: La Function desactiva el body parser nativo de Vercel (`export const config = { api: { bodyParser: false } }`) y usa `formidable` para leer la imagen y el campo `metodo_pago`.
- **Parseo robusto de la respuesta OCR**: El modelo puede devolver el JSON dentro de texto libre; se extrae con regex `/\{[\s\S]*\}/` para tolerar prefijos/sufijos de texto.

### Cómo probar

```bash
vercel dev   # Puerto 3000 — necesario para que /api/scan funcione
```

1. Login → navegar a `/scan`
2. Conceder permisos de cámara → aparece el visor con marco de encuadre
3. Seleccionar método de pago con el toggle
4. Pulsar el botón de captura → spinner "Procesando ticket…"
5. Resultado → tabla de verificación editable con datos del OCR
6. Editar campos si hay errores → pulsar "Confirmar y guardar"
7. Aparece confirmación "✓ Ticket guardado" → redirige a `/` tras 1.5s
8. Si el OCR falla → pantalla de error con "Reintentar" y "Cancelar"

> **Requisito previo:** `HF_API_TOKEN` y `HF_MODEL_ID` rellenos en `.env.local`.
> Para probar sin el modelo real, el endpoint devuelve error 502 que activa el estado de error — flujo también verificable.

---

---

## Fase 7 — Categorización

### Qué se hizo

**Archivos creados:**

- `api/categorize.ts` — Vercel Function POST /api/categorize: autentica con JWT, llama a DeepSeek API con un prompt que fuerza la respuesta a una de las 6 categorías fijas, valida la respuesta y devuelve `{ categoria }`

**Archivos modificados:**

- `src/hooks/useScan.ts` — función `guardar()` ahora llama a `/api/categorize` antes del INSERT, resuelve el `categoria_id` y lo incluye en el ticket. Si la categorización falla, el ticket se guarda sin categoría (degradación suave)

**Bug corregido (mismo commit):**

- `src/hooks/useTheme.ts` — añadido `MutationObserver` sobre `<html class>` para que todas las instancias del hook se sincronicen al cambiar el tema; los colores del donut y la lista ahora se actualizan en tiempo real

### Decisiones tomadas

- **`temperature: 0` en DeepSeek**: Elimina aleatoriedad — la categorización es determinista para un mismo comercio.
- **Validación de la respuesta con `includes`**: El modelo puede devolver la categoría con mayúsculas distintas o rodeada de espacios; se compara en minúsculas contra el catálogo fijo y se cae a `'Otros'` si no encaja.
- **Degradación suave en categorización**: Si `/api/categorize` falla (red, cuota, API key ausente), el ticket se guarda igualmente con `categoria_id = null` — no se bloquea el flujo del usuario.
- **Categorización fuera de `/api/scan`**: Módulo separado según las reglas de desarrollo — `scan.ts` solo hace OCR, `categorize.ts` solo categoriza.

### Cómo probar

```bash
vercel dev   # Puerto 3000
```

1. Escanear un ticket → confirmar en la pantalla de verificación
2. El ticket guardado debe aparecer en `/` bajo la categoría asignada por DeepSeek
3. Sin `DEEPSEEK_API_KEY` configurada → el ticket se guarda en "Sin categoría" (sin error para el usuario)

> **Requisito previo:** `DEEPSEEK_API_KEY` en `.env.local`.

---

---

## Fase 8 — Cuenta

### Qué se hizo

**Archivos modificados:**
- `src/pages/Cuenta.tsx` — implementación completa: avatar circular con iniciales del email (fondo brand), email del usuario, toggle de tema tipo switch, botón "Cerrar sesión" y modal de confirmación con overlay
- `src/hooks/useTheme.ts` — al montar lee `tema_preferido` de `perfil_usuario` en Supabase y lo aplica; al hacer toggle persiste el nuevo valor en Supabase de forma asíncrona (sin bloquear la UI)
- `src/components/AppLayout.tsx` — eliminado el toggle de tema (ahora vive en Cuenta)

### Decisiones tomadas

- **Toggle tipo switch (pill)**: Más intuitivo que el botón sol/luna del AppLayout para una vista de ajustes.
- **Persistencia asíncrona del tema**: El `setTheme` es síncrono (la UI cambia al instante); el UPDATE a Supabase se hace en segundo plano sin `await` para no añadir latencia perceptible.
- **Prioridad de carga del tema**: Supabase > localStorage > `prefers-color-scheme`. Si no hay sesión activa (usuario no logado), se usa localStorage.
- **Modal inline en Cuenta.tsx**: No justifica un componente separado al ser de un solo uso.
- **Overlay cierra el modal**: Clic fuera de la card cancela sin necesidad de botón adicional.

### Cómo probar

```bash
vercel dev   # Puerto 3000
```

1. Navegar a `/cuenta` → aparece avatar con iniciales + email
2. Pulsar el switch → tema cambia con transición; recargar → persiste (Supabase + localStorage)
3. Iniciar sesión desde otro dispositivo → el tema guardado en Supabase se aplica automáticamente
4. Pulsar "Cerrar sesión" → aparece modal de confirmación
5. Confirmar → redirige a `/login`; cancelar → cierra el modal

---

## Pendiente para la próxima sesión

> **Retomar desde aquí:** Fase 8 completada al 100%.
> **Siguiente fase: Fase 9 — QA y Deploy** (4 tareas en Notion, todas Sin empezar).
> Tareas: configurar variables en Vercel, deploy a producción, pruebas en navegadores, flujo completo con `vercel dev`.
> Antes de empezar: actualizar `plan.md` para Fase 9.
