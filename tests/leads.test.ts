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
  leadsDelDia,
  leadsPorTelefono,
  escribiHoyLead,
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

describe('leadsDelDia · los leads entran en la lista del día', () => {
  // El mismo día que usa el resto del archivo, para no arrastrar dos relojes.
  const HOY = '2026-07-17'
  const MANANA = '2026-07-18'
  const opts = { hoy: HOY, manana: MANANA, today: AHORA }

  const conFecha = (id: string, proximo: string | null, extra: Partial<Lead> = {}): Lead =>
    lead({ id, nombre: id, cadencia: 'semanal', proximo_manual: proximo, ultimo_contacto: '2026-07-01', ...extra })

  const atrasado = conFecha('atrasado', '2026-07-10')
  const deHoy = conFecha('deHoy', HOY)
  const deManana = conFecha('deManana', MANANA)
  const deLaSemana = conFecha('deLaSemana', '2026-07-22')
  const lejano = conFecha('lejano', '2026-09-01')
  // Cadencia puesta y ningún contacto todavía: la misma deuda que un vencido, sin fecha.
  const sinPrimerContacto = lead({ id: 'sinPrimer', nombre: 'sinPrimer', cadencia: 'semanal', ultimo_contacto: null, proximo_manual: null })

  const mapa: MapaLeads = Object.fromEntries(
    [atrasado, deHoy, deManana, deLaSemana, lejano, sinPrimerContacto].map((l) => [l.id, l]),
  )
  const ids = (seg: string) => leadsDelDia(mapa, { seg, ...opts }).map((l) => l.id)

  it('"Hoy" trae exactamente los de hoy', () => {
    expect(ids('hoy')).toEqual(['deHoy'])
  })

  it('"Mañana" trae los del próximo día hábil que le pasa la pantalla', () => {
    expect(ids('manana')).toEqual(['deManana'])
  })

  it('"Atrasados" son los vencidos y el que nunca se contactó; los de hoy todavía no', () => {
    expect(ids('atrasados').sort()).toEqual(['atrasado', 'sinPrimer'])
  })

  it('"Esta semana" suma lo atrasado y lo de los próximos 7 días, y deja afuera lo lejano', () => {
    const s = ids('semana')
    expect(s).toContain('atrasado')
    expect(s).toContain('deHoy')
    expect(s).toContain('deLaSemana')
    expect(s).not.toContain('lejano')
  })

  it('el lead SIN AGENDAR entra en Atrasados: es el que se cargó y nunca se le puso fecha', () => {
    // 25 de los 28 leads activos estaban así el 23-ago-2026. Si `none` quedara afuera, el
    // bloque mostraría 3 leads y el problema seguiría intacto.
    const suelto = lead({ id: 'suelto', nombre: 'suelto', cadencia: '', ultimo_contacto: null, proximo_manual: null })
    const conSuelto: MapaLeads = { ...mapa, suelto }
    expect(leadsDelDia(conSuelto, { seg: 'atrasados', ...opts }).map((l) => l.id)).toContain('suelto')
    expect(leadsDelDia(conSuelto, { seg: 'semana', ...opts }).map((l) => l.id)).toContain('suelto')
    // Pero no se cuela en un día concreto: no tiene fecha que pueda coincidir.
    expect(leadsDelDia(conSuelto, { seg: 'hoy', ...opts }).map((l) => l.id)).not.toContain('suelto')
  })

  it('el sin agendar va AL FINAL: primero los que tienen fecha vencida', () => {
    const suelto = lead({ id: 'suelto', nombre: 'aaa', cadencia: '', ultimo_contacto: null, proximo_manual: null })
    const r = leadsDelDia({ ...mapa, suelto }, { seg: 'semana', ...opts })
    expect(r[r.length - 1].id).toBe('suelto')
  })

  it('un filtro que no es de día no trae nada: el bloque sólo existe en la lista del día', () => {
    expect(leadsDelDia(mapa, { seg: 'todos', ...opts })).toEqual([])
    expect(leadsDelDia(mapa, { seg: 'frios', ...opts })).toEqual([])
  })

  it('los que ya compraron y los descartados no aparecen: sólo se trabaja el activo', () => {
    const conArchivados: MapaLeads = {
      ...mapa,
      compro: conFecha('compro', '2026-07-10', { estado: 'comprado' }),
      fuera: conFecha('fuera', '2026-07-10', { estado: 'descartado' }),
    }
    const r = leadsDelDia(conArchivados, { seg: 'atrasados', ...opts }).map((l) => l.id)
    expect(r).not.toContain('compro')
    expect(r).not.toContain('fuera')
  })

  it('sin `hoy` esos filtros no traen cualquier cosa', () => {
    expect(leadsDelDia(mapa, { seg: 'hoy', today: AHORA })).toEqual([])
    expect(leadsDelDia(mapa, { seg: 'manana', today: AHORA })).toEqual([])
  })

  it('el más urgente primero: es el orden en que se los va a llamar', () => {
    const orden = leadsDelDia(mapa, { seg: 'semana', ...opts }).map((l) => l._seg.estado)
    expect(orden[0]).toBe('vencido')
    expect(orden[orden.length - 1]).toBe('semana')
  })
})

