# Walkthrough — Log de sesiones

> Solo append al final. Nunca reescribir sesiones anteriores.
> Para el usuario, no para Claude.

---

## 2026-04-26 — H1: Quick wins inferencia

### Qué se hizo

Aplicados los cambios H1.1–H1.5 al notebook `Deepseek OCR/codigo/Inferencia/Pruebas_de_inferencia.ipynb`, celdas 3 y 4.

**H1.1 + H1.2** — Parámetros de generación:
- `max_new_tokens`: 1024 → **4096** (evita truncamiento en tickets largos)
- `repetition_penalty`: 1.3 → **1.0** (desactivado; penalizaba tokens JSON repetidos como `},{`)

**H1.3** — EOS natural: confirmado en el output del Test A anterior. Los 5 tickets terminaban con `<｜end▁of▁sentence｜>` dentro del límite de 1024 tokens, así que no había truncamiento activo.

**H1.4** — `dynamic_preprocess` para todas las resoluciones:
- Antes: solo se activaba si la imagen era ≤768×768px. Los tickets reales (1536×2048) usaban solo la vista global 1024×1024.
- Ahora: siempre activo (`min_num=1, max_num=6`). Para un ticket 1536×2048 el modelo verá la vista global + hasta 6 crops de 768×768.

**H1.5** — Función `preprocess_ticket(img)`:
- Deskew: detecta ángulo de inclinación con `cv2.minAreaRect` y corrige si >0.5°
- Crop márgenes: elimina bordes blancos buscando el bounding box del contenido
- Se aplica antes de cada inferencia tanto en celda 3 (Test A) como en celda 4 (`run_inference`)

---

## 2026-04-26 — H2: Módulo validators/

### Qué se hizo

Creado `TFG/validators/` — módulo Python autocontenido (solo stdlib + dateparser opcional).

| Archivo | Responsabilidad |
|---------|----------------|
| `arithmetic.py` | Verifica que `sum(items) ≈ total` (tolerancia 0.05€) |
| `nif_cif.py` | Checksum NIF (mod 23) y CIF (algoritmo oficial AEAT) |
| `dates.py` | Parsea formatos ES/EN → ISO 8601; conserva `fecha_original` |
| `abbreviations.py` | 70+ reglas regex: PLU, ENTRA→ENTERA, BOT→BOTELLA, etc. |
| `dedup.py` | Fusiona items duplicados (difflib ≥82% similitud) |
| `pipeline.py` | Orquesta todo; devuelve `{valid, warnings, normalized_json}` |

### Uso desde Colab / notebook

```python
import sys; sys.path.insert(0, '/content/TFG')  # ajustar ruta
from validators import validate

result = validate(json_extraido)
print(result["valid"])
print(result["warnings"])
print(result["normalized_json"])
```

### Cómo verificar

```bash
python -m validators.tests   # desde TFG/
```
Debe dar 5/5 PASS.

---

### Cómo verificar (H1.6)

Ejecutar la celda 3 en RunPod con las mismas 5 imágenes del Test A. Criterio de cierre: PASS 5/5 y sin truncamiento. Comparar token count con el baseline V4 (mismos tickets: 172, 113, 177, 230, 114 tokens).

---

## Sesión 2026-04-26 — Diagnóstico V4 y diseño V5

### Qué se hizo

1. **Análisis del diagnóstico V4** a partir de `Documentacion/respuesta.md` y `Documentacion/respuesta_extendida.md`.
2. **Auditoría del dataset** `dataset_espanol_ampliado.jsonl` (62 tickets, 38 comercios únicos).
3. **Plan V5 creado** en `Documentacion/plan.md` con hitos H0-H8.
4. **Decisión de arquitectura de datos**: en lugar de sanear el JSONL manual v1/v2, se regenera el dataset completo desde las 150 imágenes originales usando Gemini 2.5 Flash como anotador.
5. **Script `DataAugmentation/annotate_with_gemini.py`** creado y listo.

### Decisiones tomadas

- Schema golden: `cantidad` como `number`, `cif` sin guiones, `fecha` en ISO 8601, `fecha_original` literal del ticket, `ground_truth` como objeto JSON (no string).
- Formato nuevo del JSONL rompe con v1/v2: `augment_images.py`, `build_dataset.py` y el data collator del notebook necesitarán actualización (pendiente H3.6, H3.7, H6.7).
- Hiperparámetros V5: `lr=1e-4`, `dropout=0.1`, `r=16`, 5-8 épocas con early stopping, `val_loss` registrado.
- RunPod congelado hasta H8.

