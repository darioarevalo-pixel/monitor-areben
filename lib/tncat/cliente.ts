/**
 * Cliente de los endpoints de Tienda Nube (`tn-categorias`, `tn-subir-imagen`,
 * `tiendanube-audit`). Port de los fetch de la sección tncat (index.html:7950-8505).
 * Los endpoints NO se tocan: acá se los llama con payloads byte-fieles al legacy.
 *
 * ⚠️ Todas las funciones POST de este módulo ESCRIBEN en la tienda online en vivo
 * (categorías, imágenes, publicación de productos, vínculo foto→color).
 *
 * Por eso van con **`apiFetch`** y no con `fetch` pelado: manda el header `x-monitor-auth` con
 * la credencial de quien está usando el Monitor. Del otro lado, `bdi-catalogo` la exige — antes
 * estos endpoints estaban abiertos a cualquiera con la URL, o sea que desde afuera se podía
 * vaciar la tienda o poner el stock en cero. Las lecturas van con `apiFetch` también: cuesta lo
 * mismo y deja el camino listo para cuando se cierren.
 */

import { apiFetch } from '../api-fetch'
import { invalidarAudit, traerAudit } from '../tn-audit'
import type { Marca } from '../nav'
import type {
  AsigAplicar,
  AsigMatched,
  AsigPreview,
  CatAplicar,
  CatRecalc,
  Categoria,
  ProductoCat,
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
  const r = await apiFetch(catUrl(store))
  return r.json()
}
/**
 * Aplica el diff calculado en la tienda EN VIVO. Port de tncatAplicar.
 *
 * 🔑 Manda `accion:'auto-modelos'` aunque el servidor todavía acepte el POST pelado. El
 * POST sin `accion` era el ÚNICO verbo de este endpoint sin nombre, y por eso era también
 * el destino al que caía cualquier acción que `bdi-catalogo` no conociera —así se
 * recategorizó Zattia entera el 13-ago-2026—. Con la acción puesta, el día que el servidor
 * saque el fallback del POST pelado esta llamada ya está del lado correcto.
 */
export async function aplicarCategorias(store: Marca): Promise<CatAplicar> {
  const r = await apiFetch(catUrl(store), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accion: 'auto-modelos' }),
  })
  return r.json()
}

// ── Asignar categoría por Excel (card 4) ────────────────────────────────────────
/** Lista de categorías de la tienda (para el select). Port de tncatAsigInit. */
export async function traerCategorias(store: Marca): Promise<Categoria[]> {
  const r = await apiFetch(`${catUrl(store)}&accion=cats`)
  const d = await r.json()
  if (!d.ok || !d.categorias) throw new Error(d.error || 'No se pudieron cargar las categorías')
  return d.categorias as Categoria[]
}
/**
 * Previsualiza la asignación (aplicar:false): matched / yaTenían / noEncontrados. Port de
 * tncatAsigPrevisualizar.
 *
 * Con `sacar` hace lo contrario: le QUITA la categoría a los que la tengan. Es lo que hace falta al
 * terminar un sale, donde las subcategorías (`SALE · …`) son temporales y hay que sacárselas a 260
 * productos — borrar la categoría en Tienda Nube no es lo mismo.
 */
export async function previsualizarAsignar(store: Marca, categoriaId: string, nombres: string[], sacar = false): Promise<AsigPreview> {
  const r = await apiFetch(catUrl(store), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accion: sacar ? 'desasignar' : 'asignar', categoriaId, nombres, aplicar: false }),
  })
  return r.json()
}
/** Aplica un lote de asignaciones en la tienda EN VIVO. Port del fetch de tncatAsigAplicar. */
export async function aplicarAsignarLote(store: Marca, items: AsigMatched[]): Promise<AsigAplicar> {
  const r = await apiFetch(catUrl(store), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accion: 'asignar', items }),
  })
  return r.json()
}

// ── Publicar (card 2, botón "Subir y publicar") ─────────────────────────────────
/** Publica (hace visibles) productos en la tienda EN VIVO. Port del fetch de tnImgSubirYPublicar. */
export async function publicar(store: Marca, ids: (string | number)[]): Promise<{ ok: boolean; publicados?: number; errores?: unknown[]; error?: string }> {
  const r = await apiFetch(catUrl(store), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accion: 'publicar', ids }),
  })
  return r.json()
}

// ── Ocultar agotados (card 5) ───────────────────────────────────────────────────
/** Oculta (despublica) productos en la tienda EN VIVO. Espejo de publicar(), reversible con publicar(). */
export async function despublicar(store: Marca, ids: (string | number)[]): Promise<{ ok: boolean; ocultados?: number; errores?: unknown[]; error?: string }> {
  const r = await apiFetch(catUrl(store), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accion: 'ocultar', ids }),
  })
  return r.json()
}

