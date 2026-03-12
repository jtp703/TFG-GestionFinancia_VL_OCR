"""
=============================================================================
  DATA AUGMENTATION PARA OCR DE TICKETS ESPAÑOLES
  -------------------------------------------------
  Aplica transformaciones agresivas a las imágenes originales de tickets
  para combatir el overfitting visual del modelo DeepSeek OCR.

  Uso:
    python augment_images.py
    python augment_images.py --input ./mis_imagenes --num-augments 15
    python augment_images.py --help

  Dependencias:
    pip install albumentations opencv-python-headless Pillow numpy
=============================================================================
"""

import os
import re
import json
import argparse
import random
from pathlib import Path

import cv2
import numpy as np
import albumentations as A


# =============================================================================
#  PIPELINE DE TRANSFORMACIONES
# =============================================================================

def create_augmentation_pipeline():
    """
    Crea un pipeline de Data Augmentation agresivo orientado a tickets/recibos.

    Cada transformación aplica con una probabilidad independiente (p=...),
    por lo que cada imagen generada recibe una combinación aleatoria diferente.
    """
    return A.Compose([
        # ── ROTACIÓN ──────────────────────────────────────────────────────
        # Rota el ticket entre -180° y +180° para simular tickets
        # fotografiados en cualquier orientación (horizontal, al revés, etc.)
        A.Rotate(
            limit=(-180, 180),
            border_mode=cv2.BORDER_CONSTANT,
            fill=255,           # Relleno blanco en los bordes
            p=0.8
        ),

        # ── PERSPECTIVA ───────────────────────────────────────────────
        # Simula que la foto se tomó desde un ángulo (no perpendicular).
        # Clave para tickets fotografiados apoyados en una mesa.
        A.Perspective(
            scale=(0.05, 0.15),
            border_mode=cv2.BORDER_CONSTANT,
            fill=255,
            p=0.5
        ),

        # ── DEFORMACIÓN ELÁSTICA ──────────────────────────────────────────
        # Simula papel arrugado o doblado. El ticket se "ondula" ligeramente.
        A.ElasticTransform(
            alpha=80,
            sigma=8,
            border_mode=cv2.BORDER_CONSTANT,
            fill=255,
            p=0.3
        ),

        # ── DESENFOQUE GAUSSIANO ──────────────────────────────────────────
        # Simula cámara desenfocada / baja calidad de imagen.
        A.GaussianBlur(
            blur_limit=(3, 9),
            p=0.4
        ),

        # ── DESENFOQUE POR MOVIMIENTO ─────────────────────────────────────
        # Simula movimiento de la mano al tomar la foto.
        A.MotionBlur(
            blur_limit=(3, 15),
            p=0.3
        ),

        # ── BRILLO Y CONTRASTE ────────────────────────────────────────────
        # Simula condiciones de iluminación variadas (flash, sombra, etc.)
        A.RandomBrightnessContrast(
            brightness_limit=(-0.3, 0.3),
            contrast_limit=(-0.3, 0.3),
            p=0.6
        ),

        # ── SOMBRAS ───────────────────────────────────────────────────────
        # Añade sombras rectangulares/irregulares como las que producen
        # los dedos, la cartera o el borde de una mesa sobre el ticket.
        A.RandomShadow(
            shadow_roi=(0, 0, 1, 1),   # Sombra puede caer en cualquier zona
            num_shadows_limit=(1, 3),
            shadow_dimension=5,
            p=0.5
        ),

        # ── RUIDO GAUSSIANO ───────────────────────────────────────────────
        # Simula ruido del sensor de la cámara (especialmente en baja luz).
        # std_range en escala 0-1 (Albumentations v2)
        A.GaussNoise(
            std_range=(0.03, 0.15),
            p=0.4
        ),

        # ── COMPRESIÓN JPEG ───────────────────────────────────────────────
        # Simula un ticket que fue enviado por WhatsApp o reenviado varias
        # veces, perdiendo calidad a cada paso.
        A.ImageCompression(
            quality_range=(30, 80),
            p=0.4
        ),

        # ── RECORTE + ZOOM ALEATORIO ────────────────────────────────
        # Simula que la foto no captura al 100% el ticket (bordes cortados).
        # Usa RandomScale + CenterCrop para no requerir tamaños fijos.
        A.RandomScale(
            scale_limit=(-0.1, 0.1),
            p=0.2
        ),

        # ── VOLTEO HORIZONTAL ─────────────────────────────────────────────
        # Tickets reflejados (espejo) - edge case poco frecuente pero útil.
        A.HorizontalFlip(p=0.1),

        # ── ESCALA DE GRISES ──────────────────────────────────────────────
        # Algunos tickets se escanean o fotocopian en B/N.
        A.ToGray(p=0.15),
    ])


