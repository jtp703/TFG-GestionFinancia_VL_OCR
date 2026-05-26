---
Última actualización: 2026-05-25
---

## Estado actual de Scannet

- **Rama activa:** `Feature-App-Stack-V6` → producción en Vercel
- **Pipeline OCR:** OCR.space (texto) → DeepSeek chat (JSON). RunPod descartado.
- **Fase 10 completada:** Admin Dashboard + Consentimiento de Entrenamiento (2026-05-25)
- **Tests E2E:** 4 specs Playwright (`auth`, `scan`, `gastosFijos`, `home`)
- **Estado general:** estable, pendiente ejecutar migración SQL en Supabase

## Lo que existe ahora mismo

### Arquitectura de estado del scan
- `ScanContext.tsx` — máquina de estados: `idle | loading | verify | guardando | consent | error | success`
- Estado `consent` nuevo: tras guardar, se muestra `ConsentDialog` antes de redirigir a `/`
- `ticketGuardadoId` en el context: ID del último ticket guardado (para el dialog de consentimiento)

### Pipeline scan completo (actualizado)
1. Usuario captura con cámara o galería
2. Imagen comprimida → base64
3. `POST /api/scan` → OCR.space → DeepSeek → JSON
4. Estado `verify` → VerifyForm editable
5. Dialog de confirmación "¿Todo es correcto?"
6. `POST /api/categorize` + INSERT en `ticket` + `producto` + `ticket_producto`
7. `notify.ok('Ticket guardado')` → estado `consent`
8. `ConsentDialog` pregunta si el usuario permite usar el ticket para entrenamiento
9. Respuesta → `cancelar()` + redirect a `/`

### Sistema admin
- `api/admin/users.ts` → GET /api/admin/users (lista usuarios + conteos)
- `api/admin/tickets.ts` → GET /api/admin/tickets?userId=xxx (tickets de un usuario)
- `api/admin/export.ts` → GET /api/admin/export?onlyConsented=true (descarga JSONL)
- `AdminPanel.tsx` → visible en `Cuenta.tsx` solo si `perfil.role === 'admin'`
- `useAdminData.ts` → hook que orquesta las llamadas admin

### Columnas de BD nuevas (pendiente migración)
- `perfil_usuario.role` TEXT DEFAULT 'user' (valores: 'user' | 'admin')
- `ticket.consentimiento_entrenamiento` BOOLEAN DEFAULT NULL

## Próximo paso obligatorio

**Ejecutar migración SQL en Supabase:**
```sql
-- Copiar contenido de database/migration_admin_consent.sql
-- Ejecutar en Supabase SQL Editor
```

Luego promover al primer admin:
```sql
UPDATE perfil_usuario SET role = 'admin' WHERE id = '<uuid-del-usuario>';
```