### Cómo verificar

1. En `DataAugmentation/annotate_with_gemini.py` — revisar que el prompt golden sea correcto y ejecutar con `--delay 1.5`.
2. Tras ejecutar: comprobar que `dataset_golden.jsonl` tiene 150 líneas y que `json.loads()` sobre cada `ground_truth` funciona.
3. Revisar `annotate_errors.json` — imágenes que Gemini no pudo anotar correctamente.

### Pendiente del usuario

- `pip install google-generativeai Pillow`
- Lanzar `python DataAugmentation/annotate_with_gemini.py`
- Spot-check de ~10 anotaciones y confirmación

---

## 2026-04-26 — H6 completado: notebook V5 listo para deploy

### Qué se hizo

Creado el notebook de entrenamiento V5 para RunPod RTX 4090: `Deepseek OCR/codigo/Deepseek_OCR_Runpod_Fix_V5.ipynb`. Diseñado desde V4 ejecutado, incorpora todas las mejoras identificadas en `Documentacion/respuesta_extendida.md` y los cambios de schema del dataset golden (Gemini-anotado).

### Decisiones tomadas

**Hiperparámetros V5 (tabla resumen):**

| Parámetro | V4 | V5 | Motivo |
|---|---|---|---|
| `lr` | 2e-4 | 1e-4 | Reduce memorización (sec. 5 respuesta_extendida) |
| `dropout` | 0.05 | 0.1 | Regularización mayor en bajo dato |
| `r` / `alpha` | 32/64 | 16/32 | Reduce params entrenables 172M → ~86M |
| `num_train_epochs` | 3 | 6 | Con `EarlyStoppingCallback(patience=2)` |
| `eval_strategy` | "epoch" | "epoch" + log explícito post-train | Visibilidad de val_loss (gap V4) |
| Validation split | 90/10 | 85/15 | Holdout interno mayor |

**Cambios estructurales:**

- **Dataset**: migrado a `dataset_golden.jsonl` (Gemini-anotado, 136 tickets reales + 680 aug = 816 imágenes en `Lacax/Tickets`). `ground_truth` se carga con `json.loads()` directo (objeto JSON), elimina anti-patrón del regex parser de V4.
- **Prompt único `INSTRUCTION`** (constante en celda E): mismo prompt en training e inferencia, evitando degradación por divergencia (sec. 8.3 respuesta_extendida.md). Schema actualizado con `fecha_original` y `cantidad: number|null`.
- **Data collator**: `dynamic_preprocess` siempre activo (eliminado guard `≤768px`), `min_num=1, max_num=6, use_thumbnail=False` — coincide con behavior del notebook de inferencia.
- **Adapter destino**: `Lacax/deepseek_ocr_lora_v5` (no sobrescribe V4 — necesario para comparativa H7).
- **Test cells eliminadas** (a petición del usuario): el test de inferencia post-training se delega a Colab (`gradio_demo.py`).

**Librerías ancladas:**

- `transformers==4.56.2` (mantiene `DeepseekV2MoE`, eliminado en 5.x)
- `unsloth + unsloth_zoo` (force-reinstall, no-deps)
- Resto: `peft, accelerate, datasets, huggingface_hub, pillow, torchvision, addict, matplotlib`

### Cómo verificar

1. Subir `Deepseek_OCR_Runpod_Fix_V5.ipynb` a RunPod.
2. Ejecutar Celda A (verificar GPU = RTX 4090 con ≥24GB libre).
3. Ejecutar Celda B (instalar deps) → **reiniciar kernel**.
4. Ejecutar Celdas C-J en orden.
5. Verificar Celda D: cobertura de capas LoRA = 24 (no <20).
6. Verificar Celda E: dataset cargado con 816 muestras totales, split 85/15.
7. Tras Celda I (entrenamiento): comprobar log de `val_loss` por época. El "Mejor val_loss" debe ser menor que el último (si no, EarlyStopping habría parado).
8. Verificar en HF que `Lacax/deepseek_ocr_lora_v5` existe con `adapter_config.json` apuntando a `unsloth/DeepSeek-OCR-2`.

### Pendiente del usuario

- **H6.8**: configurar `HF_TOKEN` con permisos write y lanzar entrenamiento en RunPod.
- **H1.6**: relanzar Test A en Colab con `gradio_demo.py` (confirmar que las mejoras H1 no rompieron nada).
- **H7 (post-H6.8)**: anotar con Gemini los 30 tickets externos (en posesión del usuario, no incluidos en los 136 ya anotados) → ejecutar V5 sobre ellos → F1 por campo vs Pipeline vs V4.

