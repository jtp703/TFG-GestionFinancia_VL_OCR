-- ============================================================
-- MIGRACIÓN: producto pasa a ser catálogo + tabla ticket_producto
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- Fecha: 2026-04-12
-- ============================================================

-- PASO 1: Crear tabla ticket_producto (relación N:M ticket ↔ producto)
CREATE TABLE IF NOT EXISTS ticket_producto (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    uuid NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
  producto_id  uuid NOT NULL REFERENCES producto(id) ON DELETE CASCADE,
  cantidad     numeric NOT NULL DEFAULT 1,
  precio_total numeric NOT NULL DEFAULT 0,
  UNIQUE (ticket_id, producto_id)
);

-- PASO 2: Poblar ticket_producto con los datos actuales de producto
INSERT INTO ticket_producto (ticket_id, producto_id, cantidad, precio_total)
SELECT ticket_id, id, cantidad, precio_total
FROM producto
WHERE ticket_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- PASO 3: Resolver duplicados en producto antes de añadir el constraint UNIQUE
-- Crear tabla temporal con el id canónico por (descripcion, precio_unitario)
CREATE TEMP TABLE producto_canonical AS
SELECT DISTINCT ON (lower(descripcion), precio_unitario)
  id AS canonical_id,
  lower(descripcion) AS descripcion_lower,
  precio_unitario
FROM producto
ORDER BY lower(descripcion), precio_unitario, id;

-- Redirigir ticket_producto al id canónico para duplicados
UPDATE ticket_producto tp
SET producto_id = pc.canonical_id
FROM producto p
JOIN producto_canonical pc
  ON lower(p.descripcion) = pc.descripcion_lower
 AND p.precio_unitario    = pc.precio_unitario
WHERE tp.producto_id = p.id
  AND p.id != pc.canonical_id;

-- Eliminar los productos no canónicos
DELETE FROM producto p
WHERE NOT EXISTS (
  SELECT 1 FROM producto_canonical pc WHERE pc.canonical_id = p.id
);

-- PASO 4: Quitar columnas que ya no pertenecen al catálogo
ALTER TABLE producto DROP COLUMN IF EXISTS ticket_id;
ALTER TABLE producto DROP COLUMN IF EXISTS cantidad;
ALTER TABLE producto DROP COLUMN IF EXISTS precio_total;

-- PASO 5: Añadir índice único funcional (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS producto_lower_desc_precio_unique
  ON producto (lower(descripcion), precio_unitario);

-- PASO 6: Habilitar RLS en ticket_producto
ALTER TABLE ticket_producto ENABLE ROW LEVEL SECURITY;

-- ticket_producto: leer si el ticket pertenece al usuario
CREATE POLICY "ticket_producto: leer propios"
  ON ticket_producto FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ticket t
      WHERE t.id = ticket_producto.ticket_id
        AND t.usuario_id = auth.uid()
    )
  );

-- ticket_producto: insertar si el ticket pertenece al usuario
CREATE POLICY "ticket_producto: insertar para propietario"
  ON ticket_producto FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ticket t
      WHERE t.id = ticket_producto.ticket_id
        AND t.usuario_id = auth.uid()
    )
  );

-- PASO 7: Actualizar RLS de producto (ahora es catálogo compartido)
DROP POLICY IF EXISTS "producto: solo el propio usuario" ON producto;

-- Cualquier usuario autenticado puede leer el catálogo
CREATE POLICY "producto: lectura autenticada"
  ON producto FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Cualquier usuario autenticado puede insertar nuevos productos al catálogo
CREATE POLICY "producto: insertar autenticado"
  ON producto FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
