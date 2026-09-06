import { describe, it, expect } from 'vitest'
import {
  DISPARADORES,
  DISPARADOR_AYUDA,
  DISPARADOR_LABEL,
  disparadorDeItem,
  disparadorPorPuerta,
  disparadoresDe,
  esDisparador,
  tieneDisparador,
} from '@/lib/solicitudes/disparador'
import { MOTIVOS, motivosDe, presetPorMotivo, PRESET_FOTOS, PRESET_INTERNAS } from '@/components/solicitudes/preset'
import { draftVacio, procesarDraft, type Draft } from '@/lib/sesionfotos/draft'
import { filaHistorial, historialVisible } from '@/lib/sesionfotos/core'
import type { Solicitud } from '@/lib/sesionfotos/tipos'

const meta = { id: 's1', fecha: '2026-08-24', creado: 1, creadoPor: 'Ana' }

/** Un draft mínimo con una variante tildada, para que `procesarDraft` no devuelva null. */
const draftCon = (over: Partial<Draft> = {}): Draft => ({
  desc: 'Sesión',
  prods: [{ pid: '1', name: 'Remera', cat: '', variantes: [{ vid: '1_10', sid: '10', size: 'S', sku: 'R-S', local: 0, deposito: 5, sel: true, qty: 1 }] }],
  pendientes: [],
  manuales: [],
  ...over,
})

const sol = (over: Partial<Solicitud> = {}): Solicitud => ({
  id: 'a', fecha: '2026-08-24', creado: 1, creadoPor: 'Ana', descripcion: '', estado: 'pendiente', items: [], ...over,
})

const item = (vid: string, over: Record<string, unknown> = {}) =>
  ({ vid, pid: '1', sid: '10', nombre: 'Remera', variante: 'S', sku: 'R-S', qty: 1, origen: 'deposito' as const, ...over })

/**
 * 🔴 EL TEST QUE MÁS IMPORTA DE TODO EL ARCHIVO.
 *
 * `presetPorMotivo` rutea comparando contra el string exacto `'Sesión de fotos'`, y de ese
 * ruteo depende a nombre de qué cliente de Gestión Nube sale la venta. El pedido original
 * era "agregar faltante · campaña · ingreso a los motivos"; hacerlo así habría mandado toda
 * sesión nueva al cajón de Solicitudes internas, en silencio y con la venta mal.
 *
 * Por eso el disparador es un eje APARTE. Lo que se prueba acá es esa separación, no una
 * implementación: si alguien mañana mete un disparador en `MOTIVOS`, esto se pone rojo.
 */
describe('disparador — es un eje aparte y NO toca el cajón', () => {
  it('ningún disparador entró al catálogo de motivos', () => {
    for (const d of DISPARADORES) {
      expect(MOTIVOS as readonly string[]).not.toContain(d)
      expect(MOTIVOS as readonly string[]).not.toContain(DISPARADOR_LABEL[d])
    }
  })

  it('el cajón lo sigue eligiendo el motivo, con cualquier disparador', () => {
    for (const d of DISPARADORES) {
      const s = procesarDraft(draftCon({ motivo: 'Sesión de fotos', tipo: 'retornable', disparador: d }), 'deposito', meta)!
      expect(presetPorMotivo(s.motivo).kind).toBe(PRESET_FOTOS.kind)
    }
    // Y al revés: un motivo del otro cajón sigue yendo al otro cajón aunque venga de un ingreso.
    const interna = procesarDraft(draftCon({ motivo: 'Muestra', tipo: 'retornable', disparador: 'ingreso' }), 'deposito', meta)!
    expect(presetPorMotivo(interna.motivo).kind).toBe(PRESET_INTERNAS.kind)
  })

  // Los dos motivos de Marketing, y son los dos que preguntan «De dónde viene».
  it('el cajón de fotos son los motivos de Marketing', () => {
    expect(motivosDe(PRESET_FOTOS)).toEqual(['Sesión de fotos', 'Video/contenido'])
  })

  it('las tres tienen rótulo y ayuda (una opción sin explicación se elige a ciegas)', () => {
    for (const d of DISPARADORES) {
      expect(DISPARADOR_LABEL[d].length).toBeGreaterThan(0)
      expect(DISPARADOR_AYUDA[d].length).toBeGreaterThan(20)
    }
  })
})

describe('disparador — la puerta no inventa', () => {
  it('la puerta que sabe, lo dice', () => {
    expect(disparadorPorPuerta('ingreso')).toBe('ingreso')
    expect(disparadorPorPuerta('faltantes')).toBe('faltante')
  })

  it('🔴 la puerta que NO sabe devuelve null, no un default', () => {
    // El botón de Marketing sirve igual para una campaña que para tapar un faltante.
    // Poner 'campania' acá sería que la pantalla afirme algo que nadie dijo.
    expect(disparadorPorPuerta('marketing')).toBeNull()
    expect(disparadorPorPuerta('manual')).toBeNull()
  })

  it('lo que viene raro del KV no es un disparador', () => {
    expect(esDisparador('ingreso')).toBe(true)
    expect(esDisparador('Ingreso')).toBe(false)
    expect(esDisparador('campaña')).toBe(false) // la clave se escribe sin ñ
    expect(esDisparador(undefined)).toBe(false)
    expect(esDisparador(null)).toBe(false)
    expect(esDisparador(3)).toBe(false)
  })
})