// ── Carga de imágenes (card 2) ──────────────────────────────────────────────────
/**
 * Lista de productos con sus colores (para el datalist y el match). Port de tnImgInit/Recargar.
 *
 * Cacheada por marca mientras vive la pestaña: es el endpoint más lento de la sección (~2,5 s
 * medidos) y se pedía de nuevo en cada montaje de la card. Lo que devuelve son los productos y
 * sus colores —o sea, las variantes de TiendaNube—, que no cambian por subir una foto. Para el
 * caso en que sí cambien (se creó un producto recién) está el botón "Recargar productos", que
 * es `bust` y saltea el caché.
 */
const productosImg = new Map<Marca, ProductoImg[]>()
const productosImgEnVuelo = new Map<Marca, Promise<ProductoImg[]>>()

export async function traerProductosImg(store: Marca, bust = false): Promise<ProductoImg[]> {
  if (!bust) {
    const ya = productosImg.get(store)
    if (ya) return ya
    const yendo = productosImgEnVuelo.get(store)
    if (yendo) return yendo
  }

  const p = (async () => {
    const r = await apiFetch(`${imgUrl(store)}&productos=1${bust ? '&nc=' + Math.random() : ''}`)
    const j = await r.json()
    const filas = (j.productos || []) as ProductoImg[]
    productosImg.set(store, filas)
    return filas
  })().finally(() => {
    if (productosImgEnVuelo.get(store) === p) productosImgEnVuelo.delete(store)
  })
  if (!bust) productosImgEnVuelo.set(store, p)
  return p
}

/** Tira la lista cacheada de la marca. */
export function invalidarProductosImg(store: Marca): void {
  productosImg.delete(store)
}
/** Sube una imagen (y, si viene `color`, la vincula a la variante). ESCRIBE. Port del fetch de tnImgSubirTodo. */
export async function subirImagen(store: Marca, body: { product_id: string | number; image: string; filename: string; color?: string }): Promise<SubirResp> {
  const r = await apiFetch(imgUrl(store), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = await r.json().catch(() => ({}))
  return { ...j, ok: r.ok && j.ok }
}
/** Revincula el color de una imagen YA subida (por image_id, no re-sube). ESCRIBE. Port de tnImgRevincular/fchkVincular. */
export async function vincularColor(store: Marca, product_id: string | number, image_id: string | number, color: string): Promise<SubirResp> {
  const r = await apiFetch(imgUrl(store), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'link', product_id, image_id, color }),
  })
  const j = await r.json().catch(() => ({}))
  return { ...j, ok: r.ok && j.ok }
}
/** Quita (desvincula) la foto de las variantes de un color: PUT image_id null en TN. ESCRIBE. Espejo de vincularColor. */
export async function desvincularColor(store: Marca, product_id: string | number, color: string): Promise<SubirResp> {
  const r = await apiFetch(imgUrl(store), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'unlink', product_id, color }),
  })
  const j = await r.json().catch(() => ({}))
  return { ...j, ok: r.ok && j.ok }
}

// ── Revisar fotos por variante (card 3) ─────────────────────────────────────────
/**
 * Trae el estado de fotos por variante del audit. Port de fchkAbrir.
 *
 * Es el payload pesado (`?variantes=1`). Va por `traerAudit`, que lo cachea y con eso le
 * ahorra la bajada a quien después pida el liviano: es el mismo objeto con dos campos de más.
 */
export async function auditVariantes(store: Marca, refrescar = false): Promise<ProductoFchk[]> {
  return traerAudit<ProductoFchk>(store, { variantes: true, refrescar })
}

/**
 * Productos de la tienda con sus categorías (sin el detalle por variante, que pesa el doble).
 * Es lo que permite recorrer la tienda POR categoría en vez de a ciegas.
 */
export async function auditProductos(store: Marca, refrescar = false): Promise<ProductoCat[]> {
  return traerAudit<ProductoCat>(store, { refrescar })
}

/** Refresca el caché del audit de Marketing tras subir/publicar (así las fotos nuevas se ven ya). Port de _mktBustAudit. */
export async function bustAudit(store: Marca): Promise<void> {
  // Primero lo de acá, que es sincrónico y no puede fallar: si se cae la llamada, igual queda
  // invalidado y la próxima lectura baja de nuevo. Al revés, un throw dejaría el caché local
  // sirviendo la tienda de antes de escribir.
  invalidarAudit(store)
  try {
    await apiFetch(`${auditUrl(store)}&refresh=1&nc=${Math.random()}`)
  } catch {
    /* no crítico */
  }
}
