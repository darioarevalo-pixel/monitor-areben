// El ticket de Stunned al ERP: se toma la venta, se anota en el motor y queda `en_erp`; si el motor falla queda
// `error` y se reintenta; ⛔ jamás va a GN (ni `enviarVenta` la acepta).
import { describe, it, expect } from 'vitest'
import { enviarVentaErp } from '../lib/caja/enviar-erp.core.js'
import { enviarVenta } from '../lib/caja/enviar.core.js'
import { resumenTurno } from '../lib/caja/cierre.core.js'

type Fila = Record<string, unknown>
/* eslint-disable @typescript-eslint/no-explicit-any -- el cliente falso encadena como supabase */
function baseFalsa(inicial: Fila) {
  const f: Fila = { ...inicial }
  const sb = {
    from: () => {
      let cambios: Fila | null = null; const filtros: Array<(x: Fila) => boolean> = []
      const q: any = {
        update(c: Fila) { cambios = c; return q },
        select() { return q },
        eq(k: string, v: unknown) { filtros.push((x) => x[k] === v); return q },
        neq(k: string, v: unknown) { filtros.push((x) => x[k] !== v); return q },
        in(k: string, vs: unknown[]) { filtros.push((x) => vs.includes(x[k])); return q },
        lt() { filtros.push(() => false); return q },
        maybeSingle: async () => { if (!filtros.every((g) => g(f))) return { data: null, error: null }; if (cambios) Object.assign(f, cambios); return { data: { ...f }, error: null } },
        single: async () => ({ data: { ...f }, error: null }),
      }
      return q
    },
  }
  return { sb, f }
}
const venta = { id: 'v1', estado: 'borrador', destino: 'erp', intentos: 0 }

describe('enviarVentaErp', () => {
  it('anota en el motor y queda en_erp', async () => {
    const { sb, f } = baseFalsa(venta); let llamadas = 0
    const r = await enviarVentaErp({ ...venta }, { sb, registrar: async () => { llamadas++; return { ok: true } } })
    expect(llamadas).toBe(1); expect(f.estado).toBe('en_erp'); expect(r.venta.estado).toBe('en_erp'); expect(r.reintentable).toBe(false)
  })
  it('si el motor falla queda en error y reintentable (⛔ cae a GN)', async () => {
    const { sb, f } = baseFalsa(venta)
    const r = await enviarVentaErp({ ...venta }, { sb, registrar: async () => ({ ok: false, error: 'SIN_STOCK: no está' }) })
    expect(f.estado).toBe('error'); expect(f.ultimo_error).toMatch(/SIN_STOCK/); expect(r.reintentable).toBe(true)
  })
  it('si el registrar LANZA también queda en error', async () => {
    const { sb, f } = baseFalsa(venta)
    await enviarVentaErp({ ...venta }, { sb, registrar: async () => { throw new Error('timeout') } })
    expect(f.estado).toBe('error')
  })
  it('una venta que ya está en_erp ⛔ se anota dos veces', async () => {
    const { sb } = baseFalsa({ ...venta, estado: 'en_erp' }); let llamadas = 0
    await enviarVentaErp({ ...venta, estado: 'en_erp' }, { sb, registrar: async () => { llamadas++; return { ok: true } } })
    expect(llamadas).toBe(0)
  })
  it('una de GN no entra por acá, y una del ERP no entra a GN', async () => {
    const { sb } = baseFalsa(venta)
    await expect(enviarVentaErp({ ...venta, destino: 'gn' }, { sb, registrar: async () => ({ ok: true }) })).rejects.toThrow(/GN/)
    await expect(enviarVenta({ ...venta, payload: {} }, { sb, gnFetch: async () => { throw new Error('NO DEBE LLAMAR A GN') }, base: 'x', token: 't' })).rejects.toThrow(/ERP/)
  })
})

