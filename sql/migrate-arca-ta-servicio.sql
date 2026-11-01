-- El permiso de WSAA (TA) de los servicios de ARCA que ⛔ son la factura: hoy, el PADRÓN (`ws_sr_constancia_inscripcion`,
-- habilitado por Bruno el 31-oct, F. 3283/E). WSAA da un TA POR SERVICIO y ⛔ da otro mientras uno está vigente: guardado
-- en `arca_ta` pisaría el de la factura. Tabla APARTE a propósito: `arca_ta` (la factura viva) ⛔ se toca.
-- Va SÓLO a la base de BDI (la del monitor: el CUIT y los permisos de ARCA viven ahí). Idempotente.
--
-- VERIFICACIÓN:
--   select servicio, ambiente, vence from arca_ta_servicio;      (vacía hasta la 1ª consulta del padrón)
-- ROLLBACK:
--   drop table if exists arca_ta_servicio;

create table if not exists arca_ta_servicio (
  ambiente    text not null check (ambiente in ('homologacion', 'produccion')),
  servicio    text not null check (servicio <> 'wsfe'),
  token       text not null,
  sign        text not null,
  vence       timestamptz not null,
  pedido_en   timestamptz not null default now(),
  primary key (ambiente, servicio)
);

-- El navegador no lee Supabase (Fase S): RLS prendido y sin políticas ⇒ sólo la service key.
alter table arca_ta_servicio enable row level security;
