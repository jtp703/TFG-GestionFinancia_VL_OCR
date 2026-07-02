# Plan de Mejora del Modelo — V4

**Basado en:** `VLM_AUDIT_REPORT.md` (auditoria del 2026-04-08)
**Modelo actual:** `Lacax/deepseek_ocr_lora` (entrenado con V3, comprometido)
**Objetivo:** Corregir los 4 problemas criticos y los avisos prioritarios antes de reentrenar

---

## Resumen del problema

La auditoria detecto que el modelo V3 **no aprendio la tarea** por 4 razones criticas:

| # | Problema | Impacto |
|---|---|---|
| C1 | El cargador de datos silenciaba y descartaba la mayoria de imagenes durante el entrenamiento | El modelo casi no vio ejemplos reales → alucinaciones |
| C2 | No existe split de validacion | Imposible detectar sobreajuste ni guardar el mejor checkpoint |
| C3 | LoRA solo cubre 12 de ~30 capas del modelo | Las capas profundas (generacion de JSON estructurado) nunca recibieron gradientes |
| C4 | Dataset de 62 imagenes sin aumentar | Demasiado pequeno para entrenar un VLM de 3.4B parametros de forma fiable |

---

## Division del trabajo

### Lo que hice yo (Claude) — sin acceso a RunPod

| ID | Tarea | Prioridad | Estado |
|----|-------|-----------|--------|
| C-1 | Crear el nuevo notebook `Deepseek_OCR_Runpod_Fix_V4.ipynb` con todos los fixes del codigo | CRITICA | ✅ COMPLETADO |
| C-2 | Corregir el registro vacio de `comercio` en `dataset_espanol_ampliado.jsonl` (`recibo_almeria_064.jpg`) | MEDIA | ✅ Intencional — comportamiento correcto, documentado |
| C-3 | Normalizar las 2 inconsistencias de escritura en el campo `comercio` del JSONL | MEDIA | ✅ COMPLETADO |

### Lo que debes hacer tu (requiere tu maquina / RunPod)

| ID | Tarea | Prioridad | Estado |
|----|-------|-----------|--------|
| U-1 | ~~Ejecutar el pipeline de aumentacion de datos en local~~ | ~~ALTA~~ | No necesario — el dataset en HF ya tenia 683 muestras (aumentacion previa confirmada por los logs de V3) |
| U-2 | Re-subir el JSONL corregido a HF (opcional) | BAJA | Pendiente |
| U-3 | Copiar el notebook V4 a RunPod y ejecutar el entrenamiento | CRITICA | Pendiente |
| U-4 | Verificar los resultados del modelo V4 con los tests de comportamiento (incluir imagenes v2) | ALTA | Pendiente |

---

## Desglose detallado — Tareas de Claude

---

### C-1 — Crear el notebook `Deepseek_OCR_Runpod_Fix_V4.ipynb` — COMPLETADO

El notebook V4 esta en `TFG/Deepseek OCR/codigo/Deepseek_OCR_Runpod_Fix_V4.ipynb`.

**Correcciones incluidas:**

#### C-1a — Correccion del bug de rutas de imagen (CRITICO-1)

`data_root` se convierte a ruta absoluta con `os.path.abspath()` y cada imagen
usa `os.path.abspath(os.path.join(data_root, sample["image_path"]))`.
Esto evita que los workers del dataloader descarten muestras silenciosamente al cambiar de directorio.

#### C-1b — Validacion estricta aborta el entrenamiento si falta alguna imagen (CRITICO-1)

La celda de validacion (3.1) lanza `RuntimeError` si cualquier imagen no existe en disco.
En V3 solo imprimia un aviso y continuaba entrenando con muestras faltantes.

#### C-1c — Contador de muestras validas por lote (CRITICO-1 monitoring)

El metodo `__call__` del DataCollator ahora imprime `Lote: X/Y muestras OK` tras cada lote.
Si hay descartes, se muestra `Lote: X/Y muestras validas (Z descartadas)` para detectarlo inmediatamente.

#### C-1d — Split 90/10 entrenamiento/validacion (CRITICO-3)

