/**
 * El aviso de la cola: cuántas fichas quedaron cargadas sin llegar a la tienda.
 *
 * Lo pidió Bruno el 1-sep-2026: «una vez que terminen la cola, que haya una alerta de x cantidad
 * de descripciones o medidas sin publicar». Y en la misma vuelta dijo quién publica: ⛔ no las que
 * cargan, sino administración o él y Darío.
 */
import { describe, expect, it } from 'vitest'
import { nombrarFilas, pendientesDePublicar, propuestasPendientes, type FilaPendiente } from '../lib/tn-desc/pendientes.core'
import { avisosDeFicha } from '../lib/notificaciones/derivar'

const fila = (o: Partial<FilaPendiente>): FilaPendiente => ({
  tn_id: '1', nombre: 'TOP ORSA', familia: 'tops', borrador: null,
  estado: 'borrador', aprobado_at: null, updated_at: null, sin_medidas: null, ...o,
})

/** Quien carga: ve la sección, ⛔ NO puede publicar. Es Camila o Josefina. */
const LOCAL = { name: 'josefinabatter', admin: false, cuenta: null, acceso: { zattia: { 'gen-desc': true } }, funcion: [] }
/** Quien publica: administración, Bruno o Darío. */
const PUBLICA = { name: 'admin', admin: false, cuenta: null, acceso: { zattia: { 'gen-desc': true, 'gen-desc.publicar': true } }, funcion: [] }

describe('🔴 el aviso tiene DUEÑO: sólo lo ve quien puede publicar', () => {
  const filas = [fila({ estado: 'aprobado', aprobado_at: '2026-09-01T10:00:00Z' })]

  it('la que carga NO lo ve: no podría hacer nada con él', () => {
    expect(avisosDeFicha(filas, {}, LOCAL as never, 'zattia')).toEqual([])
  })

  it('el que publica sí, y el aviso lleva al botón', () => {
    const a = avisosDeFicha(filas, {}, PUBLICA as never, 'zattia')
    expect(a).toHaveLength(1)
    expect(a[0].titulo).toBe('1 ficha aprobada sin publicar')
    expect(a[0].ruta).toContain('/tncat/redaccion')
    expect(a[0].detalle).toContain('TOP ORSA')
  })
})

describe('⚠️ son DOS avisos: uno se cierra con un clic y el otro pide escribir', () => {
  it('las aprobadas y las empezadas no se suman en un número', () => {
    const filas = [
      fila({ tn_id: '1', estado: 'aprobado', aprobado_at: '2026-09-01T10:00:00Z' }),
      fila({ tn_id: '2', estado: 'aprobado', aprobado_at: '2026-08-30T10:00:00Z' }),
      fila({ tn_id: '3', estado: 'borrador' }),
    ]
    const a = avisosDeFicha(filas, {}, PUBLICA as never, 'zattia')
    expect(a.map((x) => x.tipo)).toEqual(['ficha-sin-publicar', 'ficha-sin-escribir'])
    expect(a[0].titulo).toBe('2 fichas aprobadas sin publicar')
    expect(a[1].titulo).toBe('1 prenda cargada sin descripción')
  })

  it('🔴 la espera se mide desde que quedó APROBADA, no desde el último toque', () => {
    // `updated_at` se mueve cada vez que alguien carga una medida: mediría «hace cuánto que nadie
    // la toca», que es otra pregunta.
    const p = pendientesDePublicar([
      fila({ estado: 'aprobado', aprobado_at: '2026-08-30T10:00:00Z', updated_at: '2026-09-01T23:00:00Z' }),
    ])
    expect(p.esperaDesde).toBe(Date.parse('2026-08-30T10:00:00Z'))
  })

  it('de varias aprobadas, la espera es la de la MÁS VIEJA', () => {
    const p = pendientesDePublicar([
      fila({ tn_id: '1', estado: 'aprobado', aprobado_at: '2026-09-01T10:00:00Z' }),
      fila({ tn_id: '2', estado: 'aprobado', aprobado_at: '2026-08-20T10:00:00Z' }),
    ])
    expect(p.esperaDesde).toBe(Date.parse('2026-08-20T10:00:00Z'))
  })
})

describe('⛔ lo que ya está resuelto NO cuenta: si no, la cola nunca baja a cero', () => {
  it('lo escrito y verificado no es un pendiente', () => {
    const p = pendientesDePublicar([fila({ estado: 'escrito' })])
    expect(p.aprobadas).toEqual([])
    expect(p.empezadas).toEqual([])
  })

  it('una prenda sin familia todavía no es una ficha empezada', () => {
    expect(pendientesDePublicar([fila({ familia: null })]).empezadas).toEqual([])
  })

  it('lo que quedó a medias de publicar lo cuenta su propia fila, no este aviso', () => {
    const p = pendientesDePublicar([fila({ tn_id: '1', estado: 'escribiendo' }), fila({ tn_id: '2', estado: 'falla' })])
    expect(p.empezadas).toEqual([])
  })

  it('la cola vacía no genera ningún aviso', () => {
    expect(avisosDeFicha([], {}, PUBLICA as never, 'zattia')).toEqual([])
  })
})

describe('el aviso dice QUÉ, no sólo cuántos', () => {
  it('nombra los primeros tres y cuenta el resto', () => {
    const filas = ['A', 'B', 'C', 'D', 'E'].map((n, i) => fila({ tn_id: String(i), nombre: n }))
    expect(nombrarFilas(filas)).toBe('A · B · C y 2 más')
  })
})

describe('🔑 la palabra propuesta: la válvula, con su propio reloj', () => {
  const filas = [
    fila({ tn_id: '1', nombre: 'TOP LIBIA', estado: 'borrador' }),
    fila({ tn_id: '2', nombre: 'TOP ORSA', estado: 'borrador' }),
  ]
  // «forrado» no está en ninguna lista de ninguna familia: por eso es una propuesta, y ⛔ no hace
  // falta una columna que lo diga.
  const atributos = { 1: { escote: 'forrado' }, 2: { escote: 'forrado' }, 3: { escote: 'en V' } }

  it('se agrupan por PALABRA, no por producto: la decisión es sobre la palabra', () => {
    const p = propuestasPendientes(filas, atributos as never)
    expect(p).toHaveLength(1)
    expect(p[0].valor).toBe('forrado')
    expect(p[0].productos).toEqual(['TOP LIBIA', 'TOP ORSA'])
  })

  it('⛔ un valor que SÍ está en la lista no es una propuesta', () => {
    expect(propuestasPendientes([fila({ tn_id: '3' })], atributos as never)).toEqual([])
  })

  it('el aviso nombra la palabra y lo ve el que puede aprobarla', () => {
    const a = avisosDeFicha(filas, atributos as never, PUBLICA as never, 'zattia')
    const palabra = a.find((x) => x.tipo === 'palabra-propuesta')
    expect(palabra?.titulo).toBe('1 palabra nueva esperando tu OK')
    expect(palabra?.detalle).toContain('«forrado»')
    expect(avisosDeFicha(filas, atributos as never, LOCAL as never, 'zattia')).toEqual([])
  })
})
