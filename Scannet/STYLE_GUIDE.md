# STYLE_GUIDE.md — Scannet

Referencia visual completa. Consultar antes de maquetar cualquier vista.
Este documento responde a: _¿qué se espera visualmente de esta pantalla?_

---

## 1. Sistema de diseño

### Filosofía
Minimalista, visual y limpio. El espacio vacío es un elemento de diseño, no un fallo.
Cada vista tiene un único protagonista visual (donut, cámara, formulario).
El resto de la interfaz es soporte, no decoración.

### Fuente
**Inter** — Google Fonts. Solo weights 400 y 500. No usar 600, 700 ni italic.

```
H1       → 28px / 500  → Títulos de sección ("Gestiona", "Scanea tu ticket")
H2       → 20px / 500  → Nombres de categoría, subtítulos de card
Body     → 15px / 400  → Contenido general, filas de tabla, etiquetas
Caption  → 12px / 400  → Fechas, metadata, texto muted
Dato XL  → 36px / 500  → Total del mes (dentro del donut)
```

### Paleta de tokens

```
FONDOS
--bg-light         #F7F5F0   beige cálido — fondo general modo claro
--bg-dark          #1A1F2E   azul grisáceo oscuro — fondo general modo oscuro

SUPERFICIES
--surface-light    #FFFFFF   cards, sidebar, modales
--surface-dark     #252B3B   cards, sidebar, modales

MARCA
--color-brand      #0E6B55   acento principal: nav activo, CTA, foco
--color-brand-dark #0A4F3E   hover del brand
--color-brand-light #E6F5F1  fondo de highlights brand

TEXTO
--text-primary-light  #111111
--text-primary-dark   #F0F0F0
--text-muted-light    #6B7280
--text-muted-dark     #9CA3AF

BORDES
--border-light     rgba(0,0,0,0.08)
--border-dark      rgba(255,255,255,0.08)
```

### Colores de categorías

Siempre usar el par correcto según el tema activo.

| Categoría    | Claro (pastel) | Oscuro (eléctrico) |
|--------------|----------------|--------------------|
| Alimentación | `#F4A261`      | `#FF6B2B`          |
| Transporte   | `#81B1D4`      | `#00AAFF`          |
| Ocio         | `#A8D5A2`      | `#00E676`          |
| Hogar        | `#C9A8D4`      | `#E040FB`          |
| Salud        | `#F2A0AC`      | `#FF4081`          |
| Otros        | `#B5C4B1`      | `#69F0AE`          |

### Componentes base

**Card**
```
background:    var(--surface)
border:        0.5px solid var(--border)
border-radius: 12px
padding:       1rem 1.25rem
```

**Botón CTA primario**
```
background:    var(--color-brand)
color:         #FFFFFF
border-radius: 10px
padding:       10px 20px
font:          15px / 500
hover:         background var(--color-brand-dark)
```

**Botón secundario / ghost**
```
background:    transparent
border:        0.5px solid var(--border)
color:         var(--text-muted)
border-radius: 10px
```

**Input de texto**
```
background:    var(--surface)
border:        0.5px solid var(--border)
border-radius: 8px
padding:       8px 12px
font:          15px / 400
focus:         border-color var(--color-brand)
```

**Badge / pill de categoría**
```
background:    color de categoría al 20% de opacidad
color:         color de categoría al 100%
border-radius: 20px
padding:       3px 10px
font:          12px / 500
```

### Animaciones

| Acción | Tipo | Duración |
|--------|------|----------|
| Drill-down panel | slide desde derecha | 200ms ease-out |
| Slide móvil OCR (imagen ↔ productos) | slide horizontal | 200ms ease-out |
| Fade de estados vacíos / loading | opacity 0→1 | 150ms ease-out |
| Transición de tema claro/oscuro | todos los colores | 200ms ease-out |
| Icono nav activo | color fade | 150ms ease-out |

Prohibido: bounce, spring, blur, glassmorphism, sombras animadas.

---

## 2. Navegación

### Estructura de layout

