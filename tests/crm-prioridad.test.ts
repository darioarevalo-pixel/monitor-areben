import { describe, it, expect } from 'vitest'
import {
  TEMPERATURA_DEFAULT,
  TOP_LIMIT,
  contarKpis,
  filtrarOrdenar,
  idsTop,
  paraContactar,
  prioridadContacto,
  siguienteTemperatura,
} from '@/lib/crm/core'
import { setTemperatura } from '@/lib/crm/seguimiento'
import type { ClienteCRM, EstadoSeg, Temperatura } from '@/lib/crm/tipos'

/**
 * La priorización comercial de la lista "Para contactar" (ago-2026).
 *
 * Esto NO tiene paridad contra el legacy: es lógica nueva que lo contradice a propósito
 * (el legacy ordenaba solo por fecha). Por eso vive acá y no en `crm-paridad.test.ts`,
 * que además se saltea entero cuando falta el fixture con los datos reales.
 *
 * El problema que arregla: los clientes grandes que se enfriaron tienen cadencia semanal,
 * así que se vencen cada 7 días y quedaban clavados arriba, comiéndose la mañana en
 * mensajes sin respuesta.
 */

const SORT = { col: 'total_amount', dir: -1 }

let proximoId = 1

function cli(over: Partial<ClienteCRM> = {}): ClienteCRM {
  return {
    id: proximoId++,
    name: 'Cliente',
    email: '',
    phone: '1155667788',
    city: '',
    province: '',
    first_sale: '2025-01-01',
    last_sale: '2026-07-01',
    dias_ultimo: 16,
    dias_primero: 200,
    total_sales: 4,
    total_amount: 100_000,
    avg_ticket: 25_000,
    ventas: [],
    cadencia: 'mensual',
    ultimo_contacto: '2026-06-17',
    proximo_contacto: '2026-07-17',
    seg_estado: 'vencido',
    dias_proximo: 0,
    notas: [],
    en_difusion: false,
    temperatura: TEMPERATURA_DEFAULT,
    ...over,
  }
}

/** Un cliente de la lista del día, con lo único que importa para el orden. */
function enLista(temperatura: Temperatura, seg_estado: EstadoSeg, dias_proximo: number, total_amount = 100_000) {
  return cli({ temperatura, seg_estado, dias_proximo, total_amount })
}

/**
 * "Cuenta clave" son los TOP_LIMIT (20) que más compraron. En una lista de 4 clientes
 * entran los 4, así que todo caso que dependa de ese corte tiene que ocupar los 20
 * lugares primero. El relleno va como `aldia`: pesa en el top por monto pero no aparece
 * en la lista del día — que es justamente el comportamiento correcto, porque ser cliente
 * grande es una propiedad frente a TODO el padrón, no frente a los llamados de hoy.
 */
function rellenoTop(monto = 4_000_000): ClienteCRM[] {
  return Array.from({ length: TOP_LIMIT - 1 }, () => cli({ name: 'Relleno', total_amount: monto, seg_estado: 'aldia' }))
}

describe('prioridadContacto · los cuatro grupos', () => {
  it('caliente que no es cuenta clave va primero (la caja rápida)', () => {
    expect(prioridadContacto(cli({ temperatura: 'caliente' }), false)).toBe(1)
  })
  it('caliente que SÍ es cuenta clave va segundo', () => {
    expect(prioridadContacto(cli({ temperatura: 'caliente' }), true)).toBe(2)
  })
  it('templado va tercero, sea o no cuenta clave', () => {
    expect(prioridadContacto(cli({ temperatura: 'templado' }), false)).toBe(3)
    expect(prioridadContacto(cli({ temperatura: 'templado' }), true)).toBe(3)
  })
  it('frío va último, sea o no cuenta clave', () => {
    expect(prioridadContacto(cli({ temperatura: 'frio' }), false)).toBe(4)
    expect(prioridadContacto(cli({ temperatura: 'frio' }), true)).toBe(4)
  })
})

describe('idsTop · quién es "cuenta clave"', () => {
  it('son los N que más compraron, no los marcados mayorista', () => {
    const chico = cli({ total_amount: 1_000 })
    const grande = cli({ total_amount: 900_000 })
    const medio = cli({ total_amount: 50_000 })
    const top = idsTop([chico, grande, medio], 1)
    expect([...top]).toEqual([grande.id])
  })
})