# =============================================================================
#  FUNCIONES PRINCIPALES
# =============================================================================

def load_jsonl(jsonl_path: str) -> dict:
    """
    Carga el archivo JSONL y devuelve un diccionario {image_path: ground_truth}.

    El JSONL de este proyecto tiene un formato especial donde ground_truth
    contiene JSON anidado SIN escapar las comillas internas, por ejemplo:
      {"image_path": "x.jpg", "ground_truth": "{"comercio": "X", ...}"}
    Se usa regex para extraer ambos campos de forma robusta.
    """
    data = {}
    # Patrón: captura image_path y todo el contenido entre las llaves de ground_truth
    pattern = re.compile(
        r'"image_path"\s*:\s*"([^"]+)"\s*,\s*"ground_truth"\s*:\s*"(\{.+\})"\s*\}'
    )
    with open(jsonl_path, 'r', encoding='utf-8') as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            match = pattern.search(line)
            if match:
                image_path = match.group(1)
                ground_truth = match.group(2)
                data[image_path] = ground_truth
            else:
                print(f"  ⚠ No se pudo parsear línea {line_num}")
    return data


def augment_single_image(image: np.ndarray, pipeline: A.Compose, num_augments: int) -> list:
    """
    Genera N variantes aumentadas de una sola imagen.
    Returns: lista de np.ndarray con las imágenes aumentadas.
    """
    augmented_images = []
    for _ in range(num_augments):
        result = pipeline(image=image)
        augmented_images.append(result['image'])
    return augmented_images


def process_dataset(
    input_dir: str,
    output_dir: str,
    jsonl_path: str,
    num_augments: int,
    output_jsonl: str
):
    """
    Procesa todo el dataset: lee imágenes, aplica augmentation, guarda resultados.
    """
    input_path = Path(input_dir)
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    # Cargar etiquetas
    print(f"\n📂 Cargando JSONL desde: {jsonl_path}")
    labels = load_jsonl(jsonl_path)
    print(f"   Encontradas {len(labels)} entradas")

    # Crear pipeline
    pipeline = create_augmentation_pipeline()

    # Buscar imágenes en el directorio de entrada
    image_extensions = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp'}
    image_files = [
        f for f in input_path.iterdir()
        if f.is_file() and f.suffix.lower() in image_extensions
    ]

    if not image_files:
        print(f"\n❌ No se encontraron imágenes en: {input_dir}")
        print(f"   Extensiones buscadas: {image_extensions}")
        return

    print(f"   Encontradas {len(image_files)} imágenes en {input_dir}")
    print(f"   Generando {num_augments} variantes por imagen...")
    print(f"   Total esperado: {len(image_files) * num_augments} imágenes aumentadas\n")

    # Procesar cada imagen
    new_entries = []
    total_generated = 0

    for img_file in sorted(image_files):
        # Leer imagen
        image = cv2.imread(str(img_file))
        if image is None:
            print(f"  ⚠ No se pudo leer: {img_file.name}")
            continue

        # Convertir BGR -> RGB para Albumentations
        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

        # Buscar su ground_truth en el JSONL
        ground_truth = labels.get(img_file.name, None)
        if ground_truth is None:
            print(f"  ⚠ Sin etiqueta JSON para: {img_file.name} (se genera igual)")

        # Generar variantes
        augmented_images = augment_single_image(image_rgb, pipeline, num_augments)

        for idx, aug_img in enumerate(augmented_images, 1):
            # Nombre: recibo_almeria_001_aug_03.jpg
            stem = img_file.stem
            new_name = f"{stem}_aug_{idx:02d}{img_file.suffix}"
            new_path = output_path / new_name

            # Convertir RGB -> BGR para guardar con OpenCV
            aug_bgr = cv2.cvtColor(aug_img, cv2.COLOR_RGB2BGR)
            cv2.imwrite(str(new_path), aug_bgr, [cv2.IMWRITE_JPEG_QUALITY, 95])

            # Crear entrada JSONL (el ground_truth se duplica tal cual)
            if ground_truth is not None:
                new_entries.append({
                    'image_path': new_name,
                    'ground_truth': ground_truth
                })

            total_generated += 1

        print(f"  ✅ {img_file.name} → {num_augments} variantes generadas")

    # Guardar JSONL aumentado
    output_jsonl_path = output_path / output_jsonl
    with open(output_jsonl_path, 'w', encoding='utf-8') as f:
        for entry in new_entries:
            f.write(json.dumps(entry, ensure_ascii=False) + '\n')

    print(f"\n{'='*60}")
    print(f"  ✅ COMPLETADO")
    print(f"  📊 Imágenes generadas: {total_generated}")
    print(f"  📄 JSONL guardado en:  {output_jsonl_path}")
    print(f"  📁 Directorio salida:  {output_path}")
    print(f"{'='*60}\n")


