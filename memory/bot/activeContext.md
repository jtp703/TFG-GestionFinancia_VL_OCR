---
Última actualización: 2026-04-11
---

## Estado actual del modelo

- Modelo V4 entrenado: `Lacax/deepseek_ocr_lora` en HuggingFace
- Tests A, C, E: PASS. Test D: JSON inválido (unicode ，：, normalizado en scan.ts). Test B: borderline
- Worker Docker publicado: `jtp703/scannet-ocr-worker:latest`

## Bloqueado ahora mismo — 2 fixes pendientes (SIN rebuild el primero)

1. **RunPod → Edit endpoint → Container Disk → 20 GB** (sin rebuild, modelo pesa ~6.6 GB)
2. **Fix check caché** en handler.py: cambiar `config.json` → `model-00001-of-000001.safetensors` → rebuild → push

## Siguiente acción al retomar

Fase 4 del plan de despliegue: test con `curl` usando 3 tickets reales.
Ver criterio: `Scannet/Documentation/plan_despliegue_inferencia.md` §Fase 5.

## Presupuesto RunPod

$10.91 gastado. Revisar saldo antes de retomar.
