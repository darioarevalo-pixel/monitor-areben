import { describe, expect, it } from 'vitest'
import { estadoTrasContacto, filaDesdeMaps, idDeLocal, validarAccion } from '@/lib/crm/prospectos.core.js'
import { elegirParaTanda, estadisticaPorMedio, leadsComprados, resumenTanda, type EventoProspecto } from '@/lib/crm/prospectos'
import {
  contarPorEstado,
  enlaces,
  filtrarProspectos,
  leadExistente,
  rubros,
  patchLeadDesdeProspecto,
  type Prospecto,
} from '@/lib/crm/prospectos'
import type { MapaLeads } from '@/lib/crm/leads'

const crudo = {
  nombre: 'Click Accesorios',
  rubro: 'Accesorios',
  direccion: 'Avenida 3 y Paseo 110',
  lat: -37.2625266,
  lng: -56.973007,
  ciudad: 'Villa Gesell',
  telefono: '5492255403132',
  whatsapp: 'a confirmar',
  instagram: '@clickaccesorioss',
  pagina: '',
  correo: '',
}

const p = (o: Partial<Prospecto> = {}): Prospecto => ({
  ...(filaDesdeMaps(crudo, 'test') as Omit<Prospecto, 'estado' | 'ultimo_contacto' | 'ultimo_medio' | 'lead_id' | 'tanda_id'>),
  estado: 'sin_contactar',
  ultimo_contacto: null,
  ultimo_medio: null,
  lead_id: null,
  tanda_id: null,
  ...o,
})

