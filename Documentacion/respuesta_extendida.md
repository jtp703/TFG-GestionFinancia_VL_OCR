# Respuesta extendida al diagnóstico de Scannet

> Generado: 2026-04-26 | Respuesta a `respuesta.md` con cruces, prioridades y diagnóstico adicional.
> Este documento **no repite** lo que ya está bien identificado en `respuesta.md`. Se centra en: confirmaciones, matices importantes, problemas no detectados y plan de ataque quirúrgico.

---

## TL;DR — la cruda realidad

Tienes **tres problemas distintos** que se solapan y que se han estado tratando como uno solo. Separarlos es lo más importante:

1. **Bugs de inferencia** (truncamiento, `repetition_penalty`, resolución) → arreglo en horas, sin reentrenar.
2. **Problemas de dataset** (58 reales son pocos, ground truth inconsistente, sintéticos demasiado "limpios") → arreglo en días/semanas, sí reentrenar.
3. **Límite estructural del enfoque end-to-end VLM** para tickets densos → posible pivote arquitectónico.

**El loss de 0.0399 con 682 muestras y `val_loss` no registrado es la señal más grave de todo el documento.** No es "posible memorización", es **memorización casi segura**. Lo desarrollo abajo.

Y la conclusión incómoda: **tu pipeline de producción (OCR.space + DeepSeek-chat) probablemente ya rinde mejor que tu modelo fine-tuneado**, y eso no es un fracaso — es la respuesta correcta a un problema mal planteado para fine-tuning. Lo desarrollo en la sección 6.

---

## 1. Sobre el truncamiento (tu punto 2) — confirmo y matizo

Tu diagnóstico es correcto pero te quedas corto. Sube a **2048 mínimo, idealmente 4096**.

**Por qué 4096 y no 2048:**

Hagamos el cálculo. Un ticket de Mercadona promedio tiene 15-25 items. Cada item en tu schema genera aproximadamente:

```
{"cantidad": 1, "descripcion": "LECHE SEMIDESNATADA PASCUAL 1L", "precio": 1.29}
```

Eso son ~30-40 tokens por item con tokenizer de DeepSeek. Más overhead del JSON externo (comercio, cif, fecha, total, brackets) ~50 tokens. Para un ticket de 30 items: 30×40 + 50 = **1250 tokens**. Para 40 items (carrito grande de fin de semana): **1650 tokens**.

Con 2048 cubres el 95% de casos, pero te dejas el 5% de tickets más largos truncados — y esos son precisamente los que tienen más valor extraer. Memoria GPU no es un problema con LoRA en RTX 4090, así que **4096 es la opción segura** sin coste real.

**Pero hay algo más importante que no mencionas:** ¿estás controlando que el modelo _termine_ la generación con un `eos_token` adecuado? Si el modelo no aprendió a cerrar el JSON con `}` y emitir EOS, va a generar tokens hasta agotar `max_new_tokens` aunque el ticket sea corto. **Verifica en tu output que el modelo emite EOS de forma natural en tickets cortos.** Si no lo hace, hay un problema de training (tu data collator no enseña al modelo a parar).

---

## 2. Sobre `repetition_penalty=1.3` (tu punto 2) — esto es peor de lo que dices

Este valor es **agresivo** para una tarea de extracción estructurada y es casi seguro responsable de varios de tus síntomas. Te explico el mecanismo concreto:

`repetition_penalty` divide el logit de tokens ya generados por 1.3. En un JSON estructurado:

- Las claves se repiten muchas veces: `"cantidad"`, `"descripcion"`, `"precio"` aparecen una vez por item. En un ticket de 20 items, el token `"precio"` se debería generar 20 veces.
- Tras 5-6 repeticiones, la penalización acumulada hace que el modelo prefiera generar otra cosa: una variante (`"precios"`, `"precio_"`), un cierre prematuro, o saltarse el campo.

**Esto explica directamente:**

