/**
 * EL CONTEO DE UNA LÍNEA QUE YA ESTÁ EN EL ERP VA AL ERP, ⛔ AL EXCEL DE GN (erp-stunned §8.4, Bruno 30-oct). Puro.
 *
 * Desde el corte de una línea (`erp_corte`, `lib/erp/corte.core.js`: Stunned 28-oct, BDI 15/16-nov, Zattia 23-nov) su GN ⛔ mueve
 * el libro: el stock de GN de esas prendas es viejo, y el Excel de «Importar y Ajustar» corregiría un número que ya nadie lee.
 * Para las prendas de una línea cortada, en las TRES pantallas de conteo (depósito, estándar y el Local de BDI):
 *   · el «sistema» que se ve al contar es el LIBRO del depósito (`conLibro`), ⛔ GN;
 *   · al guardar, sus diferencias son UN ajuste «Conteo» POR LÍNEA, APLICADO en el acto (Bruno 30-oct: «lo aplicaría en el
 *     momento, y luego de última volvemos a ajustar»), y salen del Excel (`partirExcel`).
 * Una línea sin corte sigue al Excel, como siempre. La línea sale del PRODUCTO (`productos.sku`, en el servidor).
 * 🔑 Como el Excel, el ajuste es `libro + dif` (`dif` congelada al terminar la prenda contra lo que se veía al abrirla): una venta
 * entre el conteo y el guardado ⛔ se cuenta dos veces.
 */

import { depositoDe } from '../../motor/depositos.mjs'
import { baseDeLinea } from '../lineas.core.js'
import { DEPOSITO_DE } from './salida-solicitud.core.js'

/**
 * Desde cuántas unidades de diferencia una prenda se marca antes de confirmar (Bruno 30-oct: «aviso cuando una prenda cambia ≥ 2 u»).
 * El libro manda a Tienda Nube ⇒ un error de conteo se ve en la tienda enseguida. Cambiarlo es cambiar este número.
 */
export const UMBRAL_AVISO_CONTEO = 2

/** El depósito del ERP del `loc` del vivo (`deposito` | `local`) en esa base. */
export const depositoDeLoc = (store, loc) => DEPOSITO_DE[baseDeLinea(store)]?.[loc] ?? null

/** El depósito del ERP del `ubicacion` que guarda el conteo («Deposito », «Deposito Minorista», «Local»), o null. */
export const depositoDeUbicacion = (store, ubicacion) => depositoDe(baseDeLinea(store), ubicacion)

const k = (pid, sid) => `${Number(pid)}:${Number(sid)}`

/** Las variantes de unas filas del vivo cuya línea está en el ERP, para leerles el libro. */
export function variantesEnErp(rows, lineas, enErp) {
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => r && enErp.includes(lineas.get(Number(r.product_id))))
    .map((r) => ({ product_id: Number(r.product_id), size_id: Number(r.size_id) }))
}

/**
 * Las filas del vivo con el LIBRO en las prendas de una línea en el ERP (`fuente: 'erp'`, `linea`); el resto, como vinieron.
 * `niveles`: `pid:sid` → nivel (sin fila en el libro = 0).
 */
export function conLibro(rows, lineas, enErp, niveles) {
  return (Array.isArray(rows) ? rows : []).map((r) => {
    const linea = r && lineas.get(Number(r.product_id))
    return linea && enErp.includes(linea) ? { ...r, available_quantity: niveles.get(k(r.product_id, r.size_id)) ?? 0, fuente: 'erp', linea } : r
  })
}

/**
 * Parte las filas del ajuste de un conteo: las que van al Excel de GN y las del ERP. Una fila del ajuste ⛔ trae la variante: se
 * busca en el vivo por `inventory_id`. `erp`: `{ product_id, size_id, sku, barcode, dif, linea }`.
 * @param {Array<{ inventory_id: any, barcode?: string, dif: number }>} rows @param {Record<string, any>} vivo vid → fila del vivo
 */
