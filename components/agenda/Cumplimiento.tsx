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
import { Card, Chips, EmptyState, Notice, color, font, space, weight, useFiltroUrl, type ChipOpt } from '@/components/ui'
import {
  clavesDestino, cumplimiento, DIAS_CUMPLIMIENTO, hoyIso, porResponsable, rotuloDestinoCorto,
  rotuloRegla, type FilaCumplimiento, type Hecho, type ItemAgenda,
} from '@/lib/agenda'

export function Cumplimiento({ items, hechos }: { items: ItemAgenda[]; hechos: Hecho[] }) {
  const hoy = hoyIso()
  const todas = useMemo(() => cumplimiento(items, hechos, hoy), [items, hechos, hoy])

  const [quien, setQuien] = useFiltroUrl<string>('quien', 'todos')
  const responsables = useMemo(() => porResponsable(todas), [todas])
  const filas = useMemo(
    () => (quien === 'todos' ? todas : todas.filter((f) => clavesDestino(f.item.destino).includes(quien))),
    [todas, quien],
  )

  const porDia = useMemo(() => {
    const m = new Map<string, FilaCumplimiento[]>()
    for (const f of filas) {
      const ya = m.get(f.fecha)
      if (ya) ya.push(f)
      else m.set(f.fecha, [f])
    }
    return [...m.entries()]
  }, [filas])

  if (todas.length === 0) {
    return (
      <EmptyState
        title="Todavía no hay ninguna ocurrencia para mostrar."
        hint="Cargá un pendiente rutinario y acá van a aparecer los días en que le tocaba."
        dashed
      />
    )
  }

  const tildados = filas.filter((f) => f.hecho).length

  const chips: ChipOpt<string>[] = [
    { key: 'todos', label: 'Todos', n: todas.filter((f) => !f.hecho).length },
    ...responsables.map((r) => ({
      key: r.clave,
      label: r.label,
      n: r.sin,
      title: `${r.sin} sin tildar de ${r.total}`,
    })),
  ]

  return (
    <div style={{ display: 'grid', gap: space[3] }}>
      <Notice tone="neutral">
        Últimos {DIAS_CUMPLIMIENTO} días: <b>{tildados}</b> de <b>{filas.length}</b> tildados. Un
        renglón sin tildar puede ser que no se hizo, que se hizo y nadie lo marcó, o que la regla esté
        mal cargada — las tres se arreglan distinto, así que la pantalla no saca conclusiones.
      </Notice>

      {responsables.length > 1 && (
        <div style={{ display: 'grid', gap: space[1] }}>
          <Chips opciones={chips} value={quien} onChange={setQuien} />
          {/*
            ⚠️ Los números pueden sumar más que el total, y decirlo cuesta un renglón: un pendiente
            dirigido a dos personas queda debiéndose en las dos. Repartir la mitad a cada una sería
            inventar una responsabilidad parcial que nadie acordó.
          */}
          <div style={{ fontSize: font.xs, color: color.mut2 }}>
            Lo que quedó sin tildar, por responsable. Un pendiente de dos personas cuenta en las dos.
          </div>
        </div>
      )}

      {porDia.length === 0 && (
        <EmptyState
          title="Nada de esa persona cayó en estos días."
          hint="Puede ser que no tenga rutinas cargadas, o que las suyas no corran en esta ventana."
          dashed
        />
      )}

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
                // `item.id` es único DENTRO del día, no en la lista: con arrastre el mismo
                // ítem aparece en dos fechas.
                key={`${f.fecha}·${f.item.id}`}
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
                    // 🔑 En el renglón que importa —el que no se hizo— va **de quién era**, y va
                    // primero. Hasta acá el informe decía qué rutina y qué día, y para saber a quién
                    // reclamarle había que ir a «Cargar» y buscarla. ⚠️ No es lo mismo que el
                    // `usuario` de arriba: aquél es quien lo hizo, éste es quien lo debe.
                    : `— ${rotuloDestinoCorto(f.item.destino) || 'todo el equipo'} · sin tildar · ${rotuloRegla(f.item.regla)}`}
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
