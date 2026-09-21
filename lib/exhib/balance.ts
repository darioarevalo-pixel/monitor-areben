/**
 * **El balance del sector: qué hay que ir a buscar al depósito del local.**
 *
 * 🔑 **Por qué existe** (20-sep-2026, pedido de Bruno). El recorrido libre contesta *«esto pasó por
 * el lector»*, y `colgar.ts` agrega *«y estos hermanos de lo que tocaste ⛔ no aparecieron»* — que
 * es una lista **siempre verdadera pero corta**: ⛔ no puede hablar de una prenda cuyo producto
 * nadie escaneó. Lo que falta es el otro lado: *«caminé el sector ENTERO, decime todo lo que
 * debería estar colgado acá y ⛔ no está»*.
 *
 * 🔴 **Eso ⛔ no lo puede decidir la app, y por eso el balance lo hace una PERSONA, después.** Que
 * un recorrido haya cubierto un sector entero es un hecho del salón: la app ve 94 escaneos y ⛔ no
 * sabe si el sector tenía 94 prendas o 400. Afirmarlo por su cuenta es lo que produjo los **20
 * corsets faltantes falsos** del 19-sep, de un mueble que nadie había caminado. Acá la app **pone el
 * número** —«tocaste 94 de 400 de esta categoría, el 24 %»— y **la decisión la toma quien mira**.
 * Un 24 % grita «caminó un perchero»; un 95 % dice «caminó el sector».
 *
 * 🔑 **Y «lo que falta» tiene una dirección concreta: el DEPÓSITO DEL LOCAL.** En Gestión Nube el
 * Local es **una sola ubicación** que junta lo colgado en el salón y lo guardado en el depósito del
 * local — por eso el conteo del local se hace *exhibido + depósito* (ver la sección Conteo
 * estándar). ⇒ **stock en Local − lo que pasó por el lector = lo que tiene que estar en el depósito
 * del local**, y si tampoco está ahí, lo que hay es un problema de stock. La lista ⛔ no es un
 * reproche: es un mandado con dirección.
 *
 * ⚠️ **Lo que ⛔ no puede juzgar se dice aparte y ⛔ no se calla**: una prenda sin categoría en
 * Tienda Nube ⛔ no entra en ningún universo —ni como presente ni como faltante—, así que se cuenta
 * por separado. Medido el 20-sep-2026: **297 variantes (95 productos) del Local sin categoría**, de
 * las cuales 36 productos son de **Stunned**, que tiene su propia tienda y nunca va a cruzar.
 *
 * Todo puro: la misma función alimenta la pantalla y el Excel del mandado.
 */

import type { Filas } from '../excel'
import { catsDeItem, esDelTipo, exhibId, normCat, perteneceA, tipoDePrenda } from './core'
import { catsVisibles, pasoPorElLector, unidadesVistas, type EscaneoLibre } from './libre'
import { SIN_CATEGORIA, type ExhibItem } from './tipos'

/** Las variantes de un recorrido que **pasaron por el lector**, en cualquiera de sus lugares. */
export function vistasDelRecorrido(escaneos: EscaneoLibre[]): Set<string> {
  const out = new Set<string>()
  for (const e of escaneos) if (pasoPorElLector(e)) out.add(e.variante_id)
  return out
}

/**
 * Una categoría que el recorrido tocó, con **cuánto de ella cubrió**.
 *
 * 🔴 `cubierto` es el número con el que se decide, y por eso se calcula sobre el **universo entero
 * de la categoría en el Local**, ⛔ no sobre lo escaneado: «94 escaneos» ⛔ no dice nada solo, «94
 * de 400» dice todo.
 */
export type CoberturaCat = {
  cat: string
  /** Variantes con stock en el Local que son de esta categoría. */
  universo: number
  /** De ésas, cuántas pasaron por el lector en este recorrido. */
  vistas: number
  /** `vistas / universo`, de 0 a 1. */
  cubierto: number
  /** Unidades que el sistema tiene en Local para las que ⛔ no se vieron. */
  unidadesSinVer: number
}

