# Respuesta al análisis de Actualidad.md
> Generado: 2026-04-26 | Basado en: `Pruebas_de_inferencia.ipynb`, `experiments.md`, `decisions.md`, `dataset_espanol_ampliado.jsonl`

---

## Respuestas a las 7 preguntas del diagnóstico

### 1. Schema del ground truth

```json
{
  "comercio": "string",
  "cif": "string",
  "fecha": "string (formato libre, predomina DD/MM/YYYY)",
  "total": "number",
  "items": [
    {
      "cantidad": "int o float (en el ground truth es int, pero en inferencia el modelo devuelve strings)",
      "descripcion": "string",
      "precio": "number"
    }
  ]
}
```

**Observaciones:**
- El JSONL fuente usa JSON **no escapado** dentro del campo `ground_truth` — se parsea con regex, no con `json.loads()` directo.
- Inconsistencia detectada en los outputs del modelo: a veces `descripcion` (sin tilde) y a veces `descripción` (con tilde). El ground truth usa siempre sin tilde. Esto puede causar fallos silenciosos en el parsing del frontend.
- `cantidad` se declara como `int` en el schema pero el modelo devuelve strings (`"1"`, `"0.549"`) — hay un mismatch de tipo no corregido.
- **Productos a dos líneas**: no hay evidencia de que estén explícitamente anotados en el dataset. Si existen en los tickets reales, probablemente están anotados de forma inconsistente. *Pendiente verificar manualmente los 58 tickets reales.*

---

### 2. Parámetros de inferencia actuales

Extraídos directamente del [CELDA 3] de `Pruebas_de_inferencia.ipynb`:

| Parámetro | Valor |
|-----------|-------|
| `max_new_tokens` | **1024** ⚠️ |
| `do_sample` | `False` ✅ |
| `repetition_penalty` | `1.3` ⚠️ |
| `temperature` | no establecido (irrelevante con `do_sample=False`) |
| `num_beams` | 1 (greedy, por defecto) |

**Problema confirmado — truncamiento real:**

En el Test A, `recibo_almeria_114.jpg` (MERCADONA, total 19.55€) solo extrae **2 productos** (PATATA 3KG + CALABACIN VERDE = 5.74€). La diferencia 19.55 - 5.74 = 13.81€ en productos no extraídos indica truncamiento por `max_new_tokens`. El test marca PASS porque el JSON es válido, pero los datos están incompletos.

**Acción prioritaria:** subir a `max_new_tokens=2048` como mínimo. Un ticket de MERCADONA con 20 productos genera ~400-600 tokens de salida; con 25+ productos se trunca a 1024.

**Sobre `repetition_penalty=1.3`:**

Este parámetro penaliza la repetición de tokens. Puede ser contraproducente en tickets con productos repetidos (e.g., 3 items del mismo producto) o con nombres que comparten substrings (LECHE ENTERA / LECHE SEMI). El Test A muestra `"LECHE ENTERA PLU"` y `"LECHE ENTRA PLU"` como dos items distintos — puede ser un artefacto de este parámetro interactuando con la repetición. Considerar reducir a `1.1` o eliminar.

---

### 3. Resolución de imagen de entrada

Extraído del `DeepSeekOCR2DataCollator` en el notebook:

| Parámetro | Valor |
|-----------|-------|
| `base_size` | 1024×1024 px (vista global, padded) |
| `image_size` | 768×768 px (tamaño de cada crop) |
| `crop_mode` | `True` |
| Dynamic preprocess | `min_num=2, max_num=6` crops para imágenes ≤768×768 |

**Comportamiento con tickets reales:**

Los tickets reales del dataset tienen dimensiones típicas de ~1536×2048 px (proporción 3:4, ticket térmico fotografiado). Al ser mayores que 768×768, **no pasan por el dynamic preprocess** (la condición `if image.size[0] <= 768 and image.size[1] <= 768` es False) — solo se usa la vista global paddeada a 1024×1024.

