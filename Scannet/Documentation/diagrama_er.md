# Diagrama Entidad-Relación — Scannet

Base de datos PostgreSQL alojada en Supabase.
Generado: 2026-05-23

---

```plantuml
@startuml Scannet_ER

skinparam linetype ortho
skinparam roundcorner 8
skinparam entityBackgroundColor #F9FAFB
skinparam entityBorderColor #374151
skinparam entityFontSize 13
skinparam arrowColor #6B7280

' ─────────────────────────────────────────────────
' Entidades
' ─────────────────────────────────────────────────

entity "auth.users\n(Supabase Auth)" as users {
  * id : uuid <<PK>>
  --
  email : text
  created_at : timestamptz
}

entity "perfil_usuario" as perfil {
  * id : uuid <<PK, FK→users>>
  --
  gasto_mensual_estimado : numeric
  ahorro_deseado : numeric
  gastos_fijos : text
  tema_oscuro : boolean
  created_at : timestamptz
}

entity "categoria" as categoria {
  * id : uuid <<PK>>
  --
  nombre : text UNIQUE
}
note right of categoria
  Valores fijos v1.0:
  'Alimentación', 'Transporte',
  'Ocio', 'Hogar', 'Salud', 'Otros'
end note

entity "ticket" as ticket {
  * id : uuid <<PK>>
  --
  usuario_id : uuid <<FK→users>>
  imagen_url : text
  json_extraido : jsonb
  metodo_pago : text
  fecha : date
  comercio : text
  categoria_id : uuid <<FK→categoria>>
  verificado : boolean
  timestamp : timestamptz
}
note right of ticket
  metodo_pago CHECK
  IN ('efectivo', 'tarjeta')
  Detectar duplicados por
  (comercio + fecha + total)
end note

entity "producto" as producto {
  * id : uuid <<PK>>
  --
  descripcion : text
  precio_unitario : numeric
}
note right of producto
  UNIQUE (lower(descripcion),
  precio_unitario)
end note

entity "ticket_producto" as ticket_producto {
  * id : uuid <<PK>>
  --
  ticket_id : uuid <<FK→ticket>>
  producto_id : uuid <<FK→producto>>
  cantidad : numeric
  precio_total : numeric
}
note right of ticket_producto
  UNIQUE (ticket_id, producto_id)
end note

entity "gasto_fijo" as gasto_fijo {
  * id : uuid <<PK>>
  --
  usuario_id : uuid <<FK→users>>
  nombre : text
  precio : numeric
  emoji : text
  categoria_id : uuid <<FK→categoria>>
  activo : boolean
  created_at : timestamptz
}

' ─────────────────────────────────────────────────
' Relaciones
' ─────────────────────────────────────────────────

users ||--|| perfil           : "1:1\nON DELETE CASCADE"
users ||--o{ ticket           : "1:N\nON DELETE CASCADE"
users ||--o{ gasto_fijo       : "1:N\nON DELETE CASCADE"

categoria ||--o{ ticket       : "1:N (nullable)"
categoria ||--o{ gasto_fijo   : "1:N (nullable)"

ticket ||--o{ ticket_producto : "1:N\nON DELETE CASCADE"
producto ||--o{ ticket_producto : "1:N\nON DELETE CASCADE"

@enduml
```

---

## Notas de diseño

| Decisión | Motivo |
|----------|--------|
| `producto` separado de `ticket_producto` | Normalización: evita duplicar descripción/precio en cada ticket |
| `categoria` fija en v1.0 | Simplifica categorización LLM; personalizable en v2.0 |
| `json_extraido` jsonb | Preserva el raw del OCR para re-entrenamiento futuro |
| `verificado` boolean | Solo datos confirmados por el usuario se usan para métricas |
| `perfil_usuario` 1:1 con `auth.users` | Extiende el usuario Supabase sin modificar `auth.users` |
