-- Insumos: el PEDIDO. La mitad que le faltaba a «gestión de compras».
--
-- # Qué hueco tapa
--
-- Hasta acá una compra era un movimiento que **ya llegó**, así que entre «hay que pedir bolsas» y
-- «llegaron las bolsas» no existía nada. Eso cuesta tres cosas, y las tres se ven en los chats:
--
--   1. El aviso **sigue gritando** después de que alguien llamó al proveedor. Un aviso que se
--      ignora doce veces enseña a ignorar el número trece (`docs/secciones/agenda.md`).
--   2. Nadie sabe **si el pedido salió**, que es la otra mitad de lo que se pregunta por WhatsApp.
--   3. `dias_reposicion` **no tiene contra qué medirse**: sin fecha de pedido no se puede saber
--      cuánto tarda de verdad ningún proveedor. Hoy está en NULL en los 16 insumos sembrados.
--
-- # 🔴 Por qué un pedido NO es un quinto tipo del libro
--
-- Porque **no mueve una sola unidad**. `insumo_movimiento` es el libro de lo que pasó con las
-- cosas, y que ahí adentro sólo haya hechos que suman o restan es lo que permite que `stockPor()`
-- sea una suma pelada. Un `tipo:'pedido'` con cantidad y signo 0 sería una fila que hay que
-- acordarse de saltear en cada suma — y el que se olvide falla callado, que es exactamente el
-- argumento por el que un traslado son dos filas y no una con `destino`.
--
-- Un pedido es una **promesa**; el libro guarda **hechos**. Es la misma línea que ordenó Postventa.
--
-- # Cómo se cierra: por `grupo`, la columna que ya estaba reservada
--
-- `insumo_movimiento.grupo` se creó diciendo «las dos patas de un traslado, **o un pedido**». Se
-- cumple ahora: la compra que cierra el pedido lleva `grupo = <id del pedido>`. ⛔ No hace falta
-- ninguna columna nueva en el libro, ni migrar una sola fila de las que ya hay.
--
-- ⇒ Un pedido está ABIERTO cuando no fue cancelado y ninguna compra lo nombra. Eso se deriva, no se
-- guarda: un `estado` guardado es un segundo lugar donde puede decir otra cosa que el libro.
--
-- Correr con `node scripts/apply-insumo-pedido.mjs`. Idempotente.

create table if not exists insumo_pedido (
  id           text primary key,                    -- `pd<epoch>_<rand>`, generado en el cliente
  insumo_id    text not null references insumo(id) on delete cascade,
  -- Cuánto se pidió, en la unidad del insumo. Misma regla que el libro: la unidad es UNA sola.
  -- ⚠️ Puede ser NULL: «lo pedí» sin saber cuánto viene sigue siendo información útil —el aviso se
  -- calla igual— y obligar a un número inventaría una cantidad.
  cantidad     numeric,
  -- 🔑 El día en que se pidió, y es **el reloj del pedido**. ⛔ Nunca `created_at`: un pedido
  -- anotado el jueves de algo que se pidió el lunes tiene que contar desde el lunes, o la demora
  -- del proveedor sale corta y le echamos la culpa al que no la tiene.
  pedido_at    date not null,
  proveedor    text,
  -- Cuándo lo prometieron. NULL = no dijeron. ⛔ NULL no es «hoy» ni «nunca».
  promesa_at   date,
  -- Cancelado a mano: el pedido no va a llegar y el aviso de comprar tiene que volver a sonar.
  -- 🔑 Se cancela, ⛔ no se borra: borrarlo se lleva puesta la demora medida de ese proveedor.
  cancelado_at timestamptz,
  usuario      text,                                -- perfil.name de quien lo cargó
  nota         text,
  datos        jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- La pregunta real es siempre la misma: los pedidos de este insumo, del más nuevo al más viejo.
create index if not exists idx_insumo_pedido_insumo on insumo_pedido (insumo_id, pedido_at desc);
-- Los que siguen abiertos, que son los que callan un aviso.
create index if not exists idx_insumo_pedido_abierto on insumo_pedido (insumo_id) where cancelado_at is null;

-- 🔴 Una cantidad negativa es un pedido que no existe. Misma mitad de regla que en el libro: si la
-- base la aceptara, el candado quedaría escrito sólo en el handler y un script que escriba derecho
-- lo saltearía.
do $$ begin
  alter table insumo_pedido add constraint insumo_pedido_cantidad_ck check (cantidad is null or cantidad > 0);
exception when duplicate_object then null; end $$;

-- 🔑 Una promesa anterior al pedido es un error de tipeo, y silencioso: haría que el pedido nazca
-- demorado el mismo día que se carga.
do $$ begin
  alter table insumo_pedido add constraint insumo_pedido_promesa_ck check (promesa_at is null or promesa_at >= pedido_at);
exception when duplicate_object then null; end $$;

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- RLS
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- Una tabla creada después de `sql/migrate-rls.sql` **nace SIN RLS** y quedaría abierta a la clave
-- pública — ya pasó con el memo, y por eso está escrito también en `migrate-insumos.sql`. Sin
-- políticas a propósito: el navegador nunca lee esta tabla derecho, todo pasa por `api/_insumos.js`.
alter table insumo_pedido enable row level security;
