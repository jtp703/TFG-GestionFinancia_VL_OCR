# ============================================================================
# SCRIPT 2: LLM STRUCTURER TRAINING (CORD-v2)
# ============================================================================
# Descripción: Fine-tuning de un LLM pequeño para estructurar texto OCR en JSON
# Dataset: CORD-v2 (Consolidated Receipt Dataset)
# Modelo: Qwen2.5-1.5B-Instruct (ligero y eficiente)
# Técnica: LoRA (Low-Rank Adaptation)

# ============================================================================
# CELDA 1: INSTALACIÓN DE DEPENDENCIAS
# ============================================================================
print("🔧 Instalando dependencias...")
# !pip install -q transformers==4.46.0
# !pip install -q peft==0.11.1
# !pip install -q accelerate==0.26.0
# !pip install -q datasets==2.19.0
# !pip install -q bitsandbytes

# ============================================================================
# CELDA 2: MONTAR GOOGLE DRIVE (PARA GUARDAR CHECKPOINTS)
# ============================================================================
from google.colab import drive
import os

drive.mount('/content/drive')

# Crear directorio para checkpoints
CHECKPOINTS_DIR = "/content/drive/MyDrive/LLM_Structurer_Project/checkpoints"
os.makedirs(CHECKPOINTS_DIR, exist_ok=True)
print(f"✅ Checkpoints se guardarán en: {CHECKPOINTS_DIR}")

# ============================================================================
# CELDA 3: CARGAR Y PREPARAR DATASET CORD-v2
# ============================================================================
from datasets import load_dataset
import json
from torch.utils.data import Dataset

print("🔄 Cargando dataset CORD-v2...")
cord_train = load_dataset("naver-clova-ix/cord-v2", split="train")
cord_val = load_dataset("naver-clova-ix/cord-v2", split="validation")

print(f"✅ Dataset cargado:")
print(f"   Train: {len(cord_train)} muestras")
print(f"   Validation: {len(cord_val)} muestras")

# Inspeccionar estructura
print("\n📊 Estructura del dataset:")
print(f"Columnas: {cord_train.column_names}")
print(f"\n📝 Ejemplo de anotación:")
print(json.dumps(cord_train[0]['ground_truth'], indent=2, ensure_ascii=False)[:500])

# ============================================================================
# CELDA 4: CREAR DATASET PERSONALIZADO PARA FINE-TUNING
# ============================================================================
class CORDStructurerDataset(Dataset):
    """
    Dataset que convierte anotaciones CORD en pares (texto_ocr, json_estructurado)
    """
    def __init__(self, hf_dataset, tokenizer, max_length=2048):
        self.dataset = hf_dataset
        self.tokenizer = tokenizer
        self.max_length = max_length
    
    def __len__(self):
        return len(self.dataset)
    
    def __getitem__(self, idx):
        sample = self.dataset[idx]
        
        # Obtener ground truth (anotaciones estructuradas)
        gt = sample['ground_truth']
        
        # Extraer campos relevantes
        structured_data = {}
        
        # Información de la tienda
        if 'store_info' in gt:
            store_info = gt['store_info']
            if 'name' in store_info:
                structured_data['store_name'] = store_info['name']['text']
            if 'address' in store_info:
                structured_data['store_address'] = store_info['address']['text']
        
        # Información de pago
        if 'payment_info' in gt:
            payment = gt['payment_info']
            if 'date' in payment:
                structured_data['date'] = payment['date']['text']
            if 'time' in payment:
                structured_data['time'] = payment['time']['text']
            if 'total' in payment:
                structured_data['total'] = payment['total']['text']
            if 'subtotal' in payment:
                structured_data['subtotal'] = payment['subtotal']['text']
        
        # Items (productos)
        if 'items' in gt:
            items_list = []
            for item in gt['items']:
                item_dict = {}
                if 'name' in item:
                    item_dict['name'] = item['name']['text']
                if 'price' in item:
                    item_dict['price'] = item['price']['text']
                if 'quantity' in item:
                    item_dict['quantity'] = item['quantity']['text']
                if item_dict:
                    items_list.append(item_dict)
            if items_list:
                structured_data['items'] = items_list
        
        # Simular texto OCR (en producción, esto vendría de Florence-2)
        # Por ahora, concatenamos todos los textos del ground truth
        ocr_text = self._extract_all_text(gt)
        
        # Crear prompt para el LLM
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

        # Respuesta esperada (JSON estructurado)
        answer = json.dumps(structured_data, ensure_ascii=False, indent=2)
        
        # Formatear como conversación
        conversation = [
            {"role": "user", "content": prompt},
            {"role": "assistant", "content": answer}
        ]
        
        # Aplicar chat template
        formatted_text = self.tokenizer.apply_chat_template(
            conversation,
            tokenize=False,
            add_generation_prompt=False
        )
        
        # Tokenizar
        tokenized = self.tokenizer(
            formatted_text,
            max_length=self.max_length,
            truncation=True,
            padding="max_length",
            return_tensors="pt"
        )
        
        # Preparar labels (mismo que input_ids para causal LM)
        labels = tokenized["input_ids"].clone()
        labels[labels == self.tokenizer.pad_token_id] = -100
        
        return {
            "input_ids": tokenized["input_ids"].squeeze(0),
            "attention_mask": tokenized["attention_mask"].squeeze(0),
            "labels": labels.squeeze(0)
        }
    
    def _extract_all_text(self, gt_dict, texts=None):
        """Extrae recursivamente todo el texto del ground truth"""
        if texts is None:
            texts = []
        
        if isinstance(gt_dict, dict):
            if 'text' in gt_dict:
                texts.append(gt_dict['text'])
            for value in gt_dict.values():
                self._extract_all_text(value, texts)
        elif isinstance(gt_dict, list):
            for item in gt_dict:
                self._extract_all_text(item, texts)
        
        return " ".join(texts)

