# Scannet — Aplicación web OCR de tickets

## Leer al inicio de cada sesión

Leer siempre antes de escribir código:
- `Scannet/memory/bot/activeContext.md` — estado actual y próxima acción
- `Scannet/memory/bot/progress.md` — fases completadas, bugs, pendientes
- `Scannet/memory/bot/decisions.md` — decisiones técnicas vigentes (stack, patrones, API)
- `Scannet/memory/bot/features.md` — funcionalidades implementadas por fase

Si la sesión toca el modelo OCR o el deploy RunPod, leer también:
- `memory/bot/activeContext.md`
- `memory/bot/decisions.md`
- `memory/bot/progress.md`

## Actualizar memoria al completar tareas

| Tarea completada | Archivo a actualizar |
|------------------|----------------------|
| Feature implementada | `Scannet/memory/bot/features.md` (con fecha) |
| Issue resuelto | `Scannet/memory/bot/progress.md` (con fecha) |
| Estilo o convención acordada | `Scannet/memory/bot/style.md` (regla vigente, sin fecha) |
| Decisión técnica | `Scannet/memory/bot/decisions.md` (con fecha) |
| Cambio de foco | Reescribir `Scannet/memory/bot/activeContext.md` |
| Deploy o cambio que afecta al modelo | Actualizar también `memory/bot/` |

Hacer el commit de los archivos bot/ junto al código en el mismo commit.

## Descripción

Aplicación web que permite a usuarios subir fotos de tickets españoles,
procesarlos llamando al modelo DeepSeek-VL (vía HuggingFace Inference API),
y consultar el historial del mes en curso.

---

## Stack definitivo

| Capa           | Tecnología                                | Dónde corre              |
| -------------- | ----------------------------------------- | ------------------------ |
| Frontend       | React + Vite + Tailwind CSS               | Vercel (CDN estático)    |
| Backend / API  | Vercel Functions (Node.js)                | Vercel (serverless)      |
| Base de datos  | Supabase (PostgreSQL)                     | Supabase cloud           |
| Autenticación  | Supabase Auth                             | Supabase cloud           |
| Modelo OCR     | DeepSeek-VL vía HuggingFace Inference API | HuggingFace (externo)    |
| Categorización | DeepSeek API (LLM externo)                | DeepSeek cloud (externo) |

> ⚠️ No hay backend Python. No hay FastAPI. No hay RunPod.
> El modelo DeepSeek-VL se llama exclusivamente vía HuggingFace Inference API desde una Vercel Function.
> No proponer ni sugerir migración a Python bajo ningún concepto.

---

## Estructura del proyecto

```
Scannet/
├── src/                        → Frontend React + Vite
│   ├── components/             → Componentes React reutilizables
│   ├── pages/                  → Vistas principales (Home, Scan, History, Verify)
│   ├── hooks/                  → Custom hooks (useAuth, useScan, useTickets)
│   ├── lib/
│   │   └── supabaseClient.ts   → Instancia única del cliente Supabase
│   └── main.tsx
├── api/                        → Vercel Functions (Node.js) — backend
│   ├── scan.ts                 → POST /api/scan — recibe imagen, llama HF, devuelve JSON
│   ├── categorize.ts           → POST /api/categorize — llama DeepSeek API, devuelve categoría
│   └── tickets.ts              → GET /api/tickets — consulta tickets del mes en curso
├── database/
│   └── schema.sql              → Esquema PostgreSQL para Supabase
├── public/
├── .env.local                  → Variables de entorno locales (NO subir a GitHub)
├── .env.example                → Plantilla de variables (SÍ subir a GitHub)
├── vercel.json                 → Configuración de rutas Vercel
├── vite.config.ts
├── package.json
├── plan.md                     → Plan de implementación activo (ver flujo de trabajo)
└── CLAUDE.md                   → Este fichero
```

---

## Variables de entorno

Definir en `.env.local` para desarrollo local y en el panel de Vercel para producción.
Nunca hardcodear secrets en el código.

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # Solo en Vercel Functions, nunca en el frontend
HF_API_TOKEN=                   # HuggingFace Inference API token
HF_MODEL_ID=Lacax/Tickets       # ID del modelo en HuggingFace
DEEPSEEK_API_KEY=               # API key de DeepSeek para categorización
```

> El frontend solo puede acceder a SUPABASE*URL y SUPABASE_ANON_KEY (prefijo VITE*).
> HF_API_TOKEN, SUPABASE_SERVICE_ROLE_KEY y DEEPSEEK_API_KEY solo viven en las Functions.

---

## Base de datos — Modelo de datos

La unidad mínima es el producto, no el ticket. Jerarquía completa:

```
Usuario
└── Categoria (asignada por LLM automáticamente)
    └── Comercio
        └── Ticket (fecha, método de pago)
            └── Producto (descripcion, cantidad, precio_unitario, precio_total)