- **El truncamiento aparente** en tickets largos: el modelo "se cansa" de repetir la estructura y cierra antes.
- **Los typos artificiales** (`"LECHE ENTRA PLU"` vs `"LECHE ENTERA PLU"`): si "ENTERA" ya apareció, la penalización empuja al modelo hacia variantes.
- **Hallucinations en precios** (el SEVEN UP a 31.20€): si los precios típicos (1.29, 0.99) ya aparecieron, el modelo los penaliza y elige números menos comunes.

**Recomendación concreta:** `repetition_penalty=1.0` (desactivado). Punto. Para extracción estructurada nunca se usa. Si te preocupa la repetición patológica (loops infinitos), eso se controla con `no_repeat_ngram_size=10` que solo penaliza n-gramas largos, no tokens individuales.

Tu propuesta de 1.1 es conservadora. Yo iría directo a 1.0 y mediría.

---

## 3. Sobre la resolución (tu punto 3) — el análisis es bueno, la solución no del todo

Tu cálculo de pérdida del 33% vertical es correcto, pero la solución del sliding window tiene un problema serio: **al partir el ticket, pierdes el contexto global** (cabecera con comercio, footer con totales) en cada crop. El modelo necesita ver el ticket entero para entender la estructura, y partes para entender el detalle.

**Alternativas mejores en orden de complejidad:**

**Opción A (la más fácil): cambiar `crop_mode=True` y forzar dynamic preprocess.** El comportamiento que describes (la condición `≤768` no se cumple) es justamente el que está rompiendo. Si entiendo bien el código de DeepSeek-OCR, puedes forzar el modo dinámico para imágenes grandes también, lo que generaría 2-6 crops del ticket más una vista global. Eso preserva resolución Y contexto. Revisa la firma del `dynamic_preprocess` y prueba a llamarlo siempre, no solo cuando la imagen es pequeña.

**Opción B: pre-redimensionado inteligente.** Antes de pasar al modelo, redimensiona el ticket a ancho fijo de 1024px manteniendo aspect ratio. Si el alto resultante es >1024, partes en 2 crops con solapamiento del 20%. Procesas cada uno y mergeas resultados. Pero ojo: el merge no es trivial (un mismo item no debe duplicarse).

**Opción C (la más limpia): preprocesado de "deskew + crop"**. Muchos tickets tienen márgenes blancos enormes y están ligeramente rotados. Una limpieza con OpenCV (detección de bordes del ticket, deskew, crop ajustado) puede reducir un ticket de 1536×2048 a algo como 800×1800 que se procesa mejor. Esto es pre-procesamiento estándar en OCR de documentos y deberías tenerlo aunque no cambies nada más.

**Mi recomendación:** Opción A primero (es probar un parámetro), Opción C en paralelo (siempre ayuda), Opción B solo si las dos anteriores no son suficientes.

---

## 4. Sobre los sintéticos (tu punto 4) — aquí hay un problema mayor del que detectas

Tu observación de que los sintéticos son "demasiado limpios" es correcta, pero hay un problema más grave: **el ratio sintéticos/reales y el régimen de entrenamiento.**

Hagamos las cuentas reales del dataset efectivo:

```
58 reales × 10 augmentations = 580 muestras "reales-derivadas"
100 sintéticos × ¿cuántos augmentations? = X muestras "sintéticas"
Total declarado: 682 muestras
```

Si los sintéticos no se augmentaron, son 580 + 100 = 680, ratio 85/15. **Pero 580 son derivadas de solo 58 imágenes únicas.** En términos de información, tienes:

- **58 distribuciones de "ticket real"** vistas desde 10 ángulos cada una
- **100 distribuciones de "ticket sintético"** vistas una vez

El modelo, en términos de gradiente, ve **el mismo ticket real 10 veces** dentro de cada época. Con 3 épocas, cada ticket real se ve **30 veces**. Cada sintético se ve **3 veces**.