Esto significa que un ticket de 1536×2048 se comprime a 1024×768 antes del padding, perdiendo ~33% de resolución vertical. Para tickets muy altos (>15 productos), la zona inferior (totales, IVA) puede resultar ilegible para el modelo. Es consistente con el fallo del Test D.

**Potencial mejora:** preprocesar tickets altos con aspect ratio >2:1 redimensionando al ancho fijo de 768px y procesando en franjas solapadas (sliding window).

---

### 4. Generación de sintéticos

Herramienta: `DataAugmentation/generate_synthetic_ticket.py` — pipeline HTML → PNG vía **Playwright** (Chromium headless).

**Riesgos confirmados por el análisis:**
- Los sintéticos tienen layouts limpios (productos bien formateados, sin manchas, sin líneas perdidas).
- El modelo puede haber aprendido que "un ticket siempre tiene texto legible" → rellena con prior cuando la imagen es degradada.
- Si los sintéticos nunca tienen productos a dos líneas, ese patrón no está cubierto.
- Los ~100 sintéticos representan ~15% del dataset total (100/682) — su peso es significativo.

**Verificar:** si los sintéticos incluyen variedad en: número de productos (1–40), formatos de fecha (DD/MM/YY, D de mes de YYYY, etc.), productos a dos líneas, y nivel de ruido visual simulado.

---

### 5. Hiperparámetros LoRA (V4)

| Parámetro | Valor |
|-----------|-------|
| `r` (rank) | 32 |
| `alpha` | 64 (= 2×r) ✅ |
| `dropout` | 0.05 |
| Target modules | 7 módulos, 24 capas |
| Parámetros entrenables | 172.6M (4.85% del total) |
| Learning rate | 2e-4 |
| Batch size | 1 |
| Gradient accumulation | 8 (batch efectivo = 8) |
| Warmup | 5% de los pasos |
| Precision | bf16 |
| Épocas | 3 |
| Tiempo | ~77 min en RTX 4090 |
| Loss final (train) | **0.0399** ⚠️ posible memorización |
| val_loss | **no registrado** — fallo de logging |

**Señales de alerta:**

Loss de 0.0399 en entrenamiento con 682 muestras es extremadamente bajo. Indica memorización del dataset o que el modelo simplemente aprendió a reproducir los patrones de respuesta sin generalizar. El val_loss no registrado impide confirmar si hay overfitting real. El Test E (PASS con comercio no visto) sugiere que hay cierta generalización, pero el Test A con truncamiento hace difícil evaluarlo limpiamente.

---

### 6. Métricas por campo

No existen métricas F1 formales. Solo tests cualitativos:

| Test | Resultado | Campo afectado |
|------|-----------|----------------|
| A — 5 tickets españoles | **PASS 5/5** (pero con truncamiento en al menos 1) | Todos |
| B — imagen no-ticket | **FAIL** (era recibo de tarjeta prepago, no imagen sin texto) | Todos — hallucina datos |
| C — consistencia ×5 | **PASS** (5/5 idénticos) | Determinismo confirmado |
| D — campo faltante | **FAIL** (JSON inválido por unicode ，：) | total, items |
| E — comercio no visto | **PASS** (ULTRAMARINOS EL TOLO sin overfitting) | comercio |

**Bugs específicos observados en outputs:**

- `recibo_almeria_112.jpg`: `"REFRESCO SEVEN UP? precio: 31.20"` — precio alucinado (el ticket tenía total 9.10€, imposible que un producto cueste 31.20€). Indica alucinación en precios cuando el texto es ambiguo.
- `recibo_almeria_079.jpg`: `"LECHE ENTERA PLU"` y `"LECHE ENTRA PLU"` como dos items distintos — duplicado con typo.
- `recibo_almeria_114.jpg`: truncamiento confirmado (total 19.55€, solo 2 items extraídos = 5.74€).
- Test D: unicode fullwidth (，：) en imágenes degradadas → JSON inválido. Fix aplicado en `scan.ts` pero no resuelve el problema de raíz.

