# Test A — Sanidad basica con tickets espanoles del dataset
# Ejecutar en Colab DESPUES de haber cargado model y tokenizer (Paso 2)
# Las 5 imagenes deben estar en el directorio de trabajo de Colab
#
# Uso: !python paso3_testA.py
# (model y tokenizer deben estar en el namespace de la sesion de Colab)

import torch
import math
import json
import os
import io
from dataclasses import dataclass
from typing import Dict, List, Any, Tuple
from PIL import Image, ImageOps
from torch.nn.utils.rnn import pad_sequence
from unsloth import FastVisionModel
from deepseek_ocr2.modeling_deepseekocr2 import (
    format_messages,
    text_encode,
    BasicImageTransform,
    dynamic_preprocess,
)

# ─── DataCollator (igual que Celda G del notebook de entrenamiento) ───────────

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


# ─── Test A ───────────────────────────────────────────────────────────────────

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

IMAGENES = [
    "recibo_almeria_079.jpg",
    "recibo_almeria_110.jpg",
    "recibo_almeria_111.jpg",
    "recibo_almeria_112.jpg",
    "recibo_almeria_114.jpg",
]

FastVisionModel.for_inference(model)

inference_collator = DeepSeekOCR2DataCollator(
    tokenizer=tokenizer,
    model=model,
    image_size=768,
    base_size=1024,
    crop_mode=True,
    train_on_responses_only=False,
)

resultados = []

for img_path in IMAGENES:
    print(f"\n{'='*60}")
    print(f"Imagen: {img_path}")
    image = Image.open(img_path).convert("RGB")

    sample = {
        "messages": [
            {"role": "<|User|>", "content": PROMPT, "images": [image]},
            {"role": "<|Assistant|>", "content": ""},
        ]
    }

    batch = inference_collator([sample])

    input_ids           = batch["input_ids"].to(model.device)
    attention_mask      = batch["attention_mask"].to(model.device)
    images              = [(c.to(model.device, model.dtype), o.to(model.device, model.dtype)) for c, o in batch["images"]]
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
    print(f"Tokens generados: {len(outputs[0]) - input_ids.shape[1]}")
    print("Resultado OCR:")
    print(response)

    # Debug: ver el output completo para detectar si el JSON esta siendo cortado por el offset
    full_output = tokenizer.decode(outputs[0], skip_special_tokens=False)
    print("ULTIMOS 600 CHARS DEL OUTPUT COMPLETO:")
    print(full_output[-600:])

    try:
        parsed = json.loads(response)
        print("-> JSON VALIDO")
        resultados.append({"imagen": img_path, "status": "PASS", "data": parsed})
    except json.JSONDecodeError as e:
        print(f"-> JSON INVALIDO: {e}")
        resultados.append({"imagen": img_path, "status": "FAIL", "raw": response})

print(f"\n{'='*60}")
print("RESUMEN TEST A:")
for r in resultados:
    print(f"  {r['imagen']}: {r['status']}")