# =============================================================================
#  PUNTO DE ENTRADA
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description='Data Augmentation para tickets/recibos españoles (OCR)',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos de uso:
  python augment_images.py
  python augment_images.py --input ./imagenes --num-augments 15
  python augment_images.py --input ./img --output ./augmented --num-augments 5
        """
    )
    parser.add_argument(
        '--input', '-i',
        default=str(Path(__file__).parent.parent / 'Deepseek OCR' / 'imagenes'),
        help='Directorio con las imágenes originales (default: ../Deepseek OCR/imagenes)'
    )
    parser.add_argument(
        '--output', '-o',
        default=str(Path(__file__).parent / 'output_augmented'),
        help='Directorio de salida para imágenes aumentadas (default: ./output_augmented)'
    )
    parser.add_argument(
        '--jsonl', '-j',
        default=str(Path(__file__).parent.parent / 'Deepseek OCR' / 'codigo' / 'dataset_espanol.jsonl'),
        help='Ruta al archivo JSONL con las etiquetas (default: ../Deepseek OCR/codigo/dataset_espanol.jsonl)'
    )
    parser.add_argument(
        '--num-augments', '-n',
        type=int,
        default=10,
        help='Número de variantes por imagen (default: 10)'
    )
    parser.add_argument(
        '--output-jsonl',
        default='dataset_augmented.jsonl',
        help='Nombre del archivo JSONL de salida (default: dataset_augmented.jsonl)'
    )
    parser.add_argument(
        '--seed', '-s',
        type=int,
        default=None,
        help='Semilla aleatoria para reproducibilidad (default: None = aleatorio)'
    )

    args = parser.parse_args()

    # Fijar semilla si se proporcionó
    if args.seed is not None:
        random.seed(args.seed)
        np.random.seed(args.seed)

    print("=" * 60)
    print("  🔧 DATA AUGMENTATION - TICKETS ESPAÑOLES")
    print("=" * 60)
    print(f"  📂 Input:        {args.input}")
    print(f"  📁 Output:       {args.output}")
    print(f"  📄 JSONL:        {args.jsonl}")
    print(f"  🔄 Augments/img: {args.num_augments}")
    if args.seed is not None:
        print(f"  🎲 Seed:         {args.seed}")

    process_dataset(
        input_dir=args.input,
        output_dir=args.output,
        jsonl_path=args.jsonl,
        num_augments=args.num_augments,
        output_jsonl=args.output_jsonl
    )


if __name__ == '__main__':
    main()