describe('resumenTurno con ventas del ERP', () => {
  const reglas = { cuentas: { 12921: { nombre: 'Efectivo', efectivo: true } } }
  const mk = (id: string, extra: Fila = {}) => ({ id, estado: 'en_erp', total: 100, pagos: [{ cuenta: 12921, monto: 100 }], creada_en: '2026-11-01T15:00:00Z', ...extra })
  it('suma el efectivo y NO la lista como pendiente de GN', () => {
    const r = resumenTurno({ turno: { fondo: 0 }, ventas: [mk('a')], movs: [], reglas, nombres: {}, cobrosGN: [], anuladasGN: [] })
    expect(r.efectivo.cobrado).toBe(100); expect(r.sinGN).toHaveLength(0); expect(r.ventas).toBe(1)
  })
  it('la anulada del ERP deja de sumar y se lista aparte', () => {
    const r = resumenTurno({ turno: { fondo: 0 }, ventas: [mk('a'), mk('b', { anulada: { por: 'ana', en: 'x' } })], movs: [], reglas, nombres: {}, cobrosGN: [], anuladasGN: [] })
    expect(r.efectivo.cobrado).toBe(100); expect(r.anuladasGN).toHaveLength(1)
  })
})

describe('cierres de la Caja por marca (Stunned)', () => {
  it('el ticket de Stunned está APAGADO: ⛔ se pide al mailer y queda anotado', async () => {
    const { sb } = baseFalsa({ ...venta, store: 'zattia', email: 'a@b.co', renglones: [], pagos: [], subtotal: 1, total: 1 })
    const pedidos: Array<{ url: string; cuerpo: any }> = []
    const fetchFalso = (async (url: string, init: any) => { pedidos.push({ url, cuerpo: JSON.parse(init.body) }); return { status: 200, text: async () => '{"encolado":true}' } }) as unknown as typeof fetch
    const r = await enviarVentaErp({ ...venta, store: 'zattia', email: 'a@b.co' }, { sb, registrar: async () => ({ ok: true }), mailer: { url: 'http://m', key: 'k', fetch: fetchFalso } })
    expect(pedidos).toHaveLength(0); expect(r.venta.ticket_mail).toBe('apagado: Stunned sin remitente')
  })
  it('si la venta queda en error ⛔ sale el mail', async () => {
    const { sb } = baseFalsa({ ...venta, store: 'zattia', email: 'a@b.co' }); let n = 0
    const fetchFalso = (async () => { n++; return { status: 200, text: async () => '{}' } }) as unknown as typeof fetch
    await enviarVentaErp({ ...venta, store: 'zattia', email: 'a@b.co' }, { sb, registrar: async () => ({ ok: false, error: 'x' }), mailer: { url: 'http://m', key: 'k', fetch: fetchFalso } })
    expect(n).toBe(0)
  })
  it('anular en el ERP escribe `anulada` SÓLO en la fila del ERP y sin pisar una ya anotada', async () => {
    const { anotarAnuladaDelErp } = await import('../lib/caja/anulada-erp.core.js')
    const visto: Record<string, unknown> = {}; const eq: Array<[string, unknown]> = []; const es: string[] = []
    const q: any = {
      update(c: unknown) { visto.cambios = c; return q },
      eq(k: string, v: unknown) { eq.push([k, v]); return q },
      is(k: string) { es.push(k); return q },
      select: async () => ({ data: [{ id: 'v1' }], error: null }),
    }
    const r = await anotarAnuladaDelErp({ from: (t: string) => { visto.tabla = t; return q } }, 'v1', { por: 'Bruno', motivo: 'se equivocó', ahora: new Date('2026-10-26T15:00:00Z') })
    expect(r.anotada).toBe(true); expect(visto.tabla).toBe('caja_venta')
    expect(visto.cambios).toEqual({ anulada: { por: 'Bruno', en: '2026-10-26T15:00:00.000Z', motivo: 'se equivocó' } })
    expect(eq).toEqual([['id', 'v1'], ['destino', 'erp']]); expect(es).toEqual(['anulada'])
  })
})
