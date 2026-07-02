CREATE TABLE IF NOT EXISTS ticket_producto (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    uuid NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
  producto_id  uuid NOT NULL REFERENCES producto(id) ON DELETE CASCADE,
  cantidad     numeric NOT NULL DEFAULT 1,
  precio_total numeric NOT NULL DEFAULT 0,
  UNIQUE (ticket_id, producto_id)
);

INSERT INTO ticket_producto (ticket_id, producto_id, cantidad, precio_total)
SELECT ticket_id, id, cantidad, precio_total
FROM producto
WHERE ticket_id IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE TEMP TABLE producto_canonical AS
SELECT DISTINCT ON (lower(descripcion), precio_unitario)
  id AS canonical_id,
  lower(descripcion) AS descripcion_lower,
  precio_unitario
FROM producto
ORDER BY lower(descripcion), precio_unitario, id;

UPDATE ticket_producto tp
SET producto_id = pc.canonical_id
FROM producto p
JOIN producto_canonical pc
  ON lower(p.descripcion) = pc.descripcion_lower
 AND p.precio_unitario    = pc.precio_unitario
WHERE tp.producto_id = p.id
  AND p.id != pc.canonical_id;

DELETE FROM producto p
WHERE NOT EXISTS (
  SELECT 1 FROM producto_canonical pc WHERE pc.canonical_id = p.id
);

DROP POLICY IF EXISTS "producto: solo el propio usuario" ON producto;

ALTER TABLE producto DROP COLUMN IF EXISTS ticket_id;
ALTER TABLE producto DROP COLUMN IF EXISTS cantidad;
ALTER TABLE producto DROP COLUMN IF EXISTS precio_total;

CREATE UNIQUE INDEX IF NOT EXISTS producto_lower_desc_precio_unique
  ON producto (lower(descripcion), precio_unitario);

ALTER TABLE ticket_producto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ticket_producto: leer propios"
  ON ticket_producto FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ticket t
      WHERE t.id = ticket_producto.ticket_id
        AND t.usuario_id = auth.uid()
    )
  );

CREATE POLICY "ticket_producto: insertar para propietario"
  ON ticket_producto FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ticket t
      WHERE t.id = ticket_producto.ticket_id
        AND t.usuario_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "producto: solo el propio usuario" ON producto;

CREATE POLICY "producto: lectura autenticada"
  ON producto FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "producto: insertar autenticado"
  ON producto FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
