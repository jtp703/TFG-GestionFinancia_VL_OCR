---
Última actualización: 2026-04-27 — V5 cerrado como experimento académico
---

## Estado actual del modelo

- V5 entrenado: `Lacax/deepseek_ocr_lora_v5` en HF (eval_loss 0.1274, 6 épocas, 816 muestras)
- V4 conservado: `Lacax/deepseek_ocr_lora` (no sobrescrito, comparativa académica)
- **Pipeline en producción Scannet: OCR.space + DeepSeek-chat** (mantiene)
- V5 NO se integra en Scannet — alucinación de items confirmada cualitativamente

## Foco actual: redacción de la conclusión del TFG

El usuario está redactando el capítulo de la memoria del TFG sobre el experimento V5.

### V5 — resumen del fallo

- **Éxito técnico**: entrenamiento limpio, eval_loss monotónica 0.64 → 0.13
- **Fallo de generalización**: en inferencia con tickets reales (`Dataset_inference/img2.jpeg`), modelo extrae cabecera (comercio/CIF/fecha) pero **alucina completamente items y total**
- Causa: dataset 816 muy pequeño + resolución insuficiente para texto fino + eval_loss engañoso (val comparte distribución con train)
- Detalle completo en `memory/bot/experiments.md` sección V5

## Decisiones cerradas

- **H7 omitido**: veredicto cualitativo via Gradio es definitivo. F1 cuantitativo no aporta
- **H8 decidido**: pipeline OCR.space + DeepSeek-chat como producción. V5 → capítulo académico
- No iterar a V6 sin condiciones más estrictas (ver decisions.md)

## Pendientes inmediatos

- [ ] Usuario redacta conclusión del capítulo V5 en la memoria del TFG
- [ ] Cerrar `Documentacion/plan.md` marcando H6.8 ✅, H7 ❌ (omitido), H8 ✅ (decidido)
- [ ] Append en `Documentacion/walkthrough.md` con la sesión 2026-04-27

## Datos clave

- Adapter V5: `Lacax/deepseek_ocr_lora_v5` (eval_loss 0.1274, no producible)
- Adapter V4: `Lacax/deepseek_ocr_lora` (conservado para comparativa)
- Dataset HF: `Lacax/Tickets` (privado, V5 golden, 816 imágenes)
- Notebook inferencia V5: `Deepseek OCR/codigo/Inferencia/Pruebas_de_inferencia_V5.ipynb` (creado 2026-04-27, incluye Gradio)
- Notebook training V5 ejecutado: `Deepseek OCR/codigo/Deepseek_OCR_Runpod_Fix_V5_Ejecutado.ipynb`
- Plantilla RunPod usada: `runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404`
- Stack ejecutado: torch 2.8.0+cu128, xformers 0.0.32.post2, transformers 4.56.2, unsloth 2026.4.8
