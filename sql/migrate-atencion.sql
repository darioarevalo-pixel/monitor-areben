-- "Atención al cliente": los links y mensajes que el equipo copia y pega en Instagram y WhatsApp.
--
-- Sólo se guarda lo que carga una persona. Los links de fundas por modelo de celular NO están acá:
-- se leen del menú público de la tienda en cada carga (ver lib/atencion/modelos.core.js), así que
-- cuando sale un iPhone nuevo aparece solo y nadie tiene que acordarse de agregarlo.
--
-- Una fila por item, con el documento entero en `datos`, mismo criterio que `disenos` y
-- `solicitudes`: el motor sigue manipulando el mismo objeto y sumar un campo no es una migración.
--
-- Correr con `node scripts/apply-atencion.mjs`. Idempotente.

create table if not exists atencion (
  id          text not null,
  store       text not null,                          -- 'bdi' | 'zattia'
  tipo        text,                                    -- 'link' | 'mensaje' | la plantilla de modelo
  datos       jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (store, id)
);

create index if not exists idx_atencion_store on atencion (store, updated_at desc);

alter table atencion disable row level security;
