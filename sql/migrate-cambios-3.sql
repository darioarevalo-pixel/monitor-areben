-- Cambios Fase B.4 — Solicitud (borrador) + envío + forma de pago + venta GN real. Idempotente.
-- El cambio ahora NACE como 'borrador' (se completa después: nuevo/envío/pago); la venta REAL en GN
-- (precio real, canal normal → CUENTA en la analítica) se dispara al PROCESAR (pagado + envío confirmado).
-- Correr en Supabase de BDI y ZATTIA.
alter table cambios add column if not exists envio_costo     numeric;              -- costo del envío
alter table cambios add column if not exists envio_paga      text;                 -- 'nosotros' | 'cliente'
alter table cambios add column if not exists forma_pago      text;                 -- 'tarjeta' | 'transferencia'
alter table cambios add column if not exists descuento_forma numeric;              -- % de descuento sobre la diferencia
alter table cambios add column if not exists pagado          boolean not null default false;
alter table cambios add column if not exists cobro_estado    text not null default 'no_aplica'; -- 'no_aplica'|'pendiente'|'cobrado'
alter table cambios add column if not exists total           numeric;              -- (dif − descuento) + envío a cobrar
alter table cambios add column if not exists gn_venta_id     text;                 -- venta REAL del cambio (procesar)
alter table cambios add column if not exists gn_venta_number text;
