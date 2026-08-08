'use client'

/**
 * La ventana del censo de campañas: 30 días o 90.
 *
 * ⚠️ **No es el selector de rango de Rendimiento, y no se puede unificar con él.** El de
 * Rendimiento llega hasta «Hoy»; acá eso haría que a las 9 de la mañana las tres etapas dieran cero
 * y la pantalla avisara de un agujero que no existe. Son dos ventanas con dos exigencias distintas:
 * una mira el gasto de un período, la otra decide si una pauta **está al aire**.
 */

import { InfoPopover } from '@/components/ui/InfoPopover'
import { UMBRALES_ETAPA } from '@/lib/meta-ads/etapas'
import { color, font, radius, space } from '@/components/ui'

export function VentanaEtapas({ dias, setDias }: { dias: number; setDias: (d: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
      <label style={{ fontSize: font.base, color: color.ink2, display: 'flex', alignItems: 'center', gap: space[1.5] }}>
        Mirando los últimos:
        <select
          className="mo-input"
          value={dias}
          onChange={(e) => setDias(Number(e.target.value))}
          style={{ padding: '6px 10px', borderRadius: radius.md, fontSize: font.base, cursor: 'pointer' }}
        >
          <option value={UMBRALES_ETAPA.dias}>{UMBRALES_ETAPA.dias} días</option>
          <option value={UMBRALES_ETAPA.diasAmplio}>{UMBRALES_ETAPA.diasAmplio} días</option>
        </select>
      </label>
      <InfoPopover titulo="Por qué la ventana no es la de Rendimiento">
        <p>
          Acá la ventana es <b>fija</b> y no sigue al selector de Rendimiento. Si se pudiera poner en
          &quot;Hoy&quot;, a las 9 de la mañana todas las etapas darían cero y la pantalla avisaría
          de un agujero que no existe.
        </p>
        <p>
          Una campaña cuenta como <b>al aire</b> si está activa <i>y</i> gastó en la ventana. Una
          campaña activa cuyos conjuntos están todos pausados figura activa en Meta y no entrega
          nada: contarla taparía justo lo que estas pantallas existen para mostrar.
        </p>
      </InfoPopover>
    </div>
  )
}
