# ============================================================================
# SCRIPT 3: PIPELINE COMPLETO DE EXTRACCIÓN DE RECIBOS
# ============================================================================
# Descripción: Combina Florence-2 (OCR) + LLM fine-tuned (Estructuración)
# Uso: Ejecutar después de entrenar el LLM con llm_structurer_training.py

# ============================================================================
# CELDA 1: INSTALACIÓN DE DEPENDENCIAS
# ============================================================================
print("🔧 Instalando dependencias...")
# !pip install -q transformers==4.46.0
# !pip install -q peft==0.11.1
# !pip install -q torch torchvision pillow

# ============================================================================
# CELDA 2: MONTAR GOOGLE DRIVE
# ============================================================================
from google.colab import drive
drive.mount('/content/drive')

# ============================================================================
# CELDA 3: CARGAR MODELOS
# ============================================================================
from transformers import AutoModelForCausalLM, AutoProcessor, AutoTokenizer
from peft import PeftModel
import torch
from PIL import Image
import json

device = "cuda" if torch.cuda.is_available() else "cpu"

print("🔄 Cargando modelos...")

# --- MODELO 1: Florence-2 para OCR ---
florence_model_id = "microsoft/Florence-2-base"
florence_model = AutoModelForCausalLM.from_pretrained(
    florence_model_id,
    trust_remote_code=True,
    torch_dtype=torch.float16 if device == "cuda" else torch.float32
).to(device)
florence_processor = AutoProcessor.from_pretrained(florence_model_id, trust_remote_code=True)

print("✅ Florence-2 cargado (OCR)")

# --- MODELO 2: LLM fine-tuned para estructuración ---
# IMPORTANTE: Cambia esta ruta a donde guardaste tu modelo entrenado
LLM_MODEL_PATH = "/content/drive/MyDrive/LLM_Structurer_Project/checkpoints/final_model"

# Cargar modelo base
base_model_id = "Qwen/Qwen2.5-1.5B-Instruct"
llm_model = AutoModelForCausalLM.from_pretrained(
    base_model_id,
    device_map="auto",
    torch_dtype=torch.bfloat16,
    trust_remote_code=True
)

# Cargar adaptadores LoRA
llm_model = PeftModel.from_pretrained(llm_model, LLM_MODEL_PATH)
llm_tokenizer = AutoTokenizer.from_pretrained(LLM_MODEL_PATH)

print("✅ LLM Structurer cargado")

# ============================================================================
# CELDA 4: FUNCIÓN DE OCR (Florence-2)
# ============================================================================
def extract_ocr_text(image, task_prompt="<OCR>"):
    """
    Extrae texto de una imagen usando Florence-2.
    
    Args:
        image: PIL.Image o ruta a imagen
        task_prompt: Tarea de Florence-2
    
    Returns:
        str: Texto OCR extraído
    """
    if isinstance(image, str):
        image = Image.open(image).convert("RGB")
    else:
        image = image.convert("RGB")
    
    inputs = florence_processor(
        text=task_prompt,
        images=image,
        return_tensors="pt"
    ).to(device)
    
    with torch.no_grad():
        generated_ids = florence_model.generate(
            **inputs,
            max_new_tokens=1024,
            num_beams=3
        )
    
    generated_text = florence_processor.batch_decode(generated_ids, skip_special_tokens=False)[0]
    
    parsed_answer = florence_processor.post_process_generation(
        generated_text,
        task=task_prompt,
        image_size=(image.width, image.height)
    )
    
    if task_prompt in parsed_answer:
        ocr_text = parsed_answer[task_prompt]
    else:
        ocr_text = str(parsed_answer)
    
    return ocr_text

print("✅ Función extract_ocr_text() definida")

