CREATE TABLE IF NOT EXISTS gasto_fijo (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre       text NOT NULL,
  precio       numeric NOT NULL DEFAULT 0,
  emoji        text,
  categoria_id uuid REFERENCES categoria(id),
  activo       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE gasto_fijo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gasto_fijo: solo el propio usuario"
  ON gasto_fijo FOR ALL
  USING  (auth.uid() = usuario_id)
  WITH CHECK (auth.uid() = usuario_id);
