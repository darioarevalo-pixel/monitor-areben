-- Las decisiones tomadas SOBRE la pauta, incluidas las que no pasaron por el monitor.
--
-- ⚠️ VA A UNA SOLA BASE, la de BDI, igual que las otras cinco tablas de Meta y por el mismo motivo:
-- las cuentas publicitarias son compartidas entre líneas, así que "qué se decidió sobre este aviso"
-- es un hecho único y no una decisión editorial de cada marca.
--
-- # Por qué existe, y por qué no es una columna más de `meta_ads_accion`
--
-- El caso que la hizo nacer: un análisis leyó un aviso apagado como un error y propuso prenderlo
-- como acción número uno, cuando en realidad se había apagado a propósito porque **se acabó el
-- stock** — un hecho que no existe en ninguna métrica de Meta. Sin un lugar donde escribir el
-- porqué, cada análisis rediagnostica desde cero lo que ya se decidió. El motivo se venía guardando
-- a mano en `~/Projects/analista-meta/datos/decisiones.csv`, en un solo disco.
--
-- `meta_ads_accion` no sirve para esto aunque se le parezca:
--
--   1. Registra ESCRITURAS que hizo el monitor vía Graph. `idem` es único porque es la clave del
--      doble clic, y `resultado` es `not null` porque la fila se inserta ANTES del POST. Una
--      decisión tomada en Ads Manager no tiene ninguna de las dos cosas.
--   2. `leerResultado()` (`lib/meta-ads/auditoria.ts`) pinta de «no sabemos cómo quedó, andá a Ads
--      Manager» cualquier `resultado` que no conozca. Es lo contrario de lo que es una decisión
--      tomada a conciencia.
--   3. 🔑 La diferencia de fondo: una acción es un HECHO PASADO, una decisión es ESTADO CON
--      VIGENCIA. «¿Esto sigue valiendo?» tiene que ser un `where estado='vigente'`, no reconstruirlo
--      leyendo el último renglón de un log y comparando fechas.
--
-- # Por qué además CALLA reglas, y no es sólo un cuaderno
--
-- 🔴 El `unique` de `meta_ads_hallazgo` es `(regla_id, fecha, objeto_id)`: apretar «Ignorar» calla
-- el hallazgo DE HOY, y la corrida de mañana inserta una fila con fecha nueva y vuelve a gritar. Sin
-- esta tabla, el radar de atribución tardía va a proponer reactivar el aviso de las fundas
-- discontinuadas todos los días para siempre, y no hay forma de callarlo.
--
-- ⚠️ AGUJERO DECLARADO: una decisión no se entera de que el objeto volvió a estar `ACTIVE`. «No
-- reactivar» sigue callando la regla aunque alguien lo haya prendido de nuevo a mano en Ads Manager.
-- Se arregla mirando el estado en la foto del día; no está hecho.
--
-- Correr con `node scripts/apply-meta-decision.mjs`. Idempotente.

create table if not exists meta_ads_decision (
  id            bigserial primary key,
  creada        timestamptz not null default now(),
  quien         text not null,

  -- 'silencio' tiene objeto y calla reglas. 'nota' queda escrita y NO filtra nada: existe porque hay
  -- decisiones que no son sobre un objeto de Meta y no tienen id — «los 6 borradores quedaron
  -- limpiados» es una de ellas.
  clase         text not null default 'silencio',

  -- El día en que se DECIDIÓ, que no es el día en que se cargó la fila. Una decisión de Ads Manager
  -- se anota después, y la que manda para la vigencia es la de la decisión.
  fecha         date not null,

  linea         text not null,
  nivel         text not null,           -- 'campania' | 'conjunto' | 'aviso' | 'cuenta'

  -- 🔴 El id, no el nombre. Los nombres son largos, se repiten entre cuentas y se editan; el
  -- silenciamiento se resuelve contra `meta_ads_snapshot_dia.objeto_id`. `null` sólo en clase='nota'.
  objeto_id     text,
  -- El nombre AL MOMENTO de decidir, por lo mismo que en el snapshot y en el hallazgo: un objeto
  -- renombrado después no debería reescribir el renglón que ya se leyó.
  objeto_nombre text,
  cuenta_id     text,

  accion        text not null,           -- 'apagado'|'pausado'|'duplicado'|'presupuesto'|'otra'

  -- 🔑 EL CAMPO POR EL QUE EXISTE ESTA TABLA. Todo lo demás es índice para encontrarlo.
  motivo        text not null,

  -- `null` = calla TODAS las reglas sobre ese objeto. Con valor, sólo ese preset. El default de la
  -- pantalla es el preset concreto y no es una comodidad: «no reactivar por falta de stock» tiene
  -- que callar el radar de atribución tardía, pero NO el freno de emergencia — si mañana alguien lo
  -- prende y empieza a quemar plata, eso tiene que gritar igual.
  preset        text,

  -- `null` = no vence. La pantalla propone +90 días; «para siempre» es un click aparte y se ve
  -- escrito en la lista. Una decisión sin vencimiento es un silencio permanente, y eso se elige.
  vence         date,

  estado        text not null default 'vigente',   -- 'vigente' | 'revocada'
  revocada_por  text,
  revocada_en   timestamptz,

  origen        text not null default 'manual',    -- 'manual' | 'csv' | 'hallazgo'
  -- Si nació apretando «Ignorar» en un hallazgo del Panel, cuál era. No es una FK con cascade a
  -- propósito: el motivo tiene que sobrevivir a que se borre la regla que lo generó.
  hallazgo_id   bigint
);

-- Una sola decisión VIVA por (objeto, alcance): dos vigentes sobre lo mismo son dos motivos que se
-- contradicen y nadie sabe cuál mandó. El índice es PARCIAL para que las revocadas convivan, que son
-- la historia y es justo lo que no hay que perder.
create unique index if not exists uq_meta_decision_viva
  on meta_ads_decision (objeto_id, coalesce(preset, '*'))
  where estado = 'vigente' and clase = 'silencio';

-- Las dos consultas reales: las vigentes de una línea (el motor, en cada corrida) y la lista
-- completa para leerla (la pantalla de Registro).
create index if not exists idx_meta_decision_vigente on meta_ads_decision (linea, estado, objeto_id);
create index if not exists idx_meta_decision_fecha   on meta_ads_decision (fecha desc);

-- Mismo criterio que las otras tablas de Meta: se entra con la service key desde el servidor, nunca
-- desde el navegador.
alter table meta_ads_decision disable row level security;
