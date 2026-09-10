import { describe, it, expect } from 'vitest'
import { normCodigo, pareceCodigo } from '@/lib/sesionfotos/codigo'
import { codigoDeItem, mapaDeCodigos, vincularItem, vincularSolicitud, vincularSolicitudes } from '@/lib/sesionfotos/vincular'
import type { ItemSolicitud, Solicitud } from '@/lib/sesionfotos/tipos'

/**
 * El caso real que abrió esto (Zattia, 2-sep-2026): 152 prendas cargadas por el campo «Cargalo sin
 * código» escaneando el SKU ⇒ `nombre` = el código, `sku: ''`, sin `barcode`. Medido contra la base:
 * 150 de 152 cruzan con una variante real. Los datos de acá son de esa medición.
 */
const VARIANTES = [
  { id: '1087920_229042', pid: '1087920', sid: '229042', name: 'VESTIDO BLAZE', size: 'NEGRO', sku: 'RVE-0047-NG', barcode: 'RVE0047NG' },
  { id: '1087906_251978', pid: '1087906', sid: '251978', name: 'TOP WIX', size: 'S - BLANCO', sku: 'RTO-0380-BL-S', barcode: 'RTO0380BLS' },
  { id: '1087864_76579', pid: '1087864', sid: '76579', name: 'BERMUDA SEOUL', size: '36', sku: 'RBE-0022-36', barcode: 'RBE002236' },
]

function manual(over: Partial<ItemSolicitud> = {}): ItemSolicitud {
  return { vid: 'man_m1', pid: null, sid: null, nombre: 'RVE0047NG', variante: '', sku: '', qty: 1, origen: 'deposito', nuevo: true, manual: true, ...over }
}
function sol(items: ItemSolicitud[], over: Partial<Solicitud> = {}): Solicitud {
  return { id: 's1', fecha: '2026-09-02', creado: 1, creadoPor: 'lorena', descripcion: '', estado: 'pendiente', items, ...over }
}

describe('pareceCodigo · qué es un código y qué escribió una persona', () => {
  it.each(['RVE0047NG', 'RTO-0380-BL-S', 'RSH010436', 'SKR0001S', '7102-SS26-42C', '2614047'])('«%s» es un código', (t) => {
    expect(pareceCodigo(t)).toBe(true)
  })
  it.each(['Remera estampa X', 'S-mail grey - XL', 'BABY TEE', 'Remera Essentials - M', '', '  ', 'ab'])('«%s» NO es un código', (t) => {
    expect(pareceCodigo(t)).toBe(false)
  })
  it('el SKU con guiones y su código de barras normalizan igual', () => {
    expect(normCodigo('RVE-0047-NG')).toBe(normCodigo('rve0047ng'))
  })
})

describe('mapaDeCodigos', () => {
  it('indexa por barcode y por SKU', () => {
    const m = mapaDeCodigos(VARIANTES)
    expect(m.get('RVE0047NG')?.id).toBe('1087920_229042')
    expect(m.get('RTO0380BLS')?.id).toBe('1087906_251978')
  })

  it('🔴 una clave que cae en DOS variantes se descarta, no se elige una', () => {
    const m = mapaDeCodigos([
      { id: 'a', pid: '1', sid: '1', sku: 'F-0137-17-PM', barcode: 'F013717PM' },
      { id: 'b', pid: '2', sid: '2', sku: 'F013717PM', barcode: '99999' },
    ])
    expect(m.has('F013717PM')).toBe(false)
    expect(m.get('99999')?.id).toBe('b') // lo no ambiguo sobrevive
  })
})

describe('codigoDeItem', () => {
  it('el barcode manda cuando está', () => {
    expect(codigoDeItem(manual({ barcode: 'RBE002236', nombre: 'BERMUDA SEOUL' }))).toBe('RBE002236')
  })
  it('si no hay barcode usa el nombre, pero sólo si tiene forma de código', () => {
    expect(codigoDeItem(manual({ nombre: 'RVE0047NG' }))).toBe('RVE0047NG')
    expect(codigoDeItem(manual({ nombre: 'Remera estampa X' }))).toBe(null)
  })
})

