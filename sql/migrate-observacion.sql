-- Agrega la columna observation (ubicación física que viene de GN) a inventario.
-- Correr en el SQL editor de Supabase (BDI). Idempotente.
ALTER TABLE inventario ADD COLUMN IF NOT EXISTS observation TEXT;
