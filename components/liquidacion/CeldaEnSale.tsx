'use client'

import { Badge, color, font } from '@/components/ui'
import type { EnSale } from '@/lib/liquidacion/vendido'

/**
 * «Vendido en sale», la celda — la misma en Por producto y en Por variante.
 *
 * Lo pidió Bruno el 14-ago-2026: *que un pico no se lea como demanda real*. La columna de al lado
 * dice cuánto se vendió; ésta dice **cuánto de eso salió con la oferta puesta**.
 *
 * 🔑 **Muestra la ventana de 30 días y no la de 7 ni la de 90.** Es la que alimenta «Vida útil
 * est.» —el número que dispara reponer— y es la columna que la tabla trae en negrita. Las otras dos
 * están en el `title`: son para confirmar una sospecha, no para leer de corrido.
 *
 * 🔑 **`en oferta hoy` es una marca DISTINTA y por eso se ve distinta.** Sale de Tienda Nube y no de
 * la bitácora: cubre los productos con la promo cargada a mano, que el Monitor nunca escribió (173
 * en Zattia el 15-ago-2026, el 9% de las unidades de 30 días). De esos **no hay historia** —TN dice
 * cómo está hoy, no desde cuándo—, así que decir «vendió N en sale» sería inventarlo.
 */
export function CeldaEnSale({ enSale, total30, ofertaHoy }: { enSale: EnSale | null; total30: number; ofertaHoy: boolean }) {
  const u = enSale?.s30 ?? 0

  if (!u) {
    return ofertaHoy ? (
      <Badge tone="neutral" subtle style={{ fontWeight: 400 }} >
        en oferta hoy
      </Badge>
    ) : (
      <span style={{ color: color.mut2 }}>—</span>
    )
  }

  const detalle =
    `${enSale!.s7} de las de 7d · ${u} de las de 30d · ${enSale!.s90} de las de 90d salieron con la oferta puesta. ` +
    'Sólo cuenta las ofertas que escribió el Monitor.'

  return (
    <span title={detalle} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.2 }}>
      {/* Ámbar, que en el kit quiere decir advertencia y nada más: eso es exactamente lo que es —
          esas unidades están adentro del número de al lado y lo hacen leer más alto de lo que fue. */}
      <span style={{ fontWeight: 600, color: color.warning }}>{u}</span>
      {/* Sin el "de cuántas", el número no dice nada: 9 sobre 12 es un pico de sale y 9 sobre 90 es ruido. */}
      <span style={{ fontSize: font.xs, color: color.mut2 }}>de {total30}</span>
      {ofertaHoy && <span style={{ fontSize: font.xs, color: color.mut2 }}>sigue en oferta</span>}
    </span>
  )
}
