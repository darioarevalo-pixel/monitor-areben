import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  agregarNota,
  borrarNota,
  eliminar,
  filtrarLeads,
  hableHoy,
  hoyISO,
  leadEstadoSeg,
  leadInstaHref,
  leadNuevo,
  setCadencia,
  setCampo,
  setEstado,
  setProximoManual,
  type Lead,
  type MapaLeads,
} from '@/lib/crm/leads'

const RAIZ = join(import.meta.dirname, '..')
const AHORA = new Date('2026-07-17T12:00:00.000Z')

/** Los 11 leads reales del dump del KV, si está bajado. */
function leadsReales(): MapaLeads | null {
  const base = join(RAIZ, 'tests', 'fixtures', 'kv')
  if (!existsSync(base)) return null
  const dirs = readdirSync(base).filter((d) => d.startsWith('bdi-')).sort()
  if (!dirs.length) return null
  try {
    return JSON.parse(readFileSync(join(base, dirs[dirs.length - 1], 'crmleads.json'), 'utf8'))
  } catch {
    return null
  }
}

const lead = (p: Partial<Lead> = {}): Lead => ({ ...leadNuevo('l1', AHORA), ...p })

describe('leadEstadoSeg', () => {
  it('sin cadencia ni fecha manual → no hay seguimiento', () => {
    expect(leadEstadoSeg(lead(), AHORA)).toEqual({ proximo: null, estado: 'none', dias: null })
  })

  it('con cadencia pero sin primer contacto → pendiente', () => {
    expect(leadEstadoSeg(lead({ cadencia: 'semanal' }), AHORA).estado).toBe('pendiente')
  })

  it('la cadencia calcula el próximo desde el último contacto', () => {
    // semanal = 7 días (CADENCIA_DIAS)
    const s = leadEstadoSeg(lead({ cadencia: 'semanal', ultimo_contacto: '2026-07-14' }), AHORA)
    expect(s.proximo).toBe('2026-07-21')
    expect(s.estado).toBe('semana')
  })

  it('la fecha manual le gana a la cadencia', () => {
    const s = leadEstadoSeg(lead({ cadencia: 'semanal', ultimo_contacto: '2026-07-14', proximo_manual: '2026-08-30' }), AHORA)
    expect(s.proximo).toBe('2026-08-30')
    expect(s.estado).toBe('aldia')
  })

  it('una cadencia desconocida cae a 30 días', () => {
    expect(leadEstadoSeg(lead({ cadencia: 'inventada', ultimo_contacto: '2026-07-01' }), AHORA).proximo).toBe('2026-07-31')
  })

  it('los umbrales: hoy o antes → vencido, ≤7 → semana, más → al día', () => {
    const e = (proximo_manual: string) => leadEstadoSeg(lead({ proximo_manual }), AHORA).estado
    expect(e('2026-07-16')).toBe('vencido')
    expect(e('2026-07-17')).toBe('vencido') // dias = 0
    expect(e('2026-07-24')).toBe('semana') // dias = 7
    expect(e('2026-07-25')).toBe('aldia') // dias = 8
  })
})

describe('filtrarLeads', () => {
  const base: MapaLeads = {
    a: lead({ id: 'a', nombre: 'Zulema', estado: 'activo' }),
    b: lead({ id: 'b', nombre: 'Ana', estado: 'activo', proximo_manual: '2026-07-01' }), // vencido
    c: lead({ id: 'c', nombre: 'Bruno', estado: 'comprado' }),
    d: lead({ id: 'd', nombre: 'Ñandú', estado: 'activo' }),
  }

  it('por defecto muestra solo los activos', () => {
    // b primero por vencido; después por nombre en castellano: Ñandú antes que Zulema.
    expect(filtrarLeads(base, { q: '', verArchivados: false, today: AHORA }).map((l) => l.id)).toEqual(['b', 'd', 'a'])
  })

  it('"ver archivados" muestra los que NO están activos', () => {
    expect(filtrarLeads(base, { q: '', verArchivados: true, today: AHORA }).map((l) => l.id)).toEqual(['c'])
  })

  it('los urgentes van primero, después por nombre', () => {
    // b está vencido → primero. Después Zulema y Ñandú por orden castellano.
    const r = filtrarLeads(base, { q: '', verArchivados: false, today: AHORA })
    expect(r[0].id).toBe('b')
    expect(r.map((l) => l.nombre)).toEqual(['Ana', 'Ñandú', 'Zulema'])
  })

  it('ordena la ñ como el castellano (sin el locale, iría al final)', () => {
    const soloNombres: MapaLeads = {
      z: lead({ id: 'z', nombre: 'Zulema' }),
      n: lead({ id: 'n', nombre: 'Ñandú' }),
    }
    expect(filtrarLeads(soloNombres, { q: '', verArchivados: false, today: AHORA }).map((l) => l.nombre)).toEqual(['Ñandú', 'Zulema'])
  })

  it('busca por nombre, teléfono e instagram', () => {
    const m: MapaLeads = { a: lead({ id: 'a', nombre: 'Ana', telefono: '2231234', instagram: '@tienda' }) }
    for (const q of ['ana', '2231', 'tienda']) {
      expect(filtrarLeads(m, { q, verArchivados: false, today: AHORA })).toHaveLength(1)
    }
    expect(filtrarLeads(m, { q: 'nada', verArchivados: false, today: AHORA })).toHaveLength(0)
  })
})

