import { describe, it, expect } from 'vitest'
import { armarCola, precioQueQuedo, sinEtiquetar, type EventoDePrecio } from '@/lib/etiquetas/cola'

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
