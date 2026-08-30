import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { DeDondeSale } from '@/components/meta-ads/campanias/DeDondeSale'
import type { RespuestaEtapas } from '@/lib/meta-ads/tipos'

/**
 * **El cartel que dice que el censo salió de la foto y ⛔ no de Meta.**
 *
 * 🔴 Es la mitad del respaldo que hace que el respaldo no sea peor que el 500 que reemplaza. Desde
 * el 30-ago-2026 el Embudo contesta con el token vencido armando el censo desde la foto diaria, y
 * ese censo ⛔ **no es equivalente**: le faltan las campañas que nunca entregaron y las anteriores
 * al 8-ago (cuando `objetivo` empezó a guardarse). ⇒ *«la segunda etapa en cero»* se lee como un
 * hueco si viene del censo entero y como *«esa campaña ese mes no entregó»* si viene del respaldo.
 * **Un respaldo servido callado, con cara de censo entero, afirma lo que no sabe.**
 *
 * 🔑 **Lo que se afirma acá es sobre todo cuándo ⛔ NO aparece**: el camino sano es el 99% de los
 * días, y un cartel pegado ahí arriba es el que alguien saca. La condición es una sola —
 * `fuente !== 'foto'`— y es la que se rompe sola el día que a esa clave le cambien el nombre en el
 * handler: el cartel desaparecería **sin un solo rojo**, que es el modo en que este defecto vuelve.
 */

const base: RespuestaEtapas = {
  ok: true,
  dias: 30,
  fuente: 'foto',
  completo: false,
  motivo: 'Meta Ads no está configurado (falta o venció el token).',
  desde: '2026-08-01',
  hasta: '2026-08-29',
  sinObjetivo: 0,
  cuentas: [],
  lineas: { bdi: [], zattia: [], stunned: [] },
  sinAsignar: [],
} as unknown as RespuestaEtapas

const html = (d: Partial<RespuestaEtapas>) =>
  renderToStaticMarkup(<DeDondeSale d={{ ...base, ...d } as RespuestaEtapas} />)

describe('el cartel del respaldo', () => {
  it('con el censo de Meta ⛔ no dibuja NADA: el camino sano no lleva cartel', () => {
    expect(html({ fuente: 'meta', completo: true, motivo: undefined })).toBe('')
  })

  it('con el censo de la foto lo dice, y dice POR QUÉ', () => {
    const h = html({})
    expect(h).toContain('sale de la foto diaria')
    expect(h).toContain('venció el token')
  })

  it('lleva la VENTANA, que es lo que distingue un hueco de una campaña que no entregó', () => {
    const h = html({ desde: '2026-07-28', hasta: '2026-08-26' })
    expect(h).toContain('2026-07-28')
    expect(h).toContain('2026-08-26')
    expect(h).toContain('días cerrados')
  })

  it('avisa que le faltan las que nunca entregaron: es de dónde sale un hueco falso', () => {
    expect(html({})).toContain('nunca entregaron')
  })

  it('cuenta las que quedaron afuera por no tener objetivo guardado, y en singular', () => {
    expect(html({ sinObjetivo: 1 })).toContain('una campaña quedó afuera')
    expect(html({ sinObjetivo: 4 })).toContain('4 campañas quedaron afuera')
    // 🔴 Con cero ⛔ no se dice nada: «0 campañas quedaron afuera» es ruido que empuja el renglón
    // que sí importa fuera de la vista.
    expect(html({ sinObjetivo: 0 })).not.toContain('quedaron afuera')
  })
})

/**
 * 🔑 **El invariante que estaba sólo ESCRITO en el docblock del cartel**: *«lo comparten el Embudo
 * y Campañas: las dos leen el MISMO censo, así que una que lo dijera y la otra no dejaría a la
 * mitad de la sección afirmando de más»*. 📌 [[feedback_areben_invariante_escrito_no_frena]]: una
 * regla escrita ⛔ no frena nada — la mitad muda se ve igual de correcta que la otra.
 *
 * ⚠️ **Lo que este test ⛔ NO puede ver**, y por eso está dicho acá y no se descubre el día que
 * falle: que el cartel esté en una rama alcanzable. Ve que la pantalla lo usa, ⛔ no que se dibuje.
 * La otra mitad —que se dibuje— la camina Bruno.
 */
describe('las dos pantallas que leen el censo lo dicen', () => {
  for (const pantalla of ['components/meta-ads/Embudo.tsx', 'components/meta-ads/campanias/Campanias.tsx']) {
    it(`${pantalla} usa el cartel`, () => {
      expect(readFileSync(pantalla, 'utf8')).toContain('<DeDondeSale')
    })
  }
})
