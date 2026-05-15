"""
Servidor local de inferencia — DeepSeek-OCR-2 con AMD RX 6750 XT (DirectML)

Expone POST /infer para que Scannet (vercel dev) lo consuma en lugar de OCR.space + DeepSeek.
El modelo se carga una sola vez al arrancar y se reutiliza entre peticiones.

Uso:
  conda activate deepseek-infer
  cd model_vs_model
  uvicorn server:app --host 0.0.0.0 --port 8000
"""

import os
import re
import json
import base64
import tempfile
import torch
from contextlib import asynccontextmanager

# ── Patches necesarios antes de importar transformers ────────────────────────
if not torch.cuda.is_available():
    torch.cuda.is_bf16_supported = lambda *args, **kwargs: False

try:
    import torch_directml
    DEVICE = torch_directml.device()
    print(f"[INFO] DirectML activo: {DEVICE}  (RX 6750 XT)")
except ImportError:
    DEVICE = torch.device("cpu")
    torch.set_num_threads(os.cpu_count())
    print(f"[WARN] DirectML no disponible. Fallback a CPU ({os.cpu_count()} threads).")

torch.Tensor.cuda = lambda self, *a, **kw: self.to(DEVICE)
torch.nn.Module.cuda = lambda self, *a, **kw: self.to(DEVICE)

from transformers import AutoTokenizer, AutoModel
from peft import PeftModel
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

BASE_MODEL   = r"F:\Model_Local_inference\models\deepseek_ocr2_base"
LORA_ADAPTER = r"F:\Model_Local_inference\models\deepseek_ocr2_lora"

PROMPT = """<image>

Extract the following information from the receipt and return it STRICTLY as a valid JSON object matching this structure:

{

  "comercio": "string",

  "cif": "string",

  "fecha": "string (YYYY-MM-DD)",

  "total": "number",

  "items": [{"cantidad": "number", "descripcion": "string", "precio": "number"}]

}

NO other text. ONLY valid JSON.

"""

# ── Estado global del modelo ─────────────────────────────────────────────────
_model = None
_tokenizer = None


def load_model():
    global _model, _tokenizer
    print("[INFO] Cargando modelo base...")
    _model = AutoModel.from_pretrained(BASE_MODEL, trust_remote_code=True, torch_dtype=torch.float16)
    print("[INFO] Aplicando adaptador LoRA...")
    _model = PeftModel.from_pretrained(_model, LORA_ADAPTER)
    _model = _model.to(DEVICE)
    _model.eval()
    _tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL, trust_remote_code=True)
    print("[INFO] Modelo listo.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_model()
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


class InferRequest(BaseModel):
    image: str        # base64 sin prefijo data:...
    mimeType: str = "image/jpeg"


def _normalize_items(items: list) -> list:
    """Normaliza nombres de campo inconsistentes que el modelo a veces genera."""
    normalized = []
    for item in items:
        normalized.append({
            "descripcion": item.get("descripcion") or item.get("descr") or item.get("descrip") or "",
            "cantidad":    float(item.get("cantidad", 1)),
            "precio":      float(item.get("precio", 0)),
        })
    return normalized


def _run_inference(image_path: str) -> dict | None:
    tmp_out = os.path.join(os.path.dirname(__file__), "_infer_tmp")
    raw = _model.infer(
        _tokenizer,
        prompt=PROMPT,
        image_file=image_path,
        output_path=tmp_out,
        base_size=768,
        image_size=768,
        crop_mode=False,
        save_results=False,
        test_compress=False,
        eval_mode=True,
    )
    print(f"[DEBUG] Raw completo: {repr(raw)}")

    if not raw:
        return None

    # Extrae el primer objeto JSON completo contando llaves
    start = raw.find('{')
    if start == -1:
        print("[WARN] No se encontró '{' en la salida del modelo")
        return None

    depth = 0
    end = -1
    for i, c in enumerate(raw[start:], start):
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                end = i
                break

    if end == -1:
        print("[WARN] JSON incompleto (llaves no cerradas)")
        return {"raw": raw}

    candidate = raw[start:end + 1]
    try:
        data = json.loads(candidate)
        data["items"] = _normalize_items(data.get("items") or [])
        return data
    except json.JSONDecodeError as e:
        print(f"[ERROR] json.loads falló: {e}\nCandidato: {repr(candidate)}")
        return {"raw": raw}


@app.get("/health")
def health():
    return {"status": "ok", "device": str(DEVICE)}


@app.post("/infer")
async def infer(req: InferRequest):
    if _model is None:
        raise HTTPException(status_code=503, detail="Modelo no cargado")

    # Decodificar base64 → archivo temporal
    try:
        img_bytes = base64.b64decode(req.image)
    except Exception:
        raise HTTPException(status_code=400, detail="Imagen base64 inválida")

    suffix = ".jpg" if "jpeg" in req.mimeType else ".png"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(img_bytes)
        tmp_path = tmp.name

    try:
        result = _run_inference(tmp_path)
    finally:
        os.unlink(tmp_path)

    if result is None:
        raise HTTPException(status_code=422, detail="El modelo no generó respuesta")

    return result
