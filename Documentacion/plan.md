# Plan V5 — DeepSeek-OCR fine-tune

> Origen: `Documentacion/respuesta_extendida.md` §9 (20 acciones re-priorizadas).
> Sin tiempos. Verificación por hitos en Notion.
> Convenciones: **C** = lo hago yo (Claude). **U** = lo haces tú. **C+U** = colaborativo.

---

## Decisión de arquitectura de datos (2026-04-26)

En lugar de sanear manualmente el JSONL existente, se regenera el dataset completo desde las
imágenes originales usando **Gemini 2.5 Flash** como anotador automático (knowledge distillation).

Ventajas:

- JSON estrictamente válido (`json.loads()` directo, sin regex)
- Schema unificado desde el origen
- Productos a dos líneas anotados correctamente
- Cantidad siempre `number` (no string)
- CIF sin guiones, fecha en ISO + fecha_original

Nuevo formato del JSONL (`dataset_golden.jsonl`):

```json
{"image_path": "recibo_almeria_004.jpg", "ground_truth": {"comercio": "...", "cif": "...", ...}}
```

El `ground_truth` es ahora un **objeto JSON**, no un string. Rompe con el formato v1/v2.

---

## H0 — Información previa ✅ (completado 2026-04-26)

| #   | Resultado                                                                                |
| --- | ---------------------------------------------------------------------------------------- |
| 0.1 | 38 comercios únicos en 62 tickets v1 → diversidad alta, no sobreajuste a pocos comercios |
| 0.2 | Pendiente verificar diff prompt train vs infer                                           |
| 0.3 | Sin métricas formales del pipeline OCR.space (baseline pendiente de medir)               |
| 0.4 | 150 imágenes en `F:\datasetTickets\v3` (recibo_almeria_004 a recibo_almeria_154)         |

---

## H1 — Quick wins en inferencia (sin reentrenar) → §9 acciones 1–5

| #   | Acción                                                              | Quién           | Verificación                                    |
| --- | ------------------------------------------------------------------- | --------------- | ----------------------------------------------- |
| 1.1 | `max_new_tokens` 1024 → **4096** en notebook de inferencia          | C ✅            | Cambio en celda 3 y 4                           |
| 1.2 | `repetition_penalty` 1.3 → **1.0** (desactivado)                    | C ✅            | Cambio aplicado                                 |
| 1.3 | Verificar EOS natural en tickets cortos (`recibo_almeria_001..010`) | C ✅            | Confirmado en output Test A previo              |
| 1.4 | Forzar `dynamic_preprocess` para imágenes >768 px                   | C ✅            | Eliminada condición `<=768px` en collator       |
| 1.5 | Preprocesado OpenCV: deskew + crop de márgenes blancos              | C ✅            | Función `preprocess_ticket(img)` en celda 3 y 4 |
| 1.6 | Re-ejecutar Test A (5 tickets) y comparar con baseline V4           | **U pendiente** | JSON output + diff campo a campo                |

**Criterio de cierre:** desaparece el truncamiento del Test A.

---

## H2 — Capa de validación post-procesado → §9 acciones 6–10

| #   | Acción                                        | Quién | Verificación                                   |
| --- | --------------------------------------------- | ----- | ---------------------------------------------- |
| 2.1 | Validador aritmético por línea + total        | C ✅  | `validators/arithmetic.py`                     |
| 2.2 | Validador NIF/CIF con checksum                | C ✅  | `validators/nif_cif.py`                        |
| 2.3 | Normalizador de fechas → ISO 8601             | C ✅  | `validators/dates.py` (sin dateparser, stdlib) |
| 2.4 | Diccionario de abreviaturas (70+ entradas ES) | C ✅  | `validators/abbreviations.py`                  |
| 2.5 | Deduplicación por distancia de Levenshtein    | C ✅  | `validators/dedup.py` (difflib)                |
| 2.6 | Módulo `validators/` reutilizable             | C ✅  | `from validators import validate`              |

**Criterio de cierre:** validadores retornan `{valid, warnings, normalized_json}`.

