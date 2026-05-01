"""
=============================================================================
  RELABEL TOTAL (V6 H0) — re-etiquetado manual de bbox con 2 clics
  --------------------------------------------------------------
  Para cada imagen de la lista:
    1. Abre la imagen original en una ventana matplotlib.
    2. Espera 2 clics: esquina superior-izquierda y esquina inferior-derecha
       del total real.
    3. Calcula bbox = [min(x), min(y), max(x), max(y)] y lo escribe en
       dataset_total.jsonl (insertando o reemplazando la entrada).
    4. Regenera la imagen etiquetada en etiquetadas/.

  Controles:
    - Click izquierdo: marca punto.
    - Tecla 'n': salta esta imagen sin guardar.
    - Tecla 'q': sale del script (lo procesado hasta ahora ya quedó guardado).

  Uso:
    python DataAugmentation/relabel_total.py --ids 016,038,051,052,071,080,082,084,092,105,107,114,143,145
=============================================================================
"""

import argparse
import json
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
    """
    Devuelve bbox [x1,y1,x2,y2] tras 2 clics, o 'skip' / 'quit'.
    """
    img = Image.open(image_path).convert("RGB")
    fig, ax = plt.subplots(figsize=(10, 13))
    ax.imshow(img)
    ax.set_title(f"{image_path.name}  |  total={total}\n"
                 f"2 clics (top-left + bottom-right del TOTAL).  "
                 f"'n'=saltar, 'q'=salir")
    ax.axis("off")

    state = {"action": None}

    def on_key(event):
        if event.key == "n":
            state["action"] = "skip"
            plt.close(fig)
        elif event.key == "q":
            state["action"] = "quit"
            plt.close(fig)

    fig.canvas.mpl_connect("key_press_event", on_key)

    try:
        clicks = plt.ginput(2, timeout=0)
    except Exception:
        clicks = []
    plt.close(fig)

    if state["action"] == "skip":
        return "skip"
    if state["action"] == "quit":
        return "quit"
    if len(clicks) < 2:
        return "skip"

    (x1, y1), (x2, y2) = clicks
    bbox = [int(min(x1, x2)), int(min(y1, y2)),
            int(max(x1, x2)), int(max(y1, y2))]
    return bbox


def main():
    ap = argparse.ArgumentParser(description="Re-etiquetado manual de bbox del total")
    ap.add_argument("--ids", required=True, help="'016,038,051,...'")
    ap.add_argument("--golden", type=Path, default=DEFAULT_GOLDEN)
    ap.add_argument("--images-dir", type=Path, default=DEFAULT_IMAGES_DIR)
    ap.add_argument("--out-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    ap.add_argument("--out-jsonl", type=Path, default=DEFAULT_OUTPUT_JSONL)
    args = ap.parse_args()

    if not args.golden.exists():
        sys.exit(f"❌ No existe {args.golden}")

    targets = [id_to_filename(t) for t in parse_ids(args.ids)]
    if not targets:
        sys.exit("❌ Lista de IDs vacía")

    golden = {row["image_path"]: row for row in load_jsonl(args.golden)}
    existing = load_jsonl(args.out_jsonl)
    by_name = {row["image_path"]: row for row in existing}

    print(f"🖼  Re-etiquetando {len(targets)} imágenes\n")
    saved = 0
    skipped = 0

    for name in targets:
        if name not in golden:
            print(f"  ⚠ {name} no está en golden, salto")
            skipped += 1
            continue
        total = float(golden[name]["ground_truth"]["total"])
        img_path = args.images_dir / name
        if not img_path.exists():
            print(f"  ⚠ {name} no existe en {args.images_dir}, salto")
            skipped += 1
            continue

        print(f"  · {name} (total={total})  → 2 clics …")
        result = pick_bbox_interactive(img_path, total)

        if result == "quit":
            print("  🛑 Salida solicitada. Guardando lo procesado.")
            break
        if result == "skip":
            print("      ⏭  saltada")
            skipped += 1
            continue

        bbox = result
        print(f"      ✅ bbox manual={bbox}")
        by_name[name] = {
            "image_path": name,
            "total": total,
            "bbox": bbox,
            "strategy": "manual: 2 clicks",
        }
        draw_bbox_on_image(img_path, bbox, total, args.out_dir / name)
        saved += 1

    final = sorted(by_name.values(), key=lambda r: r["image_path"])
    write_jsonl(args.out_jsonl, final)

    print("\n" + "─" * 60)
    print(f"💾 Guardadas: {saved}")
    print(f"⏭  Saltadas:  {skipped}")
    print(f"📄 JSONL:     {args.out_jsonl}")


if __name__ == "__main__":
    main()
