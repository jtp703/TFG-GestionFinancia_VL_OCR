# Experimentos de fine-tuning

## V3 (2026-04-08) — FALLIDO

- Dataset: 683 muestras (Lacax/Tickets), 3 épocas, RTX 4090, RunPod
- Loss: 1.44 → 0.47, sin split de validación
- Causa del fallo: bug rutas imagen (paths relativos → os.path.exists() siempre False → muestras silenciadas); LoRA solo 12/30 capas cubiertas; lora_alpha=32 (= r, no 2×r)
- Inferencia: alucinaciones graves, campos inventados (cief, pt, vivienda, barrachitas), mezcla ES/ZH

## V4 (2026-04-09) — PARCIAL

- Dataset: 682 muestras, split 90/10 (613 train / 69 val), 3 épocas, RTX 4090, 77 min
- Hiperparámetros: lr=2e-4, batch=1, grad_accum=8, warmup=5%, bf16=True
- LoRA: r=32, alpha=64 (2×r), dropout=0.05, 7 módulos, 24 capas → 172.6M params (4.85%)
- Loss final train: 0.0399 ⚠️ (posible memorización). val_loss: no registrado en output
- Fix bugs V3: rutas absolutas con os.path.abspath(), split validación, cobertura LoRA completa
- Inferencia con imagen italiana → alucinaciones (imagen fuera de dominio)

## Tests V4 (2026-04-09)

| Test | Resultado | Nota |
|------|-----------|------|
| A — 5 tickets españoles | 5/5 PASS | Determinista |
| B — imagen no-ticket | Borderline | Era recibo tarjeta prepago, no imagen sin texto |
| C — consistencia ×5 | PASS | 5/5 idénticos (do_sample=False) |
| D — campo faltante | JSON inválido | Puntuación unicode ，：en imágenes degradadas |
| E — comercio no visto | PASS | ULTRAMARINOS EL TORO, sin overfitting |

Fix aplicado en scan.ts: normalización unicode ，→, ：→: antes de JSON.parse.

## V5 (2026-04-27) — FALLIDO POR ALUCINACIÓN DE ITEMS

- Dataset: `dataset_golden.jsonl` Gemini-anotado, 816 muestras, split 85/15 (693 train / 123 val)
- Hiperparámetros V5: lr=1e-4, dropout=0.1, r=16, alpha=32, 6 epochs + EarlyStopping(patience=2), bf16
- LoRA: 86,307,840 params entrenables (2.48%) en las 24 capas — ~50% menos que V4
- Stack RunPod: torch 2.8.0+cu128, xformers 0.0.32.post2, transformers 4.56.2, unsloth 2026.4.8
- Duración: 10244 s (~2h 50min) en RTX 4090, plantilla `runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404`
- Adapter: `Lacax/deepseek_ocr_lora_v5` (V4 conservado en `Lacax/deepseek_ocr_lora`)

### Métricas de entrenamiento (todas las épocas)

| Epoch | eval_loss | Δ |
|-------|-----------|---|
| 1 | 0.6439 | — |
| 2 | 0.3390 | −0.305 |
| 3 | 0.2023 | −0.137 |
| 4 | 0.1482 | −0.054 |
| 5 | 0.1298 | −0.018 |
| 6 | **0.1274** ← best | −0.002 |

- Train loss final: 0.3197 (curva monotónica, sin sobreajuste numérico aparente)
- EarlyStopping no disparó. Best checkpoint = último (epoch 6 / step 522)

### Veredicto cualitativo (Gradio + ticket Mercadona real, `Dataset_inference/img2.jpeg`)

- **Cabecera**: comercio, CIF, fecha, fecha_original → extraídos correctamente
- **Items + total**: **alucinación completa**. Modelo inventa items plausibles para Mercadona (HIGIENICO DOBLE ROLL, ICE TEA LIMÓN, VELAS TE CHAI…) que no aparecen en el ticket
- Total real 44.97 €, modelo predice 39.94 €
- Confirmado en múltiples tickets vía Gradio: el modelo nunca lee items reales, solo genera ítems-tipo de comercios vistos en training

