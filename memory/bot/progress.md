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

## 2026-04-11 — Sesión de despliegue RunPod (continuación)

- Container Disk aumentado a 20 GB ✅
- Fix check caché: `config.json` → `model-00001-of-000001.safetensors` ✅
- Worker arranca OK y modelo carga (logs confirmados) ✅
- Endpoint responde peticiones (no crash) ✅
- Issue 6 identificado: modelo genera `} ` — investigación en curso
  - merge_and_unload añadido (no resolvió)
  - tokenizer.add_bos_token=False añadido (no resolvió)
  - Debug prints añadidos al handler (pendiente rebuild + observar logs)
- Notion actualizado: DB correcta = `1efe1bf2-d460-4aef-b105-6945807edb7f` (Tareas de Despliegue)
- Coste acumulado RunPod: ~10.91 USD

## PENDIENTE RunPod (congelado hasta H8 del plan V5)

- [ ] Issue 6: modelo genera `} ` — retomar solo si V5 supera al pipeline en F1
- [ ] Fix definitivo handler.py → rebuild → test con 3 tickets reales
- [ ] Fase 6: actualizar scan.ts para llamar a RunPod
- [ ] Añadir RUNPOD_API_KEY + RUNPOD_ENDPOINT_ID a Vercel env vars

## 2026-04-26 — Diseño plan V5 y dataset golden

- Plan V5 creado: `Documentacion/plan.md` (hitos H0-H8)
- Auditoría dataset v1 (62 tickets): 38 comercios únicos, inconsistencias documentadas
  - cantidad siempre string con 4 variantes, cif con/sin guión, 2 tickets-fantasma
  - 2 tickets con totales que no cuadran (recibo 033, recibo 063)
  - 0 productos a dos líneas anotados correctamente
  - único formato de fecha: DD/MM/YYYY
- Decisión: knowledge distillation con Gemini 2.5 Flash (regenerar dataset desde imágenes)
- Schema golden: cantidad=number, cif sin guión, fecha ISO + fecha_original, ground_truth como objeto JSON
- Script `DataAugmentation/annotate_with_gemini.py` creado — SDK google-genai, modelo gemini-2.5-flash
- Script lanzado sobre 150 imágenes en F:\datasetTickets\v3 — dataset_golden.jsonl en generación

## 2026-04-26 — H1 Quick wins inferencia

- ✅ H1.1: `max_new_tokens` 1024 → 4096 (celda 3 y 4 de `Pruebas_de_inferencia.ipynb`)
- ✅ H1.2: `repetition_penalty` 1.3 → 1.0 (celda 3 y 4)
- ✅ H1.3: EOS natural confirmado en Test A previo (todos los tickets acaban con `<｜end▁of▁sentence｜>`)
- ✅ H1.4: `dynamic_preprocess` forzado para TODAS las resoluciones — eliminada condición `<=768px` (celda 3 y 4)
- ✅ H1.5: función `preprocess_ticket(img)` añadida — deskew + crop márgenes blancos con OpenCV (celda 3 y 4)
- Pendiente: H1.6 — U relanza Test A para confirmar que los cambios no rompen nada

## 2026-04-26 — H2 Validadores post-procesado ✅

- `validators/arithmetic.py` — valida sum(cantidad×precio) ≈ total (tolerancia 0.05€)
- `validators/nif_cif.py` — checksum NIF (mod 23) y CIF (algoritmo oficial AEAT)
- `validators/dates.py` — normaliza DD/MM/YYYY, DD-MM-YY, "15 de marzo de 2026" → ISO 8601; fallback dateparser si instalado
- `validators/abbreviations.py` — 70+ abreviaturas ES; resuelve PLU, ENTRA→ENTERA, etc.
- `validators/dedup.py` — fusiona items con similitud ≥82% (difflib.SequenceMatcher)
- `validators/pipeline.py` — entrada: dict OCR; salida: {valid, warnings, normalized_json}
- `validators/tests.py` — 5 tests sobre outputs reales V4; ejecutar: `python -m validators.tests`

## PENDIENTE (pausa 2026-04-26)

**H1.6 — Relanzar Test A con los cambios H1**
- [ ] U ejecuta celda 3 en RunPod y confirma PASS 5/5

**H3 — verificar resultado de anotación Gemini**
- [ ] Revisar `annotate_errors.json` — imágenes que fallaron
- [ ] Spot-check manual ~10 líneas de `dataset_golden.jsonl`
- [ ] C actualiza `augment_images.py` para nuevo formato (ground_truth como objeto)
- [ ] C actualiza `build_dataset.py` para nuevo formato
- [ ] U lanza pipeline: augment → build → upload HF (Lacax/Tickets)

**H1 — quick wins inferencia (independiente de H3, se puede hacer en paralelo)**
- [ ] notebook inferencia: max_new_tokens=4096, repetition_penalty=1.0
- [ ] Forzar dynamic_preprocess para imágenes >768px
- [ ] Preprocesado OpenCV (deskew + crop márgenes)
- [ ] U relanza Test A

