/**
 * La cola de fotos: qué falta fotografiar, en qué orden, y qué ya se intentó.
 *
 * La cola existía desde siempre —`auditoria.ts` sabe qué color no tiene foto propia y `export.ts`
 * la bajaba a un Excel— pero nunca fue una pantalla. Era una vista de la auditoría, que responde
 * otra pregunta: *«¿algún color muestra la foto de otro?»*. Esta responde la de Marketing:
 * *«¿qué sacamos en la próxima sesión?»*.
 *
 * 🔴 **La cola aparente no es la cola real, y esa es la razón de ser de este archivo.** Medido el
 * 24-ago-2026 contra las dos tiendas:
 *
 * | | BDI | Zattia |
 * | --- | --- | --- |
 * | variantes sin foto | 173 | 441 |
 * | …que cruzan con Gestión Nube por código | 107 | 346 |
 * | …**y tienen una sola unidad ⇒ fotografiables hoy** | **75** | **168** |
 *
 * Una lista que muestra las 441 manda a buscar 273 cosas que no están en el depósito o que no se
 * pueden ni encontrar. Por eso el renglón lleva SU estado y la pantalla arranca por lo que se
 * puede hacer, con el resto contado aparte y con el motivo — que es una acción distinta en cada
 * caso: mapear un SKU, cargar el producto en GN, despegar dos productos, o esperar el ingreso.
 *
 * 🔑 **El estado del renglón lo decide `cruzarParaSesion`, no una regla nueva.** Es la misma
 * función que usa el botón «Pedir una sesión de fotos», y se llama acá adentro a propósito: si la
 * cola clasificara por su cuenta, podría mostrar un renglón verde que el botón después descarta —
 * o al revés— y no habría forma de que la persona supiera cuál de las dos pantallas tiene razón.
 * Lo que esta función agrega es el detalle por variante que aquélla, que decide por producto, no
 * necesita. **El invariante está testeado: los renglones `lista` son exactamente los `vids` que
 * el botón manda tildados.**
 *
 * 🔑 **La antigüedad es la de la VARIANTE, no la del producto.** El 94 % de la cola de BDI y el
 * 85 % de la de Zattia son productos que YA tienen fotos y a los que les falta la de un color, así
 * que la fecha del producto es una cota superior de la espera. ⚠️ Medida la diferencia, resultó
 * chica —mediana 0 días, y sólo 6 variantes de Zattia pasan de 90— porque los colores se cargan
 * casi siempre junto con el producto; pero es la diferencia entre un número que se puede afirmar y
 * uno que se parece. El campo lo agregó el audit de `bdi-catalogo` el 24-ago-2026; las respuestas
 * cacheadas de antes no lo traen, y por eso `desde` es opcional y la pantalla lo dice.
 *
 * 🔑 **Lo único que la cola no puede saber mirando la tienda: que ya se intentó.** Una variante
 * puede haber salido a una sesión, haber vuelto, y seguir sin foto — y la tienda se ve exactamente
 * igual que si nunca hubiera salido. Sin esto, el mismo producto entra a sesión tras sesión y
 * nadie se entera de que viene fallando. Medido hoy: **21 variantes de BDI y 31 de Zattia ya
 * salieron al menos una vez y siguen sin foto**. El motivo (`ultimoIntento`) sale del «¿qué se
 * fotografió?» que se estrenó el 24-ago-2026 ⇒ hoy está vacío en las 31 solicitudes que hay, y va
 * a llenarse solo. ⛔ Por eso «salió y no se contestó» y «salió y contestaron que no» son dos
 * cosas distintas y no se mezclan: ver `lib/sesionfotos/fotografiado.ts`.
 */

import type { Variante } from '@/lib/etl/tipos'
import type { RegistroFoto, Solicitud } from '@/lib/sesionfotos/tipos'
import { cruzarParaSesion, indexar, variantesGnDe, variantesSinFoto, type MotivoExcluido } from './a-sesion-fotos'
import type { ProductoFchk } from './tipos'

/**
 * En qué situación está una variante de la cola. `lista` es la única accionable hoy; las otras
 * cuatro son los motivos de `cruzarParaSesion`, que ya nombran qué hay que hacer con cada una.
 */
export type EstadoCola = 'lista' | MotivoExcluido

export const ESTADO_COLA_LABEL: Record<EstadoCola, string> = {
  lista: 'se puede fotografiar',
  'sin-cruce': 'no cruza por código con Gestión Nube',
  'sin-producto-gn': 'su producto todavía no está cargado en Gestión Nube',
  'sin-stock': 'no queda ninguna unidad para fotografiar',
  ambiguo: 'su código lleva a dos productos distintos de Gestión Nube',
}

