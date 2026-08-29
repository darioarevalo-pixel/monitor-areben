import { describe, it, expect } from 'vitest'
import { contarPorTipo, listaDelDia, porTemperatura, vistaDe } from '@/lib/crm/lista-dia'
import { calcularAgregado } from '@/lib/crm/core'
import { PLAZO_LEAD_NUEVO, agregar, leadsDelPanel, type MapaLeads } from '@/lib/crm/leads'
import type { MapaSeguimiento, Seguimiento } from '@/lib/crm/tipos'

/**
 * Los filtros por tipo del panel de WhatsApp (29-ago-2026).
 *
 * 🔑 **Lo que se prueba acá es una separación, no una pantalla.** Hasta ahora el panel tenía una
 * sola idea —la cola de trabajo— y la temperatura sólo servía para ordenarla. Ahora son dos cosas
 * que conviven y que se contradicen a propósito: la cola muestra **lo que vence**, y los botones
 * muestran **a todos los de un tipo**, venzan o no. Lo pedido por Darío: *"que le mande un mensaje
 * a un frío no lo vuelve tibio; la temperatura describe al cliente, no la cola de trabajo"*.
 *
 * Los dos riesgos que cubre:
 *
 *  1. **Que separar "sin marcar" mueva la lista de trabajo.** Eran 340 clientes leyéndose como
 *     templados; si al ponerles etiqueta propia dejaran de entrar donde entraban, media lista del
 *     día cambiaría de un día para el otro sin que nadie lo haya pedido.
 *  2. **Que un filtro se coma gente en silencio**, que es el defecto que este trabajo vino a
 *     cerrar del lado del servidor.
 */

const HOY = new Date('2026-08-23T12:00:00')

const seg = (p: Partial<Seguimiento> = {}): Seguimiento => ({ notas: [], ...p })

describe('sin marcar · la etiqueta que faltaba', () => {
  const mapa: MapaSeguimiento = {
    1: seg({ proximo_manual: '2026-08-20', temperatura: 'templado' }), // marcado a mano
    2: seg({ proximo_manual: '2026-08-20' }), // nadie lo miró nunca
    3: seg({ proximo_manual: '2026-08-20', temperatura: 'caliente' }),
    4: seg({ proximo_manual: '2026-08-20', temperatura: 'frio' }),
  }

  it('el que nadie marcó NO cuenta como templado', () => {
    const c = contarPorTipo(mapa, HOY)
    expect(c.templado).toBe(1)
    expect(c.sin_marcar).toBe(1)
    expect(c.caliente).toBe(1)
    expect(c.frio).toBe(1)
    expect(c.todos).toBe(4)
  })

  it('🔴 pero SIGUE trabajando como templado: la lista del día no se mueve', () => {
    // El caso real es 340 clientes sin marca. Si separarlos los sacara de la cola de trabajo,
    // el cambio de etiqueta le habría vaciado la lista a quien la usa todos los días.
    const ids = listaDelDia(mapa, HOY).map((f) => f.id)
    expect(ids).toContain(2)
    // Y en el mismo escalón que el templado marcado: primero el caliente, después los dos.
    expect(ids).toEqual([3, 1, 2])
  })

  it('la etiqueta sale de si hay marca, no de la temperatura efectiva', () => {
    expect(vistaDe({ temperatura: 'templado', marcada: false })).toBe('sin_marcar')
    expect(vistaDe({ temperatura: 'templado', marcada: true })).toBe('templado')
  })

  it('el agregado de la sección dice lo mismo, así que la tabla y el panel no se contradicen', () => {
    const { activos } = calcularAgregado({
      ventas: [{ id: 1, date_sale: '2026-07-01', total_price: 1000, client_id: 2, channel_id: 1, sale_state: 'a' }],
      clientes: { 2: { id: 2, name: 'Sin marca', email: '', phone: '', city: '', province: '' } },
      crmSeg: mapa,
      crmTelOverride: {},
      today: HOY,
    })
    expect(activos[0].temperatura).toBe('templado')
    expect(activos[0].temperatura_marcada).toBe(false)
  })
})

