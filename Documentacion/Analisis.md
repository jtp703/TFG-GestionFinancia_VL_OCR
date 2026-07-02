# Rol

Eres un experto en despliegue de modelos de IA en cloud (GCP, RunPod, alternativas serverless).

# Contexto del proyecto

- Modelo: `Lacax/deepseek_ocr_lora` (LoRA fine-tuneado sobre DeepSeek, alojado en HuggingFace, repo privado)
- El modelo YA está entrenado. No necesito entrenar nada, solo inferencia.
- Frontend: aplicación Next.js desplegada en Vercel (`Scannet`)
- Tráfico esperado: muy bajo, ~30 peticiones/día máximo (fase de pruebas)
- Presupuesto: 0€. Evaluar si los 300$ de crédito gratuito de GCP (nuevo registro) cubren mi caso.
- Experiencia previa: usé RunPod con una RTX 4090 solo para entrenar, nunca para despliegue.

# Tarea

Genera un archivo `plan.md` con esta estructura:

1. **Viabilidad de GCP free credits para inferencia de un modelo LoRA**
   - ¿Qué servicios de GCP aplican? (Cloud Run, Vertex AI, GKE, Compute Engine con GPU)
   - ¿Cuáles están cubiertos por los 300$ de crédito y cuáles no?
   - Estimación de coste mensual con mi tráfico (~30 req/día)
   - Limitaciones concretas del free tier vs créditos de prueba

2. **Comparativa: GCP vs RunPod vs alternativas**
   - RunPod serverless endpoints vs GCP para mi caso de uso
   - Otras opciones gratuitas o casi gratuitas (HuggingFace Inference Endpoints, Modal, Replicate, Runpod Severless)
   - Tabla comparativa: coste, latencia, facilidad de setup, compatibilidad con LoRA

3. **Plan de despliegue recomendado**
   - Opción principal y opción de respaldo
   - Pasos concretos para desplegar el modelo desde HuggingFace
   - Cómo exponer el endpoint para consumirlo desde Vercel (API REST)
   - Ejemplo funcional de la llamada desde el frontend

4. **Lo que SÍ puedo hacer y lo que NO**
   - Lista clara de qué cubre el crédito gratuito de GCP
   - Qué está explícitamente excluido
   - Riesgos de facturación inesperada y cómo evitarlos

# Instrucciones de trabajo

- Investiga y contrasta la información antes de responder.
- Busca ejemplos reales y funcionales.
- Si algo no es verificable, indícalo explícitamente.
- Haz preguntas si necesitas más contexto sobre el modelo o la app.
- Crea las tareas en notion con los recursos que existen

# Formato de salida

Archivo `plan.md` en español, con markdown limpio, orientado a ser procesado también por Claude Code como referencia del proyecto.
