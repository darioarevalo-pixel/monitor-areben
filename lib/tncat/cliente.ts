/**
 * Cliente de los endpoints de Tienda Nube (`tn-categorias`, `tn-subir-imagen`,
 * `tiendanube-audit`). Port de los fetch de la sección tncat (index.html:7950-8505).
 * Los endpoints NO se tocan: acá se los llama con payloads byte-fieles al legacy.
 *
 * ⚠️ Todas las funciones POST de este módulo ESCRIBEN en la tienda online en vivo
 * (categorías, imágenes, publicación de productos, vínculo foto→color).
 */

import type { Marca } from '../nav'
import type {
  AsigAplicar,
  AsigMatched,
  AsigPreview,
  CatAplicar,
  CatRecalc,
  Categoria,
  ProductoFchk,
  ProductoImg,
  SubirResp,
} from './tipos'

const BASE = 'https://bdi-catalogo.vercel.app/api'
const catUrl = (store: Marca) => `${BASE}/tn-categorias?store=${store}`
const imgUrl = (store: Marca) => `${BASE}/tn-subir-imagen?store=${store}`
const auditUrl = (store: Marca) => `${BASE}/tiendanube-audit?store=${store}`

// ── Categorías por modelo (card 1) ──────────────────────────────────────────────
/** Recalcula el diff de categorías por stock (read-only). Port de tncatCargar. */
export async function recalcularCategorias(store: Marca): Promise<CatRecalc> {
  const r = await fetch(catUrl(store))
  return r.json()
}
/** Aplica el diff calculado en la tienda EN VIVO. Port de tncatAplicar. */
export async function aplicarCategorias(store: Marca): Promise<CatAplicar> {
  const r = await fetch(catUrl(store), { method: 'POST' })
  return r.json()
}

// ── Asignar categoría por Excel (card 4) ────────────────────────────────────────
/** Lista de categorías de la tienda (para el select). Port de tncatAsigInit. */
export async function traerCategorias(store: Marca): Promise<Categoria[]> {
  const r = await fetch(`${catUrl(store)}&accion=cats`)
  const d = await r.json()
  if (!d.ok || !d.categorias) throw new Error(d.error || 'No se pudieron cargar las categorías')
  return d.categorias as Categoria[]
}
/** Previsualiza la asignación (aplicar:false): matched / yaTenían / noEncontrados. Port de tncatAsigPrevisualizar. */
export async function previsualizarAsignar(store: Marca, categoriaId: string, nombres: string[]): Promise<AsigPreview> {
  const r = await fetch(catUrl(store), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accion: 'asignar', categoriaId, nombres, aplicar: false }),
  })
  return r.json()
}
/** Aplica un lote de asignaciones en la tienda EN VIVO. Port del fetch de tncatAsigAplicar. */
export async function aplicarAsignarLote(store: Marca, items: AsigMatched[]): Promise<AsigAplicar> {
  const r = await fetch(catUrl(store), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accion: 'asignar', items }),
  })
  return r.json()
}

// ── Publicar (card 2, botón "Subir y publicar") ─────────────────────────────────
/** Publica (hace visibles) productos en la tienda EN VIVO. Port del fetch de tnImgSubirYPublicar. */
export async function publicar(store: Marca, ids: (string | number)[]): Promise<{ ok: boolean; publicados?: number; errores?: unknown[]; error?: string }> {
  const r = await fetch(catUrl(store), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accion: 'publicar', ids }),
  })
  return r.json()
}

// ── Ocultar agotados (card 5) ───────────────────────────────────────────────────
/** Oculta (despublica) productos en la tienda EN VIVO. Espejo de publicar(), reversible con publicar(). */
export async function despublicar(store: Marca, ids: (string | number)[]): Promise<{ ok: boolean; ocultados?: number; errores?: unknown[]; error?: string }> {
  const r = await fetch(catUrl(store), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accion: 'ocultar', ids }),
  })
  return r.json()
}

// ── Carga de imágenes (card 2) ──────────────────────────────────────────────────
/** Lista de productos con sus colores (para el datalist y el match). Port de tnImgInit/Recargar. */
export async function traerProductosImg(store: Marca, bust = false): Promise<ProductoImg[]> {
  const r = await fetch(`${imgUrl(store)}&productos=1${bust ? '&nc=' + Math.random() : ''}`)
  const j = await r.json()
  return (j.productos || []) as ProductoImg[]
}
/** Sube una imagen (y, si viene `color`, la vincula a la variante). ESCRIBE. Port del fetch de tnImgSubirTodo. */
export async function subirImagen(store: Marca, body: { product_id: string | number; image: string; filename: string; color?: string }): Promise<SubirResp> {
  const r = await fetch(imgUrl(store), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = await r.json().catch(() => ({}))
  return { ...j, ok: r.ok && j.ok }
}
/** Revincula el color de una imagen YA subida (por image_id, no re-sube). ESCRIBE. Port de tnImgRevincular/fchkVincular. */
export async function vincularColor(store: Marca, product_id: string | number, image_id: string | number, color: string): Promise<SubirResp> {
  const r = await fetch(imgUrl(store), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'link', product_id, image_id, color }),
  })
  const j = await r.json().catch(() => ({}))
  return { ...j, ok: r.ok && j.ok }
}
/** Quita (desvincula) la foto de las variantes de un color: PUT image_id null en TN. ESCRIBE. Espejo de vincularColor. */
export async function desvincularColor(store: Marca, product_id: string | number, color: string): Promise<SubirResp> {
  const r = await fetch(imgUrl(store), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'unlink', product_id, color }),
  })
  const j = await r.json().catch(() => ({}))
  return { ...j, ok: r.ok && j.ok }
}

// ── Revisar fotos por variante (card 3) ─────────────────────────────────────────
/** Trae el estado de fotos por variante del audit. Port de fchkAbrir. */
export async function auditVariantes(store: Marca, refrescar = false): Promise<ProductoFchk[]> {
  const r = await fetch(`${auditUrl(store)}&variantes=1${refrescar ? '&refresh=1&nc=' + Math.random() : ''}`)
  const d = await r.json()
  return (d && d.products ? d.products : []) as ProductoFchk[]
}

/** Refresca el caché del audit de Marketing tras subir/publicar (así las fotos nuevas se ven ya). Port de _mktBustAudit. */
export async function bustAudit(store: Marca): Promise<void> {
  try {
    await fetch(`${auditUrl(store)}&refresh=1&nc=${Math.random()}`)
  } catch {
    /* no crítico */
  }
}