describe('mapa de locales', () => {
  it('el id sale igual cada vez: volver a cargar la ciudad no duplica', () => {
    expect(idDeLocal('Click Accesorios', -37.2625266, -56.973007)).toBe(idDeLocal('Click  accesorios', -37.26253, -56.97301))
    expect(idDeLocal('Click Accesorios', -37.2625, -56.973)).not.toBe(idDeLocal('Otro local', -37.2625, -56.973))
  })

  it('la fila de Maps: instagram sin @, WhatsApp sólo si es seguro, vacío = null', () => {
    const f = filaDesdeMaps(crudo, 'test')
    expect(f.instagram).toBe('clickaccesorioss')
    expect(f.whatsapp_seguro).toBe(false)
    expect(f.correo).toBeNull()
    expect(filaDesdeMaps({ ...crudo, whatsapp: 'seguro' }, 'x').whatsapp_seguro).toBe(true)
  })

  it('contactar a quien ya respondió no lo baja a «Contactado»', () => {
    expect(estadoTrasContacto('sin_contactar')).toBe('contactado')
    expect(estadoTrasContacto('descartado')).toBe('contactado')
    expect(estadoTrasContacto('respondio')).toBe('respondio')
  })

  it('«Respondió» sin lead no se acepta', () => {
    expect(validarAccion({ action: 'estado', id: 'a', estado: 'respondio' }).ok).toBe(false)
    expect(validarAccion({ action: 'estado', id: 'a', estado: 'respondio', lead_id: 'l1' }).ok).toBe(true)
    expect(validarAccion({ action: 'contacto', id: 'a', medio: 'fax' }).ok).toBe(false)
    expect(validarAccion({ action: 'nota', id: 'a', texto: '  ' }).ok).toBe(false)
  })

  it('la firma nunca sale del cuerpo', () => {
    const v = validarAccion({ action: 'nota', id: 'a', texto: 'hola', por: 'otro' })
    expect(v.ok && !!v.accion && 'por' in v.accion).toBe(false)
  })

  it('enlaces: sin dato no hay botón', () => {
    const e = enlaces(p())
    expect(e.whatsapp).toBe('https://wa.me/5492255403132')
    expect(e.llamada).toBe('tel:+5492255403132')
    expect(e.instagram).toBe('https://www.instagram.com/clickaccesorioss/')
    expect(e.correo).toBeNull()
  })

  it('filtro por ciudad, estado y búsqueda sin tildes', () => {
    const lista = [p(), p({ id: 'b', nombre: 'Celulares Pinamar', ciudad: 'Pinamar', estado: 'contactado', instagram: null })]
    expect(filtrarProspectos(lista, { ciudad: 'Pinamar', estado: 'todos', q: '' })).toHaveLength(1)
    expect(filtrarProspectos(lista, { ciudad: 'todas', estado: 'contactado', q: '' })[0].id).toBe('b')
    expect(filtrarProspectos(lista, { ciudad: 'todas', estado: 'todos', q: 'CLÍCK' })).toHaveLength(1)
    expect(contarPorEstado(lista)).toEqual({ sin_contactar: 1, contactado: 1, respondio: 0, descartado: 0 })
  })

  it('filtro por tipo y «venden fundas»; los tipos salen en orden de parecido a un comprador', () => {
    const lista = [
      p(),
      p({ id: 'b', rubro: 'Reparación', vende_fundas: true }),
      p({ id: 'c', rubro: 'Reparación' }),
      p({ id: 'd', rubro: 'Informática' }),
    ]
    expect(filtrarProspectos(lista, { ciudad: 'todas', estado: 'todos', q: '', rubro: 'Reparación' }).map((x) => x.id)).toEqual(['b', 'c'])
    expect(filtrarProspectos(lista, { ciudad: 'todas', estado: 'todos', q: '', rubro: 'Reparación', fundas: true }).map((x) => x.id)).toEqual(['b'])
    expect(filtrarProspectos(lista, { ciudad: 'todas', estado: 'todos', q: '', rubro: 'todos' })).toHaveLength(4)
    expect(rubros(lista)).toEqual([{ rubro: 'Accesorios', n: 1 }, { rubro: 'Reparación', n: 2 }, { rubro: 'Informática', n: 1 }])
  })

  it('pasar a Leads: nace con los datos del local, agendado y con nota de dónde vino', () => {
    const hoy = new Date(2026, 9, 27)
    const m = patchLeadDesdeProspecto(p({ ultimo_medio: 'whatsapp' }), 'l1', hoy)({})
    expect(m.l1.nombre).toBe('Click Accesorios')
    expect(m.l1.telefono).toBe('5492255403132')
    expect(m.l1.ciudad).toBe('Villa Gesell')
    expect(m.l1.proximo_manual).toBeTruthy()
    expect(m.l1.notas[0].texto).toMatch(/mapa de locales.*WhatsApp/)
  })

  it('no duplica el lead si ya hay uno con ese teléfono', () => {
    const leads = { x: { id: 'x', telefono: '2255 40-3132' } } as unknown as MapaLeads
    expect(leadExistente(leads, p())).toBe('x')
    expect(leadExistente({}, p())).toBeNull()
  })

  it('tanda: sólo sin contactar, sin otra tanda y con algún medio; primero el WhatsApp seguro', () => {
    const ls = [
      p({ id: 'a', nombre: 'A', telefono: null, instagram: 'a', resenas: 50 }),
      p({ id: 'b', nombre: 'B', whatsapp_seguro: true, resenas: 1 }),
      p({ id: 'c', nombre: 'C', resenas: 10 }),
      p({ id: 'd', nombre: 'D', estado: 'contactado' }),
      p({ id: 'e', nombre: 'E', tanda_id: 1 }),
      p({ id: 'f', nombre: 'F', telefono: null, instagram: null, correo: null }),
      p({ id: 'g', nombre: 'G', ciudad: 'Pinamar' }),
    ]
    expect(elegirParaTanda(ls, { ciudad: 'Villa Gesell', cantidad: 10 }).map((l) => l.id)).toEqual(['b', 'c', 'a'])
    expect(elegirParaTanda(ls, { cantidad: 2 }).map((l) => l.id)).toEqual(['b', 'c'])
  })

  it('cuenta de la tanda: respondió también es contactado', () => {
    const ls = [
      p({ id: 'a', tanda_id: 1 }),
      p({ id: 'b', tanda_id: 1, estado: 'contactado' }),
      p({ id: 'c', tanda_id: 1, estado: 'respondio' }),
      p({ id: 'd', tanda_id: 1, estado: 'descartado' }),
      p({ id: 'e', tanda_id: 2, estado: 'respondio' }),
    ]
    expect(resumenTanda(ls, 1)).toEqual({ locales: 4, contactados: 3, respondieron: 1, compraron: 0, descartados: 1 })
  })

  it('tanda: pide nombre y locales, sin repetidos, hasta el máximo', () => {
    expect(validarAccion({ action: 'tanda', nombre: ' ', ids: ['a'] }).ok).toBe(false)
    expect(validarAccion({ action: 'tanda', nombre: 'Pinamar', ids: [] }).ok).toBe(false)
    expect(validarAccion({ action: 'tanda', nombre: 'Pinamar', ids: Array.from({ length: 101 }, (_, i) => 'x' + i) }).ok).toBe(false)
    const v = validarAccion({ action: 'tanda', nombre: 'Pinamar', ids: ['a', 'a', 'b'] })
    expect(v.ok && v.accion).toEqual({ action: 'tanda', nombre: 'Pinamar', ids: ['a', 'b'] })
  })

  it('por medio: el crédito de la respuesta es del último contacto ANTES de responder', () => {
    let n = 0
    const ev = (local_id: string, en: string, o: Partial<EventoProspecto>): EventoProspecto =>
      ({ id: ++n, local_id, en, tipo: 'contacto', medio: null, estado: null, texto: null, por: null, ...o })
    const ls = [
      p({ id: 'a', estado: 'respondio', lead_id: 'L1', ultimo_medio: 'llamada' }),
      p({ id: 'b', estado: 'contactado' }),
      p({ id: 'c', estado: 'respondio', lead_id: 'L2' }),
      p({ id: 'd' }),
    ]
    const eventos = [
      // a: WhatsApp, después Instagram, responde; el seguimiento por llamada ⛔ se lleva el crédito
      ev('a', '2026-10-28T10:00:00Z', { medio: 'whatsapp' }),
      ev('a', '2026-10-28T11:00:00Z', { medio: 'instagram' }),
      ev('a', '2026-10-28T12:00:00Z', { tipo: 'estado', estado: 'respondio' }),
      ev('a', '2026-10-28T13:00:00Z', { medio: 'llamada' }),
      ev('b', '2026-10-28T10:00:00Z', { medio: 'whatsapp' }),
      ev('b', '2026-10-28T10:05:00Z', { medio: 'whatsapp' }),
      // c: pasó a Leads sin contacto anotado
      ev('c', '2026-10-28T10:00:00Z', { tipo: 'estado', estado: 'respondio' }),
      ev('d', '2026-10-28T10:00:00Z', { tipo: 'nota', texto: 'cerrado' }),
    ]
    const r = estadisticaPorMedio(ls, eventos, new Set(['L1', 'L2']))
    const de = (m: string) => r.filas.find((f) => f.medio === m)
    expect(de('whatsapp')).toEqual({ medio: 'whatsapp', contactados: 2, respondieron: 0, compraron: 0 })
    expect(de('instagram')).toEqual({ medio: 'instagram', contactados: 1, respondieron: 1, compraron: 1 })
    expect(de('llamada')).toEqual({ medio: 'llamada', contactados: 1, respondieron: 0, compraron: 0 })
    expect(r.sinMedio).toEqual({ respondieron: 1, compraron: 1 })
  })

  it('compraron: sólo los leads en «comprado»', () => {
    const leads = {
      L1: { id: 'L1', estado: 'comprado' },
      L2: { id: 'L2', estado: 'activo' },
    } as unknown as MapaLeads
    const ls = [p({ id: 'a', tanda_id: 1, estado: 'respondio', lead_id: 'L1' }), p({ id: 'b', tanda_id: 1, estado: 'respondio', lead_id: 'L2' })]
    expect(resumenTanda(ls, 1, leadsComprados(leads)).compraron).toBe(1)
  })
})
