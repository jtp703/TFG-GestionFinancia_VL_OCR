# Despliegue local del modelo DeepSeek-OCR-2 (AMD RX 6750 XT)

**Fecha:** 2026-05-14  
**Estado:** Funcional con limitaciones conocidas  
**Rama:** Feature-App-Stack-V6

---

## Contexto y punto de partida

El modelo DeepSeek-OCR-2 fue entrenado con LoRA (r=16, 3 epochs, 133 muestras) en Colab T4 y el adaptador subido a `Lacax/deepseek_original_dataset`. El objetivo era hacer inferencia local usando la GPU del equipo de desarrollo en lugar del pipeline cloud (OCR.space + DeepSeek-chat).

**Hardware del equipo:**
- GPU: AMD Radeon RX 6750 XT — 12 GB VRAM (arquitectura RDNA 2, chip gfx1031)
- RAM: 32 GB
- SO: Windows 11

---

## Por qué esto "no debería funcionar" (y por qué sí funciona)

Antes de empezar, otro modelo consultado estimó la viabilidad en Windows en un **~5%**, con este razonamiento:

1. El chip gfx1031 (RX 6750 XT) no está soportado por el HIP SDK de AMD en Windows
2. ROCm (el equivalente AMD de CUDA) no cubre este chip en Windows
3. DirectML podría funcionar, pero "requeriría parchear el código del modelo op por op — no trivial"
4. La recomendación era usar Linux con ROCm (~65-75%) o directamente cloud (RunPod)

**Ese análisis era correcto en el diagnóstico pero equivocado en la solución.**

El problema real: `modeling_deepseekocr2.py` (el código custom del modelo) tiene llamadas `.cuda()` hardcodeadas en decenas de sitios. En una máquina sin CUDA, lanza `AssertionError` inmediatamente al importar.

La solución no era modificar el código del modelo línea por línea — era **interceptar Python a nivel de runtime** antes de que ese código se cargue.

---

## Solución: torch-directml + monkey-patching

### Entorno

```bash
conda create -n deepseek-infer python=3.11 -y
conda activate deepseek-infer

# PyTorch CPU build (base requerida por torch-directml)
pip install torch==2.3.1 --index-url https://download.pytorch.org/whl/cpu

# Backend DirectML de Microsoft (accede a la GPU AMD vía DirectX 12)
pip install torch-directml

# Stack de inferencia — transformers 4.56.2 es OBLIGATORIO
# >4.56.2 rompe la clase DeepseekV2MoE
pip install transformers==4.56.2 peft accelerate pillow huggingface_hub einops addict easydict fastapi uvicorn python-multipart
```

Modelos descargados en `F:\Model_Local_inference\models\` (disco secundario — C: sin espacio):
- `deepseek_ocr2_base` ← `unsloth/DeepSeek-OCR-2`
- `deepseek_ocr2_lora` ← `Lacax/deepseek_original_dataset`

### El monkey-patch (por qué funciona)

Estas tres líneas van **antes de cualquier import de transformers o del modelo**:

```python
import torch

# Evita AssertionError al importar: modeling_deepseekocr2.py llama
# torch.cuda.is_bf16_supported() en el scope del módulo (línea 33)
if not torch.cuda.is_available():
    torch.cuda.is_bf16_supported = lambda *args, **kwargs: False

# Redirige TODAS las llamadas .cuda() al dispositivo DirectML
# El modelo sigue llamando .cuda() sin saber que no hay CUDA
torch.Tensor.cuda   = lambda self, *a, **kw: self.to(DEVICE)
torch.nn.Module.cuda = lambda self, *a, **kw: self.to(DEVICE)
```

Cuando el modelo llama internamente `tensor.cuda()`, Python ejecuta nuestra lambda, que mueve el tensor a `privateuseone:0` (la RX 6750 XT vía DirectX 12). El modelo no sabe que no hay CUDA.

### Captura de salida: eval_mode=True

El método `model.infer()` tiene dos modos:
- **`eval_mode=False`** (defecto): usa `NoEOSTextStreamer` que imprime tokens a stdout conforme se generan. Al capturar stdout con `redirect_stdout`, la salida llegaba truncada porque el streamer flushea en trozos y el último fragmento se perdía.
- **`eval_mode=True`**: genera completo y devuelve el string directamente. Sin streaming, sin truncación.

El servidor usa `eval_mode=True`.

### Extracción de JSON robusta

La salida del modelo tiene prefijos como `"directly resize\n"` antes del JSON. Se usa conteo de llaves en lugar de regex greedy (`\{.*\}` con DOTALL sobrepassaba el JSON si había `}` en texto posterior):

```python
start = raw.find('{')
depth = 0
for i, c in enumerate(raw[start:], start):
    if c == '{': depth += 1
    elif c == '}':
        depth -= 1
        if depth == 0:
            candidate = raw[start:i+1]
            break