describe('porTemperatura · buscar NO es la cola de trabajo', () => {
  const mapa: MapaSeguimiento = {
    1: seg({ proximo_manual: '2026-08-20', temperatura: 'caliente' }), // vencido
    2: seg({ proximo_manual: '2026-09-30', temperatura: 'caliente' }), // agendado lejos
    3: seg({ temperatura: 'caliente' }), // sin fecha
    4: seg({ proximo_manual: '2026-08-20', temperatura: 'frio' }),
    5: seg({ proximo_manual: '2026-08-01', temperatura: 'caliente', descartado: true }),
  }

  it('🔴 trae los que NO vencen, que es todo el punto', () => {
    // Con el corte de la cola, de 3 calientes se verían 1. El que fue a buscar a alguien
    // agendado para el mes que viene no lo encontraría, y el panel no le diría por qué.
    expect(porTemperatura(mapa, HOY, 'caliente').map((f) => f.id)).toEqual([1, 2, 3])
  })

  it('el vencido va primero, y el que no tiene fecha último', () => {
    const filas = porTemperatura(mapa, HOY, 'caliente')
    expect(filas[0].id).toBe(1)
    expect(filas[filas.length - 1].id).toBe(3)
  })

  it('el descartado sigue afuera: se descartó, no se archivó por tipo', () => {
    expect(porTemperatura(mapa, HOY, 'caliente').map((f) => f.id)).not.toContain(5)
    expect(porTemperatura(mapa, HOY, 'todos').map((f) => f.id)).not.toContain(5)
  })

  it('"todos" son los del KV, incluido el frío', () => {
    expect(porTemperatura(mapa, HOY, 'todos').map((f) => f.id).sort()).toEqual([1, 2, 3, 4])
  })

  it('no tiene tope: el corte de a 25 lo hace la pantalla, con un botón que se ve', () => {
    const muchos: MapaSeguimiento = {}
    for (let i = 1; i <= 400; i++) muchos[i] = seg({ proximo_manual: '2026-08-20', temperatura: 'frio' })
    expect(porTemperatura(muchos, HOY, 'frio')).toHaveLength(400)
  })
})

describe('los prospectos en el panel', () => {
  const leads: MapaLeads = {
    a: { id: 'a', nombre: 'Vencido', telefono: '1', instagram: '', ciudad: '', estado: 'activo', cadencia: '', ultimo_contacto: null, proximo_manual: '2026-08-20', notas: [], creado: '2026-08-01' },
    b: { id: 'b', nombre: 'Hoy', telefono: '2', instagram: '', ciudad: '', estado: 'activo', cadencia: '', ultimo_contacto: null, proximo_manual: '2026-08-23', notas: [], creado: '2026-08-01' },
    c: { id: 'c', nombre: 'Sin agendar', telefono: '3', instagram: '', ciudad: '', estado: 'activo', cadencia: '', ultimo_contacto: null, proximo_manual: null, notas: [], creado: '2026-08-01' },
    d: { id: 'd', nombre: 'Lejos', telefono: '4', instagram: '', ciudad: '', estado: 'activo', cadencia: '', ultimo_contacto: null, proximo_manual: '2026-09-30', notas: [], creado: '2026-08-01' },
    e: { id: 'e', nombre: 'Compró', telefono: '5', instagram: '', ciudad: '', estado: 'comprado', cadencia: '', ultimo_contacto: null, proximo_manual: '2026-08-20', notas: [], creado: '2026-08-01' },
  }

  it('entran los vencidos, los de hoy y los que no tienen fecha', () => {
    const ids = leadsDelPanel(leads, HOY).map((l) => l.id)
    expect(ids).toContain('a')
    expect(ids).toContain('b')
    expect(ids).toContain('c')
  })

  it('🔑 el de HOY entra, y es el que `atrasados` de la sección deja afuera', () => {
    // El filtro de la sección pide `proximo < hoy`. En el panel eso significaría que a quien se
    // agendó para hoy no se lo ve hoy — el mismo defecto del 27-ago con los clientes.
    expect(leadsDelPanel(leads, HOY).map((l) => l.id)).toContain('b')
  })

  it('el agendado lejos y el que ya compró quedan afuera', () => {
    const ids = leadsDelPanel(leads, HOY).map((l) => l.id)
    expect(ids).not.toContain('d')
    expect(ids).not.toContain('e')
  })

  it('el que no tiene fecha va al final: sin fecha no hay atraso que medir', () => {
    const lista = leadsDelPanel(leads, HOY)
    expect(lista[lista.length - 1].id).toBe('c')
  })
})

describe('un prospecto nuevo nace agendado', () => {
  it('🔴 la pestaña Leads ya no crea leads sin fecha', () => {
    // Medido el 29-ago-2026: 29 de 37 activos sin ninguna fecha, o sea fuera de toda cola de
    // trabajo. Nacían en blanco y la fecha había que acordarse de ponerla.
    const m = agregar({}, 'nuevo', new Date('2026-08-24T12:00:00')) // lunes
    expect(m.nuevo.proximo_manual).toBe('2026-08-31')
  })

  it('y el plazo cae en día hábil, como toda fecha del CRM', () => {
    // Jueves 27 + 7 = jueves 3 de septiembre. Se prueba con uno que cae en finde:
    const m = agregar({}, 'x', new Date('2026-08-22T12:00:00')) // sábado 22 + 7 = sábado 29
    expect(m.x.proximo_manual).toBe('2026-08-31') // lunes
  })

  it('el plazo por defecto es una semana', () => {
    expect(PLAZO_LEAD_NUEVO).toBe(7)
  })
})
