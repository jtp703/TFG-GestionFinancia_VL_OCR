"""
RunPod Serverless handler — inferencia OCR con Lacax/deepseek_ocr_lora
Pipeline basado en Pruebas_de_inferencia.ipynb (Celda 2 + Celda 3).

IMPORTANTE: usa DeepSeekOCR2DataCollator en lugar de apply_chat_template.
El modelo requiere images, images_seq_mask e images_spatial_crop explícitos.

Entrada (job["input"]):
  - image     : str — imagen en base64 puro (sin prefijo data URL)

Salida:
  - { comercio, cif, fecha, total, items }
  - { error: str, raw?: str } en caso de fallo
"""

import os
import sys
import math
import re
import json
import base64
import io
import runpod
import torch
from PIL import Image, ImageOps
from dataclasses import dataclass
from typing import Any
from torch.nn.utils.rnn import pad_sequence
from huggingface_hub import snapshot_download
from transformers import AutoModel, AutoTokenizer
from peft import PeftModel

sys.path.insert(0, "/app")

# ── Constantes ─────────────────────────────────────────────────────────────────
HF_TOKEN      = os.environ.get("HF_TOKEN")
BASE_MODEL_ID = "unsloth/DeepSeek-OCR-2"   # repo público — sin token
LORA_MODEL_ID = "Lacax/deepseek_ocr_lora"  # repo privado — requiere HF_TOKEN
LOCAL_DIR     = "/app/deepseek_ocr2"

# Prompt exacto de entrenamiento — no modificar sin reentrenar el modelo
PROMPT = """<image>
Extract the following information from the receipt and return it STRICTLY as a valid JSON object matching this structure:

{"comercio": "string", "cif": "string", "fecha": "string", "total": "number", "items": [{"cantidad": "int", "descripcion": "string", "precio": "number"}]}

NO other text. ONLY valid JSON."""

# ── Descarga del modelo base si no está en caché ─────────────────────────────
print("[worker] Verificando modelo base en cache...")
if not os.path.exists(f"{LOCAL_DIR}/config.json"):
    print("[worker] Descargando unsloth/DeepSeek-OCR-2 (primera vez — varios GB)...")
    snapshot_download(BASE_MODEL_ID, local_dir=LOCAL_DIR)
    print("[worker] Descarga completa.")
else:
    print("[worker] Modelo base ya en cache.")

# Importar utilidades del modelo descargado (igual que Celda 3 del notebook)
from deepseek_ocr2.modeling_deepseekocr2 import (
    text_encode,
    BasicImageTransform,
    dynamic_preprocess,
)

# ── Carga del modelo (Celda 2 del notebook) ───────────────────────────────────
print("[worker] Cargando modelo base desde cache local...")
model = AutoModel.from_pretrained(
    LOCAL_DIR,
    trust_remote_code=True,
    torch_dtype=torch.bfloat16,
    device_map="cuda",
)
tokenizer = AutoTokenizer.from_pretrained(LOCAL_DIR, trust_remote_code=True)

print("[worker] Aplicando adaptador LoRA (Lacax/deepseek_ocr_lora)...")
model = PeftModel.from_pretrained(model, LORA_MODEL_ID, token=HF_TOKEN)
model.eval()
print(f"[worker] Modelo listo — dtype={model.dtype}, device={next(model.parameters()).device}")


