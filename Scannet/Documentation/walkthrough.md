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

---

## Fase 8.1 — Mejoras pre-deploy

### Qué se hizo

**Archivos modificados:**
- `api/scan.ts` — actualizado para usar el modelo real `Lacax/deepseek_ocr_lora` con el endpoint `/v1/chat/completions` de HuggingFace (formato OpenAI-compatible con imagen en base64). El parser de respuesta ahora lee `choices[0].message.content` con fallback a `generated_text`/`answer`
- `src/hooks/useScan.ts` — tres mejoras:
  1. **Bug duplicados corregido**: al detectar duplicado ya no cambia a estado `error` — permanece en `verify` con flag `duplicado: true` expuesto al componente, para que el usuario pueda editar los datos
  2. **Guardar imagen**: nueva función `subirImagen()` que sube el blob a Supabase Storage (`tickets/{userId}/{timestamp}.jpg`) antes del INSERT; degradación suave si falla
  3. **`duplicado`** movido al hook (antes era estado local de `Scan.tsx`)
- `src/pages/Scan.tsx` — añadido botón "Galería" con `<input type="file accept="image/*">` junto al botón de cámara; el `File` seleccionado se pasa directamente a `enviar()` sin cambios en el hook

### Decisiones tomadas

- **Formato `/v1/chat/completions`**: DeepSeek-VL es un modelo conversacional — el formato VQA estándar de HF no es compatible. El endpoint chat completions con `content: [{type: image_url}, {type: text}]` es el correcto para modelos multimodales.
- **`pipeline_tag: image-text-to-text`**: Necesario añadirlo manualmente en HuggingFace para que la Inference API serverless reconozca el modelo. Sin él devuelve 503.
- **Bucket `tickets` privado**: Las imágenes de tickets contienen datos personales — el bucket debe ser privado. La URL pública se guarda en `imagen_url` pero el bucket requiere autenticación para acceder al contenido real.
- **`duplicado` en el hook**: Centralizar el estado en `useScan` evita sincronización entre hook y componente; `Scan.tsx` solo consume el flag.
- **Input `accept="image/*"`**: Permite seleccionar tanto fotos de la galería como archivos de imagen desde el explorador de archivos, cubriendo el caso de escritorio sin cámara.

### Requisito previo manual (Supabase)
Crear el bucket en Supabase Dashboard → Storage → New bucket:
- **Nombre**: `tickets`
- **Tipo**: Private
- **Política RLS recomendada**: permitir INSERT/SELECT donde `auth.uid()::text = (storage.foldername(name))[1]`

### Cómo probar

```bash
vercel dev   # Puerto 3000
```

1. Navegar a `/scan`
2. **Con cámara**: capturar foto → spinner → tabla verificación → confirmar → ticket guardado
3. **Sin cámara**: pulsar "Galería" → seleccionar imagen desde el explorador → mismo flujo
4. **Duplicado**: intentar guardar dos veces el mismo ticket → en la segunda aparece el banner amarillo de aviso en la tabla de verificación, permitiendo editar los datos
5. Verificar en Supabase → Storage → `tickets` → aparece la imagen subida
6. Verificar en Supabase → Table Editor → `ticket` → campo `imagen_url` relleno

> **Requisitos previos**: `HF_API_TOKEN` + `HF_MODEL_ID=Lacax/deepseek_ocr_lora` en `.env.local` y bucket `tickets` creado en Supabase Storage.
> El `pipeline_tag: image-text-to-text` debe estar añadido en el model card de HuggingFace.

---

## Pendiente para la próxima sesión

> **Retomar desde aquí:** Fase 8.1 completada al 100%.
> **Siguiente paso: probar el flujo completo con `vercel dev`** — subir una imagen real de ticket y verificar que el modelo OCR devuelve JSON válido.
> **Siguiente fase tras validar el OCR: Fase 9 — QA y Deploy**.
> Antes de empezar Fase 9: actualizar `plan.md`.

---

## Fase 9 — QA y Deploy (en curso)

### Sesión 2026-04-12 — Tarea 9.4: USE_MOCK desactivado

**Qué se hizo:**
- Cambiado `const USE_MOCK = true` → `false` en `src/hooks/useTickets.ts:5`
- El donut y la lista de gastos ahora consultan `/api/tickets` con el usuario autenticado real (Supabase)
- Añadido try/catch en `getSession()` dentro del hook para evitar estado colgado si el token es inválido

**Decisión:** El endpoint `/api/tickets` calcula el `total` de cada ticket sumando sus productos — no se necesita columna `total` en la tabla `ticket`. Bug E no requiere cambio de schema.

