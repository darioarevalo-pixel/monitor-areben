-- Cambios — solicitud de envío (EMXXXX) + tracking de vuelta. Idempotente.
-- `seguimiento` (ya existe) = código de ida; `seguimiento_vuelta` = código de vuelta (solo correo/andreani).
-- Correr en Supabase de BDI y ZATTIA.
alter table cambios add column if not exists solicitud_envio    text; -- código de pedido de etiqueta (EMXXXX)
alter table cambios add column if not exists seguimiento_vuelta text; -- tracking del envío de vuelta
