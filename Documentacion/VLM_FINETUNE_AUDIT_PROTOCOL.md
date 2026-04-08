# VLM Fine-Tuning Audit Protocol — DeepSeek-VL for Ticket Extraction

## Context

You are auditing a fine-tuned Vision-Language Model (DeepSeek-VL) trained to extract structured data from receipt/ticket images. The model was fine-tuned using approximately 47-130 real ticket images (plus ~400 augmented variants) paired with JSON annotations. Your goal is to determine whether the fine-tuning was executed correctly, whether the model's behavior has been altered in unintended ways, and whether the training artifacts are consistent and reliable.

## Available Files

You have access to:
- **Training notebook** (.ipynb) — contains the fine-tuning code, hyperparameters, and training logic
- **Safetensors files** — the model weights (base and/or adapter weights)
- **JSON annotation files** — ground truth labels paired with each ticket image
- **Ticket images** — the original training images (receipts/tickets)

---

## PHASE 1: Training Notebook Analysis

### 1.1 Hyperparameter Extraction

Locate and report the following values exactly as they appear in the code. If a value is not explicitly set, report "NOT FOUND — using library default" and state what that default likely is.

| Parameter | Expected Healthy Range | Flag If |
|-----------|----------------------|---------|
| `learning_rate` | 1e-5 to 2e-4 | > 5e-4 (risk of catastrophic forgetting) or < 1e-6 (training too slow, may not converge) |
| `num_train_epochs` | 2-5 for <500 samples | > 10 with small dataset (overfitting risk) |
| `per_device_train_batch_size` | 1-8 for VLM fine-tuning | > 16 with small dataset (poor gradient estimation) |
| `weight_decay` | 0.01-0.1 | 0 or absent (no regularization against overfitting) |
| `warmup_steps` or `warmup_ratio` | 5-10% of total steps | 0 or absent (sudden high LR at start can damage pretrained weights) |
| `gradient_accumulation_steps` | 1-8 | Effective batch size (batch_size × accumulation) > dataset size |
| `max_grad_norm` | 0.5-1.0 | Absent (no gradient clipping, risk of training instability) |
| `fp16` or `bf16` | One should be True | Both False on GPU (unnecessary memory usage, slower training) |
| `save_steps` or `save_strategy` | Should save checkpoints | Absent (no recovery if training degrades) |

### 1.2 LoRA / PEFT Configuration

If LoRA or any PEFT method is used, extract:

| Parameter | Expected Healthy Range | Flag If |
|-----------|----------------------|---------|
| `r` (rank) | 8-32 | > 64 with <500 samples (overfitting risk) |
| `lora_alpha` | Typically 2× rank | Ratio alpha/r > 4 or < 0.5 (scaling anomaly) |
| `lora_dropout` | 0.05-0.1 | 0 (no dropout regularization) |
| `target_modules` | Should target attention layers (q_proj, v_proj minimum) | Only targeting 1 module type, or targeting all modules (unnecessary) |
| `task_type` | CAUSAL_LM for decoder models | Incorrect task type for model architecture |

If NO LoRA/PEFT is found, flag as **CRITICAL WARNING**: full fine-tuning of a VLM with <500 samples has extreme overfitting risk and likely caused catastrophic forgetting.

### 1.3 Data Pipeline Verification

Check the training code for:

- **Train/validation split**: Is the dataset split into training and validation sets?
  - Flag as **WARNING** if no validation split exists (no way to detect overfitting during training)
  - Report the split ratio if present (expected: 80-90% train, 10-20% val)

- **Data augmentation code**: Identify what augmentations are applied. Report each transformation found (rotation, brightness, contrast, noise, blur, perspective, crop, etc.)
  - Verify augmentations are applied only to training set, NOT validation set
  - Flag if augmentations are excessively destructive (e.g., rotation > 30°, extreme blur that makes text unreadable)

- **Image preprocessing**: Report any resize, normalization, or format conversion applied
  - Flag if images are resized to very small dimensions (< 224×224) which would destroy text detail
  - Flag if normalization values don't match the base model's expected input range

