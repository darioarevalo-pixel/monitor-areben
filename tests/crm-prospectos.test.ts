import { describe, expect, it } from 'vitest'
import { estadoTrasContacto, filaDesdeMaps, idDeLocal, validarAccion } from '@/lib/crm/prospectos.core.js'
import {
  contarPorEstado,
  enlaces,
  filtrarProspectos,
  leadExistente,
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
  ...(filaDesdeMaps(crudo, 'test') as Omit<Prospecto, 'estado' | 'ultimo_contacto' | 'ultimo_medio' | 'lead_id'>),
  estado: 'sin_contactar',
  ultimo_contacto: null,
  ultimo_medio: null,
  lead_id: null,
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
})