**H2 — módulo validators/**
- [ ] Validador aritmético, NIF checksum, dateparser, abreviaturas, dedup Levenshtein

## 2026-04-26 — H1-H6 completados (sesión continua)

- ✅ H1.1-H1.5: quick wins inferencia (Pruebas_de_inferencia.ipynb cells 3-4 + gradio_demo.py self-contained)
  - max_new_tokens=4096, repetition_penalty=1.0, dynamic_preprocess siempre, preprocess_ticket (deskew+crop)
- ✅ H2.1-H2.6: módulo `validators/` (arithmetic, nif_cif, dates, abbreviations, dedup, pipeline)
- ✅ H3.1-H3.8: knowledge distillation con Gemini 2.5 Flash → `dataset_golden.jsonl` (136 tickets)
  - Pipeline migrado a nuevo formato (ground_truth como objeto JSON, sin regex parser)
  - Upload limpio a `Lacax/Tickets` (816 imágenes: 136 orig + 680 aug)
- ✅ H4.1-H4.3: análisis de diversidad — 55+ comercios únicos, 12 formatos de fecha, multi-línea OK
  - Decisión: H5 (sintéticos) NO necesarios
- ✅ H6.1-H6.7: notebook V5 creado en `Deepseek OCR/codigo/Deepseek_OCR_Runpod_Fix_V5.ipynb`
  - Cambios: lr 1e-4, dropout 0.1, r=16/alpha=32, 6 epochs+EarlyStopping, dynamic_preprocess siempre,
    prompt único train↔infer, schema con fecha_original, adapter → Lacax/deepseek_ocr_lora_v5
  - Split 85/15 (vs 90/10 V4) — holdout interno mayor
  - Validación JSON OK

**H6.8 PENDIENTE (U)**: lanzar entrenamiento V5 en RunPod RTX 4090
**H1.6 PENDIENTE (U)**: relanzar Test A en Colab con gradio_demo.py
**H7 (post-H6.8)**: anotar 30 tickets externos con Gemini → F1 holdout V5 vs Pipeline vs V4

## 2026-05-14/18 — Despliegue inferencia local (AMD RX 6750 XT) ✅

- Deploy completado y funcional: DeepSeek-OCR-2 + LoRA en AMD RX 6750 XT vía **torch-directml** (DirectX 12)
- Entorno conda `deepseek-infer` (Python 3.11): torch 2.3.1+cpu, torch-directml 0.2.5, transformers==4.56.2
- Solución clave: **monkey-patching de runtime** antes de importar transformers:
  - `torch.cuda.is_bf16_supported = lambda: False` (evita AssertionError al importar modeling_deepseekocr2.py)
  - `torch.Tensor.cuda` y `torch.nn.Module.cuda` redirigidos a `self.to(DEVICE)` (DirectML)
- Servidor FastAPI `model_vs_model/server.py` → puerto 8000 (`/infer`, `/health`)
- Integrado con Scannet: `local-dev-server.cjs` (puerto 3000) + Vite (puerto 5173)
- `LOCAL_MODEL_URL=http://localhost:8000` en `.env.local` activa el modelo local
- `eval_mode=True` en `model.infer()` — resuelve truncación del streaming JSON
- Extracción JSON robusta: conteo de llaves en lugar de regex greedy
- Documentación completa: `Documentacion/LocalDeploy.md`
- **Limitación crítica**: LoRA NO se aplica a expertos MoE (PEFT no matchea nombres de capa de Unsloth)
  - Warning: `target_parameters were set but no parameter was matched`
  - El modelo corre como el base; fine-tuning sin efecto en las capas más importantes
  - Fix pendiente: `merge_and_unload()` en Colab antes de descargar el modelo fusionado

## 2026-05-02 — V6 H4 completado (eval cuantitativo holdout)

- Añadidas celdas R/S/T (parser, loop eval, tabla agregada), U (visualización), diagnóstico, V (inferencia OOD).
- Resultado holdout (14 imgs test): total ±0.01 = **85.7 %**, malformed = 0, IoU≥0.7 = 64.3 %, IoU media = 0.59.
- 1 error real de OCR (3↔5), 1 número mal cerrado (17.17.7), 3 falsos negativos del IoU por GT bbox apuntando a instancia distinta del mismo número (subtotal/total repetidos).
- Test OOD con imagen del usuario: el modelo localiza correctamente la zona del total → no es solo memorización.
- H4 cerrado. Pendiente H5 (Gradio + verificación cruzada OCR.space) y H6 (memory bank + redacción TFG).

## 2026-05-02 — V6 H3 completado (fine-tune Florence-2 en T4)

- Añadidas celdas L→Q al notebook (prep modelo, dataset wrapper, TrainingArguments, Trainer, train, save best, sanity check).
- **Resultado**: EarlyStopping en época 5/10, mejor en **época 3** con `eval_loss=1.3980`. Train loss 2.72 → 0.45 (overfitting típico de dataset chico, 104 train).
- **VRAM pico 6.44 GB** sobre T4 (cómodo, sin necesidad de fallback LoRA).
- `train_runtime=477s` (~8 min para 5 épocas).
- Warning conocido de Florence-2: `embed_tokens.weight` / `lm_head.weight` reportados como missing al recargar best — bug de safetensors deduplicando pesos tied. Solución: `model.tie_weights()` post-load (celda Q).
- Best model guardado en `Drive/TFG/V6_checkpoints/h3_full_ft_best/`.
- **Pendiente**: ejecutar celda Q tras `tie_weights()` para validar que generation funciona y que las predicciones no son ruido puro antes de pasar a H4.

## 2026-05-01 — V6 H2 completado (DataCollator Florence-2)

- Notebook `Deepseek OCR/codigo/V6_Florence2_Total.ipynb` ampliado con celdas I, J, K
- **Celda I**: helpers `quantize_bbox` (1000 bins, sobre tamaño original PIL) + `format_target` (`"{total:.2f}<loc_x1><loc_y1><loc_x2><loc_y2>"`)
- **Celda J**: `Florence2TotalCollator` produce `{input_ids, attention_mask, pixel_values, labels}` con `pad_token_id`→`-100`
- **Celda K**: verificación end-to-end con DataLoader bs=2 — shapes ok, decode reproduce target esperado, forward dummy con `out.loss` finito
- Ejecutado en Colab T4 sin OOM. H2 cerrado, listo para H3 (Trainer real)
