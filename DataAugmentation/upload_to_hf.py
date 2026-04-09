"""
=============================================================================
  SUBIDA DE DATASET A HUGGING FACE
  ----------------------------------
  Sube las imágenes y el JSONL a un dataset de HuggingFace.

  Uso:
    python upload_to_hf.py --token TU_HF_TOKEN

  ANTES de ejecutar:
    pip install huggingface_hub

  El script sube TODO el contenido de dataset_final/ a Lacax/Tickets.
=============================================================================
"""

import argparse
from pathlib import Path
from huggingface_hub import HfApi, login


def main():
    parser = argparse.ArgumentParser(description='Sube dataset a HuggingFace')
    parser.add_argument('--token', '-t', required=True, help='Tu HuggingFace token (write)')
    parser.add_argument(
        '--dataset-dir',
        default=None,
        help='Directorio del dataset final construido con build_dataset.py (OBLIGATORIO). Ejemplo: F:\\datasetTickets\\dataset_final_v2'
    )
    parser.add_argument(
        '--repo-id',
        default='Lacax/Tickets',
        help='ID del repo en HuggingFace (default: Lacax/Tickets)'
    )
    parser.add_argument(
        '--private',
        action='store_true',
        default=True,
        help='Crear repo privado (default: True)'
    )

    args = parser.parse_args()
    if args.dataset_dir is None:
        parser.error("--dataset-dir es obligatorio. Ejemplo: F:\\datasetTickets\\dataset_final_v2")
    dataset_dir = Path(args.dataset_dir)

    # Login
    login(token=args.token)
    api = HfApi()

    # Crear repo si no existe
    print(f"\n📦 Creando/verificando repo: {args.repo_id}")
    api.create_repo(
        repo_id=args.repo_id,
        repo_type="dataset",
        private=args.private,
        exist_ok=True
    )

    # Renombrar dataset_final.jsonl → dataset_espanol_ampliado.jsonl
    # El notebook V4 busca exactamente este nombre en el repo de HuggingFace
    jsonl_src = dataset_dir / "dataset_final.jsonl"
    jsonl_dst = dataset_dir / "dataset_espanol_ampliado.jsonl"
    if jsonl_src.exists():
        import shutil
        shutil.copy2(jsonl_src, jsonl_dst)
        print(f"   📄 Copiado {jsonl_src.name} → {jsonl_dst.name}")

    # Subir todo el directorio
    print(f"\n🚀 Subiendo {dataset_dir} a {args.repo_id}...")
    print("   Esto puede tardar unos minutos (717 imágenes)...\n")

    api.upload_folder(
        repo_id=args.repo_id,
        folder_path=str(dataset_dir),
        repo_type="dataset",
        commit_message="Upload augmented + synthetic Spanish ticket dataset (717 images)",
    )

    print(f"\n✅ ¡Dataset subido exitosamente!")
    print(f"   🔗 https://huggingface.co/datasets/{args.repo_id}")
    print(f"\n   Estructura en HuggingFace:")
    print(f"   {args.repo_id}/")
    print(f"   ├── dataset_espanol_ampliado.jsonl  ← buscado por el notebook V4")
    print(f"   ├── original/")
    print(f"   ├── augmented/")
    print(f"   └── synthetic/")


if __name__ == '__main__':
    main()
