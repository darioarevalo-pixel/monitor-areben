import { describe, expect, it } from 'vitest'
import {
  HUECO_TANDA_MS, agruparEnTandas, estadoSegunBitacora, pctDeEvento, precioAnterior,
  type EventoBitacora,
} from '@/lib/liquidacion/bitacora'
import { aEvento, filaBitacora } from '@/lib/liquidacion/bitacora.core.js'

let n = 0
function ev(p: Partial<EventoBitacora>): EventoBitacora {
  n += 1
  return {
    id: n,
    liqId: 'l1',
    liqNombre: 'Sale Invierno',
    pid: '1',
    producto: 'VESTIDO VERONA',
    sku: 'VER-1',
    modo: 'poner',
    precioDe: null,
    precioA: 15390,
    precioLista: 29990,
    porQuien: 'Bruno',
    cuando: '2026-08-13T18:00:00.000Z',
    ...p,
  }
}

describe('precioAnterior — qué había puesto antes de esta escritura', () => {
  it('la primera vez sale de la oferta congelada en la foto', () => {
    expect(precioAnterior(null, 15490)).toBe(15490)
  })

  it('sin oferta previa da null, que es "estaba a precio de lista"', () => {
    expect(precioAnterior(null, null)).toBe(null)
  })

  // Una promo de 0 no es una promo: es un dato roto. Anotarla como "antes tenía $0" haría que el
  // primer renglón de la campaña muestre un aumento del infinito por ciento.
  it('una promo previa de 0 o negativa NO cuenta como oferta', () => {
    expect(precioAnterior(null, 0)).toBe(null)
    expect(precioAnterior(null, -100)).toBe(null)
  })

  // 🔑 El caso que justifica que la bitácora se lea a sí misma en vez de mirar siempre la foto.
  it('con un evento anterior gana el evento, no la foto', () => {
    expect(precioAnterior({ precioA: 12990 }, 15490)).toBe(12990)
  })

  it('después de un poner → sacar, el "antes" del siguiente poner es SIN OFERTA', () => {
    // La foto sigue diciendo 15490 (era la oferta al entrar a la campaña), pero eso ya no está
    // puesto: la vuelta lo dejó a precio de lista. Leer la foto acá inventaría un descuento.
    expect(precioAnterior({ precioA: null }, 15490)).toBe(null)
  })
})

describe('filaBitacora — lo que se guarda', () => {
  const item = {
    pid: '711914',
    foto: { nombre: 'VESTIDO VERONA', sku: 'VER-1', precioNormal: 29990, promoPrevia: 15490 },
  }

  it('copia campaña, producto y sku para que el evento se lea solo', () => {
    const f = filaBitacora({
      store: 'zattia', liqId: 'l1', liqNombre: 'Sale Invierno', item,
      modo: 'poner', precioDe: 15490, precioA: 15390, porQuien: 'Bruno', cuando: '2026-08-13T18:00:00.000Z',
    })
    expect(f).toMatchObject({
      store: 'zattia', liq_id: 'l1', liq_nombre: 'Sale Invierno', pid: '711914',
      producto: 'VESTIDO VERONA', sku: 'VER-1', modo: 'poner',
      precio_de: 15490, precio_a: 15390, precio_lista: 29990, por_quien: 'Bruno',
    })
  })

  it('sacar la oferta guarda precio_a en null, que es lo que se le manda a Gestión Nube', () => {
    const f = filaBitacora({
      store: 'zattia', liqId: 'l1', liqNombre: 'Sale Invierno', item,
      modo: 'sacar', precioDe: 15390, precioA: null, porQuien: 'Bruno', cuando: '2026-08-19T10:00:00.000Z',
    })
    expect(f.precio_a).toBe(null)
    expect(f.modo).toBe('sacar')
  })

  it('un sku vacío se guarda como null, no como cadena vacía', () => {
    const f = filaBitacora({
      store: 'bdi', liqId: 'l1', liqNombre: 'x', item: { pid: '9', foto: { nombre: 'X', sku: '', precioNormal: 0 } },
      modo: 'poner', precioDe: null, precioA: 100, porQuien: null, cuando: '2026-08-13T18:00:00.000Z',
    })
    expect(f.sku).toBe(null)
    // Sin precio de lista no se guarda un 0: un 0 se leería como "vale nada" y sale en el descuento.
    expect(f.precio_lista).toBe(null)
  })
})

describe('aEvento — la fila de la base con los nombres de la pantalla', () => {
  it('pasa los números y deja los nulos como nulos', () => {
    const e = aEvento({
      id: '7', liq_id: 'l1', liq_nombre: 'Sale', pid: '711914', producto: 'VERONA', sku: null,
      modo: 'sacar', precio_de: '15390.00', precio_a: null, precio_lista: '29990.00',
      por_quien: 'Bruno', cuando: '2026-08-19T10:00:00.000Z',
    })
    expect(e).toEqual({
      id: 7, liqId: 'l1', liqNombre: 'Sale', pid: '711914', producto: 'VERONA', sku: null,
      modo: 'sacar', precioDe: 15390, precioA: null, precioLista: 29990,
      porQuien: 'Bruno', cuando: '2026-08-19T10:00:00.000Z',
    })
  })

  it('un modo raro cae en poner y no rompe la pantalla', () => {
    expect(aEvento({ id: 1, liq_id: 'l', liq_nombre: '', pid: '1', producto: '', modo: 'x', cuando: '2026-08-13T18:00:00.000Z' }).modo).toBe('poner')
  })
})

