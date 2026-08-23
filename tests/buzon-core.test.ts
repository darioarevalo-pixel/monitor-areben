import { describe, expect, it } from 'vitest'
import {
  abiertosDe,
  aInputLocal,
  desdeInputLocal,
  avisoDeDespacho,
  ESTADOS_QUE_DESPACHAN,
  frenaElDespacho,
  haceCuanto,
  indiceDeAbiertos,
  llaveDeOrden,
  ordenarBandeja,
  resumenDe,
  tieneAbierto,
} from '@/lib/buzon/core'
import { filaDe, normalizarOrden, validarMensaje } from '@/lib/buzon/reglas.core.js'
import type { MensajeBuzon } from '@/lib/buzon/tipos'

const msj = (p: Partial<MensajeBuzon> = {}): MensajeBuzon => ({
  id: p.id || 'b1',
  store: p.store || 'bdi',
  orden_numero: p.orden_numero === undefined ? '1234' : p.orden_numero,
  remitente: p.remitente ?? 'ana@mail.com',
  asunto: p.asunto === undefined ? 'Cambio de talle' : p.asunto,
  cuerpo: p.cuerpo || 'Quiero cambiar el talle M por L antes de que salga.',
  recibido_en: p.recibido_en || '2026-08-23T12:00:00.000Z',
  origen: p.origen || 'a_mano',
  mensaje_ext_id: p.mensaje_ext_id ?? null,
  resuelto: p.resuelto ?? false,
  resuelto_por: p.resuelto_por ?? null,
  resuelto_en: p.resuelto_en ?? null,
  accion: p.accion ?? null,
})

describe('normalizarOrden — sin esto el freno no frena', () => {
  it('saca el # y los espacios que escribe la clienta', () => {
    expect(normalizarOrden('#1234')).toBe('1234')
    expect(normalizarOrden('# 1234')).toBe('1234')
    expect(normalizarOrden('Nº 1234')).toBe('1234')
    expect(normalizarOrden(' 1234 ')).toBe('1234')
    expect(normalizarOrden(1234)).toBe('1234')
  })

  it('saca los ceros a la izquierda: Tienda Nube manda 1234 y alguien escribe 01234', () => {
    expect(normalizarOrden('01234')).toBe('1234')
  })

  it('sin número devuelve null, que NO es "0"', () => {
    expect(normalizarOrden('')).toBeNull()
    expect(normalizarOrden(null)).toBeNull()
    expect(normalizarOrden(undefined)).toBeNull()
    expect(normalizarOrden('sin número')).toBeNull()
  })
})

describe('llaveDeOrden — una orden es de una marca', () => {
  it('la misma orden en dos marcas son dos llaves', () => {
    expect(llaveDeOrden('bdi', '1234')).toBe('bdi|1234')
    expect(llaveDeOrden('zattia', '1234')).toBe('zattia|1234')
    expect(llaveDeOrden('bdi', '1234')).not.toBe(llaveDeOrden('zattia', '1234'))
  })

  it('sin orden no hay llave', () => {
    expect(llaveDeOrden('bdi', null)).toBeNull()
  })
})

describe('el índice y el freno', () => {
  it('los resueltos no entran al índice', () => {
    const ix = indiceDeAbiertos([msj({ id: 'a' }), msj({ id: 'b', resuelto: true, resuelto_en: 'x' })])
    expect(abiertosDe({ store: 'bdi', orden_numero: '1234' }, ix)).toHaveLength(1)
  })

  it('un mensaje sin orden no ata a ningún envío', () => {
    const ix = indiceDeAbiertos([msj({ orden_numero: null })])
    expect(ix.size).toBe(0)
  })

  it('la fila de Envíos con "#1234" encuentra el mensaje guardado como "1234"', () => {
    const ix = indiceDeAbiertos([msj({ orden_numero: '1234' })])
    expect(tieneAbierto({ store: 'bdi', orden_numero: '#1234' }, ix)).toBe(true)
  })

  it('🔴 el mensaje de BDI NO frena el envío de Zattia con el mismo número', () => {
    const ix = indiceDeAbiertos([msj({ store: 'bdi', orden_numero: '1234' })])
    expect(tieneAbierto({ store: 'zattia', orden_numero: '1234' }, ix)).toBe(false)
  })

  it('junta los varios mensajes de la misma orden', () => {
    const ix = indiceDeAbiertos([msj({ id: 'a' }), msj({ id: 'b' })])
    expect(abiertosDe({ store: 'bdi', orden_numero: '1234' }, ix).map((m) => m.id)).toEqual(['a', 'b'])
  })

  it('frena los tres estados que hacen avanzar el paquete', () => {
    for (const e of ESTADOS_QUE_DESPACHAN) expect(frenaElDespacho(e)).toBe(true)
  })

  it('⛔ no frena las correcciones: no_entregado y volver a en_transito no despachan nada nuevo', () => {
    expect(frenaElDespacho('no_entregado')).toBe(false)
    expect(frenaElDespacho('pendiente')).toBe(false)
  })
})

