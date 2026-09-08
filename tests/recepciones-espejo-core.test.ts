import { describe, it, expect } from 'vitest'
import {
  enLotes,
  estaEnEspejo,
  leerEspejo,
  loQuePreguntar,
  productoDeLinea,
  recruzarPorMarca,
} from '@/lib/recepciones/espejo.core.js'

/**
 * **El cruce de un renglón de orden contra el espejo de Gestión Nube** (7-sep-2026).
 *
 * Lo que se prueba acá es lo que hizo falta escribirlo: **la foto envejece**. El webhook cruza una
 * sola vez, cuando entra el aviso, y el caso normal de un proveedor nuevo es que el alta en GN se
 * haga DESPUÉS. Medido ese día: las 13 órdenes de Zattia del 1-sep entraron con 182 de 188
 * renglones sin `producto_id` y los 182 cruzan hoy — la ficha de PRM de ELIANA IND decía «vendió 0»
 * con 7 unidades vendidas.
 *
 * Los tres casos que este archivo fija, y que ningún tipo puede fijar:
 *
 *  1. 🔴 **El recruce ⛔ no puede BORRAR lo que ya estaba.** Con el espejo mudo se conserva la foto:
 *     poner `null` sería contestar «este renglón no tiene producto» con la única respuesta que no
 *     tenemos, y el que llama contaría «vendió 0».
 *  2. 🔴 **`''` en el espejo ⛔ no corta la búsqueda.** La fila cuyo `product_id` vino en null se
 *     guarda como cadena vacía; si eso cortara, el código de barras nunca sería la red que es.
 *  3. 🔴 **Una marca muda ⛔ no arrastra a la otra.** Son dos bases distintas.
 */

