-- Pagos recibidos: las cuentas de Mercado Pago en las que cobra cada local, y desde cuándo.
-- Correr en el proyecto Supabase de ZATTIA (la sección `pagos-recibidos` es `brands: ['zattia']`).
-- Cuando se sume BDI, correrlo también en la de BDI. Es idempotente.
--
-- 🔑 POR QUÉ EXISTE (2-oct-2026, Darío): *«las cuentas son dinámicas de cada local, nosotros definimos
-- la cuenta a cobrar»*. Cada local cobra en UNA cuenta a la vez, pero cuál cambia. La llave en una
-- variable de Vercel obligaba a entrar a Vercel en cada cambio y, peor, al mirar un día viejo lo
-- buscaba en la cuenta NUEVA. Por eso son dos tablas:
--   mp_cuentas    → una fila por cuenta, con su llave. Volver a una cuenta ya usada no pide la llave.
--   mp_cuenta_uso → una fila por cada vez que se PUSO una cuenta. ⛔ No se edita ni se elimina: es
--                   lo que dice en qué cuenta buscar cada día. La cuenta en uso es la del último `desde`.
--
-- 🔴 `token` es la llave de la cuenta de MP. El navegador ⛔ la lee nunca: todo pasa por
-- `api/_pagos-recibidos.js` con la service key, y ese handler ⛔ la devuelve en ninguna respuesta.
--
-- VERIFICACIÓN (correr después):
--   select relname, relrowsecurity from pg_class where relname in ('mp_cuentas', 'mp_cuenta_uso');
--   → dos filas, las dos con relrowsecurity = true.
--
-- ROLLBACK (se pierden las llaves cargadas; la pantalla vuelve a «cuenta no conectada»):
--   drop table if exists mp_cuenta_uso; drop table if exists mp_cuentas;

create table if not exists mp_cuentas (
  cuenta_id   bigint primary key,          -- el user_id de MP (sale de la llave, verificado contra MP)
  store       text not null,               -- 'zattia' | 'bdi'
  nombre      text not null,               -- cómo se muestra: apodo y titular, según MP
  token       text not null,
  cargada_en  timestamptz not null default now(),
  -- 🔑 la firma sale de perfil.name, NUNCA del body
  cargada_por text
);

create table if not exists mp_cuenta_uso (
  id         bigserial primary key,
  store      text not null,
  cuenta_id  bigint not null references mp_cuentas (cuenta_id),
  desde      timestamptz not null default now(),
  puesta_por text
);

create index if not exists mp_cuenta_uso_store_desde on mp_cuenta_uso (store, desde);

-- El navegador nunca lee estas tablas derecho. RLS prendido y SIN políticas = nadie con la anon key.
alter table mp_cuentas enable row level security;
alter table mp_cuenta_uso enable row level security;
revoke all on mp_cuentas from anon, authenticated;
revoke all on mp_cuenta_uso from anon, authenticated;