- **Prompt template**: Extract the exact prompt template used during training (the instruction given to the model alongside each image). Report it verbatim.
  - Flag if the prompt is ambiguous or inconsistent across examples
  - Flag if the prompt doesn't specify the expected output format (JSON structure)

### 1.4 Training Loop Integrity

- **Loss function**: Identify which loss is used. For VLM fine-tuning, cross-entropy on generated tokens is standard.
  - Flag if a custom loss is used without clear justification

- **Optimizer**: Identify the optimizer (AdamW is standard).
  - Flag if SGD is used (suboptimal for fine-tuning transformers)

- **Training logs**: If training loss is logged, extract the loss curve data:
  - Report initial loss, final loss, and any anomalies (sudden spikes, NaN values)
  - Flag if final training loss < 0.01 (likely memorization)
  - Flag if loss shows no decrease (training did not converge)
  - Flag if loss oscillates wildly (learning rate too high or data issues)

- **Evaluation during training**: Is validation loss computed at intervals?
  - If yes, report whether val loss diverges from train loss (overfitting signal)
  - If no, flag as **WARNING**

### 1.5 Output and Save Logic

- How is the final model saved? (merged weights, adapter-only, checkpoint selection)
- Is the best checkpoint selected based on validation performance, or is it simply the last epoch?
  - Flag if last epoch is saved without validation-based selection

---

## PHASE 2: Safetensors Inspection

### 2.1 File Structure

- List all `.safetensors` files found, with their sizes
- Determine if these are: (a) full merged model weights, (b) LoRA adapter weights only, or (c) base model + separate adapter files
- If adapter-only: verify the adapter file size is reasonable (typically 10-200 MB for LoRA r=8-32 on a 7B model). Flag if adapter is suspiciously large (close to full model size)

### 2.2 Weight Statistics

For each safetensors file, run statistical analysis on the tensors. Execute the following logic:

```python
from safetensors import safe_open
import torch

results = {"critical": [], "warnings": [], "info": []}

with safe_open("path/to/model.safetensors", framework="pt") as f:
    for key in f.keys():
        tensor = f.get_tensor(key)
        stats = {
            "name": key,
            "shape": list(tensor.shape),
            "dtype": str(tensor.dtype),
            "mean": tensor.float().mean().item(),
            "std": tensor.float().std().item(),
            "min": tensor.float().min().item(),
            "max": tensor.float().max().item(),
            "has_nan": torch.isnan(tensor).any().item(),
            "has_inf": torch.isinf(tensor).any().item(),
            "zero_pct": (tensor == 0).float().mean().item() * 100
        }
        
        # Critical checks
        if stats["has_nan"]:
            results["critical"].append(f"NaN detected in {key} — training diverged")
        if stats["has_inf"]:
            results["critical"].append(f"Inf detected in {key} — gradient explosion occurred")
        if abs(stats["max"]) > 1000 or abs(stats["min"]) > 1000:
            results["warnings"].append(f"Extreme values in {key}: min={stats['min']:.2f}, max={stats['max']:.2f} — possible LR too high")
        if stats["zero_pct"] > 90:
            results["warnings"].append(f"{key} is {stats['zero_pct']:.1f}% zeros — adapter may not have trained")
        if stats["std"] < 1e-7:
            results["warnings"].append(f"{key} has near-zero variance (std={stats['std']:.2e}) — dead layer")
```

Report:
- Total number of tensors inspected
- Any CRITICAL issues (NaN, Inf)
- Any WARNINGS (extreme values, dead layers, untrained adapters)
- Summary statistics for LoRA-specific layers (layers containing "lora_A" or "lora_B" in the name)

### 2.3 Adapter Consistency (if LoRA)

If LoRA adapters are present:
- Verify that lora_A and lora_B pairs exist for each target module
- Verify the rank dimension is consistent across all adapter pairs (the inner dimension of lora_A should equal the inner dimension of lora_B)
- Report the effective rank being used

---

## PHASE 3: JSON Annotation Audit

### 3.1 Schema Consistency

