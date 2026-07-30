/**
 * En qué orden se arreglan las fotos, y sobre qué parte del catálogo se mira.
 *
 * **Contar productos ordena mal.** Medido en BDI: BORDER CASE tiene 3 variantes con la foto
 * cruzada y PROTECTOR DE CÁMARA METALIZADO tiene 63. Veintiuna veces más. Una lista que dice
 * "5 productos con problema" los pone en la misma fila y hace que se les dedique el mismo
 * esfuerzo — y encima BORDER CASE, que es el caso famoso de la auditoría, es un producto de un
 * solo modelo, de salida.
 *
 * Por eso la unidad es la **publicación**: cada combinación color × modelo es una publicación
 * distinta en Mercado Libre y lleva su foto. Lo que hay que bajar a cero son publicaciones
 * saliendo mal, no productos con una marquita.
 *
 * Los tres ingredientes del puntaje ya vienen en lo que la pantalla carga: el catálogo de TN
 * trae las variantes afectadas, y el stock y las ventas por producto salen del payload del ETL
 * que la sección ya tiene en memoria. Cero consultas nuevas.
 */

import { estadoDe, huellaDe } from './auditoria'
import type { ProductoFchk } from './tipos'

/** Un producto listo para ordenar y filtrar, con todo lo que la pantalla necesita mostrar. */
export type FilaAuditoria = {
  producto: ProductoFchk
  estado: ReturnType<typeof estadoDe>
  /** Unidades en Gestión Nube (fuente de verdad), o undefined si el cruce no lo encontró. */
  stock?: number
  /** Unidades vendidas en los últimos 90 días, o undefined si el cruce no lo encontró. */
  ventas90?: number
  /** Cuánto duele: publicaciones mal × qué tanto se vende ese producto. */
  impacto: number
  /** `true` si alguien lo dio por revisado y las fotos no cambiaron desde entonces. */
  verificado: boolean
  /** `true` si estaba verificado pero las fotos cambiaron después: vuelve a la lista. */
  cambioDesdeRevision: boolean
}

export type ContextoPrioridad = {
  stockPorTn?: Map<string, number>
  ventas90PorTn?: Map<string, number>
  /** id de TN → huella con la que se dio por verificado. */
  huellasVerificadas?: Map<string, string>
}

/**
 * El puntaje de impacto.
 *
 * Base: las publicaciones que salen mal, con la foto cruzada pesando **el triple** que la
 * variante sin foto. No son igual de graves: el color sin foto se nota (el cliente ve un hueco
 * o la principal), la foto cruzada engaña —el cliente compra violeta convencido y le llega
 * negra, y eso es un cambio, un flete y una reputación.
 *
 * Multiplicador por venta: un producto que vendió en los últimos 90 días pesa más que uno
 * parado. Es logarítmico para que un best-seller no aplaste a todo lo demás — la idea es
 * ordenar, no que la lista tenga un solo elemento arriba y el resto en cero.
 *
 * Sin dato de ventas se asume un multiplicador medio: el cruce GN⨯TN es difuso y no encontrarlo
 * no es lo mismo que "no vende". Preferimos que sobre un producto antes que esconder uno que sí
 * hay que arreglar.
 */
export function impactoDe(fila: Omit<FilaAuditoria, 'impacto'>): number {
  const { estado, ventas90, stock } = fila
  const base = estado.variantesCruzadas * 3 + estado.variantesSinFoto
  if (!base) return 0
  const porVenta = ventas90 === undefined ? 2 : 1 + Math.log10(1 + ventas90) * 2
  // Sin stock la foto no vende hoy: pesa, pero no desaparece (puede reingresar mercadería).
  const porStock = stock === undefined ? 1 : stock > 0 ? 1 : 0.3
  return base * porVenta * porStock
}

