# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# TFG — DeepSeek OCR + Scannet

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
│   ├── dataset_final/        → Dataset final (JSONL + imágenes). NO modificar original/
│   └── output_synthetic/     → Tickets sintéticos generados
├── Deepseek OCR/             → Fine-tuning del modelo en RunPod
│   ├── codigo/               → Notebooks de entrenamiento; la versión más reciente es V3
│   ├── imagenes/             → Imágenes de prueba/inferencia
│   ├── conversation.py       → Templates de conversación para DeepSeek
│   └── modeling_deepseekocr2.py  → Implementación custom del modelo
├── LLM+OCR/                  → Pipeline alternativo experimental (Florence-2 + Qwen2.5)
└── Scannet/                  → Aplicación web (backend + frontend + database)
```

## Reglas globales
- Plataforma de entrenamiento: RunPod con RTX 4090. NO sugerir otras plataformas.
- El JSONL usa JSON anidado **sin escapar** en el campo `ground_truth`. Siempre usar el parser regex existente (en `augment_images.py`), nunca `json.loads()` directo sobre la línea completa.
- NO tocar `DataAugmentation/dataset_final/original/` — son los 47 tickets reales únicos.
- Modelo base: DeepSeek-VL con LoRA r=32. No cambiar hiperparámetros sin consultar.
- Dataset en HuggingFace: `Lacax/Tickets` (privado).

## Formato JSONL
Cada línea tiene la forma (el JSON interno **no está escapado**):
```
{"image_path": "original/recibo_001.jpg", "ground_truth": "{"comercio": "MERCADONA", "cif": "A-46103834", "fecha": "15/03/2025", "total": 24.50, "items": [...]}"}
```
Campos extraídos: `comercio`, `cif`, `fecha`, `total`, `items[]` (descripcion + precio).

## Stack de datos
- Python 3.10+, PyTorch, HuggingFace Transformers / PEFT
- Albumentations para augmentation de imágenes
- Playwright para generación de tickets sintéticos (HTML → imagen)

## Comandos frecuentes
```bash
# Augmentar dataset (10 variantes por imagen por defecto)
python DataAugmentation/augment_images.py --input ./DataAugmentation/dataset_final/original --num-augments 10

# Generar tickets sintéticos
python DataAugmentation/generate_synthetic_ticket.py --count 100

# Fusionar todas las fuentes en dataset_final.jsonl
python DataAugmentation/build_dataset.py --copy-images

# Subir dataset a HuggingFace
python DataAugmentation/upload_to_hf.py --token $HF_TOKEN

# Ver GPU en RunPod
nvidia-smi --query-gpu=name,memory.total,memory.free --format=csv,noheader
```

## Contexto adicional
- Ver @Scannet/CLAUDE.md para todo lo relativo a la aplicación web
- Deadline del TFG: 31 de marzo
