-- Las piezas marcadas de la Biblioteca de anuncios: una fila por aviso.
--
-- ⚠️ VA A UNA SOLA BASE, la de BDI, como `meta_ads_snapshot_dia`, `meta_ads_accion` y
-- `meta_ads_campania_linea`, y por el mismo motivo: las cuentas publicitarias son compartidas
-- entre líneas, así que un aviso es un objeto único y no una decisión editorial de cada marca.
--
-- # El favorito es del EQUIPO, no de la persona
--
-- 🔑 La clave es `objeto_id` solo, sin `quien` adentro: marcar una pieza es decir «ésta funcionó»,
-- y esa es una conclusión del equipo. Si la clave fuera `(objeto_id, quien)`, dos personas podrían
-- marcar la misma pieza sin enterarse y la Biblioteca mostraría un contador en vez de una señal.
-- `quien` se guarda igual, como FIRMA: sirve para preguntarle por qué la marcó. Cualquiera puede
-- desmarcar, que es lo coherente con que la marca sea compartida.
--
-- # Por qué no hace falta permiso de escritura sobre la pauta
--
-- Marcar un favorito **no toca Meta**: no pausa, no mueve plata, no crea nada. El corte es el de
-- LECTURA (`lineasQueVe`), y al ESCRIBIR se hace contra la línea que la foto le da al aviso, nunca
-- contra la que mande el cliente.
--
-- 🔴 **Al LEER, el corte NO se hace por esta columna**: los favoritos se cruzan contra la lista de
-- avisos, que ya viene cortada por permiso. Es a propósito. `linea` se guarda como estaba AL
-- MARCAR, así que si después la campaña se reasigna queda vieja — filtrar por acá escondería un
-- favorito legítimo, y el cruce contra el snapshot (que sí se reasigna) no.
--
-- Correr con `node scripts/apply-meta-favorito.mjs`. Idempotente.

create table if not exists meta_ads_favorito (
  -- El `ad_id` de Meta. Se guarda con el mismo nombre que en `meta_ads_snapshot_dia` para que el
  -- cruce sea obvio: allá `objeto_id` con `nivel='aviso'` es esto.
  objeto_id  text primary key,
  linea      text,
  quien      text not null,
  creada     timestamptz not null default now()
);

-- La consulta real es una sola: «los favoritos de las líneas que veo».
create index if not exists idx_meta_fav_linea on meta_ads_favorito (linea);

alter table meta_ads_favorito disable row level security;
