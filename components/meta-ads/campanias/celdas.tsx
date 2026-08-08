'use client'

/**
 * Las celdas de la tabla de campañas que tienen criterio propio: el presupuesto, la corrección de
 * etapa, la marca y el estado. Cada una tiene estados que **no son intercambiables**, y ese es el
 * motivo de que sean componentes y no un `{valor}` en la fila.
 */

import { aMonto } from '@/lib/meta-ads/acciones'
import { money, rotuloEstado } from '@/lib/meta-ads/formato'
import { ETIQUETA_ETAPA, overrideViejo, rotuloObjetivo } from '@/lib/meta-ads/etapas'
import { ETIQUETA_LINEA, LINEAS } from '@/lib/meta-ads/lineas'
import type { CampañaEtapa, LineaPauta } from '@/lib/meta-ads/tipos'
import type { Correccion } from '@/components/meta-ads/useCampanias'
import { Button, StatusPill, color, font, space } from '@/components/ui'

/**
 * El presupuesto diario de la campaña.
 *
 * Tres estados distintos que **no** son intercambiables, y por eso ninguno se dibuja como «$0»:
 *  - un diario propio ⇒ la campaña es CBO y reparte sola entre sus conjuntos;
 *  - un presupuesto total (lifetime) ⇒ se muestra y no se edita desde acá;
 *  - nada ⇒ el presupuesto vive en los conjuntos, y ahí se toca.
 */
export function CeldaDiario({ c, moneda }: { c: CampañaEtapa; moneda: string }) {
  if (c.diarioCrudo) {
    return (
      <span title="Presupuesto a nivel campaña: Meta lo reparte solo entre los conjuntos">
        {money(aMonto(c.diarioCrudo, moneda), moneda)}
      </span>
    )
  }
  if (c.totalCrudo) {
    return (
      <span style={{ color: color.mut2, fontSize: font.xs }} title="Presupuesto total: se muestra pero no se edita desde acá">
        total {money(aMonto(c.totalCrudo, moneda), moneda)}
      </span>
    )
  }
  return <span style={{ color: color.mut2, fontSize: font.xs }} title="El presupuesto está en los conjuntos">en conjuntos</span>
}

/**
 * La celda de la corrección manual. Tiene tres estados y ninguno es decorativo:
 *
 *  - sin corregir → el botón para corregirla (solo para quien pautea);
 *  - corregida → dice a qué etapa y quién la puso, con la vuelta a la automática al lado;
 *  - corregida **y el objetivo cambió después** → ámbar. El override sigue mandando, pero el juicio
 *    se hizo sobre otra campaña de la que hoy es, y eso hay que poder verlo.
 */
export function CeldaEtapa({ c, correccion }: { c: CampañaEtapa; correccion: Correccion }) {
  const o = correccion.porCampaña[c.id]

  if (!o) {
    if (!correccion.puedePautar) return <span style={{ color: color.mut2 }}>automática</span>
    return <Button size="sm" variant="ghost" onClick={() => correccion.onCorregir(c)}>Corregir</Button>
  }

  const vieja = overrideViejo(o, c)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[1], alignItems: 'flex-start' }}>
      <StatusPill tone={vieja ? 'warning' : 'brand'} label={`a mano: ${ETIQUETA_ETAPA[o.etapa]}`} />
      <span style={{ fontSize: font.xs, color: color.mut2 }} title={o.motivo || undefined}>
        la corrigió {o.por}
      </span>
      {vieja && (
        <span style={{ fontSize: font.xs, color: color.warningInk, lineHeight: 1.4 }}>
          Le cambiaron el objetivo desde entonces (era {rotuloObjetivo(o.objetivo)}): conviene revisarla.
        </span>
      )}
      {correccion.puedePautar && (
        <div style={{ display: 'flex', gap: space[1], flexWrap: 'wrap' }}>
          <Button size="sm" variant="ghost" onClick={() => correccion.onCorregir(c)}>Cambiar</Button>
          <Button size="sm" variant="ghost" onClick={() => correccion.onVolverAuto(c)}>Volver a la automática</Button>
        </div>
      )}
    </div>
  )
}

/**
 * La marca de una campaña ya asignada. Hermana de `CeldaEtapa`.
 *
 * Reasignar es mover plata de una marca a otra, así que dice **quién** la asignó y desde cuándo. El
 * servidor además exige permiso en las dos puntas: no alcanza con poder pautar en la marca a la que
 * se la querés dar.
 */
export function CeldaLinea({ c, correccion }: { c: CampañaEtapa; correccion: Correccion }) {
  const a = correccion.lineaPorCampaña[c.id]
  if (!a) return <span style={{ color: color.mut2 }}>sin marca</span>

  const renombrada = !!a.nombre && a.nombre !== c.nombre
  const puede = correccion.puedeAsignarEn(a.linea)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[1], alignItems: 'flex-start' }}>
      <StatusPill tone={renombrada ? 'warning' : 'brand'} label={ETIQUETA_LINEA[a.linea]} />
      <span style={{ fontSize: font.xs, color: color.mut2 }}>la asignó {a.por}</span>
      {renombrada && (
        <span style={{ fontSize: font.xs, color: color.warningInk, lineHeight: 1.4 }}>
          La renombraron desde entonces (era «{a.nombre}»): conviene confirmar que sigue siendo de esta marca.
        </span>
      )}
      {puede && (
        <div style={{ display: 'flex', gap: space[1], flexWrap: 'wrap' }}>
          <BotonesDeLinea c={c} sugerida={null} correccion={correccion} />
          <Button size="sm" variant="ghost" onClick={() => correccion.onDesasignar(c)}>Sacarle la marca</Button>
        </div>
      )}
    </div>
  )
}

/**
 * Los tres botones de marca.
 *
 * La sugerencia sale del nombre de la campaña y **sólo se destaca**: prellena la mirada, no la
 * decisión. Sigue haciendo falta el click, y ante un nombre ambiguo no se sugiere nada. Es la misma
 * regla del calendario —el cálculo propone, la persona confirma— y acá pesa el doble, porque lo que
 * se está decidiendo es de quién es la plata.
 */
export function BotonesDeLinea({ c, sugerida, correccion }: {
  c: CampañaEtapa
  sugerida: LineaPauta | null
  correccion: Correccion
}) {
  return (
    <div style={{ display: 'flex', gap: space[1], flexWrap: 'wrap' }}>
      {LINEAS.map((l) => {
        const puede = correccion.puedeAsignarEn(l)
        return (
          <Button
            key={l}
            size="sm"
            variant={l === sugerida ? 'soft' : 'ghost'}
            disabled={!puede}
            title={puede ? undefined : `No tenés permiso para pautar en ${ETIQUETA_LINEA[l]}`}
            onClick={() => correccion.onAsignar(c, l)}
          >
            {ETIQUETA_LINEA[l]}
            {l === sugerida ? ' ·' : ''}
          </Button>
        )
      })}
    </div>
  )
}

/** El estado de entrega de una CAMPAÑA (femenino). El rótulo y el tono salen de `formato.ts`. */
export function EstadoPill({ s }: { s: string | null }) {
  const r = rotuloEstado(s, 'f')
  if (!r) return <span style={{ color: color.mut2 }}>—</span>
  return <StatusPill tone={r.tone} label={r.txt} />
}