El dataset se divide con `train_test_split(test_size=0.1, seed=42)` antes de entrenar.
El Trainer recibe `eval_dataset=val_dataset` con `evaluation_strategy="epoch"`,
`load_best_model_at_end=True` y `metric_for_best_model="eval_loss"`.

#### C-1e — Hiperparametros LoRA corregidos (AVISO-1 y AVISO-6)

- `lora_alpha = 64` (antes 32, ahora 2xr para mayor senal de adaptacion)
- `lora_dropout = 0.05` (antes 0, ahora regularizacion minima)

#### C-1f — Verificacion de cobertura de capas LoRA (CRITICO-4)

Nueva celda 2.1 que cuenta cuantas capas del transformer tienen pesos LoRA activos
y advierte si el numero es menor de 20 (en V3 solo eran ~12 de ~30 capas).

#### C-1g — Correccion de `base_model_name_or_path` tras guardar (misc)

Tras `model.save_pretrained()`, el script parchea `adapter_config.json` para
reemplazar `"./deepseek_ocr2"` (ruta local de RunPod) por `"unsloth/DeepSeek-OCR-2"`.
Esto hace que el adaptador sea cargable desde cualquier maquina.

#### C-1h — Estadisticas completas tras el entrenamiento

Despues de `trainer.train()` se imprime duracion, muestras/segundo, perdida final y epocas completadas.

---

### C-2 — Comercio vacio en `recibo_almeria_064.jpg` — INTENCIONAL

El campo `"comercio": ""` en ese registro es intencional: el ticket correspondiente
no tiene nombre de negocio visible impreso. Se mantiene `""` como ground truth correcto.
El modelo debe aprender que un ticket sin nombre de negocio se anota con cadena vacia.
Este comportamiento esta documentado como valido.

---

### C-3 — Normalizar inconsistencias de escritura en el JSONL — COMPLETADO

1. `"BAZAR UNIVERSAL 2018 S.L"` vs `"BAZAR UNIVERSAL 2018 S. L"` → normalizado a `"BAZAR UNIVERSAL 2018 S.L"`.

2. `"E.S. LA PENITA S.A."` vs `"E.S. LA PENITA II"` → eran el mismo negocio anotado con nombres distintos por error.
   Normalizado a `"E.S. LA PENITA S.A."` en el JSONL (commit realizado).

---

## Desglose detallado — Tareas del usuario

---

### U-1 — Pipeline de aumentacion — NO NECESARIO

El dataset en HuggingFace (`Lacax/Tickets`) ya contenia **683 muestras** segun los logs
del entrenamiento V3 (el script imprimio `Dataset cargado: 683 tickets totales`).
Esto confirma que la aumentacion de datos ya se ejecuto en una sesion anterior y los
resultados ya estan subidos a HF.

**U-1 solo volvera a ser necesario si se anaden nuevas imagenes originales al dataset**
(es decir, si se fotografia mas tickets reales y se anotan en `dataset_espanol_ampliado.jsonl`).
En ese caso, habra que re-ejecutar `augment_images.py`, `build_dataset.py` y `upload_to_hf.py`.

---

### U-2 — Subir JSONL corregido a HF (opcional)

El JSONL tiene dos correcciones de calidad (normalizacion de `E.S. LA PENITA` y
la documentacion del comercio vacio). Si quieres que estas correcciones se reflejen
en el proximo entrenamiento, hay que re-subir el JSONL a HF.

**Sin embargo, esto no es estrictamente necesario para el reentrenamiento V4**: el notebook
V4 descarga el dataset desde HF y entrena con lo que haya ahi. Las correcciones del JSONL
son mejoras de calidad menores que afectaran a 2-3 muestras de las 683 totales (~0.4%).
Puedes entrenar V4 con el dataset actual y subir el JSONL corregido antes del siguiente ciclo.

**Pasos si decides hacerlo:**
```bash
cd C:\Users\Jonni\Documents\DRA-WORKSPACE\TFG\DataAugmentation
python upload_to_hf.py --token TU_TOKEN_AQUI
```

---

### U-3 — Ejecutar el entrenamiento V4 en RunPod

**Donde ejecutarlo:** En RunPod, en la misma maquina que se uso para V3.

**Pasos:**

