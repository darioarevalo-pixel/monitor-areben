import { describe, expect, it } from 'vitest'
import { destinosDelMenu, hostDeTienda, productosEnPagina, validarDestino } from '@/lib/meta-ads/destinos'

/**
 * El guard del destino elegido a mano.
 *
 * El riesgo que ordena los casos: **un destino mal elegido entrega, gasta y no vende**, sin fallar
 * ruidosamente. El 15-sep-2026 la TANDA 12 (MOODS) no tenía ningún aviso modelo que apuntara a su
 * colección. Lo que más se fija acá es qué NO pasa el guard, no que arme la URL linda.
 */

describe('validarDestino — sólo la tienda de la línea', () => {
  it('acepta una colección de la tienda de BDI y la normaliza con / al final', () => {
    const r = validarDestino('https://bdiaccesorios.com.ar/fundas/moods-collection', 'bdi')
    expect(r).toEqual({ ok: true, destino: 'https://bdiaccesorios.com.ar/fundas/moods-collection/' })
  })

  it('acepta el www y lo lleva al apex, que es el que guarda TIENDA_BASE', () => {
    const r = validarDestino('https://www.bdiaccesorios.com.ar/new-in/', 'bdi')
    expect(r.ok && r.destino).toBe('https://bdiaccesorios.com.ar/new-in/')
  })

  it('🔴 rechaza un dominio ajeno con 409', () => {
    const r = validarDestino('https://example.com/fundas/', 'bdi')
    expect(r).toMatchObject({ ok: false, status: 409 })
  })

  it('🔴 rechaza la tienda de OTRA línea: una tanda de BDI no manda a Zattia', () => {
    const r = validarDestino('https://zattia.com.ar/vestidos/', 'bdi')
    expect(r).toMatchObject({ ok: false, status: 409 })
  })

  it('🔴 rechaza un subdominio que termina igual (no es la tienda)', () => {
    const r = validarDestino('https://bdiaccesorios.com.ar.malo.com/', 'bdi')
    expect(r).toMatchObject({ ok: false, status: 409 })
  })

  it('⛔ rechaza http y javascript:', () => {
    expect(validarDestino('http://bdiaccesorios.com.ar/new-in/', 'bdi')).toMatchObject({ ok: false, status: 400 })
    expect(validarDestino('javascript:alert(1)', 'bdi')).toMatchObject({ ok: false, status: 400 })
  })

  it('⛔ rechaza vacío y lo que no es una dirección', () => {
    expect(validarDestino('', 'bdi')).toMatchObject({ ok: false, status: 400 })
    expect(validarDestino('fundas moods', 'bdi')).toMatchObject({ ok: false, status: 400 })
  })

  it('una línea sin tienda no puede elegir destino', () => {
    expect(validarDestino('https://bdiaccesorios.com.ar/', 'todas')).toMatchObject({ ok: false, status: 409 })
    expect(hostDeTienda('todas')).toBeNull()
  })

  it('conserva el query pedido (por ejemplo un filtro de la tienda)', () => {
    const r = validarDestino('https://bdiaccesorios.com.ar/fundas/?sort_by=created-descending', 'bdi')
    expect(r.ok && r.destino).toBe('https://bdiaccesorios.com.ar/fundas/?sort_by=created-descending')
  })
})

/** Un pedazo del menú real de bdiaccesorios.com.ar (15-sep-2026), con lo que NO es destino mezclado. */
const MENU = `
<nav>
  <a href="https://bdiaccesorios.com.ar/new-in/">NEW IN</a>
  <a href="https://bdiaccesorios.com.ar/fundas/moods-collection/"><span>Moods Collection</span></a>
  <a href="/fundas/girlhood-collection/">Girlhood Collection</a>
  <a href="https://bdiaccesorios.com.ar/fundas/moods-collection/">Moods (repetido)</a>
  <a href="https://bdiaccesorios.com.ar/productos/cow-case/">Cow case</a>
  <a href="https://bdiaccesorios.com.ar/account/login/">Mi cuenta</a>
  <a href="https://bdiaccesorios.com.ar/cart/">Carrito</a>
  <a href="https://bdiaccesorios.com.ar/">Inicio</a>
  <a href="https://instagram.com/bdi.accesorios">IG</a>
  <a href="https://zattia.com.ar/vestidos/">Zattia</a>
</nav>`

describe('destinosDelMenu — las colecciones, sin lo que no es un destino', () => {
  it('lee las colecciones en el orden del menú, sin repetidas y con el nombre de la tienda', () => {
    expect(destinosDelMenu(MENU, 'bdi')).toEqual([
      { url: 'https://bdiaccesorios.com.ar/new-in/', ruta: '/new-in/', nombre: 'NEW IN' },
      { url: 'https://bdiaccesorios.com.ar/fundas/moods-collection/', ruta: '/fundas/moods-collection/', nombre: 'Moods Collection' },
      { url: 'https://bdiaccesorios.com.ar/fundas/girlhood-collection/', ruta: '/fundas/girlhood-collection/', nombre: 'Girlhood Collection' },
    ])
  })

  it('⛔ deja afuera productos sueltos, cuenta, carrito, inicio y otros dominios', () => {
    const rutas = destinosDelMenu(MENU, 'bdi').map((d) => d.ruta)
    expect(rutas.some((r) => /productos|account|cart/.test(r))).toBe(false)
    expect(rutas).not.toContain('/')
  })

  it('un HTML sin menú devuelve lista vacía, no tira', () => {
    expect(destinosDelMenu('<html></html>', 'bdi')).toEqual([])
    expect(destinosDelMenu(null as unknown as string, 'bdi')).toEqual([])
  })
})

describe('productosEnPagina — el chequeo que faltó con la TANDA 12', () => {
  it('cuenta productos distintos, absolutos y relativos', () => {
    const html = `
      <a href="https://bdiaccesorios.com.ar/productos/cow-case/">a</a>
      <a href="/productos/cow-case/">a otra vez</a>
      <a href="https://www.bdiaccesorios.com.ar/productos/stardust-case/?variant=1">b</a>`
    expect(productosEnPagina(html, 'bdi')).toEqual({ cantidad: 2, handles: ['cow-case', 'stardust-case'] })
  })

  it('🔴 una página sin productos da cero: un destino vacío se avisa antes de armar', () => {
    expect(productosEnPagina('<div>No hay productos</div>', 'bdi').cantidad).toBe(0)
  })

  it('no cuenta productos de otra tienda', () => {
    expect(productosEnPagina('<a href="https://zattia.com.ar/productos/vestido/">x</a>', 'bdi').cantidad).toBe(0)
  })
})
