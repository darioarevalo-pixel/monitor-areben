import { describe, expect, it } from 'vitest'
import { dondeVaElPresupuesto, segunLosConjuntos } from '@/lib/meta-ads/copia'
import type { ConjuntoMeta, RespuestaConjuntos } from '@/lib/meta-ads/tipos'

/**
 * Dónde le escribe la plata «duplicar y ajustar».
 *
 * Estos casos existen por un defecto real: la primera versión leía el `sinPresupuesto` de la fila
 * —que es «no hay nada que tocar EN ESTE objeto», y en una campaña ABO vale `true`— como «no hay
 * nada que ajustar en la copia». Como **toda la pauta es ABO**, eso dejaba la mitad de la función
 * muerta en producción sin que fallara nada. Se vio abriendo el modal, no corriendo tests: por eso
 * la lógica se sacó del componente hasta acá.
 */

const conjunto = (o: Partial<ConjuntoMeta>): ConjuntoMeta => ({
  id: '120250683148120505',
  nombre: 'CDA - TEST AD - TRAFICO - BROAD',
  objetivo: 'LINK_CLICKS',
  estado: 'PAUSED',
  diarioCrudo: 180000,
  totalCrudo: 0,
  spend: 0,
  purchases: 0,
  ...o,
} as ConjuntoMeta)

const respuesta = (conjuntos: ConjuntoMeta[], cbo = false) => ({
  ok: true as const,
  dato: {
    dias: 30,
    cbo,
    campania: { id: '1', nombre: 'X', diarioCrudo: cbo ? 500000 : 0, totalCrudo: 0 },
    conjuntos,
    sinCampania: null,
  } as RespuestaConjuntos,
})

describe('con lo que la fila ya sabe', () => {
  it('🔴 una campaña ABO manda a MIRAR los conjuntos, no a «no hay nada que ajustar»', () => {
    // ESTE es el caso que se rompió. `sinPresupuesto` viene en `true` porque en la campaña no hay
    // diario que tocar, y eso es cierto — pero la plata de la copia va igual: al conjunto.
    expect(dondeVaElPresupuesto('campania', 0, true)).toEqual({ fase: 'mirando' })
    // Y también si nadie mandó la bandera: lo que decide es que no tiene diario propio.
    expect(dondeVaElPresupuesto('campania', 0, false)).toEqual({ fase: 'mirando' })
  })

  it('una campaña CON presupuesto propio (CBO) se resuelve sin preguntar nada', () => {
    const p = dondeVaElPresupuesto('campania', 500000, false)
    expect(p.fase).toBe('listo')
    if (p.fase !== 'listo') throw new Error('fase')
    expect(p.destino).toBe('copia')
    expect(p.baseCruda).toBe(500000)
  })

  it('un conjunto con diario propio va a la copia del conjunto, con su monto de hoy', () => {
    const p = dondeVaElPresupuesto('conjunto', 180000, false)
    expect(p.fase).toBe('listo')
    if (p.fase !== 'listo') throw new Error('fase')
    expect(p.destino).toBe('copia')
    expect(p.baseCruda).toBe(180000)
    expect(p.donde).toContain('conjunto')
  })

  it('un conjunto bajo CBO no ofrece nada, y dice que lo hereda de la campaña', () => {
    const p = dondeVaElPresupuesto('conjunto', 0, true)
    expect(p.fase).toBe('no-aplica')
    if (p.fase !== 'no-aplica') throw new Error('fase')
    expect(p.motivo).toContain('lo maneja su campaña')
  })

  it('un conjunto con presupuesto total tampoco, y el motivo es OTRO', () => {
    // Los dos son «no hay diario», pero uno se arregla en la campaña y el otro no se arregla: decir
    // lo mismo en los dos casos manda a buscar un botón que no existe.
    const p = dondeVaElPresupuesto('conjunto', 0, false)
    expect(p.fase).toBe('no-aplica')
    if (p.fase !== 'no-aplica') throw new Error('fase')
    expect(p.motivo).not.toContain('lo maneja su campaña')
  })
})

describe('una vez que se sabe qué conjuntos tiene', () => {
  it('🔑 con UN conjunto con diario, se ofrece y se dice a cuál se lo va a poner', () => {
    const p = segunLosConjuntos(respuesta([conjunto({ diarioCrudo: 180000 })]))
    expect(p.fase).toBe('listo')
    if (p.fase !== 'listo') throw new Error('fase')
    expect(p.destino).toBe('conjunto-unico')
    expect(p.baseCruda).toBe(180000)
    expect(p.donde).toContain('CDA - TEST AD - TRAFICO - BROAD')
  })

  it('🔴 con DOS o más no se ofrece: un número que se aplica a «alguno» no significa nada', () => {
    const p = segunLosConjuntos(respuesta([conjunto({}), conjunto({ id: '2', nombre: 'Otro' })]))
    expect(p.fase).toBe('no-aplica')
    if (p.fase !== 'no-aplica') throw new Error('fase')
    expect(p.motivo).toContain('2 conjuntos')
  })

  it('sin conjuntos, lo dice: es el caso de la campaña vacía con la que se prueba', () => {
    const p = segunLosConjuntos(respuesta([]))
    expect(p.fase).toBe('no-aplica')
    if (p.fase !== 'no-aplica') throw new Error('fase')
    expect(p.motivo).toContain('no tiene conjuntos')
  })

  it('un único conjunto SIN diario (presupuesto total) no se ofrece', () => {
    const p = segunLosConjuntos(respuesta([conjunto({ diarioCrudo: 0, totalCrudo: 900000 })]))
    expect(p.fase).toBe('no-aplica')
    if (p.fase !== 'no-aplica') throw new Error('fase')
    expect(p.motivo).toContain('no usa presupuesto diario')
  })

  it('si la campaña resultara CBO, manda a su propia fila y no a los conjuntos', () => {
    // Meta no deja tocar el presupuesto de un conjunto bajo CBO: decir «ajustalos uno por uno» sería
    // mandar a apretar un botón que el servidor contesta con 409.
    const p = segunLosConjuntos(respuesta([conjunto({ diarioCrudo: 0 }), conjunto({ id: '2', diarioCrudo: 0 })], true))
    expect(p.fase).toBe('no-aplica')
    if (p.fase !== 'no-aplica') throw new Error('fase')
    expect(p.motivo).toContain('a nivel campaña')
  })

  it('si no se pudieron leer, NO se inventa: se dice que la copia sale igual que el original', () => {
    const p = segunLosConjuntos({ ok: false, motivo: 'HTTP 502' })
    expect(p.fase).toBe('no-aplica')
    if (p.fase !== 'no-aplica') throw new Error('fase')
    expect(p.motivo).toContain('HTTP 502')
  })
})
