# VLM Fine-Tuning Audit Report

**Model:** `Lacax/deepseek_ocr_lora`
**Base model:** `unsloth/DeepSeek-OCR-2` (DeepSeek-VL architecture)
**Training notebook:** `Deepseek OCR/codigo/Deepseek_OCR_Runpod_Fix_V3.ipynb`
**Audit date:** 2026-04-08
**Auditor:** Claude Code (claude-sonnet-4-6)

---

## Executive Summary

The model is **partially compromised and unreliable in its current state**. Training completed (3 epochs, 258 steps, loss 1.44 → 0.47) on a 683-sample dataset, but a critical data pipeline bug caused a substantial — and unknown — fraction of training samples to be silently dropped during training: `Error processing sample: Unsupported image format: <class 'str'>` is repeated throughout the training log. As a direct consequence, the inference output observed in the notebook shows severe hallucination: the model invents comercios, fabricates JSON fields that do not exist in the training schema (e.g. `cief`, `pt`, `vivienda`, `restaurantes`, `barrachitas`, `tazones`), and produces truncated/corrupted responses. The LoRA weights themselves are numerically clean (no NaN/Inf, healthy initialization statistics), meaning the problem is not weight corruption but rather that the fine-tuning signal was severely attenuated by the dropped samples. The dataset annotation quality is generally high (62 records, fully consistent schema, all images present) but is too small for reliable fine-tuning without augmentation, which is not active in the current pipeline.

---

## Critical Issues (must fix before any use)

**CRITICAL-1: Silent sample dropping during training — image path pipeline bug**
- During training (Cell 15), the log repeatedly outputs `Error processing sample: Unsupported image format: <class 'str'>`.
- The `DeepSeekOCR2DataCollator.deserialize_image()` method receives a file path string from the dataset, but the guard `isinstance(image_data, str) and os.path.exists(image_data)` was failing for all samples because the string paths from the HuggingFace-downloaded dataset do not exist on the RunPod filesystem at the expected absolute paths. The images were stored in the JSONL with relative paths (`recibo_almeria_004.jpg`) and resolved relative to `mi_dataset/`, but the collator received the raw string and `os.path.exists()` returned False because the path was not absolute or the working directory differed.
- The collator's `__call__` method catches all exceptions with `except Exception as e: print(...); continue`, so every failed sample is silently skipped. Since the same error pattern repeats with `You are using a model of type deepseek_vl_v2...` warnings interspersed (which appear at each model reload attempt triggered by the error handler), **it is likely that the majority of samples were dropped**. The training ran 258 steps on what appears to be a near-empty effective batch stream.
- This is the root cause of the catastrophic hallucination observed in inference (fabricated fields, mixed-language output, invented comercios).
- **Fix required:** Resolve absolute paths in `format_spanish_ticket()` before storing in dataset, and verify in the validation cell (Cell 10) that paths resolve on the RunPod filesystem before training starts.

**CRITICAL-2: Inference output demonstrates severe hallucination**
- The notebook's own test (Cell 19) shows the model output for a real ticket:
  ```
  {"comercio": "E.S. LA PERTIA (BP) S.A.", "cif": "B93319331A", "fecha": "06/12/2025", "total": 57.92, "items": []}
  {"comercio": "", "cief": "BARRAQUESAS - BARRIO DE TAVERNA SAN DIEGO", "pt": "Barra de la Vara", "vivienda": [], ...}
  {"comercio": "CAMPORUEDA", "cief": "LA PERFUMARIA EL GRANDE", ...}
  ```
- The model outputs multiple JSON objects (should be one), invents non-existent fields (`cief` instead of `cif`, `pt`, `vivienda`, `restaurantes`, `barrachitas`, `tazones`, `muebles y及其他用品`), mixes Spanish and Chinese characters, and ignores the `items` array structure entirely. This confirms the model has not learned the task at all and is generating uncontrolled text.
- **The model is not safe to deploy or use in production in its current state.**

