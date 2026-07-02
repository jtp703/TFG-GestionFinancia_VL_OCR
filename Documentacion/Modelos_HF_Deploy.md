# Inventario de modelos HuggingFace y viabilidad de despliegue local

**Fecha:** 2026-05-18  
**Rama:** Feature-App-Stack-V6  
**Autor:** Jonni / Claude

---

## 1. Inventario completo de modelos publicados

| Modelo HF | Fecha | Notebook origen | Base model | Estado |
|---|---|---|---|---|
| `Lacax/deepseek-recibos-v1` | Ene 28 | `Deepseek_OCR_2_(3B).ipynb` / `Deepseek_OCR_2_(3B)_Lacax_Tickets.ipynb` | DeepSeek-VL | Archivado — experimento inicial |
| `Lacax/deepseek_ocr_lora` | Abr 11 | `Deepseek_OCR_Runpod_Fix_V4.ipynb` + `V4_Ejecutado.ipynb` | `unsloth/DeepSeek-OCR-2` | Adaptador V4 — fue producción en RunPod |
| `Lacax/deepseek_ocr_lora_v5` | Abr 27 | `Deepseek_OCR_Runpod_Fix_V5.ipynb` + `V5_Ejecutado.ipynb` | `unsloth/DeepSeek-OCR-2` | Descartado — alucina items |
| `Lacax/deepseek_original_dataset` | May 13 | `model_vs_model/Deepseek_OCR_2_modelo_original.ipynb` | `unsloth/DeepSeek-OCR-2` | **Activo en deploy local** |

> Florence-2 V6 (`V6_Florence2_Total.ipynb`) no tiene modelo publicado en HF — guardado solo en Drive en `TFG/V6_checkpoints/h3_full_ft_best/`.

---

## 2. Ficha técnica por modelo

### `Lacax/deepseek_ocr_lora` — V4

| Campo | Valor |
|---|---|
| Dataset | 682 muestras, split 90/10 (613 train / 69 val) |
| Plataforma | RTX 4090, RunPod, 77 min |
| LoRA | r=32, alpha=64, dropout=0.05, 7 módulos, 24 capas → 172.6M params (4.85%) |
| Hiperparámetros | lr=2e-4, bs=1, grad_accum=8, warmup=5%, bf16=True, 3 épocas |
| Train loss final | 0.0399 ⚠️ (posible memorización) |
| Val loss | No registrado |
| Tests (5 tickets ES) | 5/5 PASS |
| Consistencia ×5 | PASS |
| Imagen no-ticket | Borderline |
| Campo faltante | JSON inválido (unicode ，：en imágenes degradadas) |
| Comercio no visto | PASS (sin overfitting evidente) |

**Resumen:** El mejor adaptador en producción hasta la fecha. Funciona bien en tickets españoles estándar; tiene debilidades en imágenes con caracteres unicode especiales y en tickets fuera de dominio.

---

### `Lacax/deepseek_ocr_lora_v5` — V5

| Campo | Valor |
|---|---|
| Dataset | 816 muestras, split 85/15 (693 train / 123 val), anotado con Gemini 2.5 Flash |
| Plataforma | RTX 4090, RunPod, ~2h 50min |
| LoRA | r=16, alpha=32, dropout=0.1, 86M params (2.48%) |
| Hiperparámetros | lr=1e-4, bs=1, grad_accum=8, bf16=True, 6 épocas + EarlyStopping(patience=2) |
| Val loss final | 0.1274 (mejor en epoch 6) |
| Cabecera (comercio/CIF/fecha) | ✅ Correcta |
| Items + total | ❌ Alucinación completa — inventa items plausibles para el comercio visto en training |
| Causa raíz | Resolución insuficiente para texto fino + dataset demasiado pequeño (816) para OCR real |
| Decisión | **Descartado para producción** |

**Resumen:** eval_loss engañosamente bueno. El modelo aprende el "estilo" del JSON por comercio pero no lee los items del ticket real.

---

### `Lacax/deepseek_original_dataset` — DeepSeek-OCR-2 original

| Campo | Valor |
|---|---|
| Dataset | 133 muestras originales (`Lacax/Tickets/original`) — mismo conjunto que train |
| Plataforma | Google Colab T4, 23 min, VRAM pico 11.7 GB |
| LoRA | r=16, alpha=16, 86M params (2.48%) |
| Malformed JSON (global) | 49.6% (66/133) |
| Total ±0.01 (global) | 46.6% (62/133) |
| Total ±0.01 (sobre válidos) | ~92.5% |
| Items count match | 33.8% |
| Alucinación items (>GT) | 3.0% |

**Resumen:** Baja tasa de alucinación vs V5, pero alta tasa de salida malformed. Cuando genera JSON válido, el total es correcto en ~92% de los casos. Problema principal: fiabilidad del output, no calidad cuando sí genera.

---

## 3. Despliegue local — estado actual

