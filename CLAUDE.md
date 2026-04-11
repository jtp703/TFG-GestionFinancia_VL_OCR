# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# TFG — DeepSeek OCR + Scannet

## Leer al inicio de cada sesión

**Dominio modelo/ML** — leer siempre estos archivos antes de trabajar en entrenamiento, inferencia o deploy del modelo:
- `memory/bot/activeContext.md` — estado actual y próxima acción
- `memory/bot/progress.md` — qué se hizo y qué está pendiente
- `memory/bot/decisions.md` — decisiones técnicas vigentes (NO cuestionar sin motivo)
- `memory/bot/experiments.md` — resultados V3/V4 y tests A-E
- `memory/bot/datasets.md` — estructura del dataset y pipeline

**Dominio web** — si la sesión toca Scannet o el deploy, leer también:
- `Scannet/memory/bot/activeContext.md`
- `Scannet/memory/bot/progress.md`
- `Scannet/memory/bot/decisions.md`

**En tareas de deploy** (RunPod ↔ scan.ts ↔ Vercel): leer ambas memorias completas.

## Actualizar memoria al completar tareas

| Tarea completada | Archivo a actualizar |
|------------------|----------------------|
| Experimento / entrenamiento | `memory/bot/experiments.md` (con fecha) |
| Decisión de arquitectura ML | `memory/bot/decisions.md` (con fecha) |
| Tarea general modelo | `memory/bot/progress.md` (con fecha) |
| Cambio de foco modelo | Reescribir `memory/bot/activeContext.md` |

Hacer el commit de los archivos bot/ junto al código en el mismo commit.

## Descripción general

Trabajo de Fin de Grado. Sistema de OCR para tickets españoles basado en fine-tuning
de DeepSeek-VL con LoRA, más una aplicación web (Scannet) que consume el modelo.

## Estructura del repositorio

```
TFG/
├── DataAugmentation/         → Pipeline de datos
│   ├── augment_images.py     → Augmentación (Albumentations, 10 variantes por imagen)
│   ├── build_dataset.py      → Fusiona original + augmented + synthetic en dataset_final.jsonl
│   ├── generate_synthetic_ticket.py  → Genera tickets HTML → PNG vía Playwright
│   ├── upload_to_hf.py       → Sube dataset a HuggingFace Lacax/Tickets
│   ├── imagenes/             → Tickets reales + dataset_espanol_ampliado.jsonl (fuente de verdad)
│   ├── dataset_final/        → Dataset fusionado (JSONL + imágenes). NO modificar imagenes/ a mano
│   └── output_synthetic/     → Tickets sintéticos generados
├── Deepseek OCR/             → Fine-tuning del modelo en RunPod
│   ├── codigo/               → Notebooks de entrenamiento; la versión más reciente es V4
│   ├── imagenes/             → Imágenes de prueba/inferencia
│   ├── conversation.py       → Templates de conversación para DeepSeek
│   └── modeling_deepseekocr2.py  → Implementación custom del modelo
├── LLM+OCR/                  → Pipeline alternativo experimental (Florence-2 + Qwen2.5)
└── Scannet/                  → Aplicación web (backend + frontend + database)
```

## Reglas globales

- Plataforma de entrenamiento: RunPod con RTX 4090. NO sugerir otras plataformas.
- El JSONL usa JSON anidado **sin escapar** en el campo `ground_truth`. Siempre usar el parser regex existente (en `augment_images.py`), nunca `json.loads()` directo sobre la línea completa.
- NO tocar `DataAugmentation/imagenes/` a mano — es la fuente de verdad de los tickets reales (el count crece; ver `dataset_espanol_ampliado.jsonl` para el total actual).
- Modelo base: DeepSeek-VL con LoRA r=32. No cambiar hiperparámetros sin consultar.
- Dataset en HuggingFace: `Lacax/Tickets` (privado).
- Siempre mencionar la celda sobre la que se realice un cambio
- Actualizar la celda si el cambio que se realiza afecta a una celda ya existente

## Formato JSONL

El archivo fuente es `DataAugmentation/imagenes/dataset_espanol_ampliado.jsonl`.
Cada línea tiene la forma (el JSON interno **no está escapado**):

```
{"image_path": "recibo_almeria_001.jpg", "ground_truth": "{"comercio": "MERCADONA", "cif": "A-46103834", "fecha": "15/03/2025", "total": 24.50, "items": [...]}"}
```

Campos extraídos: `comercio`, `cif`, `fecha`, `total`, `items[]` (cantidad + descripcion + precio).

## Stack de datos

- Python 3.10+, PyTorch, HuggingFace Transformers / PEFT
- Albumentations para augmentation de imágenes
- Playwright para generación de tickets sintéticos (HTML → imagen)

## Comandos frecuentes

```bash
# Augmentar dataset (10 variantes por imagen por defecto)
python DataAugmentation/augment_images.py --num-augments 10

# Generar tickets sintéticos
python DataAugmentation/generate_synthetic_ticket.py --count 100

# Fusionar todas las fuentes en dataset_final.jsonl
python DataAugmentation/build_dataset.py --copy-images

# Subir dataset a HuggingFace
python DataAugmentation/upload_to_hf.py --token $HF_TOKEN

# Ver GPU en RunPod
nvidia-smi --query-gpu=name,memory.total,memory.free --format=csv,noheader
```

## Workflow Git

Ramas: `Feature-App-Stack` (desarrollo activo) → merge → `Feature-App`. **Nunca a `main`.**
Vercel apunta a `Feature-App-Stack` como rama de producción.

- Todo trabajo en `Feature-App-Stack`
- Nunca proponer ni ejecutar merge directo a `main`
- Al cerrar issue o completar feature: commit de archivos `bot/` junto al código
- Formato de commits: `tipo(scope): descripción`
  - `feat(web):`, `fix(model):`, `docs(memory):`, `chore(deploy):`

## Contexto adicional

- Ver `Scannet/CLAUDE.md` para todo lo relativo a la aplicación web
- Documentación legible en `Documentacion/` (modelo) y `Scannet/Documentation/` (web)

## Gestión de tareas — Notion

El progreso del desarrollo se rastrea en un tablero Notion externo llamnado tareas de Despliegue.
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

### Docker

Debido al consumo de tiempo, memoria ram y recursos. Es estrictamente necesario que cada build de docker se realice estanto muy seguro de que tiene que hacerse.

Antes de cada peticion de build al usuario debes:

- Comprobar si soluciona el problema.
- Verificar soluciones ya existentes por usuarios de runpod, foros, etc.
- Asegurar de quue una modificacion no afecta a lo ya existente.
- Valorar otras vias de solucion que impidan el correcto despligue en runpod.
- detallar en el md de issues los fallos y soluciones.
- Tener en cuenta el ultimo notebook y sus librerias para preparar un docker.
