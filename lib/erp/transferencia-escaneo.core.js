/**
 * ERP › Stock › Mover y recibir: lo puro de la pantalla mínima de la transferencia LIBRE con lector (Stunned primero).
 * Una lista de prendas escaneadas (una por variante, con su cantidad) que se manda al motor como `renglones`, y la cuenta de
 * lo que llegó contra lo que salió. Sin red ni DOM. Contrato del documento: `areben-motor/TRANSFERENCIA.md`.
 */

/** Las líneas con depósitos propios: Stunned vive en la base de Zattia pero se mueve entre los mismos dos. */
export const DEPOSITOS_DE_LINEA = { bdi: ['local', 'deposito_minorista', 'deposito_mayorista'], zattia: ['local', 'deposito'], stunned: ['local', 'deposito'] }

/** Suma UNA unidad de la prenda escaneada (o `cantidad`). Misma variante ⇒ la misma fila; no muta la lista. */
export function sumarEscaneo(lista, prenda, cantidad = 1) {
  const n = Math.trunc(Number(cantidad))
  if (!prenda || !prenda.producto || !prenda.talle || !Number.isFinite(n) || n <= 0) return lista
  const i = lista.findIndex((r) => r.producto === prenda.producto && r.talle === prenda.talle)
  if (i >= 0) return lista.map((r, j) => (j === i ? { ...r, cantidad: r.cantidad + n } : r))
  return [...lista, { producto: prenda.producto, talle: prenda.talle, sku: prenda.sku ?? null, barcode: prenda.barcode ?? null, nombre: prenda.nombre ?? null, talleNombre: prenda.talleNombre ?? null, cantidad: n }]
}

/** Fija la cantidad de una fila (0 o vacío la saca). */
export function fijarCantidad(lista, producto, talle, cantidad) {
  const n = Math.trunc(Number(cantidad))
  return lista.flatMap((r) => (r.producto === producto && r.talle === talle ? (Number.isFinite(n) && n > 0 ? [{ ...r, cantidad: n }] : []) : [r]))
}

/** Lo que viaja al motor: ids, SKU y código de barras, ⛔ los nombres de la pantalla. */
export const renglonesParaMotor = (lista) => lista.filter((r) => r.cantidad > 0)
  .map((r) => ({ product_id: r.producto, size_id: r.talle, sku: r.sku, barcode: r.barcode, cantidad: r.cantidad }))

export const unidades = (lista) => lista.reduce((s, r) => s + r.cantidad, 0)

/** Un escaneo exacto (SKU o código de barras) ⇒ esa prenda; si no, no hay una sola y la persona elige. */
export function prendaExacta(variantes, texto) {
  const t = String(texto || '').trim().toLowerCase()
  if (!t) return null
  const hit = variantes.filter((v) => (v.barcode && String(v.barcode).toLowerCase() === t) || (v.sku && String(v.sku).toLowerCase() === t))
  return hit.length === 1 ? hit[0] : null
}

/** La lista para RECIBIR: lo que salió (cuenta 0 hasta escanearlo) y lo escaneado. `enviadas` = los renglones del documento; `nombres` (de `nombresDePrendas`) les pone el nombre. */
export function listaDeRecepcion(enviadas, nombres = {}) {
  return (enviadas || []).filter((r) => Number(r.enviada) > 0)
    .map((r) => {
      const n = nombres[`${r.product_id}_${r.size_id}`]
      return { producto: String(r.product_id), talle: String(r.size_id), sku: r.sku ?? null, barcode: r.barcode ?? null, nombre: n?.nombre ?? null, talleNombre: n?.talleNombre ?? null, enviada: Number(r.enviada), cantidad: 0 }
    })
}

/** Contra lo que salió: `falta` (negativo) / `sobra` (escaneó algo que ⛔ salió ahí, el motor lo rechaza). */
export function cuentaDeRecepcion(lista) {
  const filas = lista.map((r) => ({ ...r, diferencia: r.cantidad - (r.enviada ?? 0) }))
  return { filas, faltan: filas.reduce((s, r) => s + Math.min(0, r.diferencia), 0), sobran: filas.reduce((s, r) => s + (r.enviada == null ? r.cantidad : Math.max(0, r.diferencia)), 0), completa: filas.every((r) => r.diferencia === 0) }
}
