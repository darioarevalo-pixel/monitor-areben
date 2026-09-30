import { describe, expect, it } from 'vitest'
// Núcleos en JS plano: los importa el cron (`scripts/parte-manana.mjs`) y estos tests, ⛔ la app.
import { ayerCompleto, minorista, ventaDeAyer } from '@/lib/parte/ventas.core.js'
import {
  armarUniverso, claveDe, criticos, curvaRota, ladoDeStore, paradoEnDeposito, recompra,
} from '@/lib/parte/stock.core.js'
import { abiertosPorCasilla, abiertosPorTitulo, fechaDe, limpiar } from '@/lib/parte/pendientes.core.js'
import { armarParte, plataCorta } from '@/lib/parte/mail.core.js'
import { fotoDe, indiceDeFotos, miniatura } from '@/lib/parte/fotos.core.js'
import { partirPorLinea } from '@/lib/parte/stock.core.js'

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

// ── Lo que marcó Bruno al leer el primero (30-sep) ──────────────────────────────────────────────

describe('lo que no puede faltar mide la venta A PRECIO LLENO', () => {
  const zattia = (precio: number) => armarUniverso({
    base: 'zattia',
    productos: [{ id: 1, name: 'BOMBACHA AYLA', sku: 'Z-1', proveedor: 'ZATTIA', retailer_price: 19990 }],
    inventario: [{ product_id: 1, size_id: 1, size_name: 'S', store_name: 'Deposito ', available_quantity: 0 }],
    ventas: [{ id: 1, date_sale: AYER, channel: 'Mi Local' }],
    detalles: [{ sale_id: 1, product_id: 1, size_id: 1, size: 'S', quantity: 33, unit_price: precio }],
    proveedorDe: null,
    hoy: HOY,
  })

  it('lo que se agotó en la FERIA ⛔ pide reposición, y se cuenta', () => {
    const [fam] = criticos('zattia', zattia(5590))
    expect(fam.sinStock).toHaveLength(0)
    expect(fam.rebajadas).toBe(33)
  })

  it('lo que se agotó a precio de lista sí', () => {
    expect(criticos('zattia', zattia(19990))[0].sinStock).toHaveLength(1)
  })

  it('la cobertura también se mide con la venta a precio lleno', () => {
    // 10 en stock, 100 vendidas en la Feria y 5 a precio lleno: a la velocidad de la Feria duraría
    // menos de 3 días; a la de lista, 56. ⛔ Hay que pedir.
    const u = armarUniverso({
      base: 'zattia',
      productos: [{ id: 1, name: 'BOMBACHA BORA', sku: 'Z-1', proveedor: 'ZATTIA', retailer_price: 19990 }],
      inventario: [{ product_id: 1, size_id: 1, size_name: 'S', store_name: 'Deposito ', available_quantity: 10 }],
      ventas: [{ id: 1, date_sale: AYER, channel: 'Mi Local' }, { id: 2, date_sale: AYER, channel: 'Mi Local' }],
      detalles: [
        { sale_id: 1, product_id: 1, size_id: 1, size: 'S', quantity: 95, unit_price: 5590 },
        { sale_id: 2, product_id: 1, size_id: 1, size: 'S', quantity: 5, unit_price: 19990 },
      ],
      proveedorDe: null,
      hoy: HOY,
    })
    const [fam] = criticos('zattia', u)
    expect(fam.pedir).toHaveLength(0)
    expect(fam.sinStock).toHaveLength(0)
  })

  it('los protectores de CÁMARA ⛔ son templados', () => {
    const u = armarUniverso({
      base: 'bdi',
      productos: [{ id: 1, name: 'PROTECTOR DE CAMARA', category: 'VIDRIOS TEMPLADOS DE CÁMARA', retailer_price: 1000 }],
      inventario: [{ product_id: 1, size_id: 1, store_name: 'Local', available_quantity: 0 }],
      ventas: [{ id: 1, date_sale: AYER, channel: 'Mi Local' }],
      detalles: [{ sale_id: 1, product_id: 1, size_id: 1, quantity: 3, unit_price: 1000 }],
      proveedorDe: null,
      hoy: HOY,
    })
    expect(criticos('bdi', u)[0].sinStock).toHaveLength(0)
  })
})

