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
