---
Última actualización: 2026-04-26 (sesión continua — H6 listo)
---

## Estado actual del modelo

- V4 entrenado: `Lacax/deepseek_ocr_lora` en HF (loss 0.0399, val_loss no registrado)
- Pipeline en producción Scannet: OCR.space + DeepSeek-chat
- **Plataforma de pruebas individuales: Google Colab con GPU T4** (no RunPod) — vía `gradio_demo.py`
- **Plataforma de entrenamiento V5: RunPod RTX 4090** (notebook V5 listo para deploy)

## Foco actual: H6.8 PENDIENTE (U) — lanzar entrenamiento V5

### Completado en esta sesión (2026-04-26)

- ✅ H1.1-H1.5: quick wins inferencia (Pruebas_de_inferencia.ipynb cells 3-4 + gradio_demo.py)
- ✅ H2.1-H2.6: módulo `validators/` (arithmetic, nif_cif, dates, abbreviations, dedup, pipeline)
- ✅ H3.1-H3.8: dataset_golden.jsonl (136 tickets, 55+ comercios) + upload a Lacax/Tickets (816 imágenes)
- ✅ H4.1-H4.3: análisis de diversidad — sin gaps críticos, H5 NO necesario
- ✅ H6.1-H6.7: notebook V5 creado en `Deepseek OCR/codigo/Deepseek_OCR_Runpod_Fix_V5.ipynb`

### Notebook V5 — decisiones clave aplicadas

| Fix | Cambio | Justificación |
|---|---|---|
| V5-A/B | dataset_golden.jsonl (Gemini) + ground_truth como objeto | JSON estricto, fin del regex parser |
| V5-C | lr 2e-4 → 1e-4 | Reduce memorización |
| V5-D | dropout 0.05 → 0.1 | Regularización |
| V5-E | r=32→16, alpha=64→32 | 172M → ~86M params entrenables |
| V5-F | 3 → 6 epochs + EarlyStopping(patience=2) | Selección por val_loss |
| V5-G | dynamic_preprocess siempre activo | Coincide con inferencia |
| V5-H | Prompt único `INSTRUCTION` train↔infer | Sec. 8.3 respuesta_extendida.md |
| V5-I | Schema con fecha_original, cantidad: number\|null | Coincide con anotación Gemini |
| V5-J | Adapter → `Lacax/deepseek_ocr_lora_v5` (no sobrescribe V4) | Comparativa H7 |
| V5-K | Split 85/15 (vs 90/10 V4) | Holdout interno mayor |
| V5-L | Log explícito de val_loss por época | Gap crítico V4 |

### PENDIENTE — por orden

**H6.8 (U) — siguiente acción**
- [ ] Subir `Deepseek_OCR_Runpod_Fix_V5.ipynb` a RunPod
- [ ] Configurar `HF_TOKEN` con permisos write
- [ ] Ejecutar celdas A→J (reiniciar kernel tras B)
- [ ] Verificar val_loss por época en Celda I
- [ ] Confirmar adapter en HF: `Lacax/deepseek_ocr_lora_v5`

**H1.6 PENDIENTE (U)**: relanzar Test A (5 tickets) en Colab con gradio_demo.py — confirmar mejoras H1

**H7 — Evaluación cuantitativa (post-H6.8)**
- 30 tickets externos (no incluidos en los 136) que el usuario tiene aparte → anotar con Gemini para holdout
- F1 por campo: V5 vs Pipeline vs V4
- Decisión H8: integrar V5 si F1 ≥ Pipeline; si no, queda como experimento académico

### Datos clave
- Dataset HF: `Lacax/Tickets` (privado, V5 golden, 816 imágenes)
- Adapter base: `unsloth/DeepSeek-OCR-2`
- Holdout externo: 30 tickets (en posesión del usuario, no anotados aún)
