import { describe, expect, it } from 'vitest'
// Núcleos en JS plano: los importa el cron (`scripts/parte-manana.mjs`) y estos tests, ⛔ la app.
import { ayerCompleto, minorista, ventaDeAyer } from '@/lib/parte/ventas.core.js'
import {
  armarUniverso, claveDe, criticos, curvaRota, ladoDeStore, paradoEnDeposito, recompra,
} from '@/lib/parte/stock.core.js'
import { abiertosPorCasilla, abiertosPorTitulo, fechaDe, limpiar } from '@/lib/parte/pendientes.core.js'
import { armarParte, asuntoDe, plataCorta } from '@/lib/parte/mail.core.js'

/**
 * El parte de la mañana (`docs/secciones/parte-manana.md`). Todo lo que produce es TEXTO que llega
 * a una bandeja: lo que se rompe acá se rompe en silencio. Lo que se ancla:
 *   - la venta es la MISMA cuenta que «Día a día», y el minorista se compara por su lado;
 *   - el depósito con espacio es depósito, y el mayorista ⛔ es stock;
 *   - «a precio lleno» es por renglón, con el piso exacto;
 *   - un día incompleto se dice;
 *   - un bloque vacío o caído aparece, ⛔ desaparece.
 */

const HOY = '2026-09-30'
const AYER = '2026-09-29'
const SEMANA = '2026-09-22'

// ── Ventas ──────────────────────────────────────────────────────────────────────────────────────

describe('la venta de ayer', () => {
  const ventas = [
    { id: 1, date_sale: AYER, channel: 'Mi Local', discount: 0, shipping_cost: 0, total_price: 1000 },
    { id: 2, date_sale: AYER, channel: 'Tienda Nube', discount: 0, shipping_cost: 0, total_price: 500 },
    { id: 3, date_sale: AYER, channel: 'Ninguno', discount: 0, shipping_cost: 0, total_price: 9999 },
    { id: 4, date_sale: SEMANA, channel: 'Mayorista', discount: 0, shipping_cost: 0, total_price: 50000 },
    { id: 5, date_sale: SEMANA, channel: 'Mi Local', discount: 0, shipping_cost: 0, total_price: 800 },
    { id: 6, date_sale: AYER, channel: 'Mi Local', discount: 0, shipping_cost: 0, total_price: -300 },
  ]
  const detalles = [
    { sale_id: 1, product_id: 10, quantity: 1, total: 1000 },
    { sale_id: 2, product_id: 20, quantity: 1, total: 500 },
    { sale_id: 3, product_id: 10, quantity: 5, total: 9999 },
    { sale_id: 4, product_id: 10, quantity: 100, total: 50000 },
    { sale_id: 5, product_id: 10, quantity: 1, total: 800 },
    { sale_id: 6, product_id: 10, quantity: -1, total: -300 },
  ]
  const skuPor = new Map([['10', 'Z-1'], ['20', 'STUNNED']])
  const v = ventaDeAyer({ base: 'zattia', ventas, detalles, skuPor, hoy: HOY, completo: true })

  it('saca la técnica y RESTA la devolución', () => {
    expect(v.minorista).toEqual({ compras: 3, unidades: 1, plata: 1200 })
  })

  it('compara el minorista contra el minorista: el mayorista de la semana pasada ⛔ se mete', () => {
    expect(v.minoristaAntes!.plata).toBe(800)
    expect(v.porCanalAntes!.mayorista.plata).toBe(50000)
  })

  it('separa Stunned por el SKU', () => {
    expect(v.lineas.stunned.facturado).toBe(500)
    expect(v.lineas.zattia.facturado).toBe(700)
  })

  it('minorista suma local + online + otros, ⛔ mayorista', () => {
    expect(minorista({ local: { compras: 1, unidades: 1, plata: 10 }, mayorista: { compras: 1, unidades: 9, plata: 99 }, otro: { compras: 1, unidades: 1, plata: 5 } }).plata).toBe(15)
  })
})

describe('¿ayer está completo?', () => {
  it('sí, si el sync `diario` corrió hoy', () => {
    expect(ayerCompleto([{ clave: 'diario', ventas_date: HOY }], HOY)).toBe(true)
  })
  it('⛔, si el sync de hoy todavía ⛔ corrió', () => {
    expect(ayerCompleto([{ clave: 'diario', ventas_date: AYER }], HOY)).toBe(false)
  })
  it('⛔ se sabe (null) si ⛔ está la fila — y null ⛔ es false', () => {
    expect(ayerCompleto([{ clave: 'inventario', ventas_date: HOY }], HOY)).toBeNull()
    expect(ayerCompleto(null, HOY)).toBeNull()
  })
})