const espejoDe = (porSku: Record<string, string>, porBarra: Record<string, string> = {}) => ({
  porSku: new Map(Object.entries(porSku)),
  porBarra: new Map(Object.entries(porBarra)),
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('a qué producto apunta un renglón', () => {
  it('el SKU manda', () => {
    const e = espejoDe({ 'RMI-0100-BL': '1087882' })
    expect(productoDeLinea({ sku: 'RMI-0100-BL', codigo_barras: 'RMI0100BL' }, e)).toBe('1087882')
  })

  it('🔑 el código de barras es la RED: cruza cuando el SKU no está', () => {
    const e = espejoDe({}, { RMI0100BL: '1087882' })
    expect(productoDeLinea({ sku: 'OTRO-SKU', codigo_barras: 'RMI0100BL' }, e)).toBe('1087882')
  })

  it('🔴 el SKU presente con producto VACÍO deja seguir al barcode, ⛔ no corta', () => {
    // Ésta es la línea que un `??` rompería sin que ningún tipo se queje: `''` es un valor.
    const e = espejoDe({ 'RMI-0100-BL': '' }, { RMI0100BL: '1087882' })
    expect(productoDeLinea({ sku: 'RMI-0100-BL', codigo_barras: 'RMI0100BL' }, e)).toBe('1087882')
  })

  it('lo que no está en ninguno de los dos da null', () => {
    expect(productoDeLinea({ sku: 'NADA', codigo_barras: 'NADA' }, espejoDe({ X: '1' }))).toBeNull()
  })

  it('🔴 con el espejo mudo da null, y ⛔ eso NO significa «no está»', () => {
    expect(productoDeLinea({ sku: 'RMI-0100-BL' }, null)).toBeNull()
    // Quien necesite distinguir los dos casos mira el espejo, ⛔ no el resultado:
    expect(estaEnEspejo({ sku: 'RMI-0100-BL' }, null)).toBeNull()
  })

  it('«está en el espejo» es distinto de «tiene producto»', () => {
    const e = espejoDe({ 'RMI-0100-BL': '' })
    expect(estaEnEspejo({ sku: 'RMI-0100-BL' }, e)).toBe(true)
    expect(productoDeLinea({ sku: 'RMI-0100-BL' }, e)).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('lo que se le pregunta al espejo', () => {
  it('SKU y códigos distintos, sin vacíos ni repetidos', () => {
    const r = loQuePreguntar([
      { sku: 'A', codigo_barras: 'a' },
      { sku: 'A', codigo_barras: null },
      { sku: null, codigo_barras: 'b' },
      { sku: '', codigo_barras: '' },
    ])
    expect(r).toEqual({ skus: ['A'], barras: ['a', 'b'] })
  })

  it('🔴 se pregunta de a 200: el `in` de PostgREST viaja en la URL y cortada devuelve 200', () => {
    const muchos = Array.from({ length: 450 }, (_, i) => `S${i}`)
    expect(enLotes(muchos).map((l) => l.length)).toEqual([200, 200, 50])
    expect(enLotes([])).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('leerEspejo: tres estados, no dos', () => {
  /** Un cliente de mentira que devuelve lo que le pongan, y anota qué le preguntaron. */
  function clienteFalso(filasPorSku: unknown[], filasPorBarra: unknown[] = [], romper = false) {
    const pedidos: { col: string; valores: string[] }[] = []
    return {
      pedidos,
      from: () => {
        const api = {
          select: () => api,
          in: (col: string, valores: string[]) => {
            pedidos.push({ col, valores })
            return romper
              ? Promise.resolve({ data: null, error: { message: 'se cayó' } })
              : Promise.resolve({ data: col === 'sku' ? filasPorSku : filasPorBarra, error: null })
          },
        }
        return api
      },
    }
  }

  it('arma los dos mapas de una sola pasada por SKU', async () => {
    const c = clienteFalso([{ sku: 'A', barcode: 'a', product_id: 7 }])
    const e = await leerEspejo(c, [{ sku: 'A', codigo_barras: 'a' }])
    expect(e!.porSku.get('A')).toBe('7')
    expect(e!.porBarra.get('a')).toBe('7')
  })

  it('🔴 si la base falla devuelve null y ⛔ NO un mapa vacío', async () => {
    const c = clienteFalso([], [], true)
    expect(await leerEspejo(c, [{ sku: 'A' }])).toBeNull()
  })

  it('sin cliente —credenciales de esa marca sin cargar— también es null', async () => {
    expect(await leerEspejo(null, [{ sku: 'A' }])).toBeNull()
  })

  it('🔴 🔑 el grupo de CÓDIGOS DE BARRAS se escribe DESPUÉS del de SKU, y por eso puede pisarlo', async () => {
    // Los lotes de cada grupo van en paralelo desde el 8-sep-2026 —eran 8 viajes en fila india por
    // marca y costaban 3,1 s del pedido de la lista—, pero **los dos grupos siguen en orden**.
    // Adentro de un grupo el orden ⛔ no importa (los lotes son pedazos disjuntos de la misma
    // lista); entre grupos sí: `porBarra` lo escriben los dos, y la consulta por barcode es la que
    // preguntó por ese código. Sin esto, paralelizar de más cambia a qué producto apunta un
    // renglón y ⛔ nada falla.
    const c = clienteFalso(
      [{ sku: 'A', barcode: 'b1', product_id: 7 }],
      [{ sku: null, barcode: 'b1', product_id: 9 }],
    )
    const e = await leerEspejo(c, [{ sku: 'A', codigo_barras: 'b1' }])
    expect(e!.porBarra.get('b1')).toBe('9')
    expect(e!.porSku.get('A')).toBe('7')
  })

  it('los lotes de un grupo se piden TODOS, aunque vayan juntos', async () => {
    // 250 SKU distintos son 2 lotes de 200 + 50. Lo que se clava es que ninguno se pierda al
    // paralelizarlos: un lote menos es un puñado de renglones que se quedan sin cruzar, callados.
    const skus = Array.from({ length: 250 }, (_, i) => `S${i}`)
    const c = clienteFalso(skus.map((sku, i) => ({ sku, barcode: null, product_id: i })))
    const e = await leerEspejo(c, skus.map((sku) => ({ sku, codigo_barras: null })))
    expect(e!.porSku.size).toBe(250)
    expect(c.pedidos.filter((p) => p.col === 'sku')).toHaveLength(2)
  })

  it('sin nada que preguntar es null, ⛔ no un mapa que diría «no está ninguno»', async () => {
    const c = clienteFalso([])
    expect(await leerEspejo(c, [{ sku: null, codigo_barras: null }])).toBeNull()
    expect(c.pedidos).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('el recruce de HOY, con órdenes de las dos marcas', () => {
  const base = (porSku: Record<string, string>) => ({
    from: () => {
      const api = {
        select: () => api,
        in: (_col: string, valores: string[]) =>
          Promise.resolve({
            data: valores.filter((v) => v in porSku).map((v) => ({ sku: v, barcode: null, product_id: porSku[v] })),
            error: null,
          }),
      }
      return api
    },
  })

  const LINEAS = [
    // El caso real: llegó el 1-sep sin cruzar, el alta se hizo el 2.
    { store: 'zattia', sku: 'RMI-0100-BL', codigo_barras: 'RMI0100BL', producto_id: null },
    // Ya cruzaba cuando llegó.
    { store: 'zattia', sku: 'VIEJO', codigo_barras: 'V', producto_id: '900' },
    { store: 'bdi', sku: 'B-1', codigo_barras: 'B1', producto_id: null },
  ]

  it('🏁 el renglón que llegó sin producto cruza hoy, y se cuenta cuántos fueron', async () => {
    const clientes = { zattia: base({ 'RMI-0100-BL': '1087882', VIEJO: '900' }), bdi: base({ 'B-1': '55' }) }
    const r = await recruzarPorMarca(LINEAS, (s: string) => clientes[s as 'zattia' | 'bdi'])
    expect(r.lineas.map((l: { producto_id: string | null }) => l.producto_id)).toEqual(['1087882', '900', '55'])
    // 🔑 El que ya cruzaba ⛔ NO cuenta como recruzado: si contara, el cartel de la pantalla diría
    // «se dieron de alta después» de renglones que estaban desde el primer día.
    expect(r.recruzados).toBe(2)
    expect(r.mudas).toEqual([])
  })

  it('🔴 la marca muda conserva la FOTO y se nombra; la otra cruza igual', async () => {
    const r = await recruzarPorMarca(LINEAS, (s: string) => (s === 'bdi' ? base({ 'B-1': '55' }) : null))
    expect(r.mudas).toEqual(['zattia'])
    // Los dos de Zattia quedan como estaban —incluido el `900`, que ⛔ no se pierde—…
    expect(r.lineas[0].producto_id).toBeNull()
    expect(r.lineas[1].producto_id).toBe('900')
    // …y BDI, que sí contestó, cruza.
    expect(r.lineas[2].producto_id).toBe('55')
    expect(r.recruzados).toBe(1)
  })

  it('🔴 el que HOY no está en el espejo conserva su producto viejo, ⛔ no se le borra', async () => {
    const r = await recruzarPorMarca(
      [{ store: 'zattia', sku: 'YA-NO-ESTA', codigo_barras: null, producto_id: '900' }],
      () => base({}),
    )
    expect(r.lineas[0].producto_id).toBe('900')
    expect(r.recruzados).toBe(0)
  })

  it('el orden de las marcas mudas ⛔ no depende de cuál conteste primero', async () => {
    const lento = {
      from: () => ({
        select() { return this },
        in: () => new Promise((r) => setTimeout(() => r({ data: null, error: { message: 'x' } }), 5)),
      }),
    }
    const rapido = { from: () => ({ select() { return this }, in: () => Promise.resolve({ data: null, error: { message: 'x' } }) }) }
    const r = await recruzarPorMarca(LINEAS, (s: string) => (s === 'zattia' ? lento : rapido))
    expect(r.mudas).toEqual(['zattia', 'bdi'])
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('«no había nada que preguntar» ⛔ no es una marca muda', () => {
  it('🔴 renglones sin SKU ni código ⛔ no encienden el cartel de «no se pudo preguntar»', async () => {
    // Es el cartel que tapa los números buenos de TODA la marca: encenderlo por una orden vieja
    // cargada sin códigos haría que la pantalla dijera que no sabe nada de BDI.
    const r = await recruzarPorMarca(
      [{ store: 'bdi', sku: null, codigo_barras: null, producto_id: '7' }],
      () => null,
    )
    expect(r.mudas).toEqual([])
    expect(r.lineas[0].producto_id).toBe('7')
  })

  it('pero con SKU y SIN base, la marca sí sale muda', async () => {
    const r = await recruzarPorMarca([{ store: 'bdi', sku: 'A', producto_id: null }], () => null)
    expect(r.mudas).toEqual(['bdi'])
  })
})