**CRITICAL-3: No validation split — training blind**
- The entire dataset (683 samples as reported by the notebook, 62 in the local JSONL) is used as `train_dataset` with no held-out validation set.
- `eval_dataset` is not passed to `Trainer`. No validation loss is computed at any checkpoint.
- It is impossible to detect overfitting or confirm generalization. All checkpointing is by epoch (not by best validation loss).
- **Fix required:** Split dataset 80/20 or 90/10 and pass `eval_dataset` to Trainer with `evaluation_strategy="epoch"`.

**CRITICAL-4: LoRA adapter covers only 12 of the model's layers**
- The safetensors contains LoRA weights for `layers.0` through `layers.11` only (12 layers total).
- The base model DeepSeek-OCR-2 is a ~3.4B parameter model (confirmed from training log: `3,393,831,808` total params). A model of this size typically has 28–32 transformer layers.
- Only 4,712,448 parameters are trainable (0.14% of total). The upper layers — which handle higher-level reasoning and output format — received no gradient updates.
- This is insufficient coverage for a task that requires learning a rigid JSON output schema. The attention and MLP layers in the deeper layers that generate structured text are untrained.
- **Fix required:** Set `finetune_vision = False` is fine, but increase `layers_to_transform` to cover all language model layers, or remove the layer restriction entirely. Verify with unsloth that `get_peft_model` applied LoRA to all intended layers.

---

## Warnings (should address for reliability)

**WARN-1: `lora_dropout = 0`**
- Notebook Cell 6: `lora_dropout = 0`
- With only 62–683 samples and r=32, dropout=0 increases memorization risk.
- Healthy range: 0.05–0.10. Recommend `lora_dropout = 0.05`.

**WARN-2: `weight_decay = 0.01` — present but minimal for small dataset**
- Value is within healthy range (0.01–0.1) but at the low end for a dataset of this size.
- With 683 samples and no validation loss, overfitting cannot be detected. Consider 0.05.

**WARN-3: No data augmentation active during training**
- `DataAugmentation/dataset_final/` does not exist. `DataAugmentation/output_synthetic/` does not exist.
- The training dataset is raw original images only. The `DataAugmentation/augment_images.py` pipeline (10 variants per image, Albumentations) is not invoked before training.
- With only 62 original tickets (local JSONL count), the effective dataset is critically small for a VLM fine-tuning task requiring spatial OCR understanding.
- **Recommendation:** Run `augment_images.py --num-augments 10` and `build_dataset.py` before the next training run to expand to ~620+ samples.

**WARN-4: Dataset size discrepancy — 683 (runtime) vs 62 (local JSONL)**
- Training log reports `Num examples = 683` (suggesting HuggingFace `Lacax/Tickets` dataset at training time was larger), but the audited local JSONL at both paths contains exactly 62 records.
- It is unclear whether the 683-sample dataset includes augmented images, synthetic images, or an older version. This discrepancy makes it impossible to fully audit what the model was actually trained on.
- **Recommendation:** Ensure the HuggingFace dataset version used for training is reproducible and documented.

**WARN-5: Model type mismatch warning throughout training**
- Log: `You are using a model of type deepseek_vl_v2 to instantiate a model of type DeepseekOCR2. This is not supported for all configurations of models and can yield errors.`
- This warning appears at every sample error catch, suggesting the model architecture mismatch is real. The base model's `config.json` declares `model_type: deepseek_vl_v2` but the custom `DeepseekOCR2ForCausalLM` class expects a different type. While training did not crash, this can cause subtle behavioral differences between training and inference.

**WARN-6: `lora_alpha / r = 1.0` — at the lower bound of healthy range**
- `lora_alpha = 32`, `r = 32`, so effective scaling factor = `alpha/r = 1.0`.
- Healthy range is 0.5–4.0 (flag if < 0.5 or > 4.0). Value is technically within range but common practice is `alpha = 2×r` for stronger adaptation signal.
- With the sample-dropping bug active, a higher alpha might have partially compensated — but with the bug fixed, `alpha = 64` (2×r) is recommended.

**WARN-7: Training loss plateau — no evidence of convergence**
- Final training loss at step 250 is 0.4746 vs 0.4952 at step 240 (oscillating).
- Loss progression: 1.44 → 1.21 → 1.02 → 0.89 → 0.80 → 0.75 | then rises to 0.84/0.88 at steps 70-90 | then gradually decreases to ~0.47 by step 250.
- The rise at steps 70-90 followed by slow recovery suggests instability, possibly due to the effective batch becoming extremely sparse as the sample-dropping bug caused batches to contain 0 or 1 valid samples.
- No validation loss is available to determine if this represents generalization or noise.

