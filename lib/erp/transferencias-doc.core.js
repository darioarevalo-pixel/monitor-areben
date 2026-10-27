/**
 * ERP › Stock › Mover y recibir: lo puro de la pantalla COMPLETA de la transferencia como documento (diseño §3 y §7).
 * Las vistas con su número, el paso de cada estado para la barrita, los nombres de prenda (el renglón del documento sólo
 * trae SKU: el nombre se cruza por product_id + size_id con la lista de stock), los faltantes, el CSV y el remito.
 * Sin red ni DOM. ⛔ No cambia el contrato del motor: el documento llega como lo manda `api/_erp-transferencia.js`.
 */

const clave = (productId, sizeId) => `${productId}_${sizeId}`

/** `{ '10_1': { nombre, talleNombre } }` desde las filas de la lista de stock (una por variante). */
export function nombresDePrendas(filas) {
  const out = {}
  for (const f of filas || []) if (f && f.producto != null && f.talle != null) out[clave(f.producto, f.talle)] = { nombre: f.nombre || null, talleNombre: f.talleNombre || null }
  return out
}

/** «REMERA · M»; sin nombre, el SKU; sin nada, el id. Nunca «null». */
export function nombreDeRenglon(r, nombres) {
  const n = (nombres || {})[clave(r.product_id, r.size_id)]
  if (n && n.nombre) return n.talleNombre ? `${n.nombre} · ${n.talleNombre}` : n.nombre
  return r.sku || `Producto ${r.product_id}/${r.size_id}`
}

export const unidadesEnviadas = (d) => d.renglones.reduce((s, r) => s + (Number(r.enviada) || 0), 0)
export const unidadesRecibidas = (d) => d.renglones.reduce((s, r) => s + (Number(r.recibida) || 0), 0)
/** Positivo: lo que faltó al recibir (las diferencias del documento, sólo las negativas). */
export const faltantesDe = (d) => -(d.diferencias || []).reduce((s, x) => s + Math.min(0, Number(x.diferencia) || 0), 0)
/** Positivo: lo que llegó de más. */
export const sobrantesDe = (d) => (d.diferencias || []).reduce((s, x) => s + Math.max(0, Number(x.diferencia) || 0), 0)

/** La barrita de 4 pasos: cuántos van, cómo termina y qué dice. Recibida completa = verde; con faltantes = rojo. */
/** @returns {{ paso: number, fin: 'curso' | 'ok' | 'rojo' | 'gris', texto: string }} */
export function pasoDeDoc(d) {
  if (d.estado === 'cancelada') return { paso: 0, fin: 'gris', texto: 'Cancelada' }
  if (d.estado === 'borrador') return { paso: 1, fin: 'curso', texto: 'Sin armar' }
  if (d.estado === 'armada') return { paso: 2, fin: 'curso', texto: 'Armada, sin enviar' }
  if (d.estado === 'en_transito') return { paso: 3, fin: 'curso', texto: 'En camino' }
  const falta = faltantesDe(d)
  return falta > 0 ? { paso: 4, fin: 'rojo', texto: `Recibida con ${falta} u de menos` } : { paso: 4, fin: 'ok', texto: 'Recibida' }
}

/** @type {ReadonlyArray<readonly [string, string, (d: any) => boolean]>} */
export const VISTAS_DOC = [
  ['en_camino', 'En camino', (d) => d.estado === 'en_transito'],
  ['sin_enviar', 'Sin enviar', (d) => d.estado === 'borrador' || d.estado === 'armada'],
  ['recibidas', 'Recibidas', (d) => d.estado === 'recibida'],
  ['todas', 'Todas', () => true],
]
export const contarVistasDoc = (docs) => Object.fromEntries(VISTAS_DOC.map(([k, , entra]) => [k, docs.filter(entra).length]))
/** Se entra a lo que pide una mano: lo que está en camino; si no hay, a todas. */
export const vistaDeEntradaDoc = (conteo) => (conteo.en_camino ? 'en_camino' : 'todas')

const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Vista + buscador (nº, prenda, SKU o quién la hizo/recibió). */
export function filtrarDocs(docs, { vista = 'todas', q = '', nombres = {} } = {}) {
  const entra = (VISTAS_DOC.find(([k]) => k === vista) || VISTAS_DOC[3])[2]
  const t = sinTildes(q).trim()
  // «T-7» es el número 7 y nada más (un código de barras que contenga 7 ⛔ cuenta).
  const numero = /^t-?(\d+)$/.exec(t)
  return docs.filter((d) => {
    if (!entra(d)) return false
    if (!t) return true
    if (numero) return String(d.numero) === String(Number(numero[1]))
    const pajar = [String(d.numero), d.creada_por, d.enviada_por, d.recibida_por, d.nota, ...d.renglones.flatMap((r) => [r.sku, r.barcode, nombreDeRenglon(r, nombres)])]
    return pajar.some((x) => x && sinTildes(x).includes(t))
  })
}