// ── Stock ───────────────────────────────────────────────────────────────────────────────────────

describe('dónde está el stock', () => {
  it('el depósito de Zattia con espacio es depósito, el mayorista ⛔ cuenta', () => {
    expect(ladoDeStore('Deposito ')).toBe('deposito')
    expect(ladoDeStore('Deposito Minorista')).toBe('deposito')
    expect(ladoDeStore(' Local ')).toBe('local')
    expect(ladoDeStore('Deposito Mayorista')).toBeNull()
  })
})

/** Arma un universo chico: un producto crítico y uno común, con ventas en la ventana. */
function universo({ inv, lineas, productos }: {
  inv: Array<[number, number, string, number]>
  lineas: Array<{ id: number; fecha: string; canal: string; pid: number; sid: number; q: number; precio: number }>
  productos?: Array<Record<string, unknown>>
}) {
  const prods = productos || [
    { id: 1, name: 'TEMPLADO 9D', sku: 'T', category: 'VIDRIOS TEMPLADOS DE CELULAR', retailer_price: 1000 },
    { id: 2, name: 'STELLAR CASE', sku: 'S', category: 'FUNDAS', retailer_price: 1000 },
  ]
  return armarUniverso({
    base: 'bdi',
    productos: prods,
    inventario: inv.map(([pid, sid, store, q]) => ({ product_id: pid, size_id: sid, size_name: `talle ${sid}`, store_name: store, available_quantity: q })),
    ventas: lineas.map((l) => ({ id: l.id, date_sale: l.fecha, channel: l.canal })),
    detalles: lineas.map((l) => ({ sale_id: l.id, product_id: l.pid, size_id: l.sid, size: `talle ${l.sid}`, quantity: l.q, unit_price: l.precio })),
    proveedorDe: new Map([['2', 'CHINA']]),
    hoy: HOY,
  })
}

describe('lo que no puede faltar', () => {
  it('reparte en sin stock / pedir / reponer, cada variante en UN cajón', () => {
    const u = universo({
      inv: [
        [1, 1, 'Local', 0], [1, 1, 'Deposito Minorista', 0], // sin stock
        [1, 2, 'Local', 1], [1, 2, 'Deposito Minorista', 2], // 3 u. a 28 u./28 d = 3 días → pedir
        [1, 3, 'Local', 0], [1, 3, 'Deposito Minorista', 100], // local vacío, depósito lleno → reponer
        [1, 4, 'Local', 0], [1, 4, 'Deposito Mayorista', 50], // sólo mayorista ⇒ sin stock
      ],
      lineas: [
        { id: 1, fecha: AYER, canal: 'Mi Local', pid: 1, sid: 1, q: 2, precio: 1000 },
        { id: 2, fecha: AYER, canal: 'Mi Local', pid: 1, sid: 2, q: 28, precio: 1000 },
        { id: 3, fecha: AYER, canal: 'Mi Local', pid: 1, sid: 3, q: 2, precio: 1000 },
        { id: 4, fecha: AYER, canal: 'Mi Local', pid: 1, sid: 4, q: 1, precio: 1000 },
      ],
    })
    const [fam] = criticos('bdi', u)
    expect(fam.nombre).toBe('Templados')
    expect(fam.sinStock.map((v) => v.sid).sort()).toEqual(['1', '4'])
    expect(fam.pedir.map((v) => v.sid)).toEqual(['2'])
    expect(fam.reponer.map((v) => v.sid)).toEqual(['3'])
  })

  it('una variante que ⛔ se vendió en 28 días ⛔ entra aunque esté en 0', () => {
    const u = universo({ inv: [[1, 1, 'Local', 0]], lineas: [] })
    const [fam] = criticos('bdi', u)
    expect(fam.sinStock).toHaveLength(0)
  })

  it('la venta MAYORISTA ⛔ es velocidad', () => {
    const u = universo({ inv: [[1, 1, 'Local', 0]], lineas: [{ id: 1, fecha: AYER, canal: 'Mayorista', pid: 1, sid: 1, q: 50, precio: 300 }] })
    expect(criticos('bdi', u)[0].sinStock).toHaveLength(0)
  })

  it('la venta TÉCNICA (channel_id 12, aunque el canal diga otra cosa) ⛔ es velocidad', () => {
    const u = armarUniverso({
      base: 'bdi',
      productos: [{ id: 1, name: 'TEMPLADO 9D', category: 'VIDRIOS TEMPLADOS DE CELULAR', retailer_price: 1000 }],
      inventario: [{ product_id: 1, size_id: 1, store_name: 'Local', available_quantity: 0 }],
      ventas: [{ id: 1, date_sale: AYER, channel: 'Mi Local', channel_id: 12 }],
      detalles: [{ sale_id: 1, product_id: 1, size_id: 1, quantity: 3, unit_price: 1000 }],
      proveedorDe: null,
      hoy: HOY,
    })
    expect(criticos('bdi', u)[0].sinStock).toHaveLength(0)
  })

  it('una venta de hace más de 28 días ⛔ cuenta', () => {
    const u = universo({ inv: [[1, 1, 'Local', 0]], lineas: [{ id: 1, fecha: '2026-09-01', canal: 'Mi Local', pid: 1, sid: 1, q: 5, precio: 1000 }] })
    expect(criticos('bdi', u)[0].sinStock).toHaveLength(0)
  })
})