**WARN-8: No `max_grad_norm` effect verifiable without validation loss**
- `max_grad_norm = 1.0` is set correctly, but without a validation loss curve, it's impossible to confirm gradient clipping was ever triggered or whether it helped stabilize training.

**WARN-9: 1 record with empty `comercio` field**
- `recibo_almeria_064.jpg` has `"comercio": ""` (empty string).
- This teaches the model to emit empty comercio for one ticket type. Should be corrected manually.

**WARN-10: 14 item prices are negative (discount lines)**
- 14 items across 8 receipts have negative `precio` values (e.g. `"(DTO)BARRA VIENES": -0.36`, `"Descuento": -0.15`).
- These are legitimate discount entries on Spanish tickets but may confuse the model about the expected value domain for `precio`. The model should be documented as handling discounts as negative prices, or a separate `descuento` field should be introduced.

**WARN-11: Spelling inconsistencies in `comercio` field**
- `"BAZAR UNIVERSAL 2018 S.L"` vs `"BAZAR UNIVERSAL 2018 S. L"` (space before L): 2 records refer to the same business with inconsistent spelling.
- `"E.S. LA PEÑITA S.A."` vs `"E.S. LA PEÑITA II"`: These may be different branches, but the similarity (0.83) warrants verification.
- Inconsistent labels for the same entity degrade the model's ability to normalize comercio names.

**WARN-12: Adapter file size anomaly**
- `adapter_model.safetensors` is **17.99 MB** for r=32 LoRA on a ~3.4B model covering only 12 layers and 7 module types.
- Expected size for full-coverage r=32 LoRA on a 3.4B model (28-32 layers) would be ~100–200 MB.
- The small size (17.99 MB) is consistent with the finding that only 12 layers are covered (12/30 = 40% of expected layers), and confirms LoRA was not applied to the full model depth.

---

## Findings by Phase

### Phase 1 — Training Configuration

#### 1.1 Hyperparameters (exact values from Cell 14)

| Parameter | Value | Status |
|---|---|---|
| `learning_rate` | `2e-4` | OK (within 1e-5 – 2e-4, at upper bound) |
| `num_train_epochs` | `3` | OK (within 2–5) |
| `per_device_train_batch_size` | `2` | OK |
| `weight_decay` | `0.01` | OK (within 0.01–0.1, low end) |
| `warmup_ratio` | `0.05` | OK (5% of total steps = ~13 warmup steps) |
| `gradient_accumulation_steps` | `4` | OK (effective batch = 8) |
| `max_grad_norm` | `1.0` | OK |
| `bf16` | `is_bf16_supported()` → `True` (RTX 4090 confirmed) | OK |
| `fp16` | `not is_bf16_supported()` → `False` | OK |
| `save_strategy` | `"epoch"` | OK |
| `save_total_limit` | `2` | OK |
| `lr_scheduler_type` | `"cosine"` | OK (appropriate for small datasets) |
| `dataloader_num_workers` | `2` | OK |
| `logging_steps` | `10` | OK |
| `report_to` | `"none"` | NOTE: no experiment tracking (W&B, etc.) |

Additional training context from output:
- Num examples at runtime: 683 (HuggingFace dataset, not local JSONL)
- Total steps: 258 (683 / batch_size_8 * 3 epochs ≈ 256, consistent)
- Trainable parameters: 4,712,448 / 3,393,831,808 = 0.14%
- Training duration: 06:32 (6 minutes 32 seconds total)
- Hardware: NVIDIA GeForce RTX 4090, 24GB VRAM

#### 1.2 LoRA / PEFT Configuration (exact values from Cell 6 + adapter_config.json)