/**
 * Las categorías que el recorrido tocó, de la más cubierta a la menos.
 *
 * 🔑 **Se proponen las que tocó y ⛔ no las 21 del catálogo**: quien mira esto acaba de recibir un
 * aviso de que el sector está listo, y elegir entre las tres que aparecieron es una decisión de
 * diez segundos. ⚠️ «(Sin categoría)» ⛔ nunca se propone: ⛔ no es un sector del salón.
 */
export function coberturaPorCat(escaneos: EscaneoLibre[], conStock: ExhibItem[]): CoberturaCat[] {
  const vistas = vistasDelRecorrido(escaneos)
  const tocadas = new Map<string, string>()
  for (const it of conStock) {
    if (!vistas.has(exhibId(it))) continue
    for (const c of catsDeItem(it)) {
      if (c === SIN_CATEGORIA) continue
      if (!tocadas.has(normCat(c))) tocadas.set(normCat(c), c)
    }
  }

  return [...tocadas.values()]
    .map((cat) => {
      const universo = conStock.filter((it) => perteneceA(it, cat))
      const sinVer = universo.filter((it) => !vistas.has(exhibId(it)))
      return {
        cat,
        universo: universo.length,
        vistas: universo.length - sinVer.length,
        cubierto: universo.length ? (universo.length - sinVer.length) / universo.length : 0,
        unidadesSinVer: sinVer.reduce((n, it) => n + it.qty, 0),
      }
    })
    .sort((a, b) => b.cubierto - a.cubierto || b.universo - a.universo || a.cat.localeCompare(b.cat, 'es'))
}

/**
 * Un **tipo de prenda** que el recorrido tocó, con cuánto de él cubrió. La contracara de
 * `CoberturaCat`, contra el nombre del producto en vez de la categoría de Tienda Nube.
 */
export type CoberturaTipo = {
  /** `TOP`, `BLUSA`, `BABY TEE`… tal como sale del nombre del producto. */
  tipo: string
  /** Variantes con stock en el Local de ese tipo. */
  universo: number
  /** De ésas, cuántas pasaron por el lector en este recorrido. */
  vistas: number
  cubierto: number
}

/**
 * **Los tipos que el recorrido tocó, del más caminado al menos.**
 *
 * 🔴 **El orden es por lo que PASÓ POR EL LECTOR, ⛔ no por el porcentaje cubierto, y ése es el
 * arreglo del 21-sep-2026.** Ordenando por porcentaje, un tipo del que hay 9 prendas en el local y
 * se escanearon las 9 da **100 %** y se planta **arriba** del sector que se caminó de verdad. Pasó
 * en el salón: el balance se declaró sobre dos categorías de 15 y 9 prendas que estaban primeras
 * —dieron 100 %— y el mandado salió **vacío** después de una caminata de 415 unidades.
 * ⇒ Primero va lo que la persona efectivamente caminó: hoy eso es `TOP 199 · BLUSA 58 · VESTIDO 26
 * · CAMISA 25 · BABY TEE 21 …` y los escaneos sueltos (una pollera, un strapless) quedan al final,
 * que es donde se leen como lo que son.
 */
export function coberturaPorTipo(escaneos: EscaneoLibre[], conStock: ExhibItem[]): CoberturaTipo[] {
  const vistas = vistasDelRecorrido(escaneos)
  const tocados = new Set<string>()
  for (const it of conStock) if (vistas.has(exhibId(it))) tocados.add(tipoDePrenda(it.name))

  return [...tocados]
    .map((tipo) => {
      const universo = conStock.filter((it) => esDelTipo(it, tipo))
      const sinVer = universo.filter((it) => !vistas.has(exhibId(it)))
      return {
        tipo,
        universo: universo.length,
        vistas: universo.length - sinVer.length,
        cubierto: universo.length ? (universo.length - sinVer.length) / universo.length : 0,
      }
    })
    .sort((a, b) => b.vistas - a.vistas || b.universo - a.universo || a.tipo.localeCompare(b.tipo, 'es'))
}

/**
 * **El mandado, por tipo de prenda**: lo que tiene stock en el Local de los tipos declarados y ⛔ no
 * pasó por el lector en todo el recorrido.
 *
 * 🔑 **`tambienEn` va vacío a propósito.** Esa columna existía para explicar por qué un corset
 * aparecía en un mandado de «TOPS Y BODIES» —el bolsón de TN se comía prendas de otro sector—.
 * Declarando por nombre **el problema ⛔ no existe**: si el renglón dice CORSET BERNA es porque se
 * declaró CORSET. Nada que explicar es mejor que explicarlo bien.
 */
