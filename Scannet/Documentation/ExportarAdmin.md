# ExportarAdmin — Panel de Administración y Exportación del Dataset

Documento que describe el conjunto de funcionalidades implementadas para la gestión
administrativa de Scannet y la extracción del dataset de tickets consentidos
para entrenamiento del modelo OCR.

Fase: **10 (extendida)** · Rama: `Feature-App-Stack-V6` · Fecha: 2026-05-26

---

## 1. Migración de base de datos

Archivo: `Scannet/database/migration_admin_consent.sql` — **ya ejecutada en Supabase**.

```sql
ALTER TABLE perfil_usuario
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
  CHECK (role IN ('user', 'admin'));

ALTER TABLE ticket
  ADD COLUMN IF NOT EXISTS consentimiento_entrenamiento BOOLEAN DEFAULT NULL;
```

- `perfil_usuario.role` — `'user'` por defecto; `'admin'` se promueve manualmente.
- `ticket.consentimiento_entrenamiento` — tri-valor: `true` (consentido), `false`
  (ya exportado o rechazado), `null` (aún no preguntado).

Para promover un usuario a admin:

```sql
UPDATE perfil_usuario SET role = 'admin' WHERE id = '<uuid-del-usuario>';
```

---

## 2. Consentimiento de entrenamiento post-scan

### Flujo

1. Usuario escanea ticket → confirma datos en VerifyForm → se persisten en BD.
2. Tras el INSERT exitoso, `ScanContext` pasa a estado `consent` y guarda
   `ticketGuardadoId`.
3. `Scan.tsx` renderiza `ConsentDialog` (centrado, overlay oscuro) con dos
   opciones: **No, gracias** / **Sí, contribuir**.
4. Si acepta → `UPDATE ticket SET consentimiento_entrenamiento = true WHERE id = …`.
5. Si rechaza → no se escribe nada; queda `null`.
6. En ambos casos, `cancelar()` + redirect a `/`.

### Archivos

| Archivo | Rol |
|---|---|
| `src/components/ConsentDialog.tsx` | Componente de diálogo |
| `src/context/ScanContext.tsx` | Estado `consent` + `ticketGuardadoId` |
| `src/pages/Scan.tsx` | Renderizado del dialog cuando `estado === 'consent'` |

### Detalles UX

- Dialog centrado vertical y horizontalmente en cualquier viewport
  (`items-center` siempre, sin variante mobile bottom-sheet).
- Botones deshabilitados durante el `UPDATE` para evitar doble click.

---

## 3. Panel de Administración

Visible en `Cuenta.tsx` **solo si `perfil.role === 'admin'`**. Componente
principal: `src/components/AdminPanel.tsx`. Datos vía hook `useAdminData.ts`.

### 3.1 Lista de usuarios consentidos

Endpoint: `GET /api/admin/users`

- Valida `Authorization: Bearer <jwt>` y comprueba `role === 'admin'`
  (403 si no lo es).
- Devuelve todos los perfiles con: `email` (vía `auth.admin.listUsers()`),
  `role`, `created_at`, `ticket_count`, `consented_count`.

UI:
- **Filtro frontend**: la lista mostrada solo contiene usuarios con
  `consented_count > 0` — los demás no aportan al dataset y no aparecen.
- Cabecera: `N usuarios · M tickets con consentimiento`.
- Cada fila es expandible: muestra email, contadores, badge `admin` si aplica.

### 3.2 Detalle de tickets por usuario

Endpoint: `GET /api/admin/tickets?userId=<uuid>`

- Mismo gate de admin.
- Devuelve tickets del usuario con: `comercio`, `fecha`, `metodo_pago`,
  `verificado`, `json_extraido` (raw OCR), `imagen_url`,
  `consentimiento_entrenamiento`, `timestamp`.

UI (componente interno `UserRow`):
- Click en la fila → fetch + expansión.
- **Anti toggle-spam**: el botón queda `disabled` con `cursor-wait` mientras
  carga; clics extra durante la carga se ignoran (`if (loading) return`).
- **Caché por instancia**: la primera carga se guarda en `useState`;
  toggles posteriores son instantáneos.
