# Informe de Auditoría de Fine-Tuning VLM — DeepSeek-OCR V4

> **Fecha de auditoría:** 09/04/2026
> **Modelo auditado:** `Lacax/deepseek_ocr_lora` (fine-tune de `unsloth/DeepSeek-OCR-2` con LoRA)
> **Notebook fuente:** `Deepseek OCR/codigo/Deepseek_OCR_Runpod_Fix_V4_Ejecutado.ipynb`
> **Auditor:** Claude Sonnet 4.6 (análisis automatizado)

---

## Resumen Ejecutivo

El fine-tuning V4 introduce mejoras estructurales significativas respecto a V3 (split de validación, cobertura LoRA completa, gestión de checkpoints por val_loss) y el proceso de entrenamiento completó correctamente las 3 épocas sin errores. Sin embargo, **la prueba de inferencia ejecutada dentro del propio notebook es un fallo crítico**: el modelo no genera JSON válido para la imagen de prueba, sino contenido alucinado en italiano con formato markdown. Antes de integrar el modelo con Scannet es imprescindible realizar un ciclo de pruebas sistemático con imágenes de tickets españoles y confirmar si el fallo se debe a la imagen de prueba elegida (poco representativa) o a una incapacidad generalizada del modelo. La configuración de entrenamiento en sí es correcta y bien diseñada.

---

## Problemas Críticos (deben resolverse antes de cualquier uso en producción)

| # | Problema | Fase | Detalle |
|---|----------|------|---------|
| C1 | **Inferencia no produce JSON válido** | Fase 5 | El modelo generó contenido alucinado en italiano con formato markdown (tablas, negritas) en lugar de JSON estructurado. Test 1 (JSON válido) → FALLIDO |
| C2 | **Imagen de prueba no es un ticket español** | Fase 5 | `recibo.jpg` parece corresponder a "Massimo Dutti S.A.S." con texto italiano, haciendo la prueba de inferencia no representativa del dominio de entrenamiento |

---

## Advertencias (deben atenderse para garantizar fiabilidad)

| # | Advertencia | Fase | Detalle |
|---|-------------|------|---------|
| W1 | **Pérdida de entrenamiento muy baja (0.0399)** | Fase 1 | Valor inferior al umbral de alerta (0.05). Riesgo de memorización. Debe contrastarse con val_loss |
| W2 | **Val_loss no registrado en el output** | Fase 1 | La celda I no muestra la pérdida de validación al finalizar. No es posible confirmar si hubo divergencia train/val en esta ejecución |
| W3 | **1 registro con comercio vacío en el dataset** | Fase 3 | Un ticket sin nombre de comercio en el JSONL puede enseñar al modelo a producir cadenas vacías |
| W4 | **Inconsistencias de capitalización en comercios** | Fase 3 | "BAZAR UNIVERSAL 2018 S. L" vs "BAZAR UNIVERSAL 2018 S.L"; mezcla de mayúsculas/minúsculas en otros nombres |
| W5 | **Inspección de safetensors bloqueada** | Fase 2 | Los pesos están en HF (`Lacax/deepseek_ocr_lora`) y no fueron descargados para análisis estadístico de tensores |
| W6 | **Inspección visual de imágenes de entrenamiento bloqueada** | Fase 4 | Las imágenes base residen en una ruta del Escritorio no accesible programáticamente en esta sesión |

---

## Hallazgos por Fase

### Fase 1 — Configuración de Entrenamiento

#### 1.1 Hiperparámetros