describe('la curva rota a precio lleno', () => {
  const lineas = (precio: number) => [
    { id: 1, fecha: AYER, canal: 'Tienda Nube', pid: 2, sid: 1, q: 5, precio },
    { id: 2, fecha: AYER, canal: 'Tienda Nube', pid: 2, sid: 2, q: 1, precio },
  ]
  const inv: Array<[number, number, string, number]> = [[2, 1, 'Local', 3], [2, 2, 'Local', 0], [2, 2, 'Deposito Minorista', 0]]

  it('al 98% del precio de lista es precio lleno, y marca el talle en 0', () => {
    const { rotos } = curvaRota(universo({ inv, lineas: lineas(980) }))
    expect(rotos).toHaveLength(1)
    expect(rotos[0].proveedor).toBe('CHINA')
    expect(rotos[0].rotas.map((v: { sid: string }) => v.sid)).toEqual(['2'])
  })

  it('al 97% ⛔ es precio lleno: se excluye y se CUENTA', () => {
    const r = curvaRota(universo({ inv, lineas: lineas(970) }))
    expect(r.rotos).toHaveLength(0)
    expect(r.rebajadas).toBe(6)
  })

  it('⛔ repite lo que ya salió como crítico sin stock', () => {
    const u = universo({ inv, lineas: lineas(1000) })
    const ya = new Set([claveDe({ pid: '2', sid: '2' })])
    expect(curvaRota(u, 30, ya).rotos).toHaveLength(0)
  })
})

describe('subir del depósito', () => {
  it('se vendió en el LOCAL esta semana, 0 en el local, hay en depósito', () => {
    const u = universo({
      inv: [[2, 1, 'Local', 0], [2, 1, 'Deposito Minorista', 4], [2, 2, 'Local', 0], [2, 2, 'Deposito Minorista', 4]],
      lineas: [
        { id: 1, fecha: AYER, canal: 'Mi Local', pid: 2, sid: 1, q: 1, precio: 1000 },
        // Vendido ONLINE: ⛔ dice nada de lo que falta colgado en el local.
        { id: 2, fecha: AYER, canal: 'Tienda Nube', pid: 2, sid: 2, q: 1, precio: 1000 },
      ],
    })
    expect(paradoEnDeposito(u).map((v: { sid: string }) => v.sid)).toEqual(['1'])
    expect(paradoEnDeposito(u, new Set([claveDe({ pid: '2', sid: '1' })]))).toHaveLength(0)
  })
})

describe('la recompra', () => {
  it('agrupa por proveedor, y lo que ⛔ tiene va a «sin proveedor»', () => {
    const u = universo({
      inv: [[1, 1, 'Local', 10], [2, 1, 'Local', 5]],
      lineas: [
        { id: 1, fecha: AYER, canal: 'Mi Local', pid: 1, sid: 1, q: 7, precio: 1000 },
        { id: 2, fecha: AYER, canal: 'Mi Local', pid: 2, sid: 1, q: 3, precio: 1000 },
      ],
    })
    const r = recompra(u)
    expect(r.map((g: { proveedor: string }) => g.proveedor)).toEqual(['sin proveedor', 'CHINA'])
    expect(r[1].productos[0]).toMatchObject({ nombre: 'STELLAR CASE', u14: 3, stock: 5 })
  })
})

// ── Lo sin terminar ─────────────────────────────────────────────────────────────────────────────