- Tabla: Comercio / Fecha / Consent. (✓ Sí / ✗ No / —) / JSON (botón
  "Ver JSON" expandible).

### 3.3 Exportación del dataset (irreversible)

Endpoint: `GET /api/admin/export?onlyConsented=true`

Algoritmo:

1. Selecciona tickets `verificado=true` (y `consentimiento_entrenamiento=true`
   si `onlyConsented=true`, default).
2. Para cada ticket con `imagen_url`, genera **signed URL** (válida 7 días)
   contra Supabase Storage.
3. Construye un JSONL con una línea por ticket:
   ```json
   {
     "image_url": "...", "image_path": "...", "ground_truth": "...",
     "usuario_id": "...", "comercio": "...", "fecha": "...",
     "consentimiento_entrenamiento": true, "timestamp": "..."
   }
   ```
4. **CRÍTICO** — tras generar el JSONL: ejecuta
   `UPDATE ticket SET consentimiento_entrenamiento = false WHERE id IN (...)`.
   Los tickets exportados dejan de aparecer en futuras exportaciones.
5. Devuelve el archivo con `Content-Disposition: attachment;
   filename="scannet_export_<YYYY-MM-DD>.jsonl"`.

UI:
- Botón **"Exportar dataset (N)"** con N = total de tickets consentidos.
- Click → `window.confirm` con texto:
  > Vas a exportar N ticket(s) con consentimiento.
  >
  > Esta acción es IRREVERSIBLE: con el fin de no repetir datos, los
  > tickets exportados dejarán de aparecer en futuras exportaciones.
  > Solo podrás extraerlos una vez.
  >
  > ¿Continuar?
- Si confirma → descarga + `fetchUsers()` refresca la vista, los usuarios
  exportados desaparecen o caen a 0 consentidos.
- Si tras un export no queda nadie con consentidos → **placeholder**:
  > 📭 No hay tickets pendientes de exportar.
  > A la espera de que los usuarios suban tickets de prueba y den su consentimiento.
  > Los tickets ya exportados no vuelven a aparecer aquí.

---

## 4. Backend — paridad entre Vercel Functions y dev local

Las 3 rutas admin existen en dos lugares con la misma lógica:

| Ruta | Producción (Vercel) | Dev local (Node) |
|---|---|---|
| `GET /api/admin/users` | `api/admin/users.ts` | `local-dev-server.cjs → handleAdminUsers` |
| `GET /api/admin/tickets` | `api/admin/tickets.ts` | `local-dev-server.cjs → handleAdminTickets` |
| `GET /api/admin/export` | `api/admin/export.ts` | `local-dev-server.cjs → handleAdminExport` |

Helper compartido `ensureAdmin(token)` en `local-dev-server.cjs` que valida
JWT + role admin (idéntico al patrón inline de cada Function).

---

## 5. Fixes adicionales aplicados en la misma sesión

Bugs detectados durante las pruebas locales del flujo admin completo:

### 5.1 Bug 409 en `ticket_producto` (bloqueante para guardar)

**Síntoma:** al guardar un ticket con dos líneas de mismo
`descripcion + precio_unitario`, el segundo `INSERT` en `ticket_producto`
violaba la `UNIQUE (ticket_id, producto_id)` → 409 → el flujo abortaba
antes del `setEstado('consent')`, por lo que tampoco aparecía el ConsentDialog.

**Fix:** en `ScanContext.guardar()`, agregar las líneas con la misma clave
`descripcion+precio` antes del loop de inserción:

```ts
const itemsAgregados = Object.values(
  itemsValidos.reduce<Record<string, ProductoOCR>>((acc, item) => {
    const key = `${item.descripcion.trim().toLowerCase()}|${item.precio}`
    if (acc[key]) acc[key].cantidad += item.cantidad
    else acc[key] = { ...item, descripcion: item.descripcion.trim() }
    return acc
  }, {})
)
```

### 5.2 VerifyForm pierde ediciones al cruzar breakpoint 768px

