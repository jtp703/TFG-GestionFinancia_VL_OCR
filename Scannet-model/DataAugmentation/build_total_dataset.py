"""
=============================================================================
  BUILD TOTAL DATASET (V6) — pseudo-labels de bbox via OCR.space
  --------------------------------------------------------------
  Lee dataset_golden.jsonl, llama a OCR.space con isOverlayRequired=true para
  cada imagen, localiza la palabra cuyo texto coincide con el `total` del
  ground truth y guarda:
    - dataset_total.jsonl  → {image_path, total, bbox: [x1,y1,x2,y2]}
    - etiquetadas/<img>    → copia de la imagen con el bbox dibujado (verificación visual)

  Uso iterativo (verificar antes de escalar):
    python DataAugmentation/build_total_dataset.py --limit 1     # 1 imagen
    python DataAugmentation/build_total_dataset.py --limit 10    # 10 imágenes
    python DataAugmentation/build_total_dataset.py               # todas (136)

  Requiere OCR_SPACE_API_KEY en Scannet/.env.local o .env.local raíz.
=============================================================================
"""

import argparse
import base64
import json
import os
import re
import sys
import time
from pathlib import Path

import requests
from PIL import Image, ImageDraw, ImageFont

DECIMAL_RE = re.compile(r"^\d+[.,]\d{2}$")

DEFAULT_GOLDEN = Path("DataAugmentation/imagenes/dataset_golden.jsonl")
DEFAULT_IMAGES_DIR = Path(r"F:\datasetTickets\dataset_final\original")
DEFAULT_OUTPUT_DIR = Path(r"F:\datasetTickets\dataset_final\etiquetadas")
DEFAULT_OUTPUT_JSONL = Path("DataAugmentation/imagenes/dataset_total.jsonl")

OCR_URL = "https://api.ocr.space/parse/image"


def load_env_key() -> str:
    """Lee OCR_SPACE_API_KEY desde Scannet/.env.local o .env.local raíz."""
    for path in [Path("Scannet/.env.local"), Path(".env.local")]:
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("OCR_SPACE_API_KEY="):
                key = line.split("=", 1)[1].strip()
                if key:
                    return key
    raise RuntimeError(
        "OCR_SPACE_API_KEY no encontrada en Scannet/.env.local ni .env.local. "
        "Define la key antes de ejecutar."
    )


def total_variants(total: float) -> list[str]:
    """Genera las representaciones plausibles del total para hacer match con OCR words."""
    s = f"{total:.2f}"           # "36.70"
    s_short = f"{total:g}"       # "36.7"
    return list(dict.fromkeys([
        s,
        s.replace(".", ","),     # "36,70"
        s_short,
        s_short.replace(".", ","),
        f"{int(total)}" if total == int(total) else s,
    ]))


def call_ocr_space(image_path: Path, api_key: str, retries: int = 2) -> dict:
    """POST a OCR.space con overlay activado. Reintenta si hay timeout."""
    with image_path.open("rb") as f:
        b64 = base64.b64encode(f.read()).decode("ascii")
    mime = "image/jpeg" if image_path.suffix.lower() in {".jpg", ".jpeg"} else "image/png"
    payload = {
        "apikey": api_key,
        "base64Image": f"data:{mime};base64,{b64}",
        "language": "spa",
        "isOverlayRequired": "true",
        "scale": "true",
        "OCREngine": "2",
    }
    last_err = None
    for attempt in range(retries + 1):
        try:
            resp = requests.post(OCR_URL, data=payload, timeout=180)
            resp.raise_for_status()
            data = resp.json()
            err_msg = data.get("ErrorMessage") or []
            if data.get("IsErroredOnProcessing") and any("Timed out" in m for m in err_msg):
                last_err = "OCR.space E101 timeout"
                time.sleep(2)
                continue
            return data
        except (requests.Timeout, requests.ConnectionError) as e:
            last_err = str(e)
            time.sleep(2)
    raise RuntimeError(f"OCR.space agotó {retries+1} intentos: {last_err}")


TOTAL_KEYWORDS = ("TOTAL", "IMPORTE", "A PAGAR", "TOT.", "T0TAL")
EXCLUDE_KEYWORDS = ("SUBTOTAL", "BASE", "IVA", "B.I.", "BI", "EXENTO", "CUOTA", "TIPO")


def _word_bbox(word: dict) -> list[int]:
    left = word.get("Left", 0)
    top = word.get("Top", 0)
    width = word.get("Width", 0)
    height = word.get("Height", 0)
    return [int(left), int(top), int(left + width), int(top + height)]


def _normalize(text: str) -> str:
    return (text or "").strip().replace("€", "").replace(" ", "").rstrip(".,")