print("✅ Clase CORDStructurerDataset definida")

# ============================================================================
# CELDA 5: CARGAR MODELO BASE (Qwen2.5-1.5B)
# ============================================================================
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
import torch

model_id = "Qwen/Qwen2.5-1.5B-Instruct"

print(f"🔄 Cargando modelo: {model_id}")

# Configuración de cuantización 4-bit
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_use_double_quant=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.bfloat16
)

# Cargar modelo
model = AutoModelForCausalLM.from_pretrained(
    model_id,
    quantization_config=bnb_config,
    device_map="auto",
    torch_dtype=torch.bfloat16,
    trust_remote_code=True
)

# Cargar tokenizer
tokenizer = AutoTokenizer.from_pretrained(model_id, trust_remote_code=True)
tokenizer.pad_token = tokenizer.eos_token
tokenizer.padding_side = "right"

print("✅ Modelo y tokenizer cargados")
print(f"💾 Uso de VRAM: ~1.5GB (4-bit)")

# ============================================================================
# CELDA 6: CONFIGURAR LORA
# ============================================================================
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training

print("⚙️  Configurando LoRA...")

# Preparar modelo para k-bit training
model = prepare_model_for_kbit_training(model)

# Configuración LoRA
lora_config = LoraConfig(
    r=16,
    lora_alpha=32,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM"
)

# Inyectar LoRA
model = get_peft_model(model, lora_config)

# Estadísticas
trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
total_params = sum(p.numel() for p in model.parameters())

print(f"✅ LoRA configurado")
print(f"📊 Parámetros entrenables: {trainable_params:,} ({100*trainable_params/total_params:.2f}%)")

# ============================================================================
# CELDA 7: PREPARAR DATASETS
# ============================================================================
print("🔄 Preparando datasets...")

train_dataset = CORDStructurerDataset(cord_train, tokenizer)
val_dataset = CORDStructurerDataset(cord_val, tokenizer)

print(f"✅ Datasets preparados:")
print(f"   Train: {len(train_dataset)} muestras")
print(f"   Validation: {len(val_dataset)} muestras")

# ============================================================================
# CELDA 8: CONFIGURAR ENTRENAMIENTO
# ============================================================================
from transformers import TrainingArguments, Trainer

training_args = TrainingArguments(
    output_dir=CHECKPOINTS_DIR,
    per_device_train_batch_size=1,
    gradient_accumulation_steps=16,
    num_train_epochs=3,
    learning_rate=2e-4,
    fp16=False,
    bf16=True,
    logging_steps=10,
    save_steps=100,
    eval_steps=100,
    evaluation_strategy="steps",
    save_total_limit=3,
    load_best_model_at_end=True,
    report_to="none",
    optim="paged_adamw_32bit",
    gradient_checkpointing=True,
    warmup_steps=50
)

trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=train_dataset,
    eval_dataset=val_dataset
)

print("✅ Trainer configurado")

# ============================================================================
# CELDA 9: ENTRENAR
# ============================================================================
print("\n" + "="*70)
print("🚀 INICIANDO ENTRENAMIENTO")
print("="*70)

trainer.train()

print("\n✅ Entrenamiento completado")

# Guardar modelo final
final_model_path = os.path.join(CHECKPOINTS_DIR, "final_model")
model.save_pretrained(final_model_path)
tokenizer.save_pretrained(final_model_path)

print(f"💾 Modelo guardado en: {final_model_path}")
