# Plan de Deploy — Modelo OCR en Producción

> **Objetivo:** Conectar el deploy en producción de Scannet (Vercel) con el modelo entrenado `Lacax/deepseek_ocr_lora`.
> El código de `api/scan.ts` ya está actualizado con el prompt correcto y la normalización de JSON.

---

## Paso 1 — Verificar acceso al modelo en HuggingFace

> **CRÍTICO — hacer antes de cualquier deploy.**

`Lacax/deepseek_ocr_lora` es un adaptador LoRA sobre una arquitectura custom (`DeepseekOCR2`).
La HF Serverless Inference API solo soporta arquitecturas estándar, por lo que hay que confirmar si funciona.

Ejecutar en terminal:

```bash
curl https://api-inference.huggingface.co/models/Lacax/deepseek_ocr_lora/v1/chat/completions \
  -H "Authorization: Bearer <HF_API_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Lacax/deepseek_ocr_lora",
    "messages": [{"role": "user", "content": [{"type": "text", "text": "test"}]}],
    "max_tokens": 10
  }'
```

| Respuesta | Acción |
|-----------|--------|
| JSON con `choices` | ✅ El modelo está disponible — proceder al Paso 3 |
| `{"error": "currently loading"}` | ⏳ Esperar 30-60s y reintentar |
| `404` / `"not supported"` | ❌ Necesita Inference Endpoint dedicado — ver Paso 2 |

---

## Paso 2 — Opciones si la Serverless Inference API no funciona

### Opción A — Inference Endpoint dedicado en HuggingFace (recomendado para demos/TFG)

1. Ir a [huggingface.co/inference-endpoints](https://huggingface.co/inference-endpoints)
2. **New Endpoint** → seleccionar `Lacax/deepseek_ocr_lora`
3. Hardware mínimo: **GPU A10G small** (necesario para el modelo)
4. Una vez activo, copiar la URL del endpoint (ej. `https://<id>.us-east-1.aws.endpoints.huggingface.cloud`)
5. En `api/scan.ts` línea 62, cambiar la URL:

```typescript
// Antes:
`https://api-inference.huggingface.co/models/${modelId}/v1/chat/completions`

// Después (Inference Endpoint):
`${process.env.HF_ENDPOINT_URL}/v1/chat/completions`
```

6. Añadir `HF_ENDPOINT_URL` a las variables de entorno en Vercel (ver Paso 3)

### Opción B — HuggingFace Space con GPU Zero (gratuito con cuota)

- Crear un Space público con runtime **GPU Zero (T4)**
- Desplegar el script de inferencia de RunPod adaptado a FastAPI/Gradio
- El Space expone su propio endpoint que `scan.ts` llama directamente
- Más complejo de mantener pero sin coste por hora

---

## Paso 3 — Variables de entorno en Vercel Dashboard

Ir a `vercel.com → Project tfg → Settings → Environment Variables`

| Variable | Valor | Notas |
|----------|-------|-------|
| `VITE_SUPABASE_URL` | URL de Supabase | Visible en frontend |
| `VITE_SUPABASE_ANON_KEY` | Anon key de Supabase | Visible en frontend |
| `SUPABASE_URL` | URL de Supabase | Solo Functions |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key | Solo Functions — nunca exponer |
| `HF_API_TOKEN` | Token de HuggingFace | Solo Functions |
| `HF_MODEL_ID` | `Lacax/deepseek_ocr_lora` | Solo Functions |
| `HF_ENDPOINT_URL` | URL del endpoint dedicado | Solo si se usa Opción A del Paso 2 |
| `USE_MOCK_OCR` | `false` | Production |
| `DEEPSEEK_API_KEY` | API key de DeepSeek | Solo Functions |

---

## Paso 4 — Deploy en Vercel

### Sobre la rama de deploy

El repositorio tiene tres ramas relevantes:

| Rama | Propósito |
|------|-----------|
| `main` | Rama principal — Vercel despliega production desde aquí por defecto |
| `Feature-App-Stack` | Rama de desarrollo activa (rama actual) |
| `Feature-App` | Rama anterior |

**Vercel por defecto solo despliega automáticamente desde `main` (production) y genera preview deployments para el resto de ramas.**

#### Opción A — Desplegar desde `Feature-App-Stack` directamente (recomendado para TFG)

Configurar Vercel para que `Feature-App-Stack` sea la rama de producción:

1. Ir a `vercel.com → Project tfg → Settings → Git`
2. En **Production Branch** cambiar `main` → `Feature-App-Stack`
3. Hacer push a `Feature-App-Stack`:

```bash
git add api/scan.ts vercel.json Documentation/plan_deploy_modelo.md
git commit -m "feat: integrar modelo Lacax/deepseek_ocr_lora — prompt y parser actualizados"
git push origin Feature-App-Stack
```

Vercel desplegará automáticamente en el dominio de producción.

#### Opción B — Merge a main y desplegar desde ahí

Si se prefiere mantener `main` como rama de producción:

```bash
git checkout main
git merge Feature-App-Stack
git push origin main
```

Vercel despliega automáticamente al detectar el push a `main`.

> **Para el TFG se recomienda la Opción A** — evita un merge prematuro y permite seguir desarrollando en `Feature-App-Stack` sin afectar a `main`.

---

Seguir el build en `vercel.com → Project → Deployments`.

---

## Paso 5 — Verificación post-deploy

1. Abrir la URL de producción
2. Iniciar sesión con una cuenta de prueba
3. Ir a **Escanear** → subir `recibo_almeria_079.jpg`
4. Verificar que la pantalla de verificación muestra:
   - Comercio: `MERCADONA, S.A.`
   - Fecha: `16/03/2026`
   - Total: `82.39`
5. Confirmar → comprobar que el ticket aparece en la vista **Gastos del mes**
6. Revisar logs en `vercel.com → Project → Functions → scan` si hay errores 502/422

---

## Cambios ya aplicados en el código

| Archivo | Cambio | Estado |
|---------|--------|--------|
| `api/scan.ts` | Prompt actualizado al de entrenamiento (inglés, orden correcto de campos) | ✅ Hecho |
| `api/scan.ts` | Normalización unicode `，→,` `：→:` antes del `JSON.parse` | ✅ Hecho |
| `api/scan.ts` | Cast de `cantidad` y `precio` a `number` (el modelo los devuelve como strings) | ✅ Hecho |
| `.env.example` | `HF_MODEL_ID=Lacax/deepseek_ocr_lora` ya configurado | ✅ Hecho |

---

## Notas sobre el comportamiento del modelo

Observaciones del protocolo de tests (Tests A-E, 2026-04-09):

- **Tickets españoles conocidos**: extracción correcta en el 100% de los casos
- **Consistencia**: resultados idénticos en 5 ejecuciones del mismo ticket (`do_sample=False`)
- **Comercio no visto**: extrae correctamente sin overfitting al dataset de entrenamiento
- **Imágenes degradadas**: puede generar puntuación unicode en descripciones de items — normalizado en `scan.ts`
- **`cantidad`**: el modelo la devuelve como string (`"1"`) — casteado a `number` en `scan.ts`
- **Items truncados**: el modelo puede no extraer todos los items de tickets largos (limitación del modelo, no crítica para v1.0)
