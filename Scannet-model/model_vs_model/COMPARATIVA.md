# Comparativa de modelos — Inferencia local

## Los tres modelos

| Versión | Repo HuggingFace | Dir local | LoRA params | Dataset | Épocas | val_loss |
|---------|-----------------|-----------|-------------|---------|--------|----------|
| `orig`  | `Lacax/deepseek_original_dataset` | `deepseek_ocr2_orig` | — | dataset_espanol_ampliado (regex) | — | — |
| `v4`    | `Lacax/deepseek_ocr_lora`          | `deepseek_ocr2_v4`   | 172M (r=32, α=64) | dataset_espanol_ampliado (682 muestras) | 3 | no registrado |
| `v5`    | `Lacax/deepseek_ocr_lora_v5`       | `deepseek_ocr2_v5`   | 86M (r=16, α=32) | dataset_golden.jsonl Gemini (816 muestras) | 6 | **0.1274** |

> **IMPORTANTE:** El directorio `deepseek_ocr2_orig` (modelo original) se pierde si se
> ejecuta `python download_models.py --force` sin haberlo descargado previamente en su
> propio directorio. Con la estructura actual (directorios por versión), `--force` **no**
> afecta a otras versiones.

## Diferencias clave V4 → V5

| Aspecto | V4 | V5 |
|---|---|---|
| Dataset | `dataset_espanol_ampliado.jsonl` (parser regex) | `dataset_golden.jsonl` (Gemini, JSON estricto) |
| `ground_truth` | string con JSON escapado | objeto JSON directo (`json.loads()`) |
| Learning rate | 2e-4 | 1e-4 |
| Dropout | 0.05 | 0.1 |
| `dynamic_preprocess` | solo si imagen ≤ 768px | siempre activo (`min_num=1`) |
| Prompt train / infer | divergente | idéntico (`INSTRUCTION` constante) |
| Schema | sin `fecha_original` | con `fecha_original` y `cantidad: number\|null` |
| Early stopping | No | Sí (patience=2 sobre eval_loss) |
| Checkpoint guardado | último | el de menor `eval_loss` |

---

## Paso 1 — Descargar los tres adaptadores

```bash
conda activate deepseek-infer
cd model_vs_model

# Primera vez (descarga lo que no exista):
python download_models.py

# Re-descargar una versión concreta sin tocar las otras:
python download_models.py --only v5 --force
```

Los directorios destino son independientes — `--force` solo borra el que se está descargando.

---

## Paso 2 — Arrancar el servidor con una versión

```powershell
# Terminal 1 — elige UNA de estas tres líneas (PowerShell):
$env:LORA_VERSION="orig"; uvicorn server:app --host 0.0.0.0 --port 8000
$env:LORA_VERSION="v4";   uvicorn server:app --host 0.0.0.0 --port 8000
$env:LORA_VERSION="v5";   uvicorn server:app --host 0.0.0.0 --port 8000

# Terminal 2 (tras ver "[INFO] Modelo XX listo."):
cd Scannet && node local-dev-server.cjs

# Terminal 3:
cd Scannet && npm run dev
```

Verificar qué versión está activa antes de probar:
```bash
curl http://localhost:8000/health
# {"status":"ok","device":"privateuseone:0","lora_version":"v5"}
```

---

## Paso 3 — Probar con Scannet

1. Abrir `http://localhost:5173/scan`
2. Subir la misma imagen en los tres servidores (uno cada vez)
3. Anotar los resultados en la tabla de abajo

---

## Tabla de resultados (rellenar durante las pruebas)

Imagen de referencia: ________________

| Campo | Ground truth | orig | v4 | v5 | Pipeline (OCR.space+DeepSeek) |
|-------|-------------|------|----|----|-------------------------------|
| comercio | | | | | |
| cif | | | | | |
| fecha | | | | | |
| total | | | | | |
| nº items | | | | | |
| JSON válido | | | | | |
| Tiempo (s) | | | | | |

---

## Criterio de decisión

- Si **V5 ≥ Pipeline** en precisión de campos → integrar V5 en Scannet (reemplaza OCR.space+DeepSeek)
- Si **V5 < Pipeline** → V5 queda como experimento académico en la memoria del TFG
- El modelo `orig` sirve de baseline para medir cuánto mejoró el fine-tuning
