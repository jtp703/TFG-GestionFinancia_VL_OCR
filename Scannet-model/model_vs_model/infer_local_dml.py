"""
Inferencia local de DeepSeek-OCR-2 con AMD RX 6750 XT via torch-directml.

Entorno requerido: conda activate deepseek-infer
  - torch 2.4.x (CPU build)
  - torch-directml 0.2.5
  - transformers==4.56.2
  - peft

Uso:
  python infer_local_dml.py <ruta_imagen>
  python infer_local_dml.py  (usa imagen de ejemplo en Deepseek OCR/imagenes/)
"""

import os
import sys
import json
import re
import io
import contextlib
import torch

# El código custom del modelo llama torch.cuda.is_bf16_supported() al importarse,
# lo que explota en builds sin CUDA. Lo parcheamos antes de cargar transformers.
if not torch.cuda.is_available():
    torch.cuda.is_bf16_supported = lambda *args, **kwargs: False

# --- Selección de dispositivo ---
try:
    import torch_directml
    DEVICE = torch_directml.device()
    print(f"[INFO] Usando DirectML: {DEVICE}  (RX 6750 XT)")
except ImportError:
    DEVICE = torch.device("cpu")
    torch.set_num_threads(os.cpu_count())
    print(f"[WARN] torch-directml no disponible. Fallback a CPU ({os.cpu_count()} threads).")

# El método model.infer() tiene .cuda() hardcodeado en 8 sitios.
# Redirigimos todos esos calls a nuestro device.
torch.Tensor.cuda = lambda self, *a, **kw: self.to(DEVICE)
torch.nn.Module.cuda = lambda self, *a, **kw: self.to(DEVICE)

from transformers import AutoTokenizer, AutoModel
from peft import PeftModel

BASE_MODEL   = r"F:\Model_Local_inference\models\deepseek_ocr2_base"
LORA_ADAPTER = r"F:\Model_Local_inference\models\deepseek_ocr2_lora"

# Prompt exacto del notebook de entrenamiento: <image> al inicio, en inglés
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


def load_model():
    print("[INFO] Cargando modelo base...")
    model = AutoModel.from_pretrained(
        BASE_MODEL,
        trust_remote_code=True,
        torch_dtype=torch.float16,
    )
    print("[INFO] Aplicando adaptador LoRA...")
    model = PeftModel.from_pretrained(model, LORA_ADAPTER)
    model = model.to(DEVICE)
    model.eval()

    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL, trust_remote_code=True)
    print("[INFO] Modelo listo.")
    return model, tokenizer


def run_inference(model, tokenizer, image_path: str) -> dict:
    print(f"[INFO] Procesando: {image_path}")
    tmp_out = os.path.join(os.path.dirname(__file__), "_infer_tmp")
    # model.infer() imprime el resultado via streamer a stdout — hay que capturarlo
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        model.infer(
            tokenizer,
            prompt=PROMPT,
            image_file=image_path,
            output_path=tmp_out,
            base_size=768,
            image_size=768,
            crop_mode=False,
            save_results=False,
            test_compress=False,
        )
    raw = buf.getvalue()
    print(f"[DEBUG] Raw output: {repr(raw)}")
    if not raw:
        return None
    match = re.search(r'\{.*\}', raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            print("[WARN] JSON malformado, devolviendo texto crudo")
            return {"raw": raw}
    return {"raw": raw}


if __name__ == "__main__":
    if not os.path.isdir(BASE_MODEL):
        print("[ERROR] Modelo base no encontrado en:", BASE_MODEL)
        print("        Ejecuta primero: python download_models.py")
        sys.exit(1)

    image_path = sys.argv[1] if len(sys.argv) > 1 else None
    if image_path is None:
        # Buscar primera imagen disponible en el directorio de test
        test_dirs = [
            os.path.join(os.path.dirname(__file__), "..", "Deepseek OCR", "imagenes"),
            os.path.join(os.path.dirname(__file__), "..", "DataAugmentation", "imagenes"),
        ]
        for d in test_dirs:
            d = os.path.normpath(d)
            if os.path.isdir(d):
                for f in os.listdir(d):
                    if f.lower().endswith((".jpg", ".jpeg", ".png")):
                        image_path = os.path.join(d, f)
                        break
            if image_path:
                break

    if not image_path:
        print("[ERROR] No se encontró imagen de test. Pasa la ruta como argumento.")
        sys.exit(1)

    model, tokenizer = load_model()
    output = run_inference(model, tokenizer, image_path)
    print("\n--- Resultado ---")
    print(json.dumps(output, ensure_ascii=False, indent=2))