/**
 * Reconocer al prospecto cuando se vuelve a su chat.
 *
 * 🔴 El panel no miraba acá: buscaba en el padrón, después en `crm:tel`, y si no aparecía daba el
 * número por nuevo **y ofrecía cargarlo otra vez**. Medido sobre los 40 leads reales el
 * 24-ago-2026: **2 números duplicados** hechos exactamente así.
 */
describe('leadsPorTelefono', () => {
  const leads: MapaLeads = {
    a: { ...leadNuevo('a'), nombre: 'Maximo', telefono: '3834270554' },
    b: { ...leadNuevo('b'), nombre: 'Ana', telefono: '+54 9 11 5555-4444' },
    c: { ...leadNuevo('c'), nombre: 'Sin número', telefono: '' },
  }

  it('encuentra al prospecto sin importar cómo se cargó el número', () => {
    expect(leadsPorTelefono(leads, '5493834270554').leads.map((l) => l.id)).toEqual(['a'])
    expect(leadsPorTelefono(leads, '5491155554444').leads.map((l) => l.id)).toEqual(['b'])
  })

  it('un número que no está no inventa ningún prospecto', () => {
    expect(leadsPorTelefono(leads, '5491199998888').leads).toEqual([])
    expect(leadsPorTelefono(leads, '').leads).toEqual([])
  })

  it('🔴 el caso real: el mismo número en dos prospectos devuelve LOS DOS', () => {
    // "Maximo" y "Maximo Valdiviezo" existen así en el KV. Elegir uno solo sería anotar el
    // contacto en la ficha del otro, en silencio.
    const dobles: MapaLeads = { ...leads, d: { ...leadNuevo('d'), nombre: 'Maximo Valdiviezo', telefono: '0383 4270554' } }
    expect(leadsPorTelefono(dobles, '5493834270554').leads.map((l) => l.nombre).sort()).toEqual(['Maximo', 'Maximo Valdiviezo'])
  })

  it('un prospecto sin teléfono no se cruza con nadie', () => {
    expect(leadsPorTelefono({ c: leads.c }, '5493834270554').leads).toEqual([])
  })
})

describe('escribiHoyLead', () => {
  const hoy = new Date(2026, 7, 24)
  const base: MapaLeads = { a: { ...leadNuevo('a', hoy), nombre: 'Ana', cadencia: 'mensual' } }

  it('marca el contacto de hoy Y fija la fecha, de un saque', () => {
    const r = escribiHoyLead(base, 'a', 7, hoy)
    expect(r.a.ultimo_contacto).toBe('2026-08-24')
    expect(r.a.proximo_manual).toBe('2026-08-31')
  })

  it('🔑 la fecha se fija DESPUÉS de limpiar: si no, `hableHoy` se la lleva puesta', () => {
    const conFecha: MapaLeads = { a: { ...base.a, proximo_manual: '2026-12-01' } }
    expect(escribiHoyLead(conFecha, 'a', 3, hoy).a.proximo_manual).toBe('2026-08-27')
  })

  it('no muta el mapa que recibió ni toca a los demás', () => {
    const otros: MapaLeads = { ...base, b: { ...leadNuevo('b', hoy), nombre: 'Beto' } }
    const r = escribiHoyLead(otros, 'a', 3, hoy)
    expect(otros.a.proximo_manual).toBe(null)
    expect(r.b).toEqual(otros.b)
  })
})
