"""
Pipeline de anotación automática de tickets con Gemini 2.5 Flash.
Genera dataset_golden.jsonl con JSON estrictamente válido y schema unificado.

Uso:
    python annotate_with_gemini.py
    python annotate_with_gemini.py --images-dir F:/datasetTickets/v3
    python annotate_with_gemini.py --resume          # continúa desde checkpoint
    python annotate_with_gemini.py --delay 2.0       # más lento si hay rate limit

Dependencias:
    pip install google-genai Pillow

GEMINI_API_KEY debe estar en Scannet/.env.local o en el entorno del sistema.
"""

import os
import json
import time
import argparse
import re
from pathlib import Path

from google import genai
from google.genai import types
from PIL import Image


# ---------------------------------------------------------------------------
# Carga de API key desde Scannet/.env.local (si no está en el entorno)
# ---------------------------------------------------------------------------

def _load_dotenv(env_path: Path) -> None:
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))


SCRIPT_DIR = Path(__file__).parent
_load_dotenv(SCRIPT_DIR.parent / "Scannet" / ".env.local")

# ---------------------------------------------------------------------------
# Modelo y prompt
# ---------------------------------------------------------------------------

GEMINI_MODEL = "gemini-2.5-flash"

GOLDEN_PROMPT = """Eres un experto en extracción de datos de tickets y recibos de compra españoles.

Analiza la imagen del ticket y devuelve ÚNICAMENTE el siguiente JSON, sin markdown, sin explicaciones, sin bloques de código:

{
  "comercio": "nombre del comercio tal como aparece en el ticket",
  "cif": "NIF o CIF sin guiones ni espacios, exactamente 9 caracteres (ej: A46103834), o cadena vacía si no aparece",
  "fecha": "fecha en formato ISO YYYY-MM-DD",
  "fecha_original": "fecha exactamente como aparece en el ticket (ej: 07/03/2026)",
  "total": número_decimal,
  "items": [
    {
      "cantidad": número_decimal_o_null,
      "descripcion": "descripción completa del producto",
      "precio": número_decimal
    }
  ]
}

REGLAS OBLIGATORIAS:
1. Productos en 2 líneas: únelos en una sola "descripcion" completa (ej: "LECHE SEMIDESNATADA PASCUAL 1L BRICK").
2. Productos por peso (kg, g): "cantidad" es el peso como decimal (ej: 0.785 para 0,785 kg).
3. Si la cantidad no aparece o no se puede leer, usa null.
4. Descuentos: {"cantidad": 1, "descripcion": "DESCUENTO nombre", "precio": -X.XX} con precio negativo.
5. "cif" siempre sin guiones ni espacios. Exactamente 9 caracteres o cadena vacía "".
6. "total" es el importe total final pagado (con IVA).
7. "precio" de cada item es el subtotal de esa línea (no el precio unitario).
8. NUNCA uses "VARIOS", "N/A", "?", "..." u otros placeholders en "descripcion".
9. Incluye todos los items visibles, incluyendo bolsas, envases, impuestos de plástico.
10. Si el ticket tiene datos borrosos o parcialmente ilegibles, extrae lo que se pueda leer.

CASOS ESPECIALES:
- Si la imagen NO es un ticket o recibo de compra: {"error": "no_es_ticket", "motivo": "descripción breve"}
- Si el ticket es completamente ilegible: {"error": "no_legible", "motivo": "descripción breve"}
- Si el ticket tiene items pero algunos son ilegibles: inclúyelos con la descripción parcial que se pueda leer.

Devuelve ÚNICAMENTE el JSON. Sin ningún texto adicional."""

# ---------------------------------------------------------------------------
# Validación del output de Gemini
# ---------------------------------------------------------------------------

PLACEHOLDER_WORDS = {"VARIOS", "N/A", "?", "...", "ILEGIBLE", "TEXTO"}


def validate_annotation(ann: dict, image_name: str) -> tuple[bool, list[str]]:
    """Retorna (es_válido, lista_de_errores)."""
    if "error" in ann:
        return True, []

    errors = []
    required = ["comercio", "cif", "fecha", "fecha_original", "total", "items"]
    for field in required:
        if field not in ann:
            errors.append(f"campo faltante: {field}")

    if errors:
        return False, errors

    if not isinstance(ann["total"], (int, float)):
        errors.append(f"total no es número: {type(ann['total'])}")

    if not isinstance(ann["items"], list):
        errors.append("items no es lista")
    else:
        for i, item in enumerate(ann["items"]):
            desc = item.get("descripcion", "")
            if not desc:
                errors.append(f"item[{i}] sin descripcion")
            elif desc.upper().strip() in PLACEHOLDER_WORDS:
                errors.append(f"item[{i}] usa placeholder: '{desc}'")

            precio = item.get("precio")
            if precio is None:
                errors.append(f"item[{i}] sin precio")
            elif not isinstance(precio, (int, float)):
                errors.append(f"item[{i}] precio no es número: {type(precio)}")

            cantidad = item.get("cantidad")
            if cantidad is not None and not isinstance(cantidad, (int, float)):
                errors.append(f"item[{i}] cantidad no es número ni null: {type(cantidad)}")

    # Ticket-fantasma: comercio vacío + items vacíos
    if ann.get("comercio") == "" and ann.get("items") == []:
        errors.append("ticket-fantasma: comercio vacío e items vacíos simultáneamente")

    return len(errors) == 0, errors


