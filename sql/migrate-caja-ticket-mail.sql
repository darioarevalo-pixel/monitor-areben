-- Caja, F4: el ticket por mail. Correr en el proyecto Supabase de ZATTIA, ANTES de deployar el
-- código que lo usa (`lib/caja/enviar.core.js` lee la columna en cada venta: sin ella, la Caja ⛔
-- confirma).
--
-- `ticket_mail` dice cómo quedó el pedido al mailer (`lib/caja/ticket-mail.core.js`):
--   null           → todavía ⛔ se pidió (venta sin mail, o el mailer sin configurar)
--   encolado       → el mailer dio de alta el mail y encoló el comprobante
--   ya estaba      → ya estaba encolado (reintento)
--   sin automation → el mail quedó en la base, pero el mail del ticket está apagado en el mailer
--   error: …       → ⛔ salió; el respaldo (`scripts/caja-reintentar.mjs`) lo reintenta 48 h
alter table caja_venta add column if not exists ticket_mail text;

-- VERIFICACIÓN (tiene que devolver una fila):
--   select column_name, data_type from information_schema.columns
--   where table_name = 'caja_venta' and column_name = 'ticket_mail';