**Cómo probar:**
1. Desplegar en Vercel (push a `Feature-App-Stack`)
2. Iniciar sesión en la app
3. Si hay tickets guardados en Supabase del mes en curso → deben aparecer en el donut
4. Si el donut aparece vacío pero hay tickets en Supabase → revisar la respuesta de `/api/tickets` en Network

**Pendiente (manual en Supabase Dashboard):**
- Tarea 9.1: Crear bucket `tickets` → Storage → New bucket → nombre `tickets` → Private ✅
- Tarea 9.2: Añadir RLS policy INSERT Storage ✅

---

### Sesión 2026-04-12 — Tareas 9.3 + 9.5: Deduplicación de productos con tabla intermedia

**Qué se hizo:**

Rediseño del modelo de datos de productos para evitar duplicados en el catálogo:

- `producto` pasa a ser un **catálogo compartido**: solo guarda `descripcion` y `precio_unitario`. Sin `ticket_id`, `cantidad` ni `precio_total`.
- Nueva tabla **`ticket_producto`** (N:M): asocia un ticket con un producto y añade `cantidad` y `precio_total` de esa línea.
- Índice único funcional `lower(descripcion), precio_unitario` — evita duplicados aunque el OCR devuelva mayúsculas/minúsculas inconsistentes.
- `useScan.ts → guardar()`: antes de insertar un producto, busca en el catálogo por `ilike(descripcion)` + `precio_unitario`. Si existe, reutiliza el id. Si no, lo crea. Luego inserta en `ticket_producto`.
- `api/tickets.ts`: la query ahora une a través de `ticket_producto` y aplana los datos al mismo formato `Producto` que espera el frontend — sin cambios en los componentes de UI.

**Archivos modificados:**
- `database/migration_ticket_producto.sql` — script de migración para ejecutar en Supabase SQL Editor
- `database/schema.sql` — schema canónico actualizado
- `src/hooks/useScan.ts` — función `guardar()` con deduplicación
- `api/tickets.ts` — query a través de `ticket_producto`

**Cómo aplicar (manual):**
1. Supabase Dashboard → SQL Editor → pegar y ejecutar `database/migration_ticket_producto.sql`
2. Desplegar en Vercel
3. Escanear un ticket y verificar en Supabase que: se crea 1 fila en `ticket`, N filas en `ticket_producto`, y los productos en `producto` no se repiten si coinciden nombre+precio

**Decisiones:**
- El catálogo es compartido entre todos los usuarios (RLS abierto en lectura/insert para autenticados). Esto es correcto para v1.0 — los productos son datos objetivos (nombre + precio), no datos personales.
- No se implementó UPDATE ni DELETE en `producto` — el catálogo es inmutable desde el frontend.

---

### Sesión 2026-04-12 — Tarea 9.6: Presupuesto mensual estimado vs. real

**Qué se hizo:**

- Nuevo hook `src/hooks/usePerfil.ts` — lee `gasto_mensual_estimado` y `ahorro_deseado` de `perfil_usuario` para el usuario autenticado.
- Componente inline `PresupuestoBar` en `Home.tsx` — barra de progreso que compara el gasto real del mes con el estimado definido en el onboarding.
- La barra solo se muestra si el usuario introdujo un `gasto_mensual_estimado > 0` en su perfil.
- Colores adaptativos: verde < 75%, naranja 75–100%, rojo al exceder. Muestra euros restantes o excedidos.

**Archivos modificados:**
- `src/hooks/usePerfil.ts` — nuevo hook
- `src/pages/Home.tsx` — `PresupuestoBar` + uso de `usePerfil`

**Cómo probar:**
1. Asegurarse de tener un valor en `gasto_mensual_estimado` en el perfil (columna en Supabase → tabla `perfil_usuario`).
2. Abrir la pantalla de Gastos — debe aparecer la barra debajo del título y encima del donut.
3. Si el campo es null o 0, la barra no aparece.

---

### Sesión 2026-04-12 — Tarea 9.7: Fix Storage bucket privado

**Qué se hizo:**

- `subirImagen()` en `useScan.ts` guardaba el resultado de `getPublicUrl()` — inaccesible en buckets privados.
- Cambiado para devolver el `path` del archivo (`userId/timestamp.jpg`) en lugar de la URL.
- `imagen_url` en la tabla `ticket` ahora almacena el path, no una URL.

**Por qué:** El bucket `tickets` es privado (datos personales). Las URLs públicas no funcionan. Para mostrar la imagen en el futuro se debe llamar a `supabase.storage.from('tickets').createSignedUrl(path, 3600)` en el componente que la muestre.

**Archivo modificado:** `src/hooks/useScan.ts` → función `subirImagen()`

