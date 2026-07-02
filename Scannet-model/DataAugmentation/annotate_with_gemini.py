# Anotación automática de tickets con Gemini 2.5 Flash.
# GEMINI_API_KEY en Scannet/.env.local o en el entorno.

import os
import json
import time
import argparse
import re
from pathlib import Path

from google import genai
from PIL import Image


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

PLACEHOLDER_WORDS = {"VARIOS", "N/A", "?", "...", "ILEGIBLE", "TEXTO"}


def validate_annotation(ann: dict) -> tuple[bool, list[str]]:
    if "error" in ann:
        return True, []

    errors = []
    for field in ("comercio", "cif", "fecha", "fecha_original", "total", "items"):
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
                errors.append(f"item[{i}] placeholder: '{desc}'")

            precio = item.get("precio")
            if precio is None:
                errors.append(f"item[{i}] sin precio")
            elif not isinstance(precio, (int, float)):
                errors.append(f"item[{i}] precio no es número")

            cantidad = item.get("cantidad")
            if cantidad is not None and not isinstance(cantidad, (int, float)):
                errors.append(f"item[{i}] cantidad no es número ni null")

    if ann.get("comercio") == "" and ann.get("items") == []:
        errors.append("ticket fantasma: comercio e items vacíos")

    return len(errors) == 0, errors


def _strip_markdown(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"\s*```\s*$", "", text, flags=re.MULTILINE)
    return text.strip()


def annotate_image(client: genai.Client, image_path: Path) -> dict | None:
    img = Image.open(image_path)

    for attempt in range(3):
        try:
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=[img, GOLDEN_PROMPT],
            )
            return json.loads(_strip_markdown(response.text))

        except json.JSONDecodeError as e:
            print(f"    JSON invalido (intento {attempt + 1}/3): {e}")
            if attempt < 2:
                time.sleep(2)

        except Exception as e:
            msg = str(e)
            if "429" in msg or "quota" in msg.lower():
                wait = 30 * (attempt + 1)
                print(f"    rate limit, esperando {wait}s...")
                time.sleep(wait)
            else:
                print(f"    error Gemini (intento {attempt + 1}/3): {e}")
                if attempt < 2:
                    time.sleep(5 * (attempt + 1))

    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--images-dir", type=Path, default=Path("F:/datasetTickets/v3"))
    parser.add_argument("--output", type=Path, default=SCRIPT_DIR / "imagenes" / "dataset_golden.jsonl")
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--delay", type=float, default=1.5)
    parser.add_argument("--start-from", type=int, default=1, metavar="N")
    args = parser.parse_args()

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise SystemExit("GEMINI_API_KEY no encontrada")

    client = genai.Client(api_key=api_key)

    images_dir = args.images_dir
    if not images_dir.is_absolute():
        images_dir = SCRIPT_DIR / images_dir
    if not images_dir.exists():
        raise SystemExit(f"directorio no existe: {images_dir}")

    output_path = args.output
    output_path.parent.mkdir(parents=True, exist_ok=True)

    processed: set[str] = set()
    if args.resume and output_path.exists():
        with open(output_path, encoding="utf-8") as f:
            for line in f:
                try:
                    processed.add(json.loads(line)["image_path"])
                except Exception:
                    pass
        print(f"reanudando: {len(processed)} ya procesadas")

    extensions = {".jpg", ".jpeg", ".png"}
    all_images = sorted(p for p in images_dir.iterdir() if p.suffix.lower() in extensions)

    if args.start_from > 1:
        all_images = all_images[args.start_from - 1:]
        print(f"empezando desde #{args.start_from} ({len(all_images)} restantes)")

    pending = [p for p in all_images if p.name not in processed]
    print(f"total={len(all_images)}  pendientes={len(pending)}  output={output_path}\n")

    errors_log = []
    ok_count = 0

    with open(output_path, "a", encoding="utf-8") as out:
        for idx, img_path in enumerate(pending):
            print(f"[{idx + 1:3d}/{len(pending)}] {img_path.name} ...", end=" ", flush=True)

            ann = annotate_image(client, img_path)

            if ann is None:
                print("fallo gemini")
                errors_log.append({"image": img_path.name, "error": "fallo_gemini"})
                continue

            is_valid, errs = validate_annotation(ann)

            if not is_valid:
                print(f"invalido: {'; '.join(errs)}")
                errors_log.append({"image": img_path.name, "errors": errs, "raw": ann})
                continue

            if "error" in ann:
                print(f"{ann['error']}: {ann.get('motivo', '')}")
            else:
                print(f"items={len(ann.get('items', []))}  total={ann.get('total', '?')}")
                ok_count += 1

            out.write(json.dumps({"image_path": img_path.name, "ground_truth": ann}, ensure_ascii=False) + "\n")
            out.flush()
            time.sleep(args.delay)

    print(f"\nok={ok_count}  errores={len(errors_log)}")

    if errors_log:
        errors_path = output_path.parent / "annotate_errors.json"
        with open(errors_path, "w", encoding="utf-8") as f:
            json.dump(errors_log, f, ensure_ascii=False, indent=2)
        print(f"log de errores: {errors_path}")
        for e in errors_log:
            print(f"  {e['image']}: {e.get('error') or e.get('errors')}")


if __name__ == "__main__":
    main()
