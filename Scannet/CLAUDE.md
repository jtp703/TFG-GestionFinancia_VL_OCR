# Scannet — Aplicación web OCR de tickets

## Descripción
Aplicación web que permite a usuarios subir fotos de tickets españoles,
procesarlos con el modelo DeepSeek-VL fine-tuneado, y consultar el historial.

## Estructura
```
Scannet/
├── backend/      → API REST que recibe imagen, llama al modelo, devuelve JSON
├── frontend/     → Interfaz web (stack por decidir)
└── database/     → Base de datos y esquemas
```

## Stack (POR DECIDIR)
⚠️ El stack aún no está definido. Antes de crear cualquier fichero nuevo,
preguntar al usuario qué framework usar. No asumir React, Vue ni ningún otro.
Para el backend se recomienda FastAPI (Python) por coherencia con el resto del TFG.

## Base de datos — Qué se guarda
Cada escaneo almacena:
- `imagen`: fichero o ruta de la imagen del ticket subida por el usuario
- `json_extraido`: resultado JSON devuelto por el modelo OCR
- `usuario_id`: referencia al usuario que realizó el escaneo
- `timestamp`: fecha y hora del escaneo

## Integración con el modelo
- El modelo OCR es DeepSeek-VL con LoRA, subido a HuggingFace en `Lacax/Tickets`
- El backend carga el modelo y expone un endpoint: recibe imagen → devuelve JSON
- El JSON de salida tiene esta estructura:
  ```json
  {
    "comercio": "MERCADONA, S.A.",
    "cif": "A-46103834",
    "fecha": "15/03/2025",
    "total": 24.50,
    "items": [
      {"descripcion": "LECHE ENTERA", "precio": 0.89}
    ]
  }
  ```

## Reglas de desarrollo
- Ajustarse al stack que elija el usuario — no proponer migraciones.
- Antes de crear ficheros de estructura (modelos de BD, rutas API), confirmar comprensión.
- El backend debe poder ejecutarse localmente Y en RunPod para pruebas con el modelo real.
- Separar claramente la lógica de inferencia del modelo del resto de la API.
