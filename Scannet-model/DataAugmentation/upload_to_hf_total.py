"""
=============================================================================
  SUBIDA DEL DATASET TOTAL A HUGGING FACE (V6)
  --------------------------------------------
  Sube los 3 splits estratificados (train/val/test) + las imágenes referenciadas
  al repo nuevo Lacax/Tickets-total (privado).

  IMPORTANTE — política V6:
    - NO modifica el repo Lacax/Tickets (V5).
    - NO borra contenido del repo destino. Si el repo ya existe, hace merge
      (los archivos con mismo path se sobrescriben, los demás se conservan).
    - Solo se suben las imágenes referenciadas en los JSONL (no las 136 enteras
      si alguna se quedó sin bbox).

  Uso:
    python DataAugmentation/upload_to_hf_total.py --token TU_HF_TOKEN

  Estructura resultante en HF:
    Lacax/Tickets-total/
    ├── dataset_total_train.jsonl
    ├── dataset_total_val.jsonl
    ├── dataset_total_test.jsonl
    ├── original/<recibo_almeria_XXX.jpg>     ← imágenes para entrenar
    └── etiquetadas/<recibo_almeria_XXX.jpg>  ← misma imagen con bbox rojo (verificación)
=============================================================================
"""

import argparse
import json
import tempfile
import shutil
from pathlib import Path

from huggingface_hub import HfApi, login


DEFAULT_JSONL_DIR = Path("DataAugmentation/imagenes")
DEFAULT_IMAGES_DIR = Path(r"F:\datasetTickets\dataset_final\original")
DEFAULT_LABELED_DIR = Path(r"F:\datasetTickets\dataset_final\etiquetadas")
DEFAULT_REPO = "Lacax/Tickets-total"
SPLIT_FILES = ["dataset_total_train.jsonl",
               "dataset_total_val.jsonl",
               "dataset_total_test.jsonl"]


def collect_image_paths(jsonl_dir: Path) -> set[str]:
    images: set[str] = set()
    for name in SPLIT_FILES:
        path = jsonl_dir / name
        if not path.exists():
            raise SystemExit(f"❌ Falta split {path}. Ejecuta primero split_dataset_total.py")
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            images.add(row["image_path"])
    return images


def main():
    ap = argparse.ArgumentParser(description="Sube dataset_total + imágenes a HF (Lacax/Tickets-total)")
    ap.add_argument("--token", "-t", required=True, help="HF token (write)")
    ap.add_argument("--jsonl-dir", type=Path, default=DEFAULT_JSONL_DIR)
    ap.add_argument("--images-dir", type=Path, default=DEFAULT_IMAGES_DIR)
    ap.add_argument("--labeled-dir", type=Path, default=DEFAULT_LABELED_DIR,
                    help="Directorio con las imágenes con bbox dibujado (verificación)")
    ap.add_argument("--repo-id", default=DEFAULT_REPO)
    ap.add_argument("--private", action="store_true", default=True,
                    help="Repo privado (default: True)")
    args = ap.parse_args()

    if not args.images_dir.exists():
        raise SystemExit(f"❌ No existe {args.images_dir}")
    if not args.labeled_dir.exists():
        raise SystemExit(f"❌ No existe {args.labeled_dir}")
    image_names = collect_image_paths(args.jsonl_dir)
    print(f"📊 Splits encontrados: {SPLIT_FILES}")
    print(f"🖼  Imágenes únicas referenciadas: {len(image_names)}\n")

    # Verificar que cada imagen existe en originales y etiquetadas
    missing_orig = [n for n in image_names if not (args.images_dir / n).exists()]
    missing_lab = [n for n in image_names if not (args.labeled_dir / n).exists()]
    if missing_orig:
        print("❌ Originales referenciadas pero ausentes:")
        for m in sorted(missing_orig)[:10]:
            print(f"   - {m}")
        raise SystemExit("Aborto. Revisa images-dir o re-genera splits.")
    if missing_lab:
        print(f"⚠ Faltan {len(missing_lab)} etiquetadas en {args.labeled_dir}:")
        for m in sorted(missing_lab)[:10]:
            print(f"   - {m}")
        raise SystemExit("Aborto. Genera las etiquetadas (build_total_dataset / relabel_total).")

    login(token=args.token)
    api = HfApi()

    print(f"📦 Asegurando repo {args.repo_id} (private={args.private})…")
    api.create_repo(repo_id=args.repo_id, repo_type="dataset",
                    private=args.private, exist_ok=True)
    print("   ✓ ok (no se borra nada del repo)\n")

    # Construir staging temporal con la estructura final
    with tempfile.TemporaryDirectory() as tmp:
        staging = Path(tmp)
        # JSONLs en raíz
        for name in SPLIT_FILES:
            shutil.copy2(args.jsonl_dir / name, staging / name)
        # imágenes bajo original/ y etiquetadas/
        target_imgs = staging / "original"
        target_lab = staging / "etiquetadas"
        target_imgs.mkdir()
        target_lab.mkdir()
        for name in image_names:
            shutil.copy2(args.images_dir / name, target_imgs / name)
            shutil.copy2(args.labeled_dir / name, target_lab / name)

        print(f"🚀 Subiendo {len(image_names)} originales + {len(image_names)} etiquetadas + 3 JSONL → {args.repo_id}\n")
        api.upload_folder(
            repo_id=args.repo_id,
            folder_path=str(staging),
            repo_type="dataset",
            commit_message=f"V6 dataset_total — splits 80/10/10 + originales + etiquetadas ({len(image_names)} imgs)",
        )

    print(f"\n✅ Subido a https://huggingface.co/datasets/{args.repo_id}")
    print("   Estructura:")
    print(f"   {args.repo_id}/")
    for name in SPLIT_FILES:
        print(f"   ├── {name}")
    print(f"   ├── original/     ({len(image_names)} jpg, sin anotar)")
    print(f"   └── etiquetadas/  ({len(image_names)} jpg, con bbox rojo)")


if __name__ == "__main__":
    main()