---

### Sesión 2026-04-12 — Fix VerifyForm: fecha con selector de calendario

**Qué se hizo:**
- El campo fecha en `VerifyForm` era un input de texto libre — difícil de editar y propenso a errores de formato.
- Cambiado a `<input type="date">` con normalización automática de `DD/MM/YYYY` → `YYYY-MM-DD` al montar.
- `useScan.ts → toISODate()` ya manejaba el paso a ISO — sin cambios necesarios allí.

**Por qué:** El usuario necesita poder cambiar la fecha del ticket para que caiga en el mes en curso y aparezca en el donut. El selector de calendario del sistema es la forma más segura.

**Archivo modificado:** `src/components/VerifyForm.tsx`

---

### Sesión 2026-04-12 — Mejoras UI: donut clickable, drill-down con productos, perfil financiero

**Qué se hizo:**

**DonutChart:**
- Los segmentos del donut ahora son clickables y abren el panel de la categoría correspondiente.
- Eliminado el cuadrado negro de focus: `activeIndex={-1}` + `outline: none` en el chart y los segmentos.
- Nuevo prop `onSelectCategoria` (opcional) — si no se pasa, el donut es solo visual.

**DrillDown:**
- Cada ticket es ahora expandible — al pulsar muestra sus productos.
- Botón "Precio ↑/↓" para ordenar los productos por precio_total ascendente o descendente.
- Estado de expansión independiente por ticket (uno abierto a la vez).

**Perfil financiero en Home:**
- `usePerfil` ahora también carga `gastos_fijos`.
- Se muestra una tarjeta con el ahorro objetivo (€/mes) y los gastos fijos (texto libre del onboarding) cuando el usuario los haya rellenado.

**Archivos modificados:**
- `src/components/DonutChart.tsx`
- `src/components/DrillDown.tsx`
- `src/hooks/usePerfil.ts`
- `src/pages/Home.tsx`

---

### Sesión 2026-04-12 — Gastos fijos, emojis, tema y rediseño Home

**Qué se hizo:**

**Gastos fijos en el donut:**
- Nueva tabla `gasto_fijo` (usuario_id, nombre, precio, emoji, categoria_id, activo).
- Hook `useGastosFijos` con CRUD completo: `crear`, `actualizar`, `eliminar` (soft delete con `activo=false`).
- Los gastos fijos se suman a los totales por categoría en el donut (combinados con gastos de tickets).
- Las categorías con algún gasto fijo muestran el icono 🔒 en `CategoriaList`.
- En `DrillDown`, al abrir una categoría se muestra primero la sección "Gastos fijos" y luego los tickets.

**Modal de gestión:**
- `GastosFijosModal` — panel deslizante (igual estilo que DrillDown) con lista + formulario inline.
- Formulario: selector de emoji (grid), nombre, importe mensual, categoría (dropdown Supabase).
- Accesible desde botón "🔒 Fijos" en la cabecera de Home.

**Sistema de emojis:**
- `categoryColors.ts` exporta `getCategoryEmoji()` con mapa fijo para las 6 categorías del sistema.
- `EMOJIS_GASTO` — lista de 25 emojis seleccionables para gastos fijos.
- `CategoriaList` muestra el emoji en una burbuja coloreada en lugar del punto de color anterior.

**Rediseño Home:**
- Eliminados los dos paneles de presupuesto y ahorro.
- Sustituidos por una mini barra de progreso de una línea bajo el título (solo visible si el usuario tiene gasto estimado configurado).
- El donut se muestra también cuando hay gastos fijos aunque no haya tickets escaneados.

**Tema claro/oscuro:**
- Revisado `useTheme.ts` — implementación correcta: `localStorage` (instantáneo) + Supabase (sincronización entre dispositivos). Sin bug. Persiste correctamente entre recargas.

**Archivos creados/modificados:**
- `database/migration_gasto_fijo.sql` — ejecutar en Supabase SQL Editor
- `database/schema.sql` — tabla `gasto_fijo` añadida
- `src/lib/categoryColors.ts` — `getCategoryEmoji`, `EMOJIS_GASTO`
- `src/hooks/useGastosFijos.ts` — nuevo hook CRUD
- `src/components/GastosFijosModal.tsx` — nuevo componente
- `src/components/CategoriaList.tsx` — emojis + candado
- `src/components/DrillDown.tsx` — sección gastos fijos
- `src/pages/Home.tsx` — rediseño completo

---

## Mejoras para v2 — Backlog de Requisitos Funcionales

> Esta sección recoge las mejoras identificadas durante el desarrollo de v1.0 que no entraron en scope.
> Formato RF (Requisito Funcional) para facilitar su incorporación en la memoria del TFG o en el planning de v2.

