'use client'

/**
 * **De dónde salió el censo de campañas. Va ARRIBA de todo y sólo aparece cuando ⛔ no es el de
 * siempre.**
 *
 * 🔴 Desde el 30-ago-2026 el censo tiene respaldo: si el token de Meta falta o venció, se arma desde
 * la foto diaria (`meta_ads_snapshot_dia`) en vez de contestar un 500. Antes el Embudo y Campañas
 * directamente ⛔ no abrían, mientras la zona de Rendimiento, las automatizaciones y los informes
 * seguían contestando — están arriba del guard del token **a propósito**, y la pregunta que contesta
 * el Embudo, *«¿a quién le estoy hablando?»*, ⛔ tampoco depende de que Graph conteste hoy.
 *
 * ⚠️ **Pero el respaldo ⛔ no es equivalente, y callarlo sería el defecto entero.** Le faltan:
 *  - las campañas que **nunca entregaron** —⛔ no tienen fila en la foto—, que son justo las que
 *    destapan un conjunto roto;
 *  - las anteriores al **8-ago-2026**, cuando `objetivo` empezó a guardarse. 📊 Son el 77% de las
 *    filas históricas, y por eso ⛔ **no** entran como «sin clasificar»: eso afirmaría que nadie les
 *    puso etapa.
 *
 * 🔑 **«La segunda etapa en cero» se lee distinto según de dónde venga**: del censo entero es un
 * hueco, del respaldo puede ser una campaña que existe y ese mes no entregó. Por eso el cartel lleva
 * la ventana y cuántas quedaron afuera.
 *
 * Lo comparten el Embudo y Campañas: las dos leen el MISMO censo, así que una que lo dijera y la
 * otra no dejaría a la mitad de la sección afirmando de más.
 */

import type { RespuestaEtapas } from '@/lib/meta-ads/tipos'
import { Notice, font, space } from '@/components/ui'

export function DeDondeSale({ d }: { d: RespuestaEtapas }) {
  if (d.fuente !== 'foto') return null
  return (
    <Notice tone="warning" icon="📌">
      <b>Esto sale de la foto diaria, ⛔ no de Meta.</b> {d.motivo}
      <div style={{ fontSize: font.sm, marginTop: space[1] }}>
        Ventana {d.desde} → {d.hasta}, sólo días cerrados.{' '}
        <b>Le faltan las campañas que nunca entregaron</b>: la foto guarda sólo las que gastaron, así
        que «activas sin entrega» está incompleto.
        {d.sinObjetivo
          ? ` Y ${d.sinObjetivo === 1 ? 'una campaña quedó afuera' : `${d.sinObjetivo} campañas quedaron afuera`} porque la foto todavía ⛔ no guardaba su objetivo.`
          : ''}
      </div>
    </Notice>
  )
}
