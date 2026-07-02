# Dataset Lacax/Tickets (privado, HuggingFace)

- Base: 62 tickets reales en `DataAugmentation/imagenes/dataset_espanol_ampliado.jsonl`
- Con augmentación: 682-683 muestras (10 variantes/imagen, Albumentations)
- Comercios únicos: 39. Totales: 0.53€–239.02€, media 31.13€
- Fechas: formato único DD/MM/YYYY. CIFs: 11 vacíos (aceptable, no todos los comercios imprimen CIF)

## Formato JSONL

Cada línea: `{"image_path": "recibo_almeria_001.jpg", "ground_truth": "{JSON sin escapar}"}`.
Usar parser regex (en augment_images.py), NUNCA json.loads() directo sobre la línea completa.

## Pipeline de datos

```
augment_images.py --num-augments 10   → 10 variantes/imagen (Albumentations)
generate_synthetic_ticket.py          → tickets HTML→PNG (Playwright)
build_dataset.py --copy-images        → fusiona en dataset_final.jsonl
upload_to_hf.py --token $HF_TOKEN     → sube a Lacax/Tickets
```

NO modificar `DataAugmentation/imagenes/` a mano. Es la fuente de verdad.

## Correcciones aplicadas (2026-04-08)

- `BAZAR UNIVERSAL 2018 S. L` → `BAZAR UNIVERSAL 2018 S.L` (espacio extra)
- `E.S. LA PENITA II` → `E.S. LA PENITA S.A.` (mismo negocio, nombre incorrecto)
- `comercio: ""` en recibo_almeria_064.jpg: INTENCIONAL — ticket sin nombre visible
- 14 precios negativos (descuentos): comportamiento correcto, documentado
