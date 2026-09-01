/**
 * De un canje a las LÍNEAS de la venta de Gestión Nube.
 *
 * # El problema que resuelve
 *
 * Un canje con envío tiene ítems de dos procedencias y **una sola de las dos sirve para vender**:
 *
 * - lo que carga el equipo con el buscador de GN (`origen: 'equipo'`) trae el `product_id` y el
 *   `size_id` **de Gestión Nube**;
 * - lo que elige ella por su link (`origen: 'persona'`) trae los ids **de Tienda Nube**, porque la
 *   vitrina es un espejo de la tienda (`api/_canje-portal.js`, y el comentario de `product_id` en
 *   `tipos.ts`).
 *
 * 📊 Medido el 1-sep-2026 sobre los canjes reales: de los 49 ítems vivos de canjes con envío, **4
 * de 4 de `equipo` existen en Gestión Nube y 0 de 45 de `persona`** (ids de TN, del orden de
 * 359.143.xxx, contra los 481.248–1.051.818 de GN). Mandar esos ids a GN sería, en el mejor caso,
 * un rechazo, y en el peor **descontarle el stock a otro producto**.
 *
 * 🔑 **Lo que los rescata es el SKU**: los mismos 45 resuelven a un único artículo de GN cruzando
 * `canje_items.sku` contra el `sku` de `inventario` — 45 de 45, sin ambigüedades y sin faltantes.
 *
 * # Por qué la verificación es "existe en el inventario" y no un rango de ids
 *
 * Es tentador mirar el número (uno de TN tiene nueve dígitos, uno de GN seis o siete) y decidir por
 * ahí. **Sería adivinar**: que hoy los rangos no se pisen es suerte, no un invariante, y el día que
 * se pisen el error es el peor de todos —una venta que descuenta el producto equivocado, sin que
 * nada falle—. Acá se pregunta lo único que de verdad importa: *¿este par (producto, talle) existe
 * en el inventario de Gestión Nube?*
 */

import { CUENTAS } from '@/lib/cuentas'
import { sbFetch } from '@/lib/supabase/rest'
import type { Marca } from '@/lib/nav.datos'
import type { CanjeItem } from './tipos'

/**
 * La ubicación de la que sale lo que se despacha, tal como la nombra Gestión Nube.
 *
 * ⚠️ Es el nombre, no el id: `inventario` trae `store_name`. El id equivalente (13307, "Deposito
 * Minorista") vive en `api/crear-venta.js` y es el que efectivamente descuenta — los dos tienen que
 * hablar del mismo lugar, y por eso el nombre está acá y no tipeado en la pantalla.
 */
export const DEPOSITO_GN = 'Deposito Minorista'

export type FilaInventarioGn = {
  product_id: number | string
  size_id: number | string | null
  sku: string | null
  store_name: string | null
  available_quantity: number | null
}

/** Una línea lista para mandar a `/api/crear-venta`, más lo que la pantalla necesita mostrar. */
export type LineaVentaGn = {
  item_id: number
  sku: string | null
  nombre: string | null
  variante: string | null
  cantidad: number
  /** Ids **de Gestión Nube**: son los que descuentan stock. */
  product_id: string
  size_id: string
  unit_price: number
  /** Cuánto hay en el depósito del que va a salir. `null` si el inventario no lo dice. */
  stock_deposito: number | null
  /** Cómo se llegó al artículo: el ítem ya lo tenía, o lo resolvió el SKU. */
  via: 'articulo' | 'sku'
  /** De dónde salió el precio con el que se valúa. Ver `precioDe`. */
  precio_de: 'gn' | 'canje'
}

/** Un ítem que **no** se puede vender, con el motivo en el idioma de quien lo va a arreglar. */
export type ProblemaVentaGn = {
  item_id: number
  nombre: string | null
  sku: string | null
  motivo: string
}

const clave = (p: unknown, s: unknown) => `${String(p ?? '')}/${String(s ?? '')}`

/**
 * El precio con el que se valúa la línea.
 *
 * 🔴 **Manda el de Gestión Nube, no el del canje**, y eso es deliberado. La venta se crea a precio
 * de lista con 100 % de descuento (total $0) justamente para que el histórico de GN diga **cuánto
 * costó lo que se regaló**; si el número está mal, esa valuación no sirve para nada.
 *
 * 📊 Y hoy está mal: medido el 1-sep-2026, los 19 ítems de la vitrina activa ("Girlhood
 * Collection") están cargados a **$1.490** cuando esas mismas fundas valen **$13.990–14.990** en
 * GN, y ese número se copia a `canje_items.pvp_unit` de cada persona que elige (45 ítems, 13 canjes
 * abiertos). Es un problema **preexistente y aparte** —el balance del canje lo sigue usando— pero
 * la venta que sale de acá no tiene por qué heredarlo: GN sabe cuánto vale su propio producto.
 *
 * ⚠️ Por eso `precio_de` viaja en la línea y la pantalla lo muestra: un precio que la pantalla no
 * explica es un número que aparece y nadie sabe de dónde salió.
 */
function precioDe(item: CanjeItem, precioGn: number | null | undefined): { unit_price: number; precio_de: 'gn' | 'canje' } {
  if (precioGn != null && Number.isFinite(Number(precioGn)) && Number(precioGn) > 0) {
    return { unit_price: Number(precioGn), precio_de: 'gn' }
  }
  return { unit_price: Number(item.pvp_unit) || 0, precio_de: 'canje' }
}

