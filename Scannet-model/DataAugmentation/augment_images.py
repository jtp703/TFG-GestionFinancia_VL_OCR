"""
augment_images.py
Genera variantes aumentadas de los tickets para el entrenamiento del modelo OCR.

Uso:
  python augment_images.py
  python augment_images.py --input ./imagenes --num-augments 15
"""

import os
import json
import argparse
import random
from pathlib import Path

import cv2
import numpy as np
import albumentations as A


def create_augmentation_pipeline():
    return A.Compose([
        A.Rotate(
            limit=(-15, 15),
            border_mode=cv2.BORDER_CONSTANT,
            fill=255,
            p=0.6
        ),
        A.Perspective(
            scale=(0.05, 0.15),
            border_mode=cv2.BORDER_CONSTANT,
            fill=255,
            p=0.5
        ),
        A.ElasticTransform(
            alpha=80,
            sigma=8,
            border_mode=cv2.BORDER_CONSTANT,
            fill=255,
            p=0.3
        ),
        A.GaussianBlur(blur_limit=(3, 9), p=0.4),
        A.MotionBlur(blur_limit=(3, 15), p=0.3),
        A.RandomBrightnessContrast(
            brightness_limit=(-0.3, 0.3),
            contrast_limit=(-0.3, 0.3),
            p=0.6
        ),
        A.RandomShadow(
            shadow_roi=(0, 0, 1, 1),
            num_shadows_limit=(1, 3),
            shadow_dimension=5,
            p=0.5
        ),
        A.GaussNoise(std_range=(0.03, 0.15), p=0.4),
        A.ImageCompression(quality_range=(30, 80), p=0.4),
        A.RandomScale(scale_limit=(-0.1, 0.1), p=0.2),
        A.ToGray(p=0.15),
    ])


def load_jsonl(jsonl_path: str) -> dict:
    data = {}
    with open(jsonl_path, 'r', encoding='utf-8') as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
                data[entry['image_path']] = entry['ground_truth']
            except (json.JSONDecodeError, KeyError):
                print(f"  aviso: no se pudo parsear linea {line_num}")
    return data


def augment_single_image(image: np.ndarray, pipeline: A.Compose, num_augments: int) -> list:
    results = []
    for _ in range(num_augments):
        results.append(pipeline(image=image)['image'])
    return results


def process_dataset(input_dir, output_dir, jsonl_path, num_augments, output_jsonl):
    input_path = Path(input_dir)
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    print(f"Cargando etiquetas desde: {jsonl_path}")
    labels = load_jsonl(jsonl_path)
    print(f"  {len(labels)} entradas cargadas")

    pipeline = create_augmentation_pipeline()

    image_extensions = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp'}
    image_files = [
        f for f in input_path.iterdir()
        if f.is_file() and f.suffix.lower() in image_extensions
    ]

    if not image_files:
        print(f"No se encontraron imagenes en: {input_dir}")
        return

    print(f"  {len(image_files)} imagenes, {num_augments} variantes cada una")

    new_entries = []
    total_generated = 0

    for img_file in sorted(image_files):
        image = cv2.imread(str(img_file))
        if image is None:
            print(f"  no se pudo leer: {img_file.name}")
            continue

        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        ground_truth = labels.get(img_file.name)

        for idx, aug_img in enumerate(augment_single_image(image_rgb, pipeline, num_augments), 1):
            new_name = f"{img_file.stem}_aug_{idx:02d}{img_file.suffix}"
            aug_bgr = cv2.cvtColor(aug_img, cv2.COLOR_RGB2BGR)
            cv2.imwrite(str(output_path / new_name), aug_bgr, [cv2.IMWRITE_JPEG_QUALITY, 95])

            if ground_truth is not None:
                new_entries.append({'image_path': new_name, 'ground_truth': ground_truth})

            total_generated += 1

        print(f"  {img_file.name} -> {num_augments} variantes")

    output_jsonl_path = output_path / output_jsonl
    with open(output_jsonl_path, 'w', encoding='utf-8') as f:
        for entry in new_entries:
            f.write(json.dumps(entry, ensure_ascii=False) + '\n')

    print(f"\nGeneradas {total_generated} imagenes")
    print(f"JSONL guardado en: {output_jsonl_path}")


def main():
    parser = argparse.ArgumentParser(description='Data augmentation para tickets OCR')
    parser.add_argument('--input', '-i', default=r'F:\datasetTickets\v3')
    parser.add_argument('--output', '-o', default=r'F:\datasetTickets\v3\output_augmented')
    parser.add_argument('--jsonl', '-j',
                        default=str(Path(__file__).parent / 'imagenes' / 'dataset_golden.jsonl'))
    parser.add_argument('--num-augments', '-n', type=int, default=10)
    parser.add_argument('--output-jsonl', default='dataset_augmented.jsonl')
    parser.add_argument('--seed', '-s', type=int, default=None)

    args = parser.parse_args()

    if args.seed is not None:
        random.seed(args.seed)
        np.random.seed(args.seed)

    process_dataset(
        input_dir=args.input,
        output_dir=args.output,
        jsonl_path=args.jsonl,
        num_augments=args.num_augments,
        output_jsonl=args.output_jsonl,
    )


if __name__ == '__main__':
    main()