# ---------------------------------------------------------------------------
# Llamada a Gemini con reintentos
# ---------------------------------------------------------------------------

def _strip_markdown(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"\s*```\s*$", "", text, flags=re.MULTILINE)
    return text.strip()


def annotate_image(client: genai.Client, image_path: Path) -> dict | None:
    """Llama a Gemini y retorna el dict anotado, o None si falla tras reintentos."""
    img = Image.open(image_path)

    for attempt in range(3):
        try:
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=[img, GOLDEN_PROMPT],
            )
            text = _strip_markdown(response.text)
            return json.loads(text)

        except json.JSONDecodeError as e:
            print(f"    ⚠  JSON inválido (intento {attempt + 1}/3): {e}")
            if attempt < 2:
                time.sleep(2)

        except Exception as e:
            msg = str(e)
            if "429" in msg or "quota" in msg.lower():
                wait = 30 * (attempt + 1)
                print(f"    ⏳ Rate limit — esperando {wait}s...")
                time.sleep(wait)
            else:
                print(f"    ❌ Error Gemini (intento {attempt + 1}/3): {e}")
                if attempt < 2:
                    time.sleep(5 * (attempt + 1))

    return None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Anotar tickets con Gemini 2.5 Flash")
    parser.add_argument(
        "--images-dir",
        type=Path,
        default=Path("F:/datasetTickets/v3"),
        help="Directorio con las imágenes de tickets",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=SCRIPT_DIR / "imagenes" / "dataset_golden.jsonl",
        help="Ruta del JSONL de salida",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Continuar desde checkpoint (añade al fichero existente)",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=1.5,
        help="Segundos de espera entre llamadas a la API (default: 1.5)",
    )
    parser.add_argument(
        "--start-from",
        type=int,
        default=1,
        metavar="N",
        help="Número de imagen (1-based, inclusive) desde la que empezar (default: 1)",
    )
    args = parser.parse_args()

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise SystemExit(
            "ERROR: GEMINI_API_KEY no encontrada.\n"
            "Exporta la variable o añádela a Scannet/.env.local"
        )

    client = genai.Client(api_key=api_key)

    images_dir: Path = args.images_dir
    if not images_dir.is_absolute():
        images_dir = SCRIPT_DIR / images_dir
    if not images_dir.exists():
        raise SystemExit(f"ERROR: directorio de imágenes no existe: {images_dir}")

    output_path: Path = args.output
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Checkpoint: imágenes ya procesadas
    processed: set[str] = set()
    if args.resume and output_path.exists():
        with open(output_path, encoding="utf-8") as f:
            for line in f:
                try:
                    processed.add(json.loads(line)["image_path"])
                except Exception:
                    pass
        print(f"Reanudando: {len(processed)} imágenes ya procesadas")

    extensions = {".jpg", ".jpeg", ".png"}
    all_images = sorted(p for p in images_dir.iterdir() if p.suffix.lower() in extensions)

    if args.start_from > 1:
        all_images = all_images[args.start_from - 1:]
        print(f"Saltando a imagen #{args.start_from} (quedan {len(all_images)} en la lista)")

    pending = [p for p in all_images if p.name not in processed]

    print(f"Imágenes totales: {len(all_images)} | Pendientes: {len(pending)}")
    print(f"Output: {output_path}\n")

    errors_log = []
    ok_count = 0

    with open(output_path, "a", encoding="utf-8") as out:
        for idx, img_path in enumerate(pending):
            prefix = f"[{idx + 1:3d}/{len(pending)}] {img_path.name}"
            print(f"{prefix} ...", end=" ", flush=True)

            ann = annotate_image(client, img_path)

            if ann is None:
                print("❌ FALLO GEMINI")
                errors_log.append({"image": img_path.name, "error": "fallo_gemini"})
                continue

            is_valid, errs = validate_annotation(ann, img_path.name)

            if not is_valid:
                print(f"⚠  INVÁLIDO → {'; '.join(errs)}")
                errors_log.append({"image": img_path.name, "errors": errs, "raw": ann})
                continue

            if "error" in ann:
                print(f"🚫 {ann['error'].upper()}: {ann.get('motivo', '')}")
            else:
                n_items = len(ann.get("items", []))
                total = ann.get("total", "?")
                print(f"✅ items={n_items} total={total}€")
                ok_count += 1

            # ground_truth se guarda como objeto JSON, NO como string
            entry = json.dumps(
                {"image_path": img_path.name, "ground_truth": ann},
                ensure_ascii=False,
            )
            out.write(entry + "\n")
            out.flush()  # checkpoint continuo — si se interrumpe no se pierde nada

            time.sleep(args.delay)

    print(f"\n{'─'*60}")
    print(f"✅ Anotados correctamente: {ok_count}")
    print(f"❌ Errores / inválidos:    {len(errors_log)}")
    print(f"📄 Dataset guardado en:   {output_path}")

    if errors_log:
        errors_path = output_path.parent / "annotate_errors.json"
        with open(errors_path, "w", encoding="utf-8") as f:
            json.dump(errors_log, f, ensure_ascii=False, indent=2)
        print(f"⚠  Log de errores en:     {errors_path}")
        print("\nImágenes con error (revisar manualmente):")
        for e in errors_log:
            print(f"  - {e['image']}: {e.get('error') or e.get('errors')}")


if __name__ == "__main__":
    main()
