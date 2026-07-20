import { describe, it, expect } from 'vitest'
import {
  agregarNota,
  aplicarSugerencias,
  borrarNota,
  escribiHoy,
  hableHoy,
  hoyISO,
  parsearTelefonos,
  planSugerirCadencias,
  setCadencia,
  setDescartado,
  setMayorista,
  setPagina,
  setProximoManual,
} from '@/lib/crm/seguimiento'
import { normalizeArgPhone } from '@/lib/crm/core'
import type { ClienteCRM, MapaSeguimiento } from '@/lib/crm/tipos'

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
    ['setCadencia', (m) => setCadencia(m, 1, 'semanal')],
    ['setMayorista', (m) => setMayorista(m, 2, true)],
    ['setPagina', (m) => setPagina(m, 1, '  @nueva  ')],
    ['setDescartado', (m) => setDescartado(m, 2, true)],
    ['hableHoy', (m) => hableHoy(m, 1, HOY)],
    ['escribiHoy', (m) => escribiHoy(m, 1, 3, HOY)],
    ['setProximoManual', (m) => setProximoManual(m, 1, '2026-08-01')],
    ['agregarNota', (m) => agregarNota(m, 1, 'nueva nota', '2026-07-17')],
    ['borrarNota', (m) => borrarNota(m, 1, 0)],
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
  it('hableHoy fija último a hoy y limpia el próximo manual', () => {
    const out = hableHoy({ '1': { proximo_manual: '2026-09-01' } }, 1, HOY)
    expect(out['1'].ultimo_contacto).toBe('2026-07-17')
    expect(out['1'].proximo_manual).toBe(null)
  })
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

// ── Sugerir cadencias ─────────────────────────────────────────────────────────

function cli(over: Partial<ClienteCRM>): ClienteCRM {
  return {
    id: 0, name: '', email: '', phone: '', city: '', province: '',
    first_sale: null, last_sale: null, dias_ultimo: 5, dias_primero: 200,
    total_sales: 5, total_amount: 0, avg_ticket: 0, ventas: [],
    cadencia: '', ultimo_contacto: null, proximo_contacto: null, seg_estado: 'none', dias_proximo: null, notas: [],
    en_difusion: false,
    ...over,
  }
}

describe('planSugerirCadencias', () => {
  it('top por monto → semanal, activos recurrentes → mensual, respeta lo ya asignado', () => {
    // 20 clientes de monto alto (llenan el top-20 → semanal), dormidos para que
    // NO califiquen además como activos; + 1 activo de monto bajo (→ mensual);
    // + 1 dormido de monto bajo (→ nada).
    const top20 = Array.from({ length: 20 }, (_, i) =>
      cli({ id: i + 1, total_amount: 1_000_000 - i * 1000, total_sales: 1, dias_ultimo: 200 }),
    )
    const activoBajo = cli({ id: 21, total_amount: 100, total_sales: 4, dias_ultimo: 10 })
    const dormidoBajo = cli({ id: 22, total_amount: 50, total_sales: 1, dias_ultimo: 200 })
    const agregado = [...top20, activoBajo, dormidoBajo]

    const crmSeg: MapaSeguimiento = { '2': { cadencia: 'quincenal' } } // uno del top ya tiene → se omite
    const { plan, omitidos, nSem, nMen } = planSugerirCadencias(agregado, crmSeg)

    expect(omitidos).toBe(1)
    expect(plan.find((p) => p.id === 1)).toEqual({ id: 1, cad: 'semanal' })
    expect(plan.find((p) => p.id === 2)).toBeUndefined() // omitido (ya tenía cadencia)
    expect(plan.find((p) => p.id === 21)).toEqual({ id: 21, cad: 'mensual' })
    expect(plan.find((p) => p.id === 22)).toBeUndefined()
    expect(nSem).toBe(19) // 20 del top menos el omitido
    expect(nMen).toBe(1)
  })

  it('aplicarSugerencias escribe las cadencias del plan', () => {
    const out = aplicarSugerencias({}, [{ id: 1, cad: 'semanal' }, { id: 3, cad: 'mensual' }])
    expect(out['1'].cadencia).toBe('semanal')
    expect(out['3'].cadencia).toBe('mensual')
  })
})

// ── Parseo de teléfonos ───────────────────────────────────────────────────────

describe('parsearTelefonos', () => {
  const idsCRM = new Set(['100', '200'])

  it('vincula por id_interno/celular, solo clientes del CRM, y normaliza', () => {
    const aoa: unknown[][] = [
      ['id_interno', 'celular', 'otra'],
      ['100', '11 2345-6789', 'x'],
      ['200', '', 'y'], // sin teléfono → no cuenta
      ['999', '11 1111-1111', 'z'], // no está en el CRM → se ignora
    ]
    const res = parsearTelefonos(aoa, idsCRM, normalizeArgPhone)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.vinculados).toBe(1)
      expect(res.map['100']).toBe('11 2345-6789')
      expect(res.map['999']).toBeUndefined()
    }
  })

  it('cae al header `telefono` si no hay `celular`, y a `id` si no hay `id_interno`', () => {
    const aoa: unknown[][] = [['id', 'telefono'], ['200', '11 8765-4321']]
    const res = parsearTelefonos(aoa, idsCRM, normalizeArgPhone)
    expect(res.ok && res.map['200']).toBe('11 8765-4321')
  })

  it('falla claro si faltan las columnas o no hay matches', () => {
    expect(parsearTelefonos([['nombre', 'mail']], idsCRM, normalizeArgPhone).ok).toBe(false)
    expect(parsearTelefonos([['id_interno', 'celular'], ['999', '11 1111-1111']], idsCRM, normalizeArgPhone).ok).toBe(false)
  })
})
