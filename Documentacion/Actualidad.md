Vale, te hablo claro. Lo que describes es un cuadro clínico bastante reconocible y voy a serte muy honesto: **el problema no es principalmente el modelo, es el dataset y la naturaleza de la tarea**. Déjame desmontarlo pieza por pieza.

## Diagnóstico crudo

**58 reales × 10 augmentations + 100 sintéticos = 680 muestras "efectivas"... pero no realmente.**

Aquí está el primer problema serio: el augmentation no crea información nueva, solo robustez visual. Si tus 58 tickets reales no contienen, por ejemplo, ningún ticket con producto a dos líneas, los 580 augmentations derivados tampoco lo tendrán. El modelo nunca ha visto ese caso. Lo mismo con formatos de fecha: si tus 58 reales solo tienen DD/MM/YYYY, no aprenderá DD-MM-YY ni "15 de marzo de 2024".

**Los 100 sintéticos son un arma de doble filo.** Si los generaste tú (probablemente con plantillas o un generador), tienen un **distribution gap** con los reales. El modelo aprende patrones del sintético que no se cumplen en el real, y viceversa. Peor aún: si el sintético tiene listados "limpios" siempre con N productos bien formateados, el modelo aprende que los tickets "se ven así", y luego alucina productos para completar el patrón cuando ve un ticket real ambiguo.

**Ahora vamos síntoma por síntoma:**

### 1. "No detecta el listado completo de productos"

Causas probables, en orden de probabilidad:

- **Truncamiento de tokens de salida**. ¿Cuál es tu `max_new_tokens` en inferencia? Si tienes un ticket con 25 productos y generas hasta 512 tokens, te quedas a medias. Mira esto **primero**, es el bug más común y más estúpido.
- **Resolución de imagen insuficiente**. DeepSeek-OCR procesa la imagen a una resolución concreta. Si tu ticket es alto y estrecho (típico ticket térmico de 80mm × 40cm), al redimensionar pierdes legibilidad en zonas medias/inferiores. El modelo "ve borroso" la mitad del ticket.
- **Sesgo de longitud en el training set**. Si tus 58 reales tienen mediana de 6-8 productos, el modelo aprende implícitamente que "un ticket tiene ~7 productos" y corta ahí.

### 2. "No interpreta todos los formatos de fecha"

Esto es **puramente cobertura de dataset**. El modelo no generaliza formatos de fecha que nunca ha visto en training porque no es una tarea de "razonamiento", es de mapeo aprendido. Solución: garantizar que el training set cubre los formatos que existen en tu dominio.

### 3. "Se equivoca si un producto ocupa dos líneas"

Este es el problema más interesante técnicamente. Los tickets térmicos tienen layouts donde:

```
LECHE SEMIDESNATADA PASCUAL
1L BRICK                      1,29
```

El modelo necesita aprender que esas dos líneas son **un solo item**. Esto se llama _line continuation_ y requiere ejemplos explícitos en el dataset. Si tus 58 reales no lo tienen marcado correctamente en el JSON ground truth, el modelo nunca lo aprenderá. **Pregunta clave: ¿cómo está anotado esto en tu ground truth?**

### 4. "Alucina productos que no existen" — el síntoma más grave

Esto es el clásico failure mode de los VLMs/LLMs cuando:

1. La imagen es ambigua o de baja calidad y el modelo "rellena" con su prior
2. El modelo está sobre-entrenado en patrones del dataset (overfitting a estructura, no a contenido)
3. Los sintéticos han enseñado al modelo a "esperar" cierto tipo de productos
4. La temperatura en inferencia no es 0

**Pregunta crítica: ¿estás haciendo inferencia con `temperature=0` y `do_sample=False`?** Si no, empieza por ahí, ya. Cualquier muestreo estocástico en una tarea de extracción es pegarte un tiro en el pie.

## Ahora, ¿qué caminos tienes? Te los pongo de menor a mayor esfuerzo

### Camino 1: Auditoría y arreglos baratos (1-2 días)

Antes de tocar nada del modelo, verifica:

1. `temperature=0`, `do_sample=False`, `num_beams=1` en inferencia
2. `max_new_tokens` suficiente para el ticket más largo posible (yo pondría 2048 mínimo)
3. Resolución de entrada — prueba a partir el ticket en franjas horizontales solapadas si es muy alto (sliding window) y luego concatenas resultados
4. Revisa la calidad de tu ground truth JSON. **Apuesto a que ahí hay inconsistencias** que están envenenando el training. Errores típicos: productos con saltos de línea anotados a veces como uno y a veces como dos, cantidades a veces como string a veces como número, fechas en formatos distintos en el ground truth, etc.

Esto solo, sin reentrenar, puede ya darte una mejora notable.

### Camino 2: Mejor dataset, mismo modelo (1-2 semanas)

Esto es donde está el grueso del ROI:

- **Más tickets reales**, prioritariamente los casos donde falla. 58 → 200-300 reales sería un salto enorme. Si trabajas con comercios concretos, pídeles tickets de un día completo.
- **Sintéticos más diversos y realistas**. Generadores tipo _DocSynth_ o renderizar HTML/CSS de plantillas reales con `weasyprint` + ruido térmico simulado (granulado, líneas perdidas, manchas). Y crítico: sintéticos con productos a dos líneas, fechas en formatos variados, números de productos entre 1 y 40.
- **Anotación rigurosa y consistente**. Define un schema JSON estricto y revisa que los 58 reales lo cumplen al 100%. Una herramienta tipo Label Studio te ahorra dolor.
- **Hard negative mining**: identifica los 20 tickets donde el modelo falla más, anótalos perfectamente, y dales más peso en training (oversampling o más epochs).

### Camino 3: Arquitectura híbrida (2-3 semanas)

Aquí hay algo importante: **estás usando un VLM end-to-end para una tarea que mezcla percepción y estructura**. Una arquitectura más robusta sería:

1. **OCR de texto plano** con un modelo bueno y barato: PaddleOCR, Tesseract, o el propio DeepSeek-OCR pero solo para extraer texto+coordenadas
2. **Post-procesado estructurado** con un LLM (puede ser Claude, GPT, o un modelo open-source ligero) que recibe el texto OCR + coordenadas y genera el JSON

Ventajas: el OCR es muy bueno extrayendo texto literal (no alucina porque solo "lee"), y el LLM estructura razonando sobre texto plano (donde alucina mucho menos que sobre imagen). El "doble línea" se resuelve fácil con reglas o con el LLM viendo coordenadas Y cercanas.

Esto suele superar a un VLM end-to-end fine-tuneado en datasets pequeños. Es la arquitectura que usan en producción muchos servicios comerciales de extracción de tickets.

### Camino 4: RAG — te lo desencauzo, no es lo que necesitas

Honestamente: **RAG no resuelve tu problema**. RAG sirve cuando necesitas que el modelo consulte conocimiento externo (documentación, base de datos) para responder. Tu modelo no necesita "consultar nada", necesita leer mejor la imagen que tiene delante.

Donde RAG **sí podría tener sentido tangencialmente**: tener una base de productos conocidos por comercio. Si extraes "LECH SEMI PASC 1L" y tienes en BD "LECHE SEMIDESNATADA PASCUAL 1L BRICK", podrías hacer un fuzzy match para normalizar nombres. Pero esto es **post-processing**, no RAG en sentido estricto, y es fácil de hacer con `rapidfuzz` o embeddings.

### Camino 5: Diccionarios y abreviaturas — sí, pero como post-processing

Lo que mencionas de "21 \* 2 42" (precio × cantidad = total) y abreviaturas es **valiosísimo**, pero NO como input al modelo. Es **validación posterior**:

- **Validador aritmético**: para cada línea, verifica `precio_unit × cantidad ≈ subtotal`. Si no cuadra, marca para revisión humana o re-OCR esa zona.
- **Validador de totales**: suma de líneas + IVA ≈ total del ticket. Esto detecta productos perdidos o alucinados con altísima precisión.
- **Diccionario de abreviaturas/productos comunes**: para corregir OCR errors típicos. "0CL" → "OCL", "l1tro" → "litro".
- **Validador de NIF**: con dígito de control verificable.
- **Validador de fechas**: convertir cualquier formato a ISO con `dateparser` (librería Python que entiende español y multiformato).

Estos validadores deberían ser una **capa obligatoria** después del modelo. Te detectan ~80% de los errores y muchos los corriges automáticamente.

## Mi recomendación priorizada

Si fuera tu proyecto haría exactamente esto, en este orden:

1. **Hoy mismo**: verificar `temperature=0`, `max_new_tokens=2048`, revisar resolución de entrada
2. **Esta semana**: auditar el ground truth de los 58 reales en busca de inconsistencias
3. **Próximas 2 semanas**: añadir capa de validadores post-procesado (aritmético, totales, fechas con `dateparser`, NIF)
4. **Siguiente sprint**: recolectar 100-150 tickets reales más, priorizando casos difíciles
5. **Si después de todo eso aún no rinde**: considerar arquitectura híbrida OCR+LLM

## Lo que necesito saber para afinar más

Para darte recomendaciones más concretas necesito que me cuentes:

1. **Schema del ground truth**: ¿qué estructura JSON usas exactamente? ¿Cómo anotas un producto que ocupa dos líneas?
2. **Parámetros de inferencia actuales**: temperature, max_new_tokens, beam search, etc.
3. **Resolución de imagen**: ¿a qué resolución entran las imágenes al modelo? ¿Cómo es de alto un ticket típico tuyo?
4. **¿Cómo generaste los 100 sintéticos?** Plantillas, otra IA, qué herramienta
5. **Hiperparámetros LoRA**: rank, alpha, target_modules, learning rate, epochs, batch size
6. **¿Tienes métricas por campo?** (F1 de productos, F1 de fechas, F1 de totales) o solo impresión cualitativa
7. **Volumen y latencia objetivo en producción**: ¿procesarás 100 tickets/día o 100k? ¿necesitas tiempo real?

Con esto te puedo dar un plan mucho más quirúrgico. ¿Por dónde empezamos?