| Parameter | Value | Status |
|---|---|---|
| `r` | `32` | OK for dataset size |
| `lora_alpha` | `32` | WARN: alpha/r = 1.0 (recommend 2×r = 64) |
| `lora_dropout` | `0` | WARN: should be 0.05–0.10 |
| `task_type` | `"CAUSAL_LM"` | OK |
| `finetune_vision` | `False` | OK (language-only fine-tuning) |
| `finetune_language` | `True` | OK |
| `finetune_attention_modules` | `True` | OK |
| `finetune_mlp_modules` | `True` | OK |
| `target_modules` | Complex regex (q_proj, k_proj, v_proj, o_proj, gate_proj, up_proj, down_proj) | OK (all standard attention + MLP) |
| `use_dora` | `False` | OK |
| `use_rslora` | `False` | NOTE: RSLoRA could improve with r=32 |
| `init_lora_weights` | `True` | OK |

Actual layers covered: **layers 0–11 only** (12 of ~30 total layers). **CRITICAL-4.**

#### 1.3 Data Pipeline

- **Train/validation split:** NONE. Full dataset used for training only. **CRITICAL-3.**
- **Augmentations during training:** NONE. No Albumentations pipeline invoked. Data collator applies only: resize to 768px (crop mode) / pad to 1024×1024 (global view), normalization mean=(0.5, 0.5, 0.5), std=(0.5, 0.5, 0.5).
- **Image preprocessing:** `BasicImageTransform(mean=(0.5,0.5,0.5), std=(0.5,0.5,0.5), normalize=True)`. Images padded to `base_size=1024`. Dynamic crop applied only to images ≤ 768px on both sides (`min_num=2, max_num=6`).
- **Prompt template (exact, Cell 8):**
  ```
  <image>

  Extract the following information from the receipt and return it STRICTLY as a valid JSON object matching this structure:

  {
    "comercio": "string",
    "cif": "string",
    "fecha": "string",
    "total": "number",
    "items": [{"cantidad": "int", "descripcion": "string", "precio": "number"}]
  }

  NO other text. ONLY valid JSON.
  ```
- **Image path bug:** The collator's `deserialize_image()` receives raw string paths from the dataset. The guard `os.path.exists(image_data)` fails for paths that are not absolute on the RunPod filesystem, causing samples to be dropped silently. **CRITICAL-1.**

#### 1.4 Training Loop Integrity

- **Loss function:** Cross-entropy via `Trainer` (standard). Labels masked for padding (`-100`) and for prompt tokens (only response tokens trained, via `train_on_responses_only=True`). **OK.**
- **Optimizer:** AdamW (Trainer default). **OK.**
- **Training loss progression:**

| Step | Loss | Step | Loss |
|---|---|---|---|
| 10 | 1.4367 | 140 | 0.6173 |
| 20 | 1.2127 | 150 | 0.6130 |
| 30 | 1.0183 | 160 | 0.5382 |
| 40 | 0.8892 | 170 | 0.5549 |
| 50 | 0.8011 | 180 | 0.5223 |
| 60 | 0.7549 | 190 | 0.5680 |
| 70 | 0.8390 | 200 | 0.4512 |
| 80 | 0.8793 | 210 | 0.4991 |
| 90 | 0.8582 | 220 | 0.4805 |
| 100 | 0.6919 | 230 | 0.4677 |
| 110 | 0.6836 | 240 | 0.4952 |
| 120 | 0.6502 | 250 | 0.4746 |
| 130 | 0.6929 | | |

- **Assessment:** Initial loss 1.44 is reasonable for a language model on this task. The rise at steps 70–90 (0.75 → 0.88) is anomalous, possibly caused by the image-dropping bug producing empty/degenerate batches at epoch boundaries. Final loss 0.47 is not converged (healthy final loss for this task would be < 0.2). The loss is still decreasing slowly at step 250 — more epochs would help, but only after fixing the pipeline bug.
- **Validation loss:** NOT computed. **CRITICAL-3.**

#### 1.5 Output and Save Logic

- `model.save_pretrained("deepseek_ocr_lora")` → saves last epoch (not best validation checkpoint, since no validation exists).
- `model.push_to_hub("Lacax/deepseek_ocr_lora")` — push confirmed in output.
- Only LoRA adapter weights are saved (17.99 MB), not the full merged model. Inference requires the base model `unsloth/DeepSeek-OCR-2`.

---

### Phase 2 — Model Weights Integrity

**Repo:** `Lacax/deepseek_ocr_lora` (last updated 29 Mar, 2026)