- Load ALL JSON files and extract the set of keys used in each
- Report: Do all JSONs have the same keys? List any missing or extra keys per file
- Flag files with missing required fields (comercio, descripcion, cantidad, total, fecha)

### 3.2 Value Format Consistency

For each field across all JSONs, analyze value patterns:

**comercio (store name)**:
- List all unique values
- Flag inconsistencies: same store with different spellings (e.g., "MERCADONA" vs "Mercadona" vs "mercadona S.A.")
- Flag if any comercio value looks like it contains non-store data (addresses, dates, etc.)

**fecha (date)**:
- List all unique formats found (DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, etc.)
- Flag if multiple date formats coexist (the model will learn inconsistent output)
- Flag any invalid dates

**total**:
- Report format: numeric only (15.99) vs with currency symbol (15.99€) vs string ("15,99 EUR")
- Flag inconsistencies in decimal separator (comma vs period)
- Flag if any total is negative or zero (likely annotation error)

**cantidad (quantity)**:
- Report if quantities are integers, floats, or strings
- Flag any non-numeric quantities

**descripcion (description)**:
- Report the structure: is it a single product, a list of products, or the full receipt text?
- Flag if descriptions contain data that belongs in other fields (prices in description, etc.)

### 3.3 Image-JSON Alignment

- Verify that every image file has a corresponding JSON and vice versa
- Report any orphaned images (no JSON) or orphaned JSONs (no image)
- Check file naming convention: do image names match JSON names systematically?

### 3.4 Statistical Summary

Report:
- Total number of image-JSON pairs
- Number of unique comercios represented
- Date range covered
- Total value range (min, max, mean)
- Any obvious outliers in numeric fields

---

## PHASE 4: Training Image Quality Assessment

### 4.1 Visual Inspection (sample 10-15 images evenly distributed)

For each sampled image, assess:
- **Resolution**: Report dimensions. Flag if < 640px on shortest side
- **Readability**: Can text be clearly read by a human? Flag illegible images
- **Completeness**: Is the full ticket visible? Flag cropped/cut tickets
- **Orientation**: Is the ticket properly oriented? Flag significantly rotated/skewed images
- **Quality issues**: Note any severe blur, shadows, overexposure, or occlusion

### 4.2 Dataset Diversity

- Report the range of image resolutions across the full dataset
- Report approximate distribution of aspect ratios
- If possible, assess visual diversity: are there tickets from multiple stores, multiple lighting conditions, multiple capture devices?

### 4.3 Augmentation Verification

