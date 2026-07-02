# Plan — Despliegue de inferencia en RunPod Serverless

> Fecha: 2026-04-11  
> Modelo: `Lacax/deepseek_ocr_lora` (LoRA sobre `unsloth/DeepSeek-OCR-2`)  
> Destino: RunPod Serverless endpoint → consumido desde `api/scan.ts` en Vercel  
> Presupuesto: $10 de crédito en RunPod

---

## Arquitectura objetivo

```
Usuario (móvil/web)
  └─► Vercel Function /api/scan.ts
        └─► RunPod Serverless Endpoint (worker Docker)
              ├─ Descarga Lacax/deepseek_ocr_lora (LoRA) desde HF
              ├─ Carga base model unsloth/DeepSeek-OCR-2 desde caché
              └─► Devuelve JSON del ticket
```

---

## Archivos que se crearán

```
Scannet/
└── runpod-worker/
    ├── handler.py          → Lógica de inferencia + formato RunPod
    ├── Dockerfile          → Imagen del worker
    └── requirements.txt    → Dependencias exactas del entorno de inferencia
```

---

## Fase 1 — Preparación (código del worker)

### Paso 1.1 — `requirements.txt`

```
runpod==1.7.3
torch==2.1.0
transformers==4.56.2
peft==0.14.0
accelerate==1.6.0
pillow==11.2.1
huggingface_hub==0.31.1
addict==2.4.0
safetensors==0.5.3
sentencepiece
```

> ⚠️ `transformers==4.56.2` es obligatorio. Versiones superiores rompen `DeepseekV2MoE`.  
> ⚠️ NO instalar `unsloth` — sube la versión de transformers y rompe la carga del modelo.

---

### Paso 1.2 — `handler.py`

```python
"""
RunPod Serverless handler — inferencia OCR con Lacax/deepseek_ocr_lora
Basado en el pipeline validado en Pruebas_de_inferencia.ipynb (Celdas 0–2).
"""

import os
import re
import json
import base64
import io
import runpod
import torch
from PIL import Image
from transformers import AutoModel, AutoTokenizer
from peft import PeftModel

# ── Constantes ────────────────────────────────────────────────────────────────
# Modelo base: repo público de unsloth — NO requiere token
BASE_MODEL_ID = "unsloth/DeepSeek-OCR-2"
# Adaptador LoRA: repo privado Lacax — requiere HF_TOKEN con acceso de lectura
LORA_MODEL_ID = "Lacax/deepseek_ocr_lora"
HF_TOKEN      = os.environ.get("HF_TOKEN")  # solo se usa para el LoRA privado

PROMPT = (
    "Extract the following information from the receipt and return it STRICTLY "
    "as a valid JSON object matching this structure:\n\n"
    '{"comercio": "string", "cif": "string", "fecha": "string", "total": "number", '
    '"items": [{"cantidad": "int", "descripcion": "string", "precio": "number"}]}'
    "\n\nNO other text. ONLY valid JSON."
)

# ── Carga del modelo (ocurre una vez al iniciar el worker) ────────────────────
print("[worker] Cargando modelo base (unsloth/DeepSeek-OCR-2, público)...")
model = AutoModel.from_pretrained(
    BASE_MODEL_ID,
    trust_remote_code=True,
    torch_dtype=torch.bfloat16,
    device_map="cuda",
    # sin token — repo público
)
tokenizer = AutoTokenizer.from_pretrained(
    BASE_MODEL_ID,
    trust_remote_code=True,
    # sin token — repo público
)

print("[worker] Cargando adaptador LoRA...")
model = PeftModel.from_pretrained(model, LORA_MODEL_ID, token=HF_TOKEN)
model.eval()
print("[worker] Modelo listo.")


# ── Normalización del output del modelo ───────────────────────────────────────
def normalize_json_string(raw: str) -> str:
    """Normaliza puntuación unicode que el modelo genera en imágenes degradadas."""
    return (
        raw
        .replace("，", ",")
        .replace("：", ":")
        .replace("\u201c", '"')
        .replace("\u201d", '"')
    )


# ── Handler principal ─────────────────────────────────────────────────────────
def handler(job: dict) -> dict:
    """
    Entrada (job["input"]):
      - image     : str  — imagen en base64 puro (sin data URL prefix)
      - mime_type : str  — opcional, default "image/jpeg"

    Salida:
      - comercio, cif, fecha, total, items
      O bien: { "error": "..." }
    """
    job_input = job.get("input", {})
    image_b64 = job_input.get("image")
    mime_type = job_input.get("mime_type", "image/jpeg")

    if not image_b64:
        return {"error": "No se recibió imagen"}

    # Decodificar imagen
    try:
        image_bytes = base64.b64decode(image_b64)
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception as e:
        return {"error": f"Imagen inválida: {str(e)}"}

    # Construir conversación para DeepSeek-OCR-2
    conversation = [
        {
            "role": "User",
            "content": [
                {"type": "image"},
                {"type": "text", "text": PROMPT},
            ],
        }
    ]

    # Preparar inputs
    try:
        inputs = tokenizer.apply_chat_template(
            conversation,
            images=[image],
            add_generation_prompt=True,
            return_tensors="pt",
        ).to("cuda")
    except Exception as e:
        return {"error": f"Error preparando inputs: {str(e)}"}

    # Inferencia
    try:
        with torch.no_grad():
            output_ids = model.generate(
                **inputs,
                max_new_tokens=1000,
                do_sample=False,
                pad_token_id=tokenizer.eos_token_id,
            )
        generated = output_ids[0][inputs["input_ids"].shape[1]:]
        raw_text = tokenizer.decode(generated, skip_special_tokens=True)
    except Exception as e:
        return {"error": f"Error durante inferencia: {str(e)}"}

    # Extraer y parsear JSON
    json_match = re.search(r"\{[\s\S]*\}", raw_text)
    if not json_match:
        return {"error": "El modelo no devolvió JSON válido", "raw": raw_text}

    try:
        normalized = normalize_json_string(json_match.group(0))
        result = json.loads(normalized)
    except json.JSONDecodeError as e:
        return {"error": f"JSON inválido: {str(e)}", "raw": raw_text}

    # Normalizar tipos
    result["items"] = [
        {
            **item,
            "cantidad": int(float(item.get("cantidad", 1))) or 1,
            "precio":   float(item.get("precio", 0)) or 0,
        }
        for item in result.get("items", [])
    ]

    return result


# ── Punto de entrada RunPod ───────────────────────────────────────────────────
runpod.serverless.start({"handler": handler})
```

