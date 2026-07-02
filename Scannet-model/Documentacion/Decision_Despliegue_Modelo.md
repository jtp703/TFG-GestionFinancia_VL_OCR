# Decisión de Despliegue del Modelo OCR

> Fecha: 2026-04-11  
> Contexto: El modelo `Lacax/deepseek_ocr_lora` está entrenado y validado (5/5 Test A, determinista).  
> Pregunta: ¿Conviene usar HF Inference API o desplegar el modelo en infraestructura propia?

---

## 1. Por qué HF Inference API no funciona para este modelo

El intento previo de usar `https://api-inference.huggingface.co/models/Lacax/deepseek_ocr_lora/v1/chat/completions` falla por razones estructurales, no por configuración:

| Causa | Detalle |
|-------|---------|
| **El repo es un adaptador LoRA, no un modelo completo** | `deepseek_ocr_lora` solo contiene los pesos del adaptador (~17-200 MB). HF Inference API necesita un modelo autónomo. |
| **La carga requiere código custom** | El modelo base `unsloth/DeepSeek-OCR-2` necesita `trust_remote_code=True` y `transformers==4.56.2`. HF no ejecuta código arbitrario en el tier gratuito. |
| **Arquitectura no soportada** | `DeepseekOCR2` no es una arquitectura reconocida por el backend de HF Inference. El tipo devuelve `None` en `get_transformers_model_type`. |
| **Repo privado sin Inference Endpoint** | Los repos privados solo son servibles vía HF Inference Endpoints (producto de pago separado). |

**Conclusión: HF Inference API gratuita no es viable para este modelo y no lo será sin cambios mayores al repo.**

---

## 2. Opciones reales disponibles

### Opción A — Mergear el modelo y usar HF Inference Endpoints (descartada por coste)

Pasos: ejecutar `merge_and_unload()` de PEFT para fusionar el adaptador en el modelo base → subir el modelo completo a HF → activar un Inference Endpoint.

**Problema**: los Inference Endpoints de HF para modelos con GPU cuestan ~$0.60–$1.20/hora cuando están activos. Para ~30 req/día no compensa mantener el endpoint caliente. Con cold start el tiempo de espera es >2 minutos por petición.

**Veredicto: descartada.**

---

### Opción B — RunPod Serverless (RECOMENDADA)

Desplegar un endpoint serverless en RunPod que ejecute el mismo código de inferencia validado en `Pruebas_de_inferencia.ipynb`.

**Cómo funciona:**
1. Se crea un worker Docker con FastAPI + el código de carga del modelo (transformers + PEFT, sin unsloth).
2. RunPod lo escala a 0 cuando no hay peticiones (no hay coste en reposo).
3. Cuando llega una petición, levanta el worker, hace inferencia y devuelve el JSON.
4. `scan.ts` cambia la URL de destino: de HF a `https://api.runpod.ai/v2/{endpoint_id}/runsync`.

**Estimación de coste con 30 req/día:**

| Parámetro | Valor |
|-----------|-------|
| GPU | RTX 3090 (mínima para este modelo) |
| Precio | ~$0.00023/seg |
| Tiempo por inferencia | ~20–40 seg (cold start incluido) |
| Coste por req | ~$0.005–$0.009 |
| Coste mensual (30/día) | **~$4–8/mes** |

Los $300 de crédito GCP no aplican aquí — RunPod tiene su propio sistema de créditos, pero el coste real es muy bajo.

**Veredicto: opción principal.**

---

### Opción C — Modal (alternativa gratuita con límites)

Modal ofrece $10/mes de crédito gratuito. Con 30 req/día y ~$0.007/req = ~$6.3/mes, **entraría en el free tier por los pelos**, pero:
- Requiere reescribir el worker en Python con el SDK de Modal.
- El cold start en Modal puede ser >3 minutos para modelos con dependencias pesadas (unsloth/transformers 4.56.2).
- El free tier puede cambiar o tener límites de compute.

**Veredicto: alternativa si RunPod falla, pero con más riesgo de cold start.**

---

