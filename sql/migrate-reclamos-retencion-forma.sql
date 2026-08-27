-- Reclamos: LA RETENCIÓN AHORA PUEDE SER PLATA **O** CUPÓN — y hay que saber cuál se ofreció.
--
-- # Qué guarda
--
--   retencion_forma   'plata' | 'cupon'   — en qué se le ofreció que se lo quede
--
-- Hasta el 27-ago-2026 la oferta era siempre plata: `retencion_monto` + `retencion_respuesta`
-- alcanzaban porque no había otra forma posible. La revisión con Administración sumó el cupón como
-- segunda opción, y **sin esta columna las dos ofertas quedan indistinguibles**: un `acepto` por
-- $6.500 en efectivo y uno por $6.500 en cupón salen iguales de la base y cuestan cosas distintas
-- —la plata sale de la caja hoy, el cupón sale sólo si el cliente vuelve a comprar—.
--
-- 🔑 Es exactamente el mismo agujero que `retencion_respuesta` vino a tapar el 25-ago: **existía el
-- numerador y no el denominador.** Acá existía el monto y no en qué estaba expresado.
--
-- ⚠️ Va **junta con las otras dos**: `registroDeRetencion` (`lib/reclamos/casos.core.js`) exige las
-- tres o ninguna. Media oferta es lo que después hace que la cuenta mienta.
--
-- # Qué pasa con las filas viejas
--
-- Quedan en NULL, y **NULL ⛔ no significa "fue plata": significa SIN REGISTRAR.** 📊 Medido antes
-- de escribir esto (27-ago-2026, con la service key, contra las dos tiendas): **BDI tiene 2
-- reclamos y ZATTIA 0, y NINGUNO tiene retención registrada** — o sea que no hay una sola oferta
-- vieja que quede ambigua. Rellenarlas con `'plata'` sería inventar un dato que nadie cargó.
--
-- # ▶️ Lo que queda SIN definir, a propósito
--
-- **Cuánto vale el cupón frente al reembolso.** El resumen de la reunión decía ×2 ($6.500 contra
-- $13.000) y Bruno lo dejó abierto: *«habría que definirlo según análisis económico»*. Hasta
-- entonces el monto **lo tipea la persona** y ⛔ no lo deriva nadie.
-- ⚠️ Y eso tiene un costo que hay que saber: **un número sin regla no se puede medir**. Con el
-- monto libre se puede decir cuántas veces se ofreció cada forma y cuántas funcionó, pero ⛔ no si
-- el monto era el correcto — para eso hace falta la regla. Esta columna es lo que va a permitir
-- calcularla cuando se junten los casos.
--
-- Idempotente. ⚠️ Correr en el Supabase de BDI **y** en el de ZATTIA.
-- 🔴 **VA ANTES DE DEPLOYAR, y lo que se rompe es MÁS que decidir.** `retencion_forma` entró en
-- `COLS` (`api/_reclamos.js`), o sea en el `select` que **lista** los reclamos: sin la columna,
-- PostgREST contesta 42703 y **la pantalla de Postventa queda vacía entera**, no sólo el botón de
-- decidir. Verificado el 27-ago-2026 leyendo la fila con la service key: la columna ⛔ no existe
-- todavía en BDI.
--
-- Se corre con `node scripts/apply-devoluciones.mjs`, que ya la tiene en su lista.

alter table devoluciones add column if not exists retencion_forma text;

-- Cuántas ofertas hay de cada forma. El día de la migración son todas nulas por definición.
select count(*)::int                                                as reclamos,
       count(*) filter (where retencion_respuesta is not null)::int as con_oferta,
       count(*) filter (where retencion_forma = 'plata')::int       as en_plata,
       count(*) filter (where retencion_forma = 'cupon')::int       as en_cupon,
       count(*) filter (where retencion_respuesta is not null
                          and retencion_forma is null)::int         as sin_registrar_la_forma
  from devoluciones;
