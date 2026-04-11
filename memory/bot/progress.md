# Progreso del dominio modelo/ML

## 2026-04-08 — Auditoría V3 y preparación V4

- Auditoría V3 completada: 4 críticos (bug rutas, sin validación, LoRA 12 capas, dataset pequeño)
- Creado `Deepseek OCR/codigo/Deepseek_OCR_Runpod_Fix_V4.ipynb` con todos los fixes
- Normalizado JSONL: E.S. LA PEÑITA, BAZAR UNIVERSAL — commit realizado
- Confirmado: augmentación ya ejecutada previamente (683 muestras en HF)

## 2026-04-09 — Entrenamiento V4 y tests

- Entrenamiento V4 completado: 3 épocas, 77min, RTX 4090, loss 0.0399
- Adaptador publicado: `Lacax/deepseek_ocr_lora` en HuggingFace (actualizado 09/04/2026)
- Fix bug EOS: 7 tokens basura → JSON válido (collator de inferencia)
- Fix infraestructura: eliminado unsloth, transformers==4.56.2 + AutoModel + PeftModel
- Tests A-E ejecutados: A✅ C✅ E✅ | B⚠️ D❌
- Auditoría V4 completada: config correcta, val_loss no registrado, inferencia con imagen italiana fallida

## 2026-04-11 — Worker RunPod Serverless

- Decisión de deploy documentada: RunPod Serverless elegido
- Creados: `Scannet/runpod-worker/handler.py`, `Dockerfile`, `requirements.txt`
- Issue 1 resuelto: eliminar `torch` de requirements (CUDA bindings)
- Issue 2 resuelto: `huggingface_hub` sin pin (compatibilidad con transformers)
- Issue 3 resuelto: base image → `runpod/pytorch:2.2.1` (PyTorch >=2.2.0 para transformers==4.56.2)
- Issue 4 resuelto: handler.py reescrito con DeepSeekOCR2DataCollator (no apply_chat_template)
- Issue 5 resuelto: `matplotlib` + `tqdm` añadidos a requirements
- Imagen publicada: `jtp703/scannet-ocr-worker:latest`

## PENDIENTE (pausa 2026-04-11)

- [ ] RunPod → Edit endpoint → Container Disk → **20 GB** (sin rebuild)
- [ ] Fix check caché: `config.json` → `model-00001-of-000001.safetensors` → rebuild → push
- [ ] Fase 4: test con curl (3 tickets reales, criterio 3/3 JSON válido)
- [ ] Actualizar scan.ts con bloque RunPod (Fase 6 del plan_despliegue_inferencia.md)
- [ ] Añadir RUNPOD_API_KEY + RUNPOD_ENDPOINT_ID a Vercel env vars
