import { describe, it, expect } from 'vitest'
import { armarCola, etiquetasDesactualizadas, precioQueQuedo, preciosDesalineados, sinEtiquetar, type EventoDePrecio } from '@/lib/etiquetas/cola'

const T = (iso: string) => iso
function ev(over: Partial<EventoDePrecio> = {}): EventoDePrecio {
  return {
    pid: '1',
    producto: 'SWEATER BERLIN',
    sku: 'SW-01',
    cuando: T('2026-08-13T12:00:00.000Z'),
    precioA: 20990,
    precioLista: 29990,
    liqNombre: 'Sale Invierno Agosto 2026',
    modo: 'poner',
    ...over,
  }
}

describe('armarCola · la etiqueta la dispara el cambio de precio', () => {
  it('nunca etiquetada y con stock: pendiente', () => {
    const r = armarCola([ev()], {}, { '1': 8 })
    expect(r.pendientes.map((p) => p.pid)).toEqual(['1'])
    expect(r.pendientes[0].impresaEn).toBeNull()
    expect(r.hechas).toHaveLength(0)
  })

  it('etiquetada DESPUÉS del cambio: está al día', () => {
    const r = armarCola([ev()], { '1': T('2026-08-13T18:00:00.000Z') }, { '1': 8 })
    expect(r.pendientes).toHaveLength(0)
    expect(r.hechas.map((p) => p.pid)).toEqual(['1'])
  })

  it('🔴 etiquetada ANTES del cambio: vuelve a la cola', () => {
    // Es el caso del miércoles: se levanta el sale, cambia el precio, y la etiqueta que se imprimió
    // la semana pasada quedó vieja.
    const r = armarCola([ev()], { '1': T('2026-08-10T09:00:00.000Z') }, { '1': 8 })
    expect(r.pendientes.map((p) => p.pid)).toEqual(['1'])
  })

  it('mismo instante cuenta como al día: se imprimió con el precio nuevo', () => {
    // Con `>` en vez de `>=`, una prenda etiquetada en el mismo segundo en que se le aplicó el
    // precio volvería a la cola para siempre.
    const r = armarCola([ev()], { '1': T('2026-08-13T12:00:00.000Z') }, { '1': 8 })
    expect(r.hechas).toHaveLength(1)
    expect(r.pendientes).toHaveLength(0)
  })

  it('sin stock sale de la cola: no hay prenda que etiquetar', () => {
    const r = armarCola([ev()], {}, { '1': 0 })
    expect(r.pendientes).toHaveLength(0)
    expect(r.sinStock.map((p) => p.pid)).toEqual(['1'])
  })

  it('sin fila de inventario cuenta como sin stock, no como pendiente', () => {
    expect(armarCola([ev()], {}, {}).sinStock).toHaveLength(1)
  })

  it('stock negativo tampoco entra: es un error de inventario, no una prenda', () => {
    expect(armarCola([ev()], {}, { '1': -2 }).pendientes).toHaveLength(0)
  })

  it('lo más viejo primero: es lo que más tiempo lleva con el cartel equivocado', () => {
    const r = armarCola(
      [
        ev({ pid: 'nuevo', cuando: T('2026-08-16T10:00:00.000Z') }),
        ev({ pid: 'viejo', cuando: T('2026-08-01T10:00:00.000Z') }),
        ev({ pid: 'medio', cuando: T('2026-08-10T10:00:00.000Z') }),
      ],
      {},
      { nuevo: 1, viejo: 1, medio: 1 },
    )
    expect(r.pendientes.map((p) => p.pid)).toEqual(['viejo', 'medio', 'nuevo'])
  })

  it('un sacar también entra: volver a precio de lista es una etiqueta nueva', () => {
    const r = armarCola([ev({ modo: 'sacar', precioA: null })], {}, { '1': 3 })
    expect(r.pendientes).toHaveLength(1)
    expect(precioQueQuedo(r.pendientes[0])).toBeNull()
  })

  it('no se cae con listas vacías ni con datos faltantes', () => {
    expect(armarCola([], {}, {})).toEqual({ pendientes: [], hechas: [], sinStock: [] })
  })
})