describe('la lista del día ordena por prioridad y recién después por fecha', () => {
  it('el frío atrasado 200 días queda DEBAJO del caliente que vence recién esta semana', () => {
    const frioViejo = enLista('frio', 'vencido', -200)
    const calienteFuturo = enLista('caliente', 'semana', 6)
    const orden = filtrarOrdenar([frioViejo, calienteFuturo], { q: '', seg: 'semana', sort: SORT })
    expect(orden.map((c) => c.id)).toEqual([calienteFuturo.id, frioViejo.id])
  })

  it('los cuatro grupos salen en orden, aunque el frío sea el más atrasado', () => {
    // El chico es caliente y NO entra al top por monto → caja rápida. Encima es el MENOS
    // urgente de los cuatro: si mandara la fecha, saldría último.
    const cajaRapida = enLista('caliente', 'semana', 7, 10_000)
    // El grande es caliente y SÍ entra al top → cuenta clave, va después.
    const cuentaClave = enLista('caliente', 'vencido', -30, 5_000_000)
    const templado = enLista('templado', 'vencido', -60, 20_000)
    const frio = enLista('frio', 'vencido', -300, 30_000)

    const orden = filtrarOrdenar([...rellenoTop(), frio, templado, cuentaClave, cajaRapida], { q: '', seg: 'semana', sort: SORT })
    expect(orden.map((c) => c.id)).toEqual([cajaRapida.id, cuentaClave.id, templado.id, frio.id])
  })

  it('dentro de un mismo grupo sigue mandando la urgencia de la fecha', () => {
    const vencido = enLista('caliente', 'vencido', -3)
    const pendiente = enLista('caliente', 'pendiente', 0)
    const semana = enLista('caliente', 'semana', 5)
    const orden = filtrarOrdenar([semana, pendiente, vencido], { q: '', seg: 'semana', sort: SORT })
    expect(orden.map((c) => c.id)).toEqual([vencido.id, pendiente.id, semana.id])
  })

  it('entre dos vencidos del mismo grupo, primero el más atrasado', () => {
    const pocoAtraso = enLista('caliente', 'vencido', -2)
    const muchoAtraso = enLista('caliente', 'vencido', -90)
    const orden = filtrarOrdenar([pocoAtraso, muchoAtraso], { q: '', seg: 'semana', sort: SORT })
    expect(orden.map((c) => c.id)).toEqual([muchoAtraso.id, pocoAtraso.id])
  })

  it('el que está al día no entra en la lista', () => {
    const alDia = enLista('caliente', 'aldia', 20)
    const sinSeguimiento = enLista('caliente', 'none', 0)
    const vencido = enLista('templado', 'vencido', -1)
    const orden = filtrarOrdenar([alDia, sinSeguimiento, vencido], { q: '', seg: 'semana', sort: SORT })
    expect(orden.map((c) => c.id)).toEqual([vencido.id])
  })

  it('la prioridad no cambia por lo que se escriba en el buscador', () => {
    // El grande entra al top por monto; el chico no. Si el top se calculara DESPUÉS del
    // buscador, al filtrar por "zapatería" quedarían solo estos dos, los dos entrarían al
    // top y el chico cambiaría de grupo por haber tipeado algo.
    const grande = cli({ name: 'Zapatería Norte', temperatura: 'caliente', seg_estado: 'vencido', dias_proximo: -1, total_amount: 5_000_000 })
    const chico = cli({ name: 'Zapatería Sur', temperatura: 'caliente', seg_estado: 'vencido', dias_proximo: -1, total_amount: 1_000 })
    const conBusqueda = filtrarOrdenar([...rellenoTop(), grande, chico], { q: 'zapatería', seg: 'semana', sort: SORT })
    expect(conBusqueda.map((c) => c.id)).toEqual([chico.id, grande.id])
  })
})

