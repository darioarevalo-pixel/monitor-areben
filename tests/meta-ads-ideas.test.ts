import { describe, it, expect } from 'vitest'
import {
  conPaso,
  ESTADOS_IDEA,
  puedeEditarIdea,
  puedeTransicionar,
  TRANSICIONES,
  transicionesDesde,
  type EstadoIdea,
  type Idea,
} from '@/lib/meta-ads/ideas'

/**
 * La máquina de estados de una idea de creativo.
 *
 * ⚠️ Esto NO es un test de la UI: es el test del **guard**. `api/_meta-funnel.js` valida cada
 * transición con estas mismas funciones, así que lo que se fija acá es literalmente lo que el
 * servidor deja pasar. Escribir la máquina dos veces —una para dibujar los botones y otra para
 * validar— es el bug que ya pasó dos veces en este repo (el padrón de Canjes invisible, y las
 * campañas de Meta pausadas por quien tenía el permiso excluido).
 */

const marketing = { ver: true, pautar: false, admin: false }
const bruno = { ver: true, pautar: true, admin: false }
const admin = { ver: true, pautar: true, admin: true }
const ajeno = { ver: false, pautar: false, admin: false }

const idea = (o: Partial<Idea> = {}): Idea => ({
  id: 'i1', etapa: 'mofu', estado: 'propuesta', evento: null, titulo: 'Testimonios',
  formato: 'reel', gancho: null, copy: null, aQuien: null, creado: 1, creadoPor: 'Nico',
  historial: [], ...o,
})

describe('quién puede mover una idea', () => {
  it('marketing produce, pero no aprueba ni pautea', () => {
    expect(puedeTransicionar(marketing, 'aprobada', 'en-produccion').ok).toBe(true)
    expect(puedeTransicionar(marketing, 'en-produccion', 'lista').ok).toBe(true)

    expect(puedeTransicionar(marketing, 'propuesta', 'aprobada').ok).toBe(false)
    expect(puedeTransicionar(marketing, 'propuesta', 'descartada').ok).toBe(false)
    expect(puedeTransicionar(marketing, 'lista', 'pauteada').ok).toBe(false)
  })

  it('quien tiene `pautar` cierra los dos extremos', () => {
    expect(puedeTransicionar(bruno, 'propuesta', 'aprobada').ok).toBe(true)
    expect(puedeTransicionar(bruno, 'propuesta', 'descartada').ok).toBe(true)
    expect(puedeTransicionar(bruno, 'lista', 'pauteada').ok).toBe(true)
  })

  it('reabrir es de quien aprueba, desde donde sea, porque deshace su ok', () => {
    for (const de of ['aprobada', 'en-produccion', 'lista', 'descartada'] as EstadoIdea[]) {
      expect(puedeTransicionar(bruno, de, 'propuesta').ok, `bruno no pudo reabrir desde ${de}`).toBe(true)
      expect(puedeTransicionar(marketing, de, 'propuesta').ok, `marketing pudo reabrir desde ${de}`).toBe(false)
    }
  })

  it('sin acceso a la sección no se mueve nada, ni siquiera lo del medio', () => {
    expect(puedeTransicionar(ajeno, 'aprobada', 'en-produccion').ok).toBe(false)
  })

  it('un salto que no existe se rechaza aunque quien lo pida pueda todo', () => {
    // Saltear la producción sería marcar como lista una pieza que nadie hizo.
    expect(puedeTransicionar(admin, 'propuesta', 'lista').ok).toBe(false)
    expect(puedeTransicionar(admin, 'aprobada', 'pauteada').ok).toBe(false)
    // Y no se puede volver atrás en la producción sin reabrir: el estado dejaría de significar algo.
    expect(puedeTransicionar(admin, 'lista', 'en-produccion').ok).toBe(false)
    expect(puedeTransicionar(admin, 'en-produccion', 'aprobada').ok).toBe(false)
  })

  it('quedarse en el mismo estado, o ir a uno inventado, no es una transición', () => {
    expect(puedeTransicionar(admin, 'propuesta', 'propuesta').ok).toBe(false)
    expect(puedeTransicionar(admin, 'propuesta', 'archivada' as EstadoIdea).ok).toBe(false)
  })

  it('el rechazo trae un motivo mostrable, no un booleano pelado', () => {
    const r = puedeTransicionar(marketing, 'lista', 'pauteada')
    expect(r.ok).toBe(false)
    expect(r.motivo).toMatch(/meta-ads\.pautar/)
  })

  it('descartar exige motivo, y es la única que lo exige', () => {
    const conMotivo = TRANSICIONES.filter((t) => t.exigeMotivo)
    expect(conMotivo.map((t) => `${t.de}→${t.a}`)).toEqual(['propuesta→descartada'])
  })
})

