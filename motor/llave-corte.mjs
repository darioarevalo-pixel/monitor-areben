/**
 * 🔑 **¿El ERP MANDA en esta tienda?** — la regla, UNA, para el stock a TN, el precio a TN y el stock a ML (Bruno, 1-nov: «tiene
 * que ser un interruptor que se encienda el día del corte, tanto para BDI como para Zattia, como todo lo que estamos haciendo»).
 *
 * Manda = la LÍNEA de la tienda ya cortó (`erp_corte`, sql/063: la escribe `libro.mjs alinear --corte`; Stunned 28-oct, BDI
 * 15/16-nov, Zattia 23-nov) **o** la variable de siempre la prende a mano (`STOCK_TN_MANDA` / `PRECIO_TN_MANDA` /
 * `STOCK_ML_MANDA`: sirve para probar antes del corte; ⛔ hace falta para que se prenda). Es la MISMA tabla que leen el libro
 * (`gnYaNoManda`) y el monitor (Caja, Liquidación, conteos) ⇒ todo se prende en el mismo instante.
 * 🔴 `cortes` es OBLIGATORIO: sin saber si la línea cortó ⛔ se elige (`gnYaNoManda` tira).
 * 🔴 Las funciones de la variable sola (`mandaEn`, `precioMandaEn`, `mandaEnML`) ⛔ se llaman fuera de acá
 * (`test/llave-corte.test.mjs` lo vigila): eso dejaba el empuje APAGADO el día del corte si nadie tocaba la variable.
 * La tienda de TN ES la línea (bdi, zattia, stunned: cada una con su tienda); ML es sólo de BDI.
 * 🛑 FRENO de emergencia: `ERP_NO_MANDA=bdi` (lista de tiendas; Vercel de `areben-erp` y variable del repo) le GANA a todo —al
 * corte y a la variable—: el empuje vuelve a SECO. Es lo único que lo apaga después del corte (el corte ⛔ se mueve).
 */
import { gnYaNoManda } from './depositos.mjs'
import { mandaEn } from './tn/stock.mjs'
import { precioMandaEn } from './tn/precio.mjs'
import { mandaEnML } from './ml/stock.mjs'

const corto = (linea, cortes, ahora) => gnYaNoManda(linea, ahora, cortes)

/** ¿La tienda está frenada a mano (`ERP_NO_MANDA`)? Un typo FALLA (⛔ deja el freno sin poner, callado). */
export function frenada(tienda, env = process.env) {
  const lista = String(env.ERP_NO_MANDA ?? '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
  for (const t of lista) if (!['bdi', 'zattia', 'stunned'].includes(t)) throw new Error(`ERP_NO_MANDA: tienda desconocida «${t}»`)
  return lista.includes(tienda)
}

/** ¿El libro manda el STOCK de esa tienda de TN? */
export const stockTnManda = (tienda, cortes, env = process.env, ahora = new Date()) => !frenada(tienda, env) && (corto(tienda, cortes, ahora) || mandaEn(tienda, env))

/** ¿El ERP manda el PRECIO de esa tienda de TN? */
export const precioTnManda = (tienda, cortes, env = process.env, ahora = new Date()) => !frenada(tienda, env) && (corto(tienda, cortes, ahora) || precioMandaEn(tienda, env))

/** ¿El libro manda el stock de Mercado Libre (sólo BDI)? */
export const stockMlManda = (cortes, env = process.env, ahora = new Date()) => !frenada('bdi', env) && (corto('bdi', cortes, ahora) || mandaEnML('bdi', env))

/**
 * `{ linea: ISO }` de `erp_corte` de ESA base (cada base guarda los de sus líneas: Stunned vive en la de Zattia). Acepta el
 * `db` del motor (`q`) o un cliente pg (`query`). Sin la tabla, TIRA (⛔ un vacío que diga «nadie cortó»).
 */
export async function leerCortes(db) {
  const correr = db.q ? (s) => db.q(s) : async (s) => (await db.query(s)).rows
  let rows
  try {
    rows = await correr('select linea, instante from erp_corte')
  } catch (e) {
    if (e && e.code === '42P01') throw new Error('Falta la tabla erp_corte (sql/063): sin ella no se sabe si el ERP ya manda.')
    throw e
  }
  return Object.freeze(Object.fromEntries(rows.map((r) => [r.linea, new Date(r.instante).toISOString()])))
}
