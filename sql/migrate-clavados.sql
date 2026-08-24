-- "Clavados": los productos a los que ya se les bajó el precio, y cuánta plata vuelve de ellos.
--
-- # Qué es un clavado, dicho por Bruno (23-ago-2026)
--
--   «El clavado es clavado aunque se venda, porque ya se bajó el precio y quedó ahí. Lo que se
--    analiza es la recuperación de dinero.»
--
-- 🔑 **«Clavado» NO es un estado que el sistema calcula: es una DECISIÓN que queda pegada al
-- producto.** Por eso esto es una tabla y no un detector. ⛔ No se lee `detectarComercial` para
-- armar la lista: ése detecta *candidatos* (stock que no rota), que es otra pregunta — un candidato
-- es algo para mirar, un clavado es algo que ya se decidió.
--
-- Y por eso la marca **no se cae cuando el producto vende**. Al contrario: vender es exactamente lo
-- que esta tabla existe para medir.
--
-- # 🔴 La trampa que hay que resolver acá y no después
--
-- El stock llega a 0 **justo en la semana en que el recupero se completó**. Si el cierre sacara al
-- producto de la foto, **el memo de esa semana perdería justo el producto que mejor salió**: el
-- mayor recupero desaparecería del informe que existe para mostrarlo.
--
-- ⇒ **El número de cada semana sale de la VENTA de esa semana, nunca del estado de hoy** (decidido
-- por Bruno el 24-ago-2026). `cerrado_en` no entra en ese cálculo: lo único que decide es si el
-- producto sigue en la lista **activa**. Un producto cerrado sigue contando en la foto de la semana
-- en que facturó, porque el numerador es un rango de fechas y no un estado.
--
-- ⚠️ Y por eso la columna se llama `visto_en_cero` y no `agotado_en`: **nadie guarda historial de
-- stock**, así que lo único que el sistema puede saber es cuándo *vio* el cero, no cuándo ocurrió.
-- Una columna que prometiera la fecha real sería un dato inventado, y encima uno plausible.
--
-- # Vive en la base de CADA marca
--
-- `producto_id` es de la base de su marca: el 1234 de BDI y el 1234 de Zattia son dos productos
-- distintos. Mismo criterio que `pedidos_clientes` y `atencion`.
-- `scripts/apply-clavados.mjs` corre en las dos.
--
-- # Por qué no hay `linea`
--
-- Stunned es una LÍNEA de Zattia y lo único que la separa es el prefijo de SKU (`docs/lineas.md`),
-- que ya está en `productos`. Guardarlo acá sería una segunda copia que se desincroniza el día que
-- un SKU se corrige.
--
-- Correr con `node scripts/apply-clavados.mjs`. Idempotente.

create table if not exists clavados (
  id            text primary key,
  store         text not null,                     -- 'bdi' | 'zattia'
  producto_id   bigint not null,

  -- 📌 Foto del producto **al momento de marcarlo**, y a propósito redundante con `productos`.
  -- No es para mostrar (la pantalla lee el espejo, que está más fresco): es para que un clavado de
  -- marzo siga siendo legible cuando el producto ya no exista en el espejo o le hayan cambiado el
  -- nombre. Una fila que apunta a un id que ya no está no le dice nada a nadie.
  sku           text,
  nombre        text,

  -- Cuándo empezó a correr el reloj. Es la mitad del dato: el recupero es «desde que se lo marcó»,
  -- así que sin esto no hay contra qué medir.
  marcado_en    timestamptz not null default now(),
  marcado_por   text,

  -- ⚠️ Cuándo el sistema **vio** el stock en cero, ⛔ nunca cuándo llegó a cero (ver arriba).
  -- `null` = sigue activo. Lo único que decide es la lista activa: la plata de cada semana sale de
  -- la venta de esa semana y no mira esta columna.
  visto_en_cero timestamptz,

  nota          text,

  actualizado_en  timestamptz not null default now(),
  actualizado_por text
);

-- El acceso real: los activos de una marca, que es lo que se mira todas las semanas.
create index if not exists idx_clavados_activos on clavados (store) where visto_en_cero is null;
-- Y el cruce contra la venta, que va por producto.
create index if not exists idx_clavados_producto on clavados (store, producto_id);

-- 🔴 Un producto no se puede marcar dos veces **mientras siga activo**, y sí puede volver a
-- marcarse después de haberse cerrado — es un ciclo nuevo, con su propia fecha de arranque y su
-- propio recupero. Por eso el único es PARCIAL: un único total borraría el historial del ciclo
-- anterior o impediría el nuevo, y las dos cosas son perder un dato que ya existía.
create unique index if not exists idx_clavados_uno_activo
  on clavados (store, producto_id) where visto_en_cero is null;

do $$ begin
  alter table clavados add constraint clavados_store check (store in ('bdi', 'zattia'));
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- RLS.
--
-- `sql/migrate-rls.sql` prendió RLS recorriendo las tablas que existían ese día; una tabla creada
-- después nace SIN RLS y quedaría abierta a la clave pública — es lo que pasó con el memo
-- (`75e9e8e`). Sin políticas a propósito: el navegador nunca lee esta tabla derecho, todo pasa por
-- `api/_clavados.js` con la service key.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
alter table clavados enable row level security;