### Diagnóstico de causa raíz

1. **Resolución insuficiente para texto fino**: `dynamic_preprocess(max_num=6, image_size=768)` deja la zona de items en pocos píxeles efectivos. Cabecera con tipografía grande sobrevive; items con tipografía pequeña no
2. **Dataset 816 demasiado pequeño** para que el modelo aprenda a *leer* texto fino — solo aprende a *generar JSON con estilo del comercio*
3. **86M params LoRA** suficientes para "estilo de respuesta" pero no para OCR fino sobre tickets nuevos
4. **eval_loss=0.13 ENGAÑOSO**: validación interna no detectó la alucinación porque el modelo memorizó patrones de comercios vistos en training. Train↔val internos comparten distribución → métrica ciega a la generalización real

### Decisión

- H7 cuantitativo formal **omitido** — el resultado cualitativo es definitivo, F1 sobre 30 tickets solo añadiría decimales
- V5 no producible para Scannet → **pipeline OCR.space + DeepSeek-chat se mantiene en producción**
- V5 → capítulo del TFG: "fine-tuning de VLMs es viable pero requiere dataset >> 816 muestras y/o arquitectura específica de OCR para texto fino. eval_loss puede ser engañoso si val comparte distribución con train"

### Lecciones para futuras iteraciones

- Validar siempre con holdout **externo** antes de confiar en eval_loss
- Para OCR de texto fino, considerar arquitecturas especializadas (Donut, TrOCR) o aumentar drásticamente resolución del crop
- Anotación con Gemini garantiza JSON válido pero no resuelve el problema de capacidad del modelo base

## V6 (2026-05-02) — H3 entrenado

- Modelo: `microsoft/Florence-2-base` (~230M params, encoder-decoder DaViT + BART)
- Dataset: `Lacax/Tickets-total` (130 entradas, split 104 train / 12 val / 14 test estratificado por cuartil del total)
- Plataforma: Google Colab T4 (16 GB VRAM)
- Tarea: tag custom `<EXTRACT_TOTAL>` → target `{total:.2f}<loc_x1><loc_y1><loc_x2><loc_y2>`
- Hiperparámetros: full FT, fp32 weights + Trainer fp16=True, bs=1, grad_accum=4, lr=1e-5 cosine, warmup 0.1, gradient_checkpointing, 10 ép. + EarlyStopping(patience=2)
- Resultado: stop ép. 5/10, mejor en **ép. 3** con `eval_loss=1.3980`. VRAM pico 6.44 GB. Runtime 477 s (~8 min).
- Pérdidas por época (train | eval): 2.72|1.57 → 1.29|1.45 → 0.90|**1.40** → 0.67|1.44 → 0.45|1.51

### Sanity check post-train (3 imgs val, generación deterministic greedy)

| img | total GT | total pred | bbox |
|-----|----------|-----------|------|
| recibo_almeria_114 | 19.55 | 19.55 ✅ | desviación 8-12 px (~1 %) ✅ |
| recibo_almeria_121 | 3.20  | 3.20  ✅ | desviación 0-3 px ✅ |
| recibo_almeria_142 | 73.47 | 5.4   ❌ | esquina sup. derecha vs centro-izq ❌ |

- Hipótesis del fallo en `recibo_almeria_142`: **ticket girado**. Florence-2 base no es invariante a rotación con un train de solo 104 imgs.
- Bug benigno: warning de missing keys (`embed_tokens.weight`, `lm_head.weight`) al recargar best — safetensors deduplica tied weights. Resuelto con `model.tie_weights()` post-load.

### Lecciones tempranas (pre-H4)

