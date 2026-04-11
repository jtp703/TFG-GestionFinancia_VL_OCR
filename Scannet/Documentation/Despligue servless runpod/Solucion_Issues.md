# Solución de Issues — Despliegue Serverless RunPod

> Fecha: 2026-04-11

---

## Issue 1 — Worker en bucle de reinicios ("Initializing" / worker roto)

### Síntoma

El worker arrancaba, se quedaba en estado `Initializing` y tras ~8 intentos de 18 segundos cada uno se marcaba como roto. Los logs mostraban:

```
start container jtp703/scannet-ocr-worker:latest: begin
start container jtp703/scannet-ocr-worker:latest: begin  ← reinicio cada 18s
...
stop container
remove container
```

Sin ninguna línea de output de Python (ni siquiera el primer `print`).

### Causa raíz

En `requirements.txt` se incluía `torch==2.1.0`. La imagen base `runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel` ya tiene PyTorch 2.1.0 instalado con los bindings de CUDA 11.8 compilados específicamente para esa imagen.

Al ejecutar `pip install torch==2.1.0` dentro del contenedor, pip descarga una build genérica de torch que **sobreescribe los bindings CUDA** de la imagen base. El resultado es que `import torch` falla o torch no detecta la GPU, el proceso Python muere antes de ejecutar ningún `print`, y RunPod interpreta el contenedor como roto.

### Fix aplicado

Eliminar `torch==2.1.0` de `requirements.txt`. La imagen base ya provee la versión correcta.

```diff
- torch==2.1.0
+ # torch NO se instala aquí — la imagen base ya lo incluye con CUDA correcto
```

### Pasos para aplicar el fix

```bash
cd Scannet/runpod-worker

# Rebuild con el requirements corregido
docker build -t jtp703/scannet-ocr-worker:latest .

# Push de la nueva imagen
docker push jtp703/scannet-ocr-worker:latest
```

Después, en el panel de RunPod: ir al endpoint → **Edit** → cambiar la imagen a la misma (`jtp703/scannet-ocr-worker:latest`) para forzar que RunPod descargue la versión nueva, o eliminar el endpoint y crear uno nuevo.

---

## Issue 2 — ¿Dónde está el RUNPOD_ENDPOINT_ID?

### Dónde encontrarlo

