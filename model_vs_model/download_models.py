"""
Descarga el modelo base y el adaptador LoRA desde HuggingFace al directorio local.

Uso:
  conda activate deepseek-infer
  python download_models.py

Requiere token HF con acceso a Lacax/deepseek_original_dataset (repo privado).
"""

import os
from huggingface_hub import snapshot_download, login

MODELS_DIR   = r"F:\Model_Local_inference\models"
BASE_REPO    = "unsloth/DeepSeek-OCR-2"
LORA_REPO    = "Lacax/deepseek_original_dataset"
BASE_LOCAL   = os.path.join(MODELS_DIR, "deepseek_ocr2_base")
LORA_LOCAL   = os.path.join(MODELS_DIR, "deepseek_ocr2_lora")

if __name__ == "__main__":
    login()  # abre prompt para el token HF

    os.makedirs(MODELS_DIR, exist_ok=True)

    if os.path.isdir(BASE_LOCAL) and os.listdir(BASE_LOCAL):
        print(f"[SKIP] Modelo base ya existe en {BASE_LOCAL}")
    else:
        print(f"[INFO] Descargando modelo base: {BASE_REPO} ...")
        snapshot_download(BASE_REPO, local_dir=BASE_LOCAL)
        print(f"[OK]   Guardado en {BASE_LOCAL}")

    if os.path.isdir(LORA_LOCAL) and os.listdir(LORA_LOCAL):
        print(f"[SKIP] Adaptador LoRA ya existe en {LORA_LOCAL}")
    else:
        print(f"[INFO] Descargando adaptador LoRA: {LORA_REPO} ...")
        snapshot_download(LORA_REPO, local_dir=LORA_LOCAL)
        print(f"[OK]   Guardado en {LORA_LOCAL}")

    print("\n[LISTO] Modelos disponibles. Ya puedes ejecutar infer_local_dml.py")
