ALTER TABLE perfil_usuario
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
  CHECK (role IN ('user', 'admin'));

ALTER TABLE ticket
  ADD COLUMN IF NOT EXISTS consentimiento_entrenamiento BOOLEAN DEFAULT NULL;