**Esto es overfitting acelerado a los 58 reales.** El loss de 0.0399 cuadra perfectamente: el modelo ha memorizado los 58 patrones de respuesta. El Test E pasa porque "ULTRAMARINOS EL TOLO" probablemente tiene un layout estructuralmente similar a alguno de los 58 vistos. El Test A falla en datos completos porque el modelo reproduce lo que recuerda, no lo que ve.

**Recomendaciones concretas:**

1. **Reducir augmentation por imagen real.** 10 es excesivo. Con 3-5 augmentations por real generas suficiente robustez sin amplificar la memorización. El gradiente no necesita ver el mismo contenido textual 10 veces.

2. **Aumentar el ratio sintético, pero solo si los sintéticos son buenos.** Si hoy son demasiado limpios, hacerlos más realistas y subir a 300-500 sintéticos te daría un dataset más diverso _en contenido_ (productos distintos, comercios distintos, layouts distintos).

3. **Validación rigurosa de la diversidad.** Antes de entrenar, mide:
   - Distribución de número de items por ticket (¿hay tickets de 30 items? ¿solo de 5-10?)
   - Distribución de formatos de fecha (¿cuántos formatos únicos?)
   - Diversidad de comercios (¿58 reales = 58 comercios o solo 5 comercios fotografiados varias veces?)
   - Longitud de descripciones (¿hay productos con nombres largos que se parten?)

   Si tu dataset tiene baja entropía en alguna de estas dimensiones, ningún hiperparámetro lo va a salvar.

---

## 5. Sobre el LoRA (tu punto 5) — esto es lo más grave y lo que tienes que arreglar antes que nada

Voy a ser duro porque es importante: **`val_loss` no registrado en un experimento de fine-tuning no es un "fallo de logging", es no tener experimento.** No tienes forma de saber si el modelo aprende o memoriza. El loss de 0.0399 es compatible con cualquiera de las dos hipótesis y la diferencia es vital.

**Diagnóstico concreto del setup:**

- `r=32, alpha=64`: razonable para tu tamaño de modelo (3B). Esta no es la causa de los problemas.
- `lr=2e-4`: es **alto** para LoRA en visión + lenguaje. El estándar de la literatura está en 1e-4 a 5e-5. Un LR alto con dataset pequeño es receta para memorización.
- **3 épocas con batch efectivo 8 sobre 682 muestras** = 682/8 × 3 ≈ 256 pasos de gradiente. Es muy poco para aprender, pero **suficiente para memorizar** dado el LR alto.
- `dropout=0.05`: bajo. Para un dataset pequeño yo subiría a 0.1 mínimo.
- 172.6M parámetros entrenables con 682 muestras únicas (en realidad 158 si hablamos de imágenes únicas) es **252.000 parámetros por muestra única**. Para comparar: en NLP fine-tuning bien dimensionado se busca 100-1000 muestras por cada millón de parámetros entrenables. Estás 3 órdenes de magnitud por encima.

**Acciones concretas para V5:**

1. **Registrar `val_loss` SÍ O SÍ.** Holdout del 15-20% del dataset, `evaluation_strategy="epoch"`, `eval_steps` cada 50 pasos. Sin esto no hay experimento.

2. **Bajar `lr` a 1e-4 o 5e-5.** Probablemente el rendimiento mejore _bajando_ la capacidad de aprendizaje porque reduces memorización.

3. **Subir épocas a 5-8** _con_ early stopping basado en val_loss. Si el val_loss empieza a subir mientras el train_loss baja, paras. Esto es la única forma sensata de elegir épocas.

4. **Considerar bajar el rank a `r=16`.** 172M params entrenables es mucho. Con `r=16` bajas a ~85M, lo que hace al modelo menos propenso a memorizar.

5. **Subir `dropout` a 0.1.**

6. **Reducir augmentations por imagen real de 10 a 3-5** (ya mencionado).