export function buscarPorTipo(escaneos: EscaneoLibre[], conStock: ExhibItem[], tipos: string[]): Buscar[] {
  if (!tipos.length) return []
  const vistas = vistasDelRecorrido(escaneos)
  return conStock
    .filter((it) => !vistas.has(exhibId(it)) && tipos.some((t) => esDelTipo(it, t)))
    .map((it) => ({ it, tambienEn: [] as string[] }))
    // 🔑 **Por nombre y ⛔ no por unidades** (21-sep-2026). Ordenar por stock ponía arriba «el que
    // tiene 10» como si fuera más urgente, y ⛔ no lo es: falta colgar UNA de cada una. Por nombre,
    // los colores de la misma prenda caen juntos, que es como se busca en el depósito.
    .sort((a, b) => a.it.name.localeCompare(b.it.name, 'es') || a.it.size.localeCompare(b.it.size, 'es'))
}

/**
 * **Lo que pasó por el lector y ⛔ no está en lo declarado.** El seguro contra el error del
 * 21-sep-2026.
 *
 * 🔴 **Un mandado vacío ⛔ no prueba que no falte nada: puede probar que se declaró cualquier cosa.**
 * Ese día se tildaron dos categorías que explicaban **24 de los 389 escaneos (6 %)**, el mandado
 * dio cero y la pantalla se quedó callada — que es la forma más cara de equivocarse acá, porque
 * nadie va a ir a buscar lo que la lista ⛔ no nombró. Con este número la pantalla puede decir
 * «declaraste esto, pero caminaste 365 prendas que ⛔ no entran», y el que mira lo ve **antes** de
 * mandar a nadie al depósito.
 */
export function tocadoSinDeclarar(escaneos: EscaneoLibre[], conStock: ExhibItem[], tipos: string[]): number {
  const vistas = vistasDelRecorrido(escaneos)
  return conStock.filter((it) => vistas.has(exhibId(it)) && !tipos.some((t) => esDelTipo(it, t))).length
}

/** Una prenda a buscar en el depósito del local. */
export type Buscar = {
  it: ExhibItem
  /**
   * Las **otras** categorías de la prenda, cuando las tiene.
   *
   * 🔑 **Es la explicación de por qué aparece una prenda que ⛔ no parece del sector.** «TOPS Y
   * BODIES» es un bolsón que se come **5 corsets y un saquito** (medido el 20-sep-2026), y sin esta
   * columna el corset en la lista se lee como un error de la app — y una línea que parece un error
   * le quita autoridad a las otras cincuenta, que están bien.
   */
  tambienEn: string[]
}

/**
 * **El mandado**: lo que tiene stock en el Local en las categorías declaradas y ⛔ no pasó por el
 * lector en todo el recorrido.
 *
 * ⚠️ Las vistas se miran del **recorrido entero** y ⛔ no de un lugar: si el sector se caminó en
 * tres muebles —o si un top apareció en la vidriera y también se escaneó—, esa prenda **está
 * colgada** y ⛔ no se va a buscar al depósito.
 */
export function buscarEnDeposito(escaneos: EscaneoLibre[], conStock: ExhibItem[], cats: string[]): Buscar[] {
  if (!cats.length) return []
  const vistas = vistasDelRecorrido(escaneos)
  const declaradas = cats.map(normCat)
  return conStock
    .filter((it) => !vistas.has(exhibId(it)) && cats.some((c) => perteneceA(it, c)))
    // ⚠️ `catsVisibles` porque en el catálogo vive **la misma categoría dos veces** (mismo nombre,
    // distinto ID en TN): sin esto la explicación dice «CORSETS, CORSETS», que en la columna que
    // justifica por qué aparece una prenda ajena se lee como un error nuestro. Visto en los datos
    // reales del 20-sep-2026.
    .map((it) => ({ it, tambienEn: catsVisibles(catsDeItem(it).filter((c) => c !== SIN_CATEGORIA && !declaradas.includes(normCat(c)))) }))
    .sort((a, b) => b.it.qty - a.it.qty || a.it.name.localeCompare(b.it.name, 'es') || a.it.size.localeCompare(b.it.size, 'es'))
}

