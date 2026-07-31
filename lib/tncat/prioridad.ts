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

import { estadoDe, huellaDe, type EstadoFotos } from './auditoria'
import { unidadesSinFoto as unidadesSinFotoDe, type IndiceStock } from './stock-variante'
import type { ProductoFchk } from './tipos'

/** Un producto listo para ordenar y filtrar, con todo lo que la pantalla necesita mostrar. */
export type FilaAuditoria = {
  producto: ProductoFchk
  estado: ReturnType<typeof estadoDe>
  /** Unidades en Gestión Nube (fuente de verdad), o undefined si el cruce no lo encontró. */
  stock?: number
  /** Unidades vendidas en los últimos 90 días, o undefined si el cruce no lo encontró. */
  ventas90?: number
  /**
   * Unidades que están esperando una foto: las variantes con color y sin foto propia, cruzadas
   * con Gestión Nube por código. `undefined` = ninguna de esas variantes se pudo cruzar.
   *
   * Es lo que convierte "a este producto le falta una foto" en "hay 1.257 unidades esperando".
   */
  unidadesSinFoto?: number
  /** Cuánto duele lo que YA se detectó: publicaciones mal × qué tanto se vende ese producto. */
  impacto: number
  /**
   * Cuánto costaría que esté mal **sin que lo sepamos**. Ordena la cola de revisión a ojo, donde
   * todos los productos tienen impacto cero justamente porque no se les detectó nada: sin esto,
   * esa lista saldría alfabética y se revisarían primero los que menos importan.
   */
  riesgo: number
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
  /**
   * Índice de stock de GN por código, para llegar al stock **por variante**. El `stockPorTn` de
   * arriba es a nivel producto y por nombre (difuso); este es exacto y por variante, y es el
   * único que puede decir cuántas unidades están esperando una foto.
   */
  stockGn?: IndiceStock
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
export function impactoDe(fila: Pick<FilaAuditoria, 'estado' | 'ventas90' | 'stock' | 'unidadesSinFoto'>): number {
  const { estado, ventas90, stock, unidadesSinFoto } = fila
  // Un producto sin NINGUNA foto no tiene colores rotos que contar, pero está roto entero: la
  // tienda lo muestra en blanco. Pesa por sus variantes, o por una si no tiene ninguna.
  const base = estado.sinNingunaFoto
    ? Math.max(1, estado.colores.length || 1) + estado.variantesSinFoto
    : estado.variantesCruzadas * 3 + estado.variantesSinFoto
  if (!base) return 0
  const porVenta = ventas90 === undefined ? 2 : 1 + Math.log10(1 + ventas90) * 2
  /**
   * El stock, cuando se sabe cuánto es.
   *
   * Con las unidades reales por variante se escala por cantidad: 1.257 unidades sin foto no
   * pueden pesar lo mismo que 3. Logarítmico, como las ventas, para que un producto enorme no
   * aplaste al resto y la lista siga siendo una lista y no un solo elemento.
   *
   * Sin ese dato se cae al criterio anterior, que es binario: hay stock o no hay.
   */
  const porStock =
    unidadesSinFoto !== undefined
      ? unidadesSinFoto > 0
        ? 1 + Math.log10(1 + unidadesSinFoto) * 2
        : 0.3
      : stock === undefined
        ? 1
        : stock > 0
          ? 1
          : 0.3
  return base * porVenta * porStock
}

/**
 * Cuánto costaría que este producto tenga una foto en el color equivocado sin que lo sepamos.
 *
 * Es lo que ordena la cola de revisión a ojo. Ahí todos tienen impacto cero —no se les detectó
 * nada— así que sin esto la lista saldría alfabética y se empezaría por lo que menos importa.
 * Pesa por publicaciones en juego (variantes con color) y por cuánto se vende, con la misma
 * escala logarítmica del impacto para que un best-seller no aplaste al resto.
 */
export function riesgoDe(fila: Pick<FilaAuditoria, 'producto' | 'estado' | 'ventas90' | 'stock'>): number {
  const { estado, ventas90, stock, producto } = fila
  // Sin color en la variante no hay forma de que una foto caiga en el color equivocado: el
  // producto entero es de un color y todas sus fotos son de ese color.
  if (estado.colores.length < 2) return 0
  const publicaciones = (producto.variantes || []).filter((v) => v.color).length
  const porVenta = ventas90 === undefined ? 2 : 1 + Math.log10(1 + ventas90) * 2
  const porStock = stock === undefined ? 1 : stock > 0 ? 1 : 0.3
  return publicaciones * porVenta * porStock
}

/**
 * Cuántas unidades están esperando una foto.
 *
 * Primero por variante, cruzando por código: es lo preciso, y permite atribuir las unidades al
 * color exacto.
 *
 * **Respaldo cuando el producto no tiene códigos cargados en TiendaNube.** Pasa: `PROTECTOR DE
 * CAMARA LISO` tiene 57 variantes y ninguna tiene SKU ni código de barras, así que cruzan 0 de 57
 * — y es de los productos que más importan. Si además **ninguna** de sus variantes tiene foto,
 * entonces el stock del producto entero ES lo que está esperando foto: no hay nada que atribuir a
 * un color con foto, porque no hay ninguno. Ahí se usa el total del producto, que llega por el
 * cruce difuso por nombre de `stockPorProductoTn`.
 *
 * Fuera de ese caso no se inventa nada: si faltan códigos y solo algunos colores están sin foto,
 * no hay forma de saber cuántas unidades son de esos colores, y queda `undefined`.
 *
 * ⚠️ El respaldo exige que la auditoría haya encontrado un problema. Sin eso se disparaba en los
 * productos de un solo color —los que tienen el color en el nombre, como `CABLE BDI … - NEGRO`—,
 * donde que la variante no tenga foto propia es lo normal: usa la principal del producto, que es
 * de ese único color. Contarlos infló el total de BDI de ~500 a 27.000 unidades.
 */
function unidadesEsperandoFoto(
  p: ProductoFchk,
  estado: EstadoFotos,
  ctx: ContextoPrioridad,
  id: string,
): number | undefined {
  if (ctx.stockGn) {
    const porVariante = unidadesSinFotoDe(p, ctx.stockGn)
    if (porVariante !== undefined) return porVariante
  }
  if (!estado.hayProblema) return undefined
  const variantes = p.variantes || []
  const ningunaTieneFoto = variantes.length > 0 && variantes.every((v) => !v.image_url)
  return ningunaTieneFoto ? ctx.stockPorTn?.get(id) : undefined
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
    const estado = estadoDe(producto)
    const parcial = {
      producto,
      estado,
      stock: ctx.stockPorTn?.get(id),
      ventas90: ctx.ventas90PorTn?.get(id),
      unidadesSinFoto: unidadesEsperandoFoto(producto, estado, ctx, id),
      verificado: coincide,
      cambioDesdeRevision: guardada !== undefined && !coincide,
    }
    return { ...parcial, impacto: impactoDe(parcial), riesgo: riesgoDe(parcial) }
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

/**
 * Un error que el sistema **probó**, no que sospecha: dos colores usando literalmente el mismo
 * archivo, o un producto sin ninguna foto. Contra esto el ojo humano no tiene nada que aportar.
 */
const errorProbado = (f: FilaAuditoria) => f.estado.choques.length > 0 || f.estado.sinNingunaFoto

export function aplicarRecortes(filas: FilaAuditoria[], r: Recortes): FilaAuditoria[] {
  return filas.filter((f) => {
    const p = f.producto
    if (r.ignorados?.has(String(p.id))) return false
    // "Verificado" esconde lo que el ojo resolvió, NO lo que el sistema ya probó que está roto.
    // Si no, marcar un producto con la foto cruzada lo saca de la lista y sus publicaciones mal
    // dejan de contarse: el tablero baja sin que se haya arreglado nada. Eso es exactamente la
    // confianza falsa que esta pantalla existe para no dar.
    if (!r.verVerificados && f.verificado && !errorProbado(f)) return false
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
  /**
   * Los que figuran SANOS y todavía nadie miró. Es la otra mitad del trabajo.
   *
   * La automatización solo puede afirmar que dos colores comparten un archivo; **no puede mirar
   * una foto y decir de qué color es**. Si alguien pegó la foto de la violeta al color azul, y
   * cada una es un archivo distinto con nombre razonable, el producto figura impecable. O sea
   * que el error que más se le parece a "todo bien" vive justo acá, y sin esta lista no había
   * forma de recorrerlos.
   */
  | 'para-revisar'

export function predicadoDe(f: FiltroProblema): (fila: FilaAuditoria) => boolean {
  switch (f) {
    case 'cruzada':
      return (x) => x.estado.choques.length > 0
    case 'sin-foto':
      return (x) => x.estado.sinFoto.length > 0 || x.estado.sinNingunaFoto
    case 'escritorio':
      return (x) => x.estado.hayProblema && (x.estado.cola === 'escritorio' || x.estado.cola === 'mixto')
    case 'fotografia':
      return (x) => x.estado.cola === 'fotografia' || x.estado.cola === 'mixto'
    case 'para-revisar':
      // Sin nada detectado, sin cambios desde la última revisión, y con el color adentro de la
      // variante — que es el único caso donde una foto puede terminar en el color equivocado.
      // Los ya verificados no llegan hasta acá: los saca `aplicarRecortes`.
      return (x) => !x.estado.hayProblema && !x.cambioDesdeRevision && x.estado.colores.length > 1
    default:
      // "Cambió desde la revisión" entra aunque no haya problema detectable: puede ser
      // justamente lo que la automatización no ve (una foto de otro color, bien vinculada).
      // Para eso existe la huella; esconderlo acá la haría inútil.
      return (x) => x.estado.hayProblema || x.cambioDesdeRevision
  }
}

/**
 * Ordena por lo que más duele; a igual daño detectado, por lo que más costaría que esté mal sin
 * saberlo. El desempate alfabético va último, solo para que la lista no baile entre renders.
 *
 * El segundo criterio es el que hace usable la cola de revisión a ojo: ahí todos tienen impacto
 * cero, y sin el riesgo saldrían alfabéticos.
 */
export function ordenar(filas: FilaAuditoria[]): FilaAuditoria[] {
  return [...filas].sort(
    (a, b) =>
      b.impacto - a.impacto ||
      b.riesgo - a.riesgo ||
      (a.producto.name || '').localeCompare(b.producto.name || '', 'es'),
  )
}

/** Los números del tablero, contados sobre lo que se está mirando. */
export function resumen(filas: FilaAuditoria[]): {
  cruzadas: number
  sinFoto: number
  productos: number
  unidadesSinFoto: number
} {
  return {
    cruzadas: filas.reduce((a, f) => a + f.estado.variantesCruzadas, 0),
    sinFoto: filas.reduce((a, f) => a + f.estado.variantesSinFoto, 0),
    productos: filas.filter((f) => f.estado.hayProblema || f.cambioDesdeRevision).length,
    // Las que no cruzaron no suman (son `undefined`): el total es un piso, no una estimación.
    unidadesSinFoto: filas.reduce((a, f) => a + (f.unidadesSinFoto ?? 0), 0),
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