**Predicción honesta:** con esos cambios, el train_loss subirá (a 0.1-0.3 quizá) pero la generalización mejorará notablemente. Un train_loss "mejor" es a menudo señal de un modelo peor cuando el dataset es pequeño.

---

## 6. El elefante en la habitación: ¿este modelo tiene sentido para tu caso?

Tu sección 7 es honesta y por eso es la más importante del documento. Déjame ponerle números:

**Pipeline actual (OCR.space + DeepSeek-chat):**

- Coste: $0-5/mes
- Latencia: 3-8s
- Mantenimiento: bajo (APIs externas, schema en prompt)
- Calidad: razonable para demo

**Modelo propio en producción:**

- Coste mínimo viable: $4-8/mes RunPod o $40-80/mes endpoint dedicado
- Latencia: 5-15s (cold start) o 1-3s (always-on caro)
- Mantenimiento: alto (debug de Issue 6, gestión de modelo, versionado)
- Calidad actual: peor que el pipeline (truncamientos, alucinaciones)

**La pregunta incómoda: ¿qué problema resuelve el modelo propio que el pipeline no resuelve?**

Para un TFG las respuestas válidas son:

- **"Aprender el proceso de fine-tuning de un VLM"** ✅ — es académicamente legítimo, y ya lo has hecho
- **"Demostrar que se puede mejorar un baseline con técnicas específicas"** ⚠️ — necesitas medir contra el pipeline, no contra nada
- **"Construir algo desplegable mejor que las APIs"** ❌ — no es realista con tu dataset y tiempo

**Mi recomendación honesta para el TFG:**

El modelo fine-tuneado es valioso **como objeto de estudio**, no como producto desplegable. Tu memoria del TFG debería:

1. Presentar el pipeline OCR.space + DeepSeek-chat como **producto final** (porque funciona, es barato, y es desplegable).
2. Presentar el fine-tuning del VLM como **experimento controlado** que aporta:
   - Análisis del régimen de bajo dato
   - Comparativa de calidad VLM end-to-end vs pipeline OCR+LLM
   - Identificación de límites (alucinaciones, truncamientos, memorización)
   - Discusión de cuándo cada enfoque es preferible

Esto es **mucho más interesante académicamente** que "hicimos un modelo y va regular". Es un trabajo experimental honesto sobre los trade-offs reales de fine-tunear VLMs en bajo recurso.

Y deja la puerta abierta a futuro trabajo: con 500-1000 tickets reales y un pipeline de evaluación serio, sí podrías superar a la API. Pero eso es otro TFG.

---

## 7. Sobre RAG, diccionarios y validadores — desencauzo

### RAG: descártalo

No te aporta. RAG sirve para que un LLM consulte conocimiento externo al responder. Tu modelo necesita **leer mejor**, no consultar nada. Si me apuras, el único uso tangencial sería un "diccionario de productos conocidos por comercio" para normalizar nombres extraídos, pero eso es **fuzzy matching post-OCR**, no RAG.

### Diccionarios y abreviaturas: sí, pero como post-procesado

Esto es **alto ROI y bajo esfuerzo**. Implementa una capa de validación/normalización que se aplica al JSON que sale del modelo:

**Validadores deterministas (alta confianza):**

