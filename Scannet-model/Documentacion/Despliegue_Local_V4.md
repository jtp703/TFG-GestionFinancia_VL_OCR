# Despliegue Local — Notebook V4 (Deepseek_OCR_Runpod_Fix_V4)

Documento de referencia para reproducir el entrenamiento e inferencia del notebook V4
en una máquina local. Cubre hardware mínimo/recomendado, dependencias exactas, gotchas
conocidos y pasos ordenados.

---

## 1. Requisitos de hardware

### GPU

| Escenario | VRAM mínima | Notas |
|-----------|-------------|-------|
| Solo inferencia (cargar modelo + lora) | **~14 GB** | Con bf16 y sin gradient checkpointing |
| Entrenamiento (batch=1, grad_accum=8) | **~20 GB** | Con bf16 + unsloth gradient checkpointing |
| Entrenamiento recomendado | **≥ 24 GB** | Igual a RTX 4090 usado en RunPod. Sin OOM confirmado |

> **Nota importante:** El notebook fue ejecutado y verificado en una **NVIDIA RTX 4090 (24 GB VRAM)**.
> Con tarjetas de 16 GB (p.ej. RTX 3080/4080) el entrenamiento puede dar OOM.
> En ese caso reducir `per_device_train_batch_size` o activar `load_in_4bit=True` en la celda C.

### CUDA

| Componente | Versión usada en RunPod | Mínimo soportado |
|-----------|-------------------------|------------------|
| CUDA Toolkit | 12.8 | 12.1 |
| Driver NVIDIA | compatible con CUDA 12.x | ≥ 525.x |
| Triton | 3.6.0 | — |

### CPU / RAM / Disco

- RAM sistema: **≥ 32 GB** recomendado (el modelo base pesa ~7 GB en RAM durante la carga)
- Disco: **≥ 40 GB libres**
  - Modelo base descargado: ~14 GB (`unsloth/DeepSeek-OCR-2`)
  - Dataset `Lacax/Tickets`: ~2–3 GB
  - Checkpoints durante entrenamiento: ~3 GB por época (save_total_limit=3 → hasta 9 GB)

---

## 2. Entorno de software

### Python y PyTorch

```
Python  : 3.10 (recomendado; probado en 3.10 en RunPod)
PyTorch : 2.10.0+cu128  (RunPod) — cualquier 2.2.x+ con CUDA 12.x vale
```

Instalar PyTorch con CUDA antes que cualquier otra cosa:

```bash
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
```

> No usar `pip install torch` sin el index-url correcto: instalaría la versión CPU.

### Dependencias del notebook (celda B, en orden)

```bash
# 1. unsloth + unsloth_zoo (forzar sin deps para evitar conflictos de torch)
pip install --upgrade --force-reinstall --no-cache-dir --no-deps unsloth unsloth_zoo

# 2. transformers 4.56.2 — VERSIÓN FIJA OBLIGATORIA
#    - Versiones >= 5.x eliminan DeepseekV2MoE en modeling_deepseek_v2 → crash
#    - Versiones >= 4.51.3 requeridas por unsloth y trl
pip install transformers==4.56.2

# 3. Resto del stack
pip install datasets huggingface_hub peft accelerate
pip install pillow torchvision
pip install addict matplotlib
```

### Versiones exactas verificadas (RunPod V4)

| Paquete | Versión |
|---------|---------|
| torch | 2.10.0+cu128 |
| transformers | **4.56.2** (crítico) |
| unsloth | 2026.4.4 |
| peft | última compatible |
| datasets | última compatible |
| pillow | última compatible |

---

## 3. Variables de entorno y tokens

El notebook usa un HF_TOKEN hardcodeado en celda C y E. **En local usar variable de entorno:**

```bash
export HF_TOKEN="hf_xxxxxxxxxxxxxxxxxxxx"
```

O crear un `.env` y cargarlo antes de lanzar Jupyter.

**Repos que requieren el token:**
- `Lacax/Tickets` (dataset privado) — celda E
- `Lacax/deepseek_ocr_lora` (subida del adaptador) — celda J

