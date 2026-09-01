-- Las MEDIDAS de cada prenda: lo que carga el local con la prenda apoyada y la cinta en la mano.
--
-- Por qué existe (1-sep-2026): hasta hoy la tabla de talles vivía en DOS lugares y ninguno era una
-- base — el HTML pegado adentro de la descripción de TiendaNube, y una copia en el KV atada al
-- producto. Medido contra la tienda viva ese día: de 316 publicados de Zattia, 205 tienen una
-- tabla (49 con nuestra firma y 156 escritas a mano) y 111 no tienen ninguna. Un número que vive
-- sólo adentro de un HTML no se puede comparar, ni corregir, ni volver a publicar.
--
-- La convención la fijó Bruno el 1-sep-2026 y la confirma su guía (`TOMA DE MEDIDAS CON GUÍA.pdf`):
-- **se mide la prenda APOYADA Y PLANA**. La cintura se agarra por la mitad y se multiplica por 2,
-- y ese x2 lo hace el sistema al publicar (`lib/tn-medidas/medidas.core.js`), NUNCA la persona:
-- medido, de 69 tablas publicadas con cintura legible, 6 están por debajo de 45 cm — son las veces
-- que alguien se olvidó de multiplicar.
--
-- Correr con `node scripts/aplicar-sql.mjs sql/migrate-tn-medidas.sql tn_medidas`.
-- Idempotente: se puede correr varias veces.

-- Una fila por (producto, talle, medida), por los mismos tres motivos que `tn_atributos`:
--
--   1. **Agregar una medida no es una migración.** El diccionario salió de una guía de 9 páginas,
--      no de conocer todas las prendas que van a existir.
--   2. **El análisis es un `group by` directo.** «Cuánto mide de largo un top nuestro» es una
--      pregunta que hoy no se puede contestar porque el número vive adentro de un HTML.
--   3. **Queda quién midió cada número.** Miden dos personas (Camila Quintana y Josefina Batter):
--      con una columna por medida, `por` diría sólo la última y taparía a la otra.
--
-- `talle` va en la clave y NO es opcional: una prenda sin eje de talle usa la cadena vacía. Medido
-- el 1-sep-2026: de los 111 productos sin medidas, sólo 13 tienen eje de talle — para los otros 98
-- la tabla es UNA columna, así que el caso de la cadena vacía es la mayoría, no el borde.
create table if not exists tn_medidas (
  store          text not null,                     -- 'bdi' | 'zattia'
  tn_id          text not null,                     -- id del producto en TiendaNube
  talle          text not null default '',          -- 'S' | '38' | '' si la prenda no tiene talles
  medida         text not null,                     -- ancho|anchoBajoBusto|contornoCintura|anchoPierna|largo|largoManga
  -- El número EN CENTÍMETROS tal como se midió, o la palabra 'estira'.
  --
  -- 🔴 'estira' es un valor y no un casillero vacío, y ésa es toda la diferencia: en blanco, «no lo
  -- medimos porque la prenda estira ahí» y «nadie lo cargó todavía» se ven igual — y es justo la
  -- diferencia que dice si queda trabajo. Lo pidió Bruno: «si elastiza mucho, no se mide la medida
  -- que elastiza, pero se mide el largo». El largo NO admite 'estira', y eso lo cierra el núcleo.
  --
  -- ⛔ Se guarda lo MEDIDO, no lo publicado: el x2 de la cintura se aplica al componer el HTML. Si
  -- se guardara duplicado, la columna dejaría de poder compararse con lo que dice la cinta.
  valor          text not null,
  por            text,                              -- quién lo midió
  at             timestamptz not null default now(),
  primary key (store, tn_id, talle, medida)
);

-- El índice es (store, medida) y no (store, tn_id): la clave primaria ya resuelve «las medidas de
-- este producto». Lo que este índice sirve es la pregunta que justifica la tabla y que hoy nadie
-- puede contestar — «cuánto mide de largo un top nuestro», «cuántas prendas no informan ancho».
create index if not exists idx_tn_medidas_medida on tn_medidas (store, medida);

-- ⛔ Sin foreign key a `tn_descripciones` a propósito, igual que `tn_atributos`: la prenda se mide
-- cuando baja al local, y puede pasar antes de que nadie haya escrito una descripción.

-- RLS PRENDIDO y SIN políticas: nadie entra con la clave pública. Mismo motivo que las otras dos
-- tablas de esta sección — la clave pública viaja adentro del bundle y la app entra con la service
-- key, que pasa por encima de RLS.
alter table tn_medidas enable row level security;

-- «Esta prenda no lleva tabla de medidas», con su motivo.
--
-- 🔴 Sin esta salida, las prendas elastizadas se quedan en la cola PARA SIEMPRE, y una cola que
-- nunca baja a cero deja de mirarse. Y no es un caso de borde: medido el 1-sep-2026, 101 de los
-- 316 publicados de Zattia hablan de microfibra, lycra, morley, ribb o elástico — y 60 de los 111
-- que no tienen medidas, o sea más de la mitad de la cola.
--
-- El motivo es de lista cerrada y no texto libre por el mismo motivo que los atributos: «cuánto del
-- catálogo no lleva medidas por elastizado» tiene que poder sumarse.
alter table tn_descripciones add column if not exists sin_medidas text;   -- 'elastizada' | 'talle unico' | 'accesorio'
alter table tn_descripciones add column if not exists sin_medidas_por text;
alter table tn_descripciones add column if not exists sin_medidas_at timestamptz;