---

## H3 — Dataset golden con Gemini 2.5 Flash (reemplaza H3+H5 originales)

| #   | Acción                                                                            | Quién    | Verificación                                           |
| --- | --------------------------------------------------------------------------------- | -------- | ------------------------------------------------------ |
| 3.1 | Script `annotate_with_gemini.py` — ya creado                                      | C ✅     | `DataAugmentation/annotate_with_gemini.py`             |
| 3.2 | Instalar dependencias                                                             | **U** ✅ | `pip install google-generativeai Pillow`               |
| 3.3 | Lanzar anotación: `python annotate_with_gemini.py`                                | **U** ✅ | 150 imágenes → `dataset_golden.jsonl`                  |
| 3.4 | Revisar `annotate_errors.json` — imágenes que fallaron                            | U+C ✅   | Reanotar manualmente o relanzar con `--resume`         |
| 3.5 | Spot-check manual: revisar ~10 anotaciones aleatorias                             | **U** ✅ | Calidad visual vs output Gemini                        |
| 3.6 | Actualizar `augment_images.py` para leer nuevo formato (ground_truth como objeto) | C ✅     | `load_jsonl` usa `json.loads()` directo                |
| 3.7 | Actualizar `build_dataset.py` para el nuevo formato                               | C ✅     | `load_original_jsonl` delega en `load_standard_jsonl`  |
| 3.8 | Re-lanzar pipeline: augment → build → upload HF                                   | **U** ✅ | `Lacax/Tickets` V5 — 816 imágenes (136 orig + 680 aug) |

**Criterio de cierre:** `dataset_golden.jsonl` con 150 entradas, `json.loads()` directo en todos, spot-check sin problemas graves.

---

## H4 — Análisis de diversidad y detección de gaps ✅ (completado 2026-04-26)

| #   | Acción                                                                                  | Quién | Verificación                             |
| --- | --------------------------------------------------------------------------------------- | ----- | ---------------------------------------- |
| 4.1 | Script de análisis sobre `dataset_golden.jsonl` (distribución items, fechas, comercios) | C ✅  | 55+ comercios únicos, 12 formatos fecha  |
| 4.2 | Confirmar que Gemini cubrió productos a dos líneas, formatos de fecha                   | C ✅  | McDonald's, PLK, Five Guys cubiertos     |
| 4.3 | Listado de gaps residuales (si los hay)                                                 | C ✅  | 3 duplicados exactos; sin gaps críticos  |

**Criterio de cierre:** ✅ 55+ comercios, 12 formatos fecha, multi-línea, devoluciones, descuentos, null cantidad, peso/litros.

**Decisión H5:** NO se necesitan sintéticos. Dataset suficiente para proceder a H6.

---

## H5 — Sintéticos complementarios (solo si H4 detecta gaps)

| #   | Acción                                                                                          | Quién | Verificación                                  |
| --- | ----------------------------------------------------------------------------------------------- | ----- | --------------------------------------------- |
| 5.1 | Reducir augmentations 10 → **3-5** en `augment_images.py`                                       | C     | Flag `--num-augments`                         |
| 5.2 | Modificar `generate_synthetic_ticket.py`: productos a dos líneas, formatos fecha, ruido térmico | C     | Templates actualizados                        |
| 5.3 | Generar sintéticos nuevos                                                                       | **U** | PNGs + anotados por Gemini o anotación manual |

**Criterio de cierre:** gaps detectados en H4 cubiertos.

---

## H6 — Notebook V5