describe('el día 1: con todos en el default, la lista sale como salía antes', () => {
  it('ordena por urgencia pura cuando nadie fue marcado todavía', () => {
    // Ninguno tiene temperatura marcada: todos caen en el mismo grupo (3) y desempata
    // la fecha, que es exactamente lo que hacía el orden anterior a este cambio.
    const semana = enLista(TEMPERATURA_DEFAULT, 'semana', 4, 5_000_000)
    const pendiente = enLista(TEMPERATURA_DEFAULT, 'pendiente', 0, 1_000)
    const vencidoLeve = enLista(TEMPERATURA_DEFAULT, 'vencido', -1, 800_000)
    const vencidoGrave = enLista(TEMPERATURA_DEFAULT, 'vencido', -45, 2_000)

    const orden = filtrarOrdenar([semana, pendiente, vencidoLeve, vencidoGrave], { q: '', seg: 'semana', sort: SORT })
    expect(orden.map((c) => c.id)).toEqual([vencidoGrave.id, vencidoLeve.id, pendiente.id, semana.id])
  })

  it('el default es templado', () => {
    expect(TEMPERATURA_DEFAULT).toBe('templado')
  })
})

describe('la lista de fríos (recuperación)', () => {
  const frioGrande = cli({ temperatura: 'frio', total_amount: 900_000, seg_estado: 'aldia' })
  const frioChico = cli({ temperatura: 'frio', total_amount: 5_000, seg_estado: 'vencido' })
  const caliente = cli({ temperatura: 'caliente', total_amount: 700_000 })
  const templado = cli({ temperatura: 'templado', total_amount: 600_000 })

  it('muestra solo los fríos', () => {
    const orden = filtrarOrdenar([frioGrande, caliente, templado, frioChico], { q: '', seg: 'frios', sort: SORT })
    expect(orden.map((c) => c.id).sort()).toEqual([frioGrande.id, frioChico.id].sort())
  })

  it('los trae TODOS, también a los que están al día', () => {
    const orden = filtrarOrdenar([frioGrande, frioChico], { q: '', seg: 'frios', sort: SORT })
    expect(orden).toHaveLength(2)
  })

  it('por defecto arriba el frío que más compró (el que más conviene recuperar)', () => {
    const orden = filtrarOrdenar([frioChico, frioGrande], { q: '', seg: 'frios', sort: SORT })
    expect(orden.map((c) => c.id)).toEqual([frioGrande.id, frioChico.id])
  })

  it('deja reordenar por columna, como cualquier otro filtro', () => {
    const orden = filtrarOrdenar([frioGrande, frioChico], { q: '', seg: 'frios', sort: { col: 'total_amount', dir: 1 } })
    expect(orden.map((c) => c.id)).toEqual([frioChico.id, frioGrande.id])
  })
})

describe('la tarjeta "Para contactar" y la tabla dan el mismo número', () => {
  // El bug que se cierra: la tarjeta contaba vencidos + pendientes y la tabla mostraba
  // además los de esta semana, así que al tocarla aparecían más filas que el número.
  const clientes = [
    enLista('caliente', 'vencido', -5),
    enLista('templado', 'pendiente', 0),
    enLista('frio', 'semana', 3),
    enLista('caliente', 'semana', 7),
    enLista('caliente', 'aldia', 30), // no entra
    enLista('templado', 'none', 0), // no entra
  ]

  it('coinciden', () => {
    const tarjeta = contarKpis(clientes).contactar
    const tabla = filtrarOrdenar(clientes, { q: '', seg: 'semana', sort: SORT }).length
    expect(tarjeta).toBe(tabla)
    expect(tarjeta).toBe(4)
  })

  it('paraContactar incluye a los de esta semana', () => {
    expect(paraContactar(cli({ seg_estado: 'semana' }))).toBe(true)
    expect(paraContactar(cli({ seg_estado: 'vencido' }))).toBe(true)
    expect(paraContactar(cli({ seg_estado: 'pendiente' }))).toBe(true)
    expect(paraContactar(cli({ seg_estado: 'aldia' }))).toBe(false)
    expect(paraContactar(cli({ seg_estado: 'none' }))).toBe(false)
  })
})

// ── Los filtros por día ───────────────────────────────────────────────────────

