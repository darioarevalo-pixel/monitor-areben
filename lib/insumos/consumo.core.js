/**
 * Cuántos PEDIDOS hubo cada día, por canal. El denominador del consumo de bolsas.
 *
 * # Por qué no se reusa `lib/ventas-diarias/core.js`
 *
 * Ese núcleo contesta otra pregunta —cuánto se vendió, en unidades y en **plata**— y para eso
 * necesita `venta_detalles`, que es la tabla más grande. Acá alcanza con contar filas de `ventas`:
 * **una bolsa por pedido**, no por unidad. Y sobre todo, su endpoint pide el permiso
 * `ventas-mensuales` (área Análisis) justamente **porque lleva plata**: colgar Insumos de ahí sería
 * darle la facturación a quien sólo tiene que saber cuántas bolsas se gastan.
 *
 * ⇒ Lo que sí se reusa, importado y ⛔ no copiado, son las dos reglas que ya existen: `canalDe`
 * (`lib/liquidacion/canal.core.js`) y `esVentaTecnica` (`lib/etl/tecnica.core.js`).
 *
 * # Por qué se cuentan FILAS y no unidades
 *
 * Es el mismo criterio que `serieDiaria` de Ventas de Marketing: **una venta de cero unidades igual
 * es una compra** — y para el packaging la compra es lo que se embolsa. Una compra online de BDI
 * trae 1,9 fundas: contar unidades daría casi el doble de bolsas de las que se usan.
 */

import { canalDe } from '../liquidacion/canal.core.js'
import { esVentaTecnica } from '../etl/tecnica.core.js'

/**
 * @param ventas  filas de `ventas` con `date_sale` y `channel` (y `channel_id` en BDI)
 * @param desde   día ISO inclusive
 * @param hasta   día ISO inclusive
 * @returns un renglón por día CON ventas: `{ fecha, local, online, mayorista }`
 *
 * ⚠️ **Los días sin ninguna venta no salen en la lista**, y eso es a propósito: quien mide el ritmo
 * divide por los días que llegaron, no por los que pidió. Un domingo cerrado no es un día de cero
 * bolsas — es un día que no habla.
 *
 * 🔴 Las ventas **técnicas** (las que el propio monitor crea para descontar stock en fallas y
 * sesiones de fotos) no se cuentan: no salieron por la puerta y no se llevaron ninguna bolsa.
 * Y el canal `otro` tampoco entra en ninguna columna: no se sabe qué es, y meterlo en `local`
 * inflaría el consumo del mostrador.
 */
export function comprasPorDia(ventas, desde, hasta) {
  const porFecha = new Map()
  for (const v of ventas || []) {
    if (esVentaTecnica(v)) continue
    const fecha = String(v.date_sale || '').slice(0, 10)
    if (!fecha || fecha < desde || fecha > hasta) continue
    const canal = canalDe(v.channel)
    if (canal !== 'local' && canal !== 'online' && canal !== 'mayorista') continue
    let fila = porFecha.get(fecha)
    if (!fila) {
      fila = { fecha, local: 0, online: 0, mayorista: 0 }
      porFecha.set(fecha, fila)
    }
    fila[canal] += 1
  }
  return [...porFecha.values()].sort((a, b) => a.fecha.localeCompare(b.fecha))
}
