import { describe, it, expect } from 'vitest'
import {
  agregarNota,
  borrarNota,
  escribiHoy,
  hoyISO,
  setDescartado,
  setMayorista,
  setPagina,
  setProximoManual,
  setTemperatura,
} from '@/lib/crm/seguimiento'
import { diaHabil, PLAZOS_DIAS } from '@/lib/crm/core'
import type { MapaSeguimiento } from '@/lib/crm/tipos'

/**
 * Las escrituras del CRM son las que tocan el dato sin backup (305 clientes, 39
 * notas). El legacy está pegado al DOM (crmSegGuardar/renderCRM/modal), así que
 * no hay paridad ejecutable como en el ETL; lo que se prueba acá es la invariante
 * que hace segura la escritura: **cada op cambia EXACTAMENTE un cliente y no muta
 * el mapa de entrada** — el mismo "diff = solo el cliente tocado" que se verifica
 * contra el dump en prod.
 */

const HOY = new Date('2026-07-17T12:00:00')

/** Las claves de un mapa cuyo valor serializado cambió respecto de otro. */
function diff(antes: MapaSeguimiento, despues: MapaSeguimiento): string[] {
  const keys = new Set([...Object.keys(antes), ...Object.keys(despues)])
  return [...keys].filter((k) => JSON.stringify(antes[k]) !== JSON.stringify(despues[k]))
}

describe('escrituras de seguimiento: tocan un solo cliente, sin mutar la entrada', () => {
  const base: MapaSeguimiento = {
    '1': { es_mayorista: true, cadencia: 'mensual', notas: [{ fecha: '2026-07-01', texto: 'vieja' }] },
    '2': { descartado: false },
  }

  const ops: [string, (m: MapaSeguimiento) => MapaSeguimiento][] = [
    ['setMayorista', (m) => setMayorista(m, 2, true)],
    ['setPagina', (m) => setPagina(m, 1, '  @nueva  ')],
    ['setDescartado', (m) => setDescartado(m, 2, true)],
    ['escribiHoy', (m) => escribiHoy(m, 1, 3, HOY)],
    ['setProximoManual', (m) => setProximoManual(m, 1, '2026-08-01')],
    ['agregarNota', (m) => agregarNota(m, 1, 'nueva nota', '2026-07-17')],
    ['borrarNota', (m) => borrarNota(m, 1, 0)],
    ['setTemperatura', (m) => setTemperatura(m, 1, 'frio')],
  ]

  it.each(ops)('%s cambia un solo cliente y no muta la entrada', (_, op) => {
    const copia = JSON.parse(JSON.stringify(base))
    const out = op(base)
    expect(base).toEqual(copia) // no mutó la entrada
    expect(diff(base, out).length).toBe(1) // exactamente un cliente tocado
  })

  it('un cliente nuevo arranca con los defaults completos', () => {
    const out = setMayorista({}, 99, true)
    expect(out['99']).toEqual({ cadencia: '', ultimo_contacto: null, proximo_manual: null, notas: [], es_mayorista: true })
  })

  it('un cliente existente conserva sus otros campos', () => {
    const out = setPagina(base, 1, '@x')
    expect(out['1'].es_mayorista).toBe(true)
    expect(out['1'].cadencia).toBe('mensual')
    expect(out['1'].pagina).toBe('@x')
  })
})

describe('fechas de contacto', () => {
  it('escribiHoy fija el próximo a hoy + días', () => {
    const out = escribiHoy({}, 1, 3, HOY)
    expect(out['1'].ultimo_contacto).toBe('2026-07-17')
    expect(out['1'].proximo_manual).toBe('2026-07-20')
  })
  it('hoyISO usa el día local', () => {
    expect(hoyISO(HOY)).toBe('2026-07-17')
  })
})

describe('notas', () => {
  it('agregarNota inserta y reordena por fecha desc (nueva del mismo día arriba)', () => {
    let m: MapaSeguimiento = { '1': { notas: [{ fecha: '2026-07-10', texto: 'a' }] } }
    m = agregarNota(m, 1, 'b', '2026-07-15')
    m = agregarNota(m, 1, 'c', '2026-07-15')
    expect(m['1'].notas!.map((n) => n.texto)).toEqual(['c', 'b', 'a'])
  })
  it('borrarNota saca por índice', () => {
    const m: MapaSeguimiento = { '1': { notas: [{ fecha: '2026-07-15', texto: 'a' }, { fecha: '2026-07-14', texto: 'b' }] } }
    expect(borrarNota(m, 1, 0)['1'].notas).toEqual([{ fecha: '2026-07-14', texto: 'b' }])
  })
})

// ── Parseo de teléfonos ───────────────────────────────────────────────────────

/**
 * Ningún próximo contacto puede caer en fin de semana.
 *
 * Lo pidió Bruno el 24-ago-2026: la venta mayorista es de lunes a viernes, así que un recordatorio
 * para el sábado se pierde — el lunes ya está viejo y se mezcla con los atrasados. La regla es del
 * DATO y no del botón: vale para los plazos calculados y también para la fecha elegida a mano.
 */
describe('el próximo contacto nunca cae en fin de semana', () => {
  // 2026-08-24 es LUNES. +5 = sábado 29, +6 = domingo 30, +7 = lunes 31.
  const LUNES = new Date(2026, 7, 24)

  it('sábado y domingo se corren al lunes; el resto queda como está', () => {
    expect(diaHabil('2026-08-29')).toBe('2026-08-31') // sábado → lunes
    expect(diaHabil('2026-08-30')).toBe('2026-08-31') // domingo → lunes
    expect(diaHabil('2026-08-28')).toBe('2026-08-28') // viernes
    expect(diaHabil('2026-08-31')).toBe('2026-08-31') // lunes
  })

  it('🔑 corre para ADELANTE: pediste 15 días, no 13', () => {
    // Al revés estaría contactando ANTES de lo pedido, que es peor que un poco después.
    expect(diaHabil('2026-08-29') > '2026-08-29').toBe(true)
  })

  it('"le escribí hoy, en 5 días" cae sábado y se guarda el lunes', () => {
    const r = escribiHoy({}, 1, 5, LUNES)
    expect(r['1'].proximo_manual).toBe('2026-08-31')
    expect(r['1'].ultimo_contacto).toBe('2026-08-24')
  })

  it('un plazo que NO cae en fin de semana no se toca', () => {
    expect(escribiHoy({}, 1, 3, LUNES)['1'].proximo_manual).toBe('2026-08-27') // jueves
  })

  it('la fecha elegida a mano también: la regla es del dato, no del botón', () => {
    expect(setProximoManual({}, 1, '2026-08-30')['1'].proximo_manual).toBe('2026-08-31')
  })

  it('vacío sigue siendo "sin fecha", no un lunes', () => {
    expect(setProximoManual({}, 1, '')['1'].proximo_manual).toBe(null)
  })

  it('los siete plazos son los mismos en todas las pantallas', () => {
    // Con dos listas distintas, el mismo cliente se agenda distinto según desde dónde se lo toque.
    expect([...PLAZOS_DIAS]).toEqual([1, 2, 3, 7, 15, 21, 30])
  })
})