If augmented images are available separately:
- Verify augmentations produce readable tickets (augmentation shouldn't make text illegible)
- Verify augmented images maintain correct JSON association (augmented image of ticket X still maps to JSON of ticket X)
- Sample 5 augmented images and compare to their originals to verify augmentation quality

---

## PHASE 5: Behavioral Integrity Tests

These tests require loading the fine-tuned model. If the model can be loaded in the current environment, execute these tests. If not, provide the test code as executable scripts.

### 5.1 Sanity Check — General Knowledge Preservation

Send the model a non-ticket prompt (text only, no image):
```
"¿Qué es la fotosíntesis?"
```
- **PASS**: Coherent, relevant answer about photosynthesis
- **FAIL**: Responds with JSON, ticket-related content, or incoherent text
- FAIL indicates catastrophic forgetting of general knowledge

### 5.2 Non-Ticket Image Test

Send the model a non-ticket image (e.g., a landscape, a face, any non-document image) with the ticket extraction prompt.
- **PASS**: Indicates it cannot extract ticket data, or returns empty/null fields
- **FAIL**: Returns fabricated ticket data (hallucinated comercio, total, etc.)
- FAIL indicates severe overfitting — model always produces ticket output regardless of input

### 5.3 Consistency Test

Send the SAME ticket image 5 times with identical prompts.
- **PASS**: All 5 responses are identical or near-identical (minor token variation acceptable)
- **FAIL**: Significant variation across responses (different totals, different comercio names)
- FAIL indicates the model hasn't learned stable extraction patterns

### 5.4 Edge Case — Partial Ticket

Send a ticket image that is intentionally cropped to remove the total or comercio.
- **PASS**: Reports the missing field as null/empty/unknown
- **FAIL**: Fabricates the missing value
- FAIL indicates the model learned to always fill all fields rather than learning genuine extraction

### 5.5 Cross-Format Test

If available, send a ticket from a store/format NOT in the training set.
- **PASS**: Extracts fields correctly or partially with reasonable accuracy
- **FAIL**: Completely fails or outputs training-set store names
- FAIL indicates overfitting to training distribution, limited generalization

---

## PHASE 6: Final Report Structure

Compile findings into the following structure:

```
# VLM Fine-Tuning Audit Report

## Executive Summary
[1-3 sentences: Is the model well-trained, partially compromised, or critically flawed?]

## Critical Issues (must fix before any use)
[List any CRITICAL findings from all phases]

## Warnings (should address for reliability)
[List all WARNING findings]

## Findings by Phase

### Training Configuration
[Hyperparameters table + assessment]

### Model Weights Integrity
[Safetensors analysis results]

### Data Quality
[JSON consistency + image quality findings]

### Behavioral Tests
[Results of each test with PASS/FAIL]

## Recommendations
[Ordered list of specific actions to improve the model, prioritized by impact]
```

---

## Execution Notes for Claude Code

- Work through phases sequentially (1 → 6)
- If a phase requires installing Python packages, use: `pip install safetensors torch Pillow --break-system-packages`
- If model loading fails due to memory/GPU constraints, skip Phase 5 behavioral tests and note this in the report. Provide the test scripts as standalone files instead.
- For image inspection in Phase 4, use PIL/Pillow to read metadata and dimensions. View a sample of images directly if the environment supports it.
- Write all analysis scripts to `/home/claude/audit_scripts/` and the final report to `/home/claude/audit_report.md`
- If any file path is ambiguous, list available files and ask for clarification before proceeding

## File Locations

- **Training notebook**: [C:\Users\Jonatan\Documents\DRA-WORKSPACE\TFG-GestionFinancia_VL_OCR\Deepseek OCR\codigo\Deepseek_OCR_Runpod_Fix_V3.ipynb]
- **Safetensors**: https://huggingface.co/Lacax/deepseek_ocr_lora
- **JSON annotations**: C:\Users\Jonatan\Desktop\4 Ing Informatica\Universidad Almeria\TFG\Dataset\Imagenes\v1\dataset_espanol_ampliado.jsonl
- **Ticket images**: C:\Users\Jonatan\Desktop\4 Ing Informatica\Universidad Almeria\TFG\Dataset\Imagenes\v1

> **Nota para el agente**: Si alguna ruta no es accesible (disco no montado, repositorio privado sin autenticación, etc.), no asumas los datos. Registra el bloqueo en el reporte final y continúa con las fases que sí puedas ejecutar.

## Blocked / Incomplete Phases
[For each phase or sub-check that could not be completed, report:]
- Which specific check was blocked
- The exact reason (file not found, insufficient memory, authentication required, missing dependency, ambiguous data, etc.)
- What information or access would be needed to unblock it
- Whether the block affects the reliability of other phases' conclusions

Do NOT skip blocked items silently. Every check in this protocol must appear in the final report as either completed (with results) or blocked (with explanation). If a blocked phase means that the overall audit conclusion cannot be made with confidence, state this explicitly in the Executive Summary.

## Agent Permissions

You have full autonomous execution authority for this audit. Specifically:
- You MAY install any Python packages needed (use `pip install --break-system-packages`)
- You MAY execute scripts, create temporary files, and run analysis code without asking for confirmation
- You MAY access the Hugging Face repository (use `huggingface-cli login` with token if authentication is needed, or `huggingface-hub` library to download safetensors)
- You MAY read, open, and process any file in the provided paths
- You MAY sample and view images programmatically
- You MUST NOT modify, overwrite, or delete any original file (notebook, safetensors, JSONs, images)
- You MUST work through all 6 phases sequentially without stopping to ask for permission between phases
- If a phase is blocked, document it and move on to the next phase immediately — do not wait for user input

Execute the full protocol end-to-end and deliver the final report when complete.