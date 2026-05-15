import argparse
import shutil
from pathlib import Path
from huggingface_hub import HfApi, login


def clean_repo(api: HfApi, repo_id: str, private: bool):
    try:
        api.delete_repo(repo_id=repo_id, repo_type="dataset")
        print("  repo anterior eliminado")
    except Exception as e:
        print(f"  aviso al borrar ({e})")
    api.create_repo(repo_id=repo_id, repo_type="dataset", private=private, exist_ok=True)
    print("  repo recreado")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--token", "-t", required=True)
    parser.add_argument("--dataset-dir", default=r"F:\datasetTickets\dataset_final")
    parser.add_argument("--repo-id", default="Lacax/Tickets")
    parser.add_argument("--no-clean", action="store_true", default=False)
    parser.add_argument("--private", action="store_true", default=True)
    args = parser.parse_args()

    dataset_dir = Path(args.dataset_dir)
    if not dataset_dir.exists():
        print(f"no existe: {dataset_dir}")
        return

    login(token=args.token)
    api = HfApi()

    api.create_repo(repo_id=args.repo_id, repo_type="dataset", private=args.private, exist_ok=True)

    if not args.no_clean:
        print("limpiando repo...")
        clean_repo(api, args.repo_id, args.private)
    else:
        print("--no-clean: merge con lo existente")

    jsonl_src = dataset_dir / "dataset_final.jsonl"
    jsonl_dst = dataset_dir / "dataset_golden.jsonl"
    if jsonl_src.exists():
        shutil.copy2(jsonl_src, jsonl_dst)

    n_imgs = sum(1 for f in dataset_dir.rglob("*") if f.suffix.lower() in {".jpg", ".jpeg", ".png"})
    print(f"subiendo {n_imgs} imagenes a {args.repo_id}...")

    api.upload_folder(
        repo_id=args.repo_id,
        folder_path=str(dataset_dir),
        repo_type="dataset",
        commit_message=f"dataset {n_imgs} imagenes",
    )

    print(f"listo: https://huggingface.co/datasets/{args.repo_id}")


if __name__ == "__main__":
    main()
