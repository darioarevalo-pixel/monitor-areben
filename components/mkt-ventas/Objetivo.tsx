'use client'

import { Barra, Card, color, font, space, weight } from '@/components/ui'
import { avanceDeMeta } from '@/lib/norte/core'
import type { MetaGuardada } from '@/lib/norte/persistencia'
import { medirElDia, unidadDeLaMeta, type DiaDeVenta } from '@/lib/mkt-ventas/core'
import { rotuloFecha } from '@/lib/fechas/semana'

/**
 * El objetivo del sector, con la barra del día que se está mirando.
 *
 * # Las dos decisiones que vale la pena escribir
 *
 * 1. **El título dice el techo de la rampa y la barra mide el escalón vigente.** Los tres
 *    objetivos de BDI son 25 al 8-sep, 50 al 30-sep y 100 al 31-oct. Contra el 100, el mejor día
 *    del mes (16 compras online) llena un 16% y la barra queda muerta todo el trimestre; contra el
 *    escalón llena un 64%, que es la pregunta que se puede contestar esta semana. Los dos números
 *    están escritos, así que ninguno se esconde detrás del otro.
 * 2. 🔑 **Sin objetivo cargado NO se dibuja una barra en 0%.** Es la misma regla que `avanceDeMeta`
 *    (que devuelve `null` y no cero): un 0% afirma «no avanzamos», que es una frase sobre el
 *    negocio, y acá lo que pasa es que nadie cargó la meta — una frase sobre el dato.
 */
export function Objetivo({ escalon, techo, dia, hoy, articulo }: { escalon: MetaGuardada | null; techo: MetaGuardada | null; dia: DiaDeVenta | null; hoy: string; articulo: { singular: string; plural: string } }) {
  if (!escalon || !techo) {
    return (
      <Card style={{ marginBottom: space[4] }}>
        <div style={{ fontSize: font.lg, fontWeight: weight.semibold, color: color.ink }}>Esta marca todavía no tiene un objetivo cargado</div>
        <div style={{ fontSize: font.sm, color: color.mut, marginTop: 4 }}>
          Los objetivos se cargan desde <strong>Norte</strong>, en Dirección. Mientras tanto, el contador de abajo igual cuenta.
        </div>
      </Card>
    )
  }

  const avance = avanceDeMeta(escalon, medirElDia(escalon, dia), hoy)
  const unidad = unidadDeLaMeta(escalon.medidor, articulo.plural)
  const pct = avance.pct
  const tono = pct === null ? color.mut2 : pct >= 100 ? color.success : pct >= 60 ? color.brandSolid : color.warning

  return (
    <Card style={{ marginBottom: space[4] }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: space[3], flexWrap: 'wrap' }}>
        {/* El título es el `label` de la meta, o sea las palabras con las que Bruno la escribió
            («100 compras por dia online»). Componerlo acá con el número y la unidad del medidor
            daría «Objetivo 100 ventas/día», que no es como se llama el objetivo en la conversación
            del sector — y el nombre es justamente lo que hace que se reconozca de un vistazo. */}
        <div style={{ fontSize: font.xl, fontWeight: weight.bold, letterSpacing: -0.2, color: color.ink }}>
          {techo.label}
        </div>
        {techo.fechaObjetivo && (
          <div style={{ fontSize: font.sm, color: color.mut }}>al {rotuloFecha(techo.fechaObjetivo)}</div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2], marginTop: space[4] }}>
        <span style={{ fontSize: font['3xl'], fontWeight: weight.bold, color: color.ink, fontVariantNumeric: 'tabular-nums' }}>
          {avance.medido === null ? '—' : avance.medido.toLocaleString('es-AR')}
        </span>
        <span style={{ fontSize: font.md, color: color.mut }}>
          de {escalon.objetivo.toLocaleString('es-AR')} {unidad}
        </span>
        {pct !== null && (
          <span style={{ marginLeft: 'auto', fontSize: font.md, fontWeight: weight.semibold, color: tono, fontVariantNumeric: 'tabular-nums' }}>
            {pct.toFixed(0)}%
          </span>
        )}
      </div>

      <Barra pct={pct ?? 0} tono={tono} alto={10} style={{ marginTop: space[2] }} />

      <div style={{ fontSize: font.sm, color: color.mut, marginTop: space[2] }}>
        {avance.motivo ? (
          avance.motivo
        ) : (
          <>
            Escalón en curso: <strong style={{ color: color.ink2 }}>{escalon.objetivo.toLocaleString('es-AR')} {unidad}</strong>
            {escalon.fechaObjetivo && <> para el <strong style={{ color: color.ink2 }}>{rotuloFecha(escalon.fechaObjetivo)}</strong></>}
            {escalon.key !== techo.key && <> · después va el {techo.objetivo.toLocaleString('es-AR')}</>}
          </>
        )}
      </div>
    </Card>
  )
}
