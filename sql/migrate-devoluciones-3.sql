-- Reclamos, tanda 3: los ejes que faltaban para cubrir TODO lo que sale mal después de la venta.
--
-- Hasta acá el módulo cubría devoluciones, fallas con envío y ventas sin stock. Faltaban tres
-- situaciones que hoy no se registran en ningún lado: **faltante de producto**, **pedido mal
-- armado** (le llegó otra cosa) y **no le llegó nunca**. Con el modelo viejo cada una habría sido
-- una pestaña nueva; con estos dos campos entran sin agregar estructura.
--
-- Idempotente. Correr con `node scripts/apply-devoluciones.mjs`.

-- Qué quería el cliente: 'plata' | 'mismo_producto' | 'otro_producto' | 'completar'.
-- Es distinto de lo que finalmente se hizo (`compensacion`), y esa diferencia es el dato: dice
-- cuántas veces le damos algo distinto de lo que pidió.
alter table devoluciones add column if not exists expectativa text;

-- El reclamo al transportista cuando el pedido se perdió en el camino. Es plata recuperable que
-- hoy no persigue nadie: sin un lugar donde anotarla, se pierde entera.
alter table devoluciones add column if not exists reclamo_correo text;
alter table devoluciones add column if not exists reclamo_correo_estado text not null default 'no_aplica';

-- Los mensajes que se le mandaron al cliente, con su texto y su fecha. Si después dice "me
-- dijeron otra cosa", está lo que se le dijo.
alter table devoluciones add column if not exists mensajes jsonb not null default '[]'::jsonb;

-- 'Pedido mal armado' necesita saber cuál era el producto CORRECTO, además del que se envió por
-- error: son dos correcciones de stock distintas y hay que poder rastrear las dos.
alter table devoluciones add column if not exists items_correctos jsonb not null default '[]'::jsonb;

-- Índice para el filtro por motivo de la bandeja (siete motivos, y se filtra seguido).
create index if not exists idx_devoluciones_motivo on devoluciones (store, motivo, created_at desc);
