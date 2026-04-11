# PLAN_V4 — Pruebas del Modelo y Preparación para Scannet

> **Objetivo:** Verificar que el modelo `Lacax/deepseek_ocr_lora` (V4) funciona correctamente en inferencia con tickets españoles antes de integrarlo en Scannet.
> **Entorno:** Google Colab (GPU T4 gratuita o A100 de pago), sin necesidad de RunPod ni reentrenamiento.

---

## Paso 1 — Inspección de Safetensors (Colab)

**Qué:** Descargar el adaptador LoRA desde HF y ejecutar análisis estadístico de tensores.

**Por qué:** La Fase 2 de la auditoría quedó bloqueada. Es necesario confirmar que no hay NaN, Inf ni capas muertas en los pesos guardados.

**Cómo:**

```python
# En Google Colab
!pip install safetensors huggingface_hub

from huggingface_hub import snapshot_download
snapshot_download("Lacax/deepseek_ocr_lora", local_dir="./adapter", token="TU_HF_TOKEN")

from safetensors import safe_open
import torch

results = {"critical": [], "warnings": []}
with safe_open("./adapter/adapter_model.safetensors", framework="pt") as f:
    for key in f.keys():
        tensor = f.get_tensor(key)
        if torch.isnan(tensor).any(): results["critical"].append(f"NaN en {key}")
        if torch.isinf(tensor).any(): results["critical"].append(f"Inf en {key}")
        if (tensor == 0).float().mean() > 0.9: results["warnings"].append(f"Capa muerta: {key}")
        if tensor.float().std() < 1e-7: results["warnings"].append(f"Varianza nula: {key}")

print("CRÍTICOS:", results["critical"])
print("ADVERTENCIAS:", results["warnings"])
```

**Criterio de éxito:** Sin NaN, sin Inf, sin capas con varianza nula.

---

## Paso 2 — Carga del Modelo en Entorno Limpio (Colab)

**Qué:** Cargar base + adaptador en Colab y confirmar que no hay errores de incompatibilidad de tipo de modelo.

**Por qué:** Durante el entrenamiento aparece repetidamente el warning `"You are using a model of type deepseek_vl_v2 to instantiate a model of type DeepseekOCR2"`. Hay que confirmar que el adaptador carga correctamente en inferencia en un entorno limpio.

**Cómo:**

```python
!pip install unsloth transformers peft accelerate huggingface_hub pillow

from huggingface_hub import snapshot_download
from unsloth import FastVisionModel
from transformers import AutoModel
from peft import PeftModel

# Descargar base
snapshot_download("unsloth/DeepSeek-OCR-2", local_dir="./deepseek_ocr2", token="TU_HF_TOKEN")

# Cargar base + adaptador
model, tokenizer = FastVisionModel.from_pretrained(
    "./deepseek_ocr2",
    load_in_4bit=False,
    auto_model=AutoModel,
    trust_remote_code=True,
)
model = PeftModel.from_pretrained(model, "Lacax/deepseek_ocr_lora", token="TU_HF_TOKEN")
FastVisionModel.for_inference(model)
print("Modelo cargado correctamente.")
```

**Criterio de éxito:** Carga sin errores críticos (los warnings de tipo son tolerables si la inferencia funciona).

---

## Estado actual

| Paso | Estado | Notas |
|------|--------|-------|
| Paso 1 — Inspección safetensors | ✅ PASS | Sin NaN/Inf, 168 lora_B a cero (normal) |
| Paso 2 — Carga del modelo | ✅ PASS | AutoModel + PeftModel, transformers==4.56.2 |
| Test A — Tickets españoles | ✅ 5/5 PASS | Confirmado en dos ejecuciones independientes |
| Test B — Imagen no-ticket | ⚠️ Borderline | `comercio=""` correcto, `total` extraído — imagen era un recibo de tarjeta prepago |
| Test C — Consistencia ×5 | ✅ PASS | 5/5 idénticos, determinista |
| Test D — Campo faltante | ❌ JSON inválido | Puntuación unicode china (，：) — requiere normalización en `/api/scan.ts` |
| Test E — Comercio no visto | ✅ PASS | "ULTRAMARINOS EL TORO", sin overfitting |

### Fix de infraestructura aplicado (2026-04-09)

- **Problema**: `FastVisionModel.from_pretrained` falla con `deepseek_vl_v2` en unsloth >= 2025.x
- **Fix**: Inferencia con `AutoModel.from_pretrained` + `PeftModel.from_pretrained` (sin unsloth)
- **Versión**: `transformers==4.56.2` — mantiene `DeepseekV2MoE` y `LlamaAttention` compatibles con el modelo
- **Script de Tests B-E**: `paso3_testsBCDE.py`

