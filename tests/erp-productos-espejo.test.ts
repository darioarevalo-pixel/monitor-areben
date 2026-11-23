import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { planProductosErp, SQL_PRODUCTOS_LINEAS } from '../lib/erp/productos-espejo.core.js'

const fila = (o: Record<string, unknown>) => ({
  id: 1, linea: 'zattia', nombre: 'TOP', categoria: 'TOPS', proveedor: 'Prov', activo: true,
  actualizado_en: '2026-11-23T03:00:00.000Z', precio: '45990.00', mayorista: '30000.00', costo: '12000.00', ...o,
})

describe('planProductosErp: el catálogo del motor al espejo `productos` (Bruno 23-nov: desconectar todo de GN)', () => {
  it('el que ya está en el espejo ⛔ manda created_at ni sku (son los de GN); el nuevo entra con el día de carga y sku null', () => {
    const p = planProductosErp(['zattia'], [fila({ id: 1 }), fila({ id: 1000000066 })], [{ id: 1 }], { conProveedor: true })
    expect(p.freno).toBeNull()
    expect(p.existentes).toEqual([{ id: 1, name: 'TOP', category: 'TOPS', retailer_price: 45990, wholesaler_price: 30000, unit_cost: 12000, active: true, updated_at: '2026-11-23T03:00:00.000Z', proveedor: 'Prov' }])
    expect(p.existentes[0]).not.toHaveProperty('created_at')
    expect(p.existentes[0]).not.toHaveProperty('sku')
    expect(p.nuevos).toEqual([expect.objectContaining({ id: 1000000066, sku: null, created_at: '2026-11-23T03:00:00.000Z' })])
  })
  it('🔴 sin precio, mayorista o costo ⇒ 0, como GN (con null se movían 769 costos de Zattia sin que nada cambiara)', () => {
    const p = planProductosErp(['zattia'], [fila({ precio: null, mayorista: null, costo: null })], [{ id: 1 }], { conProveedor: true })
    expect(p.existentes[0]).toMatchObject({ retailer_price: 0, wholesaler_price: 0, unit_cost: 0 })
  })
  it('el inactivo del motor se escribe inactivo (el ETL lo filtra)', () => {
    expect(planProductosErp(['bdi'], [fila({ linea: 'bdi', activo: false })], [{ id: 1 }], { conProveedor: false }).existentes[0].active).toBe(false)
  })
  it('BDI ⛔ tiene `proveedor` en el espejo: ⛔ viaja', () => {
    expect(planProductosErp(['bdi'], [fila({ linea: 'bdi' })], [], { conProveedor: false }).nuevos[0]).not.toHaveProperty('proveedor')
  })
  it('sólo las líneas cortadas: lo de otra línea ⛔ se escribe', () => {
    const p = planProductosErp(['stunned'], [fila({ id: 1, linea: 'stunned' }), fila({ id: 2, linea: 'zattia' })], [], { conProveedor: true })
    expect(p.nuevos.map((r) => r.id)).toEqual([1])
  })
  it('🔴 una línea cortada sin un solo producto en el motor ⇒ FRENA (⛔ escribe medio catálogo)', () => {
    const p = planProductosErp(['zattia', 'stunned'], [fila({})], [], { conProveedor: true })
    expect(p.freno).toMatch(/stunned/)
    expect(p.existentes).toEqual([])
    expect(p.nuevos).toEqual([])
  })
  it('🔴 sin decir si hay `proveedor` TIRA (⛔ adivina la forma del espejo)', () => {
    // @ts-expect-error — a propósito
    expect(() => planProductosErp(['bdi'], [], [])).toThrow(/proveedor/)
  })
  it('el precio es la lista ONLINE y, si no tiene, la LOCAL (⛔ oferta: el margen se mide contra la lista, como GN)', () => {
    expect(SQL_PRODUCTOS_LINEAS).toMatch(/coalesce\(\s*\(select l\.precio from precio_lista l where [^)]*'online'\),\s*\(select l\.precio from precio_lista l where [^)]*'local'\)\)/)
    expect(SQL_PRODUCTOS_LINEAS).not.toMatch(/'oferta'/)
  })
})

describe('los tres syncs que escriben `productos` desde GN corren después la copia del motor', () => {
  for (const [wf, arg] of [['sync-diario.yml', 'bdi'], ['sync-diario-zattia.yml', 'zattia'], ['sync-inventario.yml', '"$INPUT_STORE"']]) {
    it(wf, () => {
      const y = readFileSync(`.github/workflows/${wf}`, 'utf8')
      const gn = y.search(/run: node scripts\/sync-(diario|diario-zattia|inventario-solo)\.js/)
      const erp = y.indexOf(`run: node scripts/erp-productos-espejo.mjs ${arg}`)
      expect(gn).toBeGreaterThan(-1)
      expect(erp).toBeGreaterThan(gn)
    })
  }
})