/**
 * **Por qué una prenda del mandado se tacha.**
 *
 * 🔴 **Los dos motivos ⛔ no son excusas sueltas: son dos cosas que pasan TODAS las veces**, y las
 * dijo Bruno el 21-sep-2026 mirando el primer mandado real, prenda por prenda:
 * - `'otro-lugar'` — *«overlay sacalas, porque están exhibidas en el perchero de los sweaters»*. La
 *   app sabe manejar esto **adentro** de un recorrido —un top que aparece en la vidriera y se
 *   escanea cuenta como colgado— pero ⛔ no puede saber nada de un sector que nadie caminó.
 * - `'despues'` — *«fueron productos nuevos que entraron el sábado y los exhibieron luego del
 *   escaneo»*. El recorrido es **una foto de un momento** y el balance se hace horas después; en el
 *   medio el local trabaja. ⛔ No es un error de nadie.
 *
 * 🔑 **Se guarda el motivo y ⛔ no sólo el tachón**, y eso es todo el punto: acumulados, los motivos
 * contestan preguntas que hoy ⛔ nadie puede contestar. Si todos los meses aparecen prendas
 * «colgadas en otro lugar», el sector ⛔ no está donde el sistema cree. Si aparecen muchas «se
 * colgó después», el balance se está haciendo demasiado tarde.
 */
export type MotivoTachada = 'otro-lugar' | 'despues'

/** Cómo se lee cada motivo en pantalla. ⛔ Sin tecnicismos: lo escribe y lo lee gente del local. */
export const MOTIVOS: Record<MotivoTachada, string> = {
  'otro-lugar': 'ya está colgada, en otro lugar',
  despues: 'se colgó después del escaneo',
}

/** Una prenda que alguien sacó del mandado, con por qué, quién y cuándo. */
export type Tachada = {
  /** El id de la variante, el mismo `exhibId` con el que viaja un escaneo. */
  variante_id: string
  motivo: MotivoTachada
  por: string | null
  cuando: string
}

/**
 * **El mandado partido en dos: lo que hay que ir a buscar y lo que alguien ya resolvió.**
 *
 * 🔑 **La tachada ⛔ no desaparece, se muda.** Borrarla de la pantalla dejaría a quien mira sin
 * saber por qué el número bajó de 104 a 82 —y sin forma de arrepentirse—. Una lista que cambia sola
 * es una lista que se deja de mirar.
 */
export function partirTachadas(
  lista: Buscar[],
  tachadas: Tachada[],
): { mandado: Buscar[]; sacadas: Array<Buscar & { tachada: Tachada }> } {
  const porId = new Map(tachadas.map((t) => [t.variante_id, t]))
  const mandado: Buscar[] = []
  const sacadas: Array<Buscar & { tachada: Tachada }> = []
  for (const b of lista) {
    const t = porId.get(exhibId(b.it))
    if (t) sacadas.push({ ...b, tachada: t })
    else mandado.push(b)
  }
  return { mandado, sacadas }
}

/**
 * **Una prenda que está colgada más de una vez.**
 *
 * 🔴 **El espacio del salón es el recurso escaso, y ésta es la otra mitad del balance**
 * (21-sep-2026, Bruno: *«el espacio del local es chico, por eso me interesa optimizar mucho eso»*).
 * El mandado trae del depósito al salón lo que falta; esto manda del salón al depósito lo que
 * sobra. 📊 Medido en el primer recorrido de sector entero: **23 prendas colgadas de más, 24
 * perchas** sobre 413 unidades exhibidas — casi el 6 % del sector.
 *
 * 🔑 **Está colgada dos veces de DOS formas, y las dos cuentan.** Dos unidades del mismo color y
 * talle en el mismo mueble (el contador `veces`), o **la misma prenda en dos muebles distintos**
 * —el perchero y la vidriera—, que es una fila por lugar. La segunda ⛔ no se pudo ver el 21-sep
 * porque se caminó un solo lugar, y es la que más va a aparecer cuando se caminen varios.
 *
 * ⚠️ **El rebote del lector ⛔ no entra**: dos lecturas del mismo código en menos de 600 ms se
 * descartan en el teléfono, antes de llegar acá. Lo que queda son prendas de verdad.
 */