describe('vincularItem', () => {
  const mapa = mapaDeCodigos(VARIANTES)

  it('completa la identidad de un «a mano» cuyo nombre es el código', () => {
    const i = vincularItem(manual(), mapa)
    expect(i).toMatchObject({
      pid: '1087920',
      sid: '229042',
      nombre: 'VESTIDO BLAZE',
      variante: 'NEGRO',
      sku: 'RVE-0047-NG',
      barcode: 'RVE0047NG',
      pendiente: false,
      vinculado: true,
    })
  })

  it('🔴 NO toca el vid: verif/devuelto/fotos están indexados por ahí', () => {
    expect(vincularItem(manual({ vid: 'man_m1788351499607_96083' }), mapa).vid).toBe('man_m1788351499607_96083')
  })

  it('🔴 NO deja de ser «a mano» ni «nuevo»: sigue sin venta en GN (decisión de Bruno)', () => {
    const i = vincularItem(manual(), mapa)
    expect(i.manual).toBe(true)
    expect(i.nuevo).toBe(true)
  })

  it('un nombre que NO es un código se deja como está', () => {
    const i = manual({ nombre: 'Remera estampa X' })
    expect(vincularItem(i, mapa)).toBe(i)
  })

  it('un código que no existe en GN igual queda escaneable: viaja a barcode, sin inventar el sku', () => {
    const i = vincularItem(manual({ nombre: 'RMI0055CR' }), mapa)
    expect(i.barcode).toBe('RMI0055CR')
    expect(i.sku).toBe('')
    expect(i.vinculado).toBeUndefined()
  })

  it('un «bc_» pendiente se vincula por su barcode (paridad con sfVincularNuevos del legacy)', () => {
    const i = vincularItem(
      { vid: 'bc_RBE002236', pid: null, sid: null, nombre: '(nuevo sin cargar)', variante: '', sku: '', barcode: 'RBE002236', qty: 1, origen: 'deposito', nuevo: true, pendiente: true },
      mapa,
    )
    expect(i).toMatchObject({ nombre: 'BERMUDA SEOUL', variante: '36', sku: 'RBE-0022-36', pendiente: false, vinculado: true })
  })

  it('una variante real (no «nuevo») no se toca nunca', () => {
    const i: ItemSolicitud = { vid: '1087920_229042', pid: '1087920', sid: '229042', nombre: 'VESTIDO BLAZE', variante: 'NEGRO', sku: 'RVE-0047-NG', qty: 1, origen: 'deposito' }
    expect(vincularItem(i, mapa)).toBe(i)
  })

  it('es idempotente: vincular dos veces devuelve el MISMO objeto', () => {
    const uno = vincularItem(manual(), mapa)
    expect(vincularItem(uno, mapa)).toBe(uno)
  })
})

describe('vincularSolicitud / vincularSolicitudes', () => {
  const mapa = mapaDeCodigos(VARIANTES)

  it('devuelve la MISMA solicitud si ningún ítem cambió', () => {
    const s = sol([manual({ nombre: 'Remera estampa X' })])
    expect(vincularSolicitud(s, mapa)).toBe(s)
  })

  it('conserva verif y devuelto, porque el vid no se movió', () => {
    const s = sol([manual({ vid: 'man_a' })], { verif: { man_a: 1 }, devuelto: { man_a: 1 } })
    const ns = vincularSolicitud(s, mapa)
    expect(ns.verif).toEqual({ man_a: 1 })
    expect(ns.devuelto).toEqual({ man_a: 1 })
    expect(ns.items[0].sku).toBe('RVE-0047-NG')
  })

  it('cambios cuenta solicitudes, y con 0 devuelve el mismo array (no se guarda nada)', () => {
    const quietas = [sol([manual({ nombre: 'BABY TEE' })])]
    const r0 = vincularSolicitudes(quietas, mapa)
    expect(r0.cambios).toBe(0)
    expect(r0.sols).toBe(quietas)

    const r1 = vincularSolicitudes([...quietas, sol([manual()], { id: 's2' })], mapa)
    expect(r1.cambios).toBe(1)
    expect(r1.sols[0]).toBe(quietas[0])
  })

  it('⚠️ Solicitudes internas: sin ítems «nuevo» no hay nada que hacer', () => {
    const internas = [sol([{ vid: '1_2', pid: '1', sid: '2', nombre: 'TOP', variante: 'M', sku: 'T-M', qty: 1, origen: 'local' }], { tipo: 'retornable' })]
    expect(vincularSolicitudes(internas, mapa).cambios).toBe(0)
  })
})