describe('disparador — el ítem hereda, salvo que traiga el suyo', () => {
  it('sin disparador propio, el ítem es el de la solicitud', () => {
    expect(disparadorDeItem({ disparador: 'ingreso' }, {})).toBe('ingreso')
  })

  it('🔑 el propio del ítem gana: el faltante que se sumó a una sesión de ingreso', () => {
    expect(disparadorDeItem({ disparador: 'ingreso' }, { disparador: 'faltante' })).toBe('faltante')
  })

  it('solicitud vieja sin disparador: el ítem tampoco tiene', () => {
    expect(disparadorDeItem({}, {})).toBeNull()
  })

  it('basura en el ítem cae al de la solicitud, no rompe', () => {
    expect(disparadorDeItem({ disparador: 'ingreso' }, { disparador: 'FALTANTE' })).toBe('ingreso')
  })
})

describe('disparadoresDe — cuántos procesos hay adentro de una sesión', () => {
  it('la solicitud sola, aunque ningún ítem lo repita', () => {
    expect(disparadoresDe(sol({ disparador: 'ingreso', items: [item('1_10')] }))).toEqual(['ingreso'])
  })

  it('🔑 ingreso + un faltante colado = los dos, sin duplicar', () => {
    const s = sol({ disparador: 'ingreso', items: [item('1_10'), item('1_11', { disparador: 'faltante' }), item('1_12', { disparador: 'faltante' })] })
    expect(disparadoresDe(s)).toEqual(['ingreso', 'faltante'])
  })

  it('el orden es el canónico, no el de aparición de los ítems', () => {
    const s = sol({ items: [item('1_10', { disparador: 'faltante' }), item('1_11', { disparador: 'campania' })] })
    expect(disparadoresDe(s)).toEqual(['campania', 'faltante'])
    expect(DISPARADORES.indexOf('campania')).toBeLessThan(DISPARADORES.indexOf('faltante'))
  })

  it('una solicitud vieja da lista vacía, no un origen inventado', () => {
    expect(disparadoresDe(sol({ items: [item('1_10')] }))).toEqual([])
    expect(filaHistorial(sol({ items: [item('1_10')] })).disparadores).toEqual([])
  })

  it('la fila del historial los lleva', () => {
    expect(filaHistorial(sol({ disparador: 'campania', items: [item('1_10')] })).disparadores).toEqual(['campania'])
  })
})

describe('historialVisible — el filtro por proceso', () => {
  const deIngreso = sol({ id: 'ing', disparador: 'ingreso', items: [item('1_10')] })
  const deCampania = sol({ id: 'cam', disparador: 'campania', items: [item('1_10')] })
  const mixta = sol({ id: 'mix', disparador: 'ingreso', items: [item('1_10'), item('1_11', { disparador: 'faltante' })] })
  const vieja = sol({ id: 'old', items: [item('1_10')] })
  const data = [deIngreso, deCampania, mixta, vieja]

  it('sin filtro, no recorta nada', () => {
    expect(historialVisible(data, true).map((s) => s.id)).toEqual(['ing', 'cam', 'mix', 'old'])
    expect(historialVisible(data, true, undefined, null).map((s) => s.id)).toEqual(['ing', 'cam', 'mix', 'old'])
  })

  it('filtrar por ingreso trae las dos que vienen de un ingreso', () => {
    expect(historialVisible(data, true, undefined, 'ingreso').map((s) => s.id)).toEqual(['ing', 'mix'])
  })

  it('🔴 filtrar por faltante encuentra el que se coló en una sesión de ingreso', () => {
    // Es el caso que motivó el campo: si el filtro mirara solo `s.disparador`, esta sesión
    // no aparecería y la pantalla mentiría por omisión justo donde más importa.
    expect(historialVisible(data, true, undefined, 'faltante').map((s) => s.id)).toEqual(['mix'])
  })

  it('la solicitud vieja no cae en ningún filtro (no tiene origen, no se le inventa uno)', () => {
    for (const d of DISPARADORES) {
      expect(historialVisible([vieja], true, undefined, d)).toEqual([])
    }
  })

  it('el filtro no pisa el recorte por sector ni el de cerradas', () => {
    const cerrada = sol({ id: 'cer', estado: 'cerrada', disparador: 'ingreso', items: [item('1_10')] })
    expect(historialVisible([...data, cerrada], false, undefined, 'ingreso').map((s) => s.id)).toEqual(['ing', 'mix'])
    // Sector local: `ing` es 100% depósito, así que ni con el filtro puesto la ve.
    expect(historialVisible(data, true, ['local'], 'ingreso')).toEqual([])
  })

  it('tieneDisparador es lo mismo que preguntarle a la lista', () => {
    expect(tieneDisparador(mixta, 'faltante')).toBe(true)
    expect(tieneDisparador(mixta, 'campania')).toBe(false)
  })
})

describe('procesarDraft — el disparador se guarda (y el vacío NO)', () => {
  it('lo elegido llega a la solicitud', () => {
    expect(procesarDraft(draftCon({ motivo: 'Sesión de fotos', tipo: 'retornable', disparador: 'faltante' }), 'deposito', meta)!.disparador).toBe('faltante')
  })

  it('🔑 sin elegir, la clave NO se escribe (una clave en null ensucia el diff del cajón)', () => {
    const s = procesarDraft(draftCon({ motivo: 'Sesión de fotos', tipo: 'retornable', disparador: null }), 'deposito', meta)!
    expect('disparador' in s).toBe(false)
  })

  it('el draft vacío nace sin origen elegido', () => {
    expect(draftVacio('Sesión de fotos', 'retornable').disparador).toBeNull()
    expect(draftVacio('Sesión de fotos', 'retornable', 'ingreso').disparador).toBe('ingreso')
  })

  it('una solicitud de las de antes (draft sin el campo) sale igual que siempre', () => {
    const s = procesarDraft(draftCon({ motivo: 'Sesión de fotos', tipo: 'retornable' }), 'deposito', meta)!
    expect('disparador' in s).toBe(false)
    expect(s.items.length).toBe(1)
  })
})