def find_total_bbox(ocr_json: dict, total: float) -> tuple[list[int], str, str] | None:
    """
    Busca el bbox del total con condiciones duras y blandas.

    OCR.space agrupa palabras en "líneas" por proximidad horizontal, así que
    palabras del mismo renglón visual pueden quedar en líneas distintas. Aquí
    agrupamos por **banda Y** (palabras cuyo centro vertical solapa).

    Condiciones DURAS sobre cada candidato:
      - El texto matcheado debe ser decimal con 2 dígitos (X,XX o X.XX).
      - La banda Y debe contener el símbolo €.
      - La banda Y NO debe contener BASE/IVA/CUOTA/EXENTO/SUBTOTAL.

    Score (preferencias blandas) entre candidatos que superan las duras:
      +2.0 si la banda contiene keyword TOTAL/IMPORTE/A PAGAR
      +height_ratio (ratio sobre la altura media de las palabras del ticket,
                     proxy de negrita/destacado)
      -y_norm * 0.5 (los totales suelen estar en la mitad superior del bloque
                     de cifras; pequeña penalización a Y muy bajos)

    Si NINGÚN candidato pasa las duras, fallback con relax progresivo:
      relax-1: ignora el requisito de €
      relax-2: ignora también el de decimal
      relax-3: cualquier match

    Devuelve (bbox, texto_palabra, motivo) o None.
    """
    parsed = ocr_json.get("ParsedResults") or []
    if not parsed:
        return None
    overlay = parsed[0].get("TextOverlay") or {}
    lines = overlay.get("Lines") or []

    variants = total_variants(total)

    all_words = []
    for line in lines:
        for w in line.get("Words") or []:
            text = w.get("WordText") or ""
            top = int(w.get("Top", 0))
            height = int(w.get("Height", 0))
            all_words.append({
                "text": text,
                "upper": text.upper(),
                "bbox": _word_bbox(w),
                "y_center": top + height // 2,
                "y_top": top,
                "y_bot": top + height,
                "height": max(1, height),
            })
    if not all_words:
        return None

    avg_h = sum(w["height"] for w in all_words) / len(all_words)
    band_tol = max(8, int(avg_h * 0.6))
    max_y = max(w["y_bot"] for w in all_words) or 1

    def row_for(target):
        return [w for w in all_words
                if abs(w["y_center"] - target["y_center"]) <= band_tol]

    def is_decimal(text):
        clean = text.strip().replace("€", "").strip()
        return bool(DECIMAL_RE.match(clean))

    candidates = []  # (score, bbox, text, motivo)
    relaxed_no_euro = []
    relaxed_no_decimal = []
    fallback_any = []

    for w in all_words:
        if _normalize(w["text"]) not in variants:
            continue

        row = row_for(w)
        row_text = " ".join(rw["upper"] for rw in row)
        has_exclude = any(kw in row_text for kw in EXCLUDE_KEYWORDS)
        if has_exclude:
            continue

        has_euro = "€" in row_text
        has_total_kw = any(kw in row_text for kw in TOTAL_KEYWORDS)
        decimal_ok = is_decimal(w["text"])

        bbox = w["bbox"]
        height_ratio = w["height"] / avg_h
        y_norm = w["y_center"] / max_y

        if decimal_ok and has_euro:
            score = (2.0 if has_total_kw else 0.0) + height_ratio - 0.5 * y_norm
            candidates.append((score, bbox, w["text"],
                               f"strict (TOTAL_kw={has_total_kw}, h_ratio={height_ratio:.2f})"))
        elif decimal_ok:
            relaxed_no_euro.append((bbox, w["text"], has_total_kw))
        else:
            relaxed_no_decimal.append((bbox, w["text"]))
        fallback_any.append((bbox, w["text"]))

    if candidates:
        candidates.sort(key=lambda c: c[0], reverse=True)
        score, bbox, text, motivo = candidates[0]
        return (bbox, text, f"strict score={score:.2f} | {motivo}")

    if relaxed_no_euro:
        # Si no hay €, prefiere el que sí tenga keyword TOTAL en su banda
        relaxed_no_euro.sort(key=lambda x: (not x[2], x[0][1]))
        bbox, text, _ = relaxed_no_euro[0]
        return (bbox, text, "relax-1: sin €, decimal+sin-excluidos")

    if relaxed_no_decimal:
        relaxed_no_decimal.sort(key=lambda x: x[0][1])
        bbox, text = relaxed_no_decimal[0]
        return (bbox, text, "relax-2: no-decimal sin-excluidos")

    if fallback_any:
        bbox, text = fallback_any[-1]
        return (bbox, text, "relax-3: fallback ultimo match")

    return None


def draw_bbox_on_image(image_path: Path, bbox: list[int], total: float, out_path: Path) -> None:
    """Dibuja el bbox en rojo sobre la imagen y guarda la versión etiquetada."""
    img = Image.open(image_path).convert("RGB")
    draw = ImageDraw.Draw(img)
    x1, y1, x2, y2 = bbox
    draw.rectangle([x1, y1, x2, y2], outline="red", width=4)
    label = f"total={total}"
    try:
        font = ImageFont.truetype("arial.ttf", 18)
    except OSError:
        font = ImageFont.load_default()
    text_y = max(0, y1 - 22)
    draw.text((x1, text_y), label, fill="red", font=font)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path, quality=92)


