# Re-etiquetado manual de bbox del total con 2 clics.
# Uso: python DataAugmentation/relabel_total.py --ids 016,038,051,...

import argparse
import sys
from pathlib import Path

import matplotlib.pyplot as plt
from PIL import Image

from build_total_dataset import (
    DEFAULT_GOLDEN,
    DEFAULT_IMAGES_DIR,
    DEFAULT_OUTPUT_DIR,
    DEFAULT_OUTPUT_JSONL,
    draw_bbox_on_image,
)
from retry_no_match import id_to_filename, load_jsonl, parse_ids, write_jsonl


def pick_bbox_interactive(image_path: Path, total: float) -> list[int] | str:
    img = Image.open(image_path).convert("RGB")
    fig, ax = plt.subplots(figsize=(10, 13))
    ax.imshow(img)
    ax.set_title(
        f"{image_path.name}  |  total={total}\n"
        f"2 clics (top-left + bottom-right).  'n'=saltar  'q'=salir"
    )
    ax.axis("off")

    action = [None]

    def on_key(event):
        if event.key in ("n", "q"):
            action[0] = event.key
            plt.close(fig)

    fig.canvas.mpl_connect("key_press_event", on_key)

    try:
        clicks = plt.ginput(2, timeout=0)
    except Exception:
        clicks = []
    plt.close(fig)

    if action[0] == "q":
        return "quit"
    if action[0] == "n" or len(clicks) < 2:
        return "skip"

    (x1, y1), (x2, y2) = clicks
    return [int(min(x1, x2)), int(min(y1, y2)), int(max(x1, x2)), int(max(y1, y2))]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ids", required=True)
    ap.add_argument("--golden", type=Path, default=DEFAULT_GOLDEN)
    ap.add_argument("--images-dir", type=Path, default=DEFAULT_IMAGES_DIR)
    ap.add_argument("--out-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    ap.add_argument("--out-jsonl", type=Path, default=DEFAULT_OUTPUT_JSONL)
    args = ap.parse_args()

    if not args.golden.exists():
        sys.exit(f"no existe {args.golden}")

    targets = [id_to_filename(t) for t in parse_ids(args.ids)]
    if not targets:
        sys.exit("lista de IDs vacía")

    golden  = {row["image_path"]: row for row in load_jsonl(args.golden)}
    by_name = {row["image_path"]: row for row in load_jsonl(args.out_jsonl)}

    saved = skipped = 0

    for name in targets:
        if name not in golden:
            print(f"  {name}: no está en golden, salto")
            skipped += 1
            continue

        img_path = args.images_dir / name
        if not img_path.exists():
            print(f"  {name}: imagen no encontrada, salto")
            skipped += 1
            continue

        total = float(golden[name]["ground_truth"]["total"])
        print(f"  {name}  total={total}")
        result = pick_bbox_interactive(img_path, total)

        if result == "quit":
            print("  saliendo")
            break
        if result == "skip":
            skipped += 1
            continue

        by_name[name] = {
            "image_path": name,
            "total": total,
            "bbox": result,
            "strategy": "manual",
        }
        draw_bbox_on_image(img_path, result, total, args.out_dir / name)
        print(f"    bbox={result}")
        saved += 1

    write_jsonl(args.out_jsonl, sorted(by_name.values(), key=lambda r: r["image_path"]))
    print(f"\nguardadas={saved}  saltadas={skipped}")


if __name__ == "__main__":
    main()
