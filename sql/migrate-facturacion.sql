-- Facturación electrónica con ARCA (ERP propio, F5, Bruno 12-oct-2026). Va SÓLO en la base del
-- monitor (BDI): es un CUIT (Areben) y un permiso de ARCA para las dos marcas; cada factura dice de
-- qué marca y de qué venta es. La escribe `api/_facturacion.js` con `lib/arca/lote.core.js`.
--   node scripts/aplicar-sql.mjs sql/migrate-facturacion.sql facturas
--
-- 🔴 Una factura con CAE ⛔ se borra ni se edita: se anula con nota de crédito. Por eso ⛔ hay
-- política de DELETE ni pantalla que la edite; lo único que cambia de una fila es su `estado`.
--
-- PRECONDICIONES: ninguna. No toca ninguna tabla existente.
--
-- VERIFICACIÓN:
--   select ambiente, estado, count(*) from facturas group by 1, 2;
--   select * from arca_candado;   -- vacía salvo durante un lote
--
-- ROLLBACK (⚠️ con facturas reales adentro, ⛔: es el único registro del CAE fuera de ARCA):
--   drop table if exists facturas; drop table if exists arca_candado; drop table if exists arca_ta;

-- El permiso de WSAA (TA): dura 12 horas y ⛔ se puede pedir otro mientras está vigente.
create table if not exists arca_ta (
  ambiente    text primary key check (ambiente in ('homologacion', 'produccion')),
  token       text not null,
  sign        text not null,
  vence       timestamptz not null,
  pedido_en   timestamptz not null default now()
);

-- Un lote por punto de venta y tipo a la vez: la numeración es «el último + 1».
create table if not exists arca_candado (
  ambiente    text not null,
  pto_vta     integer not null,
  tipo        integer not null,
  lote        uuid not null,
  tomado_por  text,
  tomado_en   timestamptz not null default now(),
  primary key (ambiente, pto_vta, tipo)
);

create table if not exists facturas (
  id            uuid primary key default gen_random_uuid(),
  ambiente      text not null check (ambiente in ('homologacion', 'produccion')),
  marca         text not null,                 -- 'bdi' | 'zattia' (Stunned factura como Zattia)
  venta_id      text not null,                 -- la venta que se factura (o que anula la NC)
  tipo          integer not null,              -- 1 Factura A · 3 NC A · 6 Factura B · 8 NC B
  pto_vta       integer not null,
  numero        bigint,                        -- null si se rechazó: el número ⛔ se consumió
  fecha         date not null,
  total         numeric(14, 2) not null,
  neto          numeric(14, 2) not null,
  iva           numeric(14, 2) not null,
  doc_tipo      integer not null,              -- 80 CUIT · 96 DNI · 99 sin identificar
  doc_nro       bigint not null,
  cond_iva      integer not null,
  asociado_id   uuid references facturas(id),  -- la factura que anula una NC
  estado        text not null check (estado in ('reservada', 'autorizada', 'rechazada')),
  cae           text,
  cae_vence     date,
  observaciones jsonb,
  lote          uuid not null,
  creado_por    text,
  creado_en     timestamptz not null default now(),
  resuelto_en   timestamptz,
  check (estado <> 'autorizada' or (cae is not null and numero is not null)),
  check (estado <> 'reservada' or numero is not null)
);

-- Un número es de UN comprobante (las rechazadas quedan con numero null y no cuentan).
create unique index if not exists facturas_numero_uq on facturas (ambiente, pto_vta, tipo, numero);
-- Una venta, una factura; y una nota de crédito. Las rechazadas no cuentan.
create unique index if not exists facturas_venta_factura_uq on facturas (ambiente, marca, venta_id)
  where tipo in (1, 6) and estado <> 'rechazada';
create unique index if not exists facturas_venta_nc_uq on facturas (ambiente, marca, venta_id)
  where tipo in (3, 8) and estado <> 'rechazada';
create index if not exists facturas_reservadas_idx on facturas (ambiente, pto_vta, tipo) where estado = 'reservada';
create index if not exists facturas_fecha_idx on facturas (ambiente, marca, fecha);

-- El navegador no lee Supabase (Fase S): RLS prendido y sin políticas ⇒ sólo la service key.
alter table arca_ta enable row level security;
alter table arca_candado enable row level security;
alter table facturas enable row level security;