# ── DataCollator (Celda 3 del notebook — sin modificaciones) ─────────────────
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
        self.bos_id = tokenizer.bos_token_id if (
            hasattr(tokenizer, 'bos_token_id') and tokenizer.bos_token_id is not None
        ) else 0

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
        images_crop = (
            torch.stack(images_crop_list, dim=0) if images_crop_list
            else torch.zeros((1, 3, self.base_size, self.base_size), dtype=self.dtype)
        )
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
        input_ids_list      = [item['input_ids'] for item in batch_data]
        images_seq_mask_list = [item['images_seq_mask'] for item in batch_data]
        prompt_token_counts  = [item['prompt_token_count'] for item in batch_data]
        input_ids      = pad_sequence(input_ids_list, batch_first=True,
                                      padding_value=self.tokenizer.pad_token_id)
        images_seq_mask = pad_sequence(images_seq_mask_list, batch_first=True,
                                       padding_value=False)
        labels = input_ids.clone()
        labels[labels == self.tokenizer.pad_token_id] = -100
        labels[images_seq_mask] = -100
        if self.train_on_responses_only:
            for idx, prompt_count in enumerate(prompt_token_counts):
                if prompt_count > 0:
                    labels[idx, :prompt_count] = -100
        attention_mask  = (input_ids != self.tokenizer.pad_token_id).long()
        images_batch    = [(item['images_crop'], item['images_ori']) for item in batch_data]
        images_spatial_crop = torch.cat(
            [item['images_spatial_crop'] for item in batch_data], dim=0
        )
        return {
            "input_ids": input_ids,
            "attention_mask": attention_mask,
            "labels": labels,
            "images": images_batch,
            "images_seq_mask": images_seq_mask,
            "images_spatial_crop": images_spatial_crop,
        }


# Instanciar el collator una vez (reutilizado en cada petición)
inference_collator = DeepSeekOCR2DataCollator(
    tokenizer=tokenizer,
    model=model,
    image_size=768,
    base_size=1024,
    crop_mode=True,
    train_on_responses_only=False,
)


# ── Normalización del output ──────────────────────────────────────────────────
def normalize_json_string(raw: str) -> str:
    """Normaliza puntuación unicode generada en imágenes degradadas (Test D)."""
    return (
        raw
        .replace("，", ",")
        .replace("：", ":")
        .replace("\u201c", '"')
        .replace("\u201d", '"')
    )


# ── Handler principal ─────────────────────────────────────────────────────────
def handler(job: dict) -> dict:
    job_input = job.get("input", {})
    image_b64 = job_input.get("image")

    if not image_b64:
        return {"error": "No se recibió imagen"}

    # Decodificar imagen
    try:
        image_bytes = base64.b64decode(image_b64)
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception as e:
        return {"error": f"Imagen inválida: {str(e)}"}

    # Preparar sample en el formato del notebook (Celda 3)
    sample = {
        "messages": [
            {"role": "<|User|>", "content": PROMPT, "images": [image]},
            {"role": "<|Assistant|>", "content": ""},
        ]
    }

    try:
        batch = inference_collator([sample])
    except Exception as e:
        return {"error": f"Error preparando inputs: {str(e)}"}

    # Inferencia — igual que Celda 3 del notebook
    try:
        input_ids           = batch["input_ids"].to(model.device)
        attention_mask      = batch["attention_mask"].to(model.device)
        images              = [
            (c.to(model.device, model.dtype), o.to(model.device, model.dtype))
            for c, o in batch["images"]
        ]
        images_seq_mask     = batch["images_seq_mask"].to(model.device)
        images_spatial_crop = batch["images_spatial_crop"].to(model.device)

        with torch.no_grad():
            outputs = model.generate(
                input_ids=input_ids,
                attention_mask=attention_mask,
                images=images,
                images_seq_mask=images_seq_mask,
                images_spatial_crop=images_spatial_crop,
                max_new_tokens=1024,
                do_sample=False,
                repetition_penalty=1.3,
            )

        raw_text = tokenizer.decode(
            outputs[0][input_ids.shape[1]:],
            skip_special_tokens=True
        )
    except Exception as e:
        return {"error": f"Error durante inferencia: {str(e)}"}

    # Extraer y parsear JSON
    json_match = re.search(r"\{[\s\S]*\}", raw_text)
    if not json_match:
        return {"error": "El modelo no devolvió JSON válido", "raw": raw_text}

    try:
        normalized = normalize_json_string(json_match.group(0))
        result = json.loads(normalized)
    except json.JSONDecodeError as e:
        return {"error": f"JSON inválido: {str(e)}", "raw": raw_text}

    # Normalizar tipos (el modelo puede devolver cantidad como string)
    result["items"] = [
        {
            **item,
            "cantidad": int(float(item.get("cantidad", 1))) or 1,
            "precio":   float(item.get("precio", 0)) or 0,
        }
        for item in result.get("items", [])
    ]

    return result


# ── Punto de entrada RunPod ───────────────────────────────────────────────────
runpod.serverless.start({"handler": handler})
