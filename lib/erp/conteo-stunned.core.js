/**
 * EL CONTEO DE STUNNED VA AL ERP, ⛔ AL EXCEL DE GN (erp-stunned §8.4, Bruno 30-oct). Puro.
 *
 * Desde el corte (28-oct) el GN de Zattia ⛔ mueve el libro de Stunned: su stock de las prendas STU es viejo, y el Excel de
 * «Importar y Ajustar» corregiría un número que ya nadie lee. Para las prendas STU de los conteos (Conteo estándar de Stunned y
 * las STU del Conteo de depósito de Zattia, que las mezcla):
 *   · el «sistema» que se ve al contar es el LIBRO del depósito (`conLibro`), ⛔ GN;
 *   · al guardar, sus diferencias son UN ajuste «Conteo» de la línea `stunned`, APLICADO en el acto (Bruno 30-oct: «lo aplicaría
 *     en el momento, y luego de última volvemos a ajustar»), y salen del Excel (`partirExcel`).
 * 🔑 Como el Excel, el ajuste es `libro + dif` (`dif` congelada al terminar la prenda contra lo que se veía al abrirla): una venta
 * entre el conteo y el guardado ⛔ se cuenta dos veces.
 */

import { esStunned } from '../lineas.core.js'

/** El depósito de la línea `stunned` de cada `loc` del vivo (`api/_inventario-vivo.js`). */
export const DEPOSITO_DE_LOC = { deposito: 'deposito', local: 'local' }

/** El depósito del ERP del `ubicacion` que guarda el conteo («Deposito », «Local»): el nombre de GN en minúscula, como el motor. */
export const depositoDeUbicacion = (ubicacion) => String(ubicacion ?? '').trim().toLowerCase().replace(/\s+/g, '_')

/** Las variantes STU de unas filas del vivo, para leerles el libro. */
export function variantesStunned(rows) {
  return (Array.isArray(rows) ? rows : []).filter((r) => r && esStunned(r.sku)).map((r) => ({ product_id: Number(r.product_id), size_id: Number(r.size_id) }))
}

/**
 * Las filas del vivo con el LIBRO en las STU (`fuente: 'erp'`); las de Zattia, como vinieron. `niveles`: `pid:sid` → nivel
 * (sin fila en el libro = 0).
 */
export function conLibro(rows, niveles) {
  return (Array.isArray(rows) ? rows : []).map((r) => (r && esStunned(r.sku)
    ? { ...r, available_quantity: niveles.get(`${Number(r.product_id)}:${Number(r.size_id)}`) ?? 0, fuente: 'erp' }
    : r))
}

/**
 * Parte las filas del ajuste de un conteo: las que van al Excel de GN y las STU que van al ERP. Una fila del ajuste ⛔ trae la
 * variante: se busca en el vivo por `inventory_id`. `erp`: `{ product_id, size_id, sku, barcode, dif }`.
 * @param {Array<{ inventory_id: any, barcode?: string, dif: number }>} rows @param {Record<string, any>} vivo vid → fila del vivo
 */
export function partirExcel(rows, vivo) {
  const porInv = new Map(Object.values(vivo || {}).filter((v) => v && v.inventory_id != null).map((v) => [String(v.inventory_id), v]))
  const excel = []
  const erp = []
  for (const r of rows || []) {
    const v = porInv.get(String(r.inventory_id))
    if (v && v.fuente === 'erp') erp.push({ product_id: Number(v.product_id), size_id: Number(v.size_id), sku: v.sku || null, barcode: v.barcode || r.barcode || null, dif: Number(r.dif) })
    else excel.push(r)
  }
  return { excel, erp }
}

/**
 * El ajuste del motor para la parte STU de un conteo: `{ linea, deposito, motivo: 'conteo', ref, detalle, renglones }`, `null` si
 * ⛔ trae nada para el ERP, o `{ error }`. La LÍNEA la decide el servidor (`lineas`: product_id → línea, de `productos.sku`):
 * un renglón que ⛔ es de Stunned frena (la pantalla vieja que lo mande ⛔ ajusta Zattia en el ERP). `niveles`: el libro AHORA
 * (`pid:sid` → nivel); lo contado = `libro + dif`, nunca menos de 0.
 * @param {any} b el cuerpo del POST del conteo @param {string} store @param {Map<number, string>} lineas @param {Map<string, number>} niveles
 */
export function ajusteDeConteo(b, store, lineas, niveles) {
  const e = b && b.erp
  const items = e && Array.isArray(e.renglones) ? e.renglones : []
  if (!items.length) return null
  if (store !== 'zattia') return { error: 'El conteo al ERP es sólo de Stunned (Zattia).' }
  const ref = String(e.ref || '').trim()
  if (ref.length < 8) return { error: 'Falta el identificador del conteo.' }
  const deposito = depositoDeUbicacion(b.ubicacion)
  if (!Object.values(DEPOSITO_DE_LOC).includes(deposito)) return { error: `Depósito desconocido para Stunned: ${b.ubicacion}` }
  const renglones = []
  const vistas = new Set()
  for (const r of items) {
    const pid = Number(r && r.product_id)
    const sid = Number(r && r.size_id)
    const dif = Number(r && r.dif)
    if (!Number.isInteger(pid) || !Number.isInteger(sid) || !Number.isInteger(dif)) return { error: 'Hay renglones sin variante o con diferencia inválida.' }
    if (lineas.get(pid) !== 'stunned') return { error: `El producto ${r.sku || pid} no es de Stunned: el ERP ajusta sólo Stunned.` }
    const k = `${pid}:${sid}`
    if (vistas.has(k)) return { error: `El producto ${r.sku || k} está dos veces.` }
    vistas.add(k)
    if (!dif) continue
    renglones.push({ product_id: pid, size_id: sid, sku: r.sku || null, barcode: r.barcode || null, contado: Math.max(0, (niveles.get(k) ?? 0) + dif) })
  }
  if (!renglones.length) return null
  const modo = b.resumen && b.resumen.modo ? String(b.resumen.modo) : 'deposito'
  return { linea: 'stunned', deposito, motivo: 'conteo', ref: `conteo:${ref}`.slice(0, 120), detalle: `Conteo del monitor (${modo})`, renglones }
}