describe('agruparEnTandas', () => {
  it('junta lo escrito de una sentada en una sola tanda', () => {
    const t = agruparEnTandas([
      ev({ pid: '3', cuando: '2026-08-13T18:05:00.000Z' }),
      ev({ pid: '2', cuando: '2026-08-13T18:02:00.000Z' }),
      ev({ pid: '1', cuando: '2026-08-13T18:00:00.000Z' }),
    ])
    expect(t).toHaveLength(1)
    expect(t[0].eventos).toHaveLength(3)
    expect(t[0].hasta).toBe('2026-08-13T18:05:00.000Z')
    expect(t[0].desde).toBe('2026-08-13T18:00:00.000Z')
  })

  it('un hueco largo abre una tanda nueva', () => {
    const t = agruparEnTandas([
      ev({ pid: '2', cuando: '2026-08-13T22:00:00.000Z' }),
      ev({ pid: '1', cuando: '2026-08-13T18:00:00.000Z' }),
    ])
    expect(t).toHaveLength(2)
  })

  // Poner y sacar no se mezclan aunque pasen seguidos: son movimientos opuestos y el título de la
  // tanda ("se pusieron N ofertas") mentiría sobre la mitad.
  it('cambiar de movimiento parte la tanda aunque sea el mismo minuto', () => {
    const t = agruparEnTandas([
      ev({ pid: '2', modo: 'sacar', precioA: null, cuando: '2026-08-13T18:01:00.000Z' }),
      ev({ pid: '1', modo: 'poner', cuando: '2026-08-13T18:00:00.000Z' }),
    ])
    expect(t.map((x) => x.modo)).toEqual(['sacar', 'poner'])
  })

  it('cambiar de persona parte la tanda: el renglón dice quién lo hizo', () => {
    const t = agruparEnTandas([
      ev({ pid: '2', porQuien: 'Darío', cuando: '2026-08-13T18:01:00.000Z' }),
      ev({ pid: '1', porQuien: 'Bruno', cuando: '2026-08-13T18:00:00.000Z' }),
    ])
    expect(t).toHaveLength(2)
  })

  it('el hueco es configurable y el default son 30 minutos', () => {
    const dos = [ev({ pid: '2', cuando: '2026-08-13T18:20:00.000Z' }), ev({ pid: '1', cuando: '2026-08-13T18:00:00.000Z' })]
    expect(agruparEnTandas(dos)).toHaveLength(1)
    expect(agruparEnTandas(dos, 60_000)).toHaveLength(2)
    expect(HUECO_TANDA_MS).toBe(30 * 60_000)
  })

  it('sin eventos no hay tandas', () => {
    expect(agruparEnTandas([])).toEqual([])
  })
})

describe('estadoSegunBitacora — qué hay puesto AHORA', () => {
  // 🔑 El caso que rompe el conteo ingenuo: sumar los `poner` diría 2 ofertas puestas cuando hay 1.
  it('un producto que entró y salió cuenta UNA vez, y del lado de los sacados', () => {
    const e = estadoSegunBitacora([
      ev({ pid: '1', modo: 'sacar', precioA: null, cuando: '2026-08-19T10:00:00.000Z' }),
      ev({ pid: '1', modo: 'poner', precioA: 15390, cuando: '2026-08-13T18:00:00.000Z' }),
      ev({ pid: '2', modo: 'poner', precioA: 9990, cuando: '2026-08-13T18:00:00.000Z' }),
    ])
    expect(e).toEqual({ puestos: 1, sacados: 1, ultima: '2026-08-19T10:00:00.000Z' })
  })

  it('un producto que volvió a entrar después de salir vuelve a contar como puesto', () => {
    const e = estadoSegunBitacora([
      ev({ pid: '1', modo: 'poner', precioA: 12990, cuando: '2026-09-01T10:00:00.000Z' }),
      ev({ pid: '1', modo: 'sacar', precioA: null, cuando: '2026-08-19T10:00:00.000Z' }),
      ev({ pid: '1', modo: 'poner', precioA: 15390, cuando: '2026-08-13T18:00:00.000Z' }),
    ])
    expect(e).toMatchObject({ puestos: 1, sacados: 0 })
  })

  // El servidor los manda ordenados, pero el conteo no puede depender de eso: si algún día se
  // filtra o se concatena con otra consulta, el "último" tiene que seguir siendo el más nuevo.
  it('no depende de que vengan ordenados', () => {
    const e = estadoSegunBitacora([
      ev({ pid: '1', modo: 'poner', precioA: 15390, cuando: '2026-08-13T18:00:00.000Z' }),
      ev({ pid: '1', modo: 'sacar', precioA: null, cuando: '2026-08-19T10:00:00.000Z' }),
    ])
    expect(e).toMatchObject({ puestos: 0, sacados: 1, ultima: '2026-08-19T10:00:00.000Z' })
  })

  it('sin eventos no hay última escritura', () => {
    expect(estadoSegunBitacora([])).toEqual({ puestos: 0, sacados: 0, ultima: null })
  })
})

describe('pctDeEvento', () => {
  it('el descuento sale contra el precio de lista congelado', () => {
    expect(pctDeEvento(ev({ precioA: 15000, precioLista: 30000 }))).toBe(50)
  })

  // Sacar la oferta deja el producto a precio de lista: decir "0% de descuento" sería inventar un
  // número donde lo correcto es no decir nada.
  it('sacar la oferta no tiene descuento', () => {
    expect(pctDeEvento(ev({ modo: 'sacar', precioA: null }))).toBe(null)
  })

  it('sin precio de lista no se inventa un porcentaje', () => {
    expect(pctDeEvento(ev({ precioA: 15000, precioLista: null }))).toBe(null)
    expect(pctDeEvento(ev({ precioA: 15000, precioLista: 0 }))).toBe(null)
  })
})