# ============================================================================
# CELDA 5: FUNCIÓN DE ESTRUCTURACIÓN (LLM)
# ============================================================================
def structure_receipt_data(ocr_text, max_new_tokens=1024):
    """
    Estructura el texto OCR en JSON usando el LLM fine-tuned.
    
    Args:
        ocr_text: Texto extraído por OCR
        max_new_tokens: Máximo de tokens a generar
    
    Returns:
        dict: Datos estructurados del recibo
    """
    prompt = f"""Eres un asistente experto en extraer información estructurada de recibos.

Texto OCR del recibo:
{ocr_text}

Extrae la siguiente información en formato JSON:
- store_name: Nombre del comercio
- store_address: Dirección del comercio
- date: Fecha de la compra
- time: Hora de la compra
- items: Lista de productos (cada uno con name, price, quantity)
- subtotal: Subtotal
- total: Total

Responde SOLO con el JSON, sin explicaciones adicionales."""

    conversation = [{"role": "user", "content": prompt}]
    
    formatted_prompt = llm_tokenizer.apply_chat_template(
        conversation,
        tokenize=False,
        add_generation_prompt=True
    )
    
    inputs = llm_tokenizer(formatted_prompt, return_tensors="pt").to(device)
    
    with torch.no_grad():
        outputs = llm_model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            temperature=0.1,
            do_sample=True,
            top_p=0.9
        )
    
    response = llm_tokenizer.decode(outputs[0], skip_special_tokens=True)
    
    # Extraer solo la respuesta del asistente
    if "<|im_start|>assistant" in response:
        response = response.split("<|im_start|>assistant")[-1].strip()
    
    # Intentar parsear como JSON
    try:
        # Buscar el JSON en la respuesta
        json_start = response.find('{')
        json_end = response.rfind('}') + 1
        if json_start != -1 and json_end > json_start:
            json_str = response[json_start:json_end]
            structured_data = json.loads(json_str)
        else:
            structured_data = {"raw_response": response, "error": "No JSON found"}
    except json.JSONDecodeError:
        structured_data = {"raw_response": response, "error": "Invalid JSON"}
    
    return structured_data

print("✅ Función structure_receipt_data() definida")

# ============================================================================
# CELDA 6: PIPELINE COMPLETO
# ============================================================================
def process_receipt(image):
    """
    Pipeline completo: Imagen → OCR → Estructuración JSON
    
    Args:
        image: PIL.Image o ruta a imagen
    
    Returns:
        dict: {
            "ocr_text": str,
            "structured_data": dict
        }
    """
    print("📸 Paso 1: Extrayendo texto con Florence-2...")
    ocr_text = extract_ocr_text(image)
    print(f"✅ Texto extraído ({len(ocr_text)} caracteres)")
    
    print("\n🧠 Paso 2: Estructurando datos con LLM...")
    structured_data = structure_receipt_data(ocr_text)
    print("✅ Datos estructurados")
    
    return {
        "ocr_text": ocr_text,
        "structured_data": structured_data
    }

print("✅ Función process_receipt() definida")

# ============================================================================
# CELDA 7: EJEMPLO DE USO
# ============================================================================
from datasets import load_dataset

print("\n" + "="*70)
print("🧪 PROBANDO PIPELINE COMPLETO")
print("="*70)

# Cargar imagen de ejemplo
ds = load_dataset("naver-clova-ix/cord-v2", split="validation")
test_image = ds[0]['image']

print(f"\n📸 Procesando recibo de prueba...")
result = process_receipt(test_image)

print("\n" + "="*70)
print("📄 TEXTO OCR:")
print("="*70)
print(result["ocr_text"][:500] + "..." if len(result["ocr_text"]) > 500 else result["ocr_text"])

print("\n" + "="*70)
print("📊 DATOS ESTRUCTURADOS:")
print("="*70)
print(json.dumps(result["structured_data"], indent=2, ensure_ascii=False))

# ============================================================================
# CELDA 8: PROCESAMIENTO EN BATCH
# ============================================================================
def process_batch_receipts(images, batch_size=4):
    """
    Procesa múltiples recibos en batch.
    
    Args:
        images: Lista de imágenes PIL o rutas
        batch_size: Tamaño del batch para OCR
    
    Returns:
        List[dict]: Lista de resultados
    """
    results = []
    
    print(f"🔄 Procesando {len(images)} recibos...")
    
    for i, image in enumerate(images):
        print(f"\n--- Recibo {i+1}/{len(images)} ---")
        result = process_receipt(image)
        results.append(result)
    
    return results

print("✅ Función process_batch_receipts() definida")

# Ejemplo de uso en batch
# test_images = [ds[i]['image'] for i in range(5)]
# batch_results = process_batch_receipts(test_images)

print("\n✅ Pipeline completo listo para usar")
print("💡 Usa process_receipt(imagen) para procesar cualquier recibo")