**Escritorio (≥768px)**
```
┌──────┬─────────────────────────────┐
│      │                             │
│ NAV  │     CONTENIDO PRINCIPAL     │
│ 64px │                             │
│      │                             │
└──────┴─────────────────────────────┘
```
- Sidebar izquierdo, fijo, 64px de ancho, fondo `--surface`.
- Tres iconos apilados en vertical: Scanner (top), Gastos (center), Cuenta (bottom).
- Sin labels de texto en escritorio — solo iconos.

**Móvil (<768px)**
```
┌─────────────────────────────┐
│                             │
│     CONTENIDO PRINCIPAL     │
│                             │
├─────────────────────────────┤
│   [Scanner] [Gastos] [Cta]  │  ← barra inferior fija, 56px de alto
└─────────────────────────────┘
```
- Barra inferior fija, fondo `--surface`, border-top `--border`.
- Con labels de texto debajo del icono (11px / 400).

### Estado de iconos
- Activo: color `#0E6B55` (brand)
- Inactivo: color `--text-muted`
- Sin background en el icono activo — solo cambio de color

---

## 3. Vista: Gestionar Gastos

### Propósito
Panel principal de la app. Muestra el resumen financiero del mes en curso.

### Layout escritorio
```
┌──────┬──────────────────────────────────────────┐
│      │  Gestiona                                │
│ NAV  │                                          │
│      │         [ DONUT GRANDE ]                 │
│      │       "142,30 €" en centro               │
│      │                                          │
└──────┴──────────────────────────────────────────┘
```

### Layout escritorio con drill-down activo
```
┌──────┬────────────────────┬──────────────────────┐
│      │  Gestiona          │                      │
│ NAV  │                    │  [ CARD DETALLE ]    │
│      │  [ DONUT PEQUEÑO ] │  Header categoría    │
│      │    (reducido)      │  Tabla productos     │
│      │                    │                      │
└──────┴────────────────────┴──────────────────────┘
```

### Layout móvil — vista principal
```
┌─────────────────────────┐
│ Gestiona                │
│                         │
│     [ DONUT GRANDE ]    │
│    "142,30 €" centro    │
│                         │
│  ● Alimentación  42%    │
│  ● Transporte    18%    │
│  ● Ocio          12%    │
├─────────────────────────┤
│ [Scanner] [Gastos] [Cta]│
└─────────────────────────┘
```

### Layout móvil — con drill-down activo
En móvil, el panel de detalle NO convive con el donut.
El donut se oculta y la card de detalle ocupa el espacio completo con swipe-back para volver.
```
┌─────────────────────────┐
│ ← Alimentación          │  ← header de la card con botón volver
│─────────────────────────│
│ Mercadona       24,50 € │
│ Carrefour       12,30 € │
│ Lidl             8,90 € │
│                         │
├─────────────────────────┤
│ [Scanner] [Gastos] [Cta]│
└─────────────────────────┘
```

### Gráfico donut
- Librería sugerida: **Recharts** (PieChart con innerRadius).
- El total del mes se muestra en el centro como texto (`36px / 500`).
- Sin tooltips complejos — al pulsar un segmento se abre el panel de detalle.
- Fondo del hueco: transparente (se ve el fondo de la vista).
- Trazo entre segmentos: 2px `--bg` para separar visualmente.

### Card de detalle de categoría
```
┌─────────────────────────────┐
│ [COLOR] Alimentación        │  ← header con color de categoría, H2
│─────────────────────────────│
│ Producto    Cant  P/ud  Tot │  ← cabecera de tabla (caption, muted)
│─────────────────────────────│
│ Leche entera  2  0,89  1,78 │  ← filas (body 15px)
│ Pan integral  1  1,20  1,20 │
│ ...                         │
└─────────────────────────────┘
```
- Header de la card usa el color de la categoría como fondo (con opacidad 15-20%) y el color sólido como texto.
- Tabla sin bordes entre celdas — separadores `--border` solo en filas.

### Estado vacío
Cuando el usuario no tiene tickets cargados:
```
┌─────────────────────────┐
│ Gestiona                │
│                         │
│    [icono ticket vacío] │
│                         │
│  Aún no tienes gastos   │  ← text-primary / 20px / 500
│  registrados este mes   │  ← text-muted / 15px
│                         │
│  [ Escanea tu primero ] │  ← CTA brand, navega a Scanner
│                         │
└─────────────────────────┘
```

---