| #   | Acción                                                              | Quién           | Verificación                                                |
| --- | ------------------------------------------------------------------- | --------------- | ----------------------------------------------------------- |
| 6.1 | Crear `Deepseek_OCR_Runpod_Fix_V5.ipynb` desde V4                   | C ✅            | `Deepseek OCR/codigo/Deepseek_OCR_Runpod_Fix_V5.ipynb`      |
| 6.2 | `lr` 2e-4 → **1e-4**                                                | C ✅            | Celda H — `learning_rate=1e-4`                              |
| 6.3 | `dropout` 0.05 → **0.1**                                            | C ✅            | Celda C — `lora_dropout=0.1`                                |
| 6.4 | `r` 32 → **16**, `alpha` 32 (2×r)                                   | C ✅            | Celda C — `r=16, lora_alpha=32`                             |
| 6.5 | 6 épocas con `EarlyStoppingCallback(patience=2)` sobre val_loss     | C ✅            | Celda H — `callbacks=[EarlyStoppingCallback(...)]`          |
| 6.6 | `eval_strategy="epoch"` + log explícito de val_loss por época       | C ✅            | Celda H + Celda I — log de `eval_loss` post-train           |
| 6.7 | Data collator para nuevo formato (ground_truth como objeto)         | C ✅            | Celda E usa `json.loads()` directo + `json.dumps` al target |
| 6.+ | Bonus V5: `dynamic_preprocess` siempre activo (sin guard ≤768)      | C ✅            | Celda G — `min_num=1, max_num=6, use_thumbnail=False`       |
| 6.+ | Bonus V5: prompt único `INSTRUCTION` train↔inferencia               | C ✅            | Celda E — constante reutilizable                            |
| 6.+ | Bonus V5: split 85/15 (vs V4 90/10) — holdout interno mayor         | C ✅            | Celda E — `test_size=0.15`                                  |
| 6.8 | Lanzar entrenamiento V5 en RunPod                                   | **U pendiente** | Modelo → `Lacax/deepseek_ocr_lora_v5`                       |

**Criterio de cierre:** V5 entrenado con val_loss por época visible.

---

## H7 — Evaluación cuantitativa V5 vs Pipeline

| #   | Acción                                                      | Quién | Verificación                            |
| --- | ----------------------------------------------------------- | ----- | --------------------------------------- |
| 7.1 | Reservar holdout de 30 tickets no vistos en training        | C     | Carpeta `holdout/` + JSONL ground truth |
| 7.2 | Script `evaluate.py`: F1 por campo                          | C     | Métricas reproducibles                  |
| 7.3 | Inferencia V5 sobre holdout                                 | **U** | Outputs JSON                            |
| 7.4 | Inferencia pipeline OCR.space + DeepSeek-chat sobre holdout | **U** | Outputs JSON                            |
| 7.5 | Comparativa V5 vs Pipeline vs V4 (tabla F1)                 | C     | Reporte final                           |

**Criterio de cierre:** tabla F1 de los 3 enfoques.

---

## H8 — Decisión estratégica

- Si V5 ≥ Pipeline → integrar V5 en Scannet (resolver Issue 6 RunPod o explorar alternativas).
- Si V5 < Pipeline → pipeline sigue en producción; V5 queda como experimento académico en la memoria del TFG.

---

## Cambio de formato JSONL — impacto en el pipeline

| Componente                    | Cambio necesario                    |
| ----------------------------- | ----------------------------------- |
| `annotate_with_gemini.py`     | ✅ Genera nuevo formato             |
| `augment_images.py`           | ⚠️ Actualizar parser (H3.6)         |
| `build_dataset.py`            | ⚠️ Actualizar parser (H3.7)         |
| Notebook V5 data collator     | ⚠️ Actualizar parser (H6.7)         |
| `Pruebas_de_inferencia.ipynb` | No afecta (inferencia, no training) |

---

## Delegaciones a tu lado (U)

- **H3.2** `pip install google-generativeai Pillow`
- **H3.3** Lanzar `python annotate_with_gemini.py`
- **H3.4** Revisar `annotate_errors.json`
- **H3.5** Spot-check manual ~10 anotaciones
- **H3.8** Lanzar pipeline augment → build → upload HF
- **H5.3** Lanzar generación de sintéticos (si aplica)
- **H6.8** Lanzar entrenamiento V5 en RunPod
- **H7.3, H7.4** Lanzar inferencia sobre holdout

En cada caso esperaré tu confirmación antes de continuar.