data = json.loads(candidate)
```

---

## Arquitectura del despliegue local

```
Vite (puerto 5173)
    └── proxy /api/* → localhost:3000
            └── local-dev-server.cjs (Node, puerto 3000)
                    ├── POST /api/scan      → llama a localhost:8000/infer
                    ├── GET  /api/tickets   → Supabase
                    └── POST /api/categorize → DeepSeek API

uvicorn server.py (Python, puerto 8000)
    └── POST /infer → modelo DeepSeek-OCR-2 + LoRA en DirectML
```

### Arranque (cada sesión de desarrollo)

```bash
# Terminal 1 — modelo
conda activate deepseek-infer
cd TFG/model_vs_model
uvicorn server:app --host 0.0.0.0 --port 8000

# Terminal 2 — servidor Node
cd TFG/Scannet
node local-dev-server.cjs

# Terminal 3 — frontend
cd TFG/Scannet
npm run dev
```

---

## Lo que funciona bien

| Componente | Estado |
|---|---|
| Carga del modelo en DirectML (RX 6750 XT) | ✅ Funciona |
| Inferencia GPU vía DirectX 12 | ✅ Funciona |
| Extracción de estructura JSON (comercio, cif, fecha, total, items) | ✅ Funciona |
| Servidor FastAPI `/infer` y `/health` | ✅ Funciona |
| Integración con Scannet vía `local-dev-server.cjs` | ✅ Funciona |
| Categorización con DeepSeek API usando comercio + productos | ✅ Funciona |
| Preview de imagen en pantalla de verificación | ✅ Funciona |

---

## Lo que no funciona perfectamente

### 1. LoRA parcialmente aplicado (el más importante)

El LoRA fue entrenado apuntando a las capas de los expertos MoE:
```
target_parameters=['mlp.experts.gate_up_proj', 'mlp.experts.down_proj']
```

Al cargar con PEFT estándar, los nombres de capa no coinciden con los del modelo base descargado:
```
RuntimeWarning: target_parameters were set but no parameter was matched.
```

**Consecuencia:** los pesos del entrenamiento **no se aplican a los expertos MoE** — el componente más numeroso del modelo. El modelo corre esencialmente como el base `unsloth/DeepSeek-OCR-2` con el LoRA aplicado solo a capas menores (atención/proyección). Por eso la extracción es funcional (capacidad del base) pero comete errores en nombres españoles y fechas (lo que debería haber mejorado el fine-tuning).

**Causa raíz:** mismatch entre cómo Unsloth nombra internamente las capas al entrenar y cómo el modelo las expone al cargarse con `trust_remote_code`.

**Posible fix:** fusionar el LoRA con el modelo base en Colab antes de descargarlo (`model.merge_and_unload()`), guardando el modelo ya fusionado. Eso eliminaría la dependencia de PEFT para la carga.

### 2. Preprocesado de imagen en CPU

```
UserWarning: 'aten::_upsample_bicubic2d_aa.out' is not currently supported 
on the DML backend and will fall back to run on the CPU.
```

El redimensionado bicúbico de imagen no está implementado en DirectML y cae a CPU. Es una operación menor (~1% del tiempo total), sin impacto práctico, pero existe.

### 3. Autocast en CPU-mode

```
UserWarning: User provided device_type of 'cuda', but CUDA is not available. Disabling
```

El `torch.autocast("cuda")` en `model.infer()` detecta que no hay CUDA y desactiva el autocast (corre sin mixed precision automática). El modelo sigue en float16 porque se cargó con `torch_dtype=torch.float16`, por lo que el impacto es mínimo.

### 4. Extracción de fechas con errores

El modelo base frecuentemente extrae fechas incorrectas (por ejemplo un ticket de mayo aparece como marzo). Esto es un problema de calidad del modelo base, agravado porque el LoRA de corrección no se aplica completamente (ver punto 1).

**Mitigación actual:** el usuario puede corregir la fecha manualmente en la pantalla de verificación antes de guardar.

---

## Archivos relevantes

| Archivo | Descripción |
|---|---|
| `model_vs_model/server.py` | Servidor FastAPI — carga modelo, expone `/infer` y `/health` |
| `model_vs_model/infer_local_dml.py` | Script standalone para pruebas desde CLI |
| `model_vs_model/infer_local_dml.ipynb` | Notebook para evaluación interactiva |
| `model_vs_model/download_models.py` | Descarga base + LoRA a F:\Model_Local_inference\models\ |
| `Scannet/local-dev-server.cjs` | Servidor Node que reemplaza vercel dev en local |
| `Scannet/api/scan.ts` | Vercel Function — detecta LOCAL_MODEL_URL y redirige al servidor Python |
| `Scannet/.env.local` | `LOCAL_MODEL_URL=http://localhost:8000` activa el modelo local |

---

## Variables de entorno relevantes

```env
# Activa el modelo local (en lugar de OCR.space + DeepSeek-chat)
LOCAL_MODEL_URL=http://localhost:8000

# Rutas de modelos (hardcodeadas en server.py)
BASE_MODEL   = F:\Model_Local_inference\models\deepseek_ocr2_base
LORA_ADAPTER = F:\Model_Local_inference\models\deepseek_ocr2_lora
```

Para volver al pipeline cloud (producción), basta con eliminar `LOCAL_MODEL_URL` del `.env.local`.
