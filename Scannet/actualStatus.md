# actualStatus.md — Estado real de Scannet v1.0

Documento de referencia técnica. Recoge qué funciona, qué está implementado pero sin probar,
qué tiene bugs conocidos, y qué quedó fuera de scope para una hipotética v2.

---

## 1. ¿Funcionará el modelo OCR de HuggingFace?

**Respuesta corta: probablemente no con la integración actual, y requiere verificación.**

### Qué hace `api/scan.ts`
Llama a la HuggingFace Inference API con este formato:
```json
{
  "inputs": {
    "image": "data:image/jpeg;base64,<...>",
    "question": "Extrae los datos del ticket..."
  }
}
```
Este formato corresponde al pipeline `visual-question-answering` (VQA) estándar de HuggingFace.

### El problema
El modelo `Lacax/Tickets` es un **DeepSeek-VL fine-tuned con LoRA**, una arquitectura
multimodal custom. La HuggingFace Inference API serverless **solo soporta arquitecturas
estándar** (BLIP, ViLT, etc.). DeepSeek-VL no está en esa lista.

Para que funcione hay tres opciones:
| Opción | Descripción | Estado |
|--------|-------------|--------|
| **Inference Endpoint dedicado** | Desplegar el modelo como endpoint privado en HF (de pago) | No implementado |
| **HuggingFace Space** | Crear un Space con Gradio/FastAPI que sirva el modelo | No implementado |
| **Serverless si el modelo tiene `pipeline_tag` correcto** | Si HF detecta el modelo como VQA estándar, podría funcionar | Sin verificar |

### Qué habría que comprobar antes de la Fase 9
1. Ir a `https://huggingface.co/Lacax/Tickets` → ver si aparece el botón "Inference API" activo.
2. Si aparece: probar con `curl` que devuelve JSON con `generated_text` o `answer`.
3. Si no aparece: la integración actual en `api/scan.ts` devolverá error 503 de HF.

### Lo que sí funciona aunque el modelo falle
El flujo completo de la app funciona: la pantalla de error OCR aparece correctamente,
el usuario puede pulsar "Reintentar" o "Cancelar". La app no se rompe.

---

## 2. Subida de imagen desde galería (sin cámara)

**Estado: NO implementado.**

`Scan.tsx` solo usa `getUserMedia` (cámara en vivo). No hay `<input type="file">`.
En un ordenador de escritorio sin cámara, el visor muestra el error:
> "No se pudo acceder a la cámara. Comprueba los permisos."

El botón de captura queda deshabilitado (`disabled:opacity-40`) y no hay alternativa.

### Lo que habría que añadir
```tsx
// Añadir junto al botón de captura en Scan.tsx (estado idle):
<label className="cursor-pointer text-sm" style={{ color: 'var(--color-brand)' }}>
  Subir imagen
  <input
    type="file"
    accept="image/*"
    className="hidden"
    onChange={e => {
      const file = e.target.files?.[0]
      if (file) enviar(file)
    }}
  />
</label>
```
Un `<input type="file" accept="image/*">` oculto bajo un label visible.
El `Blob` del archivo se pasa directamente a `enviar()` — no requiere cambios en el hook.

---

## 3. ¿Se guarda la imagen del ticket en la base de datos?

**Estado: NO. El campo existe en el schema pero nunca se rellena.**

### En el schema (`database/schema.sql`)
```sql
CREATE TABLE ticket (
  ...
  imagen_url text,  -- ruta en Supabase Storage
  ...
);
```
El campo `imagen_url` está definido y es nullable.

### En el código (`useScan.ts` — función `guardar`)
```ts
await supabase.from('ticket').insert({
  usuario_id:    session.user.id,
  comercio:      datos.comercio,
  fecha:         datos.fecha,
  metodo_pago:   datos.metodo_pago,
  verificado:    true,
  json_extraido: datos,
  categoria_id:  categoriaId,
  // ← imagen_url: ausente
})
```
La imagen se envía a `/api/scan` para OCR y se descarta. Nunca llega a Supabase Storage.

### Para implementarlo habría que
1. Crear un bucket privado `tickets` en Supabase Storage.
2. En `useScan.ts`, antes del INSERT, subir el blob:
   ```ts
   const path = `${session.user.id}/${Date.now()}.jpg`
   await supabase.storage.from('tickets').upload(path, ultimaImagen)
   const { data: { publicUrl } } = supabase.storage.from('tickets').getPublicUrl(path)
   ```