El deploy local funciona con:
- **Base:** `unsloth/DeepSeek-OCR-2` (en `F:\Model_Local_inference\models\deepseek_ocr2_base`)
- **Adapter activo:** `Lacax/deepseek_original_dataset` (en `F:\Model_Local_inference\models\deepseek_ocr2_lora`)
- **Entorno:** conda `deepseek-infer`, torch-directml 0.2.5, AMD RX 6750 XT

**Limitación crítica transversal a todos los adaptadores:** el LoRA fue entrenado con Unsloth, que nombra internamente las capas MoE de forma distinta a cómo el modelo las expone con `trust_remote_code`. PEFT no matchea `mlp.experts.gate_up_proj/down_proj` → los pesos del fine-tuning **no se aplican a los expertos MoE** (las capas más numerosas del modelo). Los tres adaptadores comparten este problema.

---

## 4. Viabilidad de sustituir el adaptador en local

Sustituir el adaptador activo por V4 o V5 es **trivial a nivel operativo**: solo requiere cambiar dos líneas en `server.py`:

```python
# Actual
LORA_ADAPTER = r"F:\Model_Local_inference\models\deepseek_ocr2_lora"

# Para V4
LORA_ADAPTER = r"F:\Model_Local_inference\models\deepseek_ocr2_lora_v4"

# Para V5
LORA_ADAPTER = r"F:\Model_Local_inference\models\deepseek_ocr2_lora_v5"
```

Los modelos deben descargarse previamente con `download_models.py` (o equivalente).

---

## 5. Análisis comparativo de los adaptadores para deploy local

| Criterio | V4 (`deepseek_ocr_lora`) | V5 (`deepseek_ocr_lora_v5`) | Original (`deepseek_original_dataset`) |
|---|---|---|---|
| Dataset de entrenamiento | 682 muestras | 816 muestras (Gemini) | 133 muestras (originales) |
| Calidad de anotación | Manual / original | Gemini 2.5 Flash | Manual / original |
| Tasa malformed esperada | Desconocida local | Alta (alucina) | 49.6% en train set |
| Fiabilidad cabecera | Alta (5/5 en test) | Alta | Media |
| Fiabilidad items | Media (sin métricas holdout) | Baja (alucinación) | Media (33.8% count match) |
| Compatibilidad PEFT/LoRA local | ⚠️ Mismo mismatch MoE | ⚠️ Mismo mismatch MoE | ⚠️ Mismo mismatch MoE |
| Riesgo de regresión | Bajo | Alto (alucinación conocida) | — (es el actual) |

---

## 6. Plan de pruebas recomendado

### Opción A — Probar V4 en local (recomendada)

V4 fue el adaptador en producción de RunPod y superó los tests con tickets españoles reales. Aunque el mismatch MoE se aplica igual que al adaptador actual, las capas de atención/proyección sí reciben los pesos de V4, que entrenó con 5× más datos.

**Pasos:**
1. Descargar `Lacax/deepseek_ocr_lora` a `F:\Model_Local_inference\models\deepseek_ocr2_lora_v4`
2. Cambiar `LORA_ADAPTER` en `server.py`
3. Reiniciar uvicorn y ejecutar el mismo lote de tickets de prueba
4. Comparar tasa de malformed y calidad de extracción vs adaptador actual

### Opción B — Fix definitivo: merge_and_unload en Colab

En lugar de seguir con la limitación PEFT, fusionar el adaptador con el modelo base en Colab (`model.merge_and_unload()`) y guardar el modelo ya fusionado. Esto:
- Elimina el mismatch de nombres de capa
- Aplica correctamente los pesos a **todos** los módulos incluyendo MoE
- Permite cargar con `AutoModel.from_pretrained` sin PEFT
- El modelo fusionado pesa ~7 GB (vs base + adapter separados)

**Candidato para merge:** V4 (`deepseek_ocr_lora`) — el más testado y con menor riesgo de alucinación.

### Opción C — No cambiar el adaptador

El adaptador actual (`deepseek_original_dataset`) tiene las métricas más recientes y es el único evaluado cuantitativamente en el entorno local. Los problemas conocidos (49.6% malformed) tienen fix pendiente (`max_new_tokens=1024`). Aplicar ese fix primero antes de cambiar el adaptador.

---

## 7. Recomendación

**Orden de actuación sugerido:**

1. **Inmediato:** Aplicar fix `max_new_tokens=1024` al adaptador actual y re-medir tasa de malformed. Esperado: baja de 49.6% a ~20-30%.
2. **Corto plazo:** Si la tasa baja a <25%, probar V4 en local (Opción A) para comparar directamente.
3. **Medio plazo:** Ejecutar `merge_and_unload` en Colab con V4 y reemplazar el modelo local por la versión fusionada (Opción B). Este es el fix definitivo.

V5 **no se recomienda** para deploy local — la alucinación de items es un problema conocido y confirmado que no se resuelve cambiando el entorno.
