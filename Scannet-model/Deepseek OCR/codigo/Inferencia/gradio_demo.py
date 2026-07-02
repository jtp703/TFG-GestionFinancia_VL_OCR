import subprocess, json
subprocess.run(["pip", "install", "gradio", "opencv-python-headless", "-q"], capture_output=True)

import gradio as gr
import torch
import cv2
import numpy as np
import math
import io
import os
from dataclasses import dataclass
from typing import Any
from PIL import Image as PILImage, ImageOps
from torch.nn.utils.rnn import pad_sequence
from deepseek_ocr2.modeling_deepseekocr2 import (
    text_encode,
    BasicImageTransform,
    dynamic_preprocess,
)

# Requiere solo: model, tokenizer (cargados en celda 2)

# ─── Preprocesado H1.5 ────────────────────────────────────────────────────────

def preprocess_ticket(img):
    """Deskew y crop de márgenes blancos."""
    arr = np.array(img.convert("L"))
    _, thresh = cv2.threshold(arr, 200, 255, cv2.THRESH_BINARY_INV)
    coords = np.column_stack(np.where(thresh > 0))
    if len(coords) >= 50:
        angle = cv2.minAreaRect(coords)[-1]
        if angle < -45:
            angle = 90 + angle
        if abs(angle) > 0.5:
            h, w = arr.shape
            M = cv2.getRotationMatrix2D((w // 2, h // 2), angle, 1.0)
            img = PILImage.fromarray(
                cv2.warpAffine(np.array(img), M, (w, h),
                               flags=cv2.INTER_CUBIC,
                               borderMode=cv2.BORDER_REPLICATE)
            )
    arr2 = np.array(img.convert("L"))
    _, thresh2 = cv2.threshold(arr2, 200, 255, cv2.THRESH_BINARY_INV)
    rows = np.any(thresh2 > 0, axis=1)
    cols = np.any(thresh2 > 0, axis=0)
    if rows.any() and cols.any():
        rmin, rmax = np.where(rows)[0][[0, -1]]
        cmin, cmax = np.where(cols)[0][[0, -1]]
        pad = 10
        img = img.crop((
            max(0, cmin - pad), max(0, rmin - pad),
            min(img.width, cmax + pad), min(img.height, rmax + pad)
        ))
    return img

# ─── DataCollator (autocontenido) ─────────────────────────────────────────────

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
        self.bos_id = tokenizer.bos_token_id if tokenizer.bos_token_id is not None else 0

    def deserialize_image(self, image_data):
        if isinstance(image_data, PILImage.Image):
            return ImageOps.exif_transpose(image_data.convert("RGB"))
        elif isinstance(image_data, dict) and 'bytes' in image_data:
            return ImageOps.exif_transpose(PILImage.open(io.BytesIO(image_data['bytes'])).convert("RGB"))
        elif isinstance(image_data, str) and os.path.exists(image_data):
            return ImageOps.exif_transpose(PILImage.open(image_data).convert("RGB"))
        raise ValueError(f"Unsupported image format: {type(image_data)}")

    def process_image(self, image):
        images_list, images_crop_list, images_spatial_crop = [], [], []
        if self.crop_mode:
            # H1.4: dynamic_preprocess para todas las resoluciones
            images_crop_raw, crop_ratio = dynamic_preprocess(
                image, min_num=1, max_num=6,
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
                    img_list, crop_list, spatial_crop, tok_img, _ = self.process_image(images[image_idx])
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
        images_crop = (torch.stack(images_crop_list, dim=0) if images_crop_list
                       else torch.zeros((1, 3, self.base_size, self.base_size), dtype=self.dtype))
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


# ─── Inicializar collator (requiere model y tokenizer de celda 2) ─────────────

inference_collator = DeepSeekOCR2DataCollator(
    tokenizer=tokenizer,
    model=model,
    image_size=768,
    base_size=1024,
    crop_mode=True,
    train_on_responses_only=False,
)

# ─── Prompt y utilidades ──────────────────────────────────────────────────────

UNICODE_FIX = {
    "，": ",", "：": ":", "，": ",",
    "：": ":", "“": '"', "”": '"',
}

def fix_unicode(text):
    for bad, good in UNICODE_FIX.items():
        text = text.replace(bad, good)
    return text

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

# ─── Función de inferencia ────────────────────────────────────────────────────

def predict(image):
    try:
        if image is None:
            return "Sin imagen", "{}"
        if not isinstance(image, PILImage.Image):
            image = PILImage.fromarray(image).convert("RGB")

        image = preprocess_ticket(image)

        sample = {
            "messages": [
                {"role": "<|User|>", "content": PROMPT, "images": [image]},
                {"role": "<|Assistant|>", "content": ""},
            ]
        }
        batch = inference_collator([sample])
        input_ids           = batch["input_ids"].to(model.device)
        attention_mask      = batch["attention_mask"].to(model.device)
        imgs                = [(c.to(model.device, model.dtype), o.to(model.device, model.dtype))
                               for c, o in batch["images"]]
        images_seq_mask     = batch["images_seq_mask"].to(model.device)
        images_spatial_crop = batch["images_spatial_crop"].to(model.device)

        with torch.no_grad():
            outputs = model.generate(
                input_ids=input_ids, attention_mask=attention_mask,
                images=imgs, images_seq_mask=images_seq_mask,
                images_spatial_crop=images_spatial_crop,
                max_new_tokens=4096, do_sample=False, repetition_penalty=1.0,
            )

        response = tokenizer.decode(outputs[0][input_ids.shape[1]:], skip_special_tokens=True)

        try:
            parsed = json.loads(response)
            return "✅ JSON válido", json.dumps(parsed, ensure_ascii=False, indent=2)
        except json.JSONDecodeError:
            fixed = fix_unicode(response.strip())
            try:
                parsed = json.loads(fixed)
                return "✅ JSON válido (unicode fixed)", json.dumps(parsed, ensure_ascii=False, indent=2)
            except json.JSONDecodeError:
                return "❌ JSON inválido", response.strip()

    except Exception as e:
        import traceback
        return f"EXCEPCION: {e}", traceback.format_exc()

# ─── Demo ─────────────────────────────────────────────────────────────────────

demo = gr.Interface(
    fn=predict,
    inputs=gr.Image(label="Sube un ticket"),
    outputs=[
        gr.Textbox(label="Estado"),
        gr.Code(label="JSON extraído", language="json"),
    ],
    title="DeepSeek OCR — Fine-tuned V4 (H1 fixes)",
    flagging_mode="never",
)

demo.launch(share=True)
