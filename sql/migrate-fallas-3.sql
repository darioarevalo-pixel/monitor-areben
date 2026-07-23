-- Fallas — precio de lista (retailer_price de GN). Idempotente.
-- La venta técnica de la falla se arma a este precio + 100% de descuento (neto $0, pero valuada real).
-- Correr en Supabase de BDI y ZATTIA.
alter table fallas_deposito add column if not exists precio_lista numeric;
