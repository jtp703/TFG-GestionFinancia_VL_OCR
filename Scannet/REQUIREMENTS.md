# REQUIREMENTS.md — Scannet

Documento de referencia completo para el agente. Consolida todos los requisitos
funcionales (RF) y de interfaz (RUI) de la aplicación.

> Leer este documento antes de implementar cualquier funcionalidad.
> Para decisiones visuales detalladas por vista, consultar también `STYLE_GUIDE.md`.

---

## Índice

1. [Descripción general](#1-descripción-general)
2. [Usuarios y autenticación](#2-usuarios-y-autenticación)
3. [Estructura de navegación](#3-estructura-de-navegación)
4. [Vista: Gestionar Gastos](#4-vista-gestionar-gastos)
5. [Vista: Escanear Ticket](#5-vista-escanear-ticket)
6. [Vista: Cuenta](#6-vista-cuenta)
7. [Modelo de datos](#7-modelo-de-datos)
8. [Requisitos no funcionales](#8-requisitos-no-funcionales)
9. [Fuera de scope v1.0](#9-fuera-de-scope-v10--no-implementar)

---

## 1. Descripción general

Aplicación web **mobile-first** de gestión personal de gastos basada en OCR.
El usuario fotografía tickets de compra, el sistema los procesa automáticamente,
y presenta los gastos desglosados por categorías, comercios y productos.

| Atributo | Valor |
|---|---|
| Plataforma | Web app (navegador). No es app nativa. |
| Diseño | Mobile-first. Adaptable a escritorio. |
| Tema por defecto | Claro. El usuario puede cambiar a oscuro desde Cuenta. |
| Versión actual | v1.0 Beta |
| Modelo OCR | DeepSeek-VL con LoRA — `Lacax/Tickets` en HuggingFace |
| Categorización | DeepSeek API (LLM externo) |

---

## 2. Usuarios y autenticación

### RF — Registro e inicio de sesión

| ID | Requisito | Prioridad |
|---|---|---|
| RF-01.1 | El sistema permite registro con email y contraseña. | Alta |
| RF-01.2 | El sistema autentica usuarios registrados con email y contraseña. | Alta |
| RF-01.3 | Cada usuario accede únicamente a sus propios datos. | Alta |
| RF-01.4 | Las sesiones tienen expiración configurable. | Alta |
| RF-01.5 | El usuario puede cerrar sesión desde Cuenta, siendo redirigido al login. | Alta |

### RF — Onboarding (cuestionario tras registro)

| ID | Requisito | Prioridad |
|---|---|---|
| RF-02.1 | Tras registrarse, el usuario completa un cuestionario de perfil financiero. | Alta |
| RF-02.2 | Pregunta 1: ¿Cuánto sueles gastar al mes? (numérico, €/mes) | Alta |
| RF-02.3 | Pregunta 2: ¿Cuánto quieres ahorrar al mes? (numérico, €/mes) | Alta |
| RF-02.4 | Pregunta 3: ¿Tienes gastos fijos mensuales? (texto libre) | Alta |
| RF-02.5 | El usuario puede omitir cualquier pregunta del onboarding. | Media |

### RUI — Login y onboarding

| ID | Requisito | Prioridad |
|---|---|---|
| RUI-01.1 | Pantalla de login sin barra de navegación. Card centrada, máx. 400px. | Alta |
| RUI-01.2 | Formulario: campo email + campo contraseña + CTA "Iniciar sesión" full-width. | Alta |
| RUI-01.3 | Enlace "Regístrate aquí" visible bajo el formulario. | Alta |
| RUI-01.4 | Onboarding: preguntas presentadas de una en una con indicador de progreso (1/3, 2/3, 3/3). | Media |
| RUI-01.5 | Cada paso del onboarding tiene botón "Siguiente →" (CTA brand) y opción "Omitir" (ghost). | Media |

---

## 3. Estructura de navegación

La app tiene **tres secciones principales** accesibles desde la barra de navegación.

| Sección | Icono | Descripción |
|---|---|---|
| Scanner | Icono cámara | Captura y procesamiento de tickets |
| Gestionar Gastos | Icono ticket/gráfico | Vista principal de gastos del mes |
| Cuenta | Icono usuario | Sesión y preferencias |

### RF — Navegación

| ID | Requisito | Prioridad |
|---|---|---|
| RF-03.1 | La barra de navegación está siempre visible mientras el usuario está autenticado. | Alta |
| RF-03.2 | La transición entre secciones es instantánea (SPA), sin recarga de página. | Alta |

### RUI — Navegación

| ID | Requisito | Prioridad |
|---|---|---|
| RUI-02.1 | **Escritorio (≥768px):** sidebar izquierdo vertical fijo, ~64px de ancho. Tres iconos apilados: Scanner (arriba), Gastos (centro), Cuenta (abajo). Sin labels de texto. | Alta |
| RUI-02.2 | **Móvil (<768px):** barra inferior fija, 56px de alto. Mismos tres iconos en horizontal con label debajo (11px). | Alta |
| RUI-02.3 | Icono activo: color `#0E6B55` (brand). Icono inactivo: color muted. Transición fade 150ms. | Alta |
| RUI-02.4 | Fondo del nav/sidebar: `--surface` (blanco en claro, `#252B3B` en oscuro). | Alta |

---

## 4. Vista: Gestionar Gastos

Vista de inicio de la aplicación tras autenticarse.

### RF — Panel de gastos

| ID | Requisito | Prioridad |
|---|---|---|
| RF-04.1 | La vista muestra el gasto total acumulado del mes en curso. | Alta |
| RF-04.2 | El gasto se desglosa por categorías, mostrando importe y porcentaje de cada una sobre el total. | Alta |
| RF-04.3 | Las categorías del sistema son fijas: Alimentación, Transporte, Ocio, Hogar, Salud, Otros. | Alta |
| RF-04.4 | Si el usuario no tiene tickets, se muestra un estado vacío con CTA que navega a Scanner. | Alta |
| RF-04.5 | La asignación de comercio a categoría es automática (vía LLM), no manual. | Alta |
| RF-04.6 | El sistema detecta y rechaza tickets duplicados: mismo comercio + fecha + total. | Media |
| RF-04.7 | Solo se muestran datos del mes en curso. No hay historial de meses anteriores en v1.0. | Alta |

### RF — Drill-down de detalle

| ID | Requisito | Prioridad |
|---|---|---|
| RF-05.1 | Al seleccionar una categoría, el sistema muestra los comercios de esa categoría en el mes actual con el gasto total por comercio. | Alta |
| RF-05.2 | Al seleccionar un comercio, el sistema muestra el listado de productos: descripción, cantidad, precio por unidad y precio total. | Alta |
| RF-05.3 | El usuario puede cerrar el detalle y volver al gráfico principal. | Alta |

### RUI — Gráfico y layout

| ID | Requisito | Prioridad |
|---|---|---|
| RUI-03.1 | **v1.0:** gráfico de tipo donut (PieChart con innerRadius) como elemento protagonista, centrado y de gran tamaño. | Alta |
| RUI-03.2 | El total del mes se muestra en el centro del donut: `36px / 500`. | Alta |
| RUI-03.3 | Cada segmento del donut usa el color de su categoría (pastel en claro, eléctrico en oscuro). | Alta |
| RUI-03.4 | La interacción con el donut es tap/click en segmento → abre panel de detalle. Sin tooltips complejos. | Alta |
| RUI-03.5 | Separación visual entre segmentos: trazo de 2px con el color de fondo. | Media |

### RUI — Drill-down

| ID | Requisito | Prioridad |
|---|---|---|
| RUI-04.1 | **Escritorio:** al activar el drill-down, el donut se reduce a la izquierda y el panel de detalle aparece como card a la derecha con slide desde derecha (200ms ease-out). Ambos conviven en pantalla. | Alta |
| RUI-04.2 | **Móvil:** al activar el drill-down, el donut se oculta y la card de detalle ocupa la pantalla completa. Botón "← Volver" en el header para regresar al donut. | Alta |
| RUI-04.3 | Header de la card de detalle: fondo color de categoría al 15-20% opacidad, texto en color sólido de categoría. Nombre de categoría en H2. | Alta |
| RUI-04.4 | Tabla de productos: columnas Producto, Cantidad, Precio/ud, Total. Filas separadas por `--border`. Sin bordes entre columnas. | Alta |

### RUI — Estado vacío

| ID | Requisito | Prioridad |
|---|---|---|
| RUI-05.1 | Icono ilustrativo de ticket vacío, centrado en el área de contenido. | Alta |
| RUI-05.2 | Texto principal: "Aún no tienes gastos registrados este mes" (20px / 500). | Alta |
| RUI-05.3 | Texto secundario muted debajo (15px / 400). | Alta |
| RUI-05.4 | Botón CTA brand: "Escanea tu primero" — navega a la sección Scanner. | Alta |

---

## 5. Vista: Escanear Ticket

Esta vista tiene **dos estados** que se navegan como sliders horizontales en móvil.

### Estado 1 — Captura de imagen

#### RF

| ID | Requisito | Prioridad |
|---|---|---|
| RF-06.1 | La app solicita permiso de acceso a la cámara del dispositivo al entrar en esta sección (Web API estándar). | Alta |
| RF-06.2 | El visor de cámara se muestra en tiempo real. Al capturar, la foto reemplaza el visor en el mismo espacio. | Alta |
| RF-06.3 | El usuario selecciona método de pago (Efectivo / Tarjeta) antes de procesar. Este dato NO lo extrae el modelo. | Alta |
| RF-06.4 | El botón "Continuar" solo es pulsable si hay imagen capturada Y método de pago seleccionado. | Alta |
| RF-06.5 | Al pulsar "Continuar", se envía la imagen a `/api/scan` para procesamiento OCR. | Alta |
| RF-06.6 | Durante el procesamiento, el botón muestra un spinner y se deshabilita. | Alta |
| RF-06.7 | Al pulsar "Tomar de nuevo", se descarta la imagen y se reactiva la cámara. | Alta |

#### RUI

| ID | Requisito | Prioridad |
|---|---|---|
| RUI-06.1 | La cámara ocupa el área principal de contenido de forma prominente. | Alta |
| RUI-06.2 | Selector de método de pago: dos botones toggle (Efectivo / Tarjeta), uno activo a la vez. Activo: fondo brand, texto blanco. Inactivo: ghost. | Alta |
| RUI-06.3 | Botón "Tomar de nuevo": ghost button, alineado a la izquierda. | Alta |
| RUI-06.4 | Botón "Continuar →": CTA brand, alineado a la derecha (escritorio) o full-width (móvil). | Alta |
| RUI-06.5 | Indicador de progreso en móvil: "1/2" en el header. | Media |

### Estado 2 — Verificación de productos

#### RF

| ID | Requisito | Prioridad |
|---|---|---|
| RF-07.1 | Tras el OCR, SIEMPRE se muestra la pantalla de verificación antes de guardar en base de datos. | Alta |
| RF-07.2 | Se muestra un listado editable con los productos extraídos: descripción, cantidad y precio por unidad como campos editables inline. | Alta |
| RF-07.3 | El usuario puede eliminar cualquier fila de producto. | Alta |
| RF-07.4 | El usuario puede añadir una fila de producto nueva con "+ Añadir producto". | Alta |
| RF-07.5 | El total escaneado se recalcula dinámicamente al editar cantidades o precios. | Alta |
| RF-07.6 | Al pulsar "Confirmar productos", los datos se guardan en Supabase con `verificado = true`. | Alta |
| RF-07.7 | Los datos verificados se conservan para re-entrenamiento futuro del modelo. | Media |
| RF-07.8 | Si el OCR falla, se muestra un mensaje de error con opciones "Reintentar" y "Cancelar". | Alta |

#### RUI

| ID | Requisito | Prioridad |
|---|---|---|
| RUI-07.1 | **Móvil:** los estados captura y verificación son dos slides horizontales. Indicador "2/2" en el header. | Alta |
| RUI-07.2 | **Escritorio:** la imagen del ticket se muestra como thumbnail a la izquierda; la card de verificación ocupa la derecha. | Alta |
| RUI-07.3 | Header de la card de verificación: fondo `--color-brand`, texto blanco, "VERIFICA TU TICKET" en H1. | Alta |
| RUI-07.4 | Cabecera de tabla: Producto / Cantidad / Precio/ud — en caption muted. | Alta |
| RUI-07.5 | Campos de fila editables inline: sin borde visible salvo en estado focus (border brand). | Alta |
| RUI-07.6 | Icono de borrado (SVG papelera) al final de cada fila, alineado a la derecha. | Alta |
| RUI-07.7 | "+ Añadir producto": ghost button, alineado a la izquierda, debajo de la última fila. | Alta |
| RUI-07.8 | "Total escaneado: X,XX €": texto muted, no editable, al fondo de la card antes del CTA. | Alta |
| RUI-07.9 | "CONFIRMAR PRODUCTOS": CTA brand, ancho completo de la card. | Alta |

---

## 6. Vista: Cuenta

### RF

| ID | Requisito | Prioridad |
|---|---|---|
| RF-08.1 | El usuario puede alternar entre tema claro y oscuro. La preferencia se persiste entre sesiones. | Alta |
| RF-08.2 | El usuario puede cerrar sesión. Se muestra confirmación antes de ejecutar el logout. | Alta |
| RF-08.3 | Tras confirmar el logout, el usuario es redirigido al login. | Alta |

### RUI

| ID | Requisito | Prioridad |
|---|---|---|
| RUI-08.1 | La vista muestra el email del usuario autenticado con un avatar de iniciales. | Alta |
| RUI-08.2 | Toggle "Tema oscuro": interruptor on/off. El cambio se aplica globalmente con transición 200ms. | Alta |
| RUI-08.3 | Botón "Cerrar sesión": ghost button con texto `#DC2626` (rojo). | Alta |
| RUI-08.4 | Modal de confirmación de logout: overlay `rgba(0,0,0,0.4)`, card centrada con botones "Cancelar" (ghost) y "Cerrar sesión" (fondo rojo, texto blanco). | Alta |
| RUI-08.5 | Esta vista no tiene más opciones en v1.0. | Alta |

---

## 7. Modelo de datos

### Jerarquía

```
Usuario
└── Categoria (asignada automáticamente por LLM)
    └── Comercio
        └── Ticket (fecha, método de pago)
            └── Producto (descripcion, cantidad, precio_unitario, precio_total)
```

### Tablas

**ticket**

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | uuid PK | — |
| `usuario_id` | uuid | referencia a auth.users de Supabase |
| `imagen_url` | text | ruta en Supabase Storage |
| `json_extraido` | jsonb | resultado raw del modelo OCR |
| `metodo_pago` | text | "efectivo" \| "tarjeta" — lo aporta el usuario |
| `fecha` | date | extraída por OCR |
| `comercio` | text | extraído por OCR |
| `categoria_id` | uuid FK | asignada por LLM tras el escaneo |
| `verificado` | boolean | true si el usuario validó los datos |
| `timestamp` | timestamptz | fecha y hora del escaneo |

**producto**

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | uuid PK | — |
| `ticket_id` | uuid FK | — |
| `descripcion` | text | — |
| `cantidad` | numeric | — |
| `precio_unitario` | numeric | — |
| `precio_total` | numeric | — |

**categoria**

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | uuid PK | — |
| `nombre` | text | Alimentación, Transporte, Ocio, Hogar, Salud, Otros |

### Reglas de integridad

- Las categorías son **fijas** en v1.0. No crear ni permitir categorías personalizadas.
- Antes de persistir un ticket, verificar duplicados por `(comercio + fecha + total)`.
- El campo `metodo_pago` nunca lo rellena el modelo — siempre lo aporta el usuario.
- Solo se guardan datos tras la confirmación del usuario en la pantalla de verificación.

---

## 8. Requisitos no funcionales

### Rendimiento

| ID | Requisito |
|---|---|
| RNF-01 | Durante el procesamiento OCR, mostrar indicador de progreso/spinner. No bloquear la navegación. |
| RNF-02 | Las transiciones de UI no deben superar 200ms. |

### Seguridad

| ID | Requisito |
|---|---|
| RNF-03 | Autenticación por email/contraseña con almacenamiento seguro (Supabase Auth). |
| RNF-04 | Comunicaciones cifradas mediante HTTPS. |
| RNF-05 | El frontend nunca llama directamente a HuggingFace ni a DeepSeek API — siempre vía `/api/*`. |
| RNF-06 | Todos los secrets en variables de entorno. Nunca en el código fuente. |
| RNF-07 | `SUPABASE_SERVICE_ROLE_KEY`, `HF_API_TOKEN` y `DEEPSEEK_API_KEY` solo accesibles desde Vercel Functions. |

### Compatibilidad

| ID | Requisito |
|---|---|
| RNF-08 | Compatible con Chrome, Firefox, Safari y Edge modernos. |
| RNF-09 | Diseño responsive: mobile-first (<768px) y adaptado a escritorio (≥768px). |

---

## 9. Fuera de scope v1.0 — no implementar

Los siguientes requisitos están planificados para versiones futuras.
El agente **no debe implementarlos** aunque parezcan lógicos o sencillos.

| Funcionalidad | Versión planificada |
|---|---|
| Selector de tipo de gráfico (barras, puntos) | v2.0 |
| Historial de meses anteriores | v2.0 |
| Edición de metas de ahorro desde Cuenta | v2.0 |
| Notificaciones de gasto al acercarse al límite | v2.0 |
| Gestión de datos personales (RGPD) | v2.0 |
| Categorías personalizables por el usuario | v2.0 |
| Roles adicionales (administrador, etc.) | v2.0 |