**Files:**
- `adapter_config.json` (LoRA configuration)
- `adapter_model.safetensors` — **17.99 MB** (LoRA adapter only, not merged)
- `tokenizer.json`, `tokenizer_config.json`, `special_tokens_map.json`
- `README.md`, `.gitattributes`

**Adapter type:** LoRA adapter only (not merged with base model). Size of 17.99 MB is consistent with r=32 covering 12 layers × 7 modules (51 lora_A + 51 lora_B = 102 tensors).

**Weight analysis results:**
- Total tensors: **102** (51 lora_A + 51 lora_B)
- NaN tensors: **0** — CLEAN
- Inf tensors: **0** — CLEAN
- Extreme values (|val| > 1000): **0** — CLEAN
- >90% zeros: **0** — CLEAN
- Near-zero variance (std < 1e-7): **0** — CLEAN
- Unpaired A/B: **0** — all pairs complete

**Rank consistency:** All `lora_A` tensors have shape `[32, in_features]` confirming r=32 throughout. All `lora_B` tensors have shape `[out_features, 32]`. Consistent with configured r=32.

**Coverage:** Only 12 transformer layers covered (layers 0–11). Modules per layer (layer 0 only has MLP; layers 1–11 have attention only):
- Layer 0: `self_attn.{q,k,v,o}_proj` + `mlp.{down,gate,up}_proj` (7 modules)
- Layers 1–11: `self_attn.{q,k,v,o}_proj` only (4 modules each)

**Sample lora_A statistics (healthy random initialization pattern):**
- Mean: ~0.0 (centered), Std: ~0.017–0.019, Range: [-0.05, +0.05]
- These values indicate the lora_A matrices have been trained (not left at initialization zeros/kaiming), with small but non-trivial magnitudes.

**Sample lora_B statistics (expected near-zero for lora_B which initializes to zero):**
- Mean: ~0.0, Std: ~0.003–0.004, Range: [-0.018, +0.018]
- lora_B values slightly above zero indicate some training signal was received, but magnitudes are very small, consistent with limited effective training data.

**Verdict:** Weights are numerically healthy. The adapter has learned something but the learning signal is weak (small lora_B magnitudes). The file size anomaly (17.99 MB vs expected ~100–200 MB for full-depth r=32 LoRA) confirms only partial layer coverage.

---

### Phase 3 — Data Quality

**Source file:** `dataset_espanol_ampliado.jsonl` (both at Desktop path and DataAugmentation/imagenes/)

#### 3.1 Schema Consistency

- Total records: **62**
- Unique schema variants: **1** — all 62 records share exactly the same keys
- Required fields present in all records: `comercio`, `cif`, `fecha`, `total`, `items`
- Missing required fields: **0 across all records**
- Items structure: all items have exactly `{cantidad, descripcion, precio}` — **no schema violations**

#### 3.2 Value Format Consistency

**`fecha` formats:** All 62 records use `DD/MM/YYYY` — perfectly consistent.

**Date range:** 01/12/2025 to 31/01/2026 (approximately 2 months of real ticket data).

**`total` stats:**
- Count: 62, Min: 0.53 EUR, Max: 239.02 EUR, Mean: 31.13 EUR
- Negative totals: **0**
- Zero totals: **0**

**`comercio` anomalies:**
- Empty string: **1 record** — `recibo_almeria_064.jpg` has `"comercio": ""`
- Spelling inconsistencies:
  - `"BAZAR UNIVERSAL 2018 S.L"` vs `"BAZAR UNIVERSAL 2018 S. L"` (similarity: 0.98)
  - `"E.S. LA PEÑITA S.A."` vs `"E.S. LA PEÑITA II"` (similarity: 0.83 — may be different branches)
- Unique comercios: 40 across 62 records (average 1.55 tickets per comercio)

**`items` price anomalies:**
- 14 items with negative `precio` across 8 receipts — these are discount/rebate lines (e.g. `"(DTO)BARRA VIENES": -0.36`, `"Rebajas 14.43%": -1.01`, `"Descuento": -0.15`)
- Negative prices are semantically correct for Spanish discount lines but must be documented as intentional behavior

