# Tests B, C, D, E — Protocolo PLAN_V4.md
# Ejecutar en Colab/RunPod DESPUES de haber cargado model y tokenizer (Paso 2)
# Requiere el collator de paso3_testA.py (o copiar la definicion de DeepSeekOCR2DataCollator)
#
# Imagenes necesarias en el directorio de trabajo:
#   - Test B: test_b_noticket.jpg    (foto de paisaje/retrato, SIN texto de ticket)
#   - Test C: recibo_almeria_079.jpg (ya disponible del Test A)
#   - Test D: recibo_almeria_079.jpg (se recorta automaticamente por script)
#   - Test E: test_e_nuevo_comercio.jpg (ticket de comercio NO visto en entrenamiento)
#
# Uso: !python paso3_testsBCDE.py

import torch
import json
import math
import os
import io
from dataclasses import dataclass
from typing import Any
from PIL import Image, ImageOps
from torch.nn.utils.rnn import pad_sequence
from unsloth import FastVisionModel
from deepseek_ocr2.modeling_deepseekocr2 import (
    format_messages,
    text_encode,
    BasicImageTransform,
    dynamic_preprocess,
)

# ─── DataCollator (copia exacta del fix de Inferencia_V4.md / paso3_testA.py) ─

@dataclass
class DeepSeekOCR2DataCollator:
    tokenizer: Any
    model: Any
    image_size: int = 768
    base_size: int = 1024
    crop_mode: bool = True
    image_token_id: int = 128815
    train_on_responses_only: bool = True

    def __init__(self, tokenizer, model, image_size=768, base_size=1024,
                 crop_mode=True, train_on_responses_only=True):
        self.tokenizer = tokenizer
        self.model = model
        self.image_size = image_size
        self.base_size = base_size
        self.crop_mode = crop_mode
        self.image_token_id = 128815
        self.dtype = model.dtype
        self.train_on_responses_only = train_on_responses_only
        self.image_transform = BasicImageTransform(
            mean=(0.5, 0.5, 0.5), std=(0.5, 0.5, 0.5), normalize=True
        )
        self.patch_size = 16
        self.downsample_ratio = 4
        if hasattr(tokenizer, 'bos_token_id') and tokenizer.bos_token_id is not None:
            self.bos_id = tokenizer.bos_token_id
        else:
            self.bos_id = 0

    def deserialize_image(self, image_data):
        if isinstance(image_data, Image.Image):
            img = image_data.convert("RGB")
        elif isinstance(image_data, dict) and 'bytes' in image_data:
            img = Image.open(io.BytesIO(image_data['bytes'])).convert("RGB")
        elif isinstance(image_data, str) and os.path.exists(image_data):
            img = Image.open(image_data).convert("RGB")
        else:
            raise ValueError(f"Unsupported image format: {type(image_data)}")
        return ImageOps.exif_transpose(img)

    def process_image(self, image):
        images_list, images_crop_list, images_spatial_crop = [], [], []
        if self.crop_mode:
            images_crop_raw = []
            crop_ratio = (1, 1)
            if image.size[0] <= 768 and image.size[1] <= 768:
                images_crop_raw, crop_ratio = dynamic_preprocess(
                    image, min_num=2, max_num=6,
                    image_size=self.image_size, use_thumbnail=False
                )
            global_view = ImageOps.pad(
                image, (self.base_size, self.base_size),
                color=tuple(int(x * 255) for x in self.image_transform.mean)
            )
            images_list.append(self.image_transform(global_view).to(self.dtype))
            width_crop_num, height_crop_num = crop_ratio
            images_spatial_crop.append([width_crop_num, height_crop_num])
            if width_crop_num > 1 or height_crop_num > 1:
                for crop_img in images_crop_raw:
                    images_crop_list.append(self.image_transform(crop_img).to(self.dtype))
            num_queries_base = math.ceil((self.base_size // self.patch_size) / self.downsample_ratio)
            tokenized_image = ([self.image_token_id] * num_queries_base) * num_queries_base
            tokenized_image += [self.image_token_id]
        return images_list, images_crop_list, images_spatial_crop, tokenized_image, crop_ratio

    def process_single_sample(self, messages):
        images = []
        for message in messages:
            if "images" in message and message["images"]:
                for img_data in message["images"]:
                    if img_data is not None:
                        images.append(self.deserialize_image(img_data))
        if not images:
            raise ValueError("No images found in sample.")
        tokenized_str, images_seq_mask = [], []
        images_list, images_crop_list, images_spatial_crop = [], [], []
        prompt_token_count = -1
        assistant_started = False
        image_idx = 0
        tokenized_str.append(self.bos_id)
        images_seq_mask.append(False)
        for message in messages:
            role = message["role"]
            content = message["content"]
            if role == "<|Assistant|>":
                if not assistant_started:
                    prompt_token_count = len(tokenized_str)
                    assistant_started = True
                # Solo añadir EOS si hay contenido real (training).
                # En inferencia el content es "" — no añadir EOS o el modelo reinicia con BOS.
                if content.strip():
                    content = f"{content.strip()} {self.tokenizer.eos_token}"
            text_splits = content.split('<image>')
            for i, text_sep in enumerate(text_splits):
                tokenized_sep = text_encode(self.tokenizer, text_sep, bos=False, eos=False)
                tokenized_str.extend(tokenized_sep)
                images_seq_mask.extend([False] * len(tokenized_sep))
                if i < len(text_splits) - 1:
                    if image_idx >= len(images):
                        raise ValueError("Data mismatch: more <image> tokens than images.")
                    image = images[image_idx]
                    img_list, crop_list, spatial_crop, tok_img, _ = self.process_image(image)
                    images_list.extend(img_list)
                    images_crop_list.extend(crop_list)
                    images_spatial_crop.extend(spatial_crop)
                    tokenized_str.extend(tok_img)
                    images_seq_mask.extend([True] * len(tok_img))
                    image_idx += 1
        if not assistant_started:
            prompt_token_count = len(tokenized_str)
        images_ori = torch.stack(images_list, dim=0)
        images_spatial_crop_tensor = torch.tensor(images_spatial_crop, dtype=torch.long)
        if images_crop_list:
            images_crop = torch.stack(images_crop_list, dim=0)
        else:
            images_crop = torch.zeros((1, 3, self.base_size, self.base_size), dtype=self.dtype)
        return {
            "input_ids": torch.tensor(tokenized_str, dtype=torch.long),
            "images_seq_mask": torch.tensor(images_seq_mask, dtype=torch.bool),
            "images_ori": images_ori,
            "images_crop": images_crop,
            "images_spatial_crop": images_spatial_crop_tensor,
            "prompt_token_count": prompt_token_count,
        }

    def __call__(self, features):
        batch_data = []
        for feature in features:
            try:
                batch_data.append(self.process_single_sample(feature['messages']))
            except Exception as e:
                print(f"Error procesando muestra: {e}")
        if not batch_data:
            raise ValueError("No valid samples in batch")
        input_ids_list = [item['input_ids'] for item in batch_data]
        images_seq_mask_list = [item['images_seq_mask'] for item in batch_data]
        prompt_token_counts = [item['prompt_token_count'] for item in batch_data]
        input_ids = pad_sequence(input_ids_list, batch_first=True, padding_value=self.tokenizer.pad_token_id)
        images_seq_mask = pad_sequence(images_seq_mask_list, batch_first=True, padding_value=False)
        labels = input_ids.clone()
        labels[labels == self.tokenizer.pad_token_id] = -100
        labels[images_seq_mask] = -100
        if self.train_on_responses_only:
            for idx, prompt_count in enumerate(prompt_token_counts):
                if prompt_count > 0:
                    labels[idx, :prompt_count] = -100
        attention_mask = (input_ids != self.tokenizer.pad_token_id).long()
        images_batch = [(item['images_crop'], item['images_ori']) for item in batch_data]
        images_spatial_crop = torch.cat([item['images_spatial_crop'] for item in batch_data], dim=0)
        return {
            "input_ids": input_ids,
            "attention_mask": attention_mask,
            "labels": labels,
            "images": images_batch,
            "images_seq_mask": images_seq_mask,
            "images_spatial_crop": images_spatial_crop,
        }


# ─── Prompt estándar (igual que Test A) ───────────────────────────────────────

PROMPT = """<image>
Extract the following information from the receipt and return it STRICTLY as a valid JSON object matching this structure:

{
  "comercio": "string",
  "cif": "string",
  "fecha": "string",
  "total": "number",
  "items": [{"cantidad": "int", "descripcion": "string", "precio": "number"}]
}

NO other text. ONLY valid JSON.
"""

# ─── Setup de inferencia ───────────────────────────────────────────────────────

FastVisionModel.for_inference(model)

inference_collator = DeepSeekOCR2DataCollator(
    tokenizer=tokenizer,
    model=model,
    image_size=768,
    base_size=1024,
    crop_mode=True,
    train_on_responses_only=False,
)


def run_inference(image: Image.Image) -> tuple[str, bool, dict | None]:
    """Ejecuta inferencia para una imagen. Devuelve (raw_text, json_valid, parsed_or_None)."""
    sample = {
        "messages": [
            {"role": "<|User|>", "content": PROMPT, "images": [image]},
            {"role": "<|Assistant|>", "content": ""},
        ]
    }
    batch = inference_collator([sample])
    input_ids           = batch["input_ids"].to(model.device)
    attention_mask      = batch["attention_mask"].to(model.device)
    images              = [(c.to(model.device, model.dtype), o.to(model.device, model.dtype))
                           for c, o in batch["images"]]
    images_seq_mask     = batch["images_seq_mask"].to(model.device)
    images_spatial_crop = batch["images_spatial_crop"].to(model.device)

    with torch.no_grad():
        outputs = model.generate(
            input_ids           = input_ids,
            attention_mask      = attention_mask,
            images              = images,
            images_seq_mask     = images_seq_mask,
            images_spatial_crop = images_spatial_crop,
            max_new_tokens      = 1024,
            do_sample           = False,
            repetition_penalty  = 1.3,
        )

    response = tokenizer.decode(outputs[0][input_ids.shape[1]:], skip_special_tokens=True)
    try:
        parsed = json.loads(response)
        return response, True, parsed
    except json.JSONDecodeError:
        return response, False, None


# ─── TEST B — Imagen fuera de dominio (no-ticket) ─────────────────────────────

print("\n" + "="*60)
print("TEST B — Imagen fuera de dominio (no-ticket)")
print("="*60)

IMG_B = "test_b_noticket.jpg"

if not os.path.exists(IMG_B):
    print(f"SKIP: {IMG_B} no encontrada. Sube una foto de paisaje o retrato sin texto de ticket.")
else:
    image_b = Image.open(IMG_B).convert("RGB")
    raw_b, valid_b, parsed_b = run_inference(image_b)

    print(f"Tokens generados (aprox): ver output")
    print("Resultado OCR:")
    print(raw_b)

    if valid_b:
        # PASS si los campos clave son nulos/vacios o si el JSON tiene datos no inventados
        campos_nulos = all(
            parsed_b.get(k) in (None, "", "null", "N/A", "unknown")
            for k in ["comercio", "cif", "total"]
        )
        print(f"\n-> JSON válido. Campos nulos/vacíos: {campos_nulos}")
        print(f"   comercio={parsed_b.get('comercio')}, total={parsed_b.get('total')}")
        if campos_nulos:
            print("-> TEST B: PASS (modelo devuelve campos vacíos/null para no-ticket)")
        else:
            print("-> TEST B: FAIL (modelo inventa datos para imagen sin ticket)")
    else:
        # JSON inválido puede ser aceptable si el modelo dice que no es un ticket
        if any(kw in raw_b.lower() for kw in ["not a receipt", "no ticket", "no es", "no receipt", "cannot"]):
            print("-> TEST B: PASS (modelo indica explícitamente que no es un ticket)")
        else:
            print("-> TEST B: FAIL (JSON inválido y sin mensaje de rechazo claro)")
            print(f"   Raw: {raw_b[:300]}")


# ─── TEST C — Consistencia (misma imagen × 5) ─────────────────────────────────

print("\n" + "="*60)
print("TEST C — Consistencia (misma imagen x5)")
print("="*60)

IMG_C = "recibo_almeria_079.jpg"

if not os.path.exists(IMG_C):
    print(f"SKIP: {IMG_C} no encontrada.")
else:
    image_c = Image.open(IMG_C).convert("RGB")
    resultados_c = []

    for i in range(5):
        raw, valid, parsed = run_inference(image_c)
        resultados_c.append({"run": i+1, "valid": valid, "data": parsed, "raw": raw})
        status = "OK" if valid else "FAIL"
        comercio = parsed.get("comercio", "?") if parsed else "INVALID JSON"
        total    = parsed.get("total", "?")    if parsed else "INVALID JSON"
        print(f"  Run {i+1}: {status} | comercio={comercio} | total={total}")

    validos = [r for r in resultados_c if r["valid"]]
    if len(validos) == 5:
        totales   = set(str(r["data"].get("total"))   for r in validos)
        comercios = set(r["data"].get("comercio", "") for r in validos)
        consistent = len(totales) == 1 and len(comercios) == 1
        print(f"\n  Totales únicos: {totales}")
        print(f"  Comercios únicos: {comercios}")
        if consistent:
            print("-> TEST C: PASS (resultados idénticos en 5/5 ejecuciones)")
        else:
            print("-> TEST C: WARN (JSON válido en 5/5 pero con variaciones entre ejecuciones)")
    else:
        print(f"-> TEST C: FAIL ({5 - len(validos)}/5 ejecuciones devolvieron JSON inválido)")


# ─── TEST D — Campo faltante (ticket recortado programáticamente) ──────────────

print("\n" + "="*60)
print("TEST D — Ticket con campo faltante (recorte del 40% inferior)")
print("="*60)

# Se usa recibo_almeria_079.jpg y se recorta el 40% inferior (donde suele estar el total)
IMG_D_BASE = "recibo_almeria_079.jpg"

if not os.path.exists(IMG_D_BASE):
    print(f"SKIP: {IMG_D_BASE} no encontrada.")
else:
    image_d_full = Image.open(IMG_D_BASE).convert("RGB")
    w, h = image_d_full.size
    # Recortar el 40% inferior — elimina la zona de total/subtotal
    image_d_cropped = image_d_full.crop((0, 0, w, int(h * 0.60)))
    image_d_cropped.save("test_d_cropped_preview.jpg")  # guardar para inspección visual
    print(f"  Imagen recortada: {w}x{h} -> {w}x{int(h * 0.60)} (guardada en test_d_cropped_preview.jpg)")

    raw_d, valid_d, parsed_d = run_inference(image_d_cropped)
    print("Resultado OCR:")
    print(raw_d)

    if valid_d:
        total_val = parsed_d.get("total")
        # PASS: total es null/0/vacío (campo no visible en la imagen recortada)
        total_ausente = total_val in (None, 0, "", "null", "N/A")
        print(f"\n  total extraído: {total_val}")
        if total_ausente:
            print("-> TEST D: PASS (modelo devuelve total null/vacío para imagen sin esa zona)")
        else:
            # Comprobación adicional: ¿coincide con el total real del ticket?
            # recibo_almeria_079.jpg es MERCADONA — verificar si inventa o si acertó por casualidad
            print(f"-> TEST D: WARN/FAIL (modelo extrajo total={total_val} de imagen sin zona de total)")
            print("   Verificar manualmente si el valor es inventado o si el total aparecía en otro lugar del ticket.")
    else:
        print(f"-> TEST D: FAIL (JSON inválido)")
        print(f"   Raw: {raw_d[:300]}")


# ─── TEST E — Comercio no visto en entrenamiento ──────────────────────────────

print("\n" + "="*60)
print("TEST E — Ticket de comercio no visto en entrenamiento")
print("="*60)

# Comercios del dataset de entrenamiento (a evitar):
# MERCADONA, GRUPO DIA, SUPER ALCARRO
IMG_E = "test_e_nuevo_comercio.jpg"

if not os.path.exists(IMG_E):
    print(f"SKIP: {IMG_E} no encontrada.")
    print("  Proporciona un ticket de CARREFOUR, LIDL, ALDI, EL CORTE INGLÉS u otro comercio")
    print("  que NO esté en el dataset de entrenamiento (no Mercadona, no DIA, no Alcarro).")
else:
    image_e = Image.open(IMG_E).convert("RGB")
    raw_e, valid_e, parsed_e = run_inference(image_e)

    print("Resultado OCR:")
    print(raw_e)

    COMERCIOS_ENTRENAMIENTO = {"mercadona", "grupo dia", "super alcarro", "dia"}

    if valid_e:
        comercio_extraido = (parsed_e.get("comercio") or "").lower().strip()
        overfitting = any(c in comercio_extraido for c in COMERCIOS_ENTRENAMIENTO)
        print(f"\n  comercio extraído: {parsed_e.get('comercio')}")
        if overfitting:
            print("-> TEST E: FAIL (overfitting — modelo devuelve comercio del dataset de entrenamiento)")
        else:
            print("-> TEST E: PASS (modelo extrae el comercio correcto o deja campo incompleto)")
    else:
        print(f"-> TEST E: FAIL (JSON inválido)")
        print(f"   Raw: {raw_e[:300]}")


# ─── RESUMEN FINAL ─────────────────────────────────────────────────────────────

print("\n" + "="*60)
print("RESUMEN TESTS B-E")
print("="*60)
print("  Test A: PASS (5/5) — documentado en Documentacion/Inferencia_V4.md")
print("  Test B: ver resultado arriba")
print("  Test C: ver resultado arriba")
print("  Test D: ver resultado arriba")
print("  Test E: ver resultado arriba")
print()
print("Criterio de integración (PLAN_V4.md Paso 4):")
print("  A+C pasan + B+D parcialmente -> INTEGRAR en Scannet")
print("  A falla -> NO integrar, requiere V5")
print("  A pasa pero B o D fallan gravemente -> INTEGRAR CON CAUTELA + validación en /api/scan.ts")