/** Qué hacer con una variante que no está `lista`. El motivo sin la acción no mueve nada. */
export const ESTADO_COLA_ACCION: Record<MotivoExcluido, string> = {
  'sin-cruce': 'Mapear el SKU o el código de barras',
  'sin-producto-gn': 'Cargar el producto en Gestión Nube',
  'sin-stock': 'Esperar el ingreso',
  ambiguo: 'Despegar los dos productos de Gestión Nube',
}

/** Un renglón de la cola: una variante de Tienda Nube que espera su foto. */
export type FilaCola = {
  /** Id del producto en Tienda Nube. Junto con el color identifica el renglón. */
  tnId: string
  /** Id de la variante en Tienda Nube, cuando el audit lo trajo. */
  tnVid: string | null
  /** Nombre del producto en Tienda Nube. */
  producto: string
  /** El color que no tiene foto propia: lo que hay que sacar. */
  color: string
  /**
   * Todos los valores de opción de la variante (`["M","CHOCOLATE"]`, `["iPhone 13","AZUL"]`). Es
   * lo que nombra el segundo eje sin elegir una palabra: en ropa es el talle y en fundas el modelo.
   */
  valores: string[]
  sku: string | null
  barcode: string | null
  /** `false` = el producto está despublicado en la tienda: la foto que falta no la ve nadie hoy. */
  publicado: boolean
  /** Alta de la VARIANTE en Tienda Nube. `null` en respuestas del audit anteriores al 24-ago-2026. */
  desde: string | null
  /** Días esperando la foto, o `null` si `desde` no vino. ⛔ No se rellena con la del producto. */
  dias: number | null
  estado: EstadoCola
  /** Unidades en Gestión Nube de las variantes a las que llega este renglón. 0 si no cruza. */
  unidades: number
  /** Producto de Gestión Nube, cuando cruzó. */
  pid: string | null
  /** Variantes de Gestión Nube a las que llega este renglón. Vacío si no cruzó. */
  vids: string[]
  /** Cuántas sesiones de fotos se lo llevaron alguna vez. 0 = nunca salió. */
  salidas: number
  /** Fecha de la última sesión que se lo llevó (`YYYY-MM-DD`), o `null`. */
  ultimaSalida: string | null
  /**
   * La última respuesta del «¿qué se fotografió?» sobre este renglón. `null` = nadie contestó, que
   * ⛔ no es lo mismo que «contestaron que no»: ver `resumenFotos`.
   */
  ultimoIntento: RegistroFoto | null
}

const norm = (s: string | null | undefined): string => String(s ?? '').toLowerCase().trim()

const DIA = 86400000

/** Días enteros entre el alta y ahora. Negativo se recorta a 0: una fecha futura no es una espera. */
function diasDesde(iso: string | null | undefined, ahora: number): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return null
  return Math.max(0, Math.floor((ahora - t) / DIA))
}

/** El índice vid → cuántas veces salió, cuándo, y qué se contestó la última vez. */
type Historial = Map<string, { salidas: number; ultima: string | null; intento: RegistroFoto | null }>

/**
 * Qué pasó con cada variante en las sesiones anteriores.
 *
 * 🔑 **Se cuentan las SOLICITUDES, no los renglones.** Una misma variante puede aparecer dos veces
 * en la misma solicitud (dos bolsas, dos orígenes) y eso no es haber salido dos veces: es haber
 * salido una. Contar renglones inflaría el número que la pantalla usa para decir «viene fallando».
 *
 * `ultima` y `intento` salen de la solicitud **más reciente por fecha**, no de la última del array:
 * el KV no garantiza orden y el historial se edita.
 */
export function historialDe(solicitudes: Solicitud[]): Historial {
  const h: Historial = new Map()
  for (const s of solicitudes) {
    const fecha = s.fecha || null
    const vistos = new Set<string>()
    for (const i of s.items || []) {
      const vid = String(i.vid || '')
      if (!vid || vistos.has(vid)) continue
      vistos.add(vid)
      const prev = h.get(vid) ?? { salidas: 0, ultima: null, intento: null }
      const masNueva = !prev.ultima || (fecha != null && fecha > prev.ultima)
      h.set(vid, {
        salidas: prev.salidas + 1,
        ultima: masNueva ? fecha : prev.ultima,
        intento: masNueva ? (s.fotos || {})[vid] ?? null : prev.intento,
      })
    }
  }
  return h
}

