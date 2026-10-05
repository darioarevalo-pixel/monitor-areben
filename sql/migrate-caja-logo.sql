-- Caja: el LOGO DEL TICKET (Bruno, 5-oct-2026: «posibilidad en la configuración de cargar logo para
-- el ticket, o png»). Correr en el proyecto Supabase de ZATTIA. Puede ir antes o después del push:
-- sin la columna, el ticket sale con el nombre en texto y cargar el logo contesta 409.
--
-- `ticket_logo`: { src: 'data:image/png;base64,…', ancho, alto } (píxeles). La pantalla lo achica a
--   400 px de ancho antes de mandarlo; el servidor ⛔ acepta más de 300 KB. null = sin logo.
--
-- VERIFICACIÓN (tiene que dar una fila):
--   select column_name, data_type from information_schema.columns
--   where table_name = 'caja_config' and column_name = 'ticket_logo';

alter table caja_config add column if not exists ticket_logo jsonb;