1. Ir a [runpod.io](https://www.runpod.io) → **Serverless** → clicar en el endpoint creado.
2. El Endpoint ID aparece en la URL del navegador:
   ```
   https://www.runpod.io/console/serverless/AQUI_ESTA_EL_ID
   ```
3. También aparece en la tarjeta del endpoint bajo el nombre, con formato alfanumérico de ~10 caracteres (ej: `abc1234xyz`).

### Cómo usarlo

```
RUNPOD_ENDPOINT_ID=abc1234xyz   ← este valor va en .env.local y en Vercel
```

La URL de llamada desde `scan.ts` será:

```
https://api.runpod.ai/v2/abc1234xyz/runsync
```

---

---

## Issue 3 — AttributeError: `register_pytree_node` (transformers vs PyTorch 2.1.0)

### Síntoma

```
File "/app/handler.py", line 22, in <module>
    from transformers import AutoModel, AutoTokenizer
  File ".../transformers/utils/generic.py", line 486, in <module>
    _torch_pytree.register_pytree_node(
AttributeError: module 'torch.utils._pytree' has no attribute 'register_pytree_node'.
Did you mean: '_register_pytree_node'?
```

### Causa raíz

`transformers==4.56.2` usa `torch.utils._pytree.register_pytree_node` (API pública), que fue añadida en **PyTorch 2.2.0**. La imagen base anterior tenía PyTorch **2.1.0**, donde la función existe pero con nombre privado (`_register_pytree_node`). Incompatibilidad de versiones.

Confirmado por [HuggingFace issue #37838](https://github.com/huggingface/transformers/issues/37838): `_register_pytree_node error in torch 2.1.0`.

### Fix aplicado

Cambiar la imagen base del Dockerfile a una con PyTorch 2.2.1:

```diff
- FROM runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel-ubuntu22.04
+ FROM runpod/pytorch:2.2.1-py3.10-cuda12.1.1-devel-ubuntu22.04
```

La imagen `runpod/pytorch:2.2.1-py3.10-cuda12.1.1-devel-ubuntu22.04` está confirmada en Docker Hub. Python 3.10, CUDA 12.1, compatible con RTX 3090.

### Impacto

- La restricción crítica "no instalar unsloth" se mantiene.
- `transformers==4.56.2` se mantiene (necesario para DeepseekV2MoE).
- CUDA cambia de 11.8 → 12.1 (Ampere/RTX 3090 es compatible con ambas).

---

## Lecciones aprendidas

| Problema                                   | Causa                                                                                                                                                                                                        | Regla a seguir                                                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Worker crash sin output Python             | `torch` reinstalado vía pip sobreescribe CUDA bindings                                                                                                                                                       | Nunca incluir `torch` en requirements si la imagen base ya lo tiene                                                        |
| Conflicto `huggingface_hub`                | Pin `==0.31.1` incompatible con `transformers==4.56.2` (requiere `>=0.34.0`)                                                                                                                                 | Dejar `huggingface_hub` sin pin; pip resuelve dentro del rango de transformers                                             |
| `register_pytree_node` AttributeError      | `transformers==4.56.2` requiere PyTorch ≥ 2.2.0; imagen base tenía 2.1.0                                                                                                                                     | Cambiar base image a `runpod/pytorch:2.2.1-py3.10-cuda12.1.1-devel-ubuntu22.04`                                            |
| `matplotlib` ImportError                   | El custom code de `unsloth/DeepSeek-OCR-2` importa matplotlib; no estaba en requirements                                                                                                                     | Añadir `matplotlib` y `tqdm` a requirements.txt ✅ RESUELTO                                                                |
| Approach de inferencia incorrecto          | handler.py usaba `apply_chat_template` — el modelo requiere `DeepSeekOCR2DataCollator` con `images`, `images_seq_mask`, `images_spatial_crop` explícitos                                                     | Reescribir handler.py basándose en Pruebas_de_inferencia.ipynb Celda 3 ✅ RESUELTO                                         |
| Sin espacio en disco (Problema A)          | Modelo pesa 6.6 GB, disco por defecto ~5.3 GB libre                                                                                                                                                          | Container Disk → 20 GB en RunPod sin rebuild ✅ RESUELTO                                                                   |
| Check de caché falso positivo (Problema B) | `config.json` presente pero safetensors ausentes tras descarga parcial                                                                                                                                       | Check cambiado a `model-00001-of-000001.safetensors` ✅ RESUELTO                                                           |
| `torch_dtype` deprecado                    | `AutoModel.from_pretrained` con `torch_dtype=` lanza warning; parámetro correcto es `dtype=`                                                                                                                 | Cambiar a `dtype=torch.bfloat16` en handler.py ✅ RESUELTO                                                                 |
| Modelo genera `} ` (output vacío)          | `PeftModel` sin mergear produce generación incorrecta en greedy decoding. El notebook usa `FastVisionModel.for_inference()` que hace el merge internamente. Sin merge, el modelo colapsa al primer token `}` | Añadir `model = model.merge_and_unload()` tras `PeftModel.from_pretrained` ✅ FIX APLICADO — pendiente rebuild + verificar |

---

## PENDIENTE — Sesión 2026-04-11 (continuación)

### Issue 5 — Modelo genera `} ` en lugar de JSON completo ← ACTIVO

**Síntoma (test con `recibo_almeria_133.jpg`):**

```json
{
  "error": "El modelo no devolvió JSON válido",
  "output": { "raw": "} " },
  "executionTime": 2076
}
```

**Causa identificada:** `PeftModel.from_pretrained` carga el adaptador LoRA sobre el modelo base pero NO integra los pesos en el grafo. `model.generate()` sobre un `PeftModel` sin mergear produce generación inestable en decoding greedy — el modelo colapsa al token `}` como primer output. El notebook funciona porque `FastVisionModel.for_inference(model)` llama internamente a `merge_and_unload()`.

**Fix aplicado en handler.py (pendiente rebuild):**

```python
# Antes (líneas 75-78):
model = PeftModel.from_pretrained(model, LORA_MODEL_ID, token=HF_TOKEN)
model.eval()

# Después:
model = PeftModel.from_pretrained(model, LORA_MODEL_ID, token=HF_TOKEN)
model = model.merge_and_unload()   # ← integra pesos LoRA en base model
model.eval()
```

También corregido: `torch_dtype=` → `dtype=` (deprecation).

**Estado:** Fix en handler.py local ✅ — merge_and_unload NO resolvió el `} `. Ver Issue 6.

---

## Issue 6 — Modelo genera `} ` (en investigación) ← ACTIVO

**Síntoma:** Todas las peticiones retornan `{ "error": "El modelo no devolvió JSON válido", "raw": "} " }` con `executionTime` ~1s.

**Hipótesis investigadas:**

| Hipótesis | Fix aplicado | Resultado |
|-----------|-------------|-----------|
| PeftModel sin merge | `merge_and_unload()` | ❌ No resolvió |
| BOS spurioso por `add_bos_token=True` | `tokenizer.add_bos_token = False` | ❌ No resolvió |
| `torch_dtype` deprecado | Revertido a `torch_dtype=` | ⚪ No era causa |

**Próxima hipótesis a verificar (debug añadido):**

El modelo custom (`modeling_deepseekocr2.py:420`) solo procesa imágenes si:
```python
if sam_model is not None and (input_ids.shape[1] != 1 or self.training) and torch.sum(images[0][1]).item() != 0:
```
Si `sam_model` es None o `img_sum ≈ 0`, la imagen se ignora y el modelo genera sin contexto visual → `} `.

**Debug añadido en handler.py (pendiente rebuild):**
```python
sam = getattr(model, 'sam_model', None) or getattr(getattr(model, 'model', None), 'sam_model', None)
img_sum = images[0][1].sum().item()
print(f"[debug] input_ids shape: {input_ids.shape}, sam_model: {sam is not None}, img_sum: {img_sum:.2f}")
print(f"[debug] images_seq_mask True count: {images_seq_mask.sum().item()}")
# ... tras generate:
print(f"[debug] generated {len(generated_ids)} tokens: {generated_ids.tolist()[:20]}")
print(f"[debug] raw (no skip): {repr(tokenizer.decode(generated_ids, skip_special_tokens=False))[:200]}")
```

**Próxima acción:**
1. `docker build -t jtp703/scannet-ocr-worker:latest . && docker push`
2. Lanzar test con `recibo_almeria_133.jpg`
3. Leer logs RunPod → analizar valores de debug
4. Fix definitivo basado en logs

---

### Estado actual (2026-04-11 — pausa sesión 2)

| Componente                    | Estado |
| ----------------------------- | ------ |
| Docker image en Hub           | ⚠️ Necesita rebuild con debug (handler.py modificado localmente) |
| Container Disk RunPod         | ✅ 20 GB |
| Worker arranca + modelo carga | ✅ Verificado |
| Endpoint responde peticiones  | ✅ No crash, retorna error JSON |
| Output del modelo correcto    | ❌ Genera `} ` — causa pendiente de debug |

**Coste acumulado: ~10.91 USD**