describe('lo sin terminar', () => {
  const md = [
    '# PENDIENTES',
    '## ▶️ **CATEGORÍAS** DE ZATTIA — 22-sep-2026 (dictado)',
    'texto',
    '## 🏁 RECORRIDAS — 15-sep-2026',
    '### ▶️ Lo que quedó sin hacer',
    '### 🏁 Lo cerrado',
    '## ✅ Hecho',
  ].join('\n')

  it('toma los títulos ▶️, y un subtítulo lleva adelante su título y su fecha', () => {
    expect(abiertosPorTitulo(md, HOY)).toEqual([
      { titulo: 'CATEGORÍAS DE ZATTIA — 22-sep-2026 (dictado)', fecha: '2026-09-22' },
      { titulo: 'RECORRIDAS — 15-sep-2026 › Lo que quedó sin hacer', fecha: '2026-09-15' },
    ])
  })

  it('de producción, sólo las casillas sin tildar de «Pendiente»', () => {
    const prod = ['## 🔴 Pendiente', '- [ ] 🔴 **El pasaje arranca VACÍO.** Medido el 25-ago.', '- [x] **Hecho**', '## ✅ Hecho', '- [ ] **Afuera**'].join('\n')
    expect(abiertosPorCasilla(prod, HOY)).toEqual([{ titulo: 'El pasaje arranca VACÍO.', fecha: '2026-08-25' }])
  })

  it('una fecha sin año toma el de hoy', () => {
    expect(fechaDe('corte del 15-sep, 17 h', HOY)).toBe('2026-09-15')
  })

  it('saca los emojis de estado del principio', () => {
    expect(limpiar('🆕 🏁 ALGO')).toBe('ALGO')
  })
})

// ── El mail ─────────────────────────────────────────────────────────────────────────────────────

const ventaOk = (base: string, plata: number, completo: boolean | null = true) => ({
  base, completo, minorista: { compras: 2, unidades: 3, plata }, minoristaAntes: { compras: 1, unidades: 1, plata: plata / 2 },
  porCanal: { local: { compras: 2, unidades: 3, plata } }, porCanalAntes: null, lineas: {}, lineasAntes: {},
})
const stockVacio = (base: string) => ({ base, criticos: [], curva: { rotos: [], rebajadas: 0, mirados: 0 }, subir: [], recompra: [] })

describe('el parte', () => {
  it('el asunto lleva el minorista por marca y la pauta', () => {
    const a = asuntoDe({ ventas: [ventaOk('bdi', 2_900_000), ventaOk('zattia', 850_000)], stock: [], pauta: { cuantas: 3, quema: 1 } })
    expect(a).toBe('Parte · ayer $ 3,8 M minorista (BDI $ 2,9 M · Zattia $ 850 mil) · 3 pauta (1 para pausar)')
  })

  it('un día incompleto se dice en el asunto y en el cuerpo', () => {
    const p = armarParte({ hoy: HOY, ventas: [ventaOk('bdi', 1000, false)], stock: [stockVacio('bdi')], pauta: null, pendientes: [] })
    expect(p.asunto).toContain('(parcial)')
    expect(p.texto).toContain('PARCIAL')
  })

  it('una base que ⛔ se pudo leer aparece con su motivo, ⛔ desaparece', () => {
    const p = armarParte({ hoy: HOY, ventas: [{ base: 'zattia', error: 'permission denied' }], stock: [{ base: 'zattia', error: 'permission denied' }], pauta: null, pendientes: [] })
    expect(p.texto).toContain('Zattia: ⛔ se pudo leer la venta (permission denied)')
    expect(p.asunto).toContain('⛔ se pudo leer la venta')
  })

  it('un proyecto sin token dice que ⛔ está configurado', () => {
    const p = armarParte({ hoy: HOY, ventas: [], stock: [], pauta: null, pendientes: [{ proyecto: 'Maketa', estado: 'no-configurado', motivo: 'falta el secret' }] })
    expect(p.texto).toContain('⚠️ Maketa: falta el secret')
  })

  it('escapa el HTML de lo que viene de la base', () => {
    const p = armarParte({ hoy: HOY, ventas: [], stock: [], pauta: null, pendientes: [{ proyecto: 'M', estado: 'ok', items: [{ titulo: '<b>x</b>', dias: 1 }] }] })
    expect(p.html).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(p.html).not.toContain('<b>x</b>')
  })

  it('plata corta', () => {
    expect(plataCorta(1_366_343)).toBe('$ 1,4 M')
    expect(plataCorta(809_178)).toBe('$ 809 mil')
  })
})