**Repos públicos (no requieren token):**
- `unsloth/DeepSeek-OCR-2` (modelo base) — celda C

---

## 4. Estructura de archivos necesaria

```
directorio_trabajo/
├── deepseek_ocr2/              ← descargado automáticamente en celda C
│   ├── config.json
│   ├── modeling_deepseekocr2.py
│   └── ...
├── mi_dataset/                 ← descargado automáticamente en celda E
│   ├── dataset_espanol_ampliado.jsonl
│   └── imagenes/*.jpg
├── outputs/                    ← creado por el Trainer (checkpoints)
└── deepseek_ocr_lora/          ← creado en celda J al guardar el adaptador
```

Todo se descarga automáticamente. No hay que crear nada a mano.

---

## 5. Pasos de ejecución (orden de celdas)

| Celda | Nombre | Acción | Tiempo aprox. |
|-------|--------|--------|---------------|
| A | Verificar GPU | Comprueba CUDA y VRAM disponible | < 5 s |
| B | Instalar dependencias | pip installs | 2–5 min |
| — | **Reiniciar kernel** | **OBLIGATORIO después de celda B** | manual |
| C | Cargar modelo base + LoRA | Descarga `unsloth/DeepSeek-OCR-2` (~14 GB) + aplica LoRA | 5–15 min |
| D | Verificar cobertura LoRA | Debe mostrar **24 capas** — si < 20, problema con unsloth | < 5 s |
| E | Cargar dataset | Descarga `Lacax/Tickets`, convierte y hace split 90/10 | 2–5 min |
| F | Validar rutas imagen | Aborta si falta alguna imagen | < 10 s |
| G | DataCollator | Solo define la clase, no ejecuta nada | < 1 s |
| H | Configurar Trainer | Instancia Trainer con TrainingArguments | < 5 s |
| I | Lanzar entrenamiento | **3 épocas, 613 muestras** | ~77 min en RTX 4090 |
| J | Guardar y subir modelo | Guarda localmente + push a HuggingFace | 5–10 min |
| K | Test de inferencia | Requiere una imagen de ticket | < 2 min |
| L | Tests de comportamiento | Valida JSON, campos, unicidad | < 1 s |

> **El reinicio de kernel entre celda B y C es obligatorio.** Sin él, unsloth no aplica sus parches
> de compilación y el entrenamiento puede fallar silenciosamente.

---

## 6. Configuración de Jupyter

Lanzar Jupyter Lab o Notebook desde el directorio donde se va a trabajar:

```bash
cd /ruta/donde/quieres/los/archivos
jupyter lab
```

O usar VS Code con la extensión Jupyter (detecta el kernel automáticamente).

### Kernel recomendado

Crear un entorno conda o venv limpio para evitar conflictos:

```bash
conda create -n deepseek_ocr python=3.10
conda activate deepseek_ocr
# luego instalar torch y dependencias de celda B
```

---

## 7. Consideraciones por GPU

### RTX 4090 / A100 (24+ GB) — sin cambios
El notebook funciona tal cual.

### RTX 4080 / 3090 (16 GB)
Ajustes necesarios en **celda H** (`TrainingArguments`):

```python
per_device_train_batch_size = 1      # mantener
gradient_accumulation_steps = 16     # subir a 16 para compensar
per_device_eval_batch_size  = 1      # mantener
```

Y en **celda C**, activar cuantización para reducir VRAM del modelo base:

```python
model, tokenizer = FastVisionModel.from_pretrained(
    "./deepseek_ocr2",
    load_in_4bit = True,   # <-- cambiar a True
    ...
)
```

> Con `load_in_4bit=True` el modelo ocupa ~7 GB en lugar de ~14 GB, pero la calidad de
> entrenamiento puede reducirse ligeramente.

### RTX 3080 / tarjetas < 16 GB
**No recomendado** para entrenamiento completo. Solo inferencia con `load_in_4bit=True`.
Para entrenamiento considerar RunPod (ver `Documentacion/Decision_Despliegue_Modelo.md`).

