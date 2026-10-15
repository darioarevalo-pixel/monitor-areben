/**
 * La devolución como SOLICITUD (Darío, 15-oct-2026). Puro, sin DOM ni red.
 *
 * «Parece que todas las devoluciones valen lo mismo y hay que traer cerca de 700 productos»: en vez de
 * una lista diaria con tope, el Monitor PROPONE lo que sobra ordenado por prioridad, Darío o Bruno
 * confirman qué vuelve y lo envían al local. Allá lo juntan y, lo que va en bolsa, va en su bolsa con
 * la etiqueta de 10 × 15: así en el depósito se guarda sin separar.
 *
 * 🔑 El orden (Darío, 15-oct-2026): primero lo que **no vendió nada en 60 días** (ocupa lugar y no
 * rota), después **lo que más sobra**. Se ordena por PRODUCTO, no por variante: la bolsa es del
 * producto y se decide producto por producto.
 * 🔑 Sin tope diario: «si son tops, 30 es re poco; si son todos jeans, se complica». Lo pone quien elige.
 */

import { claveDe, cmpSku } from '../ubicaciones-local/core.core.js'
import type { LineaPedido } from './armado'
import type { FilaVentas } from './porVentas'

export type Prioridad = 'sin-ventas' | 'con-ventas'

export const ROTULO_PRIORIDAD: Record<Prioridad, string> = {
  'sin-ventas': 'Sin ventas en 60 días',
  'con-ventas': 'Con ventas: primero lo que más sobra',
}

/**
 * Lo que NO va en bolsa: va suelto en el carro (Darío, 15-oct-2026: «de los shorts, bermudas y jeans
 * no se puede»). Se mira el CÓDIGO (RJE jeans · RSH shorts · RBE bermudas) y el nombre. ⛔ La
 * categoría no: «FALDAS Y SHORTS» mandaba suelta a una mini, y «FADE #002» es bermuda sin decirlo
 * (medido el 15-oct con la lista real). Lo que se elige a mano queda recordado por producto.
 */
const SUELTO_NOMBRE = /JEAN|SHORT|BERMUDA/i
const SUELTO_CODIGO = /^(RJE|RSH|RBE)-/i

export function bolsaPorDefecto(it: { name: string; sku?: string }): boolean {
  return !SUELTO_CODIGO.test((it.sku || '').trim()) && !SUELTO_NOMBRE.test(it.name)
}

export function conBolsa(it: { pid: string; name: string; sku?: string }, recordado: Record<string, boolean>): boolean {
  return typeof recordado[it.pid] === 'boolean' ? recordado[it.pid] : bolsaPorDefecto(it)
}

export type VariantePropuesta = { f: FilaVentas; sobra: number }
export type GrupoPropuesta = {
  pid: string
  name: string
  cat: string
  /** Un SKU del producto (el primero con SKU): decide si va suelto por defecto. */
  sku: string
  /** El código de producto de la etiqueta de bolsa (`RTO-0065`). */
  clave: string
  prioridad: Prioridad
  /** Vendidas en la ventana, sumando TODAS las variantes del producto (no sólo las que sobran). */
  vendidas: number
  /** Unidades que sobran, sumando las variantes. */
  sobra: number
  variantes: VariantePropuesta[]
}

/**
 * Lo que sobra en el local, por producto y en orden de prioridad. `yaPedido` = lo que ya está en una
 * solicitud (confirmada o enviada) y todavía no se descontó del stock: no se propone dos veces.
 */
export function propuesta(filas: FilaVentas[], yaPedido: Record<string, number> = {}): GrupoPropuesta[] {
  const vendidasProd = new Map<string, number>()
  for (const f of filas) vendidasProd.set(f.it.pid, (vendidasProd.get(f.it.pid) || 0) + (f.d.vendidas || 0))
  const grupos = new Map<string, GrupoPropuesta>()
  for (const f of filas) {
    const sobra = f.d.devolver - (yaPedido[f.it.vid] || 0)
    if (sobra <= 0) continue
    let g = grupos.get(f.it.pid)
    if (!g) {
      const vendidas = vendidasProd.get(f.it.pid) || 0
      g = { pid: f.it.pid, name: f.it.name, cat: f.it.cat || '', sku: f.it.sku || '', clave: claveDe(f.it.sku), prioridad: vendidas === 0 ? 'sin-ventas' : 'con-ventas', vendidas, sobra: 0, variantes: [] }
      grupos.set(f.it.pid, g)
    }
    if (!g.clave && f.it.sku) g.clave = claveDe(f.it.sku)
    if (!g.sku && f.it.sku) g.sku = f.it.sku
    g.sobra += sobra
    g.variantes.push({ f, sobra })
  }
  const out = [...grupos.values()]
  for (const g of out) g.variantes.sort((a, b) => cmpSku(a.f.it.sku || '~', b.f.it.sku || '~'))
  const peso = (p: Prioridad) => (p === 'sin-ventas' ? 0 : 1)
  return out.sort((a, b) => peso(a.prioridad) - peso(b.prioridad) || b.sobra - a.sobra || a.name.localeCompare(b.name, 'es'))
}

