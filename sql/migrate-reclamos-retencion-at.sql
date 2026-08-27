-- Reclamos: CUÁNDO SE LE HIZO LA OFERTA — o sea, desde cuándo se espera la respuesta.
--
-- # Qué guarda
--
--   retencion_at   timestamptz   — el instante en que la oferta se mandó
--
-- # Por qué hace falta una columna y no alcanza con lo que ya hay
--
-- Hasta el 27-ago-2026 «le ofrecí $13.491 y todavía no contestó» ⛔ NO SE PODÍA GUARDAR:
-- `registroDeRetencion` (`lib/reclamos/casos.core.js`) exigía monto, forma y respuesta **las tres
-- juntas**, así que el momento más común del circuito —Administración arma la propuesta, el local
-- la manda, el cliente tarda un día en contestar— era un error de validación. Al abrir la oferta a
-- ese estado aparece la pregunta que antes no existía: **hace cuánto que se espera.**
--
-- 🔴 **`updated_at` ⛔ no la contesta, y ésa es toda la razón de esta columna.** Lo pisa cualquier
-- toque sobre el reclamo, y el toque más probable sobre una oferta que no vuelve es ir a ver por
-- qué no vuelve ⇒ **ocuparse del caso apagaría la alarma de que nadie contestó.** Es el mismo
-- defecto que este módulo ya tuvo con la alerta de tránsito y que arregló `desdeQueEsta`.
--
-- 🔑 **Se sella UNA sola vez.** `registroDeRetencion` escribe `retencionAt || ahora`, así que
-- volver a guardar el paso, rehacer la decisión o subir el monto ⛔ no reinician el reloj: lo que
-- se mide es hace cuánto que se espera una respuesta, ⛔ no hace cuánto que se dijo el último
-- número.
--
-- # Qué pasa con las filas viejas
--
-- Quedan en NULL, y **NULL acá ⛔ no significa «no hubo oferta»: significa que no se guardó la
-- fecha** — antes de esta columna no había dónde. 📊 Medido antes de escribir esto (27-ago-2026,
-- con la service key, contra las dos tiendas): **BDI tiene 2 reclamos y ZATTIA 0, y ninguno tiene
-- retención registrada**, así que no hay una sola oferta vieja que quede sin fecha.
-- ⚠️ Por eso `diasEsperandoLaOferta` (`lib/reclamos/tipos.ts`) devuelve **0** sin fecha en vez de
-- contar desde `created_at`: una fila así se sigue viendo en el resumen y en la lista, pero ⛔ no
-- dispara el reloj. Inventarle una fecha sería afirmar una espera que nadie midió.
--
-- Idempotente. ⚠️ Correr en el Supabase de BDI **y** en el de ZATTIA.
-- 🔴 **VA ANTES DE DEPLOYAR, y lo que se rompe es MÁS que decidir.** `retencion_at` entró en `COLS`
-- (`api/_reclamos.js`), o sea en el `select` que **lista** los reclamos: sin la columna PostgREST
-- contesta 42703 y **la pantalla de Postventa queda vacía entera**. Es exactamente lo que pasó con
-- `retencion_forma` el 27-ago a la mañana.
--
-- Se corre con `node scripts/apply-devoluciones.mjs`, que ya la tiene en su lista.

alter table devoluciones add column if not exists retencion_at timestamptz;

-- Cuántas ofertas hay esperando respuesta, y desde cuándo. El día de la migración son todas nulas.
select count(*)::int                                                       as reclamos,
       count(*) filter (where retencion_monto is not null)::int            as con_oferta,
       count(*) filter (where retencion_monto is not null
                          and retencion_respuesta is null)::int            as esperando_respuesta,
       count(*) filter (where retencion_monto is not null
                          and retencion_respuesta is null
                          and retencion_at is null)::int                   as esperando_sin_fecha,
       max(now() - retencion_at) filter (where retencion_respuesta is null) as la_que_mas_espera
  from devoluciones;