export function partirExcel(rows, vivo) {
  const porInv = new Map(Object.values(vivo || {}).filter((v) => v && v.inventory_id != null).map((v) => [String(v.inventory_id), v]))
  const excel = []
  const erp = []
  for (const r of rows || []) {
    const v = porInv.get(String(r.inventory_id))
    if (v && v.fuente === 'erp') erp.push({ product_id: Number(v.product_id), size_id: Number(v.size_id), sku: v.sku || null, barcode: v.barcode || r.barcode || null, dif: Number(r.dif), linea: v.linea || null })
    else excel.push(r)
  }
  return { excel, erp }
}

/** Los renglones del ERP que cambian ≥ `umbral` unidades: se marcan antes de confirmar. */
export const grandes = (renglones, umbral = UMBRAL_AVISO_CONTEO) => (renglones || []).filter((r) => Math.abs(Number(r.dif) || 0) >= umbral)

/**
 * Los ajustes del motor para la parte ERP de un conteo: UNO POR LÍNEA, `{ linea, deposito, motivo: 'conteo', ref, detalle,
 * renglones }`. `[]` si ⛔ hay nada que mover, o `{ error }`. La LÍNEA la decide el servidor (`lineas`: product_id → línea, de
 * `productos.sku`) y tiene que estar en el ERP (`enErp`): un renglón de una línea sin corte frena (una pantalla vieja ⛔ ajusta
 * en el ERP lo que todavía manda GN). `niveles`: el libro AHORA (`pid:sid` → nivel); lo contado = `libro + dif`, nunca menos de 0.
 * El `ref` (`conteo:<id del preview>`) es por línea en el motor ⇒ «Reintentar» devuelve el mismo ajuste.
 * @param {any} b el cuerpo del POST del conteo @param {string} store @param {Map<number, string>} lineas @param {string[]} enErp
 * @param {Map<string, number>} niveles
 */
export function ajustesDeConteo(b, store, lineas, enErp, niveles) {
  const e = b && b.erp
  const items = e && Array.isArray(e.renglones) ? e.renglones : []
  if (!items.length) return []
  const ref = String(e.ref || '').trim()
  if (ref.length < 8) return { error: 'Falta el identificador del conteo.' }
  const deposito = depositoDeUbicacion(store, b.ubicacion)
  if (!deposito) return { error: `Depósito desconocido: ${b.ubicacion}` }
  const porLinea = new Map()
  const vistas = new Set()
  for (const r of items) {
    const pid = Number(r && r.product_id)
    const sid = Number(r && r.size_id)
    const dif = Number(r && r.dif)
    if (!Number.isInteger(pid) || !Number.isInteger(sid) || !Number.isInteger(dif)) return { error: 'Hay renglones sin variante o con diferencia inválida.' }
    const linea = lineas.get(pid)
    if (!linea) return { error: `El producto ${r.sku || pid} no está en el catálogo.` }
    if (!enErp.includes(linea)) return { error: `El producto ${r.sku || pid} es de una línea que todavía va por Gestión Nube: recargá la página y volvé a contar.` }
    const kk = k(pid, sid)
    if (vistas.has(kk)) return { error: `El producto ${r.sku || kk} está dos veces.` }
    vistas.add(kk)
    if (!dif) continue
    if (!porLinea.has(linea)) porLinea.set(linea, [])
    porLinea.get(linea).push({ product_id: pid, size_id: sid, sku: r.sku || null, barcode: r.barcode || null, contado: Math.max(0, (niveles.get(kk) ?? 0) + dif) })
  }
  const modo = b.resumen && b.resumen.modo ? String(b.resumen.modo) : 'deposito'
  return [...porLinea].map(([linea, renglones]) => ({ linea, deposito, motivo: 'conteo', ref: `conteo:${ref}`.slice(0, 120), detalle: `Conteo del monitor (${modo})`, renglones }))
}