---

## Paso 3 — Banco de Pruebas de Inferencia (5 tests del protocolo)

**Qué:** Ejecutar los 5 tests de comportamiento del protocolo de auditoría con tickets españoles reales.

**Por qué:** La inferencia en el notebook falló con una imagen italiana. Hay que confirmar si el modelo funciona con su dominio real (tickets españoles).

**Prompt estándar a usar en todos los tests:**

```python
PROMPT = """<image>
Extract the following information from the receipt and return it STRICTLY as a valid JSON object matching this structure:
{"comercio": "string", "cif": "string", "fecha": "string", "total": "number",
 "items": [{"cantidad": "int", "descripcion": "string", "precio": "number"}]}
NO other text. ONLY valid JSON.
"""
```

### Test A — Ticket español del dataset (sanidad básica)

- Usar 3-5 imágenes de MERCADONA, GRUPO DIA o SUPER ALCARRO del dataset de entrenamiento.
- **PASA:** JSON válido con datos coherentes con la imagen.
- **FALLA:** Texto libre, alucinaciones, JSON malformado.

### Test B — Imagen completamente fuera de dominio (no-ticket)

- Usar una foto de paisaje o retrato (sin texto de ticket).
- **PASA:** JSON con campos nulos/vacíos o mensaje de que no es un ticket.
- **FALLA:** Inventa datos de comercio, total, etc.

### Test C — Consistencia (misma imagen × 5)

- Enviar el mismo ticket español 5 veces con el mismo prompt.
- **PASA:** Los 5 resultados son idénticos o con diferencias mínimas de tokenización.
- **FALLA:** Totales o comercios diferentes en distintas ejecuciones.

### Test D — Ticket con campo faltante (campo recortado)

- Usar una imagen recortada donde no se vea el total o el comercio.
- **PASA:** El campo no visible aparece como `null` o cadena vacía.
- **FALLA:** Inventa el valor del campo recortado.

### Test E — Ticket de comercio no visto en entrenamiento

- Usar un ticket de una tienda o formato que no esté en el dataset de entrenamiento.
- **PASA:** Extrae los campos correctamente o los deja parcialmente incompletos de forma razonable.
- **FALLA:** Devuelve el nombre de un comercio del dataset de entrenamiento (overfitting).

---

## Paso 4 — Decisión de Integración con Scannet

**Decisión tomada: INTEGRAR CON CAUTELA**

Según los resultados del Paso 3:

| Escenario                                  | Decisión                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| Tests A, C pasan + B, D parcialmente pasan | ✅ **Integrar** — el modelo es funcional para el caso de uso                |
| Test A falla consistentemente              | ❌ **No integrar** — requiere nueva iteración de entrenamiento (V5)         |
| Test A pasa pero B o D fallan gravemente   | ⚠️ **Integrar con cautela** — añadir validación de salida en `/api/scan.ts` |

### Si se decide integrar:

1. Actualizar `HF_MODEL_ID` en `.env.local` y Vercel a `Lacax/deepseek_ocr_lora`.
2. Verificar que `/api/scan.ts` usa el prompt exacto del entrenamiento (ver Paso 3).
3. Añadir extracción regex como fallback en `/api/scan.ts` por si el modelo genera texto alrededor del JSON.
4. Probar end-to-end en Scannet con `vercel dev` antes de hacer deploy.

---

## Paso 5 — Actualización del Informe de Auditoría

Tras ejecutar los pasos anteriores:

- Actualizar `Documentacion/VLM_AUDIT_ReportV4.md` con los resultados de Fases 2 y 5.
- Marcar los bloqueos como resueltos o documentar nuevos hallazgos.
- Si la integración es exitosa, registrar la versión del modelo usada en Scannet en `walkthrough.md`.

---

## Archivos de referencia

| Archivo                                                          | Propósito                                   |
| ---------------------------------------------------------------- | ------------------------------------------- |
| `Documentacion/VLM_AUDIT_ReportV4.md`                            | Informe completo de auditoría del modelo V4 |
| `Documentacion/VLM_FINETUNE_AUDIT_PROTOCOL.md`                   | Protocolo de auditoría de referencia        |
| `Deepseek OCR/codigo/Deepseek_OCR_Runpod_Fix_V4_Ejecutado.ipynb` | Notebook de entrenamiento ejecutado         |
| `Scannet/api/scan.ts`                                            | Función de Vercel que llama al modelo       |

## HuggingFace

| Recurso           | ID                        |
| ----------------- | ------------------------- |
| Modelo base       | `unsloth/DeepSeek-OCR-2`  |
| Adaptador LoRA V4 | `Lacax/deepseek_ocr_lora` |
| Dataset           | `Lacax/Tickets` (privado) |
