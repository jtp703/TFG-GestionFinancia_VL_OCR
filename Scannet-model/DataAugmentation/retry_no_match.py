"""
=============================================================================
  RETRY NO-MATCH (V6 H0) — segundo intento OCR.space para imágenes sin bbox
  --------------------------------------------------------------
  Toma una lista de IDs (p.ej. "021,053,070") y reintenta el pipeline de
  build_total_dataset solo sobre esas imágenes. Útil cuando OCR.space
  devuelve overlay distinto en el segundo intento.

  Uso:
    python DataAugmentation/retry_no_match.py --ids 021,053,070,086,102,116,128,147

  Las que enganchen se anexan/actualizan en dataset_total.jsonl y se regenera
  la imagen etiquetada. Las que sigan sin match se imprimen al final para
  pasar al flujo manual (relabel_total.py).
=============================================================================
"""

import argparse
import json
import sys
from pathlib import Path

from build_total_dataset import (
    DEFAULT_GOLDEN,
    DEFAULT_IMAGES_DIR,
    DEFAULT_OUTPUT_DIR,
    DEFAULT_OUTPUT_JSONL,
    call_ocr_space,
    draw_bbox_on_image,
    find_total_bbox,
    load_env_key,
)


def parse_ids(raw: str) -> list[str]:
    return [tok.strip() for tok in raw.split(",") if tok.strip()]


def id_to_filename(token: str) -> str:
    """Acepta '021', '21', 'recibo_almeria_021', '021.jpg', etc.
    Numéricos puros se rellenan a 3 dígitos para casar con el naming del dataset."""
    if token.endswith(".jpg") or token.endswith(".jpeg") or token.endswith(".png"):
        return token if token.startswith("recibo_") else f"recibo_almeria_{token}"
    if token.startswith("recibo_"):
        return f"{token}.jpg"
    if token.isdigit():
        token = token.zfill(3)
    return f"recibo_almeria_{token}.jpg"


def load_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            out.append(json.loads(line))
    return out


def write_jsonl(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def main():
    ap = argparse.ArgumentParser(description="Reintenta OCR para imágenes sin bbox")
    ap.add_argument("--ids", required=True, help="Lista separada por comas: '021,053,070'")
    ap.add_argument("--golden", type=Path, default=DEFAULT_GOLDEN)
    ap.add_argument("--images-dir", type=Path, default=DEFAULT_IMAGES_DIR)
    ap.add_argument("--out-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    ap.add_argument("--out-jsonl", type=Path, default=DEFAULT_OUTPUT_JSONL)
    args = ap.parse_args()

    if not args.golden.exists():
        sys.exit(f"❌ No existe {args.golden}")

    api_key = load_env_key()
    print(f"🔑 OCR.space key cargada ({api_key[:6]}…)\n")

    targets = {id_to_filename(t) for t in parse_ids(args.ids)}
    if not targets:
        sys.exit("❌ Lista de IDs vacía")

    golden = {row["image_path"]: row for row in load_jsonl(args.golden)}
    existing = load_jsonl(args.out_jsonl)
    by_name = {row["image_path"]: row for row in existing}

    still_missing = []
    fixed = []

    for name in sorted(targets):
        if name not in golden:
            print(f"  ⚠ {name} no está en golden, salto")
            continue
        gt = golden[name]["ground_truth"]
        total = float(gt["total"])
        img_path = args.images_dir / name
        if not img_path.exists():
            print(f"  ⚠ {name} no existe en {args.images_dir}, salto")
            continue

        print(f"  · {name} (total={total})")
        try:
            ocr = call_ocr_space(img_path, api_key)
        except Exception as e:
            print(f"      ⚠ OCR error: {e}")
            still_missing.append(name)
            continue

        if ocr.get("IsErroredOnProcessing"):
            print(f"      ⚠ OCR responde error: {ocr.get('ErrorMessage')}")
            still_missing.append(name)
            continue

        match = find_total_bbox(ocr, total)
        if match is None:
            print("      ⚠ Sigue sin match")
            still_missing.append(name)
            continue

        bbox, matched_text, strategy = match
        print(f"      ✅ bbox={bbox} (texto='{matched_text}', {strategy})")
        by_name[name] = {
            "image_path": name,
            "total": total,
            "bbox": bbox,
            "strategy": f"retry: {strategy}",
        }
        draw_bbox_on_image(img_path, bbox, total, args.out_dir / name)
        fixed.append(name)

    # Reescribe JSONL completo, ordenado por nombre
    final = sorted(by_name.values(), key=lambda r: r["image_path"])
    write_jsonl(args.out_jsonl, final)

    print("\n" + "─" * 60)
    print(f"✅ Recuperadas en retry: {len(fixed)}")
    print(f"⚠  Siguen sin match:    {len(still_missing)}")
    if still_missing:
        print("\nPasar al flujo manual (relabel_total.py):")
        print("  --ids " + ",".join(n.replace("recibo_almeria_", "").replace(".jpg", "")
                                     for n in still_missing))


if __name__ == "__main__":
    main()
