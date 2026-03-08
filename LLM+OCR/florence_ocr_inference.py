# ============================================================================
# SCRIPT 1: FLORENCE-2 OCR INFERENCE (Pre-entrenado)
# ============================================================================
# Descripción: Extrae texto plano de imágenes de recibos usando Florence-2
# Modelo: microsoft/Florence-2-base (pre-entrenado, sin fine-tuning necesario)
# Uso: Ejecutar en Google Colab

# ============================================================================
# CELDA 1: INSTALACIÓN DE DEPENDENCIAS
# ============================================================================
print("🔧 Instalando dependencias...")
# !pip install -q transformers==4.46.0 torch torchvision pillow

# ============================================================================
# CELDA 2: IMPORTAR LIBRERÍAS Y CONFIGURACIÓN
# ============================================================================
from transformers import AutoModelForCausalLM, AutoProcessor
from PIL import Image
import torch
import json

# Configuración
device = "cuda" if torch.cuda.is_available() else "cpu"
model_id = "microsoft/Florence-2-base"

print(f"🖥️  Dispositivo: {device}")

# ============================================================================
# CELDA 3: CARGAR MODELO FLORENCE-2
# ============================================================================
print(f"🔄 Cargando modelo: {model_id}")

model = AutoModelForCausalLM.from_pretrained(
    model_id,
    trust_remote_code=True,
    torch_dtype=torch.float16 if device == "cuda" else torch.float32
).to(device)

processor = AutoProcessor.from_pretrained(model_id, trust_remote_code=True)

print("✅ Modelo cargado correctamente")
print(f"💾 Tamaño del modelo: ~230M parámetros")
print(f"📊 Uso de VRAM: ~0.5GB (fp16)")

# ============================================================================
# CELDA 4: FUNCIÓN DE OCR
# ============================================================================
def extract_text_from_receipt(image_path_or_pil, task_prompt="<OCR>"):
    """
    Extrae texto de una imagen de recibo usando Florence-2.
    
    Args:
        image_path_or_pil: Ruta a la imagen o objeto PIL.Image
        task_prompt: Prompt de tarea para Florence-2
                     Opciones: "<OCR>", "<OCR_WITH_REGION>", "<DETAILED_CAPTION>"
    
    Returns:
        str: Texto extraído del recibo
    """
    # Cargar imagen
    if isinstance(image_path_or_pil, str):
        image = Image.open(image_path_or_pil).convert("RGB")
    else:
        image = image_path_or_pil.convert("RGB")
    
    # Procesar imagen
    inputs = processor(
        text=task_prompt,
        images=image,
        return_tensors="pt"
    )
    
    # CRÍTICO: Convertir inputs al mismo dtype que el modelo
    # Si el modelo está en float16, los inputs también deben estarlo
    if device == "cuda":
        inputs = {k: v.to(device).to(torch.float16) if v.dtype == torch.float32 else v.to(device) 
                  for k, v in inputs.items()}
    else:
        inputs = {k: v.to(device) for k, v in inputs.items()}
    
    # Generar texto
    with torch.no_grad():
        generated_ids = model.generate(
            **inputs,
            max_new_tokens=1024,
            num_beams=3,
            do_sample=False
        )
    
    # Decodificar resultado
    generated_text = processor.batch_decode(generated_ids, skip_special_tokens=False)[0]
    
    # Extraer solo el texto generado (remover el prompt)
    # Florence-2 devuelve: "<OCR>texto_extraido</s>"
    parsed_answer = processor.post_process_generation(
        generated_text,
        task=task_prompt,
        image_size=(image.width, image.height)
    )
    
    # Extraer el texto del resultado
    if task_prompt in parsed_answer:
        ocr_text = parsed_answer[task_prompt]
    else:
        ocr_text = str(parsed_answer)
    
    return ocr_text

print("✅ Función extract_text_from_receipt() definida")

# ============================================================================
# CELDA 5: EJEMPLO DE USO
# ============================================================================
# Ejemplo 1: Desde archivo local
# image_path = "/content/receipt_example.jpg"
# text = extract_text_from_receipt(image_path)
# print("📄 Texto extraído:")
# print(text)

# Ejemplo 2: Desde dataset
from datasets import load_dataset

print("\n🔄 Cargando dataset CORD-v2 para prueba...")
ds = load_dataset("naver-clova-ix/cord-v2", split="train")

# Probar con la primera imagen
sample_image = ds[0]['image']
print(f"📸 Procesando imagen de ejemplo (tamaño: {sample_image.size})")

extracted_text = extract_text_from_receipt(sample_image)

print("\n" + "="*70)
print("📄 TEXTO EXTRAÍDO DEL RECIBO:")
print("="*70)
print(extracted_text)
print("="*70)

# ============================================================================
# CELDA 6: PROCESAMIENTO EN BATCH (OPCIONAL)
# ============================================================================
def process_batch_receipts(images, batch_size=4):
    """
    Procesa múltiples imágenes en batch para mayor eficiencia.
    
    Args:
        images: Lista de imágenes PIL o rutas
        batch_size: Tamaño del batch
    
    Returns:
        List[str]: Lista de textos extraídos
    """
    results = []
    
    for i in range(0, len(images), batch_size):
        batch = images[i:i+batch_size]
        
        # Cargar imágenes si son rutas
        pil_images = []
        for img in batch:
            if isinstance(img, str):
                pil_images.append(Image.open(img).convert("RGB"))
            else:
                pil_images.append(img.convert("RGB"))
        
        # Procesar batch
        inputs = processor(
            text=["<OCR>"] * len(pil_images),
            images=pil_images,
            return_tensors="pt",
            padding=True
        )
        
        # Convertir al dtype correcto
        if device == "cuda":
            inputs = {k: v.to(device).to(torch.float16) if v.dtype == torch.float32 else v.to(device) 
                      for k, v in inputs.items()}
        else:
            inputs = {k: v.to(device) for k, v in inputs.items()}
        
        with torch.no_grad():
            generated_ids = model.generate(
                **inputs,
                max_new_tokens=1024,
                num_beams=3
            )
        
        # Decodificar resultados
        for idx, gen_id in enumerate(generated_ids):
            text = processor.decode(gen_id, skip_special_tokens=True)
            results.append(text)
    
    return results

print("✅ Función process_batch_receipts() definida")

# Ejemplo de uso en batch
# images = [ds[i]['image'] for i in range(5)]
# texts = process_batch_receipts(images)
# for i, text in enumerate(texts):
#     print(f"\n--- Recibo {i+1} ---")
#     print(text)

print("\n✅ Script de OCR completado y listo para usar")
print("💡 Usa extract_text_from_receipt(imagen) para extraer texto de cualquier recibo")
