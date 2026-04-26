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
