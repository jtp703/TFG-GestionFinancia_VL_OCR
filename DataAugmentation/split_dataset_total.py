"""
=============================================================================
  SPLIT DATASET TOTAL (V6 H0→H1)
  --------------------------------
  Divide DataAugmentation/imagenes/dataset_total.jsonl en train/val/test
  estratificando por rango de total (cuartiles), para que cada split tenga
  distribución de totales comparable.

  Uso:
    python DataAugmentation/split_dataset_total.py
    python DataAugmentation/split_dataset_total.py --train 0.8 --val 0.1 --test 0.1 --seed 42

  Salidas (mismo directorio que el input):
    dataset_total_train.jsonl
    dataset_total_val.jsonl
    dataset_total_test.jsonl
=============================================================================
"""

import argparse
import json
import random
from pathlib import Path

DEFAULT_INPUT = Path("DataAugmentation/imagenes/dataset_total.jsonl")


def load_jsonl(path: Path) -> list[dict]:
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            rows.append(json.loads(line))
    return rows


def write_jsonl(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def quartile_bin(total: float, q1: float, q2: float, q3: float) -> int:
    if total <= q1: return 0
    if total <= q2: return 1
    if total <= q3: return 2
    return 3


def stratified_split(rows: list[dict], train: float, val: float, test: float, seed: int):
    rng = random.Random(seed)
    totals = sorted(r["total"] for r in rows)
    n = len(totals)
    q1 = totals[n // 4]
    q2 = totals[n // 2]
    q3 = totals[3 * n // 4]

    by_bin: dict[int, list[dict]] = {0: [], 1: [], 2: [], 3: []}
    for r in rows:
        by_bin[quartile_bin(r["total"], q1, q2, q3)].append(r)

    train_set, val_set, test_set = [], [], []
    for b, items in by_bin.items():
        rng.shuffle(items)
        k = len(items)
        n_train = int(round(k * train))
        n_val = int(round(k * val))
        # el resto a test (evita perder por redondeos)
        train_set.extend(items[:n_train])
        val_set.extend(items[n_train : n_train + n_val])
        test_set.extend(items[n_train + n_val :])

    rng.shuffle(train_set)
    rng.shuffle(val_set)
    rng.shuffle(test_set)
    return train_set, val_set, test_set, (q1, q2, q3)


def histogram(rows: list[dict], q1: float, q2: float, q3: float) -> dict[str, int]:
    h = {f"≤{q1:.2f}": 0, f"({q1:.2f},{q2:.2f}]": 0,
         f"({q2:.2f},{q3:.2f}]": 0, f">{q3:.2f}": 0}
    keys = list(h.keys())
    for r in rows:
        h[keys[quartile_bin(r["total"], q1, q2, q3)]] += 1
    return h


def main():
    ap = argparse.ArgumentParser(description="Split estratificado del dataset_total")
    ap.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    ap.add_argument("--train", type=float, default=0.8)
    ap.add_argument("--val", type=float, default=0.1)
    ap.add_argument("--test", type=float, default=0.1)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    if abs(args.train + args.val + args.test - 1.0) > 1e-6:
        raise SystemExit(f"❌ train+val+test debe sumar 1.0 (got {args.train+args.val+args.test})")
    if not args.input.exists():
        raise SystemExit(f"❌ No existe {args.input}")

    rows = load_jsonl(args.input)
    print(f"📊 Cargadas {len(rows)} entradas de {args.input}\n")

    train_rows, val_rows, test_rows, (q1, q2, q3) = stratified_split(
        rows, args.train, args.val, args.test, args.seed
    )

    print(f"Cuartiles del total: q1={q1:.2f}  q2={q2:.2f}  q3={q3:.2f}\n")
    print(f"{'Split':<6}  {'N':>4}  {'≤Q1':>6}  {'Q1-Q2':>6}  {'Q2-Q3':>6}  {'>Q3':>6}")
    for name, subset in [("train", train_rows), ("val", val_rows), ("test", test_rows)]:
        h = histogram(subset, q1, q2, q3)
        vals = list(h.values())
        print(f"{name:<6}  {len(subset):>4}  {vals[0]:>6}  {vals[1]:>6}  {vals[2]:>6}  {vals[3]:>6}")

    out_train = args.input.with_name("dataset_total_train.jsonl")
    out_val = args.input.with_name("dataset_total_val.jsonl")
    out_test = args.input.with_name("dataset_total_test.jsonl")
    write_jsonl(out_train, train_rows)
    write_jsonl(out_val, val_rows)
    write_jsonl(out_test, test_rows)

    print(f"\n✅ Escritos:\n  {out_train}\n  {out_val}\n  {out_test}")


if __name__ == "__main__":
    main()