1. **Aritmético por línea**: `cantidad × precio_unit ≈ subtotal` (con tolerancia 0.02€). Si no cuadra, marca para revisión.
2. **Aritmético total**: `Σ(items) + IVA ≈ total` (tolerancia 0.05€). Detecta el 80% de productos perdidos o alucinados.
3. **Validador de NIF/CIF**: dígito de control verificable con regex + checksum.
4. **Validador de fecha**: usar [`dateparser`](https://dateparser.readthedocs.io/) que entiende español multiformato. Convertir todo a ISO 8601 (`YYYY-MM-DD`).
5. **Validador de precios**: ningún producto en un ticket con total 9.10€ puede costar 31.20€. Regla simple: `precio_item ≤ total + tolerancia`.

**Normalizadores (corrección automática):**

6. **Diccionario de abreviaturas**: `BR.` → `BRICK`, `SEMI.` → `SEMIDESNATADA`, `KG` → `KG` (estandarizar casing). Lista cerrada de ~50 abreviaturas comunes en supermercados españoles.
7. **Fuzzy match contra catálogo conocido**: si `LECH SEMI PASC` aparece y tu BD tiene `LECHE SEMIDESNATADA PASCUAL`, hacer matching con `rapidfuzz` (>85% similitud).
8. **Deduplicación inteligente**: si dos items tienen descripción con distancia de Levenshtein <2 y mismo precio, fusionar (suma cantidades). Esto resuelve directamente el caso `LECHE ENTERA PLU` / `LECHE ENTRA PLU`.

**Donde NO debes intentar usar diccionarios:** como input al modelo. No le pases una lista de productos esperados al prompt — eso sesga la inferencia hacia esos productos específicos y empeora la generalización.

### Sobre lo del "21 \* 2 42"

Eso es exactamente el caso del **validador aritmético por línea**. Cuando el ticket muestra `21 × 2 = 42` el modelo debe extraer `cantidad: 2, precio_unit: 21, subtotal: 42`. Si tu schema solo guarda `cantidad` y `precio` (sin distinguir unitario vs total), pierdes esta información. **Considera añadir `precio_unitario` y `subtotal` como campos opcionales** en el schema. El validador aritmético solo funciona si tienes ambos.

---

## 8. Bugs que detecto y NO están en tu lista

### 8.1. El parsing del ground truth con regex es una bomba de relojería

Mencionas que el JSONL fuente "se parsea con regex, no con `json.loads()`". Esto es un anti-patrón crítico. Significa que:

- Cualquier carácter especial en una descripción de producto (comas, comillas, acentos raros) puede romper el parsing silenciosamente.
- No tienes garantía de que tu ground truth en training sea idéntico al que esperas en evaluación.
- El modelo aprende a generar JSON "parecido" al que sale del regex, no JSON estrictamente válido.

**Acción:** arreglar el JSONL para que el ground_truth sea JSON estrictamente válido (escapado correctamente) y parsear con `json.loads()`. Esto puede explicar parte del comportamiento de unicode fullwidth (Test D) — el modelo aprendió que el JSON puede ser "laxo" y reproduce esa laxitud.

### 8.2. El mismatch de tipos `cantidad` (string vs int) viene del entrenamiento, no del frontend

Si en el ground truth aparece a veces como `1` (int) y a veces como `"1"` (string), el modelo aprende ambos patrones y los emite aleatoriamente. **No es un bug del frontend, es un bug del ground truth.** Auditar el JSONL completo y unificar antes de cualquier reentrenamiento.

### 8.3. `descripcion` vs `descripción` — origen probable

Mencionas que los outputs alternan tilde/no-tilde. Si el ground truth siempre usa "descripcion" (sin tilde) pero a veces aparece con tilde en outputs, eso significa una de estas dos cosas:

- El **prompt** que usas en inferencia tiene la palabra con tilde y empuja al modelo a copiarla.
- El modelo base (DeepSeek-OCR) tiene un prior fuerte hacia "descripción" (con tilde, español correcto) y el LoRA no lo ha sobrescrito completamente.

Verifica el prompt EXACTO usado en inferencia vs el usado en training. Cualquier divergencia (incluso de un carácter) degrada el rendimiento.

### 8.4. El Test B (recibo de tarjeta prepago) revela algo importante

Que el modelo halucine datos completos cuando se le pasa un recibo de tarjeta NO ES un bug pequeño. Indica que **el modelo no tiene un mecanismo de "no sé / esto no es un ticket"**. En producción esto es peligroso: cualquier imagen que se le pase generará un JSON plausible.

**Mitigación:** añadir un clasificador previo (incluso heurístico simple) que decida "esto parece un ticket de supermercado" antes de mandar al modelo. O en el prompt incluir instrucción explícita: _"Si la imagen no es un ticket de compra, responde con JSON `{"error": "no_es_ticket"}`"_ y entrenar con algunos ejemplos negativos.

---

## 9. Plan de acción re-priorizado

Tu plan está bien estructurado pero le cambio el orden y añado cosas. Esta es mi propuesta:

### Inmediato (hoy/mañana, sin reentrenar)

1. `max_new_tokens=4096` (no 2048).
2. `repetition_penalty=1.0` (desactivado, no 1.1).
3. Verificar que el modelo emite EOS naturalmente en tickets cortos. Si no, hay problema de training.
4. Forzar `dynamic_preprocess` para imágenes grandes (Opción A de sección 3).
5. Añadir preprocesado básico OpenCV: deskew + crop de márgenes blancos.

**Test esperado:** estos 5 cambios juntos deberían eliminar el truncamiento del Test A y reducir alucinaciones notablemente. Si tras esto el modelo todavía falla mucho, el problema NO era de inferencia.

### Esta semana (validadores post-procesado)

6. Validador aritmético por línea + total.
7. Validador de NIF con checksum.
8. Validador de fechas con `dateparser` → ISO.
9. Diccionario de abreviaturas (lista de 50-100 entradas).
10. Deduplicación por distancia de Levenshtein.

**Test esperado:** con estos validadores, los errores residuales del modelo se hacen visibles (no se "esconden" en JSONs sintácticamente válidos pero semánticamente rotos).

### Próximas 2 semanas (auditoría de dataset)

11. Auditoría completa del JSONL: tipos consistentes, claves consistentes, escapado correcto.
12. Migración a `json.loads()` para parsing.
13. Análisis de diversidad del dataset: distribución de items, fechas, comercios, longitudes.
14. Identificar gaps específicos (e.g. "no hay tickets con productos a dos líneas").

### Próximas 4 semanas (V5 reentrenamiento, solo si compensa)

15. Recolectar 100-150 tickets reales más, focalizados en gaps detectados.
16. Reducir augmentations por imagen real de 10 a 3-5.
17. Generar 200-300 sintéticos más diversos (incluyendo ruido térmico simulado, productos a dos líneas, formatos de fecha variados).
18. V5 con `lr=1e-4`, `dropout=0.1`, `r=16`, 5-8 épocas con early stopping, **`val_loss` registrado**.
19. Evaluación cuantitativa: F1 por campo en holdout de 30 tickets reales no vistos. Comparar contra pipeline OCR.space + DeepSeek-chat.

### Decisión estratégica al final

20. **Si V5 supera al pipeline en F1**: integrar como producto. Si no, presentar el pipeline como producto y el fine-tuning como experimento académico controlado en la memoria del TFG.

---

## 10. Preguntas que me quedan

Para afinar más necesito saber:

1. **¿Cuántos comercios distintos hay realmente en los 58 reales?** (no número de tickets, número de comercios únicos). Si son 5-10 comercios, tu modelo está sobreajustado a esos layouts.
2. **¿El prompt de training y el de inferencia son IDÉNTICOS carácter a carácter?** Si difieren, eso degrada todo.
3. **¿Tu pipeline OCR.space + DeepSeek-chat tiene métricas medidas en los mismos tickets de test?** Sin ese baseline, no puedes saber si tu fine-tuning aporta valor.
4. **¿El JSONL `dataset_espanol_ampliado.jsonl` está en el repo y puedo verlo?** Si es así, podría auditarlo en una pasada y darte un informe concreto de inconsistencias.
5. **¿Qué deadline tienes para el TFG?** El plan que propongo es ~6 semanas si todo va bien. Si tienes 2 semanas, el alcance se reduce drásticamente y la decisión "presentar pipeline como producto" se vuelve obligatoria.

Dime por dónde quieres empezar y atacamos uno a uno.