---

### RF-V2-01 — Historial de meses anteriores
**Descripción:** El usuario puede navegar entre meses anteriores en la pantalla de Gastos.
**Motivación:** Actualmente solo se muestra el mes en curso. El usuario no puede ver su historial.
**Impacto:** Alto — funcionalidad básica de cualquier app de finanzas personales.
**Requisitos técnicos:** Selector de mes en la cabecera de Home; parametrizar el rango de fechas en `/api/tickets`.

---

### RF-V2-02 — Edición de tickets guardados
**Descripción:** El usuario puede editar un ticket ya guardado (corregir comercio, fecha, productos).
**Motivación:** El OCR puede cometer errores que el usuario solo detecta después de guardar.
**Impacto:** Alto — la verificación post-guardado es necesaria para mantener datos limpios.
**Requisitos técnicos:** Endpoint PATCH `/api/tickets/:id`; reutilizar `VerifyForm` en modo edición.

---

### RF-V2-03 — Eliminación de tickets
**Descripción:** El usuario puede eliminar un ticket guardado (con confirmación).
**Motivación:** Corrección de errores o duplicados no detectados.
**Impacto:** Medio.
**Requisitos técnicos:** Soft delete (`eliminado = true`) en tabla `ticket`; filtrar en `/api/tickets`.

---

### RF-V2-04 — Modelo OCR de mayor calidad
**Descripción:** Sustituir el pipeline OCR.space + DeepSeek-chat por un LLM con visión (GPT-4o mini, Gemini Flash, Claude Haiku) que procese imagen → JSON en un solo paso.
**Motivación:** OCR.space tiene calidad limitada con tickets de baja resolución o letra pequeña. El pipeline de dos pasos introduce latencia y puntos de fallo.
**Impacto:** Alto — calidad del producto principal.
**Hoja de ruta:** OCR.space+DeepSeek (v1) → LLM visión (v2) → modelo fine-tuned propio (v3 si el tiempo lo permite).

---

### RF-V2-05 — Notificaciones de presupuesto
**Descripción:** Alerta al usuario cuando supera el 80% y el 100% del gasto mensual estimado.
**Motivación:** El indicador visual existe pero es pasivo — el usuario tiene que abrir la app.
**Impacto:** Medio — mejora el valor de la app de finanzas.
**Requisitos técnicos:** Push notifications (web push API) o email via Supabase Edge Functions.

---

### RF-V2-06 — Categorías personalizables
**Descripción:** El usuario puede crear, renombrar y asignar color/emoji a sus propias categorías.
**Motivación:** Las 6 categorías fijas no cubren todos los casos de uso (ej: mascotas, viajes, regalos).
**Impacto:** Medio.
**Requisitos técnicos:** Tabla `categoria_usuario`; lógica de fallback a categorías del sistema.

---

### RF-V2-07 — Exportación de datos
**Descripción:** El usuario puede exportar sus gastos del mes (o un rango) en CSV o PDF.
**Motivación:** Utilidad para declaración de impuestos, seguimiento personal o transferencia a otras apps.
**Impacto:** Bajo-medio.
**Requisitos técnicos:** Endpoint GET `/api/export?format=csv&from=&to=`; generación de PDF con jsPDF o similar.

---

### RF-V2-08 — Imagen del ticket visible en detalle
**Descripción:** Al abrir un ticket en DrillDown, el usuario puede ver la foto del ticket escaneado.
**Motivación:** Útil para verificar el OCR o recordar compras.
**Requisitos técnicos:** `supabase.storage.createSignedUrl(path, 3600)` en el componente de detalle; `imagen_url` ya guarda el path.

---

### RF-V2-09 — Modo compartido / multi-usuario por hogar
**Descripción:** Varios usuarios pueden compartir un "hogar" y ver gastos combinados.
**Motivación:** Parejas o familias que comparten presupuesto.
**Impacto:** Alto en diferenciación, alto en complejidad.
**Requisitos técnicos:** Tabla `hogar`; invitaciones; RLS por `hogar_id`.

---

### RF-V2-10 — Gestión del perfil financiero desde la app
**Descripción:** El usuario puede modificar su gasto estimado, ahorro deseado y gastos fijos desde la pantalla de Cuenta (sin tener que pasar por el onboarding).
**Motivación:** Los valores introducidos en el onboarding pueden cambiar con el tiempo.
**Impacto:** Medio — mejora la usabilidad del perfil.
**Requisitos técnicos:** Formulario editable en `Cuenta.tsx`; PATCH a `perfil_usuario`.
