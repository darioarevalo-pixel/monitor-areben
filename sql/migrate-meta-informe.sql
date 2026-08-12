-- Los informes del analista de pauta: el DIAGNÓSTICO en prosa, guardado donde lo pueda leer el resto.
--
-- ⚠️ VA A UNA SOLA BASE, la de BDI, igual que las otras seis tablas de Meta y por el mismo motivo:
-- las cuentas publicitarias son compartidas entre líneas.
--
-- # Por qué existe: era la única capa del analista que seguía en un solo disco
--
-- El analista de pauta vivía entero en `~/Projects/analista-meta/`. De sus tres capas, dos ya se
-- mudaron solas: los números están en `meta_ads_snapshot_dia` desde el 11-may (la serie completa,
-- incluidas las visitas al perfil) y el porqué de cada decisión está en `meta_ads_decision` desde el
-- 11-ago. Lo que quedaba afuera eran **los informes**: dos HTML de 34 y 42 KB, en una carpeta que
-- está en git pero SIN REMOTO, y como artifacts privados que ven dos personas.
--
-- 🔑 **Guardar el diagnóstico NO es automatizarlo, y la diferencia es la que sostiene esta tabla.**
-- Lo que se descartó a propósito fue que el informe se GENERE solo: el valor de «el mejor público se
-- quedó sin creativo» o «CTR sano y 0 compras ⇒ falla el público» sale de leer, no de graficar, y
-- automatizado queda un dashboard más de los que nadie abre. Un depósito guarda lo que alguien
-- escribió. Por eso acá no hay ni una métrica: hay un `html` que entra hecho.
--
-- # La clave es (fecha, linea), calcada de la carpeta
--
-- El archivo se llamaba `informes/AAAA-MM-DD-<marca>.html` y la convención era **uno por fecha, y
-- nunca se pisa el anterior**: la gracia del historial es poder leer qué se pensaba en agosto con lo
-- que se sabía en agosto. El `unique` es esa misma regla, ahora sostenida por la base y no por la
-- memoria de quien guarda el archivo. Volver a subir la misma fecha es CORREGIR ese informe, y el
-- script lo hace pedir `--pisar` a mano.
--
-- # `publicado` existe por lo mismo que en `manuales`
--
-- El informe lo escribe el analista y lo lee Bruno antes que nadie. Nace en borrador y publicar es
-- un click, igual que las novedades: la garantía de que al equipo no le aparece algo a medio revisar
-- no puede depender de que quien lo sube se acuerde de no usar un flag.
--
-- Correr con `node scripts/apply-meta-informe.mjs`. Idempotente.

create table if not exists meta_ads_informe (
  id            bigserial primary key,
  creada        timestamptz not null default now(),
  actualizada   timestamptz not null default now(),
  quien         text not null,

  -- El día que MIRA el informe, no el día en que se subió. Es lo que ordena el historial y lo que,
  -- junto con la línea, lo identifica.
  fecha         date not null,
  linea         text not null,               -- 'bdi' | 'zattia' | 'stunned' (lib/meta-ads/lineas.core.js)

  titulo        text not null,

  -- 🔑 Dos o tres líneas de qué dice. Sin esto la lista es una hilera de fechas y hay que abrir los
  -- informes de a uno para encontrar el que se busca — que es exactamente el defecto que tenía la
  -- carpeta, donde los nombres de archivo eran sólo fecha y marca.
  resumen       text,

  -- El informe entero, autocontenido (su propio CSS adentro). Se sirve tal cual y se dibuja en un
  -- iframe con `sandbox` y sin `allow-scripts`: trae su propio sistema de diseño, así que suelto se
  -- pelea con el CSS del monitor, y sandboxeado no corre nada aunque algún día llegue con un script.
  html          text not null,

  publicado     boolean not null default false,
  publicado_at  timestamptz,

  datos         jsonb not null default '{}'::jsonb
);

-- Uno por fecha y línea. Es la convención de la carpeta, ahora amarrada.
create unique index if not exists idx_meta_informe_fecha_linea on meta_ads_informe (fecha, linea);
-- El historial se lee siempre igual: lo más nuevo arriba.
create index if not exists idx_meta_informe_orden on meta_ads_informe (linea, fecha desc);

alter table meta_ads_informe disable row level security;
