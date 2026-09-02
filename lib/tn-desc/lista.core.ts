/**
 * Qué filas se ven en «Descripción y medidas», y **cuál no se puede ir de la lista**.
 *
 * 🔴 **Existe por un caso real, el 2-sep-2026.** El local estaba cargando fichas con el filtro
 * «Sin ficha cargada» puesto, y la regla del filtro decía «sin ficha = tiene prenda y ⛔ ningún
 * atributo». Al elegir el PRIMER desplegable —la tela— el producto dejaba de cumplirla y **la fila
 * abierta desaparecía de la lista en el mismo gesto**: la ficha se cerraba sola y se leía como
 * «no guardó». Medido contra la base: cuatro productos ese mediodía, **uno solo con un atributo
 * cada uno** (`tela`), a un minuto de distancia — la firma de alguien que prueba, ve que se cierra,
 * y pasa al siguiente. Y estaba guardado: lo que fallaba era la pantalla, ⛔ no el guardado.
 *
 * 🔑 **Por eso `abierto` es un parámetro OBLIGATORIO y la regla vive acá, ⛔ no en el JSX.** Un
 * filtro escrito adentro del `useMemo` de la pantalla es media regla que ningún test puede mirar;
 * y con el parámetro obligatorio, el día que alguien arme otra lista con estos mismos filtros el
 * typechecker le pregunta qué fila está abierta.
 *
 * La regla de fondo, que vale para cualquier lista con filtro y detalle adentro: **un filtro
 * decide qué se EMPIEZA a mirar, ⛔ no qué se puede terminar de cargar.**
 */

import type { Cargados, Familia } from '@/lib/tn-desc/atributos'

export type Filtro = 'ultimas-tandas' | 'sin-desc' | 'sin-ficha' | 'corta' | 'aprobados' | 'en-la-tienda' | 'todos'

/** Lo que la lista necesita de un producto de TiendaNube. Un subconjunto de `ProductoTn`. */
export type ProductoLista = {
  id: string
  name: string
  created_at: string
  published: boolean
  prosa: { banda: string; largo: number }
  /** La familia que sale de las categorías de la tienda. `null` = no tiene categoría. */
  familia: Familia | null
}

/** Lo que la lista necesita de la fila de la cola. Un subconjunto de `FilaCola`. */
export type FilaLista = { familia: Familia | null; estado: string }

/**
 * La familia con la que se dibuja la ficha.
 *
 * 🔑 La categoría de TiendaNube GANA sobre la elegida a mano: si mañana alguien se la pone, la
 * familia se corrige sola. Lo elegido a mano es el piso para los productos que no tienen ninguna,
 * no una segunda fuente que compita con la tienda.
 */
export function familiaDeProducto(p: ProductoLista, fila: FilaLista | undefined): Familia | null {
  return p.familia ?? fila?.familia ?? null
}

/**
 * ¿Se sabe qué prenda es y todavía no tiene ni un dato cargado?
 *
 * ⚠️ Sin familia ⛔ NO cuenta: la ficha ni siquiera sabe qué preguntarle, así que no es una ficha
 * que falte cargar sino una categoría que falta en la tienda.
 */
export function sinFicha(p: ProductoLista, fila: FilaLista | undefined, ficha: Cargados | undefined): boolean {
  return !!familiaDeProducto(p, fila) && !Object.keys(ficha || {}).length
}

/**
 * Las fechas de alta de las dos últimas tandas.
 *
 * 🔑 Se calcula por **fechas distintas de alta** y no por «los últimos 14 días»: la mercadería
 * entra de golpe, no de a poco. Medido el 27-ago-2026: de dos semanas para acá no había entrado
 * NINGUNO, y los 41 mudos recientes eran dos tandas, de hace 15 y 27 días. Un umbral en días
 * habría mostrado una lista vacía justo el día que había 41 productos para cargar.
 */
export function ultimasTandas(productos: ProductoLista[], cuantas = 2): Set<string> {
  const fechas = [...new Set(productos.map((p) => p.created_at.slice(0, 10)).filter(Boolean))]
  return new Set(fechas.sort().reverse().slice(0, cuantas))
}

export type OpcionesLista = {
  filtro: Filtro
  cola: Record<string, FilaLista | undefined>
  atributos: Record<string, Cargados | undefined>
  tandas: Set<string>
  /**
   * 🔴 El `tn_id` de la fila que está ABIERTA, o `null`. **Obligatorio.** Esa fila se queda en la
   * lista aunque el guardado le haga dejar de cumplir el filtro: mientras alguien la está
   * cargando, sacarla es cerrarle la ficha en la mano.
   */
  abierto: string | null
}

/** ¿Esta fila cumple el filtro elegido? ⛔ Sin la excepción de la fila abierta: eso lo hace `listaDe`. */
export function cumpleFiltro(p: ProductoLista, o: Omit<OpcionesLista, 'abierto'>): boolean {
  const fila = o.cola[p.id]
  if (o.filtro === 'ultimas-tandas') return o.tandas.has(p.created_at.slice(0, 10))
  if (o.filtro === 'sin-desc') return p.prosa.banda === 'nada'
  if (o.filtro === 'sin-ficha') return sinFicha(p, fila, o.atributos[p.id])
  if (o.filtro === 'corta') return p.prosa.banda === 'corta'
  if (o.filtro === 'aprobados') return fila?.estado === 'aprobado'
  if (o.filtro === 'en-la-tienda') return fila?.estado === 'escrito' || fila?.estado === 'falla'
  return true
}

/**
 * La lista que se dibuja: los publicados que cumplen el filtro **más la fila abierta**, con los
 * mudos primero — son los que hoy salen a la calle sin decir nada.
 *
 * ⚠️ El orden ⛔ no depende de la ficha ni de la cola, sólo de la prosa y del nombre: una fila que
 * se está cargando no puede saltar de lugar mientras alguien la completa.
 */
export function listaDe<T extends ProductoLista>(productos: T[], o: OpcionesLista): T[] {
  const { abierto, ...filtro } = o
  return productos
    .filter((p) => p.published && (p.id === abierto || cumpleFiltro(p, filtro)))
    .sort((a, b) => a.prosa.largo - b.prosa.largo || a.name.localeCompare(b.name))
}