describe('Stunned tiene su capítulo', () => {
  it('partirPorLinea separa por el SKU', () => {
    const u = armarUniverso({
      base: 'zattia',
      productos: [{ id: 1, name: 'TOP', sku: 'Z-1' }, { id: 2, name: 'REMERA VINTAGE', sku: 'STUNNED' }],
      inventario: [{ product_id: 1, size_id: 1, store_name: 'Local', available_quantity: 1 }, { product_id: 2, size_id: 1, store_name: 'Local', available_quantity: 1 }],
      ventas: [], detalles: [], proveedorDe: null, hoy: HOY,
    })
    const p = partirPorLinea(u) as Record<string, Array<{ pid: string }>>
    expect(p.zattia.map((v: { pid: string }) => v.pid)).toEqual(['1'])
    expect(p.stunned.map((v: { pid: string }) => v.pid)).toEqual(['2'])
  })
})

describe('las fotos', () => {
  const tn = [{ name: 'STELLAR CASE', images: ['https://dcdn-us.mitiendanube.com/x.jpg'] }, { name: 'SIN FOTO', images: [] }]

  it('matchea por nombre y achica con weserv, en JPG y con https adentro', () => {
    const u = fotoDe({ name: 'STELLAR CASE' }, indiceDeFotos(tn))
    expect(u).toContain('images.weserv.nl')
    expect(u).toContain(encodeURIComponent('https://dcdn-us.mitiendanube.com/x.jpg'))
    expect(u).toContain('output=jpg')
    expect(u).not.toContain('webp')
  })

  it('sin foto en Tienda Nube da null (y el mail pone la inicial)', () => {
    expect(fotoDe({ name: 'SIN FOTO' }, indiceDeFotos(tn))).toBeNull()
    expect(miniatura(null)).toBeNull()
  })
})

// ── El mail ─────────────────────────────────────────────────────────────────────────────────────

const venta = (plata: number, completo: boolean | null = true) => ({
  completo,
  minorista: { compras: 2, unidades: 3, plata }, minoristaAntes: { compras: 1, unidades: 1, plata: plata / 2 },
  porCanal: { local: { compras: 2, unidades: 3, plata } }, porCanalAntes: null,
  lineas: { stunned: { facturado: 1000, unidades: 1, tickets: 1 } }, lineasAntes: {},
  serie7: [{ fecha: '2026-09-23', plata: 1 }, { fecha: AYER, plata: 2 }], stunned7: [],
})
const variante = (pid: string, nombre: string, extra: Record<string, unknown> = {}) => ({
  pid, sid: '1', talle: 'S', nombre, local: 0, deposito: 0, u28: 5, lleno28: 5, uLocal7: 1, dias: 2, ...extra,
})
const stock = (n = 1) => ({
  criticos: [{
    nombre: 'Templados', rebajadas: 0,
    sinStock: Array.from({ length: n }, (_, i) => variante(`s${i}`, `TEMPLADO <b>${i}</b>`)),
    pedir: Array.from({ length: n }, (_, i) => variante(`p${i}`, `PEDIR ${i}`, { local: 1, deposito: 1 })),
    reponer: Array.from({ length: n }, (_, i) => variante(`r${i}`, `REPONER ${i}`, { deposito: 9 })),
  }],
  curva: { rebajadas: 0, mirados: 30, rotos: Array.from({ length: n }, (_, i) => ({ pid: `c${i}`, puesto: i + 1, nombre: `CURVA ${i}`, proveedor: 'CHINA', rotas: [variante(`c${i}`, 'x')] })) },
  subir: Array.from({ length: n }, (_, i) => variante(`u${i}`, `SUBIR ${i}`, { deposito: 4 })),
  recompra: Array.from({ length: Math.min(n, 8) }, (_, g) => ({ proveedor: `PROV ${g}`, u14: 10, productos: Array.from({ length: 5 }, (_, i) => ({ pid: `q${g}${i}`, nombre: `P ${i}`, u14: 3, stock: 9, dias: 20 })) })),
})
const capitulos = (n = 1) => [
  { linea: 'bdi', base: 'bdi', venta: venta(1_063_783), stock: stock(n) },
  { linea: 'zattia', base: 'zattia', venta: venta(809_178), stock: stock(n) },
  { linea: 'stunned', base: 'zattia', venta: venta(809_178), stock: { ...stock(0), criticos: [] } },
]
const entrada = (over: Record<string, unknown> = {}) => ({
  hoy: HOY, capitulos: capitulos(), fotos: { bdi: new Map([['s0', 'https://images.weserv.nl/?url=foto']]) },
  pauta: null, pendientes: [], ...over,
})