## 4. Vista: Escanear Ticket

### Propósito
Captura de la imagen del ticket y posterior verificación de los datos extraídos.
Esta vista tiene **dos estados** que en móvil se navegan como sliders horizontales.

### Estado 1 — Captura de imagen

**Escritorio**
```
┌──────┬──────────────────────────────────────┐
│      │  Scanea tu ticket                    │
│ NAV  │                                      │
│      │   ┌─────────────────────┐            │
│      │   │                     │            │
│      │   │   [Vista cámara /   │            │
│      │   │    imagen subida]   │            │
│      │   │                     │            │
│      │   └─────────────────────┘            │
│      │   Método de pago: [Efectivo][Tarjeta]│
│      │   [Tomar de nuevo]  [Continuar →]    │
└──────┴──────────────────────────────────────┘
```

**Móvil — slider posición 1/2**
```
┌─────────────────────────┐
│ Scanea tu ticket   1/2  │
│                         │
│ ┌─────────────────────┐ │
│ │                     │ │
│ │   [Vista cámara /   │ │
│ │    imagen subida]   │ │
│ │                     │ │
│ └─────────────────────┘ │
│ [Efectivo]  [Tarjeta]   │
│ [Tomar de nuevo]        │
│ [Continuar →] (brand)   │
├─────────────────────────┤
│ [Scanner] [Gastos] [Cta]│
└─────────────────────────┘
```

- La cámara ocupa el área principal. Al capturar, se muestra la foto tomada en el mismo espacio.
- El usuario puede retomar la foto pulsando "Tomar de nuevo" — descarta la imagen y reactiva la cámara.
- El selector de método de pago son dos botones toggle (Efectivo / Tarjeta). Uno activo a la vez.
- "Continuar" solo es pulsable si hay imagen capturada Y método de pago seleccionado.
- Mientras se procesa el OCR, el botón Continuar muestra un spinner y se deshabilita.

### Estado 2 — Verificación de productos

**Escritorio**
```
┌──────┬──────────────────────────────────────────┐
│      │  Scanea tu ticket                        │
│ NAV  │                                          │
│      │  ┌────────────┐  ┌──────────────────┐   │
│      │  │ [Imagen    │  │ VERIFICA TU      │   │
│      │  │  ticket]   │  │ TICKET           │   │
│      │  │            │  │──────────────────│   │
│      │  │  (thumb)   │  │ Prod  Cant P/ud  │   │
│      │  └────────────┘  │ PASTA  1  2,50  │   │
│      │                  │ LECHE  1  1,80  │   │
│      │                  │ [🗑]   editable  │   │
│      │                  │──────────────────│   │
│      │                  │ + Añadir producto│   │
│      │                  │ Total: 24,50 €   │   │
│      │                  │ [CONFIRMAR]      │   │
│      │                  └──────────────────┘   │
└──────┴──────────────────────────────────────────┘
```

**Móvil — slider posición 2/2**
```
┌─────────────────────────┐
│ ← Verificar      2/2   │
│─────────────────────────│
│ VERIFICA TU TICKET      │  ← H1 brand bg, texto blanco
│─────────────────────────│
│ Producto  Cant  P/ud    │  ← cabecera tabla (caption muted)
│─────────────────────────│
│ [PASTA]   [1]  [2,50]  🗑│  ← campos editables inline
│ [LECHE]   [1]  [1,80]  🗑│
│ [HUEVOS]  [6]  [0,50]  🗑│
│─────────────────────────│
│ + Añadir producto       │  ← ghost button
│─────────────────────────│
│ Total escaneado: 24,50 €│  ← caption muted
│                         │
│ [ CONFIRMAR PRODUCTOS ] │  ← CTA brand, full width
├─────────────────────────┤
│ [Scanner] [Gastos] [Cta]│
└─────────────────────────┘
```

### Card de verificación — detalle
- Header: fondo `--color-brand`, texto blanco, `H1 28px/500`.
- Cada fila de producto tiene tres campos editables inline (input limpio, sin borde visible salvo focus).
- Icono de borrado (🗑 o SVG) en cada fila, alineado a la derecha.
- "+ Añadir producto": ghost button, alineado a la izquierda, caption/muted.
- "Total escaneado": texto muted, no editable, se recalcula dinámicamente.
- "Confirmar productos": CTA primario brand, ancho completo de la card.