| Parámetro | Valor configurado | Rango saludable | Estado |
|-----------|-------------------|-----------------|--------|
| `learning_rate` | `2e-4` | 1e-5 a 2e-4 | ✅ En el límite superior pero válido |
| `num_train_epochs` | `3` | 2-5 para <500 muestras | ✅ Correcto |
| `per_device_train_batch_size` | `1` | 1-8 para VLM | ✅ Correcto |
| `gradient_accumulation_steps` | `8` → batch efectivo = 8 | 1-8 | ✅ Correcto |
| `weight_decay` | `0.01` | 0.01-0.1 | ✅ Correcto |
| `warmup_ratio` | `0.05` (≈ 5% de 231 pasos = ~11 pasos) | 5-10% pasos totales | ✅ Correcto |
| `max_grad_norm` | `1.0` | 0.5-1.0 | ✅ Correcto |
| `bf16` | `True` (soportado por RTX 4090) | Uno de bf16/fp16 = True | ✅ Correcto |
| `save_strategy` | `"epoch"`, `save_total_limit=3` | Debe guardar checkpoints | ✅ Correcto |
| `eval_strategy` | `"epoch"` | Debe evaluar | ✅ Correcto |
| `load_best_model_at_end` | `True`, métrica `eval_loss` | Selección por validación | ✅ Correcto |

**Estadísticas de entrenamiento registradas:**

| Métrica | Valor |
|---------|-------|
| Duración total | 4607 s (~77 min) |
| Muestras/segundo | 0.40 |
| **Pérdida final (train)** | **0.0399 ⚠️** |
| Épocas completadas | 3.0 |
| Pasos totales | 231 |

> **Evaluación:** La pérdida de entrenamiento final de 0.0399 está por debajo del umbral de alerta (<0.05). Esto puede indicar memorización, especialmente con un dataset de solo ~613 muestras de entrenamiento. Sin embargo, el uso de `load_best_model_at_end=True` mitiga el riesgo si el val_loss divergió antes de llegar al mínimo de train_loss. **La val_loss no aparece en la salida de la celda I**, lo que impide confirmar esto.

---

#### 1.2 Configuración LoRA / PEFT

| Parámetro | Valor | Rango saludable | Estado |
|-----------|-------|-----------------|--------|
| `r` (rango) | `32` | 8-32 | ✅ Correcto |
| `lora_alpha` | `64` (2× rango) | Típicamente 2×r | ✅ Correcto |
| `lora_dropout` | `0.05` | 0.05-0.1 | ✅ Correcto |
| `target_modules` | `q_proj, k_proj, v_proj, o_proj, gate_proj, up_proj, down_proj` (7 módulos) | Capas de atención mínimo | ✅ Amplia cobertura |
| `task_type` | `CAUSAL_LM` (implícito vía PEFT) | CAUSAL_LM para decoders | ✅ Correcto |
| Parámetros entrenables | 172,615,680 / 3,561,735,040 (4.85%) | 2-10% del modelo | ✅ Correcto |
| Capas cubiertas por LoRA | 24 capas (0→23), cobertura completa | Todas las capas | ✅ Correcto |

> **Nota técnica V4:** Se usó `peft.get_peft_model()` directamente en lugar de `FastVisionModel.get_peft_model()` para evitar la limitación de 12 capas que aparecía en V3 con modelos MoE. La cobertura de 24 capas verificada en Celda D confirma que el fix funcionó.

---

#### 1.3 Pipeline de Datos

- **Split entrenamiento/validación:** 90% train / 10% val → 613 muestras entrenamiento, ~69 validación. ✅ Correcto.
- **Augmentación:** Las imágenes augmentadas provienen del pipeline `DataAugmentation/augment_images.py` y están precargadas en el dataset `Lacax/Tickets`. No hay augmentación aplicada en tiempo de entrenamiento, lo que es correcto (augmentación separada del entrenamiento).
- **Preprocesamiento de imagen:** `image_size=768`, `base_size=1024`, `crop_mode=True`. Resolución adecuada para tickets (texto legible). ✅ Correcto.
- **Plantilla de instrucción:** Inglés, especifica formato JSON estricto con los campos `comercio`, `cif`, `fecha`, `total`, `items`. Consistente en todas las muestras. ✅ Correcto.
  ```
  <image>
  Extract the following information from the receipt and return it STRICTLY as a valid JSON object...
  NO other text. ONLY valid JSON.
  ```
