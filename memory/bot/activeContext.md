---
Última actualización: 2026-04-11
---

## Estado actual del modelo

- Modelo V4 entrenado: `Lacax/deepseek_ocr_lora` en HuggingFace
- Tests A, C, E: PASS. Test D: JSON inválido (unicode ，：, normalizado en scan.ts). Test B: borderline
- Worker Docker: `jtp703/scannet-ocr-worker:latest` — arranca OK, endpoint responde

## Bloqueado ahora mismo — Issue 6: modelo genera `} ` (debug pendiente)

El worker arranca y el endpoint responde peticiones, pero el modelo genera solo `} ` en lugar de JSON.

**Hipótesis investigadas y descartadas:**
- ❌ Falta de disco (resuelto: 20 GB)
- ❌ Check caché incorrecto (resuelto: safetensors)
- ❌ PeftModel sin merge (añadido merge_and_unload — no resolvió)
- ❌ tokenizer.add_bos_token=True (añadido False — no resolvió)
- ❌ torch_dtype deprecado (revertido a torch_dtype= — no causa el problema)

**Estado actual del handler.py (local, pendiente rebuild):**
- `merge_and_unload()` ✅
- `tokenizer.add_bos_token = False` ✅
- `torch_dtype=torch.bfloat16` ✅
- **Debug prints añadidos** para ver: sam_model, img_sum, token IDs generados, raw decode sin skip_special_tokens

**Siguiente acción al retomar:**
1. `docker build -t jtp703/scannet-ocr-worker:latest . && docker push` (rebuild con debug)
2. Lanzar test con `recibo_almeria_133.jpg`
3. Ver logs de RunPod: sam_model, img_sum, token IDs generados
4. Con esa info, fix definitivo y rebuild final (sin debug)

Ver detalle en `Scannet/Documentation/Despligue servless runpod/Solucion_Issues.md` §Issue 6.
