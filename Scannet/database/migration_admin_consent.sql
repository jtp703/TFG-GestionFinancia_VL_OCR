-- Migración: rol de administrador + consentimiento de entrenamiento
-- Ejecutar en Supabase SQL Editor

-- 1. Añadir columna role a perfil_usuario
ALTER TABLE perfil_usuario
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
  CHECK (role IN ('user', 'admin'));

-- 2. Añadir columna consentimiento_entrenamiento a ticket
ALTER TABLE ticket
  ADD COLUMN IF NOT EXISTS consentimiento_entrenamiento BOOLEAN DEFAULT NULL;

-- Para crear el primer administrador, ejecutar:
-- UPDATE perfil_usuario SET role = 'admin' WHERE id = '<uuid-del-usuario>';