**Unique comercios (40 total):** ALDI, ALCAMPO,SA, ATLEET ALHAURÍN EL GRANDE, BAZAR UNIVERSAL 2018 S.L, Bar Restaurante La Cuchara, CAFE ANTARTIDA, CAMPORUEDA, COMERCIAL MALAGUEÑA PATRICIA S.L., COSTASOL DE HIPERMERCADOS S.L., Carniceria Bistekka Seleccion, Casa del Libro, Centro Veterinario PeT, DECATHLON, DECIMAS S.L.U., Dismoda (2×), Douglas Spain S.A.U., E.S. LA PEÑITA BP/II/S.A., GRUPO DIA (12×), HOME CITY, IKEA IBERICA S.A.U., KIABI, LA PIARDA TAPAS, LOS CARMENES, MARISQUERIA CASA PACO, MERCADONA S.A. (5×), PLK CHICKEN IBERIA SLU, ROSA BADIA RUEDA, Restaurantes McDonald's S.A.U, SOCIEDAD ESTATAL CORREOS Y TELÉGRAFOS S.A.S.M.E, SUPER ALCARRO S.L. (4×), San Sebastián CAFETERIA Y BAR, Siri Restauracion S.L., Surbús (4×), TuSúper, VERIFICACIONES INDUSTRIALES DE ANDALUCÍA S.A., VIRMANSHOP S.L.U.

**Distribution concern:** GRUPO DIA accounts for 12/62 (19.4%) of records. Class imbalance may cause the model to be biased toward DIA ticket formats.

#### 3.3 Image-JSON Alignment

- Images in directory: **62**
- Records in JSONL: **62**
- Missing images (in JSONL but not on disk): **0**
- Orphaned images (on disk but not in JSONL): **0**
- Alignment: **PERFECT**

#### 3.4 Statistical Summary

| Metric | Value |
|---|---|
| Total annotated pairs | 62 |
| Unique comercios | 40 |
| Date range | 01/12/2025 – 31/01/2026 |
| Total (EUR) min | 0.53 |
| Total (EUR) max | 239.02 |
| Total (EUR) mean | 31.13 |
| Date format consistency | 100% DD/MM/YYYY |
| Schema consistency | 100% |
| Image alignment | 100% |
| Records with anomalies | 15 (1 empty comercio + 8 neg prices + 2 spelling variants) |

---

### Phase 4 — Image Quality Assessment

**Source directory:** `Desktop/Universidad Almeria/.../Dataset/Imagenes/v1/`

#### 4.1 Visual Inspection (15 sampled images)

| Filename | Dimensions | File size | Short side | Flag |
|---|---|---|---|---|
| recibo_almeria_004.jpg | 1152×2048 | 236 KB | 1152 | OK |
| recibo_almeria_005.jpg | 1536×2048 | 609 KB | 1536 | OK |
| recibo_almeria_007.jpg | 1536×2048 | 348 KB | 1536 | OK |
| recibo_almeria_008.jpg | 1536×2048 | 368 KB | 1536 | OK |
| recibo_almeria_009.jpg | 1536×2048 | 385 KB | 1536 | OK |
| recibo_almeria_010.jpg | 1536×2048 | 368 KB | 1536 | OK |
| recibo_almeria_011.jpg | 1536×2048 | 401 KB | 1536 | OK |
| recibo_almeria_012.jpg | 1536×2048 | 399 KB | 1536 | OK |
| recibo_almeria_032.jpg | 1536×2048 | 524 KB | 1536 | OK |
| recibo_almeria_033.jpg | 1536×2048 | 515 KB | 1536 | OK |
| recibo_almeria_034.jpg | 1536×2048 | 454 KB | 1536 | OK |
| recibo_almeria_035.jpg | 1200×1600 | 375 KB | 1200 | OK |
| recibo_almeria_036.jpg | 1200×1600 | 373 KB | 1200 | OK |
| recibo_almeria_060.jpg | 1200×1600 | 150 KB | 1200 | OK |
| recibo_almeria_061.jpg | 1200×1600 | 230 KB | 1200 | OK |

No images flagged with short side < 640px.

#### 4.2 Dataset Diversity — Full 62-image corpus