describe('sinEtiquetar · lo que queda con stock puede ser una prenda no exhibida', () => {
  const ahora = Date.parse('2026-08-16T12:00:00.000Z')

  it('lo viejo con stock y sin etiquetar es sospechoso', () => {
    const { pendientes } = armarCola([ev({ cuando: T('2026-08-05T12:00:00.000Z') })], {}, { '1': 4 })
    expect(sinEtiquetar(pendientes, ahora).map((p) => p.pid)).toEqual(['1'])
  })

  it('lo de recién NO: todavía no le dio tiempo a nadie', () => {
    const { pendientes } = armarCola([ev({ cuando: T('2026-08-16T10:00:00.000Z') })], {}, { '1': 4 })
    expect(sinEtiquetar(pendientes, ahora)).toHaveLength(0)
  })

  it('el umbral se puede mover sin tocar la regla', () => {
    const { pendientes } = armarCola([ev({ cuando: T('2026-08-14T12:00:00.000Z') })], {}, { '1': 4 })
    expect(sinEtiquetar(pendientes, ahora, 3)).toHaveLength(0)
    expect(sinEtiquetar(pendientes, ahora, 1)).toHaveLength(1)
  })
})

describe('etiquetasDesactualizadas · la etiqueta dice otro número del que se paga hoy', () => {
  // 🔴 Cierra el agujero de la regla por fechas: el precio de LISTA se carga a mano en Gestión Nube
  // y no deja rastro en la bitácora, así que comparar fechas no lo ve nunca.
  const sello = (over: Partial<{ cuando: string; modo: 'impresa' | 'ya_estaba'; precio: number | null; precioLista: number | null }> = {}) => ({
    cuando: '2026-08-13T12:00:00.000Z',
    modo: 'impresa' as const,
    precio: 12290,
    precioLista: 20490,
    ...over,
  })

  it('el precio de LISTA cambió a mano: la etiqueta queda vieja y se caza igual', () => {
    const r = etiquetasDesactualizadas(
      { '1': sello({ precio: 20490, precioLista: 20490 }) },
      { '1': { aCobrar: 24990, lista: 24990 } },
      { '1': 5 },
    )
    expect(r).toEqual([{ pid: '1', decia: 20490, ahora: 24990, cuando: '2026-08-13T12:00:00.000Z' }])
  })

  it('el mismo número no entra', () => {
    expect(etiquetasDesactualizadas({ '1': sello() }, { '1': { aCobrar: 12290, lista: 20490 } }, { '1': 5 })).toEqual([])
  })

  it('cambió sólo el tachado: la etiqueta igual está mal', () => {
    const r = etiquetasDesactualizadas({ '1': sello() }, { '1': { aCobrar: 12290, lista: 29990 } }, { '1': 5 })
    expect(r).toHaveLength(1)
  })

  /**
   * 🔴 El falso positivo que inflaba la cola, medido en prod el 3-sep-2026: **las 118 «por número»
   * de Zattia eran prendas cuya etiqueta decía EXACTAMENTE lo que se cobra hoy**. Sin oferta el
   * sello guarda `precioLista: null` y el precio de hoy trae `lista = aCobrar`, así que la
   * comparación del tachado daba siempre distinto: la prenda volvía a la cola al segundo de
   * imprimirla y no salía nunca más.
   */
  it('🔴 sin oferta y sin cambios NO entra: la lista del sello es su propio número', () => {
    expect(
      etiquetasDesactualizadas(
        { '1': sello({ precio: 14990, precioLista: null }) },
        { '1': { aCobrar: 14990, lista: 14990 } },
        { '1': 17 },
      ),
    ).toEqual([])
  })

  it('sin oferta pero con el precio cambiado, sí entra', () => {
    const r = etiquetasDesactualizadas(
      { '1': sello({ precio: 14990, precioLista: null }) },
      { '1': { aCobrar: 19990, lista: 19990 } },
      { '1': 17 },
    )
    expect(r).toEqual([{ pid: '1', decia: 14990, ahora: 19990, cuando: '2026-08-13T12:00:00.000Z' }])
  })

  it('se etiquetó a precio de lista y DESPUÉS le pusieron oferta: entra', () => {
    const r = etiquetasDesactualizadas(
      { '1': sello({ precio: 19990, precioLista: null }) },
      { '1': { aCobrar: 13990, lista: 19990 } },
      { '1': 17 },
    )
    expect(r).toHaveLength(1)
  })

  it('🔑 un sello SIN número no acusa a nadie', () => {
    // Las 262 del sellado inicial no tienen precio: no se puede inventar qué decía una etiqueta que
    // se imprimió a mano la semana pasada. Tratarlas como distintas las mandaba a la cola el primer
    // día, que es justo lo que el sellado vino a evitar.
    expect(etiquetasDesactualizadas({ '1': sello({ precio: null, precioLista: null }) }, { '1': { aCobrar: 24990, lista: 24990 } }, { '1': 5 })).toEqual([])
  })

  it('sin precio hoy tampoco acusa: puede ser el catálogo que no cruzó', () => {
    expect(etiquetasDesactualizadas({ '1': sello() }, { '1': { aCobrar: null, lista: null } }, { '1': 5 })).toEqual([])
    expect(etiquetasDesactualizadas({ '1': sello() }, {}, { '1': 5 })).toEqual([])
  })

  it('sin stock no entra, igual que en la cola por fechas', () => {
    expect(etiquetasDesactualizadas({ '1': sello() }, { '1': { aCobrar: 24990, lista: 24990 } }, { '1': 0 })).toEqual([])
  })

  it('los centavos no cuentan: la etiqueta imprime pesos redondos', () => {
    expect(etiquetasDesactualizadas({ '1': sello({ precio: 12290 }) }, { '1': { aCobrar: 12290.4, lista: 20490 } }, { '1': 5 })).toEqual([])
  })
})

