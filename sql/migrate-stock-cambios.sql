-- Historia de stock: cada vez que un sync pisa el espejo `inventario`, antes anota qué variantes
-- cambiaron de cantidad. Se aplica en las dos bases (`node scripts/aplicar-sql.mjs
-- sql/migrate-stock-cambios.sql stock_cambios`); hoy sólo la escribe Zattia.
--
-- 🔑 POR QUÉ EXISTE (doc de Darío «Ingresos al local: qué se exhibe y qué va al depósito», 11-oct).
-- En el salón se cuelga UNA unidad de cada variante (producto × color × talle). Cuando entra un
-- restock, la pregunta es «¿esta variante quedó en cero en el Local desde el último chequeo?»: si
-- quedó, se vendió también la colgada y hay que preparar una para exhibir; si no, va al depósito del
-- local. El espejo `inventario` sólo tiene la foto de AHORA y cada sync pisa la anterior ⇒ un
-- 3 → 0 → 2 se ve como «2» y el dato se pierde. Esta tabla lo guarda.
--
-- Se guarda SÓLO lo que cambió (~100-200 filas por día en Zattia, ~7 MB por año), ⛔ no la foto
-- entera. La foto de cualquier momento se reconstruye: el espejo de hoy menos los cambios
-- posteriores. ⛔ La historia empieza el día que esto corre: para atrás no hay datos.
--
-- PRECONDICIONES: ninguna. No toca ninguna tabla existente.
--
-- VERIFICACIÓN (después del primer sync, tiene que haber filas de hoy):
--   select origen, count(*), min(visto_en), max(visto_en) from stock_cambios group by origen;
--
-- ROLLBACK (⚠️ se lleva la historia, que no se puede volver a bajar de GN):
--   drop table if exists stock_cambios;

create table if not exists stock_cambios (
  id           bigserial primary key,
  product_id   bigint not null,
  size_id      bigint not null,
  store_name   text   not null,          -- igual que `inventario`: 'Local', 'Deposito ' (con espacio), …
  antes        integer,                  -- null = la variante no estaba en el espejo (alta nueva)
  despues      integer not null,
  visto_en     timestamptz not null default now(),  -- cuándo lo VIO el sync, ⛔ cuándo pasó en GN
  origen       text not null             -- 'diario' | 'rapido'
);

create index if not exists stock_cambios_variante_idx
  on stock_cambios (product_id, size_id, store_name, visto_en);

create index if not exists stock_cambios_visto_idx on stock_cambios (visto_en);

-- El navegador no lee Supabase (Fase S): RLS prendido y sin políticas ⇒ sólo la service key.
alter table stock_cambios enable row level security;