- **Validación de imágenes (Celda F):** 682/682 imágenes encontradas antes de entrenar. ✅ Sin imágenes faltantes.
- **Número total de pares imagen-JSON usados:** 682 (base + augmentadas).

---

#### 1.4 Integridad del Bucle de Entrenamiento

- **Función de pérdida:** Cross-entropy implícita sobre tokens generados (estándar Trainer de HuggingFace). ✅ Correcto.
- **Optimizador:** AdamW (por defecto en `TrainingArguments`). ✅ Correcto.
- **Curva de pérdida:** Solo disponible la pérdida final (0.0399). No se capturaron los valores por paso ni la val_loss por época en la salida del notebook.
- **Evaluación durante el entrenamiento:** Configurada (`eval_strategy="epoch"`), pero los valores no aparecen impresos en la celda I. ⚠️ No confirmable en este análisis.

---

#### 1.5 Guardado del Modelo

- **Método:** `model.save_pretrained("deepseek_ocr_lora")` → adaptador LoRA únicamente (no pesos fundidos).
- **Selección de checkpoint:** `load_best_model_at_end=True` con métrica `eval_loss`. ✅ Guarda el mejor checkpoint, no el último.
- **Subida a HuggingFace:** Repositorio `Lacax/deepseek_ocr_lora`. Actualizado el 09/04/2026. ✅ Confirmado.
- **Fix V4-H aplicado:** `base_model_name_or_path` corregido a `"unsloth/DeepSeek-OCR-2"` en `adapter_config.json`. ✅ El adaptador es cargable desde cualquier máquina.

---

### Fase 2 — Inspección de Safetensors

**Estado: PARCIALMENTE BLOQUEADA**

- Los pesos están publicados en `https://huggingface.co/Lacax/deepseek_ocr_lora` (actualizado 09/04/2026).
- Tags confirmados: `safetensors`, `unsloth`, `arxiv:1910.09700` (LoRA paper).
- No se realizó descarga local para análisis estadístico de tensores (NaN, Inf, valores extremos, capas muertas).

**Estimación teórica del tamaño del adaptador:**
- LoRA r=32, 7 módulos × 24 capas en modelo ~3.5B parámetros → 172.6M parámetros entrenables.
- Tamaño esperado del adaptador: ~345 MB (172.6M params × 2 bytes en bf16). Dentro del rango normal para un adaptador LoRA de este rango.

**Para desbloquear esta fase:** Ejecutar en Google Colab el script de inspección de safetensors del protocolo con `huggingface_hub` para descargar y analizar los pesos. Ver PLAN_V4.md, Paso 1.

---

### Fase 3 — Auditoría de Anotaciones JSON

#### 3.1 Consistencia del Esquema

- **Total de registros analizados:** 62 (dataset base `dataset_espanol_ampliado.jsonl`)
- **Errores de parseo:** 0 ✅
- **Campos presentes en todos los registros:** `comercio`, `cif`, `fecha`, `total`, `items` ✅

| Campo | Faltantes | Vacíos | Estado |
|-------|-----------|--------|--------|
| `comercio` | 0 | **1** | ⚠️ 1 registro sin nombre |
| `cif` | 0 | **11** | Aceptable (algunos comercios no imprimen CIF) |
| `fecha` | 0 | 0 | ✅ |
| `total` | 0 | 0 | ✅ |
| `items` | 0 | 0 | ✅ |

#### 3.2 Consistencia de Valores

