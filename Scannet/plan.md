# Scannet — Plan de desarrollo

> Actualizado: 2026-04-11 | Rama: `Feature-App-Stack`

---

## Estado de fases

| Fase | Nombre | Estado |
|------|--------|--------|
| 1 | Setup | ✅ |
| 2 | Base de datos | ✅ |
| 3 | Autenticación | ✅ |
| 4 | Navegación | ✅ |
| 5 | Gestionar Gastos | ✅ |
| 6 | Escanear Ticket | ✅ |
| 7 | Categorización | ✅ |
| 8 | Cuenta | ✅ |
| 8.1 | Mejoras pre-deploy | ✅ |
| **9** | **QA y Deploy** | **⏳ Siguiente** |

---

## Fase actual — 9: QA y Deploy

### Prerequisitos antes de empezar

- [ ] Worker RunPod operativo
  - [ ] Container Disk → 20 GB en RunPod dashboard (sin rebuild)
  - [ ] Fix check caché handler.py → rebuild → push
- [ ] Bucket `tickets` privado creado en Supabase Storage
- [ ] Probar flujo completo con `vercel dev` + imagen real de ticket

### Tareas

| # | Tarea | Estado |
|---|-------|--------|
| 9.1 | QA end-to-end en local (`vercel dev`) | ⏳ |
| 9.2 | Configurar variables de entorno en Vercel dashboard | ⏳ |
| 9.3 | Deploy en Vercel (`Feature-App-Stack` como rama de producción) | ⏳ |
| 9.4 | Smoke test en producción con ticket real | ⏳ |

### Notas

- `USE_MOCK_OCR=true` activo — cambiar a `false` cuando RunPod esté validado
- Variables Vercel a añadir: `RUNPOD_API_KEY`, `RUNPOD_ENDPOINT_ID`
- Variables Vercel a eliminar: `HF_API_TOKEN`, `HF_MODEL_ID`
- Consultar Notion antes de iniciar
