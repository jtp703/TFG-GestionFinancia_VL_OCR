# Herramientas del Proyecto — TFG GestionFinancia VL OCR

Inventario completo de lenguajes, librerías, frameworks y servicios usados en el proyecto, con sus relaciones.

---

## Lenguajes de programación

| Lenguaje | Versión | Dónde se usa |
|----------|---------|--------------|
| **TypeScript** | ^5.6.3 | Frontend React + Vercel Functions (API) |
| **JavaScript** | — | Ficheros de configuración (vite, tailwind, postcss) |
| **Python** | 3.10+ | DataAugmentation, DeepSeek OCR, LLM+OCR |
| **SQL (PostgreSQL)** | — | Esquema de base de datos (`database/schema.sql`) |
| **HTML** | — | Plantillas de tickets sintéticos (Playwright) |

---

## Frontend — Scannet (`Scannet/src/`)

### Framework y build

| Herramienta | Versión | Rol |
|-------------|---------|-----|
| **React** | ^18.3.1 | Framework de UI principal |
| **Vite** | ^5.4.10 | Bundler y servidor de desarrollo |
| **@vitejs/plugin-react** | ^4.3.3 | Integración React en Vite |

### Enrutamiento

| Herramienta | Versión | Rol |
|-------------|---------|-----|
| **React Router DOM** | ^6.27.0 | Navegación SPA (rutas `/home`, `/scan`, `/history`, etc.) |

### Estilos

| Herramienta | Versión | Rol |
|-------------|---------|-----|
| **Tailwind CSS** | ^3.4.14 | Sistema de utilidades CSS |
| **PostCSS** | ^8.4.47 | Procesador CSS (requerido por Tailwind) |
| **Autoprefixer** | ^10.4.20 | Añade prefijos CSS automáticamente |

### Visualización de datos

| Herramienta | Versión | Rol |
|-------------|---------|-----|
| **Recharts** | ^2.13.0 | Gráfico de dona para categorías de gasto |

### Comunicación con Supabase

| Herramienta | Versión | Rol |
|-------------|---------|-----|
| **@supabase/supabase-js** | ^2.45.0 | SDK cliente para base de datos y autenticación |

### Tipado

| Herramienta | Versión | Rol |
|-------------|---------|-----|
| **@types/react** | ^18.3.12 | Tipos TypeScript para React |
| **@types/react-dom** | ^18.3.1 | Tipos TypeScript para React DOM |

---

## Backend — Vercel Serverless Functions (`Scannet/api/`)

> Los archivos en `api/*.ts` son **Vercel Serverless Functions**: ficheros TypeScript que exportan
> un `handler(req, res)`. Vercel los compila automáticamente a JavaScript y los despliega como
> funciones Lambda — no hay servidor Express ni proceso Node.js persistente. Cada petición HTTP
> levanta un contenedor Node.js efímero, ejecuta el handler y lo destruye.
> `VercelRequest` / `VercelResponse` son wrappers finos sobre `http.IncomingMessage` y
> `http.ServerResponse` de Node.js nativo.

### Runtime y plataforma

| Herramienta | Rol |
|-------------|-----|
| **Vercel Serverless Functions** | Modelo de despliegue Lambda — cada `/api/*.ts` es un endpoint independiente sin servidor persistente |
| **Node.js** (runtime de Vercel) | Entorno de ejecución en el que corre cada función tras compilar el TypeScript |
| **@vercel/node** | Tipos TypeScript (`VercelRequest`, `VercelResponse`) — wrapper sobre Node.js `http` |

### Parsing de formularios

| Herramienta | Versión | Rol |
|-------------|---------|-----|
| **formidable** | ^3.5.4 | Parsea `multipart/form-data` para recibir imágenes |
| **@types/formidable** | ^3.5.0 | Tipos TypeScript para formidable |

### APIs externas consumidas desde las Functions

| Servicio | Endpoint | Función |
|----------|----------|---------|
| **HuggingFace Inference API** | `POST /api/scan.ts` | Envía imagen al modelo `Lacax/Tickets` y obtiene JSON OCR |
| **DeepSeek API** | `POST /api/categorize.ts` | Clasifica comercio en categoría de gasto |
| **Supabase REST** | `GET /api/tickets.ts` | Consulta tickets del mes actual del usuario |

---

## Base de datos — Supabase / PostgreSQL

| Herramienta | Rol |
|-------------|-----|
| **PostgreSQL** | Motor de base de datos relacional (gestionado por Supabase) |
| **Supabase Auth** | Autenticación de usuarios (JWT, sesiones) |
| **Row-Level Security (RLS)** | Aislamiento de datos por usuario a nivel de base de datos |
| **JSONB** | Tipo de columna para almacenar el JSON raw del OCR |

### Tablas

```
categoria       → Categorías fijas del sistema
perfil_usuario  → Perfil y preferencias del usuario
ticket          → Cada ticket escaneado (comercio, fecha, total, imagen...)
producto        → Líneas de producto dentro de un ticket
```

---

## Pipeline de datos — DataAugmentation (`DataAugmentation/`)

| Librería | Rol |
|----------|-----|
| **Albumentations** | Augmentación de imágenes (rotación, ruido, perspectiva, brillo...) |
| **OpenCV (cv2)** | Procesamiento de imágenes (lectura/escritura de frames) |
| **Pillow (PIL)** | Manipulación e I/O de imágenes |
| **NumPy** | Operaciones matriciales sobre arrays de imagen |
| **Playwright** | Automatización de Chromium para renderizar HTML → PNG (tickets sintéticos) |
| **huggingface_hub** | Subida del dataset final al repositorio `Lacax/Tickets` en HuggingFace |

---

## Modelo OCR — DeepSeek (`Deepseek OCR/`)

