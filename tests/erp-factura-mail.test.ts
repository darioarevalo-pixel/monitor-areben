/* eslint-disable @typescript-eslint/no-explicit-any -- dobles de prueba de sb, pg y fetch */
/**
 * «Enviar por mail» la factura del cliente mayorista (Darío §5; Bruno 31-oct). Lo que no se ve si falla: la factura de OTRO
 * cliente mandada a éste, una factura de PRUEBA llegándole a un cliente, el número o el total del mail tomados del pedido
 * (⛔ de la base), un PDF que la validación de entrada corta por largo, o el resto del cuerpo sin tope.
 */
import { describe, it, expect } from 'vitest'
import { enviarFacturaPanel } from '../api/_erp-factura-mayorista.js'
import { entradaInvalida } from '../lib/erp/entrada.core.js'
import { pedirFacturaPorMail } from '../lib/mailer/factura.core.js'

const CLI = '0b5e7a52-6d1c-4b8e-9a51-2f6c7d8e9f01'
const FAC = '1c6f8b63-7e2d-4c9f-8b62-3a7d8e9f0a12'
const PDF = Buffer.from('%PDF-1.3\nx').toString('base64')
const FILA = { id: FAC, ambiente: 'produccion', marca: 'bdi', tipo: 1, pto_vta: 2, numero: 7, fecha: '2026-10-31', total: 150000, estado: 'autorizada', cliente_id: CLI }

/** Un `sb` que filtra de verdad por las columnas pedidas (si la puerta ⛔ filtra por cliente, la factura de otro aparece). */
function sbCon(filas: any[]) {
  return {
    from: () => {
      const filtros: Array<[string, unknown]> = []
      const q: any = {
        select: () => q,
        eq: (k: string, v: unknown) => { filtros.push([k, v]); return q },
        limit: async () => ({ data: filas.filter((f) => filtros.every(([k, v]) => f[k] === v)), error: null }),
      }
      return q
    },
  }
}
const conMotor = async (_m: string, _q: string, fn: any) => fn({ query: async () => ({ rows: [{ id: CLI, nombre: 'Pepe', razon_social: 'Ferretería Pepe SRL' }] }) })

function deps(over: any = {}) {
  const enviados: any[] = []
  const mailer = { url: 'https://mailer', key: 'k', fetch: async (_u: string, init: any) => { enviados.push(JSON.parse(init.body)); return new Response(JSON.stringify({ ok: true, id: 'm1', de: 'info@bdiaccesorios.com.ar' }), { status: 200 }) } }
  return { d: { prendido: true, ambiente: 'produccion', sb: sbCon([FILA]), conMotor, mailer, ...over }, enviados }
}
const body = (x: any = {}) => ({ clienteId: CLI, facturaId: FAC, para: 'Cliente@Ejemplo.com', pdf: PDF, ...x })

describe('enviarFacturaPanel', () => {
  it('manda con el número, el total y la fecha de la BASE, y la razón social de la ficha', async () => {
    const { d, enviados } = deps()
    const r = await enviarFacturaPanel({ body: body({ total: 1, comprobante: 'B 99999-99999999' }) }, d)
    expect(r).toMatchObject({ ok: true, comprobante: 'A 00002-00000007', para: 'cliente@ejemplo.com' })
    expect(enviados[0]).toMatchObject({ marca: 'bdi', comprobante: 'A 00002-00000007', total: 150000, fecha: '2026-10-31', cliente: 'Ferretería Pepe SRL', pdf: PDF })
  })
  it('la factura de OTRO cliente ⇒ 404 y no sale nada', async () => {
    const { d, enviados } = deps({ sb: sbCon([{ ...FILA, cliente_id: '2d7a9c74-8f3e-4da0-9c73-4b8e9f0a1b23' }]) })
    expect(await enviarFacturaPanel({ body: body() }, d)).toMatchObject({ status: 404 })
    expect(enviados).toHaveLength(0)
  })
  it('una de PRUEBA (homologación) sólo a una casilla de la empresa', async () => {
    const fila = { ...FILA, ambiente: 'homologacion' }
    const a = deps({ ambiente: 'homologacion', sb: sbCon([fila]) })
    expect(await enviarFacturaPanel({ body: body() }, a.d)).toMatchObject({ status: 409, error: expect.stringMatching(/PRUEBA/) })
    expect(a.enviados).toHaveLength(0)
    const b = deps({ ambiente: 'homologacion', sb: sbCon([fila]) })
    expect(await enviarFacturaPanel({ body: body({ para: 'bruno@arebensrl.com' }) }, b.d)).toMatchObject({ ok: true })
  })
  it('una factura no autorizada o un mail inválido ⇒ no sale', async () => {
    const a = deps({ sb: sbCon([{ ...FILA, estado: 'reservada' }]) })
    expect(await enviarFacturaPanel({ body: body() }, a.d)).toMatchObject({ status: 409 })
    const b = deps()
    expect(await enviarFacturaPanel({ body: body({ para: 'a@b.com, c@d.com' }) }, b.d)).toMatchObject({ status: 400 })
    expect([...a.enviados, ...b.enviados]).toHaveLength(0)
  })
  it('apagado el panel ⇒ 409', async () => {
    const { d } = deps({ prendido: false })
    expect(await enviarFacturaPanel({ body: body() }, d)).toMatchObject({ status: 409 })
  })
})

describe('entrada de factura-enviar-panel', () => {
  const pdfGrande = 'A'.repeat(90_000)
  it('el PDF entra aunque pase los 5.000 caracteres del tope general', () => {
    expect(entradaInvalida({ method: 'POST', body: { accion: 'factura-enviar-panel', marca: 'bdi', ...body({ pdf: pdfGrande }) } })).toBeNull()
  })
  it('el PDF que no es base64, o el MISMO campo en otra acción, se corta', () => {
    expect(entradaInvalida({ method: 'POST', body: { accion: 'factura-enviar-panel', marca: 'bdi', ...body({ pdf: '<html>' + pdfGrande }) } })).toMatchObject({ status: 400 })
    expect(entradaInvalida({ method: 'POST', body: { accion: 'factura-libre-panel', marca: 'bdi', pdf: pdfGrande } })).toMatchObject({ status: 400 })
  })
  it('el resto del cuerpo sigue con su tope', () => {
    expect(entradaInvalida({ method: 'POST', body: { accion: 'factura-enviar-panel', marca: 'bdi', ...body({ para: 'x'.repeat(6000) }) } })).toMatchObject({ status: 400 })
  })
})

describe('pedirFacturaPorMail', () => {
  it('sin conexión ⇒ configurado:false; 404 ⇒ avisa que falta deployar el mailer; la llave ⛔ sale en el motivo', async () => {
    expect(await pedirFacturaPorMail({ fetch } as any, {} as any)).toEqual({ ok: false, configurado: false })
    const r = await pedirFacturaPorMail({ url: 'https://m', key: 'SECRETA', fetch: async () => new Response('no', { status: 404 }) } as any, {} as any)
    expect(r).toMatchObject({ ok: false, configurado: true, motivo: expect.stringMatching(/deployarlo/) })
    expect(JSON.stringify(r)).not.toContain('SECRETA')
  })
})