describe('leadInstaHref', () => {
  it.each([
    ['@tienda', 'https://instagram.com/tienda'],
    ['tienda', 'https://instagram.com/tienda'],
    ['https://instagram.com/tienda', 'https://instagram.com/tienda'],
    ['', ''],
  ])('%s → %s', (v, esperado) => expect(leadInstaHref(v)).toBe(esperado))
})

describe('mutaciones', () => {
  const m: MapaLeads = { a: lead({ id: 'a', nombre: 'Ana' }) }

  it('no mutan el mapa original (React necesita otra referencia)', () => {
    const antes = JSON.stringify(m)
    setCampo(m, 'a', 'nombre', 'x')
    setCadencia(m, 'a', 'semanal')
    hableHoy(m, 'a', AHORA)
    agregarNota(m, 'a', 'hola', AHORA)
    setEstado(m, 'a', 'comprado')
    eliminar(m, 'a')
    expect(JSON.stringify(m)).toBe(antes)
  })

  it('"hablé hoy" limpia la fecha manual, si no la vieja seguiría mandando', () => {
    const con = { a: lead({ id: 'a', proximo_manual: '2026-12-01', cadencia: 'semanal' }) }
    const r = hableHoy(con, 'a', AHORA)
    expect(r.a.ultimo_contacto).toBe('2026-07-17')
    expect(r.a.proximo_manual).toBeNull()
  })

  it('la nota nueva va primera y se trimea; una vacía no se agrega', () => {
    const r = agregarNota(m, 'a', '  primera  ', AHORA)
    expect(r.a.notas).toEqual([{ fecha: '2026-07-17', texto: 'primera' }])
    const r2 = agregarNota(r, 'a', 'segunda', AHORA)
    expect(r2.a.notas.map((n) => n.texto)).toEqual(['segunda', 'primera'])
    expect(agregarNota(r2, 'a', '   ', AHORA)).toBe(r2) // sin cambios
  })

  it('borrarNota borra por índice posicional (las notas no tienen id)', () => {
    let r = agregarNota(m, 'a', 'uno', AHORA)
    r = agregarNota(r, 'a', 'dos', AHORA)
    expect(borrarNota(r, 'a', 0).a.notas.map((n) => n.texto)).toEqual(['uno'])
  })

  it('setProximoManual con string vacío deja null, no ""', () => {
    expect(setProximoManual(m, 'a', '').a.proximo_manual).toBeNull()
  })

  it('una id que no existe no crea nada', () => {
    expect(setCampo(m, 'inexistente', 'nombre', 'x')).toBe(m)
  })
})

describe('los 11 leads reales del KV', () => {
  const reales = leadsReales()

  it.skipIf(!reales)('todos tienen la forma que el port espera', () => {
    const l = reales as MapaLeads
    expect(Object.keys(l).length).toBeGreaterThan(0)
    for (const [id, x] of Object.entries(l)) {
      expect(typeof x.nombre === 'string' || x.nombre === undefined, `lead ${id}`).toBe(true)
      expect(['activo', 'comprado', 'descartado', undefined]).toContain(x.estado)
      expect(Array.isArray(x.notas) || x.notas === undefined, `notas de ${id}`).toBe(true)
    }
  })

  it.skipIf(!reales)('filtrarLeads no rompe con los datos reales', () => {
    const r = filtrarLeads(reales as MapaLeads, { q: '', verArchivados: false, today: AHORA })
    expect(Array.isArray(r)).toBe(true)
    r.forEach((l) => expect(['none', 'pendiente', 'vencido', 'semana', 'aldia']).toContain(l._seg.estado))
  })
})

describe('hoyISO', () => {
  it('usa la fecha local, no la UTC (por eso no pasa por toISOString)', () => {
    // 2026-07-17T02:00Z en Argentina (UTC-3) es todavía el 16.
    expect(hoyISO(new Date(2026, 6, 17, 0, 30))).toBe('2026-07-17')
  })
})
