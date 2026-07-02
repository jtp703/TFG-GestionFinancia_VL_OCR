# Inferencia V4 — Diagnóstico y Fix del Pipeline

> Fecha: 2026-04-09
> Modelo: `Lacax/deepseek_ocr_lora` (adaptador LoRA sobre `unsloth/DeepSeek-OCR-2`)
> Contexto: Pruebas del Paso 3 del protocolo PLAN_V4.md — Test A con tickets españoles

---

## Problema: Generación de 7 tokens de basura

### Síntoma

Al ejecutar inferencia con el `DeepSeekOCR2DataCollator`, el modelo generaba
entre 7 y 8 tokens sin sentido (`54321"}`, `54321 No (3)`) en lugar del JSON esperado.

Output del debug (con `skip_special_tokens=False`):

```
...ONLY valid JSON.
 <｜end▁of▁sentence｜><｜begin▁of▁sentence｜>54321"} <｜end▁of▁sentence｜>
```

### Causa raíz

En `process_single_sample` del collator, la rama del rol `<|Assistant|>` siempre
añade el token EOS al contenido del mensaje, sin distinguir entre entrenamiento
e inferencia:

```python
# Código problemático (antes del fix)
if role == "<|Assistant|>":
    content = f"{content.strip()} {self.tokenizer.eos_token}"
```

Durante el **entrenamiento** el contenido del asistente es el JSON de ground truth,
por lo que añadir EOS al final tiene sentido: indica al modelo dónde termina la respuesta.

Durante la **inferencia** el contenido es `""` (cadena vacía). Al aplicar `.strip()`
sobre `""` y concatenar EOS, el resultado es `" <EOS>"`. Esto introduce el token
EOS dentro de la secuencia de entrada antes de que el modelo empiece a generar.

El modelo interpreta ese EOS como fin de secuencia y reinicia con BOS, generando
solo unos pocos tokens antes del siguiente EOS — de ahí los 7 tokens de basura.

### Fix aplicado

```python
# Fix en proceso_single_sample — solo añadir EOS si hay contenido real
if role == "<|Assistant|>":
    if not assistant_started:
        prompt_token_count = len(tokenized_str)
        assistant_started = True
    # Solo añadir EOS si hay contenido real (training).
    # En inferencia el content es "" — no añadir EOS o el modelo reinicia con BOS.
    if content.strip():
        content = f"{content.strip()} {self.tokenizer.eos_token}"
```

El fix está aplicado en `paso3_testA.py` (copia de inferencia) y debe propagarse
al notebook de entrenamiento `Deepseek_OCR_Runpod_Fix_V4_Ejecutado.ipynb`
en la **Celda G** si se usa ese collator para inferencia en el futuro.

---

## Resultado: Test A — 5/5 PASS

| Imagen                 | Comercio extraído | CIF        | JSON válido |
| ---------------------- | ----------------- | ---------- | ----------- |
| recibo_almeria_079.jpg | MERCADONA, S.A.   | A-46103834 | ✅          |
| recibo_almeria_110.jpg | GRUPO DIA         | B04871059  | ✅          |
| recibo_almeria_111.jpg | GRUPO DIA         | B04871059  | ✅          |
| recibo_almeria_112.jpg | GRUPO DIA         | B04871059  | ✅          |
| recibo_almeria_114.jpg | MERCADONA, S.A.   | A-46103834 | ✅          |

### Observaciones menores (no bloquean integración)

- `cantidad` se genera como `"string"` en lugar de `int` en algunos casos
  (e.g. `"cantidad": "1"` en vez de `1`). El modelo fue entrenado con strings
  en ese campo — no es un error crítico, el parser de `/api/scan.ts` debe hacer cast.
- Imagen 112: un item tiene descripción parcialmente garbleada
  (`">N.FACT.S18761C LATAHÍNG..."`) — posible texto difícil de leer en el ticket.
- Los totales y fechas extraídos son coherentes con los tickets.

---

---

## Resultados Tests B-E (2026-04-09)

### Test B — Imagen fuera de dominio

**Resultado:** FAIL técnico / Borderline

```json
{"comercio": "", "cif": "", "fecha": "18/12/2025", "total": 9.99,
 "items": [{"cantidad": "1.00", "descripcion": "TARJETA PREPAGO DIGIMOVIL 643177215", "precio": 9.99}]}
```

**Análisis:** La imagen usada (`test_b_noticket.jpg`) parece ser un recibo de tarjeta prepago, no una foto sin texto. El modelo extrajo datos coherentes con el contenido de la imagen. `comercio` quedó vacío (correcto), `total` fue extraído (9.99). No hubo alucinación de comercios del dataset de entrenamiento. En un test con imagen genuinamente sin texto (paisaje, retrato), el comportamiento podría ser distinto. **No bloquea integración.**