---

## 2026-04-27 — V5 entrenado, evaluado y cerrado como experimento académico

### Qué se hizo

**1. Despliegue V5 en RunPod** (notebook `Deepseek_OCR_Runpod_Fix_V5.ipynb`)

Tras varios fallos de stack en cadena, plantilla final que funcionó: `runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404` (torch 2.8.0 + CUDA 12.8.1 + Ubuntu 24.04). Celda B endurecida en pasadas sucesivas para resolver:

- Driver host viejo (CUDA 12.7) vs torch cu128 → recreación con plantilla cu128
- `torchvision::nms` ABI mismatch → pin a `torchvision==0.23.0` desde índice cu128
- `bitsandbytes`, `trl`, `hf_transfer` faltantes (efecto secundario del `--no-deps` de unsloth)
- Dependencias transitivas de unsloth 2026.4.x: `diffusers, protobuf, pydantic, sentencepiece, typer, tyro, wheel, xformers, cut_cross_entropy, msgspec, torchao`
- Pin obligatorio: `datasets<4.4.0` y `trl<=0.24.0` (exigencias del propio unsloth)

Celda C requirió workaround: pre-registrar `DeepseekOCR2Config → DeepseekOCR2ForCausalLM` en `AutoModel` antes de `FastVisionModel.from_pretrained` para que el lookup directo no caiga en la iteración rota del mapping (que cargaba lazy `PerceptionEncoder`, ausente en transformers 4.56.2). Se usa `type(config).model_type` (atributo de clase) en lugar del de la instancia para evitar `ValueError` por mismatch.

**2. Resultados de entrenamiento**

- Duración: 10244 s (~2h 50min) en RTX 4090
- Train loss final: 0.3197 / val loss best: 0.1274 (epoch 6, step 522)
- Curva eval_loss monotónica: 0.6439 → 0.3390 → 0.2023 → 0.1482 → 0.1298 → 0.1274
- LoRA cubrió las 24 capas, 86.3M params entrenables (2.48%)
- Adapter subido a `Lacax/deepseek_ocr_lora_v5` (V4 conservado en `Lacax/deepseek_ocr_lora`)

**3. Notebook de inferencia V5** (`Deepseek OCR/codigo/Inferencia/Pruebas_de_inferencia_V5.ipynb`)

Notebook nuevo (V4 original conservado) con:
- Adapter apuntando a `Lacax/deepseek_ocr_lora_v5`
- `INSTRUCTION` idéntico al training V5 (con `fecha_original` y `cantidad: number|null`)
- Sin `FastVisionModel.for_inference` (problemático con deepseek_vl_v2)
- Celdas: setup, inspect adapter, load model, utilidades compartidas, test rápido 1 ticket, tests A-E, **demo Gradio con `share=True`**

**4. Evaluación cualitativa via Gradio**

Probado con `Dataset_inference/img2.jpeg` (ticket Mercadona real, foto de mano sobre bolsa de papel, total 44.97 €):

- ✅ Cabecera correcta: `comercio="MERCADONA, S.A."`, `cif="A46103834"`, `fecha="2025-12-23"`
- ❌ Total: predice 39.94 €, real 44.97 €
- ❌ Items: **inventados completamente**. Modelo genera "HIGIENICO DOBLE ROLL", "ICE TEA LIMÓN", "VELAS TE CHAI", "BOLSA PLASTICO" — productos plausibles para Mercadona pero ausentes en el ticket. Los items reales (HARINAMAIZ, MAYONESA, HIELO CUBITO, PECHUGA FAMILIAR, GUACAMOLE, PIÑA PELADA, MASA HOJALDRE, etc.) no aparecen en la salida

Confirmado en otros tickets vía Gradio: el modelo nunca lee items reales.

**5. Decisión: cerrar V5 como experimento académico**

- H7 cuantitativo (F1 sobre 30 tickets) **omitido**: veredicto cualitativo definitivo
- H8 decidido: **pipeline OCR.space + DeepSeek-chat se mantiene en producción**, V5 NO se integra
- V5 queda como capítulo del TFG con lecciones aprendidas

### Decisiones tomadas