export type ColgadaDeMas = {
  variante_id: string
  nombre: string
  size: string
  /** Unidades de esa prenda que pasaron por el lector en todo el recorrido. Siempre 2 o más. */
  unidades: number
  /** Cuántas sobran: `unidades - 1`. Es lo que se puede devolver al depósito. */
  deMas: number
  /** Dónde apareció. **Más de uno = está colgada en dos muebles distintos.** */
  lugares: string[]
}

/**
 * **Las prendas colgadas más de una vez, de la que más perchas ocupa a la que menos.**
 *
 * 🔑 Se mira el **recorrido entero** y ⛔ no un lugar: la prenda que está en el perchero y en la
 * vidriera ocupa dos perchas igual, y ése es justamente el caso que ⛔ no se ve mirando un mueble.
 */
export function colgadasDeMas(escaneos: EscaneoLibre[]): ColgadaDeMas[] {
  const unidades = unidadesVistas(escaneos)
  const datos = new Map<string, { nombre: string; size: string; lugares: Set<string> }>()
  for (const e of escaneos) {
    if (!pasoPorElLector(e)) continue
    const d = datos.get(e.variante_id) || { nombre: e.product_name || '—', size: e.size || '', lugares: new Set<string>() }
    if (e.lugar) d.lugares.add(e.lugar)
    datos.set(e.variante_id, d)
  }

  const out: ColgadaDeMas[] = []
  for (const [variante_id, n] of unidades) {
    if (n < 2) continue
    const d = datos.get(variante_id)
    if (!d) continue
    out.push({ variante_id, nombre: d.nombre, size: d.size, unidades: n, deMas: n - 1, lugares: [...d.lugares] })
  }
  return out.sort((a, b) => b.deMas - a.deMas || a.nombre.localeCompare(b.nombre, 'es') || a.size.localeCompare(b.size, 'es'))
}

/**
 * **Qué se hace con una prenda colgada de más.**
 *
 * 🔴 **La app ⛔ no puede decidirlo y por eso pregunta** — es la misma regla que la cobertura del
 * sector. Dos unidades del mismo color colgadas pueden ser **una decisión de exhibición** (una
 * prenda que se vende y se quiere ver de los dos lados del salón) o **espacio desperdiciado**. Eso
 * lo sabe quien arma el salón, ⛔ no el que cuenta.
 */
export type DecisionRepetida = 'queda' | 'sacar'

/** Cómo se lee cada decisión en pantalla. ⛔ Sin tecnicismos: lo lee gente del local. */
export const DECISIONES: Record<DecisionRepetida, string> = {
  queda: 'está bien que estén las dos',
  sacar: 'sacar la de más al depósito',
}

/** Lo que alguien decidió sobre una prenda colgada de más, firmado. */
export type Repetida = {
  variante_id: string
  decision: DecisionRepetida
  por: string | null
  cuando: string
}

/**
 * **Las colgadas de más, partidas por lo que se decidió.**
 *
 * 🔑 **`sinDecidir` va primero en la pantalla y es el trabajo pendiente.** Una lista donde lo
 * resuelto y lo no resuelto se mezclan obliga a releerla entera cada vez que se vuelve.
 */
export function partirRepetidas(
  lista: ColgadaDeMas[],
  decisiones: Repetida[],
): { sinDecidir: ColgadaDeMas[]; quedan: ColgadaDeMas[]; sacar: Array<ColgadaDeMas & { decidida: Repetida }> } {
  const porId = new Map(decisiones.map((d) => [d.variante_id, d]))
  const sinDecidir: ColgadaDeMas[] = []
  const quedan: ColgadaDeMas[] = []
  const sacar: Array<ColgadaDeMas & { decidida: Repetida }> = []
  for (const c of lista) {
    const d = porId.get(c.variante_id)
    if (!d) sinDecidir.push(c)
    else if (d.decision === 'sacar') sacar.push({ ...c, decidida: d })
    else quedan.push(c)
  }
  return { sinDecidir, quedan, sacar }
}

