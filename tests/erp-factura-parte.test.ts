/**
 * «Facturar una PARTE» desde la HOJA DEL PEDIDO (mayoristas, Darío §5; Bruno 31-oct). El oráculo, la puerta de punta a punta con
 * ARCA y repo falsos:
 *  - proponer ⛔ factura: sin monto da lo que queda y los productos que faltan; con monto, renglones AJUSTADOS (el default)
 *    que suman JUSTO el monto, o a precio REAL;
 *  - emitir: fila `clase: 'parte'` con `venta_ref` = la venta, `venta_id` = `<venta>:parte:<uuid>`, `tope` = el total de la
 *    venta, los renglones (con su `clave` sólo si es de la venta) y el `cliente_id`; ARCA recibe el total de los renglones;
 *  - frena: con la entera viva, pasarse de lo que queda, y lo que frene la BASE (`facturas_no_pasarse`) sale dicho;
 *  - lo de las partes previas (y lo que les devolvió una NC) se descuenta.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { partePedidoPanel } from '../api/_erp-factura-mayorista.js'

const CUIT = '30718508181'
const PEDIDO = '0b5e7a52-6d1c-4b8e-9a51-2f6c7d8e9f10'
const VENTA = '0b5e7a52-6d1c-4b8e-9a51-2f6c7d8e9f11'
const CLIENTE = '0b5e7a52-6d1c-4b8e-9a51-2f6c7d8e9f12'
// 10 fundas a $3.000 + 4 templados a $1.500 = $36.000.
const venta = {
  id: VENTA, estado: 'confirmada', tipo: 'venta', total: 36000, prueba: false, marca: 'bdi', empresa_id: 'e1', facturas: [], detalle: {},
  ocurrida_en: '2026-10-31T15:00:00Z',
  lineas: [{ product_id: 1, size_id: 10, cantidad: 10, importe: 30000 }, { product_id: 2, size_id: 20, cantidad: 4, importe: 6000 }],
}
const pedido = { id: PEDIDO, numero: 12, venta_id: VENTA, cliente_id: CLIENTE, anulado_en: null, total: 36000, etapa: 'preparado' }
const FICHA = { id: CLIENTE, empresa_id: 'e1', doc: CUIT, nombre: 'X', razon_social: 'X SA', condicion_iva: 1, domicilio: 'Rosario' }
const NOMBRES = { producto: new Map([['1', 'Funda Mom'], ['2', 'Templado']]), talle: new Map([['1:10', 'iPhone 13'], ['2:20', 'iPhone 13']]) }

function arcaFalso() {
  const emitidos: Array<{ total: number; docNro: number }> = []
  return {
    emitidos,
    async ultimo() { return emitidos.length },
    async solicitar({ comprobantes }: { desde: number; comprobantes: Array<{ total: number; receptor: { docNro: number } }> }) {
      const detalles = comprobantes.map((c) => { emitidos.push({ total: c.total, docNro: Number(c.receptor.docNro) }); return { numero: emitidos.length, resultado: 'A', cae: '7' + emitidos.length, caeVence: '2026-11-10', observaciones: [] } })
      return { resultado: 'A', errores: [], detalles }
    },
    async consultar() { return null },
  }
}
function repoFalso(frenaLaBase: string | null = null) {
  const filas: Array<Record<string, unknown>> = []
  let candado = 0
  return {
    filas, get candado() { return candado },
    async tomarCandado() { candado++; return true }, async soltarCandado() { candado-- },
    async reservadas() { return [] },
    async ventasFacturadas() { return new Set<string>() },
    async reservar(n: Array<Record<string, unknown>>) {
      if (frenaLaBase) throw new Error(`facturas (reservar): ${frenaLaBase}`)
      filas.push(...n.map((f) => ({ ...f })))
    },
    async resolver(id: string, cambios: Record<string, unknown>) { const f = filas.find((x) => x.id === id); if (f) Object.assign(f, cambios) },
  }
}
type Hechas = { entera: boolean; partes: Array<{ id: string; total: number; acreditado: number; renglones: unknown[] }> } | { sinMigrar: true }
const correr = (body: Record<string, unknown>, extra: Record<string, unknown> = {}, hechas: Hechas = { entera: false, partes: [] }) => {
  const arca = arcaFalso(), repo = (extra.repo as ReturnType<typeof repoFalso>) || repoFalso(), sqls: string[] = []
  const pg = {
    async query(sql: string) {
      sqls.push(sql)
      if (/from cliente where id/.test(sql)) return { rows: [extra.ficha ?? FICHA] }
      if (/from venta_ficha/.test(sql)) return { rows: [extra.venta ?? venta] }
      return { rows: [] }
    },
  }
  const pedidas: unknown[] = []
  const r = partePedidoPanel({ body: { pedidoId: PEDIDO, ...body }, usuario: 'test' }, {
    conMotor: (_m: string, _q: string, fn: (pg: unknown) => unknown) => fn(pg), prendido: true, escribir: true,
    arca, sb: {}, leerPedido: async () => ({ ok: true, pedido }), nombres: async () => NOMBRES,
    facturasDeVenta: async (_sb: unknown, p: unknown) => { pedidas.push(p); return hechas },
    ...extra, repo,
  })
  return { r, arca, repo, sqls, pedidas }
}

let ambienteAntes: string | undefined
beforeEach(() => { ambienteAntes = process.env.ARCA_AMBIENTE; process.env.ARCA_AMBIENTE = 'homologacion' })
afterEach(() => { if (ambienteAntes === undefined) delete process.env.ARCA_AMBIENTE; else process.env.ARCA_AMBIENTE = ambienteAntes })

describe('partePedidoPanel · proponer (⛔ factura)', () => {
  it('sin monto ⇒ lo que queda y los productos con su nombre y precio real; ARCA ni se entera', async () => {
    const { r, arca, repo, pedidas } = correr({ paso: 'proponer' })
    expect(await r).toMatchObject({
      ok: true, total: 36000, facturado: 0, queda: 36000, partes: 0,
      pendientes: [
        { clave: '1:10', descripcion: 'Funda Mom - iPhone 13', cantidad: 10, unitario: 3000 },
        { clave: '2:20', descripcion: 'Templado - iPhone 13', cantidad: 4, unitario: 1500 },
      ],
    })
    expect(pedidas).toEqual([{ ambiente: 'homologacion', clave: VENTA, claves: [VENTA] }])
    expect(arca.emitidos).toEqual([])
    expect(repo.filas).toEqual([])
  })
  it('con monto ⇒ AJUSTADOS por default: suman justo el monto', async () => {
    const out = await correr({ paso: 'proponer', monto: 20000 }).r as { propuesta: { total: number; renglones: Array<{ importe: number }> }; precios: string }
    expect(out.precios).toBe('ajustados')
    expect(out.propuesta.total).toBe(20000)
    expect(out.propuesta.renglones.reduce((a, x) => a + Math.round(x.importe * 100), 0)).toBe(2000000)
  })
  it('precios reales ⇒ entran productos a su precio sin pasarse ($7.000: 2 fundas, el templado ya ⛔ entra)', async () => {
    const out = await correr({ paso: 'proponer', monto: 7000, precios: 'reales' }).r as { propuesta: { total: number; renglones: Array<{ clave: string; cantidad: number; unitario: number }> } }
    expect(out.propuesta).toEqual({ total: 6000, renglones: [expect.objectContaining({ clave: '1:10', cantidad: 2, unitario: 3000 })] })
  })
  it('las partes previas se descuentan (y una NC les devuelve lugar)', async () => {
    const hechas = { entera: false, partes: [{ id: 'p1', total: 9000, acreditado: 3000, renglones: [{ clave: '1:10', cantidad: 3 }] }] }
    const out = await correr({ paso: 'proponer' }, {}, hechas).r
    expect(out).toMatchObject({ facturado: 6000, queda: 30000, partes: 1, pendientes: [{ clave: '1:10', cantidad: 7 }, { clave: '2:20', cantidad: 4 }] })
  })
  it('una parte que su NC dejó en CERO devuelve también sus productos', async () => {
    const hechas = { entera: false, partes: [{ id: 'p1', total: 9000, acreditado: 9000, renglones: [{ clave: '1:10', cantidad: 3 }] }] }
    const out = await correr({ paso: 'proponer' }, {}, hechas).r
    expect(out).toMatchObject({ facturado: 0, queda: 36000, pendientes: [{ clave: '1:10', cantidad: 10 }, { clave: '2:20', cantidad: 4 }] })
  })
  it('un monto que pasa lo que queda ⇒ 409 con cuánto queda', async () => {
    const hechas = { entera: false, partes: [{ id: 'p1', total: 30000, acreditado: 0, renglones: [] }] }
    expect(await correr({ paso: 'proponer', monto: 6000.01 }, {}, hechas).r).toMatchObject({ status: 409, error: expect.stringMatching(/Quedan \$6\.000/) })
  })
})

describe('partePedidoPanel · emitir', () => {
  const renglones = [{ clave: '1:10', descripcion: 'Funda Mom - iPhone 13', cantidad: 5, unitario: 2000 }, { clave: '9:99', descripcion: 'Otra cosa', cantidad: 1, unitario: 500 }]
  it('A al CUIT de la ficha por el total de los renglones; la fila es una PARTE con su tope y su venta', async () => {
    const { r, arca, repo } = correr({ paso: 'emitir', renglones })
    const out = await r
    expect(out).toMatchObject({ ok: true, total: 36000, facturado: 10500, queda: 25500, factura: { clase: 'parte', venta_ref: VENTA, tipo: 1, total: 10500, receptor_nombre: 'X SA' } })
    expect(arca.emitidos).toEqual([{ total: 10500, docNro: Number(CUIT) }])
    const [f] = repo.filas
    expect(f).toMatchObject({ clase: 'parte', venta_ref: VENTA, tope: 36000, cliente_id: CLIENTE, tipo: 1, total: 10500, estado: 'autorizada' })
    expect(String(f.venta_id)).toMatch(new RegExp(`^${VENTA}:parte:[0-9a-f-]{36}$`))
    expect(f.mes).toBe(String(f.fecha).slice(0, 7))
    // La clave sólo queda si es de la venta: «9:99» se inventó.
    expect(f.renglones).toEqual([
      { clave: '1:10', descripcion: 'Funda Mom - iPhone 13', cantidad: 5, unitario: 2000, importe: 10000 },
      { descripcion: 'Otra cosa', cantidad: 1, unitario: 500, importe: 500 },
    ])
    expect(repo.candado).toBe(0)
  })
  it('con la factura ENTERA viva ⇒ 409, ⛔ ARCA', async () => {
    const { r, arca } = correr({ paso: 'emitir', renglones }, {}, { entera: true, partes: [] })
    expect(await r).toMatchObject({ status: 409, error: expect.stringMatching(/factura entera/) })
    expect(arca.emitidos).toEqual([])
  })
  it('la entera atada en el motor (venta_factura) también frena', async () => {
    const { r, arca } = correr({ paso: 'emitir', renglones }, { venta: { ...venta, facturas: [{ tipo: 'factura' }] } })
    expect(await r).toMatchObject({ status: 409, error: expect.stringMatching(/ya tiene factura/) })
    expect(arca.emitidos).toEqual([])
  })
  it('los renglones pasan lo que queda ⇒ 409, ⛔ ARCA', async () => {
    const hechas = { entera: false, partes: [{ id: 'p1', total: 30000, acreditado: 0, renglones: [] }] }
    const { r, arca } = correr({ paso: 'emitir', renglones }, {}, hechas)
    expect(await r).toMatchObject({ status: 409, error: expect.stringMatching(/Quedan \$6\.000.*suman \$10\.500/) })
    expect(arca.emitidos).toEqual([])
  })
  it('ya facturada entera por partes ⇒ 409', async () => {
    const hechas = { entera: false, partes: [{ id: 'p1', total: 36000, acreditado: 0, renglones: [] }] }
    expect(await correr({ paso: 'proponer' }, {}, hechas).r).toMatchObject({ status: 409, error: expect.stringMatching(/facturada entera/) })
  })
  it('lo que frena la BASE (otra parte salió recién) sale dicho, con el candado suelto', async () => {
    const repo = repoFalso('FACTURA_PARTE: se pasa del total de la venta (facturado 30000, pide 10500, total 36000)')
    const out = await correr({ paso: 'emitir', renglones }, { repo }).r
    expect(out).toMatchObject({ status: 409, error: expect.stringMatching(/se pasa del total/) })
    expect(repo.candado).toBe(0)
  })
  it('otro error de la base ⛔ se disfraza: sube', async () => {
    const repo = repoFalso('connection reset')
    await expect(correr({ paso: 'emitir', renglones }, { repo }).r).rejects.toThrow(/connection reset/)
  })
  it('ficha sin condición ⇒ 409 con falta, ⛔ ARCA', async () => {
    const { r, arca } = correr({ paso: 'emitir', renglones }, { ficha: { id: CLIENTE, empresa_id: 'e1', nombre: 'X' } })
    expect(await r).toMatchObject({ status: 409, falta: true })
    expect(arca.emitidos).toEqual([])
  })
  it('sin migrar ⇒ 409 que lo dice', async () => {
    expect(await correr({ paso: 'proponer' }, {}, { sinMigrar: true }).r).toMatchObject({ status: 409, error: expect.stringMatching(/migración/) })
  })
  it('venta de PRUEBA en producción ⇒ 409 antes de leer las facturas', async () => {
    process.env.ARCA_AMBIENTE = 'produccion'
    process.env.ARCA_PRODUCCION_HABILITADA = 'si'
    try {
      const { r, pedidas } = correr({ paso: 'emitir', renglones }, { venta: { ...venta, prueba: true } })
      expect(await r).toMatchObject({ status: 409, error: expect.stringMatching(/PRUEBA/) })
      expect(pedidas).toEqual([])
    } finally { delete process.env.ARCA_PRODUCCION_HABILITADA }
  })
})

describe('partePedidoPanel · llaves y entrada', () => {
  it('llave de escribir apagada ⇒ 409 antes de leer nada', async () => {
    const { r, sqls } = correr({ paso: 'proponer' }, { escribir: false })
    expect(await r).toMatchObject({ status: 409 })
    expect(sqls).toEqual([])
  })
  it('sin paso, o precios inventados ⇒ 400', async () => {
    expect(await correr({}).r).toMatchObject({ status: 400 })
    expect(await correr({ paso: 'proponer', monto: 100, precios: 'otros' }).r).toMatchObject({ status: 400 })
  })
})
