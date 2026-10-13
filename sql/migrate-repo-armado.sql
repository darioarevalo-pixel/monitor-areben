-- Reposición: el ARMADO con el lector — lo que se pidió, lo que se escaneó y la transferencia en GN.
-- Correr en el proyecto Supabase de ZATTIA y en el de BDI (BDI desde el 12-oct-2026: Karen arma la
-- reposición y la devolución de fundas con el lector). Se pega entero en el SQL Editor de cada uno.
--
-- 🔑 POR QUÉ EXISTE (Darío, 11/12-oct-2026). Hasta acá Lorena juntaba con el papel y después
-- escaneaba en la app de Gestión Nube para hacer la transferencia. GN no sabe qué se pidió: si se
-- pidieron 5 S y se agarran 5 M, nunca salta nada. Ahora el pedido vive en el Monitor, se escanea
-- CONTRA él y, al terminar, el Monitor hace la transferencia con lo escaneado.
--
-- 🔴 UNA FILA = UN ARMADO, CON TODO ADENTRO (jsonb). Es una lista de 20-60 renglones que escanea una
-- sola persona en una sola compu: no hace falta una tabla de escaneos, y guardar el estado entero
-- cada vez hace que reintentar sea inofensivo (el último guardado gana, no se suma dos veces).
--
-- PRECONDICIONES: ninguna. No toca tablas existentes.
--
-- VERIFICACIÓN:
--   select count(*) from repo_armado;   -- 0 la primera vez, sin error
--
-- ROLLBACK (⚠️ se lleva el historial de armados; las transferencias en GN quedan hechas):
--   drop table if exists repo_armado;

create table if not exists repo_armado (
  id            text primary key,                   -- lo genera la compu (`ra<epoch>_<azar>`)
  store         text not null,                      -- 'zattia' | 'bdi'
  linea         text not null default 'zattia',     -- 'zattia' | 'stunned' | 'bdi'
  sentido       text not null default 'llevar',     -- 'llevar' (depósito → local) | 'devolver' (tanda 2)
  fecha         date not null,                      -- el día del armado, hora de Argentina
  persona       text,                               -- 🔑 sale de perfil.name, NUNCA del body
  -- en_curso → transfiriendo → transferido. 'revisar' = GN no contestó claro y NO se sabe si la
  -- transferencia se hizo: hay que mirarla en GN antes de tocar nada. 'cancelado' = se descartó.
  estado        text not null default 'en_curso',
  -- La lista CONGELADA al empezar: [{vid,pid,sid,sku,barcode,name,size,cant,exhibir}]. Congelada a
  -- propósito: si el stock se actualiza a mitad del armado, la lista no cambia en la mano.
  pedido        jsonb not null default '[]'::jsonb,
  escaneos      jsonb not null default '{}'::jsonb, -- { vid: unidades escaneadas }
  faltantes     jsonb not null default '{}'::jsonb, -- { vid: 'no-estaba' | 'despues' | 'rechazada' }
  transfer      jsonb,                              -- lo que contestó GN (transfer_id, movement_id, ítems)
  error         text,
  creado_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  cerrado_en    timestamptz
);

create index if not exists repo_armado_dia on repo_armado (store, linea, sentido, fecha desc);

-- 🔴 Uno abierto por lista: dos compus armando lo mismo terminan en dos transferencias.
create unique index if not exists repo_armado_uno_abierto
  on repo_armado (store, linea, sentido)
  where estado in ('en_curso', 'transfiriendo', 'revisar');

-- Fase S: el navegador no lee esta tabla; sólo el handler con la service key.
alter table repo_armado enable row level security;
