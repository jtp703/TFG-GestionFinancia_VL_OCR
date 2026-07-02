# Plan V6 — Florence-2 para extracción autónoma del `total`

> Plan separado de `plan.md` (que cubrió V5 y quedó cerrado).
> Origen de la decisión: sesión 2026-05-01 (ver `walkthrough.md`).
> V6 es **un capítulo académico** del TFG, no entra en producción Scannet.

---

## Contexto

V5 (DeepSeek-VL + LoRA, 816 muestras, eval_loss 0.1274) demostró ser un **éxito técnico
y fallo de generalización**: en inferencia con tickets reales el modelo extrae cabecera
pero **alucina items y total**. Ver `memory/bot/experiments.md` § V5.

V6 reduce el problema a **un único campo escalar (`total`)** y cambia de arquitectura:

- **Modelo**: `microsoft/Florence-2-base` (~230M params, pre-train multi-tarea masivo 2024)
- **Plataforma**: Google Colab Tier gratuito (T4 16 GB), OOM como restricción crítica
- **Dataset**: 136 imágenes reales del `dataset_golden.jsonl` (sin augmentation)
- **Validación**: OCR.space queda como **validador a posteriori**, no como fuente primaria

Comparativa documentada Donut vs Florence-2 vs PaliGemma 2:

- PaliGemma 2 3B descartado por VRAM al límite en T4 + sesión Colab que se corta a 12h
- Donut descartado por pre-train 2022 sin bbox nativo
- Florence-2 elegido por pre-train 2024 + bbox nativo (`<OCR_WITH_REGION>`) que encaja con la validación cruzada

---

## Hitos

### H0 — Preparar dataset `total` + bbox vía OCR.space — ✅ **COMPLETADO**

- Script `DataAugmentation/build_total_dataset.py` con matcher reforzado (HARD: decimal + €, SOFT: keyword TOTAL + altura como proxy de negrita)
- Scripts auxiliares: `retry_no_match.py` (segundo intento OCR) y `relabel_total.py` (re-etiquetado manual con 2 clics + matplotlib)
- Resultado: 130/136 entradas en `dataset_total.jsonl` con bbox válido (6 descartadas)
- Split estratificado por cuartil del total: 104 train / 12 val / 14 test (`split_dataset_total.py`)
- Subida a HF `Lacax/Tickets-total` (privado): `upload_to_hf_total.py` listo, **pendiente ejecución manual**

### H1 — Notebook Colab base con Florence-2 — ✅ **COMPLETADO** (ejecutado 2026-05-01)

- `Deepseek OCR/codigo/V6_Florence2_Total.ipynb` con 8 celdas (A→H), ejecutado en Colab T4 sin problemas.
- Stack independiente de V5: `transformers>=4.41,<4.46`, `accelerate`, `peft`, `einops`, `timm`, `datasets`. Sin Unsloth, sin flash-attn.
- Tarea: tag custom `<EXTRACT_TOTAL>` (descartado `<OCR_WITH_REGION>`).
- Florence-2-base cargado en fp16, dataset `Lacax/Tickets-total` accesible, smoke test zero-shot ejecutado.
- `etiquetadas/` subidas al repo HF como verificación visual humana (NO usar en training: data leakage).

### H2 — Formato Florence-2 + DataCollator — ✅ **COMPLETADO** (ejecutado 2026-05-01)

- Tag custom `<EXTRACT_TOTAL>` (decisión H1).
- Cuantización bbox: 1000 bins sobre tamaño PIL **original** (formula upstream `processing_florence2.py`), no sobre 768×768.
- Target: `"{total:.2f}<loc_x1><loc_y1><loc_x2><loc_y2>"`. BOS/EOS por tokenizer.
- Notebook celdas I (helpers), J (`Florence2TotalCollator`), K (verificación) — pasa shapes, decode y forward dummy con `out.loss` finito.

### H3 — Fine-tune en T4 — ✅ **COMPLETADO** (ejecutado 2026-05-02)

- Full fine-tune con Trainer (no hizo falta LoRA: VRAM pico 6.44 GB)
- EarlyStopping en época 5/10, **mejor en época 3** con `eval_loss=1.3980`
- Train loss 2.72 → 0.45 (overfitting esperado, dataset 104 train)
- Best model en `Drive/TFG/V6_checkpoints/h3_full_ft_best/`
- Mitigado el bug de tied weights de Florence-2 con `model.tie_weights()` post-load (celda Q)

### H4 — Evaluación cuantitativa con holdout — ✅ **COMPLETADO** (ejecutado 2026-05-02)

- Holdout 14 imgs test: `total ±0.01 = 85.7 %`, `malformed = 0/14`, `IoU≥0.7 = 64.3 %`, IoU media 0.59.
- 1 error real (3↔5 mal leído), 1 output con dígitos extra (17.17.7), 3 falsos negativos de IoU por instancia repetida del total en el ticket (subtotal/IVA con el mismo valor).
- Test OOD (imagen del usuario fuera del dataset): el modelo localiza la zona del total correctamente.
- Verificación cruzada con OCR.space sobre el crop → trasladada a H5 (forma parte de la demo Gradio).

### H5 — Demo Gradio + validación cruzada OCR.space — pendiente

- Reutilizar Gradio de `Pruebas_de_inferencia_V5.ipynb`
- Pipeline: ticket → Florence-2 (total + bbox) → crop → OCR.space sobre crop → verdict ✅/⚠️

### H6 — Memory bank + redacción TFG — pendiente

- Append `experiments.md` con métricas V6
- Append `decisions.md` con decisión Florence-2 vs Donut/PaliGemma
- Tabla comparativa V5 vs V6 en la memoria del TFG

---

## Estado actual (2026-05-01)

- H0 ✅ cerrado: `dataset_total.jsonl` con 130 entradas (matcher reforzado + relabel manual)
- H1 ✅ ejecutado: notebook corrió A→H en Colab T4 sin OOM, dataset `Lacax/Tickets-total` accesible, tag `<EXTRACT_TOTAL>` añadido y verificado.
- H2 ✅ ejecutado: celdas I/J/K validadas en Colab T4 (collator OK, decode reproduce target, forward dummy con loss finito).
- H3 ✅ ejecutado (2026-05-02): full fine-tune, mejor época 3, eval_loss=1.3980, VRAM pico 6.44 GB.
- H4 ✅ ejecutado (2026-05-02): holdout total±0.01 85.7 %, IoU≥0.7 64.3 %, malformed 0. Test OOD positivo.
- **Siguiente acción**: H5 — demo Gradio + verificación cruzada OCR.space sobre el crop del bbox.

---

## Verificación end-to-end (resumen)

1. `python DataAugmentation/build_total_dataset.py --limit 1` → 1 imagen, bbox visualmente correcto
2. `--limit 10` → ≥80 % match correcto
3. `--limit` completo (136) → revisión manual en `etiquetadas/`
4. Subida a HF
5. Notebook Colab corre fin a fin sin OOM
6. Holdout: exact match ≥ 70 %, IoU ≥ 0.5
7. Demo Gradio operativa con validación cruzada