const POR = {
  n: (d) => d.numero,
  creada: (d) => Date.parse(d.creada_en) || 0,
  unidades: (d) => unidadesEnviadas(d) || d.renglones.reduce((s, r) => s + (Number(r.armada) || Number(r.pedida) || 0), 0),
  faltan: (d) => faltantesDe(d),
}
/** La más nueva primero, salvo que se pida otro orden. */
export function ordenarDocs(docs, orden) {
  const col = orden && POR[orden.col] ? orden.col : 'n'
  const dir = orden ? (orden.dir === 'asc' ? 1 : -1) : -1
  return docs.slice().sort((a, b) => (POR[col](a) - POR[col](b)) * dir || b.numero - a.numero)
}

/** Lo que se pide ver al reabrir una recepción: los renglones del documento con su diferencia por prenda. */
/** @returns {Array<{ n: number, product_id: number | string, size_id: number | string, sku: string | null, barcode: string | null, pedida: number, armada: number, enviada: number, recibida: number | null, diferencia: number | null }>} */
export function renglonesConDiferencia(d) {
  return d.renglones.map((r) => {
    const enviada = Number(r.enviada) || 0
    const recibida = r.recibida == null ? null : Number(r.recibida)
    return { ...r, enviada, recibida, diferencia: recibida == null ? null : recibida - enviada }
  })
}

const comillas = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`
/** El CSV de lo que se ve (una fila por documento), con BOM para Excel. */
export function csvDeDocs(docs, nombreDeDeposito = (x) => x) {
  const cab = ['Nº', 'Creada', 'De', 'A', 'Estado', 'Quién', 'Enviadas', 'Recibidas', 'Faltaron', 'Nota']
  const filas = docs.map((d) => [`T-${d.numero}`, d.creada_en, nombreDeDeposito(d.desde), nombreDeDeposito(d.hacia), pasoDeDoc(d).texto, d.creada_por, unidadesEnviadas(d), d.estado === 'recibida' ? unidadesRecibidas(d) : '', faltantesDe(d) || '', d.nota ?? ''])
  return '﻿' + [cab, ...filas].map((f) => f.map(comillas).join(';')).join('\r\n')
}

const esc = (x) => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** El remito para imprimir: ruta, quién, la nota y una fila por prenda (enviada, y recibida si ya llegó). */
export function remitoHtml(d, nombres, nombreDeDeposito = (x) => x) {
  const conLlegada = d.estado === 'recibida'
  const filas = renglonesConDiferencia(d).map((r) => `<tr><td>${esc(nombreDeRenglon(r, nombres))}<div class="s">${esc(r.sku ?? '')}</div></td><td class="n">${r.enviada}</td>${conLlegada ? `<td class="n">${r.recibida ?? 0}</td><td class="n">${r.diferencia ? r.diferencia : ''}</td>` : ''}</tr>`).join('')
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Remito T-${d.numero}</title><style>body{font:14px system-ui,sans-serif;margin:32px;color:#101828}h1{font-size:20px;margin:0 0 4px}.s{font-size:12px;color:#667085}table{border-collapse:collapse;width:100%;margin-top:16px}th,td{border-bottom:1px solid #d0d5dd;padding:6px 8px;text-align:left}th.n,td.n{text-align:right}</style></head><body>`
    + `<h1>Transferencia T-${d.numero}</h1><div>${esc(nombreDeDeposito(d.desde))} → ${esc(nombreDeDeposito(d.hacia))} · ${esc(pasoDeDoc(d).texto)}</div>`
    + `<div class="s">Creó ${esc(d.creada_por)}${d.enviada_por ? ` · envió ${esc(d.enviada_por)}` : ''}${d.recibida_por ? ` · recibió ${esc(d.recibida_por)}` : ''}</div>`
    + (d.nota ? `<p>Nota: ${esc(d.nota)}</p>` : '')
    + `<table><thead><tr><th>Producto</th><th class="n">Salió</th>${conLlegada ? '<th class="n">Llegó</th><th class="n">Diferencia</th>' : ''}</tr></thead><tbody>${filas}</tbody></table>`
    + `<script>addEventListener('load',function(){print()})</script></body></html>`
}