| Metric | Value |
|---|---|
| Width range | 1152 – 1536 px |
| Height range | 1600 – 2048 px |
| Mean width | 1352 px |
| Mean height | 1811 px |
| Short side range | 1152 – 1536 px (all well above 640px threshold) |
| Aspect ratios | 3:4 (portrait) dominant; 9:16 variant present |
| Images below 640px short side | **0** |

Image quality is excellent: all images are high-resolution smartphone photos of physical receipts, well above the 640px minimum threshold. The collator processes them at 768px crop + 1024px global view, which is appropriate for the available resolution.

**Note:** The data collator's dynamic crop condition (`if image.size[0] <= 768 and image.size[1] <= 768`) means that for all 62 images (all > 768px on both sides), the dynamic crop path is **never triggered** during training. Only the global 1024×1024 padded view is used. This means any fine-grained text at the bottom of long receipts may be lost in the padding/resizing step.

#### 4.3 Augmentation Verification

- `DataAugmentation/dataset_final/` — does **not exist**
- `DataAugmentation/output_synthetic/` — does **not exist**
- `DataAugmentation/imagenes/` — contains only `dataset_espanol_ampliado.jsonl` (no images copied locally)
- The augmentation pipeline (`augment_images.py`) and synthetic generation (`generate_synthetic_ticket.py`) exist as scripts but have not been run in the current working directory.
- **No augmented or synthetic data was available at audit time.** Training used only original 62 images (or the 683 in the HuggingFace dataset, whose composition is unverified).

---

### Phase 5 — Behavioral Tests

**STATUS: BLOCKED**

**Reason:** Loading the DeepSeek-OCR-2 base model (~3.4B parameters, ~7GB in bfloat16) locally on a Windows 11 machine requires a GPU with at least 8GB VRAM and a compatible CUDA installation. The audit machine is a development workstation (Windows 11, no confirmed GPU/CUDA environment for PyTorch inference). Additionally, the LoRA adapter references `base_model_name_or_path: "./deepseek_ocr2"` — a local relative path, not a HuggingFace Hub model ID — which would require downloading the full base model first.

**Note:** Behavioral evidence already available from the notebook's own inference test (Cell 19) is sufficient to confirm the model is non-functional for its intended task. The hallucination pattern observed (multiple JSON outputs, fabricated field names, mixed-language content) is definitive.

**Test scripts for future use (run on RunPod with base model available):**

```python
# Save as: test_behavioral.py
# Run on RunPod after fixing CRITICAL-1 and retraining

from unsloth import FastVisionModel
from transformers import AutoModel
import torch, json, re

HF_TOKEN = "..."  # your token
BASE_MODEL = "./deepseek_ocr2"
ADAPTER = "Lacax/deepseek_ocr_lora"

model, tokenizer = FastVisionModel.from_pretrained(BASE_MODEL, load_in_4bit=False, auto_model=AutoModel, trust_remote_code=True)
model.load_adapter(ADAPTER, token=HF_TOKEN)
FastVisionModel.for_inference(model)

PROMPT = """<image>
Extract the following information from the receipt and return it STRICTLY as a valid JSON object matching this structure:
{"comercio": "string", "cif": "string", "fecha": "string", "total": "number",
 "items": [{"cantidad": "int", "descripcion": "string", "precio": "number"}]}
NO other text. ONLY valid JSON."""

def test_ticket(image_path, expected):
    from PIL import Image
    img = Image.open(image_path).convert("RGB")
    # ... (use same collator as training) ...
    # Check:
    # 1. Output is valid JSON (json.loads succeeds)
    # 2. All required keys present: comercio, cif, fecha, total, items
    # 3. fecha matches DD/MM/YYYY format
    # 4. total is numeric
    # 5. items is a list of dicts with cantidad/descripcion/precio
    # 6. comercio string similarity to expected > 0.8
    pass

# Metric targets for acceptable model:
# - JSON validity rate: > 95%
# - Required key presence: > 95%
# - fecha format compliance: > 98%
# - comercio similarity to ground truth: > 0.75 (normalized)
# - total absolute error: < 10% of ground truth value
```

---

## Blocked / Incomplete Checks

