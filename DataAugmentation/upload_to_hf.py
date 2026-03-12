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
        default=r'F:\datasetTickets\dataset_final',
        help='Directorio del dataset final'
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

    # Renombrar dataset_final.jsonl → dataset_espanol.jsonl para compatibilidad
    jsonl_src = dataset_dir / "dataset_final.jsonl"
    jsonl_dst = dataset_dir / "dataset_espanol.jsonl"
    if jsonl_src.exists() and not jsonl_dst.exists():
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
    print(f"   ├── dataset_espanol.jsonl  (717 entradas)")
    print(f"   ├── original/             (47 imágenes)")
    print(f"   ├── augmented/            (470 imágenes)")
    print(f"   └── synthetic/            (200 imágenes)")


if __name__ == '__main__':
    main()