---

## 5. Vista: Cuenta

### Propósito
Gestión de sesión y preferencias del usuario. Vista mínima y funcional.

### Layout
```
┌──────┬──────────────────────────────────────┐
│      │  Cuenta                              │
│ NAV  │                                      │
│      │  ┌──────────────────────────────┐   │
│      │  │ 👤 usuario@email.com         │   │  ← avatar + email del usuario
│      │  └──────────────────────────────┘   │
│      │                                      │
│      │  ┌──────────────────────────────┐   │
│      │  │ Tema oscuro         [ toggle]│   │  ← toggle on/off
│      │  └──────────────────────────────┘   │
│      │                                      │
│      │  ┌──────────────────────────────┐   │
│      │  │ Cerrar sesión                │   │  ← ghost button destructivo
│      │  └──────────────────────────────┘   │
└──────┴──────────────────────────────────────┘
```

- El toggle de tema cambia entre modo claro y oscuro con transición global de 200ms.
- "Cerrar sesión" es un botón ghost con texto `#DC2626` (rojo). Al pulsarlo, aparece un modal de confirmación antes de ejecutar el logout.
- Esta vista no tiene más opciones en v1.0.

---

## 6. Vista: Login / Registro

### Propósito
Autenticación por email y contraseña. Punto de entrada a la app.

### Layout (centrado, sin navegación lateral)
```
┌──────────────────────────────────┐
│                                  │
│         SCANNET                  │  ← logotipo / nombre, brand color
│                                  │
│  ┌────────────────────────────┐  │
│  │ Email                      │  │  ← input
│  │ Contraseña                 │  │  ← input password
│  │                            │  │
│  │ [ Iniciar sesión ]         │  │  ← CTA brand, full width
│  │                            │  │
│  │ ¿No tienes cuenta?         │  │  ← caption muted
│  │ Regístrate aquí            │  │  ← link brand color
│  └────────────────────────────┘  │
│                                  │
└──────────────────────────────────┘
```

- Sin barra de navegación en login/registro.
- Card centrada en pantalla, ancho máximo 400px, sobre fondo `--bg`.
- Al registrarse, se muestra el flujo de onboarding (mismo estilo de card, pasos progresivos).

### Flujo de onboarding (tras registro)
Tres preguntas presentadas de una en una, con indicador de progreso `1/3`, `2/3`, `3/3`:

1. ¿Cuánto sueles gastar al mes? → input numérico + "€/mes"
2. ¿Cuánto quieres ahorrar al mes? → input numérico + "€/mes"
3. ¿Tienes gastos fijos? → textarea libre

Cada paso tiene botón "Siguiente →" (CTA brand) y opción "Omitir" (ghost button, caption muted).

---

## 7. Estados globales

### Loading
Spinner circular `--color-brand`, 24px, centrado en el área de contenido.
No bloquear la navegación — el spinner va dentro del área de contenido, no sobre toda la pantalla.

### Error de OCR
Card con border `--color-danger` (rojo) informando del fallo.
Dos opciones: "Reintentar" (CTA brand) y "Cancelar" (ghost).

### Confirmación de logout
Modal centrado, fondo overlay `rgba(0,0,0,0.4)`.
```
┌──────────────────────────┐
│ ¿Cerrar sesión?          │
│                          │
│ Esta acción cerrará tu   │
│ sesión actual.           │
│                          │
│ [Cancelar]  [Cerrar →]   │
└──────────────────────────┘
```
- "Cancelar": ghost button.
- "Cerrar sesión": botón fondo `#DC2626`, texto blanco.

---

## 8. Lo que NO hacer

- No usar gradientes en ningún elemento de la UI.
- No usar sombras (`box-shadow`) salvo `0 0 0 Npx` para focus rings.
- No usar más de dos pesos tipográficos (400 y 500).
- No colocar texto sobre el color sólido de categoría — usar el color al 15-20% como fondo y el color sólido como texto.
- No mostrar tooltips complejos sobre el donut — la interacción es tap/click que abre el panel.
- No implementar funcionalidades de v2.0 aunque "tengan sentido": selector de gráfico, historial, notificaciones.
