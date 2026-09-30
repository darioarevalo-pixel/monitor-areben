/**
 * **La venta de ayer** para el parte de la mañana: por marca, por canal, y contra el mismo día de
 * la semana pasada. Puro.
 *
 * ⛔ **No cuenta nada propio**: la plata del día es `serieDiaria` de `lib/ventas-diarias/core.js`,
 * la misma que dibuja la pestaña «Día a día» de Ventas mensuales. Si el mail y la pantalla dijeran
 * números distintos, quien abre los dos ⛔ sabría a cuál creerle. Stunned se separa con
 * `ventaPorLinea` de `lib/memo/foto.core.js`, el mismo corte que usa el memo.
 */

import { serieDiaria, conSemanaAnterior } from '../ventas-diarias/core.js'
import { ventaPorLinea } from '../memo/foto.core.js'
import { esVentaTecnica } from '../etl/tecnica.core.js'
import { sumarDias } from '../fechas/dia.core.js'
import { CANALES_MINORISTA } from '../liquidacion/canal.core.js'

/**
 * Lo minorista de un día: local + online + otros canales.
 *
 * 🔴 **La comparación contra la semana pasada va POR LADO, ⛔ sobre el total.** 📊 Medido el
 * 30-sep-2026 en BDI: el total del martes 29 daba **−66%** contra el 22, y era **un solo pedido
 * mayorista de $3,3 M** del 22 — el minorista había CRECIDO un 45%. Un pedido mayorista cada tanto
 * da vuelta el total, y el total solo manda a buscar un problema que ⛔ existe.
 */
export function minorista(porCanal) {
  const out = { compras: 0, unidades: 0, plata: 0 }
  for (const c of CANALES_MINORISTA) {
    const x = porCanal && porCanal[c]
    if (!x) continue
    out.compras += x.compras
    out.unidades += x.unidades
    out.plata += x.plata
  }
  return out
}

/**
 * ¿El espejo ya tiene el día de ayer completo?
 *
 * 🔑 Lo dice la fila `diario` de `sync_state`: `ventas_date` es el día en que corrió el sync, y el
 * sync de HOY es el que cerró AYER. 📊 Medido el 30-sep-2026: los syncs de las 03:00 arrancan entre
 * las 07:30 y las 10:40 por la demora del cron de GitHub ⇒ a la hora del mail esto puede dar
 * `false` de verdad, y el mail lo tiene que decir en vez de mostrar medio día como si fuera entero.
 *
 * @returns `true` · `false` · `null` si ⛔ se pudo leer (y eso también se dice).
 */
export function ayerCompleto(syncState, hoy) {
  if (!Array.isArray(syncState)) return null
  const diario = syncState.find((f) => f && f.clave === 'diario')
  if (!diario || !diario.ventas_date) return null
  return String(diario.ventas_date).slice(0, 10) >= hoy
}

/**
 * Ayer de UNA base, con la semana anterior y el corte por línea.
 *
 * @param base     'bdi' | 'zattia'
 * @param ventas   filas de `ventas` de ayer−7 a ayer (`id, date_sale, channel, discount,
 *                 shipping_cost, total_price` + `channel_id` en BDI)
 * @param detalles `sale_id, product_id, quantity, total`
 * @param skuPor   Map product_id → sku (sólo hace falta en Zattia, donde vive Stunned)
 * @param completo lo de `ayerCompleto`
 */
export function ventaDeAyer({ base, ventas, detalles, skuPor, hoy, completo }) {
  const ayer = sumarDias(hoy, -1)
  const antes = sumarDias(ayer, -7)
  // `medidoHasta` en `null`: la completitud la decide `ayerCompleto`, que mira la fila correcta.
  const serie = serieDiaria({ ventas, detalles, desde: antes, hasta: ayer, medidoHasta: null })
  const [fila] = conSemanaAnterior(serie, ayer)
  const diaAntes = serie.dias.find((d) => d.fecha === antes)

  // Las técnicas se sacan también del corte por línea: `ventaPorLinea` ⛔ las filtra sola.
  const reales = (ventas || []).filter((v) => !esVentaTecnica(v))
  const lineas = ventaPorLinea({ store: base, ventas: reales, detalles, skuPor, desde: ayer, hasta: ayer })
  const lineasAntes = ventaPorLinea({ store: base, ventas: reales, detalles, skuPor, desde: antes, hasta: antes })

  // Los 7 días que terminan ayer, para la barrita del mail. Minorista, por la misma razón que la
  // comparación: un pedido mayorista haría una barra diez veces más alta y aplastaría las demás.
  const serie7 = serie.dias.filter((d) => d.fecha > antes).map((d) => ({ fecha: d.fecha, plata: minorista(d.porCanal).plata }))
  const stunned7 = base === 'zattia'
    ? serie7.map(({ fecha }) => {
      const l = ventaPorLinea({ store: base, ventas: reales, detalles, skuPor, desde: fecha, hasta: fecha }).stunned
      return { fecha, plata: l ? l.facturado : 0 }
    })
    : null

  return {
    base,
    fecha: ayer,
    serie7,
    stunned7,
    completo,
    total: fila ? fila.total : null,
    previo: fila ? fila.previo : null,
    porCanal: fila ? fila.porCanal : {},
    porCanalAntes: diaAntes ? diaAntes.porCanal : null,
    minorista: fila ? minorista(fila.porCanal) : null,
    minoristaAntes: diaAntes ? minorista(diaAntes.porCanal) : null,
    lineas,
    lineasAntes,
    tecnicas: serie.tecnicas,
  }
}

/** La variación contra la semana pasada, en %. `null` si ⛔ hay con qué comparar. */
export function variacion(ahora, antes) {
  if (antes == null || !Number.isFinite(antes) || antes === 0) return null
  return ((ahora - antes) / antes) * 100
}
