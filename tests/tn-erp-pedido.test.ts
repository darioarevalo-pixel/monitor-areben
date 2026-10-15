// El webhook del pedido de TN (app «Areben ERP») ⇒ dispara el workflow del motor para esa tienda.
//
// 🔑 La firma se fija con vectores de `openssl dgst -sha256 -hmac` (la fórmula de la doc de TN, en HEX),
// ⛔ con `firmaValida`: el mailer firmó y verificó con el mismo código equivocado y rechazó todo un mes.
import { describe, it, expect, vi } from 'vitest'
import { firmaValida, queHacer, disparoDe } from '../lib/tn-erp/pedido.core.js'
import handler from '../api/_tn-erp.js'

const SECRETO = 'secreto-de-prueba-tn'
// printf '%s' "$CUERPO" | openssl dgst -sha256 -hmac 'secreto-de-prueba-tn'
const PAGADO = '{"store_id": 1096065, "event": "order/paid", "id": 1830000123}'
const FIRMA_PAGADO = 'c67396eaf934d0b8e640550c950bd96be05b3ec0bb45906424773c1cf50cb75a'
const CANCELADO = '{"store_id": 4445369, "event": "order/cancelled", "id": 77}'
const FIRMA_CANCELADO = '539f3cc8fb1de57af8fef06b494a2f1ec8a15a85ec8e0ac1a251ff9b962cfdaf'

describe('firmaValida', () => {
  it('acepta la firma HEX de openssl (también en mayúsculas) y rechaza el resto', () => {
    expect(firmaValida(Buffer.from(PAGADO), FIRMA_PAGADO, SECRETO)).toBe(true)
    expect(firmaValida(Buffer.from(PAGADO), FIRMA_PAGADO.toUpperCase(), SECRETO)).toBe(true)
    expect(firmaValida(Buffer.from(CANCELADO), FIRMA_CANCELADO, SECRETO)).toBe(true)
    expect(firmaValida(Buffer.from(PAGADO), FIRMA_CANCELADO, SECRETO)).toBe(false)
    expect(firmaValida(Buffer.from(PAGADO), FIRMA_PAGADO, 'otro')).toBe(false)
    // El cuerpo reserializado (sin los espacios) ya ⛔ es el que se firmó.
    expect(firmaValida(Buffer.from(JSON.stringify(JSON.parse(PAGADO))), FIRMA_PAGADO, SECRETO)).toBe(false)
    expect(firmaValida(Buffer.from(PAGADO), undefined, SECRETO)).toBe(false)
    expect(firmaValida(Buffer.from(PAGADO), FIRMA_PAGADO, undefined)).toBe(false)
  })
})

describe('queHacer', () => {
  it('pago y cancelación de las 3 tiendas disparan; otro evento u otra tienda, no', () => {
    expect(queHacer(JSON.parse(PAGADO))).toEqual({ disparar: true, tienda: 'bdi', evento: 'order/paid', pedido: '1830000123' })
    expect(queHacer({ store_id: 7516263, event: 'order/cancelled', id: 1 })).toMatchObject({ disparar: true, tienda: 'stunned' })
    expect(queHacer({ store_id: 1096065, event: 'order/updated', id: 1 }).disparar).toBe(false)
    expect(queHacer({ store_id: 999, event: 'order/paid', id: 1 }).disparar).toBe(false)
  })
})

/** Como llega a un handler de Vercel: el cuerpo se repone en on('data')/on('end'); `body` es OTRO a propósito. */
function reqDe(cuerpo: string, headers: Record<string, string> = {}, method = 'POST') {
  const oyentes: Record<string, (x?: unknown) => void> = {}
  const req = {
    method,
    query: { accion: 'pedido' },
    headers,
    body: { store_id: 1, event: 'otro' },
    on(ev: string, fn: (x?: unknown) => void) {
      oyentes[ev] = fn
      if (ev === 'end') queueMicrotask(() => { oyentes.data?.(Buffer.from(cuerpo)); oyentes.end?.() })
      return req
    },
  }
  return req
}
function resDe() {
  const r = { codigo: 0, cuerpo: null as unknown, status(c: number) { r.codigo = c; return r }, json(j: unknown) { r.cuerpo = j; return r } }
  return r
}
const env = { TN_ERP_CLIENT_SECRET: SECRETO, MOTOR_DISPATCH_TOKEN: 'tok' }

describe('handler accion=pedido', () => {
  it('firma buena ⇒ dispara tn.yml con comando pedidos y SÓLO esa tienda', async () => {
    const fetchImpl = vi.fn(async () => ({ status: 204 }))
    const res = resDe()
    await handler(reqDe(PAGADO, { 'x-linkedstore-hmac-sha256': FIRMA_PAGADO }), res, { env, fetchImpl })
    expect(res.codigo).toBe(200)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, { body: string; headers: Record<string, string> }]
    expect(url).toBe('https://api.github.com/repos/brunoarevalo-arbn/areben-motor/actions/workflows/tn.yml/dispatches')
    expect(JSON.parse(init.body)).toEqual({ ref: 'main', inputs: { comando: 'pedidos', tienda: 'bdi' } })
    expect(init.headers.authorization).toBe('Bearer tok')
  })

  it('firma mala ⇒ 401 y ⛔ dispara', async () => {
    const fetchImpl = vi.fn()
    const res = resDe()
    await handler(reqDe(PAGADO, { 'x-linkedstore-hmac-sha256': FIRMA_CANCELADO }), res, { env, fetchImpl })
    expect(res.codigo).toBe(401)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('evento que no cambia la venta ⇒ 200 sin disparar (TN ⛔ reintenta)', async () => {
    const cuerpo = '{"store_id":1096065,"event":"order/updated","id":5}'
    const firma = (await import('node:crypto')).createHmac('sha256', SECRETO).update(cuerpo).digest('hex')
    const fetchImpl = vi.fn()
    const res = resDe()
    await handler(reqDe(cuerpo, { 'x-linkedstore-hmac-sha256': firma }), res, { env, fetchImpl })
    expect(res.codigo).toBe(200)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('sin configurar o GitHub que falla ⇒ 503 (TN reintenta; el cron cubre)', async () => {
    const res1 = resDe()
    await handler(reqDe(PAGADO, { 'x-linkedstore-hmac-sha256': FIRMA_PAGADO }), res1, { env: {}, fetchImpl: vi.fn() })
    expect(res1.codigo).toBe(503)
    const res2 = resDe()
    await handler(reqDe(PAGADO, { 'x-linkedstore-hmac-sha256': FIRMA_PAGADO }), res2, { env, fetchImpl: vi.fn(async () => ({ status: 404 })) })
    expect(res2.codigo).toBe(503)
  })

  it('disparoDe ⛔ mete el token en la URL ni en el cuerpo', () => {
    const { url, init } = disparoDe('zattia', 'secreto-token')
    expect(url).not.toContain('secreto-token')
    expect(init.body).not.toContain('secreto-token')
  })
})