describe('el cartel', () => {
  it('nombra el asunto: "hay un mensaje" a secas se aprieta sin mirar', () => {
    const { titulo, mensaje } = avisoDeDespacho([msj()])
    expect(titulo).toContain('escribió')
    expect(mensaje).toContain('Cambio de talle')
  })

  it('con varios dice cuántos y muestra los primeros tres', () => {
    const muchos = [1, 2, 3, 4, 5].map((n) => msj({ id: `m${n}`, asunto: `Asunto ${n}` }))
    const { titulo, mensaje } = avisoDeDespacho(muchos)
    expect(titulo).toContain('5 veces')
    expect(mensaje).toContain('Asunto 1')
    expect(mensaje).toContain('y 2 más')
    expect(mensaje).not.toContain('Asunto 4')
  })

  it('sin asunto usa el arranque del cuerpo', () => {
    expect(resumenDe(msj({ asunto: null }))).toContain('Quiero cambiar el talle')
  })

  it('un cuerpo larguísimo se corta y lo dice', () => {
    const largo = resumenDe(msj({ asunto: null, cuerpo: 'a'.repeat(400) }))
    expect(largo.length).toBeLessThanOrEqual(120)
    expect(largo.endsWith('…')).toBe(true)
  })
})

describe('la bandeja', () => {
  it('lo sin resolver arriba, y adentro lo más viejo primero: el que espera hace más es el que urge', () => {
    const lista = [
      msj({ id: 'nuevo', recibido_en: '2026-08-23T12:00:00.000Z' }),
      msj({ id: 'viejo', recibido_en: '2026-08-21T12:00:00.000Z' }),
      msj({ id: 'cerrado', resuelto: true, resuelto_en: 'x', recibido_en: '2026-08-20T12:00:00.000Z' }),
    ]
    expect(ordenarBandeja(lista).map((m) => m.id)).toEqual(['viejo', 'nuevo', 'cerrado'])
  })

  it('no muta la lista que recibe', () => {
    const lista = [msj({ id: 'a', recibido_en: '2026-08-23T12:00:00.000Z' }), msj({ id: 'b', recibido_en: '2026-08-21T12:00:00.000Z' })]
    ordenarBandeja(lista)
    expect(lista.map((m) => m.id)).toEqual(['a', 'b'])
  })
})

describe('haceCuanto', () => {
  const ahora = Date.parse('2026-08-24T12:00:00.000Z')
  it('dice minutos, horas y días', () => {
    expect(haceCuanto('2026-08-24T11:30:00.000Z', ahora)).toBe('hace 30 min')
    expect(haceCuanto('2026-08-24T09:00:00.000Z', ahora)).toBe('hace 3 h')
    expect(haceCuanto('2026-08-23T12:00:00.000Z', ahora)).toBe('hace 1 día')
    expect(haceCuanto('2026-08-21T12:00:00.000Z', ahora)).toBe('hace 3 días')
  })
  it('una fecha que no se entiende devuelve null en vez de "hace NaN días"', () => {
    expect(haceCuanto('cualquier cosa', ahora)).toBeNull()
  })
})

describe('validarMensaje / filaDe — lo que el handler acepta', () => {
  it('un mensaje sin texto no entra', () => {
    expect(validarMensaje({ store: 'bdi', cuerpo: '   ' })).toContain('vacío')
  })
  it('una marca inventada no entra', () => {
    expect(validarMensaje({ store: 'stunned', cuerpo: 'hola' })).toContain('store inválido')
  })
  it('sin orden y sin remitente entra igual: se completa después', () => {
    expect(validarMensaje({ store: 'bdi', cuerpo: 'hola' })).toBeNull()
  })
  it('una fecha de recepción que no se entiende se rechaza en vez de guardarse como hoy', () => {
    expect(validarMensaje({ store: 'bdi', cuerpo: 'hola', recibido_en: 'el domingo' })).toContain('fecha')
  })

  it('filaDe normaliza la orden y firma con el perfil, no con el body', () => {
    const f = filaDe({ store: 'BDI', cuerpo: ' hola ', orden_numero: '#0042', autor: 'otro' }, 'Sofi', '2026-08-24T10:00:00.000Z')
    expect(f.store).toBe('bdi')
    expect(f.orden_numero).toBe('42')
    expect(f.cuerpo).toBe('hola')
    expect(f.autor).toBe('Sofi')
  })

  it('sin fecha de recepción usa la de ahora; con fecha, respeta la de la clienta', () => {
    const ahora = '2026-08-24T10:00:00.000Z'
    expect(filaDe({ store: 'bdi', cuerpo: 'x' }, 'Sofi', ahora).recibido_en).toBe(ahora)
    expect(filaDe({ store: 'bdi', cuerpo: 'x', recibido_en: '2026-08-23T09:00:00Z' }, 'Sofi', ahora).recibido_en).toBe('2026-08-23T09:00:00.000Z')
  })

  it('un origen inventado cae a "a_mano" en vez de guardarse', () => {
    expect(filaDe({ store: 'bdi', cuerpo: 'x', origen: 'telepatia' }, null, '2026-08-24T10:00:00.000Z').origen).toBe('a_mano')
  })
})

describe('la fecha del input — el dato del que depende todo esto', () => {
  it('🔴 usa la hora LOCAL, no la UTC: el mail de las 21:00 del domingo no puede cargarse como lunes', () => {
    const domingoALas21 = new Date(2026, 7, 23, 21, 0)
    expect(aInputLocal(domingoALas21)).toBe('2026-08-23T21:00')
  })

  it('ida y vuelta: lo que se muestra es lo que se guarda', () => {
    const d = new Date(2026, 7, 23, 9, 5)
    const iso = desdeInputLocal(aInputLocal(d))
    expect(iso).not.toBeNull()
    expect(aInputLocal(new Date(iso as string))).toBe('2026-08-23T09:05')
  })

  it('un valor vacío no se convierte en "ahora" sin avisar', () => {
    expect(desdeInputLocal('')).toBeNull()
  })
})
