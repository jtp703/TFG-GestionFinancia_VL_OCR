# Pendiente — Ciclo de mejora V4

**Estado del código:** Todo completado. Notebook V4 creado, JSONL corregido.
**Lo que falta:** Ejecutar el entrenamiento y verificar el resultado.

---

## U-2 — Subir el JSONL corregido a HuggingFace *(opcional)*

**Qué es:** El JSONL local tiene 2 correcciones menores (normalización de `E.S. LA PEÑITA`).
Subir esto al dataset de HF garantiza que el próximo entrenamiento use los datos corregidos.
Afecta a ~3 de 683 muestras. Puedes saltarte esto y hacerlo antes del siguiente ciclo.

**Comando:**
```bash
cd C:\Users\Jonni\Documents\DRA-WORKSPACE\TFG\DataAugmentation
python upload_to_hf.py --token TU_TOKEN_AQUI
```

**Criterio de éxito:** El repositorio `Lacax/Tickets` en HuggingFace muestra el JSONL actualizado.

---

## U-3 — Entrenar en RunPod con el notebook V4 *(crítico)*

**Qué es:** Ejecutar el entrenamiento corregido en la RTX 4090. El notebook V4 tiene
todos los bugs de V3 solucionados: rutas absolutas, split de validación, LoRA completo.

**Pasos:**

1. Arranca la instancia RunPod con la RTX 4090.

2. Copia el notebook a RunPod:
   ```
   TFG/Deepseek OCR/codigo/Deepseek_OCR_Runpod_Fix_V4.ipynb
   ```

3. **Ejecuta primero la celda 3.1 (validación de imágenes) y espera el resultado.**
   - Si ves `✅ Todas las imágenes verificadas. OK para entrenar.` → continúa.
   - Si ves `ABORTAR: X imágenes no encontradas` → para y avísame antes de continuar.

4. Ejecuta el resto de celdas en orden.

**Señales de que todo va bien durante el entrenamiento:**
- Los logs muestran `✅ Lote: X/X muestras OK` — sin ningún descarte.
- Al final de cada epoch aparece `eval_loss: X.XXXX` — debe ir bajando epoch a epoch.
- Si ves `Error processing sample` repetido → para el entrenamiento y avísame.

**Criterio de éxito:**
El archivo `adapter_model.safetensors` subido a `Lacax/deepseek_ocr_lora` en HuggingFace
debe pesar entre **100 y 200 MB**.
En V3 pesaba **17.99 MB** — ese era el síntoma del bug de capas LoRA.
Si el archivo nuevo pesa ~18 MB, el bug de capas persiste y hay que revisarlo juntos.

---

## U-4 — Verificar el modelo V4 *(alto)*

**Qué es:** Confirmar que el modelo reentrenado ya no alucina y extrae datos correctamente
antes de conectarlo a la aplicación Scannet.

**Tests incluidos en el notebook (celda 23 — se ejecutan automáticamente):**

| Test | Qué comprueba | Resultado esperado |
|------|---------------|--------------------|
| Test 1 | ¿El output es un JSON válido? | Sin errores de parseo |
| Test 2 | ¿Tiene los campos correctos? | `comercio, cif, fecha, total, items` presentes; ningún campo inventado |
| Test 3 | ¿Hay un solo bloque JSON? | En V3 el modelo devolvía 3-4 JSONs seguidos |

**Test adicional con imágenes v2 (recomendado):**

Tienes 50 imágenes nuevas en:
```
C:\Users\Jonni\Desktop\Universidad Almeria\Universidad Almeria\TFG\Dataset\Imagenes\v2\
```
Sube 3-5 de ellas a RunPod y cámbiales el nombre en la celda 21 del notebook
(`test_image_path = "/workspace/NOMBRE_IMAGEN.jpg"`). Ejecuta la inferencia
para cada una y observa si los resultados son coherentes.

**Criterio mínimo para conectar a Scannet:**
- Los 3 tests de la celda 23 pasan en al menos 4 de 5 tickets de prueba.
- El campo `total` extraído coincide con el del ticket (margen de ±0.01 EUR).
- El campo `comercio` es legible y coherente (no mezcla idiomas, no inventa nombres).

**Cuándo avisar:**
Comparte el output de los tests conmigo para confirmar el resultado antes de
actualizar la configuración de Scannet para usar el nuevo adaptador.

---

*Generado el 2026-04-08. Basado en `VLM_AUDIT_REPORT.md` y `Mejora_Modelo_V4.md`.*
