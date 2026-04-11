# Experimentos de fine-tuning

## V3 (2026-04-08) — FALLIDO

- Dataset: 683 muestras (Lacax/Tickets), 3 épocas, RTX 4090, RunPod
- Loss: 1.44 → 0.47, sin split de validación
- Causa del fallo: bug rutas imagen (paths relativos → os.path.exists() siempre False → muestras silenciadas); LoRA solo 12/30 capas cubiertas; lora_alpha=32 (= r, no 2×r)
- Inferencia: alucinaciones graves, campos inventados (cief, pt, vivienda, barrachitas), mezcla ES/ZH

## V4 (2026-04-09) — PARCIAL

- Dataset: 682 muestras, split 90/10 (613 train / 69 val), 3 épocas, RTX 4090, 77 min
- Hiperparámetros: lr=2e-4, batch=1, grad_accum=8, warmup=5%, bf16=True
- LoRA: r=32, alpha=64 (2×r), dropout=0.05, 7 módulos, 24 capas → 172.6M params (4.85%)
- Loss final train: 0.0399 ⚠️ (posible memorización). val_loss: no registrado en output
- Fix bugs V3: rutas absolutas con os.path.abspath(), split validación, cobertura LoRA completa
- Inferencia con imagen italiana → alucinaciones (imagen fuera de dominio)

## Tests V4 (2026-04-09)

| Test | Resultado | Nota |
|------|-----------|------|
| A — 5 tickets españoles | 5/5 PASS | Determinista |
| B — imagen no-ticket | Borderline | Era recibo tarjeta prepago, no imagen sin texto |
| C — consistencia ×5 | PASS | 5/5 idénticos (do_sample=False) |
| D — campo faltante | JSON inválido | Puntuación unicode ，：en imágenes degradadas |
| E — comercio no visto | PASS | ULTRAMARINOS EL TORO, sin overfitting |

Fix aplicado en scan.ts: normalización unicode ，→, ：→: antes de JSON.parse.
