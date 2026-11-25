import { describe, expect, it } from 'vitest'

/**
 * 🔑 **El cambio vale la LISTA, ⛔ el redondeo** (Bruno 22-nov): la historia de GN que hizo la Caja llegó con el redondeo para
 * arriba sumado al renglón (BERMUDA SEOUL #31773: lista 49.490 ⇒ 49.500). La ficha sigue diciendo lo que se cobró; el cambio usa
 * `importeCambio`, la MISMA cuenta que el motor (`aLaListaDeLaCaja`), o la pantalla y el motor difieren y el cambio da 409.
 */
const { conImporteDelCambio } = await import('../api/_erp.js')

const linea = (o: Record<string, unknown> = {}) => ({ id: 'l1', producto: '31773', talle: '4', cantidad: 1, importe: 49500, ...o })

describe('conImporteDelCambio', () => {
  it('historia de GN con el redondeo para arriba ⇒ vale la lista de la Caja; lo que se cobró queda igual', () => {
    const [l] = conImporteDelCambio([linea()], [{ product_id: 31773, size_id: 4, cantidad: 1, importe: 49490 }])
    expect(l.importeCambio).toBe(49490)
    expect(l.importe).toBe(49500)
  })

  it('por unidad: 2 unidades a 99.000 con la lista a 49.490 ⇒ 98.980', () => {
    const [l] = conImporteDelCambio([linea({ cantidad: 2, importe: 99000 })], [{ product_id: 31773, size_id: 4, cantidad: 2, importe: 98980 }])
    expect(l.importeCambio).toBe(98980)
  })

  it('sin renglones de la Caja (venta propia o de GN sin Caja) ⇒ el importe de la línea', () => {
    expect(conImporteDelCambio([linea()], null)[0].importeCambio).toBe(49500)
  })

  it('⛔ sube nunca: redondeo a favor de la clienta (la lista es más cara) ⇒ el importe de la línea', () => {
    const [l] = conImporteDelCambio([linea({ importe: 49400 })], [{ product_id: 31773, size_id: 4, cantidad: 1, importe: 49490 }])
    expect(l.importeCambio).toBe(49400)
  })

  it('otra variante ⇒ ⛔ se toca', () => {
    const [l] = conImporteDelCambio([linea()], [{ product_id: 31773, size_id: 5, cantidad: 1, importe: 49490 }])
    expect(l.importeCambio).toBe(49500)
  })
})