/**
 * ⚠️ **Acá el número de unidades SÍ va, y ⛔ no contradice la regla del mandado.** En el mandado el
 * número era el **stock del local** —cuántas dice el sistema que hay—, que ⛔ no cambia la tarea de
 * colgar una. Acá es **cuántas sacar**: es la tarea misma.
 */
export const HEADER_SACAR = ['Producto', 'Color / Talle', 'Unidades para sacar', 'Dónde está colgada']

/** Anchos del `.xlsx`, en el orden de `HEADER_SACAR`. */
export const ANCHOS_SACAR = [40, 18, 20, 30]

/** La planilla de lo que vuelve al depósito. */
export function filasSacar(lista: ColgadaDeMas[]): Filas {
  const filas: Filas = [[...HEADER_SACAR]]
  for (const c of lista) filas.push([c.nombre, c.size, c.deMas, c.lugares.join(' / ')])
  return filas
}

export type ResumenBalance = { variantes: number; unidades: number; productos: number }

export function resumenBuscar(lista: Buscar[]): ResumenBalance {
  return {
    variantes: lista.length,
    unidades: lista.reduce((n, b) => n + b.it.qty, 0),
    productos: new Set(lista.map((b) => b.it.productId)).size,
  }
}

/**
 * Lo que el balance **⛔ no puede juzgar**: las prendas del Local sin categoría en Tienda Nube.
 *
 * 🔴 **Se cuenta y se muestra, siempre.** Son invisibles para cualquier universo por categoría: ni
 * aparecen como faltantes ni como presentes. Callarlas haría que el mandado se lea como completo
 * cuando ⛔ no lo es, que es la peor forma de equivocarse acá — nadie va a ir a buscar algo que la
 * lista ⛔ no nombró. Se listan sólo las que **⛔ no se vieron**: la que pasó por el lector está
 * colgada y ⛔ no le hace falta categoría para saberlo.
 */
export function sinCategoriaSinVer(escaneos: EscaneoLibre[], conStock: ExhibItem[]): ExhibItem[] {
  const vistas = vistasDelRecorrido(escaneos)
  return conStock
    .filter((it) => catsDeItem(it)[0] === SIN_CATEGORIA && catsDeItem(it).length === 1 && !vistas.has(exhibId(it)))
    .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name, 'es'))
}

export const HEADER_BUSCAR = ['Producto', 'Color / Talle', 'SKU', 'Código de barras', 'También está en']
/** El ancho de cada columna del Excel, en el orden de `HEADER_BUSCAR`. */
export const ANCHOS_BUSCAR = [40, 18, 18, 18, 28]

/**
 * El Excel del mandado, para el que va al depósito del local con el teléfono o el papel.
 *
 * 🔴 **⛔ NO lleva cuántas unidades hay, y eso es del 21-sep-2026.** Bruno, mirando el primer
 * mandado: *«no me tiene que decir son 309 items o algo así, porque no me interesa el stock del
 * local, me interesa que se exhiba»*. La tarea es **colgar una** de cada color/talle que ⛔ no está
 * colgado; que el sistema tenga 8 en el depósito ⛔ no la cambia, y el número invitaba a traer 8.
 * ⇒ **cada renglón es una prenda a colgar y la cuenta es la cantidad de renglones.**
 *
 * ⚠️ **La última columna se cae sola cuando ⛔ no tiene nada que decir.** «También está en» explica
 * por qué aparece una prenda de otro sector, y eso sólo pasa declarando por categoría de Tienda
 * Nube; declarando por tipo de prenda viene vacía en **todas** las filas, y una columna con
 * encabezado y 86 celdas en blanco se lee como un dato que se perdió.
 */
export function filasBuscar(lista: Buscar[]): Filas {
  const conNota = lista.some((b) => b.tambienEn.length)
  const cols = conNota ? HEADER_BUSCAR.length : HEADER_BUSCAR.length - 1
  const filas: Filas = [HEADER_BUSCAR.slice(0, cols)]
  for (const b of lista) {
    const fila = [b.it.name, b.it.size, b.it.sku || '', b.it.barcode || '', b.tambienEn.join(' / ')]
    filas.push(fila.slice(0, cols))
  }
  return filas
}
