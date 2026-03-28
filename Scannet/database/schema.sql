-- ============================================================
-- Scannet — Schema PostgreSQL para Supabase
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================

-- ============================================================
-- TABLA: categoria
-- Categorías fijas del sistema (v1.0 — no personalizables)
-- ============================================================
CREATE TABLE IF NOT EXISTS categoria (
  id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE
);

-- ============================================================
-- TABLA: perfil_usuario
-- Datos de perfil vinculados a auth.users de Supabase.
-- Se crea automáticamente al registrarse (trigger).
-- ============================================================
CREATE TABLE IF NOT EXISTS perfil_usuario (
  id                      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  gasto_mensual_estimado  numeric,          -- onboarding pregunta 1 (nullable)
  ahorro_deseado          numeric,          -- onboarding pregunta 2 (nullable)
  gastos_fijos            text,             -- onboarding pregunta 3 (nullable)
  tema_oscuro             boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- TABLA: ticket
-- Un ticket por escaneo. La unidad mínima real es el producto.
-- ============================================================
CREATE TABLE IF NOT EXISTS ticket (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  imagen_url    text,                        -- ruta en Supabase Storage
  json_extraido jsonb,                       -- resultado raw del modelo OCR
  metodo_pago   text CHECK (metodo_pago IN ('efectivo', 'tarjeta')),
  fecha         date,                        -- extraída por OCR
  comercio      text,                        -- extraído por OCR
  categoria_id  uuid REFERENCES categoria(id),
  verificado    boolean NOT NULL DEFAULT false,
  timestamp     timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- TABLA: producto
-- Líneas individuales de cada ticket.
-- ============================================================
CREATE TABLE IF NOT EXISTS producto (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id        uuid NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
  descripcion      text NOT NULL,
  cantidad         numeric NOT NULL DEFAULT 1,
  precio_unitario  numeric NOT NULL DEFAULT 0,
  precio_total     numeric NOT NULL DEFAULT 0
);

-- ============================================================
-- ROW LEVEL SECURITY
-- Cada usuario solo accede a sus propios datos.
-- ============================================================
ALTER TABLE perfil_usuario ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket          ENABLE ROW LEVEL SECURITY;
ALTER TABLE producto        ENABLE ROW LEVEL SECURITY;
ALTER TABLE categoria       ENABLE ROW LEVEL SECURITY;

-- perfil_usuario: el usuario solo ve y edita su propio perfil
CREATE POLICY "perfil_usuario: solo el propio usuario"
  ON perfil_usuario
  FOR ALL
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ticket: el usuario solo ve y edita sus propios tickets
CREATE POLICY "ticket: solo el propio usuario"
  ON ticket
  FOR ALL
  USING (auth.uid() = usuario_id)
  WITH CHECK (auth.uid() = usuario_id);

-- producto: accesible si el ticket pertenece al usuario
CREATE POLICY "producto: solo el propio usuario"
  ON producto
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM ticket t
      WHERE t.id = producto.ticket_id
        AND t.usuario_id = auth.uid()
    )
  );

-- categoria: lectura pública (son fijas del sistema)
CREATE POLICY "categoria: lectura publica"
  ON categoria
  FOR SELECT
  USING (true);

-- ============================================================
-- TRIGGER: crear perfil_usuario automáticamente al registrarse
-- ============================================================
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

-- ============================================================
-- DATOS INICIALES: categorías fijas del sistema
-- ============================================================
INSERT INTO categoria (nombre) VALUES
  ('Alimentación'),
  ('Transporte'),
  ('Ocio'),
  ('Hogar'),
  ('Salud'),
  ('Otros')
ON CONFLICT (nombre) DO NOTHING;