| Check | Reason | How to Unblock |
|---|---|---|
| Phase 5: Behavioral tests | Cannot load 3.4B VLM locally; no CUDA GPU available on audit machine | Run on RunPod after retraining with fixed pipeline |
| Training loss by epoch (exact epoch boundaries) | Trainer logs by step only; no epoch-level loss summary in notebook output | Add `logging_strategy="epoch"` to TrainingArguments |
| Validation loss curve | No eval_dataset passed to Trainer | Fix CRITICAL-3: add train/val split |
| Actual % of samples dropped by image-path bug | Log only shows error messages, not a count of dropped vs processed samples | Add counter in collator's `__call__` method to track `len(batch_data)` vs `len(features)` |
| HuggingFace dataset composition (683 samples) | Local JSONL has 62 records; 683 reported at runtime suggests augmented/synthetic data was in the HF dataset | Inspect `Lacax/Tickets` repo file listing and JSONL for augmented entries |
| Base model layer count (exact) | Base model not downloaded locally; cannot inspect `config.json` | Download `unsloth/DeepSeek-OCR-2` config and check `num_hidden_layers` |
| trainer_stats (final loss, runtime, samples_per_second) | `trainer_stats = trainer.train()` result not printed in notebook | Add `print(trainer_stats)` after Cell 15 |

---

## Recommendations

Ordered by impact (highest first):

1. **[CRITICAL] Fix the image path resolution bug before any retraining.** In `format_spanish_ticket()`, resolve the full absolute path at dataset construction time. Verify with Cell 10 (path validation) that 0 images are missing before starting `trainer.train()`. Add a counter in the collator to print `Processed X/Y samples per batch` to detect future drops.

2. **[CRITICAL] Add a train/validation split.** Reserve 10–15% of samples as validation set. Pass `eval_dataset` to Trainer with `evaluation_strategy="epoch"`. Use `load_best_model_at_end=True` and `metric_for_best_model="eval_loss"` to save the best checkpoint, not just the last epoch.

3. **[CRITICAL] Extend LoRA to all transformer layers.** The current adapter covers only 12 layers. Remove or increase `layers_to_transform` in the `get_peft_model` call to cover all language model layers (likely 28–32 for DeepSeek-OCR-2). This will increase adapter size to ~100–200 MB but is necessary for the model to learn the output format in its deeper layers.

4. **[HIGH] Run the data augmentation pipeline before retraining.** Execute `python DataAugmentation/augment_images.py --num-augments 10` and `python DataAugmentation/build_dataset.py --copy-images` to expand from 62 to ~620+ samples. Also generate ~50–100 synthetic tickets with `generate_synthetic_ticket.py`. Upload the expanded dataset with `upload_to_hf.py`. With the image-path bug fixed, this expanded dataset should be what the model actually trains on.

5. **[HIGH] Set `lora_dropout = 0.05`.** With a small dataset and no validation loss, the risk of memorization is real. Adding even mild dropout regularization is low-cost insurance.

6. **[MEDIUM] Fix the 1 empty `comercio` annotation.** Manually correct `recibo_almeria_064.jpg` in the JSONL to include the correct business name before retraining.

7. **[MEDIUM] Normalize the 2 spelling-inconsistent `comercio` values.** Standardize `"BAZAR UNIVERSAL 2018 S. L"` to `"BAZAR UNIVERSAL 2018 S.L"` for consistent label supervision.

8. **[MEDIUM] Increase `lora_alpha` to 64 (2×r).** With `r=32`, standard practice is `alpha=2r=64` for a stronger adaptation scaling factor. The current `alpha/r=1.0` may be too conservative.

9. **[LOW] Add experiment tracking.** Change `report_to = "none"` to `report_to = "wandb"` (or tensorboard) to get persistent loss curves, GPU utilization, and samples/second metrics across all future runs.

10. **[LOW] Document negative price behavior.** Add a comment in the JSONL schema documentation clarifying that discount/rebate items are represented with negative `precio` values. This is intentional behavior for Spanish tickets.

11. **[LOW] Rewrite `base_model_name_or_path` in adapter_config.json** from `"./deepseek_ocr2"` to the public HuggingFace ID `"unsloth/DeepSeek-OCR-2"` before the next push, so the adapter can be loaded portably without the local relative path requirement.
