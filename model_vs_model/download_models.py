"""
Descarga el modelo base y los adaptadores LoRA desde HuggingFace al directorio local.

Cada versión se guarda en su propio subdirectorio para poder compararlas sin riesgo
de sobreescribir ninguna. El flag --force solo afecta a las versiones seleccionadas.

Uso:
  conda activate deepseek-infer

  python download_models.py               # descarga lo que falte (salta dirs existentes)
  python download_models.py --force       # re-descarga todas las versiones
  python download_models.py --only v5     # descarga solo V5 (opciones: orig, v4, v5)
  python download_models.py --only v5 --force  # re-descarga solo V5

Directorios resultantes en F:\\Model_Local_inference\\models\\:
  deepseek_ocr2_base   ← unsloth/DeepSeek-OCR-2           (base, compartido)
  deepseek_ocr2_orig   ← Lacax/deepseek_original_dataset  (primer modelo entrenado)
  deepseek_ocr2_v4     ← Lacax/deepseek_ocr_lora          (V4: r=32, 3 épocas)
  deepseek_ocr2_v5     ← Lacax/deepseek_ocr_lora_v5       (V5: r=16, 6 épocas, golden dataset)
"""

import os
import sys
import shutil
from huggingface_hub import snapshot_download, login

MODELS_DIR = r"F:\Model_Local_inference\models"

BASE_REPO  = "unsloth/DeepSeek-OCR-2"
BASE_LOCAL = os.path.join(MODELS_DIR, "deepseek_ocr2_base")

ADAPTERS = {
    "orig": {
        "repo":  "Lacax/deepseek_original_dataset",
        "local": os.path.join(MODELS_DIR, "deepseek_ocr2_orig"),
        "desc":  "Primer fine-tuning (dataset original, sin golden)",
    },
    "v4": {
        "repo":  "Lacax/deepseek_ocr_lora",
        "local": os.path.join(MODELS_DIR, "deepseek_ocr2_v4"),
        "desc":  "V4 — r=32, alpha=64, 3 épocas, dataset_espanol_ampliado.jsonl",
    },
    "v5": {
        "repo":  "Lacax/deepseek_ocr_lora_v5",
        "local": os.path.join(MODELS_DIR, "deepseek_ocr2_v5"),
        "desc":  "V5 — r=16, alpha=32, 6 épocas, dataset_golden.jsonl (Gemini-anotado)",
    },
}


def download_one(repo: str, local: str, label: str, force: bool):
    if os.path.isdir(local) and os.listdir(local) and not force:
        print(f"[SKIP] {label} ya existe en {local}  (--force para re-descargar)")
        return
    if force and os.path.isdir(local):
        print(f"[FORCE] Eliminando {local} ...")
        shutil.rmtree(local)
    print(f"[INFO] Descargando {label}: {repo} ...")
    snapshot_download(repo, local_dir=local)
    print(f"[OK]   Guardado en {local}")


if __name__ == "__main__":
    force = "--force" in sys.argv
    only  = None
    if "--only" in sys.argv:
        idx = sys.argv.index("--only")
        if idx + 1 < len(sys.argv):
            only = sys.argv[idx + 1]
            if only not in ADAPTERS:
                print(f"[ERROR] Versión desconocida '{only}'. Opciones: {list(ADAPTERS)}")
                sys.exit(1)

    login()
    os.makedirs(MODELS_DIR, exist_ok=True)

    # Modelo base (siempre necesario, compartido por todos)
    download_one(BASE_REPO, BASE_LOCAL, "modelo base", force)

    # Adaptadores LoRA
    targets = {only: ADAPTERS[only]} if only else ADAPTERS
    for key, cfg in targets.items():
        download_one(cfg["repo"], cfg["local"], f"LoRA {key.upper()} ({cfg['desc']})", force)

    print("\n[LISTO] Para arrancar el servidor con una versión concreta (PowerShell):")
    print('  $env:LORA_VERSION="v4";   uvicorn server:app --host 0.0.0.0 --port 8000')
    print('  $env:LORA_VERSION="v5";   uvicorn server:app --host 0.0.0.0 --port 8000')
    print('  $env:LORA_VERSION="orig"; uvicorn server:app --host 0.0.0.0 --port 8000')