/**
 * Arma las filas con estado, cruces, impacto y el resultado de comparar la huella. No filtra ni
 * ordena.
 *
 * La comparación de huella es lo que hace que el "Verificado" caduque solo: si alguien tocó las
 * fotos después de la revisión, el producto deja de estar verificado y vuelve marcado como
 * cambiado. Sin eso, un verificado viejo tapa un error nuevo — que es peor que no auditar,
 * porque da confianza falsa.
 */
export function armarFilas(data: ProductoFchk[], ctx: ContextoPrioridad = {}): FilaAuditoria[] {
  return data.map((producto) => {
    const id = String(producto.id)
    const guardada = ctx.huellasVerificadas?.get(id)
    const coincide = guardada !== undefined && guardada === huellaDe(producto)
    const parcial = {
      producto,
      estado: estadoDe(producto),
      stock: ctx.stockPorTn?.get(id),
      ventas90: ctx.ventas90PorTn?.get(id),
      verificado: coincide,
      cambioDesdeRevision: guardada !== undefined && !coincide,
    }
    return { ...parcial, impacto: impactoDe(parcial) }
  })
}

// ── Filtros ─────────────────────────────────────────────────────────────────────
/**
 * Los recortes: sobre qué parte del catálogo se está mirando.
 *
 * `ventaDesde` es el que hace manejable a Zattia. Y el mismo criterio vale para el
 * "Verificado": no hace falta verificar a ojo un producto que no se vende. Si mañana empieza a
 * venderse, aparece solo. Eso convierte "revisar todo" —que nunca se termina y por eso se
 * abandona— en "que no quede nada roto entre lo que se vende", que sí se termina.
 */
export type Recortes = {
  /** Descarta lo que tiene stock 0 en Gestión Nube. */
  soloConStock?: boolean
  /** Descarta lo que no vendió nada en los últimos 90 días. */
  soloQueSeVende?: boolean
  /** Descarta lo despublicado en la tienda. */
  soloPublicado?: boolean
  /** Mínimo de variantes del producto: separa un METALIZADO (63) de un BORDER CASE (4). */
  minVariantes?: number
  categoria?: string | null
  ignorados?: Set<string>
  /** Muestra también lo ya verificado (por defecto se esconde: el trabajo está hecho). */
  verVerificados?: boolean
}

export function aplicarRecortes(filas: FilaAuditoria[], r: Recortes): FilaAuditoria[] {
  return filas.filter((f) => {
    const p = f.producto
    if (r.ignorados?.has(String(p.id))) return false
    if (!r.verVerificados && f.verificado) return false
    if (r.categoria && !(p.categories || []).includes(r.categoria)) return false
    if (r.soloPublicado && p.published === false) return false
    if (r.minVariantes && (p.variantes || []).length < r.minVariantes) return false
    // Sin dato de stock o de ventas se MUESTRA: el cruce GN⨯TN es difuso y puede no encontrar
    // el producto. Esconder de más es peor que mostrar de más — lo que se arregla tarde cuesta
    // ventas, y lo que sobra en la lista solo cuesta un vistazo.
    if (r.soloConStock && f.stock !== undefined && f.stock <= 0) return false
    if (r.soloQueSeVende && f.ventas90 !== undefined && f.ventas90 <= 0) return false
    return true
  })
}

// ── Filtro de tipo de problema ──────────────────────────────────────────────────
export type FiltroProblema =
  /** Todo lo que la auditoría considera roto. */
  | 'todo'
  /** La misma foto en dos colores: el error que engaña al cliente. */
  | 'cruzada'
  /** Colores sin ninguna foto vinculada. */
  | 'sin-foto'
  /** Se resuelve acá, sin sacar fotos nuevas. */
  | 'escritorio'
  /** Necesita fotos que no existen. */
  | 'fotografia'