**Comercios (39 únicos en 62 registros):**
- Inconsistencia detectada: `"BAZAR UNIVERSAL 2018 S. L"` vs `"BAZAR UNIVERSAL 2018 S.L"` (espacio extra antes del punto).
- Mezcla de convenciones de capitalización: `"MERCADONA, S.A."` (mayúsculas) vs `"Bar Restaurante La Cuchara"` (capitalización de título) vs `"TuSúper"` (camelCase).
- Distribución muy asimétrica: `"GRUPO DIA"` con 12 instancias, muchos comercios con solo 1.

**Fechas:** Formato uniforme `DD/MM/YYYY` en todos los registros. ✅ Sin inconsistencias.

**Totales:** Rango 0.53€ – 239.02€, media 31.13€. Sin negativos ni ceros. ✅ Correcto.

#### 3.3 Alineación Imagen-JSON

- **Nota:** Las 682 imágenes de entrenamiento (base + augmentadas) residen en el dataset HuggingFace `Lacax/Tickets` y fueron validadas en Celda F con resultado 682/682 coincidencias. ✅
- Inspección local de la carpeta `DataAugmentation/imagenes/` devuelve solo 1 archivo (el JSONL). Las imágenes base están en la ruta del Escritorio (no accesible en esta sesión).

#### 3.4 Resumen Estadístico

| Métrica | Valor |
|---------|-------|
| Pares imagen-JSON en JSONL base | 62 |
| Pares totales en entrenamiento (base + aug) | 682 |
| Comercios únicos | 39 |
| Formatos de fecha | 1 (DD/MM/YYYY) |
| Rango de totales | 0.53€ – 239.02€ |
| Media de totales | 31.13€ |

---

### Fase 4 — Calidad de Imágenes de Entrenamiento

**Estado: BLOQUEADA**

- Las imágenes base se encuentran en `C:\Users\Jonni\Desktop\...\v1` (ruta de escritorio no accesible en esta sesión).
- Las imágenes de entrenamiento augmentadas están en el dataset HuggingFace privado `Lacax/Tickets`.

**Lo que sí se conoce:**
- La imagen de prueba de inferencia (`recibo.jpg`) tenía dimensiones 1152×2048 px. Resolución excelente para OCR de texto. ✅
- Las 682 imágenes de entrenamiento fueron aceptadas sin errores por el DataCollator (todos los lotes muestran "1/1 muestras OK"). Sugiere que las resoluciones son adecuadas para el preprocesamiento configurado (768/1024 px). ✅

**Para desbloquear esta fase:** Ejecutar script de inspección con PIL en Google Colab cargando el dataset desde HF. Ver PLAN_V4.md, Paso 2.

---

### Fase 5 — Tests de Integridad de Comportamiento

Tests ejecutados en la Celda K y L del notebook (RunPod, imagen `/workspace/recibo.jpg`):

#### Test 5.1 — Sanidad General (conocimiento no-ticket)

**Estado: NO EJECUTADO** — No se probó con prompt de texto sin imagen. Pendiente en Plan V4.

#### Test 5.2 — Imagen no-ticket

**Estado: NO EJECUTADO** — Pendiente en Plan V4.

#### Test 5.3 — Inferencia con ticket real (Celda K)

**Imagen usada:** `recibo.jpg` (1152×2048 px) — aparentemente un ticket de Massimo Dutti con texto en italiano.

**Resultado:**
```
54321**Massimo Dutti S.A.S.** (00109304F) - C.F.: I92401586A**
  [... contenido alucinado en italiano con tablas markdown ...]
```

**Evaluación: FALLIDO — CRÍTICO**
- El modelo no respeta el formato JSON solicitado.
- Genera texto libre en italiano con tablas markdown, campos en italiano y cifras inventadas.
- La respuesta comienza con `54321` (posible artefacto de tokenización o prefijo de contexto).
- No está claro si el fallo se debe a (a) la imagen de prueba no perteneciente al dominio de entrenamiento español, (b) una regresión general en la capacidad del modelo para seguir instrucciones, o (c) un problema de carga del adaptador en inferencia.

#### Test 5.4 — Validación de formato (Celda L)

