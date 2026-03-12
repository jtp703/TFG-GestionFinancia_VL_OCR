"""
=============================================================================
  CONSTRUCTOR DE DATASET FINAL PARA FINE-TUNING
  -----------------------------------------------
  Fusiona los datasets original, aumentado y sintético en un único JSONL
  listo para entrenar el modelo DeepSeek OCR.

  Uso:
    python build_dataset.py
    python build_dataset.py --help

  Dependencias: ninguna adicional (solo Python estándar)
=============================================================================
"""

import os
import re
import json
import argparse
import shutil
from pathlib import Path


def load_original_jsonl(jsonl_path: str) -> list:
    """
    Carga el JSONL original (con formato de JSON anidado sin escapar).
    """
    entries = []
    pattern = re.compile(
        r'"image_path"\s*:\s*"([^"]+)"\s*,\s*"ground_truth"\s*:\s*"(\{.+\})"\s*\}'
    )
    with open(jsonl_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            match = pattern.search(line)
            if match:
                entries.append({
                    'image_path': match.group(1),
                    'ground_truth': match.group(2)
                })
    return entries


def load_standard_jsonl(jsonl_path: str) -> list:
    """
    Carga un JSONL con formato estándar (JSON escapado correctamente).
    """
    entries = []
    with open(jsonl_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
                entries.append(entry)
            except json.JSONDecodeError:
                pass
    return entries


def main():
    parser = argparse.ArgumentParser(
        description='Fusiona datasets original + aumentado + sintético en un JSONL final',
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        '--original-jsonl',
        default=str(Path(__file__).parent.parent / 'Deepseek OCR' / 'codigo' / 'dataset_espanol.jsonl'),
        help='JSONL original con los tickets reales'
    )
    parser.add_argument(
        '--original-images',
        default=str(Path(__file__).parent.parent / 'Deepseek OCR' / 'imagenes'),
        help='Directorio con las imágenes originales'
    )
    parser.add_argument(
        '--augmented-dir',
        default=str(Path(__file__).parent / 'output_augmented'),
        help='Directorio con imágenes aumentadas y su JSONL'
    )
    parser.add_argument(
        '--synthetic-dir',
        default=str(Path(__file__).parent / 'output_synthetic'),
        help='Directorio con tickets sintéticos y su JSONL'
    )
    parser.add_argument(
        '--output', '-o',
        default=str(Path(__file__).parent / 'dataset_final'),
        help='Directorio de salida para el dataset fusionado'
    )
    parser.add_argument(
        '--copy-images',
        action='store_true',
        help='Copiar todas las imágenes al directorio de salida (útil para empaquetar)'
    )

    args = parser.parse_args()

    output_path = Path(args.output)
    output_path.mkdir(parents=True, exist_ok=True)

    all_entries = []
    stats = {}

    print("=" * 60)
    print("  📦 CONSTRUCTOR DE DATASET FINAL")
    print("=" * 60)

    # ── 1. Dataset Original ──
    original_jsonl = Path(args.original_jsonl)
    if original_jsonl.exists():
        original_entries = load_original_jsonl(str(original_jsonl))
        # Prefijo para evitar colisiones de nombre
        for entry in original_entries:
            entry['image_path'] = f"original/{entry['image_path']}"
        all_entries.extend(original_entries)
        stats['Original'] = len(original_entries)
        print(f"\n  📂 Original: {len(original_entries)} entradas")

        if args.copy_images:
            img_dir = Path(args.original_images)
            dest = output_path / 'original'
            dest.mkdir(exist_ok=True)
            if img_dir.exists():
                copied = 0
                for img in img_dir.iterdir():
                    if img.suffix.lower() in {'.jpg', '.jpeg', '.png'}:
                        shutil.copy2(img, dest / img.name)
                        copied += 1
                print(f"     → Copiadas {copied} imágenes a {dest}")
    else:
        print(f"\n  ⚠ No encontrado: {original_jsonl}")
        stats['Original'] = 0

    # ── 2. Dataset Aumentado ──
    aug_dir = Path(args.augmented_dir)
    aug_jsonl = aug_dir / 'dataset_augmented.jsonl'
    if aug_jsonl.exists():
        aug_entries = load_standard_jsonl(str(aug_jsonl))
        for entry in aug_entries:
            entry['image_path'] = f"augmented/{entry['image_path']}"
        all_entries.extend(aug_entries)
        stats['Aumentado'] = len(aug_entries)
        print(f"  🔄 Aumentado: {len(aug_entries)} entradas")

        if args.copy_images:
            dest = output_path / 'augmented'
            dest.mkdir(exist_ok=True)
            copied = 0
            for img in aug_dir.iterdir():
                if img.suffix.lower() in {'.jpg', '.jpeg', '.png'}:
                    shutil.copy2(img, dest / img.name)
                    copied += 1
            print(f"     → Copiadas {copied} imágenes a {dest}")
    else:
        print(f"  ⚠ No encontrado: {aug_jsonl}")
        stats['Aumentado'] = 0

    # ── 3. Dataset Sintético ──
    syn_dir = Path(args.synthetic_dir)
    syn_jsonl = syn_dir / 'dataset_synthetic.jsonl'
    if syn_jsonl.exists():
        syn_entries = load_standard_jsonl(str(syn_jsonl))
        for entry in syn_entries:
            entry['image_path'] = f"synthetic/{entry['image_path']}"
        all_entries.extend(syn_entries)
        stats['Sintético'] = len(syn_entries)
        print(f"  🎫 Sintético: {len(syn_entries)} entradas")

        if args.copy_images:
            dest = output_path / 'synthetic'
            dest.mkdir(exist_ok=True)
            copied = 0
            for img in syn_dir.iterdir():
                if img.suffix.lower() in {'.jpg', '.jpeg', '.png'}:
                    shutil.copy2(img, dest / img.name)
                    copied += 1
            print(f"     → Copiadas {copied} imágenes a {dest}")
    else:
        print(f"  ⚠ No encontrado: {syn_jsonl}")
        stats['Sintético'] = 0

    # ── Guardar JSONL Final ──
    final_jsonl = output_path / 'dataset_final.jsonl'
    with open(final_jsonl, 'w', encoding='utf-8') as f:
        for entry in all_entries:
            f.write(json.dumps(entry, ensure_ascii=False) + '\n')

    total = len(all_entries)
    print(f"\n{'='*60}")
    print(f"  ✅ DATASET FINAL CONSTRUIDO")
    print(f"{'='*60}")
    print(f"  📊 Distribución:")
    for source, count in stats.items():
        pct = (count / total * 100) if total > 0 else 0
        bar = "█" * int(pct / 5) + "░" * (20 - int(pct / 5))
        print(f"     {source:12s}: {count:5d} ({pct:5.1f}%) {bar}")
    print(f"     {'─'*45}")
    print(f"     {'TOTAL':12s}: {total:5d}")
    print(f"\n  📄 JSONL: {final_jsonl}")
    print(f"  📁 Dir:   {output_path}")
    print(f"{'='*60}\n")


if __name__ == '__main__':
    main()
