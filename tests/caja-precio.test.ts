import { describe, expect, it } from 'vitest'
import { esDeStunned, precioDeCaja } from '@/lib/caja/precio'
import { indexarTn } from '@/lib/tn-match.core.js'
import type { Reglas } from '@/lib/caja/core.core.js'

// La remera del 16-oct: en GN el producto se llama igual y su SKU es «STUNNED» (los 28 iguales, ver
// docs/lineas.md); su lista en GN es la de TN, $31.490, y la tienda de Stunned la tiene a $22.090.
const sMail = { id: '913512', sku: 'STUNNED', name: 'REMERA S-MAIL GREY', retailer_price: 31490 }
const idxStunned = indexarTn([{ name: 'REMERA S-MAIL GREY', sku: 'STU-REM-0007-S', price: 31490, promo_price: 22090, categories: ['REMERAS'], images: ['https://x/s-mail.jpg'] }])
const vestido = { id: '700', sku: 'ZAT-VES-0001', name: 'VESTIDO MALBA', retailer_price: 50000 }
const idxZattia = indexarTn([{ name: 'VESTIDO MALBA', sku: 'ZAT-VES-0001', price: 50000, promo_price: 40000, categories: ['VESTIDOS'], images: [] }])
const conFeria = (feriaPrecios: Record<string, number>) => ({ redondeo: 0, cuentas: {}, feriaPrecios }) as unknown as Reglas
const feria = conFeria({ '700': 30000 })

describe('Caja · el precio según la línea (16-oct)', () => {
  it('Stunned cobra el precio de SU Tienda Nube, con la oferta, ⛔ la lista de GN', () => {
    const r = precioDeCaja(sMail, { store: 'zattia', idx: idxZattia, idxStunned, reglas: feria })
    expect(r).toEqual({ precio: 22090, fueraDeTn: false, foto: 'https://x/s-mail.jpg', categorias: ['REMERAS'], oferta: true })
  })

  it('Stunned que ⛔ está en su tienda queda SIN precio: la cajera lo escribe (⛔ cae a la lista de GN)', () => {
    const r = precioDeCaja({ ...sMail, id: '1', name: 'BUZO NUEVO' }, { store: 'zattia', idx: idxZattia, idxStunned, reglas: null })
    expect(r.precio).toBeNull()
  })

  it('Stunned ⛔ toma el precio de feria: sólo su Tienda Nube', () => {
    const r = precioDeCaja(sMail, { store: 'zattia', idx: idxZattia, idxStunned, reglas: conFeria({ '913512': 1000 }) })
    expect(r.precio).toBe(22090)
  })

  it('Stunned sin su índice todavía: sin precio (carga), ⛔ el de Zattia', () => {
    expect(precioDeCaja(sMail, { store: 'zattia', idx: idxZattia, idxStunned: null, reglas: null }).precio).toBeNull()
  })

  it('Zattia sigue igual: la feria de su campaña primero, si no Tienda Nube con la oferta', () => {
    expect(precioDeCaja(vestido, { store: 'zattia', idx: idxZattia, idxStunned, reglas: feria }).precio).toBe(30000)
    expect(precioDeCaja(vestido, { store: 'zattia', idx: idxZattia, idxStunned, reglas: null }).precio).toBe(40000)
  })

  it('Stunned con precio LOCAL cargado en el ERP cobra ESE (28-oct); la foto y la oferta siguen saliendo de su Tienda Nube', () => {
    const r = precioDeCaja(sMail, { store: 'zattia', idx: idxZattia, idxStunned, reglas: null, localStunned: { '913512': 25000 } })
    expect(r).toEqual({ precio: 25000, fueraDeTn: false, foto: 'https://x/s-mail.jpg', categorias: ['REMERAS'], oferta: true })
    // Sin carga para ESE producto, sin lista (no se pudo leer) o un 0: lo de Tienda Nube, como siempre.
    expect(precioDeCaja(sMail, { store: 'zattia', idx: idxZattia, idxStunned, reglas: null, localStunned: { '1': 25000 } }).precio).toBe(22090)
    expect(precioDeCaja(sMail, { store: 'zattia', idx: idxZattia, idxStunned, reglas: null, localStunned: null }).precio).toBe(22090)
    expect(precioDeCaja(sMail, { store: 'zattia', idx: idxZattia, idxStunned, reglas: null, localStunned: { '913512': 0 } }).precio).toBe(22090)
    // El precio local de Stunned ⛔ toca a Zattia (aunque el id coincida).
    expect(precioDeCaja(vestido, { store: 'zattia', idx: idxZattia, idxStunned, reglas: null, localStunned: { '700': 1 } }).precio).toBe(40000)
  })

  it('el prefijo STU sólo cuenta en Zattia: en BDI ⛔ es Stunned', () => {
    expect(esDeStunned('zattia', sMail)).toBe(true)
    expect(esDeStunned('zattia', { sku: null }, 'STU-REM-0007-L')).toBe(true)
    expect(esDeStunned('bdi', sMail)).toBe(false)
  })
})
