/**
 * El lote de facturación con la base y ARCA simulados — sobre todo los cortes, que en la realidad no
 * se pueden provocar a voluntad y son los que duplican una factura o la pierden.
 * El ARCA falso numera como el de verdad: «el último + 1», sin huecos, y rechaza lo que no sigue.
 */
import { describe, it, expect } from 'vitest'
import { facturarLote, resolverPendientes, POR_PEDIDO } from '../lib/arca/lote.core.js'
import { CBTE, COND_IVA, DOC } from '../lib/arca/arca.core.js'

const HOY = '2026-10-12'
const REGLAS = { umbralIdentificar: 10_000_000, hoy: HOY }
const CF = { docTipo: DOC.SIN_IDENTIFICAR, docNro: 0, condicionIva: COND_IVA.CONSUMIDOR_FINAL }
const venta = (ventaId: string | number, total: number) => ({ ventaId, tipo: CBTE.FACTURA_B, fecha: HOY, total, receptor: CF })

type Reg = { numero: number, total: number, fecha: string, docTipo: number, docNro: number, cae: string }

function arcaFalso() {
  const emitidos: Reg[] = []
  let corte: 'antes' | 'despues' | null = null
  let rechazar = new Set<number>()
  let caes = 0
  return {
    emitidos,
    cortar(cuando: 'antes' | 'despues') { corte = cuando },
    rechazarTotal(t: number) { rechazar = new Set([t]) },
    async ultimo() { return emitidos.length },
    async solicitar({ desde, comprobantes }: { desde: number, comprobantes: Array<{ total: number, fecha: string, receptor: typeof CF }> }) {
      if (corte === 'antes') { corte = null; throw Object.assign(new Error('corte'), { corte: true }) }
      if (desde !== emitidos.length + 1) throw new Error(`10016 número fuera de orden: ${desde}`)
      const detalles = []
      let n = desde
      for (const c of comprobantes) {
        if (rechazar.has(c.total)) { detalles.push({ numero: n, resultado: 'R', cae: null, observaciones: [{ codigo: 10015, mensaje: 'no' }] }); continue }
        const cae = String(70000000000000 + ++caes)
        emitidos.push({ numero: n, total: c.total, fecha: c.fecha, docTipo: c.receptor.docTipo, docNro: Number(c.receptor.docNro), cae })
        detalles.push({ numero: n, resultado: 'A', cae, caeVence: '2026-10-22', observaciones: [] })
        n++
      }
      if (corte === 'despues') { corte = null; throw Object.assign(new Error('corte'), { corte: true }) }
      return { resultado: 'A', errores: [], detalles }
    },
    async consultar(_pv: number, _t: number, numero: number) {
      const r = emitidos.find((e) => e.numero === numero)
      return r ? { ...r, resultado: 'A', caeVence: '2026-10-22' } : null
    },
  }
}

type Fila = { [k: string]: unknown, id?: string, estado?: string, numero?: number | null, tipo?: number, pto_vta?: number, venta_id?: string }
type Clave = { ambiente: string, ptoVta: number, tipo: number, lote?: string }

function repoFalso() {
  const filas: Fila[] = []
  const candados = new Map<string, string>()
  const k = (a: Clave) => `${a.ambiente}|${a.ptoVta}|${a.tipo}`
  return {
    filas, candados,
    async tomarCandado(a: Clave) { if (candados.has(k(a))) return false; candados.set(k(a), String(a.lote)); return true },
    async soltarCandado(a: Clave) { if (candados.get(k(a)) === a.lote) candados.delete(k(a)) },
    async reservadas({ ptoVta, tipo }: Clave) { return filas.filter((f) => f.estado === 'reservada' && f.pto_vta === ptoVta && f.tipo === tipo) },
    async ventasFacturadas({ ventaIds }: { ventaIds: Array<string | number> }) {
      return new Set(filas.filter((f) => f.estado !== 'rechazada' && ventaIds.map(String).includes(String(f.venta_id))).map((f) => String(f.venta_id)))
    },
    async reservar(nuevas: Fila[]) {
      for (const n of nuevas) {
        if (filas.some((f) => f.numero !== null && f.numero === n.numero && f.tipo === n.tipo)) throw new Error('23505 número repetido')
        filas.push({ ...n })
      }
    },
    async resolver(id: string, cambios: Partial<Fila>) { const f = filas.find((x) => x.id === id && x.estado === 'reservada'); if (f) Object.assign(f, cambios) },
  }
}