3. Incluir `imagen_url: publicUrl` en el INSERT.

---

## 4. Corrección de errores en tickets duplicados

**Estado: implementado a medias — bug conocido.**

### Lo que está implementado
`useScan.ts` detecta duplicados antes de guardar:
```ts
const { data: duplicados } = await supabase
  .from('ticket')
  .select('id')
  .eq('comercio', datos.comercio)
  .eq('fecha', datos.fecha)
  .eq('total', datos.total)
  .limit(1)

if (duplicados && duplicados.length > 0) {
  setErrorMsg('Ya existe un ticket con el mismo comercio, fecha y total.')
  setEstado('error')  // ← BUG: lleva a pantalla de error, no a verificación
}
```

### El bug
Al detectar un duplicado, el estado pasa a `'error'` (pantalla con "Reintentar/Cancelar").
El usuario **no puede editar los datos** para corregir el falso positivo (p.ej. dos compras
el mismo día en el mismo supermercado por el mismo importe).

Además, en `VerifyForm.tsx` existe un prop `duplicado` que muestra un banner de aviso,
pero en `Scan.tsx` el flag `duplicado` siempre se pone a `false` antes de llamar a `guardar`:
```ts
async function handleGuardar(datos) {
  setDuplicado(false)  // ← nunca llega a ser true en la UI
  await guardar(datos)
}
```

### El comportamiento correcto sería
1. Detectar el duplicado → mostrar **la pantalla de verificación** con el banner de aviso.
2. Permitir al usuario editar la fecha, comercio o total para desambiguar.
3. Solo si confirma con datos que siguen siendo duplicados → bloquear el guardado.

---

## Resumen del estado de v1.0

| Funcionalidad | Estado |
|---------------|--------|
| Autenticación (registro, login, logout) | ✅ Completo |
| Onboarding (3 pasos) | ✅ Completo |
| Navegación (BottomNav + Sidebar) | ✅ Completo |
| Tema claro/oscuro (localStorage + Supabase) | ✅ Completo |
| Vista Gastos — donut chart + categorías | ✅ Completo |
| Colores adaptativos por tema | ✅ Completo |
| Panel drill-down por categoría | ✅ Completo |
| Visor de cámara para escanear | ✅ Completo |
| Subida de imagen desde galería | ❌ No implementado |
| OCR vía HuggingFace Inference API | ⚠️ Implementado — compatibilidad sin verificar |
| Pantalla de verificación editable | ✅ Completo |
| Añadir / eliminar productos en verificación | ✅ Completo |
| Guardado en Supabase (ticket + productos) | ✅ Completo |
| Guardado de imagen en Supabase Storage | ❌ No implementado (`imagen_url` siempre null) |
| Categorización automática (DeepSeek) | ✅ Completo (degradación suave si falla) |
| Detección de duplicados | ⚠️ Implementado — lleva a error en vez de verificación |
| Vista Cuenta (avatar, email, tema, logout) | ✅ Completo |
| Deploy en Vercel | ❌ Pendiente (Fase 9) |

---

## Funcionalidades v2 que hubieran sido convenientes

Estas no entran en el scope del TFG pero serían las siguientes iteraciones naturales:

| Funcionalidad | Motivo |
|---------------|--------|
| **Historial de meses anteriores** | Solo se muestran gastos del mes en curso |
| **Edición de tickets ya guardados** | Una vez guardado, no hay forma de corregir un ticket |
| **Eliminación de tickets** | No hay botón de borrado en ninguna vista |
| **Metas de gasto por categoría** | Los datos de onboarding (`gasto_mensual_estimado`) se guardan pero no se usan |
| **Notificaciones al superar presupuesto** | Lógica de alertas basada en `ahorro_deseado` |
| **Categorías personalizables** | Las 6 categorías son fijas; no hay forma de añadir ni renombrar |
| **Exportar datos (CSV/PDF)** | Útil para declaraciones o control personal |
| **Búsqueda y filtrado de tickets** | Sin buscador en ninguna vista |
| **Soporte multi-idioma** | Todo hardcodeado en español |
| **Gestión RGPD (borrado de cuenta)** | No hay opción de eliminar la cuenta y sus datos |
| **Reconocimiento offline** | El OCR requiere red; sin fallback local |
| **Infinite scroll / paginación** | `api/tickets.ts` devuelve todos los tickets del mes sin límite |