export function predicadoDe(f: FiltroProblema): (fila: FilaAuditoria) => boolean {
  switch (f) {
    case 'cruzada':
      return (x) => x.estado.choques.length > 0
    case 'sin-foto':
      return (x) => x.estado.sinFoto.length > 0
    case 'escritorio':
      return (x) => x.estado.hayProblema && (x.estado.cola === 'escritorio' || x.estado.cola === 'mixto')
    case 'fotografia':
      return (x) => x.estado.cola === 'fotografia' || x.estado.cola === 'mixto'
    default:
      // "Cambió desde la revisión" entra aunque no haya problema detectable: puede ser
      // justamente lo que la automatización no ve (una foto de otro color, bien vinculada).
      // Para eso existe la huella; esconderlo acá la haría inútil.
      return (x) => x.estado.hayProblema || x.cambioDesdeRevision
  }
}

/** Ordena por lo que más duele. A igual impacto, alfabético, para que la lista no baile. */
export function ordenar(filas: FilaAuditoria[]): FilaAuditoria[] {
  return [...filas].sort(
    (a, b) => b.impacto - a.impacto || (a.producto.name || '').localeCompare(b.producto.name || '', 'es'),
  )
}

/** Los dos números del tablero, contados sobre lo que se está mirando. */
export function resumen(filas: FilaAuditoria[]): { cruzadas: number; sinFoto: number; productos: number } {
  return {
    cruzadas: filas.reduce((a, f) => a + f.estado.variantesCruzadas, 0),
    sinFoto: filas.reduce((a, f) => a + f.estado.variantesSinFoto, 0),
    productos: filas.filter((f) => f.estado.hayProblema || f.cambioDesdeRevision).length,
  }
}

// ── Buscador ────────────────────────────────────────────────────────────────────
/**
 * Busca en el catálogo **entero**, salteando todos los recortes y el filtro de problema.
 *
 * El buscador que había buscaba dentro de lo ya filtrado, y por eso no servía para lo único que
 * se le pide: si hoy se busca "BORDER CASE" no aparece nada, porque figura como "4 de 4 colores
 * con foto ✓" y el filtro lo esconde antes de que el buscador lo mire. El producto que originó
 * esta auditoría era invisible al buscador de la pantalla que debería encontrarlo.
 *
 * El criterio nuevo: **si lo estás buscando a propósito, ya decidiste que te importa.** Los
 * filtros son para cuando no sabés por dónde empezar; el buscador es para cuando sí sabés.
 *
 * Busca por nombre, por SKU del producto y por **SKU o código de barras de las variantes**, que
 * es lo que permite tener el producto en la mano y escanearlo. Cuál de los dos códigos está
 * cargado depende de la marca (BDI: barcode 88% / sku 63%; Zattia al revés), así que se miran
 * los dos.
 */
export function buscar(filas: FilaAuditoria[], texto: string): FilaAuditoria[] {
  const q = texto.trim().toLowerCase()
  if (!q) return []
  const coincide = (s: string | null | undefined) => !!s && s.toLowerCase().includes(q)
  return filas.filter((f) => {
    const p = f.producto
    if (coincide(p.name) || coincide(p.sku)) return true
    return (p.variantes || []).some((v) => coincide(v.sku) || coincide(v.barcode))
  })
}

/**
 * Qué mostrar al lado del nombre para no confundir dos productos.
 *
 * Hay dos productos distintos llamados "ICONIC CASE" en BDI. Sin esto se arregla el equivocado.
 */
export function referenciaDe(p: ProductoFchk): string {
  const codigo = p.sku || (p.variantes || []).map((v) => v.sku || v.barcode).find(Boolean)
  const colores = (p.variantes || []).filter((v) => v.color).length
  return [codigo ? `cód. ${codigo}` : null, colores ? `${(p.variantes || []).length} variantes` : null, `id ${p.id}`]
    .filter(Boolean)
    .join(' · ')
}

/** Las categorías presentes, ordenadas y sin repetir (para el desplegable). */
export function categoriasDe(filas: FilaAuditoria[]): string[] {
  const set = new Set<string>()
  for (const f of filas) for (const c of f.producto.categories || []) if (c) set.add(c)
  return [...set].sort((a, b) => a.localeCompare(b, 'es'))
}