describe('el parte', () => {
  it('el asunto lleva el minorista por marca, SIN sumar Stunned dos veces', () => {
    const { asunto } = armarParte(entrada({ pauta: { cuantas: 3, quema: 1, renglones: [] } }))
    expect(asunto).toBe('Parte · ayer $ 1,9 M minorista (BDI $ 1,1 M · Zattia $ 809 mil) · 4 productos sin stock · 3 pauta (1 para pausar)')
    // El total exacto: Stunned (sus $ 1.000) ya está adentro de Zattia y ⛔ se suma otra vez.
    expect(armarParte(entrada()).html).toContain('$ 1.872.961')
  })

  it('los tres capítulos van en orden, cada uno con su logo', () => {
    const { html } = armarParte(entrada())
    const i = (s: string) => html.indexOf(s, html.indexOf('>ZATTIA<') > 0 ? 0 : 0)
    expect(html).toContain('alt="BDI"')
    expect(html).toContain('alt="Zattia"')
    expect(html).toContain('alt="Stunned"')
    // Las franjas: después de la portada, BDI → Zattia → Stunned.
    const franjas = [...html.matchAll(/alt="(BDI|Zattia|Stunned)" style="display:block/g)].map((m) => m[1])
    expect(franjas).toEqual(['BDI', 'Zattia', 'Stunned'])
    expect(i('x')).toBeGreaterThanOrEqual(0)
  })

  it('la foto va cuando matchea, y la inicial cuando ⛔', () => {
    const { html } = armarParte(entrada())
    expect(html).toContain('src="https://images.weserv.nl/?url=foto"')
    expect(html).toMatch(/line-height:48px;text-align:center;font-weight:bold">P</)
  })

  it('Zattia aclara que incluye Stunned', () => {
    expect(armarParte(entrada()).html).toContain('Incluye Stunned: $ 1.000.')
  })

  it('un día incompleto se dice en el asunto y en el cuerpo', () => {
    const caps = capitulos()
    caps[0].venta = venta(1000, false)
    const p = armarParte(entrada({ capitulos: caps }))
    expect(p.asunto).toContain('(parcial)')
    expect(p.html).toMatch(/background:#fffbeb;color:#b45309;font-size:12px">⚠️ Parcial: el sync de hoy todavía no corrió/)
  })

  it('una base que ⛔ se pudo leer tiene su capítulo con el motivo', () => {
    const p = armarParte(entrada({ capitulos: [{ linea: 'zattia', base: 'zattia', error: 'permission denied' }] }))
    expect(p.html).toContain('permission denied')
    expect(p.asunto).toContain('no se pudo leer la venta')
  })

  it('un proyecto sin token lo dice', () => {
    const p = armarParte(entrada({ pendientes: [{ proyecto: 'Maketa', estado: 'no-configurado', motivo: 'falta el secret' }] }))
    expect(p.html).toContain('Maketa</b>: falta el secret')
  })

  it('escapa el HTML de lo que viene de la base', () => {
    const { html } = armarParte(entrada())
    expect(html).toContain('TEMPLADO &lt;b&gt;0&lt;/b&gt;')
    expect(html).not.toContain('TEMPLADO <b>0</b>')
  })

  it('el signo ⛔ de los comentarios ⛔ llega al texto del mail', () => {
    const p = armarParte(entrada({ capitulos: [...capitulos(), { linea: 'bdi', base: 'bdi', error: 'x' }], pauta: { error: 'y' } }))
    expect(p.html).not.toContain('⛔')
    expect(p.texto).not.toContain('⛔')
  })

  it('las reglas de un mail: ⛔ svg, ⛔ base64, ⛔ flex', () => {
    const { html } = armarParte(entrada())
    expect(html).not.toMatch(/<svg|data:image|display:\s*flex|display:\s*grid/)
  })

  it('LLENO pesa menos de 90 KB: Gmail corta arriba de ~102', () => {
    const pend = [{ proyecto: 'Monitor', estado: 'ok', items: Array.from({ length: 30 }, (_, i) => ({ titulo: `Algo largo abierto número ${i} `.repeat(4), dias: i })) }]
    const { html } = armarParte(entrada({ capitulos: capitulos(40), pendientes: pend, pauta: { cuantas: 10, quema: 2, renglones: Array.from({ length: 10 }, () => ({ g: 'quema', nombre: 'TANDA', linea: 'BDI', cuando: 'hoy', motivo: 'm'.repeat(120), propone: 'pausarlo', ruta: 'https://x' })) } }))
    expect(Buffer.byteLength(html) / 1024).toBeLessThan(90)
  })

  it('plata corta', () => {
    expect(plataCorta(1_366_343)).toBe('$ 1,4 M')
    expect(plataCorta(809_178)).toBe('$ 809 mil')
  })
})