---

### Paso 1.3 — `Dockerfile`

```dockerfile
FROM runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel-ubuntu22.04

WORKDIR /app

# Copiar dependencias e instalar
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar handler
COPY handler.py .

# RunPod espera que el CMD arranque el worker
CMD ["python", "-u", "handler.py"]
```

> **Nota sobre la imagen base**: `runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel` incluye CUDA y PyTorch 2.1.0 preinstalados. Esto evita conflictos con la instalación manual de torch.

---

## Fase 2 — Build y push de la imagen Docker

Ejecutar en local (requiere Docker Desktop instalado y cuenta en Docker Hub):

```bash
# Situarse en el directorio del worker
cd Scannet/runpod-worker

# Build de la imagen
docker build -t jtp703/scannet-ocr-worker:latest .

# Login en Docker Hub
docker login

# Push
docker push jtp703/scannet-ocr-worker:latest
```

> Sustituir `TU_USUARIO_DOCKERHUB` por tu usuario real de Docker Hub.  
> La imagen tendrá ~6–8 GB por las dependencias de CUDA y PyTorch.

---

## Fase 3 — Crear el Serverless Endpoint en RunPod

### 3.1 — Acceder a RunPod

1. Ir a [runpod.io](https://www.runpod.io) → Login.
2. Añadir los $10 de crédito en **Billing → Add Credits**.

### 3.2 — Crear el Serverless Endpoint

1. Ir a **Serverless → + New Endpoint**.
2. Configurar:
   - **Container Image**: `TU_USUARIO_DOCKERHUB/scannet-ocr-worker:latest`
   - **GPU**: RTX 3090 (24 GB VRAM — suficiente para el modelo en bfloat16)
   - **Min Workers**: 0 (escala a 0 cuando no hay peticiones — ahorra crédito)
   - **Max Workers**: 1
   - **Idle Timeout**: 5 segundos (libera GPU rápido tras cada petición)
3. En **Environment Variables** añadir:
   - `HF_TOKEN` = tu token de HuggingFace (con acceso a `Lacax/deepseek_ocr_lora`)
4. Guardar. RunPod muestra el **Endpoint ID** (formato: `xxxxxxxxxx`).

### 3.3 — Obtener las credenciales para Vercel

Del panel de RunPod, anotar:
- `RUNPOD_API_KEY` → **Settings → API Keys → Create API Key**
- `RUNPOD_ENDPOINT_ID` → visible en el panel del endpoint creado

---

## Fase 4 — Test del endpoint (staging)

Antes de tocar `scan.ts`, verificar que el endpoint responde correctamente con `curl`:

```bash
# Test de cold start y respuesta (sustituir valores)
curl -X POST "https://api.runpod.ai/v2/RUNPOD_ENDPOINT_ID/runsync" \
  -H "Authorization: Bearer RUNPOD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "image": "'$(base64 -w 0 /ruta/a/ticket.jpg)'",
      "mime_type": "image/jpeg"
    }
  }'
```

**Respuesta esperada:**
```json
{
  "id": "...",
  "status": "COMPLETED",
  "output": {
    "comercio": "MERCADONA, S.A.",
    "cif": "A-46103834",
    "fecha": "15/03/2025",
    "total": 24.50,
    "items": [...]
  }
}
```

> `runsync` espera la respuesta de forma síncrona (hasta 90s). Para requests >90s usar `/run` + polling con `/status/{id}`.

---

## Fase 5 — Validación

Antes de actualizar producción, validar con 3 tickets reales del dataset:

| Ticket | Comercio esperado | JSON válido | Total correcto |
|--------|-------------------|-------------|----------------|
| recibo_almeria_079.jpg | MERCADONA, S.A. | — | — |
| recibo_almeria_110.jpg | GRUPO DIA | — | — |
| recibo_almeria_114.jpg | MERCADONA, S.A. | — | — |

Criterio mínimo para pasar a producción:
- 3/3 devuelven JSON válido parseable.
- `total` coincide con el ticket (±0.01 EUR).
- Sin puntuación unicode sin normalizar.

---

## Fase 6 — Actualizar scan.ts para RunPod

### 6.1 — Cambios en `api/scan.ts`

Reemplazar el bloque de llamada a HF (líneas ~54–118) por:

```typescript
const runpodKey        = process.env.RUNPOD_API_KEY
const runpodEndpointId = process.env.RUNPOD_ENDPOINT_ID

if (!runpodKey || !runpodEndpointId) {
  return res.status(500).json({ error: 'RUNPOD_API_KEY o RUNPOD_ENDPOINT_ID no configurados' })
}

let ocrResult: any
try {
  const runpodResponse = await fetch(
    `https://api.runpod.ai/v2/${runpodEndpointId}/runsync`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${runpodKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: {
          image: base64Image,   // base64 puro, sin prefijo data URL
          mime_type: mimeType,
        },
      }),
    }
  )

  if (!runpodResponse.ok) {
    const errText = await runpodResponse.text()
    return res.status(502).json({ error: `Error RunPod: ${errText}` })
  }

  const runpodData = await runpodResponse.json()

  if (runpodData.status === 'FAILED') {
    return res.status(502).json({ error: 'El worker de inferencia falló', detail: runpodData })
  }

  ocrResult = runpodData.output
  if (ocrResult?.error) {
    return res.status(422).json({ error: ocrResult.error, raw: ocrResult.raw })
  }
} catch (err: any) {
  return res.status(502).json({ error: `Fallo al llamar a RunPod: ${err.message}` })
}
```

### 6.2 — Variables de entorno

En `.env.local` (desarrollo):
```
RUNPOD_API_KEY=xxxxxxxxxxxxxxxxxxxx
RUNPOD_ENDPOINT_ID=xxxxxxxxxx
```

Eliminar (ya no se usan):
```
HF_API_TOKEN=
HF_MODEL_ID=
```

En el panel de Vercel → Settings → Environment Variables: aplicar los mismos cambios.

---

## Fase 7 — Post-deploy

1. Ejecutar `vercel dev` y hacer un escaneo real desde la app.
2. Verificar en el panel de RunPod que el worker procesa la petición correctamente.
3. Confirmar que el ticket aparece en Supabase con `verificado = true` tras el flujo completo.
4. Documentar el Endpoint ID y la configuración final en este mismo archivo.

---

## Estimación de coste con $10

| Parámetro | Valor |
|-----------|-------|
| GPU usada | RTX 3090 |
| Precio/seg | ~$0.00023 |
| Tiempo por req (aprox) | 40 seg (cold) / 20 seg (warm) |
| Coste por req | ~$0.005–$0.009 |
| Req con $10 | ~1.100–2.000 peticiones |

Con 30 req/día los $10 cubren **37–66 días**. Para uso continuado el gasto mensual es ~$4–8.

---

## Notas finales

- El modelo base `unsloth/DeepSeek-OCR-2` es público — no necesita token. El `HF_TOKEN` solo se usa en `PeftModel.from_pretrained` para acceder al LoRA privado `Lacax/deepseek_ocr_lora`.
- Si el cold start supera los 90s (timeout de `runsync`), cambiar a `/run` + polling con `/status/{id}` en `scan.ts`.
- Para abaratar el cold start: pre-descargar el modelo base en la imagen Docker (aumenta el tamaño pero elimina la descarga en cada arranque).