- Para una hipotética V6.1: augmentation con rotaciones ±15° (rotando bbox también) en train; el holdout no se toca.
- En inferencia: deskew con OpenCV (función `preprocess_ticket` ya existe en V5) antes de pasar al modelo.
- VRAM 6.44 GB en full FT abre la puerta a aumentar `batch` o pasar a `Florence-2-large` en una iteración futura sin LoRA.

### H4 — eval cuantitativo holdout (14 imgs test, 2026-05-02)

| Métrica | Valor |
|---------|-------|
| n_test | 14 |
| malformed | 0 (0.0 %) |
| total exact | 12 (85.7 %) |
| total ±0.01 € | 12 (85.7 %) |
| IoU media | 0.590 |
| IoU ≥ 0.5 | 10 (71.4 %) |
| IoU ≥ 0.7 | 9 (64.3 %) |

**Diagnóstico de los 5 fallos**:

- `recibo_almeria_020`: error real de OCR (`32.13` → `52.13`, confunde dígito `3↔5`).
- `recibo_almeria_139`: total mal cerrado (`17.17.7`); el regex salva `17.7` pero el output del modelo está mal.
- `recibo_almeria_009 / 103 / 062`: total **correcto** + IoU=0. El bbox del modelo apunta a una **instancia distinta del mismo número** en el ticket (subtotal/total/IVA repiten el valor). H0 (OCR.space + matcher) eligió una; el modelo aprendió otra. Ambos bboxes son válidos para el campo `total`. La métrica IoU contra un único GT está sesgada cuando hay múltiples apariciones.

**Lectura honesta**:

- Métrica principal del campo: `total ±0.01 = 85.7 %` con `0 mal-formados`.
- Métrica bbox condicional: 9/14 IoU≥0.7 cuando solo hay una aparición del total.
- Test OOD (img.png subida por el usuario): el modelo localiza correctamente la zona del total en un ticket fuera del dataset → generalización aparente, no solo memorización.

**Para una hipotética V6.1**: anotar todas las apariciones del total en H0 y evaluar IoU contra el mejor match del conjunto.

## DeepSeek-OCR-2 LoRA (2026-05-13) — evaluación inicial

- Modelo: `unsloth/DeepSeek-OCR-2` (~3.5B, MoE), LoRA r=16 alpha=16, 86M params (2.48%)
- Dataset: `Lacax/Tickets/original` (133 muestras, mismo conjunto usado en training → mide convergencia)
- Plataforma: Google Colab T4, 23 min, VRAM pico 11.7 GB
- Adapter guardado en: `Lacax/deepseek_original_dataset`
- Tarea: extracción full JSON (comercio, cif, fecha, total, items[])

### Métricas sobre train set (133 muestras)

| Métrica | Valor |
|---------|-------|
| malformed JSON | 66 (49.6 %) |
| total ±0.01 (global) | 62 (46.6 %) |
| total ±0.01 (sobre válidos) | ~92.5 % |
| items count match | 45 (33.8 %) |
| items alucinados (>GT) | 4 (3.0 %) |

### Diagnóstico de los 66 malformed

Dos tipos identificados:
1. **Salida vacía** ("directly resize" sin JSON): modelo no genera output para esa imagen
2. **JSON truncado**: modelo genera JSON válido pero se corta antes del `}` final → regex no matchea. Causa probable: `max_new_tokens` por defecto insuficiente para tickets con muchos items

### Lectura honesta

- El modelo **sí aprendió el formato JSON** — 92.5% de acierto en total cuando el output es válido
- El problema principal es la **fiabilidad del output** (49.6% malformed), no la alucinación (V5 tenía >40% alucinación; aquí solo 3%)
- Pendiente: fix con `max_new_tokens=1024` y diagnóstico por tipo de fallo

### Próximo paso

Reclasificar fallos (vacíos / truncados / JSON inválido) y re-inferir truncados con token budget ampliado. Resultado esperado: malformed baje a ~20-30% (solo los vacíos genuinos).
