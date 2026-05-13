---
Última actualización: 2026-05-02 — V6 H4 cerrado (total±0.01 85.7 % en holdout); siguiente foco H5 (Gradio + OCR.space cross-check)
---

## Estado actual del modelo

- **V6 H4 ✅ ejecutado**. Holdout 14 imgs test: `total ±0.01 = 85.7 %`, `malformed = 0`, `IoU≥0.7 = 64.3 %`, IoU media 0.59. 3 fallos de IoU son falsos negativos (instancia repetida del total). Test OOD con imagen propia del usuario: localiza la zona del total correctamente.
- V6 H3 ✅ Full FT, mejor época 3, eval_loss 1.3980, VRAM pico 6.44 GB. Best model en `Drive/TFG/V6_checkpoints/h3_full_ft_best/`.
- V6 H2 ✅ DataCollator validado.
- V6 H1 ✅ Bootstrap.
- V5 cerrado: `Lacax/deepseek_ocr_lora_v5` (eval_loss 0.1274, alucinación de items confirmada)
- V4 conservado: `Lacax/deepseek_ocr_lora`
- Pipeline producción Scannet: OCR.space + DeepSeek-chat (sin cambios)

## Foco siguiente: H5 — Demo Gradio + verificación cruzada OCR.space

Tareas H5:

1. Reutilizar Gradio de `Pruebas_de_inferencia_V5.ipynb` adaptado:
   - Input: ticket → Florence-2 (`<EXTRACT_TOTAL>`) → `(total, bbox)`.
   - Crop del bbox predicho.
   - OCR.space sobre el crop → texto literal.
   - Verdict: ✅ si `parse_float(ocr_crop) ≈ pred_total`, ⚠️ si difieren.
2. Probar con tickets propios fuera del dataset (incluyendo rotados, multi-aparición del total, formato no español).
3. Output: notebook + screenshot en `memory/bot/experiments.md`.

Después H6 (memory bank + redacción TFG): tabla comparativa V5 vs V6, lecciones aprendidas.

## V6 — H3 (full fine-tune, ejecutado)

- TrainingArguments: bs=1, grad_accum=4, lr=1e-5 cosine + 10% warmup, fp16 AMP, 10 ép. con `EarlyStoppingCallback(patience=2)`, `load_best_model_at_end=True`, `save_total_limit=2`.
- Resultado por época (eval_loss): 1.5655 → 1.4505 → **1.3980** → 1.4426 → 1.5133.
- Train loss: 2.72 → 1.29 → 0.90 → 0.67 → 0.45 (overfitting evidente desde época 4).
- Warning de tied weights de Florence-2 al recargar best: mitigado con `model.tie_weights()` en celda Q.
- No hizo falta fallback LoRA (VRAM holgada).

## V6 — H2 (formato + DataCollator, ejecutado)

- Cuantización bbox: 1000 bins sobre tamaño PIL original (no 768×768) — fórmula `processing_florence2.py` upstream.
- Target string: `"{total:.2f}<loc_x1><loc_y1><loc_x2><loc_y2>"`. BOS/EOS añadidos por tokenizer.
- Encoder-decoder BART-style: `labels` enteros (no concatenar prompt), `pad_token_id`→`-100`.
- `Florence2TotalCollator` reutiliza `load_image` del notebook (cache de `hf_hub_download`).

## V6 — H1 (ejecutado)

- 8 celdas A→H, sin entrenamiento.
- Stack T4: `transformers>=4.41,<4.46`, fp16, sin Unsloth, sin flash-attn.
- Tag custom `<EXTRACT_TOTAL>` añadido y resize_token_embeddings hecho.
- Dataset HF `Lacax/Tickets-total` (privado): 130 imgs en `original/` + 130 en `etiquetadas/` (verificación visual; NO se usa en training) + 3 JSONL splits (104/12/14).
- Vista lado a lado (original vs etiquetada) en celda F como sanity check del GT.

## V6 — Hiperparámetros tentativos H3 (no confirmados)

- batch=1, grad_accum=4, gradient_checkpointing, fp16
- lr=1e-5, 10 épocas + EarlyStopping
- Full fine-tune primero, fallback LoRA r=16 si OOM
- Checkpoints a `/content/drive/MyDrive/TFG/V6_checkpoints` cada época

## Restricciones técnicas V6 (no cuestionar sin motivo)

- Plataforma: **Google Colab Tier gratuito**, NO RunPod
- VRAM 16 GB T4 → fp16 obligatorio (bf16 no nativo en compute 7.5)
- Sesiones cortadas a 12h → checkpoints a Drive obligatorios
- Stack Colab: `transformers>=4.41,<4.46`, sin Unsloth, sin flash-attn

## Datos clave

- Plan V6: `Documentacion/plan_v6.md`
- Walkthrough: `Documentacion/walkthrough.md` (append al final)
- Notebook: `Deepseek OCR/codigo/V6_Florence2_Total.ipynb`
- Scripts H0/H1: `DataAugmentation/{build_total_dataset,relabel_total,retry_no_match,split_dataset_total,upload_to_hf_total}.py`
- Repo HF V6: `Lacax/Tickets-total` (privado, ya subido)
