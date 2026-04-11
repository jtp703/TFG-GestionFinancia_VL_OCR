# Decisiones de arquitectura ML

## Inferencia sin unsloth [sin fecha exacta, confirmado 2026-04-09]

- Unsloth falla con deepseek_vl_v2 en versiones >=2025.x: `RuntimeError: Unsloth: No config file found`
- `get_transformers_model_type` devuelve None para DeepseekOCR2
- Fix: `AutoModel.from_pretrained` + `PeftModel.from_pretrained` (transformers==4.56.2)
- `transformers==4.56.2` es obligatorio — superiores rompen `DeepseekV2MoE`
- Unsloth tampoco aporta nada en inferencia (solo optimiza backward pass)
- **Regla: NO instalar unsloth en el worker de RunPod bajo ningún concepto**

## Deploy RunPod Serverless (2026-04-11)

- HF Inference API serverless: descartada — no soporta DeepseekOCR2, repo privado sin Inference Endpoint
- HF Inference Endpoint: descartada — $0.60–1.20/hora, cold start >2min, no compensa con 30 req/día
- GCP free tier: viable en papel, complejidad alta, sin experiencia previa
- Modal: alternativa ($10/mes free, pero cold start >3min y SDK nuevo)
- **ELEGIDO: RunPod Serverless** — conocido (ya usado para entrenamiento), escala a 0, ~$4–8/mes

## Docker base image (2026-04-11)

- Base: `runpod/pytorch:2.2.1-py3.10-cuda12.1.1-devel-ubuntu22.04`
- Razón: transformers==4.56.2 requiere PyTorch >=2.2.0 (API `register_pytree_node` ausente en 2.1.0)
- NO incluir `torch` en requirements.txt — la imagen base ya lo tiene compilado con CUDA correcto
- Reinstalar torch vía pip sobreescribe los CUDA bindings → worker crash sin output

## Fix bug EOS en inferencia (2026-04-09)

- Causa: `process_single_sample` añadía EOS incluso con content="" (inferencia) → 7 tokens basura
- Fix: `if content.strip(): content = f"{content.strip()} {eos_token}"` — solo si hay contenido real

## Modelo base en handler.py

- Base model: `unsloth/DeepSeek-OCR-2` (repo público, sin token)
- LoRA adapter: `Lacax/deepseek_ocr_lora` (repo privado, requiere HF_TOKEN)
- Inferencia usa `DeepSeekOCR2DataCollator` con images, images_seq_mask, images_spatial_crop explícitos
- NO usar `apply_chat_template` — el modelo requiere el collator custom
