-- Auditoría de lo que se acciona sobre la pauta de Meta: quién movió qué plata y cuándo.
--
-- ⚠️ VA A UNA SOLA BASE, la de BDI, y la escriben las acciones de las tres líneas. Mismo
-- razonamiento que `meta_ads_campania_linea` (ver el SQL de al lado): **la cuenta publicitaria es
-- una sola**, así que "quién apagó qué" es un hecho único y no una decisión editorial de cada
-- marca. Partirlo por store daría dos historias parciales de la misma cuenta, y la pregunta que
-- esta tabla existe para contestar —¿quién tocó esto?— no se puede contestar con la mitad.
--
-- # Por qué la fila se escribe ANTES de llamar a Meta
--
-- `idem` es único y se genera en la pantalla al apretar el botón. La fila se inserta con
-- `resultado = 'en-curso'` **antes** del POST a Meta y se completa después. Escribirla al final
-- sería más prolijo y no serviría para nada: entre el clic y la respuesta de Meta hay segundos, y
-- es justo ahí donde entra el segundo clic. Con la fila puesta antes, el segundo pedido choca
-- contra el índice único y devuelve el resultado del primero sin llamar a Meta.
--
-- En la Tanda 1 eso es cosmético (poner `status = PAUSED` dos veces no hace daño). En la Tanda 2
-- es lo único que evita duplicar una campaña dos veces.
--
-- Una fila que queda en 'en-curso' para siempre no es un bug: es una escritura que se cortó por
-- tiempo y de la que no sabemos si Meta la aplicó. Que se vea es el punto.
--
-- Correr con `node scripts/apply-meta-acciones.mjs`. Idempotente.

create table if not exists meta_ads_accion (
  id             bigserial primary key,
  -- La clave del doble clic. Única: es la invariante, no una convención.
  idem           text not null unique,
  cuando         timestamptz not null default now(),
  quien          text not null,
  accion         text not null,                   -- 'estado' | 'presupuesto' (Tanda 2: 'duplicar')
  nivel          text not null,                   -- 'campania' | 'conjunto' | 'aviso'
  objeto_id      text not null,
  objeto_nombre  text,
  -- La campaña de la que cuelga el objeto: es el eje por el que se audita, porque la línea se
  -- resuelve por campaña. Para una acción a nivel campaña es el mismo `objeto_id`.
  campaign_id    text,
  linea          text,                            -- 'bdi' | 'zattia' | 'stunned'
  cuenta_id      text,
  -- El antes y el después, sólo de los campos tocados. El `a` es **lo releído de Meta**, no lo
  -- pedido: Meta acepta cambios de presupuesto que después no aplica, y guardar la intención en vez
  -- del hecho convertiría la auditoría en una lista de deseos.
  de             jsonb,
  a              jsonb,
  resultado      text not null,                   -- 'en-curso'|'ok'|'rechazado'|'error'|'simulacro'
  detalle        text,
  -- El header `X-Business-Use-Case-Usage` de Meta: cuánto queda del cupo de escritura. Viene en
  -- cada respuesta y no cuesta una llamada más. Sirve el día que Meta empiece a rechazar por
  -- límite: se ve que se venía llenando, en vez de descubrirlo cuando ya no escribe.
  uso            text
);

-- Las dos consultas reales: el historial de UNA campaña (el panel de la fila) y el último
-- movimiento de la cuenta entera (¿quién tocó algo hoy?).
create index if not exists idx_meta_ads_accion_campania on meta_ads_accion (campaign_id, cuando desc);
create index if not exists idx_meta_ads_accion_cuando   on meta_ads_accion (cuando desc);

alter table meta_ads_accion disable row level security;
