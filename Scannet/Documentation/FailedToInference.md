# FailedToInference.md — Por qué el modelo OCR no funciona en la app

Documento explicativo. Describe el problema encontrado al intentar conectar
la aplicación Scannet con el modelo de inteligencia artificial entrenado,
escrito para cualquier persona sin conocimientos técnicos avanzados.

---

## ¿Qué se intentaba hacer?

Scannet necesita analizar la foto de un ticket y extraer sus datos automáticamente
(comercio, fecha, productos, total). Para eso se entrenó un modelo de inteligencia
artificial llamado `Lacax/deepseek_ocr_lora`, alojado en HuggingFace.

La idea era simple: el usuario hace una foto → la app se la manda al modelo → el modelo
devuelve los datos del ticket en formato JSON → la app los muestra para que el usuario
los revise.

---

## ¿Qué es HuggingFace y cómo funciona?

HuggingFace es una plataforma donde los investigadores y desarrolladores suben modelos
de inteligencia artificial para compartirlos. Funciona como un "GitHub para modelos de IA".

Cuando subes un modelo a HuggingFace, tienes varias formas de usarlo:

| Forma | Explicación simple | Coste |
|-------|--------------------|-------|
| **Inference API serverless** | HuggingFace lo ejecuta por ti en sus servidores, sin configuración | Gratis, pero limitado |
| **Inference Endpoint dedicado** | Reservas un servidor exclusivo para tu modelo | De pago (~0.06€/hora) |
| **HuggingFace Space** | Creas una pequeña aplicación web que sirve el modelo | Gratis con limitaciones |
| **Ejecutar localmente** | Lo descargas y lo ejecutas en tu propio ordenador | Requiere GPU potente |

---

## ¿Cuál es el problema exacto?

### Problema 1 — El modelo no tiene tipo definido

Para que HuggingFace sepa cómo ejecutar un modelo automáticamente, necesita saber
de qué tipo es. Esto se llama `pipeline_tag`. Es como una etiqueta que dice
"este modelo analiza imágenes y texto" o "este modelo genera texto".

El modelo `Lacax/deepseek_ocr_lora` **no tenía esta etiqueta** cuando se subió.
Sin ella, la Inference API gratuita de HuggingFace simplemente no sabe qué hacer
con el modelo y devuelve un error.

**Solución aplicada:** Se añadió manualmente la etiqueta `image-text-to-text`
en la ficha del modelo en HuggingFace.

### Problema 2 — La Inference API gratuita no soporta modelos grandes custom

Aunque se añadió la etiqueta, la **Inference API serverless gratuita** de HuggingFace
tiene limitaciones importantes:

- Solo funciona bien con modelos estándar y populares (los que HuggingFace ha validado)
- Los modelos grandes y personalizados como DeepSeek-VL requieren mucha memoria RAM y GPU
- HuggingFace no garantiza disponibilidad para modelos que no son los suyos propios
- Las peticiones suelen quedarse colgadas (sin respuesta) o devolver error 503

`Lacax/deepseek_ocr_lora` es un modelo basado en **DeepSeek-VL**, una arquitectura
de visión + lenguaje desarrollada por DeepSeek (empresa china). No es un modelo
estándar de HuggingFace — es una arquitectura personalizada entrenada con LoRA
(una técnica de fine-tuning eficiente). Este tipo de modelos **no están soportados**
por la Inference API gratuita.

### Problema 3 — La petición se queda sin respuesta (timeout)

Cuando la app intenta llamar al modelo, la petición se queda girando indefinidamente.
No devuelve error ni datos — simplemente no responde. Esto ocurre porque:

1. HuggingFace intenta cargar el modelo en memoria (proceso lento para modelos grandes)
2. Si el modelo no está en cache, puede tardar varios minutos en estar listo
3. En muchos casos, simplemente no llega a cargar y la conexión expira

---

## ¿Cómo se ha solucionado provisionalmente?

Se ha implementado un **modo mock** (modo de prueba) en la aplicación. Cuando está activado,
en lugar de llamar al modelo real, la app devuelve un ticket de prueba inventado de Mercadona.

Esto permite:
- Probar que toda la aplicación funciona correctamente (verificación, guardado, categorización)
- Seguir desarrollando sin depender del modelo
- Activar el modelo real cuando esté correctamente configurado

Para activar el modo mock, se añade en el archivo de configuración:
```
USE_MOCK_OCR=true
```
Para usar el modelo real:
```
USE_MOCK_OCR=false
```

---

## ¿Cómo se soluciona definitivamente?

Hay tres opciones ordenadas de más fácil a más completa:

### Opción A — HuggingFace Space (recomendada para el TFG)
Crear un "Space" en HuggingFace con una pequeña API que cargue el modelo y lo sirva.
- **Ventaja:** gratuito, no requiere gestionar servidores
- **Desventaja:** el Space se "duerme" si no recibe peticiones durante un tiempo (cold start de ~30 segundos)
- **Cómo:** crear un Space con Gradio o FastAPI que exponga un endpoint `/predict`
- **Coste:** 0€ (plan gratuito de HuggingFace)

### Opción B — Inference Endpoint dedicado en HuggingFace
Contratar un servidor dedicado en HuggingFace que tenga el modelo siempre cargado.
- **Ventaja:** rápido, fiable, sin cold start
- **Desventaja:** tiene coste económico
- **Coste aproximado:** ~0.06€/hora con GPU pequeña (T4)

### Opción C — API propia en RunPod (ya disponible)
El modelo ya se entrena en RunPod con una RTX 4090. Se podría añadir un servidor FastAPI
que sirva el modelo mientras la GPU está activa.
- **Ventaja:** usa la infraestructura ya existente para el entrenamiento
- **Desventaja:** solo disponible cuando RunPod está activo (no es un servicio permanente)
- **Coste:** el coste normal de RunPod que ya se está pagando

---

## Estado actual

| Componente | Estado |
|------------|--------|
| Modelo entrenado (`Lacax/deepseek_ocr_lora`) | ✅ Existe en HuggingFace |
| Etiqueta `pipeline_tag` añadida | ✅ Añadida manualmente |
| Inference API serverless gratuita | ❌ No funciona para este modelo |
| App conectada al modelo | ⚠️ Implementado — pendiente de infraestructura |
| Modo mock para pruebas | ✅ Activo (`USE_MOCK_OCR=true`) |

---

## Conclusión

El modelo de IA está entrenado y subido correctamente. El problema no es el modelo en sí,
sino **cómo se sirve**. La solución gratuita de HuggingFace no es suficiente para un
modelo de esta arquitectura. Para el TFG, la solución más práctica es crear un
HuggingFace Space que sirva el modelo como API, lo que permite que la app funcione
de extremo a extremo sin coste adicional.
