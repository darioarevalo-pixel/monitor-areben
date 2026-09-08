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

import { NO_SE, type Cargados, type Familia } from '@/lib/tn-desc/atributos'

export type Filtro = 'ultimas-tandas' | 'sin-desc' | 'sin-ficha' | 'para-mirar' | 'corta' | 'borrador' | 'aprobados' | 'en-la-tienda' | 'todos'

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
 * ¿Alguien miró esta prenda y no supo qué poner en algún casillero?
 *
 * 🔴 **Existe para que «no sé» no sea un campo de sólo escritura.** El valor se estrenó el
 * 7-sep-2026 y sin esta pregunta no habría forma de volver a esas prendas: quedarían marcadas en
 * la base y **invisibles en la pantalla**, que es lo mismo que no haberlas marcado. La `tela` ya
 * venía con ese problema —su «no identifico» sólo se notaba porque frena la publicación—.
 *
 * ⚠️ ⛔ No frena nada: es una lista de trabajo, no un error. La prenda se publica igual, con un
 * bullet menos.
 */
export function paraVolverAMirar(ficha: Cargados | undefined): boolean {
  return Object.values(ficha || {}).some((v) => String(v || '').trim() === NO_SE)
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

/**
 * 🆕 Los que están esperando que alguien los MIRE: tienen el párrafo escrito y todavía no salieron.
 *
 * 🔴 **Existe por el veredicto de Bruno del 7-sep-2026** —«mucha fricción, tengo que revisar todo,
 * no me está convenciendo»—, dicho con **19 borradores escritos y ninguno aprobado**. La lista de
 * arriba está hecha para CARGAR de a una prenda —se abre la fila, se completa la ficha, se cierra—
 * y revisar es la tarea de al lado: la prenda ya está cargada y lo único que falta es mirar la foto
 * contra lo que se va a publicar. Con la fila cerrada por default, eso son 19 clics para empezar.
 *
 * 🔴 **`retenidos` es OBLIGATORIO, y es lo que queda de una vuelta en falso.** Nació reteniendo
 * *todo* lo publicado en la visita —para que quien aprieta llegara a ver si verificó— y Bruno lo
 * cazó en el primer uso: *«publiqué en tienda, pero no me ocultó el publicado»*. 🔑 **⛔ No es lo
 * mismo que la lección de `abierto`**: aquella protege a la fila de irse **sin que nadie la toque**,
 * y acá la persona **apretó un botón cuyo efecto esperado es justamente que salga de la cola**. Una
 * cola que ⛔ no baja mientras trabajás es otra vez la fricción que esto vino a sacar.
 *
 * ⇒ Hoy se retiene **sólo lo que todavía pide una mirada**: la publicación que ⛔ no verificó y la
 * que falló. Lo que salió y se releyó bien **se va**, que es lo que el gesto prometía; la
 * confirmación la da el aviso y el contador «En la tienda».
 *
 * ⚠️ El orden es **por nombre y nada más**: ⛔ no por estado. Ordenar por estado haría saltar de
 * lugar la tarjeta que alguien está editando en cuanto el guardado la desaprueba.
 *
 * ⚠️ ⛔ No entran `falla` ni `escribiendo`: ésos ⛔ no piden una lectura, piden mirar qué pasó en
 * TiendaNube, y eso vive en la fila de la lista de arriba con su cartel.
 */
export function paraRevisar<T extends ProductoLista>(
  productos: T[],
  o: { cola: Record<string, FilaLista | undefined>; busca: string; retenidos: Set<string> },
): T[] {
  return productos
    .filter((p) => {
      const estado = o.cola[p.id]?.estado
      const espera = estado === 'borrador' || estado === 'aprobado' || o.retenidos.has(p.id)
      return p.published && espera && coincide(p.name, o.busca)
    })
    .sort((a, b) => a.name.localeCompare(b.name))
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
  /**
   * 🆕 Lo tipeado en el buscador. **Obligatorio**, por el mismo motivo que `abierto`: si vive en
   * el `useMemo` de la pantalla es media regla que ningún test puede mirar.
   *
   * ⚠️ Va vacío para no buscar nada. ⛔ No es un filtro más: se combina con el que esté puesto.
   */
  busca: string
}

/**
 * ¿El nombre coincide con lo buscado?
 *
 * 🔑 **Palabra por palabra y sin acentos**, así «blusa cami» encuentra a BLUSA CAMELIA y «camelia
 * blusa» también: quien busca escribe lo que se acuerda, ⛔ no el nombre exacto en orden. Y sin
 * acentos porque los nombres de la tienda están en mayúsculas y sin ellos (`PANTALON MALIBÚ`
 * convive con `PANTALON ASH`).
 */
export function coincide(nombre: string, busca: string): boolean {
  const sin = (x: string) =>
    String(x || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  const partes = sin(busca).split(/\s+/).filter(Boolean)
  if (!partes.length) return true
  const n = sin(nombre)
  return partes.every((x) => n.includes(x))
}

/**
 * ¿Esta fila cumple el filtro elegido? ⛔ Sin la excepción de la fila abierta ni la búsqueda: esas
 * dos las aplica `listaDe`, y por eso ⛔ no entran acá ni como parámetro.
 */
export function cumpleFiltro(p: ProductoLista, o: Omit<OpcionesLista, 'abierto' | 'busca'>): boolean {
  const fila = o.cola[p.id]
  if (o.filtro === 'ultimas-tandas') return o.tandas.has(p.created_at.slice(0, 10))
  if (o.filtro === 'sin-desc') return p.prosa.banda === 'nada'
  if (o.filtro === 'sin-ficha') return sinFicha(p, fila, o.atributos[p.id])
  if (o.filtro === 'para-mirar') return paraVolverAMirar(o.atributos[p.id])
  if (o.filtro === 'corta') return p.prosa.banda === 'corta'
  // 🆕 7-sep-2026, pedido de Bruno. Es el estado que faltaba nombrar: el párrafo está escrito y
  // NADIE lo miró todavía. Sin este filtro, los borradores sólo se encontraban de memoria —y el
  // día que se escriben 19 de una, eso es una lista de 19 nombres en la cabeza de alguien.
  if (o.filtro === 'borrador') return fila?.estado === 'borrador'
  if (o.filtro === 'aprobados') return fila?.estado === 'aprobado'
  if (o.filtro === 'en-la-tienda') return fila?.estado === 'escrito' || fila?.estado === 'falla'
  return true
}

/**
 * La lista que se dibuja: los publicados que cumplen el filtro **más la fila abierta**, con los
 * mudos primero — son los que hoy salen a la calle sin decir nada.
 *
 * 🔑 **La búsqueda le corre TAMBIÉN a la fila abierta, y el filtro ⛔ no.** ⛔ No es una
 * inconsistencia: la fila abierta se protege de lo que pasa SOLO —guardar un atributo la sacaba
 * de la lista sin que nadie tocara el filtro—, y buscar es un gesto explícito sobre la lista. Si
 * la abierta sobreviviera a la búsqueda, tipear un nombre devolvería otro producto.
 *
 * ⚠️ El orden ⛔ no depende de la ficha ni de la cola, sólo de la prosa y del nombre: una fila que
 * se está cargando no puede saltar de lugar mientras alguien la completa.
 */
export function listaDe<T extends ProductoLista>(productos: T[], o: OpcionesLista): T[] {
  const { abierto, busca, ...filtro } = o
  return productos
    .filter((p) => p.published && coincide(p.name, busca) && (p.id === abierto || cumpleFiltro(p, filtro)))
    .sort((a, b) => a.prosa.largo - b.prosa.largo || a.name.localeCompare(b.name))
}