### Opción D — GCP con créditos de $300

Los $300 de crédito de GCP son una cantidad total (no mensual) y se consumen en:
- **Cloud Run con GPU**: no disponible en todas las regiones, precio ~$0.90/hora por GPU T4. Con 30 req/día de ~40 seg = 20 minutos activo/día = ~$0.30/día = **~$9/mes**. Los $300 durarían ~33 meses, pero:
  - Cloud Run GPU está en preview y tiene setup complejo.
  - Vertex AI Prediction es más maduro pero más caro aún.
  - No hay experiencia previa con GCP en este proyecto.

**Veredicto: viable en papel pero complejidad alta y sin ventaja real sobre RunPod.**

---

## 3. Tabla comparativa

| | HF Inference API | RunPod Serverless | Modal | GCP Cloud Run GPU |
|---|---|---|---|---|
| **Funciona con este modelo** | No | Sí | Sí | Sí |
| **Coste mensual (30/día)** | — | ~$4–8 | ~$0 (free tier) | ~$9 |
| **Cold start** | — | 30–60 seg | 2–4 min | 1–3 min |
| **Setup** | Sencillo | Medio | Medio | Complejo |
| **Familiaridad** | Alta | Alta (RunPod ya usado) | Baja | Baja |
| **Requiere cambios en scan.ts** | No | Sí (URL + auth) | Sí (URL + auth) | Sí (URL + auth) |

---

## 4. Decisión recomendada

**Opción principal: RunPod Serverless**  
**Opción de respaldo: Modal (si RunPod supera el presupuesto)**

**Razones:**
- Es la plataforma que ya conoces (entrenamiento en RunPod con RTX 4090).
- El código de inferencia validado (`Pruebas_de_inferencia.ipynb`, Celda 0–2) se convierte directamente en el worker.
- El cambio en `scan.ts` es mínimo: solo cambia la URL y el formato del body (RunPod usa `{"input": {"image": "..."}}` en lugar de OpenAI chat format).
- Escala a 0 → no paga cuando no hay peticiones.

---

## 5. Qué cambia en scan.ts

El código actual llama a HF con formato OpenAI chat completions. Con RunPod Serverless el cambio es:

```typescript
// ANTES — HF Inference API (no funciona)
const hfResponse = await fetch(
  `https://api-inference.huggingface.co/models/${modelId}/v1/chat/completions`,
  { body: JSON.stringify({ model: modelId, messages: [...] }) }
)

// DESPUÉS — RunPod Serverless
const runpodResponse = await fetch(
  `https://api.runpod.ai/v2/${process.env.RUNPOD_ENDPOINT_ID}/runsync`,
  {
    headers: { Authorization: `Bearer ${process.env.RUNPOD_API_KEY}` },
    body: JSON.stringify({
      input: {
        image: base64Image,       // base64 puro, sin data URL
        mime_type: mimeType,
      }
    })
  }
)
// El worker devuelve { output: { ...jsonTicket } }
const result = await runpodResponse.json()
ocrResult = result.output
```

Las variables de entorno `HF_API_TOKEN` y `HF_MODEL_ID` se reemplazan por `RUNPOD_API_KEY` y `RUNPOD_ENDPOINT_ID`.

---

## 6. Siguientes pasos (si decides proceder)

1. **Crear el worker Docker** con el código de inferencia de `Pruebas_de_inferencia.ipynb`.
2. **Publicar el endpoint en RunPod Serverless** y obtener el `RUNPOD_ENDPOINT_ID`.
3. **Actualizar `scan.ts`** con el nuevo formato de llamada.
4. **Actualizar variables de entorno** en Vercel (eliminar HF*, añadir RUNPOD*).
5. **Crear tareas en Notion** en el tablero de Despliegue para trazar el progreso.

Esto corresponde a un bloque nuevo en el tablero Notion de Despliegue (distinto del QA de la app web).

---

*Basado en: `Inferencia_V4.md`, `Pendiente_V4.md`, `api/scan.ts`, `Analisis.md`, y pruebas previas del modelo.*
