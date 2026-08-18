import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TablaMetas } from '@/components/norte/TablaMetas'
import type { MetaGuardada } from '@/lib/norte/persistencia'
import type { AvanceMeta } from '@/lib/norte/tipos'

/**
 * **El primer test de componentes del repo**, y existe por un defecto concreto.
 *
 * Norte tenía banco de lógica —`medirMeta`, la cascada, el P&L— y todo en verde, y aun así una meta
 * apagada **desaparecía de la pantalla sin verbo de vuelta**: no se podía reactivar, no se podía
 * borrar, y volver a crearla con el mismo nombre tampoco la recuperaba (la clave se desambigua y
 * nace una fila nueva, con la vieja al lado, muda). El único camino era `psql`. La regla que
 * fallaba —qué filas se listan— vivía **entera adentro del JSX**, donde ningún test podía
 * preguntarle nada.
 *
 * 🔑 **El oráculo no es que renderice: es qué muestra.** Cada caso de acá se cae si alguien vuelve
 * a filtrar la lista por `activa`, que es exactamente cómo nació el defecto.
 *
 * ⚠️ **Es render, no interacción.** `renderToStaticMarkup` no simula clicks —no hay
 * `@testing-library/react` en el repo y no hizo falta instalarlo—, así que esto defiende **que el
 * botón esté**, no que al apretarlo abra el editor. Eso se camina en producción.
 */

/** Una meta activa ya medida, como sale de `avanceDeMeta`. */
function activa(over: Partial<AvanceMeta['meta']> = {}, avance: Partial<AvanceMeta> = {}): AvanceMeta {
  return {
    meta: { key: 'salida', label: '400 fundas por día', medidor: 'unidades-dia', canal: null, objetivo: 400, ...over },
    medido: 264.3,
    motivo: null,
    pct: 66,
    falta: 135.7,
    veces: 1.5,
    porSemana: null,
    ...avance,
  }
}

/** Una meta apagada, como vuelve de la base con `activa=false`. */
function apagada(over: Partial<MetaGuardada> = {}): MetaGuardada {
  return {
    key: 'vieja',
    label: 'la que apagamos',
    medidor: 'unidades-dia',
    canal: null,
    objetivo: 333,
    orden: 1,
    activa: false,
    ...over,
  }
}

describe('TablaMetas — una meta apagada tiene que seguir teniendo camino de vuelta', () => {
  it('la muestra, con su chip, su objetivo y su botón Editar', () => {
    const html = renderToStaticMarkup(
      <TablaMetas avances={[activa()]} apagadas={[apagada()]} admin onEditar={() => {}} />,
    )

    // Está: éste es el defecto original. Antes la lista era `metas.filter((m) => m.activa)`.
    expect(html).toContain('la que apagamos')
    expect(html).toContain('apagada')
    // Su objetivo va, porque es lo que permite reconocerla: dos metas pueden llamarse igual.
    expect(html).toContain('333 fundas/día')
    // Y el botón, que es el único camino de vuelta: sin él no se reactiva ni se borra.
    expect(html.match(/Editar/g) ?? []).toHaveLength(2)
  })

  it('sin admin no hay ningún Editar, ni para la activa ni para la apagada', () => {
    const html = renderToStaticMarkup(
      <TablaMetas avances={[activa()]} apagadas={[apagada()]} admin={false} onEditar={() => {}} />,
    )
    expect(html).not.toContain('Editar')
    // Pero la apagada se sigue viendo: esconderla sería mentir sobre lo que hay cargado.
    expect(html).toContain('la que apagamos')
  })

  it('va DESPUÉS de las activas, no mezclada entre ellas', () => {
    const html = renderToStaticMarkup(
      <TablaMetas avances={[activa()]} apagadas={[apagada()]} admin onEditar={() => {}} />,
    )
    expect(html.indexOf('la que apagamos')).toBeGreaterThan(html.indexOf('400 fundas por día'))
  })

  it('NO la mide: un número al lado la devolvería a la conversación que apagarla quiso cerrar', () => {
    const html = renderToStaticMarkup(
      <TablaMetas avances={[]} apagadas={[apagada()]} admin onEditar={() => {}} />,
    )
    // El objetivo sí; el medido, el avance, lo que falta y el ritmo semanal, no.
    expect(html).toContain('333 fundas/día')
    expect(html).not.toContain('264,3')
    expect(html).not.toContain('%')
    // Cuatro columnas medidas, cuatro rayas.
    expect(html.match(/—/g) ?? []).toHaveLength(4)
  })
})

describe('TablaMetas — el vacío mira TODAS las metas', () => {
  it('con una sola apagada cargada NO dice «sin metas»', () => {
    const html = renderToStaticMarkup(
      <TablaMetas avances={[]} apagadas={[apagada()]} admin onEditar={() => {}} />,
    )
    // Decirlo escondería la única fila desde la que se la puede volver a prender.
    expect(html).not.toContain('Sin metas cargadas')
    expect(html).toContain('la que apagamos')
  })

  it('sin ninguna meta sí lo dice, y el texto cambia según quién mira', () => {
    const deAdmin = renderToStaticMarkup(<TablaMetas avances={[]} apagadas={[]} admin onEditar={() => {}} />)
    expect(deAdmin).toContain('Sin metas cargadas')
    expect(deAdmin).toContain('Agregá la primera')

    const deOtro = renderToStaticMarkup(<TablaMetas avances={[]} apagadas={[]} admin={false} onEditar={() => {}} />)
    expect(deOtro).toContain('Las carga un administrador')
  })
})

describe('TablaMetas — lo que la fila de una activa tiene que decir', () => {
  it('cuando no se pudo medir muestra el MOTIVO, no un cero', () => {
    const sinPlata = activa(
      { key: 'plata', label: 'contribución por funda', medidor: 'contrib-unidad', objetivo: 3000 },
      { medido: null, motivo: 'falta la contribución: el dashboard no está conectado', pct: null, falta: null, veces: null },
    )
    const html = renderToStaticMarkup(<TablaMetas avances={[sinPlata]} apagadas={[]} admin onEditar={() => {}} />)

    expect(html).toContain('el dashboard no está conectado')
    // Un 0% se leería como «no avanzamos», que es una afirmación sobre el negocio y es falsa.
    expect(html).not.toContain('0%')
  })

  it('la unidad la pone el MEDIDOR, no la mano: $ adelante y fundas atrás', () => {
    const plata = activa(
      { key: 'p', label: 'contribución', medidor: 'contrib-unidad', canal: 'mayorista', objetivo: 2000 },
      { medido: 1541, pct: 77, falta: 459, veces: 1.3 },
    )
    const html = renderToStaticMarkup(<TablaMetas avances={[plata]} apagadas={[]} admin onEditar={() => {}} />)

    expect(html).toContain('$2.000/funda')
    expect(html).toContain('$1.541/funda')
    // Y el canal se dice, porque el mismo medidor sobre otro canal da otro número.
    expect(html).toContain('mayorista')
  })

  it('«todos los canales» se dice con todas las letras, en vez de dejar el lugar vacío', () => {
    const html = renderToStaticMarkup(<TablaMetas avances={[activa()]} apagadas={[]} admin onEditar={() => {}} />)
    expect(html).toContain('todos los canales')
  })
})