describe('transicionesDesde() dibuja exactamente lo que el guard deja pasar', () => {
  it('coincide con puedeTransicionar en todos los estados y para los dos perfiles', () => {
    for (const quien of [marketing, bruno]) {
      for (const de of ESTADOS_IDEA) {
        const dibujadas = transicionesDesde(quien, de).map((t) => t.a).sort()
        const permitidas = ESTADOS_IDEA.filter((a) => puedeTransicionar(quien, de, a).ok).sort()
        expect(dibujadas, `no coinciden desde ${de}`).toEqual(permitidas)
      }
    }
  })

  it('a marketing, una propuesta no le ofrece ningún botón: la pelota es de Bruno', () => {
    expect(transicionesDesde(marketing, 'propuesta')).toEqual([])
    expect(transicionesDesde(bruno, 'propuesta').map((t) => t.a).sort()).toEqual(['aprobada', 'descartada'])
  })

  it('de pauteada sólo se sale reabriendo, y sólo la reabre quien pautea', () => {
    // Es el estado que se marca a ojo ("ya la pauteé"), así que tiene que poder deshacerse sin
    // borrar la idea. Volver a `lista` no: la pieza ya salió, y el paso queda en el historial.
    expect(transicionesDesde(bruno, 'pauteada').map((t) => t.a)).toEqual(['propuesta'])
    expect(transicionesDesde(marketing, 'pauteada')).toEqual([])
  })
})

describe('editar y borrar una idea', () => {
  it('sólo su autor, y sólo mientras siga en propuesta', () => {
    expect(puedeEditarIdea(marketing, idea(), 'Nico')).toBe(true)
    expect(puedeEditarIdea(marketing, idea(), 'Ana')).toBe(false)
    // Aprobada ya no es suya: alguien la firmó y puede haber otro produciéndola.
    expect(puedeEditarIdea(marketing, idea({ estado: 'aprobada' }), 'Nico')).toBe(false)
  })

  it('el admin puede siempre, para poder limpiar', () => {
    expect(puedeEditarIdea(admin, idea({ estado: 'pauteada' }), 'Ana')).toBe(true)
  })

  it('tener `pautar` no alcanza para editar lo que escribió otro', () => {
    expect(puedeEditarIdea(bruno, idea(), 'Ana')).toBe(false)
  })
})

describe('el historial', () => {
  it('apila y no pisa', () => {
    const paso = { cuando: 1, quien: 'Nico', de: null, a: 'propuesta' as EstadoIdea, nota: null }
    const uno = conPaso(idea(), paso)
    const dos = conPaso(uno, { ...paso, cuando: 2, de: 'propuesta' as EstadoIdea, a: 'aprobada' as EstadoIdea })
    expect(dos.historial).toHaveLength(2)
    expect(dos.historial[0].a).toBe('propuesta')
    expect(dos.historial[1].a).toBe('aprobada')
    // No muta la original.
    expect(uno.historial).toHaveLength(1)
  })

  it('aguanta una idea vieja sin historial', () => {
    const sin = { ...idea(), historial: undefined as unknown as Idea['historial'] }
    expect(conPaso(sin, { cuando: 1, quien: null, de: null, a: 'propuesta', nota: null }).historial).toHaveLength(1)
  })
})