- **eval_loss puede ser engañoso** cuando train↔val comparten distribución: V5 alcanzó 0.13 sin generalizar realmente. Para futuros experimentos, validar con holdout EXTERNO desde el inicio
- **86M params LoRA + 816 muestras + base_size 1024** insuficientes para OCR de texto fino. Cabecera con tipografía grande sobrevive; items con tipografía pequeña no
- Documentar V5 en la memoria del TFG resaltando el aprendizaje, no como fracaso

### Cómo verificar

1. Notebook ejecutado: `Deepseek OCR/codigo/Deepseek_OCR_Runpod_Fix_V5_Ejecutado.ipynb` — revisar outputs Celda I (eval_loss por época) y Celda J (push HF OK)
2. Adapter en HF: `https://huggingface.co/Lacax/deepseek_ocr_lora_v5` — debe contener `adapter_config.json` + `adapter_model.safetensors`
3. Reproducir alucinación: cargar el notebook V5 de inferencia en Colab → celda 6 (Gradio) → subir cualquier ticket Mercadona nuevo → comparar items extraídos vs ticket real
4. Estado de memoria: `memory/bot/experiments.md` (sección V5), `memory/bot/decisions.md` (V5 cerrado), `memory/bot/activeContext.md` (foco actual: redacción TFG)

### Pendiente del usuario

- Redactar capítulo V5 en la memoria del TFG (no requiere más experimentos del modelo)

---

## 2026-05-01 — V6 abierto: Florence-2 para extracción autónoma del total (H0 en curso)

### Qué se hizo

- Decisión de abrir V6 como capítulo académico adicional: extraer **solo `total`** con un modelo autosuficiente, OCR.space queda como validador
- Comparativa explícita Donut vs Florence-2 vs PaliGemma 2:
  - PaliGemma 2 3B descartado: VRAM al límite en T4 + sesión Colab corta a 12h
  - Donut descartado: pre-train 2022 sin bbox nativo
  - **Florence-2-base elegido**: pre-train multi-tarea 2024 + bbox nativo (`<OCR_WITH_REGION>`) que encaja con la validación cruzada
- Plan V6 escrito en `Documentacion/plan_v6.md` (hitos H0–H6)
- Script `DataAugmentation/build_total_dataset.py` creado para H0:
  - Lee `dataset_golden.jsonl`, llama OCR.space con `isOverlayRequired=true`
  - Pseudo-labels de bbox por matching del total contra palabras del overlay
  - Heurística por banda Y (OCR.space agrupa mal por proximidad horizontal)
  - Args `--limit`, `--offset`, `--append`, `--dump-ocr` para iteración manual
  - Imágenes etiquetadas en `F:/datasetTickets/dataset_final/etiquetadas/` para revisión visual
- Probado en 2 imágenes:
  - ✅ recibo_almeria_004 (Correos): bbox correcto en `36,70` de "TOTAL COMPRA €"
  - ⚠ recibo_almeria_005 (Mercadona): bbox cae en `Importe: 23,45 €` (línea inferior) en vez de `TOTAL (€) 23,45` — pendiente reforzar matcher

### Decisiones tomadas

- V6 NO entra en producción Scannet — solo capítulo TFG
- Plataforma fija: **Google Colab Tier gratuito (T4 16 GB)**, OOM como restricción crítica
- Dataset: 136 reales del golden, sin augmentation (target reducido + augmentation arriesga overfitting)
- Validación cruzada con OCR.space sobre el **crop del bbox**, no sobre el ticket entero
- Holdout externo obligatorio en H4 (lección de V5)
- Refuerzo del matcher acordado con el usuario:
  - HARD: el texto debe ser decimal con 2 dígitos (`X,XX` o `X.XX`)
  - HARD: la banda Y debe contener el símbolo `€`
  - SOFT: keyword `TOTAL`/`IMPORTE` → +score
  - SOFT: altura del texto → score proporcional (proxy de negrita/destacado)

### Cómo verificar

1. Ejecutar `python DataAugmentation/build_total_dataset.py --limit 1` y revisar `F:/datasetTickets/dataset_final/etiquetadas/recibo_almeria_004.jpg` — el bbox rojo debe rodear el total
2. Ejecutar `--offset 1 --limit 1 --append` y revisar `recibo_almeria_005.jpg` (en curso, fallando hasta refinar matcher)
3. Plan V6 en `Documentacion/plan_v6.md`
4. Estado en `memory/bot/activeContext.md` (V6 H0 en curso)

### Pendiente

