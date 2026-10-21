-- bases: bdi
-- 21-oct-2026 · sesión B (Bases): el estado del vigía de la puerta del ERP (`api/_vigia-erp.js`, lib/vigia-erp.core.js).
-- Una fila por puerta: cuántas fallas seguidas lleva, desde cuándo está caída y si ya se avisó (un mail al caer y uno al
-- volver, ⛔ uno por corrida). La escribe sólo el servidor con la service key: RLS prendido, sin políticas ni grants.
create table if not exists vigia_puerta (
  puerta          text primary key,
  fallas_seguidas integer not null default 0,
  caida_desde     timestamptz,
  avisado         boolean not null default false,
  ultima_sonda    timestamptz,
  ultimo_detalle  text
);
alter table vigia_puerta enable row level security;
