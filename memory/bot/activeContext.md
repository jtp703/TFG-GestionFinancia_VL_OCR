---
Última actualización: 2026-05-01 — V6 H1 ejecutado OK; pausa antes de H2
---

## Estado actual del modelo

- **V6 H1 ✅ ejecutado en Colab T4 sin problemas**. Notebook `Deepseek OCR/codigo/V6_Florence2_Total.ipynb` corrió de A a H sin OOM. Florence-2-base cargado, dataset `Lacax/Tickets-total` accesible, tag `<EXTRACT_TOTAL>` añadido, smoke test zero-shot ejecutado.
- V5 cerrado: `Lacax/deepseek_ocr_lora_v5` (eval_loss 0.1274, alucinación de items confirmada)
- V4 conservado: `Lacax/deepseek_ocr_lora`
- Pipeline producción Scannet: OCR.space + DeepSeek-chat (sin cambios)

## Foco siguiente: H2 — Formato target + DataCollator

Sesión pausada. Al retomar:

1. Leer este archivo + `memory/bot/decisions.md` (V6 H1) + `Documentacion/plan_v6.md` § H2.
2. Diseñar formato del target Florence-2:
   - Input: `pixel_values` + `input_ids = <EXTRACT_TOTAL>`
   - Label: `total<loc_x1><loc_y1><loc_x2><loc_y2>` (los `<loc_*>` son tokens nativos de Florence-2 para bbox, ya en su vocab)
   - Normalizar bbox a 0–999 sobre la imagen redimensionada por el processor (768×768 default)
3. Implementar `DataCollator` en una nueva celda del notebook (o módulo `.py` separado):
   - Recibe batch de `{image_path, total, bbox}`
   - Llama `processor(text=prompt, images=img, return_tensors='pt')` → `pixel_values`, `input_ids`
   - Tokeniza target → `labels` (mask `-100` en los input_ids)
4. Verificar con `next(iter(DataLoader))` que las shapes son las esperadas y que `labels` se decodifica al string original.

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