### CPU (sin GPU)
**Solo inferencia**, extremadamente lento (horas por imagen). No útil en la práctica.

---

## 8. Bugs conocidos y sus fixes (V4 los resuelve todos)

| Bug | Causa | Fix en V4 |
|-----|-------|-----------|
| Muestras descartadas silenciosamente | Rutas de imagen relativas → `os.path.exists()` = False | Celda E: `os.path.abspath()` en `format_spanish_ticket()` |
| LoRA solo en 12/30 capas | `FastVisionModel.get_peft_model` limita MoE | Celda C: PEFT directamente con `get_peft_model()` |
| Sin detección de sobreajuste | No había split de validación | Celda E: `train_test_split(test_size=0.1)` |
| Alucinaciones en JSON | `lora_alpha == r` (debería ser 2×r) | Celda C: `lora_alpha=64` con `r=32` |
| Adaptador no cargable en otra máquina | `base_model_name_or_path` apuntaba a ruta local | Celda J: se sobreescribe a `unsloth/DeepSeek-OCR-2` |

---

## 9. Señales de alerta durante la ejecución

| Señal | Significado | Acción |
|-------|-------------|--------|
| `Capas con LoRA activo: < 20` (celda D) | unsloth limitó la cobertura | Verificar versión de unsloth; reinstalar con `--no-deps` |
| `Lote: X/Y muestras validas (Z descartadas)` | Imágenes no encontradas en disco | Verificar que celda E usó `os.path.abspath()` |
| `CUDA out of memory` | VRAM insuficiente | Ver sección 7; reducir batch o activar 4bit |
| `train_loss < 0.05` tras pocas épocas | Posible memorización | Normal con dataset pequeño (~613 muestras); evaluar con val_loss |
| `RuntimeError: Unsloth: No config file found` | Versión unsloth incompatible con DeepseekOCR2 | En inferencia: usar `AutoModel + PeftModel` sin unsloth (ver `Documentacion/Sin_Unsloth.md`) |
| `JSON invalido` en celda K/L | Output del modelo con alucinaciones | Normal en imágenes fuera de dominio (tickets no españoles) |

---

## 10. Inferencia en local (sin reentrenar)

Si solo se quiere cargar el adaptador ya entrenado (`Lacax/deepseek_ocr_lora`) y hacer inferencia
sin unsloth, ver `Documentacion/Sin_Unsloth.md` e `Documentacion/Inferencia_V4.md`.

Resumen del stack de inferencia:

```python
from transformers import AutoModel, AutoTokenizer
from peft import PeftModel
import torch

# Base model (público)
model = AutoModel.from_pretrained(
    "unsloth/DeepSeek-OCR-2",
    trust_remote_code=True,
    torch_dtype=torch.bfloat16,
).cuda()

# LoRA adapter (privado)
model = PeftModel.from_pretrained(model, "Lacax/deepseek_ocr_lora", token=HF_TOKEN)
model = model.merge_and_unload()

tokenizer = AutoTokenizer.from_pretrained("Lacax/deepseek_ocr_lora", token=HF_TOKEN)
```

> `transformers==4.56.2` también es obligatorio aquí. No usar unsloth en inferencia.

---

## 11. Checklist rápido antes de lanzar

- [ ] GPU disponible con ≥ 14 GB VRAM (≥ 24 GB para entrenamiento sin ajustes)
- [ ] CUDA 12.x instalado (`nvcc --version`)
- [ ] Python 3.10 en entorno limpio
- [ ] PyTorch instalado con CUDA (`python -c "import torch; print(torch.cuda.is_available())"`)
- [ ] `HF_TOKEN` exportado en el entorno
- [ ] `transformers==4.56.2` instalado (verificar con `pip show transformers`)
- [ ] Kernel reiniciado tras celda B
- [ ] Celda D muestra ≥ 20 capas LoRA antes de entrenar
- [ ] Imagen de prueba disponible en disco para celda K

---

*Última actualización: 2026-04-16*
*Basado en ejecución real de V4 en RTX 4090 (RunPod), 77 min, loss final train 0.0399*