| Test | Resultado | Observación |
|------|-----------|-------------|
| Test 1 — JSON válido | **FALLIDO** | `JSONDecodeError: Extra data: line 1 column 6` |
| Test 2 — Campos requeridos | **NO EJECUTADO** | Saltado por fallo en Test 1 |
| Test 3 — Un solo bloque JSON | PASADO | Detecta un único bloque, aunque inválido |

---

## Recomendaciones (ordenadas por impacto)

1. **[URGENTE] Repetir inferencia con tickets españoles representativos del dataset de entrenamiento.** La imagen `recibo.jpg` usada en el notebook era de Massimo Dutti con texto italiano — un caso fuera de distribución. Probar con 5-10 imágenes de MERCADONA, GRUPO DIA o Surbus antes de concluir que el modelo falla.

2. **[URGENTE] Verificar val_loss por época.** Añadir `logging_steps` a nivel de epoch y capturar `trainer.state.log_history` tras el entrenamiento para confirmar que el mejor checkpoint fue seleccionado correctamente y que no hubo sobreajuste severo.

3. **[ALTA] Ejecutar el banco de pruebas completo en Google Colab** con tickets españoles del dominio de entrenamiento. Ver PLAN_V4.md para los 5 tests del protocolo (sanidad, imagen no-ticket, consistencia, campo faltante, formato nuevo).

4. **[MEDIA] Verificar la carga del adaptador en un entorno limpio.** El mensaje `"You are using a model of type deepseek_vl_v2 to instantiate a model of type DeepseekOCR2"` aparece repetidamente e indica incompatibilidad de tipo de modelo. Confirmar que el adaptador carga correctamente en Google Colab sin este warning activo.

5. **[MEDIA] Inspeccionar safetensors en Colab.** Descargar `Lacax/deepseek_ocr_lora` y ejecutar el análisis estadístico del protocolo (NaN, Inf, capas muertas, varianza de lora_A/B).

6. **[BAJA] Limpiar inconsistencias del dataset base.** Corregir el registro con `comercio` vacío y normalizar las variaciones ortográficas ("S. L" vs "S.L") para mejorar la consistencia de las etiquetas en futuras iteraciones.

7. **[BAJA] Añadir post-procesado de salida en Scannet.** Independientemente de la fiabilidad del modelo, implementar extracción de JSON con regex como fallback en `/api/scan.ts` para casos donde el modelo genere texto alrededor del JSON en lugar de JSON puro.

---

## Fases Bloqueadas

| Fase | Check específico bloqueado | Razón | Desbloqueo |
|------|---------------------------|-------|------------|
| 2 | Estadísticas de tensores (NaN, Inf, valores extremos) | Safetensors en HF, sin descarga local | Google Colab + `huggingface_hub` |
| 4 | Inspección visual de imágenes base | Ruta de Escritorio no accesible en esta sesión | Acceso local o Colab con HF dataset |
| 5.1 | Test de conocimiento general (texto sin imagen) | No ejecutado en el notebook | Google Colab (Plan V4, Paso 3) |
| 5.2 | Test con imagen no-ticket | No ejecutado en el notebook | Google Colab (Plan V4, Paso 3) |
| 5.3 | Test de consistencia (misma imagen ×5) | No ejecutado en el notebook | Google Colab (Plan V4, Paso 3) |
| 5.4 | Test de campo faltante | No ejecutado en el notebook | Google Colab (Plan V4, Paso 3) |
| 5.5 | Test con formato de ticket nuevo | No ejecutado en el notebook | Google Colab (Plan V4, Paso 3) |

> **Impacto de los bloqueos:** Los bloqueos de Fases 2 y 4 no impiden usar el modelo provisionalmente, pero los bloqueos de Fase 5 sí son críticos — sin confirmar que la inferencia funciona con tickets españoles, **no se puede integrar el modelo con Scannet con garantías**.
