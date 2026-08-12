'use client'

/**
 * Qué se tildó y qué no, en los últimos días. Es lo que mira gerencia.
 *
 * # Es una foto, no un semáforo
 *
 * No hay porcentaje mínimo, ni color rojo cuando "se cumple poco", ni aviso automático: **el umbral
 * lo pondría la pantalla y no lo eligió nadie**. Una rutina sin tildar puede ser que no se hizo, que
 * se hizo y nadie tildó, o que ese día no correspondía y la regla está mal cargada. Las tres se
 * arreglan distinto y ninguna se contesta desde acá — lo que la pantalla puede hacer es mostrar los
 * días como fueron y que la conversación la tenga una persona.
 *
 * Se calcula con `cumplimiento()`, que camina día por día con el mismo `aplicaEn` de la pestaña Hoy:
 * el renglón vacío de acá es exactamente el que el local vio ese día sin tildar.
 */

import { useMemo } from 'react'
import { Card, EmptyState, Notice, color, font, space, weight } from '@/components/ui'
import { cumplimiento, DIAS_CUMPLIMIENTO, hoyIso, rotuloRegla, type FilaCumplimiento, type Hecho, type ItemAgenda } from '@/lib/agenda'

export function Cumplimiento({ items, hechos }: { items: ItemAgenda[]; hechos: Hecho[] }) {
  const hoy = hoyIso()
  const filas = useMemo(() => cumplimiento(items, hechos, hoy), [items, hechos, hoy])

  const porDia = useMemo(() => {
    const m = new Map<string, FilaCumplimiento[]>()
    for (const f of filas) {
      const ya = m.get(f.fecha)
      if (ya) ya.push(f)
      else m.set(f.fecha, [f])
    }
    return [...m.entries()]
  }, [filas])

  if (filas.length === 0) {
    return (
      <EmptyState
        title="Todavía no hay ninguna ocurrencia para mostrar."
        hint="Cargá un pendiente rutinario y acá van a aparecer los días en que le tocaba."
        dashed
      />
    )
  }

  const tildados = filas.filter((f) => f.hecho).length

  return (
    <div style={{ display: 'grid', gap: space[3] }}>
      <Notice tone="neutral">
        Últimos {DIAS_CUMPLIMIENTO} días: <b>{tildados}</b> de <b>{filas.length}</b> tildados. Un
        renglón sin tildar puede ser que no se hizo, que se hizo y nadie lo marcó, o que la regla esté
        mal cargada — las tres se arreglan distinto, así que la pantalla no saca conclusiones.
      </Notice>

      {porDia.map(([fecha, delDia]) => (
        <Card key={fecha} padding={3}>
          <div
            style={{
              display: 'flex', alignItems: 'baseline', gap: space[2],
              marginBottom: space[2], flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: font.base, fontWeight: weight.semibold, color: color.ink }}>
              {diaLabel(fecha)}
            </span>
            {fecha === hoy && <span style={{ fontSize: font.xs, color: color.brand, fontWeight: weight.semibold }}>hoy</span>}
            <span style={{ fontSize: font.sm, color: color.mut2 }}>
              {delDia.filter((f) => f.hecho).length}/{delDia.length}
            </span>
          </div>

          <div style={{ display: 'grid', gap: 4 }}>
            {delDia.map((f) => (
              <div
                key={f.item.id}
                style={{ display: 'flex', gap: space[2], alignItems: 'baseline', flexWrap: 'wrap', fontSize: font.sm }}
              >
                <span style={{ color: f.hecho ? color.success : color.mut2, fontWeight: weight.semibold }}>
                  {f.hecho ? '✓' : '·'}
                </span>
                <span style={{ color: f.hecho ? color.ink2 : color.ink, fontWeight: f.hecho ? weight.normal : weight.medium }}>
                  {f.item.titulo}
                </span>
                <span style={{ color: color.mut2 }}>
                  {f.hecho
                    // "Lo marcó Local" y no "lo hizo Ana": `Local` es un puesto compartido.
                    ? `— lo marcó ${f.hecho.usuario}${f.hecho.nota ? ` · ${f.hecho.nota}` : ''}`
                    : `— sin tildar · ${rotuloRegla(f.item.regla)}`}
                </span>
                {!f.item.activo && (
                  <span style={{ color: color.mut2, fontStyle: 'italic' }}>(apagado después)</span>
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  )
}

/**
 * «mar 11 de ago».
 *
 * Lo arma el navegador y no el array `DIAS_CORTOS` del calendario editorial, a propósito: ese array
 * ya corrió todas las etiquetas un día cuando alguien lo dio vuelta para que arrancara en lunes, y
 * mientras siga suelto adentro de `Calendario.tsx` no vale la pena tener una segunda copia. El
 * mediodía es para que el huso no corra la fecha.
 */
function diaLabel(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00`)
  return d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })
}