/**
 * Arma la cola: un renglón por variante de Tienda Nube que espera su foto.
 *
 * `productos` es el catálogo del audit con `?variantes=1`; `variantesGn` son las mismas que expande
 * el borrador (`allVariantes`) y `huerfanas` sirve sólo para distinguir «no cruza» de «su producto
 * no está en GN». `solicitudes` es el historial de Sesión de fotos de la línea.
 */
export function armarCola(
  productos: ProductoFchk[],
  variantesGn: Variante[],
  huerfanas: Variante[],
  solicitudes: Solicitud[],
  ahora: number,
): FilaCola[] {
  // 🔑 La clasificación NO se calcula acá: se le pide a la misma función que usa el botón.
  const { pedir, excluidos } = cruzarParaSesion(productos, variantesGn, huerfanas)
  const pedidoPorTn = new Map(pedir.map((p) => [p.tnId, p]))
  const motivoPorTn = new Map(excluidos.map((e) => [e.tnId, e.motivo]))
  const idx = indexar(variantesGn)
  const stockPorVid = new Map(variantesGn.map((v) => [String(v.id), (v.local || 0) + (v.deposito || 0)]))
  const hist = historialDe(solicitudes)

  const filas: FilaCola[] = []
  for (const p of productos) {
    const pendientes = variantesSinFoto(p)
    if (!pendientes.length) continue
    const tnId = String(p.id)
    const pedido = pedidoPorTn.get(tnId)
    const excluido = motivoPorTn.get(tnId)
    /**
     * Un producto con variantes esperando foto está en UNA de las dos listas y en ninguna otra:
     * `cruzarParaSesion` recorre los mismos productos con el mismo `variantesSinFoto`, así que la
     * partición es total. Esta rama es, por construcción, inalcanzable — y es la contracara del
     * invariante que fija el test: el día que alguien cambie el criterio de una de las dos y la
     * partición deje de ser total, un renglón sin estado es preferible a un renglón con un estado
     * inventado. ⚠️ Un mutante que la borra SOBREVIVE, y eso es la prueba de que es inalcanzable,
     * no un agujero de los tests.
     */
    if (!pedido && !excluido) continue
    const enPedido = new Set(pedido?.vids ?? [])

    for (const v of pendientes) {
      /**
       * 🔴 Los `vids` se buscan SIEMPRE, también cuando el producto quedó afuera del pedido.
       * Caminarlo contra las dos tiendas lo destapó: atándolos sólo a los pedidos, el contador de
       * reincidentes decía **23 y eran 31** en Zattia. Lo que se perdía era justo lo que más
       * conviene ver: una variante que salió a una sesión, volvió sin foto **y encima ya no tiene
       * stock** no deja de haber fallado porque hoy no se pueda volver a pedir.
       * ⚠️ Tener `vids` no la hace pedible: el `estado` lo sigue decidiendo `cruzarParaSesion`, y
       * `unidades` sólo se muestra en las `lista` (en una `ambiguo` sumaría dos productos distintos).
       */
      const gn = variantesGnDe(v, idx)
      const vids = [...new Set(gn.map((x) => String(x.id)))]
      // 🔑 El renglón de un producto pedido igual puede no estar `lista`: `cruzarParaSesion` deja
      // afuera las variantes sin stock, así que el producto entra por OTRO de sus colores. Marcarlo
      // verde acá sería prometer un tilde que el borrador no va a poner.
      const enLista = vids.some((id) => enPedido.has(id))
      const estado: EstadoCola = pedido ? (enLista ? 'lista' : 'sin-stock') : (excluido as MotivoExcluido)
      filas.push({
        tnId,
        tnVid: v.id != null ? String(v.id) : null,
        producto: p.name || '—',
        color: v.color || '—',
        valores: v.valores ?? [],
        sku: v.sku ?? null,
        barcode: v.barcode ?? null,
        publicado: p.published !== false,
        desde: v.created_at ?? null,
        dias: diasDesde(v.created_at, ahora),
        estado,
        unidades: vids.reduce((a, id) => a + (stockPorVid.get(id) ?? 0), 0),
        pid: pedido?.pid ?? null,
        vids,
        ...resumenHistorial(vids, hist),
      })
    }
  }
  return filas
}

/** Lo que el historial dice de un renglón: el máximo de salidas y el intento más reciente. */
function resumenHistorial(vids: string[], hist: Historial) {
  let salidas = 0
  let ultimaSalida: string | null = null
  let ultimoIntento: RegistroFoto | null = null
  for (const vid of vids) {
    const h = hist.get(vid)
    if (!h) continue
    salidas = Math.max(salidas, h.salidas)
    if (!ultimaSalida || (h.ultima != null && h.ultima > ultimaSalida)) {
      ultimaSalida = h.ultima
      ultimoIntento = h.intento
    }
  }
  return { salidas, ultimaSalida, ultimoIntento }
}