/**
 * La comparación contra el espejo de Gestión Nube, pedida por Bruno el 3-sep-2026 después de
 * cambiar un precio en GN y no ver la prenda en la cola: la cola compara contra Tienda Nube —lo que
 * el cliente paga— y un precio que todavía no propagó no la despierta.
 *
 * 🔴 **Es un aviso, ⛔ no filas para imprimir**: con los dos lados en desacuerdo la etiqueta cuelga el
 * número de la tienda y el desacuerdo sigue, así que la lista de impresión no lo puede resolver.
 */
describe('preciosDesalineados · Gestión Nube contra la tienda', () => {
  it('los que no coinciden salen, con los dos números', () => {
    const r = preciosDesalineados({ '1': { gn: 36990, tienda: 45990 } }, { '1': 4 })
    expect(r).toEqual([{ pid: '1', gn: 36990, tienda: 45990 }])
  })

  it('los que coinciden no salen — y son el 99 % del catálogo', () => {
    expect(preciosDesalineados({ '1': { gn: 14990, tienda: 14990 } }, { '1': 17 })).toEqual([])
  })

  it('los centavos no cuentan, igual que en la etiqueta', () => {
    expect(preciosDesalineados({ '1': { gn: 14990.4, tienda: 14990 } }, { '1': 17 })).toEqual([])
  })

  it('sin uno de los dos números no se compara: no está en la tienda, o no cruzó', () => {
    expect(preciosDesalineados({ '1': { gn: 14990, tienda: null }, '2': { gn: null, tienda: 9990 } }, { '1': 5, '2': 5 })).toEqual([])
  })

  it('sin stock no se pregunta: no hay prenda ni cartel', () => {
    expect(preciosDesalineados({ '1': { gn: 36990, tienda: 45990 } }, { '1': 0 })).toEqual([])
  })

  it('🔑 la diferencia más grande va primero: es la que cuesta plata en el mostrador', () => {
    const r = preciosDesalineados(
      { '1': { gn: 6990, tienda: 5990 }, '2': { gn: 3990, tienda: 12490 }, '3': { gn: 5990, tienda: 8990 } },
      { '1': 2, '2': 2, '3': 2 },
    )
    expect(r.map((x) => x.pid)).toEqual(['2', '3', '1'])
  })
})