/**
 * Las líneas de la venta y lo que no se pudo resolver. **Pura**: recibe el inventario ya leído, así
 * que se prueba entera sin red (`tests/canjes-venta-gn.test.ts`).
 *
 * El orden de la resolución es el que importa: **primero el artículo que el ítem ya trae** (si
 * existe de verdad en GN) y sólo después el SKU. Al revés, un SKU repetido podría pisar un artículo
 * que alguien eligió a mano en el buscador, que es la fuente más confiable que hay.
 */
export function resolverLineas(
  items: CanjeItem[],
  inventario: FilaInventarioGn[],
  precios: Record<string, number | null> = {},
): { lineas: LineaVentaGn[]; problemas: ProblemaVentaGn[] } {
  const existe = new Set<string>()
  const porSku = new Map<string, Set<string>>()
  const stock = new Map<string, number>()

  for (const f of inventario) {
    if (f.size_id == null) continue
    const k = clave(f.product_id, f.size_id)
    existe.add(k)
    if (f.sku) {
      const s = String(f.sku).trim().toUpperCase()
      if (!porSku.has(s)) porSku.set(s, new Set())
      porSku.get(s)!.add(k)
    }
    // El stock que se muestra es el del depósito del que va a salir, no el total: que haya tres en
    // el local no ayuda a despachar desde el depósito.
    if (f.store_name === DEPOSITO_GN) {
      stock.set(k, (stock.get(k) || 0) + (Number(f.available_quantity) || 0))
    }
  }

  const lineas: LineaVentaGn[] = []
  const problemas: ProblemaVentaGn[] = []

  for (const i of items) {
    const base = { item_id: i.id, nombre: i.nombre ?? null, sku: i.sku ?? null }
    const propio = clave(i.product_id, i.size_id)
    let par: string | null = null
    let via: 'articulo' | 'sku' = 'articulo'

    if (i.product_id && i.size_id && existe.has(propio)) {
      par = propio
    } else if (i.sku) {
      const candidatos = porSku.get(String(i.sku).trim().toUpperCase())
      if (!candidatos || candidatos.size === 0) {
        problemas.push({ ...base, motivo: `El SKU ${i.sku} no existe en Gestión Nube.` })
        continue
      }
      if (candidatos.size > 1) {
        // Dos artículos distintos con el mismo SKU: elegir uno sería descontarle el stock a
        // cualquiera de los dos. Lo resuelve una persona con el buscador.
        problemas.push({ ...base, motivo: `El SKU ${i.sku} da ${candidatos.size} artículos distintos en Gestión Nube.` })
        continue
      }
      par = [...candidatos][0]
      via = 'sku'
    } else {
      problemas.push({ ...base, motivo: 'No tiene SKU ni artículo de Gestión Nube: cargalo con el buscador.' })
      continue
    }

    const [product_id, size_id] = par.split('/')
    const { unit_price, precio_de } = precioDe(i, precios[product_id])
    lineas.push({
      ...base,
      variante: i.variante ?? null,
      cantidad: Number(i.cantidad) || 1,
      product_id,
      size_id,
      unit_price,
      stock_deposito: stock.has(par) ? (stock.get(par) as number) : null,
      via,
      precio_de,
    })
  }

  return { lineas, problemas }
}

/**
 * Trae de Gestión Nube lo necesario para resolver estos ítems: el inventario que matchea por SKU o
 * por artículo, y el precio de lista de esos productos.
 *
 * Va por `sbFetch` —o sea por `api/datos?recurso=espejo`, con RLS del lado del servidor— igual que
 * el picker `BuscarArticuloGN`, en vez de abrir un camino nuevo a los mismos datos.
 */
export async function traerArticulosDeGn(
  marca: Marca, items: CanjeItem[],
): Promise<{ inventario: FilaInventarioGn[]; precios: Record<string, number | null> }> {
  const skus = [...new Set(items.map((i) => i.sku).filter(Boolean).map((s) => String(s)))]
  const pids = [...new Set(items.map((i) => i.product_id).filter(Boolean).map((p) => String(p)))]
  if (!skus.length && !pids.length) return { inventario: [], precios: {} }

  // PostgREST no acepta un `or()` con dos `in` largos sin volverse ilegible: son dos consultas, cada
  // una con su filtro, y se juntan acá. El costo es una ida más; el beneficio es que si una falla se
  // ve cuál.
  const partes: FilaInventarioGn[][] = []
  const cols = 'select=product_id,size_id,sku,store_name,available_quantity'
  if (skus.length) {
    partes.push(await sbFetch<FilaInventarioGn>(
      CUENTAS[marca], 'inventario', `${cols}&sku=in.(${skus.map((s) => `"${s.replace(/"/g, '')}"`).join(',')})&limit=500`,
    ))
  }
  if (pids.length) {
    // Sólo los numéricos: un id de Tienda Nube es numérico también, pero `in.()` con basura rompe
    // la consulta entera y dejaría sin resolver a los que sí se podían.
    const num = pids.filter((p) => /^\d+$/.test(p))
    if (num.length) {
      partes.push(await sbFetch<FilaInventarioGn>(
        CUENTAS[marca], 'inventario', `${cols}&product_id=in.(${num.join(',')})&limit=500`,
      ))
    }
  }
  const inventario = partes.flat()

  const productos = [...new Set(inventario.map((f) => String(f.product_id)))]
  const precios: Record<string, number | null> = {}
  if (productos.length) {
    const filas = await sbFetch<{ id: number | string; retailer_price: number | string | null }>(
      CUENTAS[marca], 'productos', `select=id,retailer_price&id=in.(${productos.join(',')})`,
    )
    for (const p of filas) precios[String(p.id)] = p.retailer_price == null ? null : Number(p.retailer_price)
  }
  return { inventario, precios }
}