```

### Tablas

**ticket**

- `id` uuid PK
- `usuario_id` uuid → referencia a auth.users de Supabase
- `imagen_url` text → ruta en Supabase Storage
- `json_extraido` jsonb → resultado raw del modelo OCR
- `metodo_pago` text → "efectivo" | "tarjeta" (lo aporta el usuario, NO el modelo)
- `fecha` date → extraída por OCR
- `comercio` text → extraído por OCR
- `categoria_id` uuid FK → asignada por LLM tras el escaneo
- `verificado` boolean → true si el usuario validó en pantalla de verificación
- `timestamp` timestamptz → fecha y hora del escaneo

**producto**

- `id` uuid PK
- `ticket_id` uuid FK
- `descripcion` text
- `cantidad` numeric
- `precio_unitario` numeric
- `precio_total` numeric

**categoria**

- `id` uuid PK
- `nombre` text

> ⚠️ Las categorías son fijas en v1.0. No implementar categorías personalizables.
> Detectar tickets duplicados por (comercio + fecha + total) antes de persistir.
> En v1.0 solo se consultan datos del mes en curso. Sin historial de meses anteriores.

---

## Integración con el modelo OCR

### Endpoint: POST /api/scan

- Recibe: imagen en multipart/form-data + método_pago seleccionado por el usuario
- Llama a: HuggingFace Inference API con modelo `Lacax/Tickets`
- Devuelve al frontend: JSON con estructura:

```json
{
  "comercio": "MERCADONA, S.A.",
  "cif": "A-46103834",
  "fecha": "15/03/2025",
  "total": 24.5,
  "items": [{ "descripcion": "LECHE ENTERA", "cantidad": 1, "precio": 0.89 }]
}
```

> ⚠️ El modelo NO extrae método de pago. El usuario lo selecciona antes de enviar la imagen.

### Endpoint: POST /api/categorize

- Recibe: nombre del comercio
- Llama a: DeepSeek API (LLM) con prompt de clasificación
- Devuelve: categoría asignada del catálogo fijo de v1.0
- Esta llamada es independiente del OCR — módulo separado, no mezclar lógica

---

## Flujo de verificación (obligatorio en v1.0)

Tras cada procesamiento OCR, SIEMPRE mostrar pantalla de verificación editable
antes de persistir nada en Supabase. El usuario corrige errores campo a campo.
Solo al confirmar, los datos se guardan con `verificado = true`.
Los datos verificados se conservan para re-entrenamiento futuro del modelo.

---

## Comandos de desarrollo

```bash
npm run dev        # Frontend React en local (puerto 5173)
vercel dev         # Frontend + Vercel Functions en local (puerto 3000) — usar para probar /api/*
npm run build      # Build de producción
git push           # Despliega automáticamente en Vercel vía GitHub
```

> Usar siempre `vercel dev` cuando se trabaje con las Functions de /api/.
> `npm run dev` solo sirve para trabajo exclusivo de frontend.

---

## Gestión de tareas — Notion

El progreso del desarrollo se rastrea en un tablero Notion externo.
**Al inicio de cada conversación de desarrollo, consultar Notion antes de escribir código.**

### Credenciales
```
NOTION_TOKEN=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
NOTION_DATABASE_ID=331f05904a318199914cc213984ed132
NOTION_PAGE_URL=https://www.notion.so/Scannet-331f05904a3180f58caeed24bb8cceec
```

### Protocolo de inicio de conversación

Al comenzar cualquier sesión de desarrollo:

1. Consultar el estado actual del tablero Notion (GET tareas por fase).
2. Identificar la fase activa y las tareas pendientes.
3. Confirmar con el usuario: **"Estamos en Fase X — [nombre]. Las tareas pendientes son: [lista]. ¿Continuamos?"**
4. No escribir ninguna línea de código hasta recibir confirmación.

### Protocolo durante el desarrollo

- Al **empezar** una tarea: actualizar su estado a `En progreso` en Notion.
- Al **completar** una tarea: actualizar su estado a `Hecho` en Notion.
- Al **completar una fase entera**: confirmar con el usuario antes de pasar a la siguiente.

### Fases del proyecto

| Fase | Nombre | Tareas |
|------|--------|--------|
| 1 | Setup | 5 |
| 2 | Base de datos | 4 |
| 3 | Autenticación | 5 |
| 4 | Navegación | 4 |
| 5 | Gestionar Gastos | 6 |
| 6 | Escanear Ticket | 8 |
| 7 | Categorización | 2 |
| 8 | Cuenta | 3 |
| 9 | QA y Deploy | 4 |

---

## Flujo de trabajo obligatorio

Antes de implementar cualquier funcionalidad:

1. Seguir el protocolo de inicio de conversación (ver sección Notion arriba).
2. Leer o crear `plan.md` con los pasos concretos a seguir.
3. Ejecutar paso a paso, actualizando `plan.md` y Notion tras cada paso completado.
4. No avanzar al siguiente paso sin haber completado y marcado el anterior.
5. Al finalizar cada funcionalidad, generar o actualizar `walkthrough.md`
   documentando qué se hizo, decisiones tomadas y cómo probarlo.

---

## Reglas de desarrollo

- El stack es definitivo. No proponer migraciones ni tecnologías alternativas.
- No asumir librerías — confirmar antes de instalar dependencias nuevas.
- Antes de crear ficheros de estructura (modelos de BD, rutas API), confirmar comprensión.
- Separar claramente la lógica de llamada al modelo OCR del resto de la API.
- La lógica de categorización va en su propio módulo `/api/categorize.ts`, nunca mezclada en `/api/scan.ts`.
- Todo secret va en variables de entorno. Nunca en el código fuente.
- El frontend nunca llama directamente a HuggingFace ni a DeepSeek API — siempre a través de `/api/*`.
- Comentar los metodos con la funcionalidad de forma breve.

## Funcionalidades fuera de scope (v1.0) — no implementar

- Selector de tipo de gráfico
- Historial de meses anteriores
- Edición de metas
- Notificaciones
- Gestión RGPD
- Categorías personalizables por el usuario
