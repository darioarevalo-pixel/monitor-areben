-- Agrega la columna observation (ubicación física que viene de GN) a inventario.
-- Correr en el SQL editor de Supabase en AMBOS proyectos: BDI y Zattia. Idempotente.
-- Nota: si falta en Zattia, el sync rápido no rompe (reintenta sin observation, manteniendo sku/barcode),
-- pero conviene tenerla para paridad de esquema y para usar ubicaciones en Zattia a futuro.
ALTER TABLE inventario ADD COLUMN IF NOT EXISTS observation TEXT;
