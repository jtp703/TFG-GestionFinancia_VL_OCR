---
Última actualización: 2026-05-18 — Despliegue local funcional; reanudando pruebas de inferencia
---

## Estado actual

### Inferencia local DeepSeek-OCR-2 (2026-05-18)
- **Deploy funcional** ✅: modelo corriendo en AMD RX 6750 XT vía torch-directml (DirectX 12)
- **Stack activo**: conda `deepseek-infer`, `server.py` FastAPI puerto 8000, `local-dev-server.cjs` puerto 3000, Vite puerto 5173
- **Limitación activa**: LoRA no se aplica a capas MoE (PEFT mismatch de nombres). El modelo corre esencialmente como el base `unsloth/DeepSeek-OCR-2`.

### Arranque (cada sesión)
```
Terminal 1: conda activate deepseek-infer && cd model_vs_model && uvicorn server:app --host 0.0.0.0 --port 8000
Terminal 2 (tras "Modelo listo"): cd Scannet && node local-dev-server.cjs
Terminal 3: cd Scannet && npm run dev
```
Verificar: `LOCAL_MODEL_URL=http://localhost:8000` en `Scannet/.env.local`

## Foco siguiente: Pruebas de inferencia local

Problemas conocidos a investigar:
1. Clasificar fallos: salida vacía ("directly resize") vs JSON truncado vs JSON inválido
2. Probar `max_new_tokens=1024` (o mayor) sobre casos truncados
3. Si salidas vacías persisten: comprobar si `model.infer()` envía a stderr
4. Fix LoRA: fusionar con `merge_and_unload()` en Colab → descargar modelo fusionado → eliminar dependencia PEFT

## Contexto anterior activo

- V6 Florence-2 H4 cerrado: holdout `total ±0.01 = 85.7%`, malformed=0, IoU≥0.7=64.3%
- Pipeline producción Scannet: OCR.space + DeepSeek-chat (sin cambios, sigue en producción)
- V5 cerrado como experimento académico (alucina items, NO se integra en producción)
- DeepSeek-OCR-2 LoRA entrenado: r=16, 3 epochs, 133 muestras, adapter en `Lacax/deepseek_original_dataset`
