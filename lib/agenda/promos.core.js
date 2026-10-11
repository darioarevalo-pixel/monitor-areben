/**
 * Qué promo bancaria corre un día dado. JS plano porque, además de la pantalla (`lib/agenda/index.ts`,
 * que lo re-exporta tipado), lo usa el handler de la Caja (`api/_caja.js`): el servidor tiene que saber
 * si HOY hay promo de crédito antes de aceptar una venta a la cuenta del −10 % (auditoría A6, 11-oct).
 * Sin el servidor, la cuenta de la promo se manda con `curl` (o con una pantalla abierta desde ayer).
 */
import { aplicaEn } from './reglas.core.js'

/**
 * ¿Esta promo corre este día?
 *
 * Cruza **los dos ejes de vigencia**: la ventana (`desde`/`hasta`) y la regla. Que estén separados
 * es lo que permite contestar "ya venció" sin mirar la regla, y "hoy no toca" sin mirar la ventana.
 *
 * `hasta` en `null` es una promo sin fin anunciado, no una vencida: los bancos publican varias así.
 */
export function corre(promo, fecha) {
  if (!promo.activa) return false
  if (fecha < promo.desde) return false
  if (promo.hasta && fecha > promo.hasta) return false
  return aplicaEn(promo.regla, fecha)
}

/**
 * Las promos de un día, filtradas por canal y por marca, ordenadas por banco.
 *
 * `marcas` vacío en la promo quiere decir **las dos**: la promo la define el banco y lo normal es
 * que valga para todo lo que se cobre ahí. Tratar el vacío como "ninguna" escondería la mayoría.
 */
export function promosDe(promos, fecha, opts = {}) {
  const { canal, marca } = opts
  return promos
    .filter((p) => corre(p, fecha))
    .filter((p) => !canal || (p.canales || []).includes(canal))
    .filter((p) => !marca || !p.marcas || p.marcas.length === 0 || p.marcas.includes(marca))
    .sort((a, b) => a.banco.localeCompare(b.banco, 'es') || a.medio.localeCompare(b.medio))
}

/**
 * Las promos de CRÉDITO con descuento que corren hoy en el mostrador de una marca: las que habilitan
 * la cuenta del −10 % en la Caja. La MISMA pregunta para la pantalla y para el servidor.
 */
export function promosDeCreditoEnMostrador(promos, fecha, marca) {
  return promosDe(promos, fecha, { canal: 'mostrador', marca })
    .filter((p) => p.medio === 'credito' && p.beneficio && p.beneficio.tipo === 'descuento')
}
