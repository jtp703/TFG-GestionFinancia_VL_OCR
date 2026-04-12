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
-- Catálogo compartido de productos. Único por (descripcion, precio_unitario).
-- La relación con tickets se gestiona mediante ticket_producto.
-- ============================================================
CREATE TABLE IF NOT EXISTS producto (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  descripcion      text NOT NULL,
  precio_unitario  numeric NOT NULL DEFAULT 0
);

-- Índice único case-insensitive: evita duplicados como "Leche" y "LECHE" al mismo precio
CREATE UNIQUE INDEX IF NOT EXISTS producto_lower_desc_precio_unique
  ON producto (lower(descripcion), precio_unitario);

-- ============================================================
-- TABLA: ticket_producto
-- Relación N:M entre ticket y producto (tabla intermedia).
-- Almacena cantidad y precio_total de ese producto en ese ticket.
-- ============================================================
CREATE TABLE IF NOT EXISTS ticket_producto (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    uuid NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
  producto_id  uuid NOT NULL REFERENCES producto(id) ON DELETE CASCADE,
  cantidad     numeric NOT NULL DEFAULT 1,
  precio_total numeric NOT NULL DEFAULT 0,
  UNIQUE (ticket_id, producto_id)
);

-- ============================================================
-- TABLA: gasto_fijo
-- Gastos fijos mensuales del usuario (alquiler, suscripciones, etc.)
-- Se integran en el donut junto con los gastos de tickets.
-- ============================================================
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

-- ============================================================
-- ROW LEVEL SECURITY
-- Cada usuario solo accede a sus propios datos.
-- ============================================================
ALTER TABLE perfil_usuario  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket           ENABLE ROW LEVEL SECURITY;
ALTER TABLE producto         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_producto  ENABLE ROW LEVEL SECURITY;
ALTER TABLE categoria        ENABLE ROW LEVEL SECURITY;
ALTER TABLE gasto_fijo       ENABLE ROW LEVEL SECURITY;

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

-- producto: catálogo compartido — cualquier usuario autenticado puede leer e insertar
CREATE POLICY "producto: lectura autenticada"
  ON producto FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "producto: insertar autenticado"
  ON producto FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

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

-- gasto_fijo: solo el propio usuario
CREATE POLICY "gasto_fijo: solo el propio usuario"
  ON gasto_fijo FOR ALL
  USING  (auth.uid() = usuario_id)
  WITH CHECK (auth.uid() = usuario_id);

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
