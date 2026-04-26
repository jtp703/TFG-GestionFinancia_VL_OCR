"""
=============================================================================
  SUBIDA DE DATASET A HUGGING FACE (V5)
  --------------------------------------
  Sube las imágenes y el JSONL a Lacax/Tickets en HuggingFace.
  Por defecto LIMPIA el repo antes de subir para evitar mezcla con datos V4.

  Uso:
    python upload_to_hf.py --token TU_HF_TOKEN
    python upload_to_hf.py --token TU_HF_TOKEN --no-clean   # merge en vez de reemplazar

  ANTES de ejecutar:
    pip install huggingface_hub
=============================================================================
"""

import argparse
import shutil
from pathlib import Path
from huggingface_hub import HfApi, login


def clean_repo(api: HfApi, repo_id: str, private: bool):
    """Borra y recrea el repo para garantizar que no queda ningún archivo anterior."""
    try:
        api.delete_repo(repo_id=repo_id, repo_type="dataset")
        print("   Repo anterior eliminado.")
    except Exception as e:
        print(f"   WARN al borrar ({e}) — puede que no existiera todavía.")
    api.create_repo(repo_id=repo_id, repo_type="dataset", private=private, exist_ok=True)
    print("   Repo recreado limpio.")


def main():
    parser = argparse.ArgumentParser(description='Sube dataset V5 a HuggingFace')
    parser.add_argument('--token', '-t', required=True, help='Tu HuggingFace token (write)')
    parser.add_argument(
        '--dataset-dir',
        default=r'F:\datasetTickets\dataset_final',
        help='Directorio del dataset final (default: F:\\datasetTickets\\dataset_final)'
    )
    parser.add_argument(
        '--repo-id',
        default='Lacax/Tickets',
        help='ID del repo en HuggingFace (default: Lacax/Tickets)'
    )
    parser.add_argument(
        '--no-clean',
        action='store_true',
        default=False,
        help='No limpiar el repo antes de subir (merge en vez de reemplazar)'
    )
    parser.add_argument(
        '--private',
        action='store_true',
        default=True,
        help='Repo privado (default: True)'
    )

    args = parser.parse_args()
    dataset_dir = Path(args.dataset_dir)

    if not dataset_dir.exists():
        print(f"❌ No existe el directorio: {dataset_dir}")
        print("   Ejecuta primero: python DataAugmentation/build_dataset.py --copy-images")
        return

    login(token=args.token)
    api = HfApi()

    # Crear repo si no existe
    print(f"\n📦 Creando/verificando repo: {args.repo_id}")
    api.create_repo(
        repo_id=args.repo_id,
        repo_type="dataset",
        private=args.private,
        exist_ok=True,
    )

    # Limpiar repo (por defecto) para evitar mezcla con datos V4
    if not args.no_clean:
        print(f"\n🧹 Limpiando repo para evitar mezcla con datos anteriores...")
        clean_repo(api, args.repo_id, args.private)
    else:
        print("\n⚠ --no-clean activo: se hará merge con lo que ya hay en el repo.")

    # Copiar dataset_final.jsonl → dataset_golden.jsonl (nombre canónico V5)
    jsonl_src = dataset_dir / "dataset_final.jsonl"
    jsonl_dst = dataset_dir / "dataset_golden.jsonl"
    if jsonl_src.exists():
        shutil.copy2(jsonl_src, jsonl_dst)
        print(f"\n   📄 Copiado {jsonl_src.name} → {jsonl_dst.name}")

    # Contar imágenes
    n_imgs = sum(1 for f in dataset_dir.rglob("*") if f.suffix.lower() in {".jpg", ".jpeg", ".png"})
    print(f"\n🚀 Subiendo {dataset_dir} a {args.repo_id}...")
    print(f"   {n_imgs} imágenes — puede tardar unos minutos...\n")

    api.upload_folder(
        repo_id=args.repo_id,
        folder_path=str(dataset_dir),
        repo_type="dataset",
        commit_message=f"Dataset golden V5 — {n_imgs} imágenes (136 orig + aumentadas)",
    )

    print(f"\n✅ ¡Dataset subido exitosamente!")
    print(f"   🔗 https://huggingface.co/datasets/{args.repo_id}")
    print(f"\n   Estructura en HuggingFace:")
    print(f"   {args.repo_id}/")
    print(f"   ├── dataset_golden.jsonl   ← formato V5 (ground_truth como objeto)")
    print(f"   ├── original/              ← {136} imágenes reales anotadas por Gemini")
    print(f"   └── augmented/             ← {n_imgs - 136} variantes aumentadas")


if __name__ == '__main__':
    main()