**Síntoma:** `Scan.tsx` renderiza dos `<VerifyForm>` distintos (uno para
desktop `hidden md:flex`, otro para mobile `md:hidden`). Cada uno tenía
su propio `useState`. Al cruzar el breakpoint, el otro instance se
mostraba con sus valores iniciales (los del OCR) → parecía perder lo
escrito.

**Fix:** el estado editable (`comercio`, `fecha`, `metodo`, `items`) sube
a `Scan.tsx` como `verifyState`. Se inicializa en un `useEffect` cuando
llega `resultado`. Ambos `<VerifyForm>` reciben el mismo `state` +
`setState` por props → escritura única, lectura compartida.

`VerifyForm` se convierte en componente controlado (export del tipo
`VerifyFormState`).

### 5.3 ConsentDialog descentrado en viewports < 640px

**Síntoma:** el dialog usaba `items-end sm:items-center` → en mobile
se anclaba al fondo justo sobre la BottomNav.

**Fix:** `items-center` sin variantes → centrado en cualquier viewport.

---

## 6. Variables de entorno requeridas

Sin novedades respecto a Fase 9. Las rutas admin reutilizan:

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY   ← obligatoria (admin client bypassa RLS)
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
DEEPSEEK_API_KEY
OCR_SPACE_API_KEY
```

Recordatorio: las **Sensitive** en Vercel no pueden vivir en Development;
crear entradas paralelas (mismo nombre, distinto environment, no marcadas
como Sensitive) o usar `local-dev-server.cjs` que lee de `.env.local`.

---

## 7. Estado de despliegue

| Ítem | Estado |
|---|---|
| Migración SQL en Supabase | ✅ Ejecutada |
| Backend Functions (`api/admin/*.ts`) | ✅ Implementado |
| Backend dev local (`local-dev-server.cjs`) | ✅ Implementado |
| Frontend (`AdminPanel`, `ConsentDialog`, hook) | ✅ Implementado |
| Fixes 409 / breakpoint / dialog | ✅ Aplicados |
| Tests E2E para admin | ❌ Pendiente |
| Promoción del primer admin en producción | ⚠️ Acción manual tras deploy |
| Commit + push | ⚠️ Pendiente |

---

## 8. Cómo probar end-to-end localmente

1. Arrancar backend dev y frontend:
   ```powershell
   # Terminal A
   node local-dev-server.cjs
   # Terminal B
   npm run dev
   ```
2. Login con un usuario marcado como `admin` (ver SQL §1).
3. Ir a Cuenta → debe aparecer el bloque "Panel de Administración".
4. Escanear un ticket de prueba con otro usuario, aceptar consentimiento.
5. Volver al admin → ese usuario debe aparecer con `1 consentimiento`.
6. Pulsar "Exportar dataset (1)" → confirmar el dialog irreversible.
7. Comprobar:
   - Se descarga `scannet_export_<fecha>.jsonl` con una línea válida.
   - La lista de admin queda vacía → aparece el placeholder.
   - En Supabase, ese ticket tiene `consentimiento_entrenamiento = false`.

---

## 9. Archivos tocados/creados en esta entrega

**Nuevos:**
- `Scannet/api/admin/users.ts`
- `Scannet/api/admin/tickets.ts`
- `Scannet/api/admin/export.ts`
- `Scannet/src/components/AdminPanel.tsx`
- `Scannet/src/components/ConsentDialog.tsx`
- `Scannet/src/hooks/useAdminData.ts`
- `Scannet/database/migration_admin_consent.sql`
- `Scannet/Documentation/ExportarAdmin.md` (este documento)

**Modificados:**
- `Scannet/local-dev-server.cjs` — rutas admin + marcado consent=false
- `Scannet/src/context/ScanContext.tsx` — estado `consent`, agregación items, ticketGuardadoId
- `Scannet/src/components/VerifyForm.tsx` — componente controlado
- `Scannet/src/pages/Scan.tsx` — lifting state, renderizado ConsentDialog
- `Scannet/src/pages/Cuenta.tsx` — mostrar AdminPanel si role admin
- `Scannet/src/hooks/usePerfil.ts` — exponer `role`