---

### Test C — Consistencia ×5

**Resultado:** ✅ PASS — 5/5 idénticos

```
Totales únicos:   {'82.39'}
Comercios únicos: {'MERCADONA, S.A.'}
```

El modelo es completamente determinista con `do_sample=False`. Apto para producción.

---

### Test D — Campo faltante (ticket recortado)

**Resultado:** ❌ JSON inválido — puntuación unicode

```json
{"comercio": "MERCADONA, S.A.", ...,
 "items": [{"cantidad": "1", "descripción": "CONTAMINADO SI N PELOTA"，"precio"：0.95}]}
```

**Causa:** El modelo generó puntuación fullwidth china (`，` `：`) en lugar de ASCII (`,` `:`). Ocurre en imágenes degradadas o con texto difícil. El JSON es estructuralmente reconocible pero no parseable con `JSON.parse()` directamente.

**Fix requerido en `/api/scan.ts`:**
```typescript
// Normalizar puntuacion unicode antes de parsear
const cleaned = raw
  .replace(/，/g, ',')
  .replace(/：/g, ':')
  .replace(/"/g, '"')
  .replace(/"/g, '"');
JSON.parse(cleaned);
```

---

### Test E — Comercio no visto en entrenamiento

**Resultado:** ✅ PASS

```json
{"comercio": "ULTRAMARINOS EL TOLO", "cif": "", "fecha": "12/03/2026", "total": 57.45, "items": []}
```

El modelo extrajo el comercio correcto sin overfitting. `items: []` es aceptable para ticket de comercio pequeño con formato no estándar.

---

## Decisión de integración (PLAN_V4.md Paso 4)

**→ INTEGRAR CON CAUTELA**

- Tests A y C: PASS sólido
- Test D: falla en imágenes degradadas con puntuación unicode — requiere normalización en `/api/scan.ts`
- Test B: borderline (imagen de recibo en lugar de no-ticket) — no bloquea
- Test E: sin overfitting confirmado

**Requisito antes de deploy:** añadir normalización unicode + fallback regex en `/api/scan.ts`.

---

## Fix de infraestructura — Carga del modelo (2026-04-09)

### Problema

`FastVisionModel.from_pretrained` (unsloth) falla con modelos `deepseek_vl_v2` en versiones de unsloth >= 2025.x:

```
RuntimeError: Unsloth: No config file found
```

Causa: `get_transformers_model_type` devuelve `None` para el tipo `DeepseekOCR2`.

### Fix aplicado

Para inferencia no se necesita unsloth. Se carga con transformers + PEFT directamente:

```python
# transformers==4.56.2 — tiene DeepseekV2MoE y LlamaAttention compatibles con el modelo
model = AutoModel.from_pretrained(
    "./deepseek_ocr2", trust_remote_code=True,
    torch_dtype=torch.bfloat16, device_map="cuda",
)
tokenizer = AutoTokenizer.from_pretrained("./deepseek_ocr2", trust_remote_code=True)
model = PeftModel.from_pretrained(model, "Lacax/deepseek_ocr_lora", token=HF_TOKEN)
model.eval()
```

### Versión de dependencias para inferencia

```
transformers==4.56.2   # no instalar unsloth — sube transformers y rompe DeepseekV2MoE
peft, accelerate, pillow, huggingface_hub, addict, safetensors
```

El fix está aplicado en `Pruebas_de_inferencia.ipynb` (Celda 0: setup, Celda 2: carga).

---

## Conclusión

El modelo genera JSON válido y estructuralmente correcto en los 5 casos de prueba.
El bug era exclusivamente del pipeline de inferencia, no del modelo en sí.

**Estado del Test A: PASS** — confirmado en dos ejecuciones independientes. Se puede continuar con Tests B-E del PLAN_V4.md.

- Paso 1 ✅ — pesos limpios, sin NaN/Inf - Paso 2 ✅ — modelo carga correctamente
  - Test A ✅ — 5/5 JSON válido con tickets españoles
  - Bug de inferencia documentado y resuelto en Documentacion/Inferencia_V4.md
  - Tests B, C, D, E — pendientes

  Cuando retomes, solo necesitas:
  1. Una imagen que no sea ticket (Test B)
  2. Un ticket de comercio distinto a Mercadona/Grupo DIA (Test E)

  El resto (C y D) lo genero yo con las imágenes que ya tienes. El script paso3_testA.py ya tiene el collator corregido listo para reutilizar.
