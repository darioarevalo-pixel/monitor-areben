-- Liquidación — campañas de sale, de la selección a la decisión (Análisis).
--
-- Hasta ahora decidir una liquidación eran tres pantallas y un archivo en el medio: se tildaban
-- productos en Análisis → Por producto y salía un **PDF**; se los miraba uno por uno y se los
-- cargaba **a mano** en el simulador de Comisiones; y lo que convencía iba a una lista que vive en
-- `localStorage` (`monitor_sale_<marca>`) — el navegador de una persona, sin historial. La
-- selección se perdía al recargar y nadie más la veía.
--
-- Estas dos tablas son el cajón que faltaba:
--
--   `liquidaciones`      — la campaña: un nombre, unas fechas y un estado. Con nombre y fecha a
--                          propósito, no una lista viva: "Sale invierno ago-2026" se puede mirar
--                          después para decidir la próxima, una lista que se pisa a sí misma no.
--   `liquidacion_items`  — un producto dentro de una campaña, **una fila por ítem**.
--
-- 🔑 **Por qué una fila por ítem y no un documento jsonb.** `ingresos` guarda el array entero con
-- debounce y es último-que-escribe-gana; acá cada "Definir" toca **una** fila y dos personas pueden
-- estar definiendo productos distintos de la misma campaña al mismo tiempo. Con un documento, la
-- segunda en guardar le borra el trabajo a la primera sin un solo error.
--
-- Va en las DOS bases (hay una Supabase por marca), con columna `store` y PK compuesta, igual que
-- `calendario_hitos`, `disenos` y `solicitudes`. `datos jsonb` es la fuente de verdad y las
-- columnas de al lado son proyecciones para filtrar y ordenar: un campo nuevo viaja sin migración.
--
-- Correr con `node scripts/apply-liquidacion.mjs`. Idempotente.

create table if not exists liquidaciones (
  id          text not null,                          -- `l<epoch>_<rand>`, generado en el cliente
  store       text not null,                          -- 'bdi' | 'zattia'
  nombre      text not null,
  -- borrador  → se está armando, no se aplicó nada
  -- en_curso  → se está definiendo producto por producto
  -- aplicada  → los precios ya se escribieron en Gestión Nube
  -- cerrada   → terminó; el resultado se mira contra lo que se vendió
  estado      text not null default 'borrador',
  datos       jsonb not null,                         -- {desde, hasta, nota, creadoPor, creado}
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (store, id)
);

-- La consulta real es siempre "las campañas de esta marca, la más nueva arriba".
create index if not exists idx_liquidaciones_store_creada on liquidaciones (store, created_at desc);

create table if not exists liquidacion_items (
  liq_id      text not null,
  store       text not null,
  pid         text not null,                          -- id de producto de Gestión Nube
  -- pendiente  → entró desde Análisis y nadie le puso precio todavía
  -- definido   → tiene precio de sale decidido
  -- descartado → se lo miró y no va (NO se borra: que no vuelva a aparecer es información)
  -- aplicado   → el precio ya se escribió en GN
  estado      text not null default 'pendiente',
  -- Tres bloques, y el primero es el que importa entender:
  --
  --  * **foto** — costo, precio, stock y ventas **del momento en que se lo mandó** desde Análisis.
  --    Se congela a propósito. Una campaña se decide con los números de ese día; si el modal leyera
  --    el ETL de hoy, un producto definido la semana pasada mostraría otro margen que el que se
  --    aprobó, y no habría forma de saber cuál se miró. Además el ETL no guarda historia.
  --  * **decision** — `precioSale`, `pctDesc`, `markup`, `margen`, `nota`.
  --  * **aplicacion** — `aplicadoEn`, `variantesEscritas`, `categoriaSaleAgregada` (tanda 3).
  datos       jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (store, liq_id, pid)
);

-- "Los ítems de esta campaña" es la única consulta que se hace; el estado filtra dentro.
create index if not exists idx_liquidacion_items_campania on liquidacion_items (store, liq_id, estado);

alter table liquidaciones disable row level security;
alter table liquidacion_items disable row level security;