describe('filtros por día (Atrasados · Hoy · Mañana · Esta semana)', () => {
  const HOY = '2026-08-13'
  const MANANA = '2026-08-14'
  const OPTS = { q: '', sort: SORT, hoy: HOY, manana: MANANA }

  const conFecha = (fecha: string | null, seg_estado: EstadoSeg, dias: number, temperatura: Temperatura = 'templado') =>
    cli({ proximo_contacto: fecha, seg_estado, dias_proximo: dias, temperatura })

  const atrasado = conFecha('2026-08-10', 'vencido', -3)
  const deHoy = conFecha(HOY, 'vencido', 0)
  const deManana = conFecha(MANANA, 'semana', 1)
  const deLaSemana = conFecha('2026-08-18', 'semana', 5)
  const lejano = conFecha('2026-09-14', 'aldia', 32)
  const sinPrimerContacto = conFecha(null, 'pendiente', 0)
  const TODOS = [atrasado, deHoy, deManana, deLaSemana, lejano, sinPrimerContacto]

  const ids = (seg: string) => filtrarOrdenar(TODOS, { ...OPTS, seg }).map((c) => c.id)

  it('"Hoy" trae exactamente los de hoy', () => {
    expect(ids('hoy')).toEqual([deHoy.id])
  })

  it('"Mañana" trae los del próximo día hábil, que lo decide el llamador', () => {
    expect(ids('manana')).toEqual([deManana.id])
  })

  it('"Atrasados" son los de fecha anterior a hoy — los de hoy NO son deuda todavía', () => {
    expect(ids('atrasados')).toContain(atrasado.id)
    expect(ids('atrasados')).not.toContain(deHoy.id)
  })

  it('"Atrasados" incluye al que tiene cadencia y nunca se contactó', () => {
    expect(ids('atrasados')).toContain(sinPrimerContacto.id)
  })

  it('"Esta semana" es todo lo de los próximos 7 días más lo atrasado, y deja afuera lo lejano', () => {
    const s = ids('semana')
    expect(s).toContain(atrasado.id)
    expect(s).toContain(deHoy.id)
    expect(s).toContain(deLaSemana.id)
    expect(s).not.toContain(lejano.id)
  })

  it('sin `hoy`/`manana` esos filtros no traen nada, en vez de traer cualquier cosa', () => {
    expect(filtrarOrdenar(TODOS, { q: '', sort: SORT, seg: 'hoy' })).toEqual([])
    expect(filtrarOrdenar(TODOS, { q: '', sort: SORT, seg: 'manana' })).toEqual([])
  })

  it('adentro de "Hoy" la temperatura ordena, que es lo que arregla el cruce', () => {
    // El cruce que motivó el filtro: un 🧊 Frío agendado para hoy se iba al fondo de los
    // 295 de la semana. Filtrando por día queda al final de LOS DE HOY, donde se lo ve.
    const frio = conFecha(HOY, 'vencido', 0, 'frio')
    const caliente = conFecha(HOY, 'vencido', 0, 'caliente')
    const templado = conFecha(HOY, 'vencido', 0, 'templado')
    const orden = filtrarOrdenar([frio, templado, caliente], { ...OPTS, seg: 'hoy' })
    expect(orden.map((c) => c.temperatura)).toEqual(['caliente', 'templado', 'frio'])
  })

  it('el buscador se combina con el filtro del día', () => {
    const a = cli({ name: 'Zapatería Norte', proximo_contacto: HOY, seg_estado: 'vencido', dias_proximo: 0 })
    const b = cli({ name: 'Otra cosa', proximo_contacto: HOY, seg_estado: 'vencido', dias_proximo: 0 })
    const r = filtrarOrdenar([a, b], { ...OPTS, seg: 'hoy', q: 'zapatería' })
    expect(r.map((c) => c.id)).toEqual([a.id])
  })
})

describe('el botón de la tabla', () => {
  it('cicla las tres temperaturas y vuelve al principio', () => {
    expect(siguienteTemperatura('caliente')).toBe('templado')
    expect(siguienteTemperatura('templado')).toBe('frio')
    expect(siguienteTemperatura('frio')).toBe('caliente')
  })

  it('desde el default, un solo clic marca frío (la tarea del día 1)', () => {
    expect(siguienteTemperatura(TEMPERATURA_DEFAULT)).toBe('frio')
  })

  it('guardar la temperatura no pisa el resto del seguimiento del cliente', () => {
    const antes = { '7': { cadencia: 'semanal', es_mayorista: true, notas: [{ fecha: '2026-07-01', texto: 'x' }] } }
    const despues = setTemperatura(antes, 7, 'frio')
    expect(despues['7'].temperatura).toBe('frio')
    expect(despues['7'].cadencia).toBe('semanal')
    expect(despues['7'].es_mayorista).toBe(true)
    expect(despues['7'].notas).toEqual([{ fecha: '2026-07-01', texto: 'x' }])
  })
})