- Reforzar `find_total_bbox` con las condiciones acordadas
- Validar imagen 2 → escalar a `--limit 10` → 136 completas → revisión manual
- Split 80/10/10 + subida a HF `Lacax/Tickets-total`
- H1: notebook Colab Florence-2

---

## 2026-05-01 (continuación) — H0 cierre + H1 código listo

### Qué se hizo

**Cierre H0 — dataset_total.jsonl con bbox**:
- Reforzado `find_total_bbox` en `DataAugmentation/build_total_dataset.py` con condiciones HARD (decimal X,XX + presencia de € en banda Y, exclusión IVA/BASE/SUBTOTAL) y SOFT (keyword TOTAL +2.0, altura del texto como proxy de negrita, ligera penalización por Y bajo). Validado primero en `recibo_almeria_005` (Mercadona) con score strict 3.50.
- Lotes de 10 hasta cubrir 136 imágenes. Resultados: 14 con bbox mal posicionado, 8 sin match en OCR.
- Creado `DataAugmentation/retry_no_match.py` — segundo intento OCR.space (bug fix: `zfill(3)` para IDs numéricos cortos). Recuperó 1/8 (recibo_almeria_070).
- Creado `DataAugmentation/relabel_total.py` — re-etiquetado manual con matplotlib `ginput(2)`: 2 clics (top-left + bottom-right), reescribe bbox y regenera imagen etiquetada. Aplicado a las 21 imágenes problemáticas.
- Estado final: **130 entradas con bbox válido en `dataset_total.jsonl`** (6 descartadas).

**H1 — Código listo (ejecución manual pendiente)**:
- Decisión arquitectónica: tarea = tag custom `<EXTRACT_TOTAL>` (no `<OCR_WITH_REGION>`). Razón: output corto (~10 tokens), pérdida concentrada en el campo target, viable en T4 16 GB.
- Decisión hosting: repo nuevo `Lacax/Tickets-total` (privado). NO se modifica `Lacax/Tickets` (V5).
- Decisión stack: dependencias elegidas desde cero según requisitos de Florence-2 + T4, NO extrapoladas de V5 (que usaba Unsloth + transformers 4.56.2 incompatibles con Florence-2).
- Creado `DataAugmentation/split_dataset_total.py` — split 80/10/10 estratificado por cuartil del total (104/12/14, seed=42). Distribución por bin equilibrada entre splits.
- Creado `DataAugmentation/upload_to_hf_total.py` — staging temporal con JSONLs en raíz + imágenes referenciadas en `original/`. Sin `--clean`, no borra contenido del Hub.
- Creado `Deepseek OCR/codigo/V6_Florence2_Total.ipynb` — 8 celdas: GPU check, install (`transformers>=4.41,<4.46` + accelerate/peft/einops/timm/datasets), mount Drive, login HF, carga Florence-2-base fp16, load_dataset, add tag, smoke test zero-shot.

### Cómo verificar

```powershell
# 1. Splits estratificados (ya generados)
python DataAugmentation/split_dataset_total.py
# Salida esperada: 104/12/14 con histograma equilibrado por cuartil

# 2. Subir dataset a HF (necesita HF_TOKEN write)
python DataAugmentation/upload_to_hf_total.py --token $env:HF_TOKEN

# 3. Subir el notebook a Colab, crear secret HF_TOKEN, "Run all" celdas A→H.
# Criterios H1:
#   - Celda E: params≈230M, fp16 VRAM≈X GB
#   - Celda G: <EXTRACT_TOTAL> tokenized to 1 id único
#   - Celda H: generate() sin OOM, pico VRAM < 12 GB
```

### Pendiente

- Ejecutar `upload_to_hf_total.py` (manual, requiere token write)
- Run-all del notebook en Colab T4 limpio
- Si todo verde → H2: DataCollator que mapee `{image,total,bbox}` a `pixel_values + input_ids=tag + labels=total<loc_x1><loc_y1><loc_x2><loc_y2>`

### Cierre H1 (2026-05-01)

- Subida HF ejecutada: `upload_to_hf_total.py` ampliado para subir también `etiquetadas/` al repo (verificación visual; NO se usa en training).
- Celda F del notebook ajustada: `load_image(name, labeled=False|True)` y vista lado a lado original vs etiquetada del primer ejemplo de val como sanity check del GT.
- Notebook ejecutado en Colab T4 sin problemas: A→H sin OOM, smoke test zero-shot OK.
- Sesión V6 pausada. Próximo retomar: H2 (formato target + DataCollator).
