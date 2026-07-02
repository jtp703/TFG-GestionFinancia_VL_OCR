CREATE TABLE IF NOT EXISTS categoria (
  id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS perfil_usuario (
  id                      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  gasto_mensual_estimado  numeric,
  ahorro_deseado          numeric,
  gastos_fijos            text,
  tema_oscuro             boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ticket (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  imagen_url    text,
  json_extraido jsonb,
  metodo_pago   text CHECK (metodo_pago IN ('efectivo', 'tarjeta')),
  fecha         date,
  comercio      text,
  categoria_id  uuid REFERENCES categoria(id),
  verificado    boolean NOT NULL DEFAULT false,
  timestamp     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS producto (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  descripcion      text NOT NULL,
  precio_unitario  numeric NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS producto_lower_desc_precio_unique
  ON producto (lower(descripcion), precio_unitario);

CREATE TABLE IF NOT EXISTS ticket_producto (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    uuid NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
  producto_id  uuid NOT NULL REFERENCES producto(id) ON DELETE CASCADE,
  cantidad     numeric NOT NULL DEFAULT 1,
  precio_total numeric NOT NULL DEFAULT 0,
  UNIQUE (ticket_id, producto_id)
);

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

ALTER TABLE perfil_usuario  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket           ENABLE ROW LEVEL SECURITY;
ALTER TABLE producto         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_producto  ENABLE ROW LEVEL SECURITY;
ALTER TABLE categoria        ENABLE ROW LEVEL SECURITY;
ALTER TABLE gasto_fijo       ENABLE ROW LEVEL SECURITY;

CREATE POLICY "perfil_usuario: solo el propio usuario"
  ON perfil_usuario
  FOR ALL
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "ticket: solo el propio usuario"
  ON ticket
  FOR ALL
  USING (auth.uid() = usuario_id)
  WITH CHECK (auth.uid() = usuario_id);

CREATE POLICY "producto: lectura autenticada"
  ON producto FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "producto: insertar autenticado"
  ON producto FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

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

CREATE POLICY "gasto_fijo: solo el propio usuario"
  ON gasto_fijo FOR ALL
  USING  (auth.uid() = usuario_id)
  WITH CHECK (auth.uid() = usuario_id);

CREATE POLICY "categoria: lectura publica"
  ON categoria
  FOR SELECT
  USING (true);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.perfil_usuario (id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO categoria (nombre) VALUES
  ('Alimentación'),
  ('Transporte'),
  ('Ocio'),
  ('Hogar'),
  ('Salud'),
  ('Otros')
ON CONFLICT (nombre) DO NOTHING;