1. Arranca la instancia RunPod con la RTX 4090.
2. Copia el notebook `TFG/Deepseek OCR/codigo/Deepseek_OCR_Runpod_Fix_V4.ipynb` a RunPod.
3. Ejecuta la celda 3.1 (validacion de imagenes) ANTES de lanzar el entrenamiento.
   Si da error, para y avisa antes de continuar.
4. Ejecuta todas las celdas en orden.

**Que mirar durante el entrenamiento:**
- Los logs deben mostrar `Lote: X/X muestras OK` (sin descartes).
- La perdida de validacion aparece al final de cada epoch — debe bajar junto con la de entrenamiento.
- Si ves `Error processing sample` repetido, para el entrenamiento y avisa.

**Verificacion post-entrenamiento:**
- El archivo `deepseek_ocr_lora/adapter_model.safetensors` debe pesar ~100-200 MB
  (en V3 pesaba 17.99 MB — eso indicaba que solo se cubrieron 12 capas).
- Si sigue pesando ~18 MB, la correccion de capas LoRA no se aplico correctamente.

---

### U-4 — Verificar el modelo V4 con los tests de comportamiento

El notebook V4 incluye una celda de tests automaticos (celda 22) que comprueba:
- Test 1: El output es un JSON valido
- Test 2: Tiene todos los campos requeridos (comercio, cif, fecha, total, items)
- Test 3: Hay un solo bloque JSON en la respuesta (en V3 aparecian multiples JSONs)

Ademas, ejecuta manualmente los 4 tests del plan de auditoria:
- Validez del JSON (5 imagenes del conjunto de validacion)
- Test de conocimiento general (pregunta sobre fotosintesis — debe responder de forma coherente, no con un JSON)
- Consistencia (misma imagen 3 veces — los 3 outputs deben coincidir en total y comercio)
- Imagen no-ticket (no debe inventar datos para una foto que no es un ticket)

**Criterio de exito minimo para conectar a Scannet:**
- Test 1: JSON valido en al menos 4 de 5 imagenes
- Test 2: Respuesta coherente sobre fotosintesis
- Test 3: Los 3 outputs coinciden en `total` y `comercio`
- Test 4: No fabrica datos para imagen no-ticket

---

## Imagenes v2 — Uso como conjunto de test

Las imagenes en la carpeta `v2` (sin anotaciones) **no forman parte del entrenamiento**
y no necesitan anotaciones para usarse como test.

Para usarlas en U-4:
1. Copia uno o varios archivos de imagen desde tu maquina local a RunPod (arrastrar al explorador de JupyterLab o con `scp`).
2. En la celda de inferencia (celda 21 del notebook V4), cambia `test_image_path` a la ruta del archivo subido.
3. Ejecuta la celda y revisa los resultados con los tests de comportamiento de la celda 22.

No se necesita ningun cambio en el notebook para esto — solo cambiar la ruta de la imagen de prueba.

---

## Orden de ejecucion recomendado

```
Claude                          Usuario
  |                               |
C-1 --- Notebook V4 listo        |
C-2 --- Comercio vacio: OK       |
C-3 --- JSONL normalizado        |
  |                               |
  |                           U-2 --- (Opcional) Re-subir JSONL a HF
  |                           U-3 --- Entrenar en RunPod con V4
  |                           U-4 --- Verificar resultados (incluir imagenes v2)
  |                               |
  |<---- Compartir resultados ----|
```

---

## Respuestas a preguntas anteriores

**Pregunta 1 — Comercio vacio en recibo_almeria_064.jpg:**
El comercio vacio es intencional (ticket sin nombre de negocio visible). Se mantiene `""` como ground truth.
Documentado como comportamiento valido — el modelo debe aprender a devolver cadena vacia cuando no hay nombre visible.

**Pregunta 2 — E.S. LA PENITA S.A. vs E.S. LA PENITA II:**
Era el mismo negocio anotado con dos nombres distintos por error (no dos sucursales).
Normalizado a `E.S. LA PENITA S.A.` en el JSONL. Commit realizado.

---

*Documento generado el 2026-04-08 a partir de los hallazgos de `VLM_AUDIT_REPORT.md`. Actualizado con los resultados de la sesion de implementacion V4.*