/**
 * Las unidades que están esperando una foto, sin contar ninguna dos veces.
 *
 * 🔴 Dos variantes de Tienda Nube pueden llevar a la MISMA variante de Gestión Nube (pasa cuando se
 * comparte el SKU), así que sumar la columna `unidades` de los renglones cuenta esas unidades una
 * vez por renglón. El total se saca del conjunto de `vids`, no de la suma de las filas — la misma
 * lección que dejó el memo de clavados: un guard por fila no cubre el total.
 */
export function unidadesEsperando(filas: FilaCola[], stockPorVid: Map<string, number>): number {
  const vistos = new Set<string>()
  let n = 0
  for (const f of filas) {
    for (const vid of f.vids) {
      if (vistos.has(vid)) continue
      vistos.add(vid)
      n += stockPorVid.get(vid) ?? 0
    }
  }
  return n
}

export type ResumenCola = {
  /** Renglones que se pueden fotografiar hoy. */
  lista: number
  /** Cuántos hay en cada uno de los otros cuatro estados, en orden fijo y sin los que están en 0. */
  trabados: { estado: MotivoExcluido; n: number }[]
  /** Renglones que ya salieron alguna vez y siguen sin foto. */
  reincidentes: number
  /** El renglón `lista` que espera hace más tiempo, en días. `null` si ninguno trae fecha. */
  masVieja: number | null
}

const ORDEN_TRABAS: MotivoExcluido[] = ['sin-stock', 'sin-cruce', 'sin-producto-gn', 'ambiguo']

/** El encabezado de la pantalla: qué se puede hacer hoy y qué está trabado, con su motivo. */
export function resumenCola(filas: FilaCola[]): ResumenCola {
  const listas = filas.filter((f) => f.estado === 'lista')
  const dias = listas.map((f) => f.dias).filter((d): d is number => d != null)
  return {
    lista: listas.length,
    trabados: ORDEN_TRABAS.map((estado) => ({ estado, n: filas.filter((f) => f.estado === estado).length })).filter((x) => x.n > 0),
    reincidentes: filas.filter((f) => f.salidas > 0).length,
    masVieja: dias.length ? Math.max(...dias) : null,
  }
}

/**
 * En qué orden se trabaja.
 *
 * `plata` —el default— pone adelante lo que más unidades tiene paradas: es lo que la sesión le
 * saca al depósito de una sola vez. `espera` pone adelante lo que hace más tiempo que aguanta, que
 * es la otra lectura legítima y la que pidió el pedido original.
 *
 * 🔑 En los dos casos lo `lista` va primero: el resto no se puede fotografiar, así que ordenarlo
 * mezclado haría que el primer renglón de la pantalla sea, la mitad de las veces, uno que no se
 * puede hacer.
 */
export type OrdenCola = 'plata' | 'espera'

export function ordenarCola(filas: FilaCola[], orden: OrdenCola): FilaCola[] {
  const rank = (f: FilaCola) => (f.estado === 'lista' ? 0 : 1)
  // -1 y no 0: sin fecha no puede empatar con «lo cargaron hoy», que sería el que menos espera.
  const dias = (f: FilaCola) => (f.dias == null ? -1 : f.dias)
  return [...filas].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b)
    if (orden === 'plata' && b.unidades !== a.unidades) return b.unidades - a.unidades
    if (dias(b) !== dias(a)) return dias(b) - dias(a)
    if (b.unidades !== a.unidades) return b.unidades - a.unidades
    return a.producto.localeCompare(b.producto) || a.color.localeCompare(b.color)
  })
}

/** Filtros de la pantalla. `todo` incluye lo trabado; el default de la pantalla es `lista`. */
export type FiltroCola = 'todo' | 'lista' | 'reincidentes' | 'trabadas'

export function filtrarCola(filas: FilaCola[], filtro: FiltroCola, texto: string): FilaCola[] {
  const q = norm(texto)
  const porFiltro = filas.filter((f) => {
    if (filtro === 'lista') return f.estado === 'lista'
    if (filtro === 'reincidentes') return f.salidas > 0
    if (filtro === 'trabadas') return f.estado !== 'lista'
    return true
  })
  if (!q) return porFiltro
  // El buscador se saltea el filtro, igual que en la auditoría: los filtros son para cuando no
  // sabés por dónde empezar y el buscador para cuando sí sabés cuál querés.
  const base = q ? filas : porFiltro
  return base.filter(
    (f) => norm(f.producto).includes(q) || norm(f.color).includes(q) || norm(f.sku).includes(q) || norm(f.barcode).includes(q),
  )
}
