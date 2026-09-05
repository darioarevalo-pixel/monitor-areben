// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { TablaCeldas } from '@/components/meta-ads/zona/TablaCeldas'
import { veredictoDeCelda, type Celda } from '@/lib/meta-ads/rendimiento'
import type { Acciones } from '@/components/meta-ads/acciones/tipos'

/**
 * **EL GESTO: tocar cualquier lado de la fila la abre — y el botón de pausar, NO.**
 *
 * 🔴 Es lo que pidió Bruno textual el 5-sep-2026: *«me parece que la mejor idea sería que una pauta
 * se vea la información súper importante ahí. Y si tocás en cualquier lado de la fila, que abra la
 * información adicional importante para tomar decisiones»*. Antes abría un `▾` de doce píxeles
 * adentro de una celda.
 *
 * 🔑 **El caso que de verdad hay que fijar es el tercero**, y es el que se rompe al copiar mal el
 * patrón de fila clickeable: **apretar «Pausar» ⛔ NO puede además desplegar el detalle**. El
 * `stopPropagation` es una línea sola, ⛔ no falla ningún typecheck, y el día que se pierda nadie lo
 * nota hasta que un click accidental sobre un botón que escribe en Meta hace dos cosas.
 *
 * ⚠️ Va en jsdom y ⛔ no con `renderToStaticMarkup` porque lo que se prueba es un CLICK, ⛔ no un
 * markup. Es el mismo patrón que `meta-zona-cuenta-cable`.
 */

const ACCIONES = {
  puede: () => true,
  enCurso: null,
  onEstado: () => {},
  onPresupuesto: () => {},
  onNombre: () => {},
  onDuplicar: () => {},
  onCrear: () => {},
  onEscalar: () => {},
} as unknown as Acciones

function celda(): Celda {
  const base = {
    id: 'a1',
    nombre: 'GIRLHOOD FRIO - INTERESES 1',
    linea: 'bdi',
    campaignId: 'c1',
    cuentaId: '1',
    moneda: 'ARS',
    estado: 'ACTIVE',
    estadoReal: 'entregando',
    diario: 9000,
    spend: 60000,
    compras: 12,
    impresiones: 40000,
    clicks: 900,
    revenue: 100000,
    carritos: 30,
    checkouts: 12,
    lpv: 700,
    link_clicks: 800,
    diasConEmbudo: { carritos: 7, checkouts: 7, lpv: 7, link_clicks: 7 },
    ctr: 2.2,
    cpc: 40,
    cpm: 1500,
    roas: 2,
    dias: 7,
    diasConGasto: 7,
    desde: '2026-08-29',
    hasta: '2026-09-04',
    serie: [],
    desgaste: { firma: 'sano', motivo: '', ctrDelta: -2, cpmDelta: -1, ctrA: 2.3, ctrB: 2.2, cpmA: 1520, cpmB: 1500 },
    aprendizaje: { convSemana: 13, necesita: 50, faltan: 37, cruza: false, pide: 60000, cpa: 5000, reiniciadoEl: null },
    avisos: [],
  } as unknown as Celda
  return { ...base, costo: 5000, veredicto: veredictoDeCelda(base, { techo: 7000 }) }
}

let host: HTMLDivElement

function montar() {
  host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(
      <TablaCeldas
        celdas={[celda()]}
        moneda="ARS"
        acciones={ACCIONES}
        cuenta={null}
        dias={7}
        hallazgosDe={() => null}
        quitarHallazgo={() => {}}
      />,
    )
  })
}

const abierta = () => host.querySelector('tr[aria-expanded="true"]') != null
const tocar = (el: Element | null | undefined) => {
  expect(el, 'el elemento que se va a tocar tiene que existir').toBeTruthy()
  act(() => { el!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}
/** La celda por índice de columna: 0 cara · 1 pauta · 2 gasto · 3 compras · 4 costo · 5 qué hacer. */
const col = (i: number) => host.querySelectorAll('tbody tr')[0].querySelectorAll('td')[i]

beforeEach(() => {
  document.body.innerHTML = ''
  montar()
})

describe('tocar la fila la abre', () => {
  it('nace cerrada: sin hallazgo, ⛔ no hay nada que mostrar sin pedirlo', () => {
    expect(abierta()).toBe(false)
  })

  it('un clic en el NOMBRE la abre', () => {
    tocar(col(1))
    expect(abierta()).toBe(true)
  })

  it('🔑 un clic en la celda de GASTO también la abre — «cualquier lado de la fila»', () => {
    tocar(col(2))
    expect(abierta()).toBe(true)
  })

  it('y en la de COSTO, que es desde donde se hace la pregunta «¿por qué dice eso?»', () => {
    tocar(col(4))
    expect(abierta()).toBe(true)
  })

  it('volver a tocarla la cierra', () => {
    tocar(col(2))
    expect(abierta()).toBe(true)
    tocar(col(2))
    expect(abierta()).toBe(false)
  })

  it('🔴 un clic en un BOTÓN de la columna «Qué hacer» ⛔ NO la abre: el stopPropagation', () => {
    const boton = col(5).querySelector('button')
    tocar(boton)
    expect(abierta()).toBe(false)
  })

  it('al abrirla aparece el POR QUÉ entero, que es lo que se sacó de la fila', () => {
    tocar(col(1))
    expect(host.textContent).toContain('POR QUÉ')
    expect(host.textContent).toContain('contra un techo de')
    // Y los números de atrás, que hasta hoy se calculaban y ⛔ no se dibujaban en ningún lado.
    expect(host.textContent).toContain('LOS NÚMEROS DE ATRÁS')
    expect(host.textContent).toContain('13 de 50 compras/semana')
  })
})
