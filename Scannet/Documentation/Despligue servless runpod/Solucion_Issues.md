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

| Problema | Causa | Regla a seguir |
|----------|-------|----------------|
| Worker crash sin output Python | `torch` reinstalado vía pip sobreescribe CUDA bindings | Nunca incluir `torch` en requirements si la imagen base ya lo tiene |
| Conflicto `huggingface_hub` | Pin `==0.31.1` incompatible con `transformers==4.56.2` (requiere `>=0.34.0`) | Dejar `huggingface_hub` sin pin; pip resuelve dentro del rango de transformers |
| `register_pytree_node` AttributeError | `transformers==4.56.2` requiere PyTorch ≥ 2.2.0; imagen base tenía 2.1.0 | Cambiar base image a `runpod/pytorch:2.2.1-py3.10-cuda12.1.1-devel-ubuntu22.04` |
| `matplotlib` ImportError | El custom code de `unsloth/DeepSeek-OCR-2` importa matplotlib; no estaba en requirements | Añadir `matplotlib` y `tqdm` a requirements.txt ✅ RESUELTO |
| Approach de inferencia incorrecto | handler.py usaba `apply_chat_template` — el modelo requiere `DeepSeekOCR2DataCollator` con `images`, `images_seq_mask`, `images_spatial_crop` explícitos | Reescribir handler.py basándose en Pruebas_de_inferencia.ipynb Celda 3 ✅ RESUELTO |

---

## PENDIENTE — Próxima sesión (pausa 2026-04-11)

### Problema A — Sin espacio en disco en el worker

**Síntoma:**
```
The expected file size is: 6778.57 MB
The target location only has 5352.08 MB free disk space.
RuntimeError: No space left on device
```

**Causa:** El modelo base `unsloth/DeepSeek-OCR-2` pesa ~6.6 GB. El worker RunPod tiene ~5.3 GB libres por defecto.

**Fix requerido (SIN rebuild):**
- En RunPod → Edit endpoint → aumentar **Container Disk** a mínimo **20 GB**.

---

### Problema B — Check de caché detecta descarga incompleta como completa

**Síntoma:**
```
[worker] Modelo base ya en cache.   ← falso positivo
FileNotFoundError: model-00001-of-000001.safetensors   ← pesos no descargados
```

**Causa:** El handler comprueba `if not os.path.exists(f"{LOCAL_DIR}/config.json")`. La descarga fallida dejó `config.json` pero no los pesos. El check pasa y el worker intenta cargar un modelo incompleto.

**Fix requerido (rebuild pequeño):** Cambiar el check a:
```python
if not os.path.exists(f"{LOCAL_DIR}/model-00001-of-000001.safetensors"):
```

---

### Estado al pausar

| Componente | Estado |
|---|---|
| Docker image | ✅ `jtp703/scannet-ocr-worker:latest` con handler correcto |
| matplotlib + tqdm | ✅ Instalados |
| DeepSeekOCR2DataCollator | ✅ Handler reescrito correctamente |
| Disco RunPod | ❌ Pendiente aumentar a 20 GB |
| Check de caché | ❌ Pendiente fix (rebuild pequeño) |

**Orden de acción al retomar:**
1. RunPod → Edit endpoint → Container Disk → 20 GB (sin rebuild)
2. Fix check de caché en handler.py → rebuild → push
3. Verificar que el worker arranca y descarga el modelo completo
4. Continuar con Fase 4 — test con curl

10,91$ gastado recuerdalo en el chat revisa actual