---

### 7. Volumen y latencia objetivo

**Prioridad 1 — que funcione correctamente.** No hay requisito de volumen mínimo ni SLA de latencia estricto. Es un TFG/demo.

**Prioridad 2 — despliegue al menor coste posible.** Las opciones viables ordenadas de menor a mayor coste:

| Opción | Coste | Latencia estimada | Estado |
|--------|-------|-------------------|--------|
| OCR.space (free) + DeepSeek-chat API | ~$0–5/mes | 3–8s | ✅ **En producción** en Scannet |
| HuggingFace Inference API (serverless) | $0 (free tier) pero sin soporte para DeepseekOCR2 | — | ❌ Incompatible |
| GPT-4o mini / Claude Haiku (visión) | ~$0.01–0.05/ticket | 2–5s | Siguiente paso si OCR.space falla |
| RunPod Serverless (modelo propio) | ~$4–8/mes + debug | 5–15s cold start | ❌ Abandonado (Issue 6 sin resolver) |
| HF Inference Endpoint dedicado | $0.60–1.20/hora | 1–3s | ❌ Demasiado caro para demo |

**Conclusión:** el pipeline actual (OCR.space + DeepSeek-chat en Vercel Functions) es la opción óptima para el TFG. El modelo fine-tuned propio sería un paso adicional solo si el tiempo lo permite y aporta calidad superior al pipeline externo.

---

## Observaciones adicionales (no en el análisis original)

### Bug silencioso en Test A
El Test A marca PASS 5/5 porque los JSON son válidos sintácticamente, pero al menos `recibo_almeria_114.jpg` tiene datos incompletos (truncamiento). El criterio de PASS debería incluir validación aritmética: `suma(items[i].precio × items[i].cantidad) ≈ total`. Si no cuadra, marcar como WARN aunque el JSON sea válido.

### `repetition_penalty` como vector de errores
El parámetro `repetition_penalty=1.3` no estaba en el análisis original. Es un candidato a causar:
1. Productos repetidos en el ticket real → el modelo los omite o los fusiona
2. Nombres de productos similares → el modelo introduce variaciones artificiales

### Schema inconsistente `cantidad`
El prompt dice `"cantidad": "int"` pero los outputs muestran `"1"` (string) y `"0.549"` (float como string). Si el frontend hace `parseInt()` o comparaciones numéricas, esto puede fallar silenciosamente. Unificar el tipo en el prompt a `number` o añadir conversión explícita en el parsing.

---

## Plan de acción priorizado (respuesta al análisis)

### Hoy (sin reentrenar, cambios en inferencia)
1. `max_new_tokens` → **2048** (cel. 3 y cel. 4 del notebook)
2. `repetition_penalty` → **1.1** o eliminar — testear si mejoran los duplicados
3. Añadir validador aritmético post-inferencia: `suma_items ≈ total` (tolerancia 5%)

### Esta semana (sin reentrenar, dataset)
4. Auditar los 58 tickets reales: buscar inconsistencias en `cantidad` (int vs float vs string), `descripcion` con/sin tilde, productos a dos líneas
5. Verificar cobertura de formatos de fecha en el dataset
6. Revisar si los sintéticos incluyen tickets con >15 productos

### Próximas semanas (reentrenamiento)
7. Ampliar a 150-200 tickets reales (prioritizar casos donde falla: precios altos, muchos productos, líneas rotas)
8. Unificar schema: `cantidad` siempre `number`, `descripcion` siempre sin tilde
9. Registrar `val_loss` correctamente en V5 (callback de logging o `evaluation_strategy="epoch"`)
10. Considerar aumentar épocas a 5 si val_loss no baja con 3

### Si los puntos anteriores no son suficientes
11. Arquitectura híbrida: OCR.space (texto) + LLM (estructurar) — **ya implementada en producción** como pipeline actual de Scannet. El modelo fine-tuned sería un step 3 opcional.