/** Suma de cantidades por variante de varias listas. */
export function sumarPedidos(...listas: (Record<string, number> | null | undefined)[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const l of listas) for (const [vid, n] of Object.entries(l || {})) if (n > 0) out[vid] = (out[vid] || 0) + n
  return out
}

/** { vid: cant } de un pedido. */
export function cantidades(pedido: LineaPedido[] | null | undefined): Record<string, number> {
  const out: Record<string, number> = {}
  for (const l of pedido || []) out[l.vid] = (out[l.vid] || 0) + l.cant
  return out
}

/** Los renglones de un producto de la propuesta, con las cantidades elegidas. */
export function lineasDe(g: GrupoPropuesta, cant: (v: VariantePropuesta) => number, bolsa: boolean): LineaPedido[] {
  return g.variantes
    .map((v) => ({
      vid: v.f.it.vid,
      pid: v.f.it.pid,
      sid: v.f.it.sid,
      sku: v.f.it.sku || '',
      barcode: v.f.it.barcode || '',
      name: v.f.it.name,
      size: v.f.it.size,
      cant: Math.max(0, Math.min(v.sobra, Math.trunc(cant(v)) || 0)),
      exhibir: false,
      ...(bolsa ? { bolsa: true } : {}),
    }))
    .filter((l) => l.cant > 0)
}

/**
 * Suma lo recién confirmado a lo que ya estaba: misma variante, se suman las cantidades; la bolsa la
 * decide lo último (es del producto entero). Ordenado por SKU, que es como está el depósito del local.
 */
export function fusionar(actual: LineaPedido[], nuevas: LineaPedido[]): LineaPedido[] {
  const bolsaProd = new Map<string, boolean>()
  for (const l of nuevas) bolsaProd.set(l.pid, !!l.bolsa)
  const m = new Map<string, LineaPedido>()
  for (const l of [...actual, ...nuevas]) {
    const prev = m.get(l.vid)
    m.set(l.vid, prev ? { ...prev, cant: prev.cant + l.cant } : { ...l })
  }
  return ordenarPedido(
    [...m.values()].map((l) => {
      const b = bolsaProd.has(l.pid) ? bolsaProd.get(l.pid) : !!l.bolsa
      const { bolsa: _, ...resto } = l
      return b ? { ...resto, bolsa: true } : resto
    }),
  )
}

export function ordenarPedido(p: LineaPedido[]): LineaPedido[] {
  return [...p].sort((a, b) => cmpSku(a.sku || '~', b.sku || '~') || a.name.localeCompare(b.name, 'es'))
}

/** Un producto de la solicitud: sus renglones juntos. */
export type ProductoSolicitud = { pid: string; name: string; clave: string; bolsa: boolean; prendas: number; lineas: LineaPedido[] }

export function porProducto(pedido: LineaPedido[]): ProductoSolicitud[] {
  const m = new Map<string, ProductoSolicitud>()
  for (const l of ordenarPedido(pedido)) {
    let p = m.get(l.pid)
    if (!p) {
      p = { pid: l.pid, name: l.name, clave: claveDe(l.sku), bolsa: !!l.bolsa, prendas: 0, lineas: [] }
      m.set(l.pid, p)
    }
    if (!p.clave && l.sku) p.clave = claveDe(l.sku)
    p.bolsa = p.bolsa || !!l.bolsa
    p.prendas += l.cant
    p.lineas.push(l)
  }
  return [...m.values()]
}

/** El resumen antes de enviar: productos, prendas y etiquetas de bolsa a imprimir. */
export function resumenSolicitud(pedido: LineaPedido[]): { productos: number; prendas: number; bolsas: number; sueltas: number } {
  const ps = porProducto(pedido)
  return {
    productos: ps.length,
    prendas: ps.reduce((s, p) => s + p.prendas, 0),
    bolsas: ps.filter((p) => p.bolsa).length,
    sueltas: ps.filter((p) => !p.bolsa).reduce((s, p) => s + p.prendas, 0),
  }
}

/**
 * Adónde va la prenda recién escaneada: a la bolsa de su producto (`nueva` = es la primera de ese
 * producto, hay que agarrar la bolsa) o suelta al carro.
 */
export function bolsaDeLectura(pedido: LineaPedido[], escaneos: Record<string, number>, l: LineaPedido): { bolsa: string; nueva: boolean } | null {
  if (!l.bolsa) return null
  const delProducto = pedido.filter((x) => x.pid === l.pid).reduce((s, x) => s + (escaneos[x.vid] || 0), 0)
  return { bolsa: claveDe(l.sku) || l.name, nueva: delProducto <= 1 }
}