const correr = (arca: ReturnType<typeof arcaFalso>, repo: ReturnType<typeof repoFalso>, comprobantes: Array<ReturnType<typeof venta>>) => facturarLote({
  arca, repo, ambiente: 'homologacion', marca: 'zattia', ptoVta: 1, tipo: CBTE.FACTURA_B,
  comprobantes, reglas: REGLAS, lote: crypto.randomUUID(), usuario: 'test',
})

describe('facturarLote', () => {
  it('numera correlativo, guarda el CAE y suelta el candado', async () => {
    const arca = arcaFalso(), repo = repoFalso()
    const r = await correr(arca, repo, [venta(1, 100), venta(2, 200), venta(3, 300)])
    expect(r.autorizadas.map((f) => f.numero)).toEqual([1, 2, 3])
    expect(repo.filas.every((f) => f.estado === 'autorizada' && f.cae)).toBe(true)
    expect(repo.candados.size).toBe(0)
  })

  it('lo que no pasa la validación ⛔ toma número', async () => {
    const arca = arcaFalso(), repo = repoFalso()
    const r = await correr(arca, repo, [venta(1, 100), venta(2, 20_000_000), { ...venta(3, 50), ventaId: '' }])
    expect(r.autorizadas.map((f) => f.venta_id)).toEqual(['1'])
    expect(r.noSalen.map((c) => c.motivos.join())).toEqual([expect.stringMatching(/DNI o CUIT/), 'Falta la venta'])
    expect(repo.filas).toHaveLength(1)
  })

  it('🔴 la misma venta dos veces en el mismo lote sale una sola vez', async () => {
    const arca = arcaFalso(), repo = repoFalso()
    const r = await correr(arca, repo, [venta(1, 100), venta(2, 200), venta(1, 100)])
    expect(r.autorizadas.map((f) => f.venta_id)).toEqual(['1', '2'])
    expect(r.noSalen.map((c) => c.motivos[0])).toEqual(['La venta está repetida en el lote'])
    expect(arca.emitidos).toHaveLength(2)
  })

  it('una venta ya facturada no se factura dos veces', async () => {
    const arca = arcaFalso(), repo = repoFalso()
    await correr(arca, repo, [venta(1, 100)])
    const r = await correr(arca, repo, [venta(1, 100), venta(2, 200)])
    expect(r.noSalen.map((c) => c.motivos[0])).toEqual(['La venta ya tiene factura'])
    expect(arca.emitidos).toHaveLength(2)
  })

  it('🔴 corte DESPUÉS de que ARCA autorizó: se recupera el CAE, ⛔ se duplica', async () => {
    const arca = arcaFalso(), repo = repoFalso()
    arca.cortar('despues')
    const r = await correr(arca, repo, [venta(1, 100), venta(2, 200)])
    expect(r.autorizadas.map((f) => f.cae)).toEqual(arca.emitidos.map((e) => e.cae))
    expect(arca.emitidos).toHaveLength(2)
    expect(repo.filas.every((f) => f.estado === 'autorizada')).toBe(true)
    // Y volver a mandarlas no las vuelve a emitir.
    await correr(arca, repo, [venta(1, 100), venta(2, 200)])
    expect(arca.emitidos).toHaveLength(2)
  })

  it('🔴 corte ANTES de llegar: se liberan los números y el próximo lote los usa', async () => {
    const arca = arcaFalso(), repo = repoFalso()
    arca.cortar('antes')
    const r = await correr(arca, repo, [venta(1, 100)])
    expect(r.autorizadas).toEqual([])
    expect(r.rechazadas[0].motivos).toEqual(['No llegó a ARCA'])
    expect(repo.filas[0]).toMatchObject({ estado: 'rechazada', numero: null })
    const r2 = await correr(arca, repo, [venta(1, 100)])
    expect(r2.autorizadas.map((f) => f.numero)).toEqual([1])
  })

  it('🔴 una corrida que murió con filas reservadas: la siguiente las resuelve PRIMERO', async () => {
    const arca = arcaFalso(), repo = repoFalso()
    // Simula la función muerta: ARCA autorizó el 1, la fila quedó reservada y nadie soltó nada útil.
    await arca.solicitar({ desde: 1, comprobantes: [venta(9, 900)] })
    repo.filas.push({ id: 'x', venta_id: '9', tipo: CBTE.FACTURA_B, pto_vta: 1, numero: 1, fecha: HOY, total: 900, doc_tipo: 99, doc_nro: 0, estado: 'reservada' })
    const r = await correr(arca, repo, [venta(9, 900), venta(10, 1000)])
    expect(r.resueltasDeAntes.autorizadas.map((f: Fila) => f.venta_id)).toEqual(['9'])
    expect(r.noSalen.map((c) => c.ventaId)).toEqual([9])
    expect(r.autorizadas.map((f) => f.numero)).toEqual([2])
    expect(arca.emitidos).toHaveLength(2)
  })

  it('🔴 si ARCA tiene el número con OTRO contenido (otro sistema en el mismo PV), frena', async () => {
    const arca = arcaFalso(), repo = repoFalso()
    await arca.solicitar({ desde: 1, comprobantes: [venta(99, 555)] }) // GN, por ejemplo
    repo.filas.push({ id: 'x', venta_id: '9', tipo: CBTE.FACTURA_B, pto_vta: 1, numero: 1, fecha: HOY, total: 900, doc_tipo: 99, doc_nro: 0, estado: 'reservada' })
    await expect(correr(arca, repo, [venta(10, 1000)])).rejects.toThrow(/OTRO contenido/)
    expect(arca.emitidos).toHaveLength(1)
    expect(repo.candados.size).toBe(0)
  })

  it('un rechazo ⛔ consume número', async () => {
    const arca = arcaFalso(), repo = repoFalso()
    arca.rechazarTotal(200)
    const r = await correr(arca, repo, [venta(1, 200)])
    expect(r.rechazadas[0]).toMatchObject({ estado: 'rechazada', numero: null })
    const r2 = await correr(arca, repo, [venta(2, 300)])
    expect(r2.autorizadas[0].numero).toBe(1)
  })

  it('con el candado tomado no arranca, y no reserva nada', async () => {
    const arca = arcaFalso(), repo = repoFalso()
    repo.candados.set('homologacion|1|6', 'otro')
    await expect(correr(arca, repo, [venta(1, 100)])).rejects.toThrow(/otro lote/)
    expect(repo.filas).toEqual([])
  })

  it('si algo explota, el candado se suelta igual', async () => {
    const arca = arcaFalso(), repo = repoFalso()
    arca.solicitar = async () => { throw new Error('600 token vencido') }
    await expect(correr(arca, repo, [venta(1, 100)])).rejects.toThrow(/600/)
    expect(repo.candados.size).toBe(0)
  })

  it(`más de ${POR_PEDIDO} se parten en pedidos, sin huecos`, async () => {
    const arca = arcaFalso(), repo = repoFalso()
    const muchas = Array.from({ length: POR_PEDIDO + 5 }, (_, i) => venta(i + 1, 100 + i))
    const r = await correr(arca, repo, muchas)
    expect(r.autorizadas.map((f) => f.numero)).toEqual(muchas.map((_, i) => i + 1))
  })
})

describe('resolverPendientes', () => {
  it('sin pendientes no le pregunta nada a ARCA', async () => {
    const arca = arcaFalso(), repo = repoFalso()
    arca.consultar = async () => { throw new Error('no debería consultar') }
    expect(await resolverPendientes({ arca, repo, ambiente: 'homologacion', ptoVta: 1, tipo: CBTE.FACTURA_B }))
      .toEqual({ autorizadas: [], perdidas: [], ajenas: [] })
  })
})