def main():
    ap = argparse.ArgumentParser(description="Genera dataset total + bbox via OCR.space")
    ap.add_argument("--golden", type=Path, default=DEFAULT_GOLDEN,
                    help="Ruta al dataset_golden.jsonl")
    ap.add_argument("--images-dir", type=Path, default=DEFAULT_IMAGES_DIR,
                    help="Directorio con las imágenes originales")
    ap.add_argument("--out-dir", type=Path, default=DEFAULT_OUTPUT_DIR,
                    help="Directorio donde guardar imágenes etiquetadas")
    ap.add_argument("--out-jsonl", type=Path, default=DEFAULT_OUTPUT_JSONL,
                    help="JSONL de salida con bbox")
    ap.add_argument("--limit", type=int, default=1,
                    help="Procesar solo las N imágenes (default 1 para verificación)")
    ap.add_argument("--offset", type=int, default=0,
                    help="Saltar las N primeras entradas del golden")
    ap.add_argument("--append", action="store_true",
                    help="Anexar al JSONL existente en vez de sobrescribir")
    ap.add_argument("--dump-ocr", type=Path, default=None,
                    help="Volcar el JSON raw de OCR.space a este fichero (debug)")
    ap.add_argument("--sleep", type=float, default=0.5,
                    help="Pausa entre llamadas a OCR.space (segundos)")
    args = ap.parse_args()

    if not args.golden.exists():
        sys.exit(f"❌ No existe {args.golden}")
    if not args.images_dir.exists():
        sys.exit(f"❌ No existe {args.images_dir}")

    api_key = load_env_key()
    print(f"🔑 OCR.space key cargada ({api_key[:6]}…)")
    print(f"📂 Imágenes:  {args.images_dir}")
    print(f"📂 Etiquetadas → {args.out_dir}")
    print(f"📄 Salida JSONL: {args.out_jsonl}\n")

    entries = []
    with args.golden.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            entries.append(json.loads(line))
    sliced = entries[args.offset : args.offset + args.limit]
    print(f"📊 Golden cargado: {len(entries)} entradas. "
          f"Procesando {len(sliced)} (offset={args.offset}, limit={args.limit}).\n")

    args.out_jsonl.parent.mkdir(parents=True, exist_ok=True)
    results = []
    no_match = []
    errors = []

    for i, entry in enumerate(sliced):
        img_name = entry["image_path"]
        gt = entry["ground_truth"]
        total = float(gt["total"])
        img_path = args.images_dir / img_name
        idx_label = f"{i+1+args.offset}/{len(entries)}"

        if not img_path.exists():
            print(f"  [{idx_label}] ❌ No existe imagen: {img_path}")
            errors.append(img_name)
            continue

        print(f"  [{idx_label}] {img_name} (total={total})")
        try:
            ocr = call_ocr_space(img_path, api_key)
        except Exception as e:
            print(f"      ⚠ OCR.space error: {e}")
            errors.append(img_name)
            continue

        if args.dump_ocr is not None:
            args.dump_ocr.parent.mkdir(parents=True, exist_ok=True)
            args.dump_ocr.write_text(json.dumps(ocr, ensure_ascii=False, indent=2),
                                     encoding="utf-8")
            print(f"      🐞 OCR raw → {args.dump_ocr}")

        if ocr.get("IsErroredOnProcessing"):
            print(f"      ⚠ OCR.space respondió error: {ocr.get('ErrorMessage')}")
            errors.append(img_name)
            continue

        match = find_total_bbox(ocr, total)
        if match is None:
            print(f"      ⚠ Total {total} no encontrado en OCR words")
            no_match.append({"image_path": img_name, "total": total})
        else:
            bbox, matched_text, strategy = match
            print(f"      ✅ bbox={bbox} (texto OCR='{matched_text}', estrategia={strategy})")
            results.append({
                "image_path": img_name,
                "total": total,
                "bbox": bbox,
                "strategy": strategy,
            })
            etiquetada_path = args.out_dir / img_name
            draw_bbox_on_image(img_path, bbox, total, etiquetada_path)
            print(f"      💾 etiquetada → {etiquetada_path}")

        time.sleep(args.sleep)

    mode = "a" if args.append else "w"
    with args.out_jsonl.open(mode, encoding="utf-8") as f:
        for r in results:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    print("\n" + "─" * 60)
    print(f"✅ Matcheados:   {len(results)}")
    print(f"⚠  Sin match:    {len(no_match)}")
    print(f"❌ Errores OCR:  {len(errors)}")
    print(f"📄 Resultados → {args.out_jsonl}")
    if no_match:
        print("\nSin match (revisar manualmente):")
        for nm in no_match:
            print(f"  - {nm['image_path']}  (total={nm['total']})")
    if errors:
        print("\nErrores:")
        for e in errors:
            print(f"  - {e}")


if __name__ == "__main__":
    main()