| Librería | Rol |
|----------|-----|
| **PyTorch** (torch, torch.nn) | Framework de deep learning; carga y ejecución del modelo |
| **Torchvision** | Transformaciones de imagen para visión por computador |
| **HuggingFace Transformers** | Carga de modelos DeepSeek-VL (`DeepseekV2ForCausalLM`, etc.) |
| **tqdm** | Barras de progreso durante inferencia/entrenamiento |
| **Addict** | Acceso a diccionarios anidados (usado en configuración del modelo) |
| **Pillow (PIL)** | Carga y preprocesado de imágenes de entrada |

### Componentes custom

| Fichero | Rol |
|---------|-----|
| `modeling_deepseekocr2.py` | Implementación del modelo DeepSeek-VL con cabeza OCR |
| `conversation.py` | Templates de conversación y gestión de prompts |
| `deepencoderv2.py` | Encoder visual (SAM ViT-B + MlpProjector) |

---

## Pipeline experimental — LLM+OCR (`LLM+OCR/`)

> No está en producción. Usado para investigación alternativa.

| Librería / Modelo | Rol |
|-------------------|-----|
| **Microsoft Florence-2-base** | Modelo OCR (~230M parámetros); extrae texto de tickets |
| **Qwen2.5-1.5B-Instruct** | LLM que estructura el texto OCR en JSON |
| **PEFT** (v0.11.1) | Fine-tuning eficiente con LoRA sobre Qwen2.5 |
| **BitsAndBytes** | Cuantización 4-bit para reducir uso de VRAM |
| **HuggingFace Transformers** (v4.46.0) | Carga y entrenamiento de Florence-2 y Qwen2.5 |
| **HuggingFace Datasets** (v2.19.0) | Carga del dataset CORD-v2 para fine-tuning |
| **Accelerate** (v0.26.0) | Entrenamiento distribuido / gestión de dispositivos |

---

## Entornos de desarrollo

Herramientas usadas por el desarrollador, no por el sistema en producción.

| Herramienta | Rol | Usado en |
|-------------|-----|----------|
| **Visual Studio Code** | IDE principal para escribir y depurar código (TypeScript, Python) | Todo el proyecto |
| **Jupyter Notebook** | Formato interactivo de los ficheros `.ipynb` — combina código Python, salidas y markdown en celdas | `Deepseek OCR/codigo/*.ipynb` |
| **Google Colab** | Entorno cloud que ejecuta Jupyter Notebooks con GPU gratuita/de pago; usado para entrenamiento y augmentación | `LLM+OCR/`, `Deepseek OCR/codigo/` |
| **Google Drive** | Almacenamiento de checkpoints del modelo durante sesiones Colab | `LLM+OCR/llm_structurer_training.py` |

> Google Colab es esencialmente Jupyter Notebook ejecutándose en servidores de Google con acceso a GPU.
> Los `.ipynb` del repo se abren directamente en Colab desde GitHub o Drive.

---

## Infraestructura y servicios externos

Servicios en la nube que el sistema consume en tiempo de ejecución (producción).

| Servicio | Rol | Consumido por |
|----------|-----|---------------|
| **Vercel** | Deploy del frontend (CDN) + ejecución de Vercel Functions | `Scannet/` completo |
| **Supabase** | Base de datos PostgreSQL + autenticación de usuarios | Frontend + Vercel Functions |
| **HuggingFace Hub** | Repositorio del modelo `Lacax/Tickets` y del dataset | `upload_to_hf.py`, `/api/scan.ts` |
| **HuggingFace Inference API** | Sirve el modelo OCR `Lacax/Tickets` como endpoint REST | `Scannet/api/scan.ts` |
| **DeepSeek API** | LLM externo para categorización de comercios | `Scannet/api/categorize.ts` |

---

## Relaciones entre capas

```
Usuario (navegador)
    │
    ▼
[React + Vite + Tailwind]          ← TypeScript/TSX
    │
    │  HTTP (fetch)
    ▼
[Vercel Functions — Node.js]       ← TypeScript
    ├──► formidable (parse imagen)
    ├──► HuggingFace Inference API → DeepSeek-VL (modelo OCR)
    ├──► DeepSeek API              → LLM (categorización)
    └──► Supabase (PostgreSQL)     → persistencia + auth
              │
              ▼
         [RLS por usuario]

─────────────────────────────────────

Tickets reales + JSONL
    │
    ▼
[augment_images.py]                ← Python · Albumentations · OpenCV · Pillow · NumPy
    │
[generate_synthetic_ticket.py]     ← Python · Playwright · HTML
    │
    ▼
[build_dataset.py]                 ← fusiona todo en dataset_final.jsonl
    │
    ▼
[upload_to_hf.py]                  ← huggingface_hub → HuggingFace Hub (Lacax/Tickets)
    │
    ▼
[Fine-tuning DeepSeek-VL]          ← PyTorch · Transformers · PEFT · LoRA (en RunPod RTX 4090)
    │
    ▼
Modelo desplegado en HuggingFace Inference API
    │
    └──► consumido por /api/scan.ts en producción
```

---

## Resumen de versiones clave

| Herramienta | Versión |
|-------------|---------|
| React | ^18.3.1 |
| TypeScript | ^5.6.3 |
| Vite | ^5.4.10 |
| Tailwind CSS | ^3.4.14 |
| React Router DOM | ^6.27.0 |
| @supabase/supabase-js | ^2.45.0 |
| Recharts | ^2.13.0 |
| formidable | ^3.5.4 |
| HuggingFace Transformers | 4.46.0 |
| PEFT | 0.11.1 |
| Accelerate | 0.26.0 |
| HuggingFace Datasets | 2.19.0 |
