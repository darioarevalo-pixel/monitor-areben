/**
 * El OUTFIT de una sesión de fotos: qué zona del cuerpo ocupa cada prenda, y qué le falta a
 * cada bolsa para ser un look armado.
 *
 * 🔑 **El outfit ⛔ no es un objeto nuevo: es la BOLSA que ya existe** (`ItemSolicitud.bolsa`,
 * construida el 16-ago-2026 y nunca estrenada — 0 ítems con bolsa en las dos marcas el 3-sep).
 * Lo único que este archivo suma es **qué es cada prenda** y el aviso «al outfit 3 le falta el
 * abajo», que es lo que Bruno pidió el 3-sep: *«se generan outfits digitales con distintos
 * productos de arriba y abajo»*.
 *
 * La regla del outfit la dictó él en la misma vuelta: **arriba + abajo, o una prenda entera**
 * (un vestido o un mono ocupa las dos ranuras).
 *
 * ## 🔴 Por qué la zona sale del NOMBRE y ⛔ no de la categoría
 *
 * El plan de la Fase 1 decía envolver `familiaDe`, que lee las categorías de **TiendaNube**. Se
 * midió antes de escribir —4-sep-2026, contra las dos bases— y la categoría ⛔ **no puede
 * contestar**:
 *
 * - **La categoría de Gestión Nube dejó de llenarse.** De lo dado de alta desde julio-2026 con
 *   stock en Zattia, **el 100% viene sin categoría** (35/35 en julio, 50/50 en agosto, 67/67 en
 *   septiembre). Sobre el total con stock: **400 de 501 sin categoría (79,8%)**, y sólo **36
 *   (7,2%) cruzan con una familia**. Y lo que una sesión de fotos pide es, justamente, **lo que
 *   acaba de entrar**.
 * - **En BDI ⛔ no es un defecto: no vende ropa.** 0 de 450 productos cruzan con una familia
 *   porque son fundas, cables y vidrios templados. Ahí «arriba/abajo» ⛔ no significa nada, y por
 *   eso una bolsa **sin una sola prenda clasificada ⛔ no reclama nada** (ver `alertasDe`).
 * - **El nombre sí dice la prenda, y está siempre.** La primera palabra es un vocabulario cerrado
 *   de 35 palabras (`TOP` 131, `SHORT` 40, `MINI` 34, `BABY` 31…).
 *
 * ⇒ el nombre manda, la categoría de GN entra **como segunda fuente** cuando está, y lo que no
 * cae en ninguna de las dos queda **«sin zona»**, que se muestra y se corrige de un toque.
 * ⛔ **Nunca un default a «arriba»**: un default afirma, y acá afirmaría sobre la prenda que
 * alguien tiene en la mano.
 *
 * 📌 **Caminado contra las dos bases el 4-sep-2026**, sobre lo que tiene stock:
 * - **Zattia, 501 productos**: 322 arriba · 137 abajo · 22 enteras = **481 con zona (96,0%)**.
 *   De los 20 restantes, **19 son accesorios que el vocabulario RECONOCE** (cintos, fajas,
 *   pañuelos, `MINI BAG`, `MINI CLUTCH`) y **una sola prenda** queda sin poder decirse:
 *   `FADE #002`. ⇒ de prendas de verdad, **481 de 482**.
 * - **BDI, 223 productos**: **223 sin zona, y está bien** — son fundas, cables y vidrios
 *   templados. Ahí el módulo entero se calla, por `aplicaOutfits`: es la prueba de que no afirma.
 *
 * 🔴 Por eso «no es una prenda de outfit» y «no sé qué es» ⛔ **no pueden ser el mismo valor**:
 * con los dos en `null`, la pantalla le pediría a alguien que clasifique un cinto. Los separa
 * `esPrendaDeOutfit`, y es lo que mira `sinZona`.
 */

import { familiaDe, fueraDeAlcance, type Familia } from '../tn-desc/atributos'

/**
 * Lo mínimo que una prenda necesita para poder clasificarse y entrar a un outfit.
 *
 * 🔑 **Es el adaptador, ⛔ no una copia.** `ItemSolicitud` lo cumple tal cual, y desde la Fase 3
 * también lo cumple un ítem del BANCO del evento —que llama `outfit` a lo que la solicitud llama
 * `bolsa`, y se mapea en una línea (`lib/sesionfotos/banco.ts`)—. Escribir estas reglas dos veces,
 * una por cada forma, es exactamente lo que haría que un día el aviso del banco y el de la
 * solicitud dijeran cosas distintas sobre el mismo outfit.
 */
export type PrendaClasificable = {
  vid: string
  nombre: string
  pid?: string | null
  /** El número de outfit: `bolsa` en la solicitud, `outfit` en el banco. Ausente = sin repartir. */
  bolsa?: number
}

/** Qué ranura del outfit ocupa la prenda. `entero` ocupa las dos (vestido, mono, enterito). */
export type ZonaPrenda = 'arriba' | 'abajo' | 'entero'

/** Cómo se llama cada zona en la pantalla. Vive acá para que no se escriba distinto en dos lados. */
export const ROTULO_ZONA: Record<ZonaPrenda, string> = {
  arriba: 'Arriba',
  abajo: 'Abajo',
  entero: 'Prenda entera',
}

/**
 * El vocabulario de prendas, por cómo EMPIEZA el nombre del producto.
 *
 * 🔑 **Se escribe la regla, ⛔ no el caso**: son prefijos del nombre, no una lista de productos.
 * Salió de medir las 501 con stock de Zattia el 4-sep-2026 y de mirar los nombres reales, ⛔ no
 * de imaginar cómo se llamarían.
 *
 * 🔴 **Las frases de DOS palabras se prueban primero, y no es un adorno**: `MINI` sola es una
 * pollera (34 productos), pero `MINI BAG` y `MINI CLUTCH` son **carteras** — con la primera
 * palabra sola, cuatro carteras entraban al outfit como si fueran polleras.
 */
const FRASES: [string, ZonaPrenda | null][] = [
  ['BABY TEE', 'arriba'], // 31 productos: es una remera, ⛔ no ropa de bebé
  ['LONG TEE', 'arriba'],
  ['MINI BAG', null], // cartera
  ['MINI CLUTCH', null], // cartera
]

/** El vocabulario por primera palabra. `null` = ⛔ no es una prenda de outfit (accesorio, cartera). */
const PALABRAS: Record<string, ZonaPrenda | null> = {
  // Arriba
  TOP: 'arriba',
  REMERA: 'arriba',
  REMERON: 'arriba',
  MUSCULOSA: 'arriba',
  BLUSA: 'arriba',
  CAMISA: 'arriba',
  BODY: 'arriba',
  CORSET: 'arriba',
  STRAPLESS: 'arriba',
  SWEATER: 'arriba',
  BUZO: 'arriba',
  HOODIE: 'arriba',
  CARDIGAN: 'arriba',
  SAQUITO: 'arriba',
  CAMPERA: 'arriba',
  BLAZER: 'arriba',
  CHALECO: 'arriba',
  CORPINO: 'arriba', // la parte de arriba de un bikini: con la bombacha arman un outfit
  // Abajo
  SHORT: 'abajo',
  BERMUDA: 'abajo',
  MINI: 'abajo',
  POLLERA: 'abajo',
  FALDA: 'abajo',
  SKORT: 'abajo',
  JEAN: 'abajo',
  PANTALON: 'abajo',
  CALZA: 'abajo',
  BOMBACHA: 'abajo',
  // Entero: ocupa las dos ranuras
  VESTIDO: 'entero',
  MONO: 'entero',
  ENTERITO: 'entero',
  // ⛔ No son prenda de outfit. Se nombran igual —en vez de dejarlas caer en «sin zona»— para
  // que la pantalla ⛔ no pida clasificar un cinto.
  ACCESORIO: null,
  CINTO: null,
  CINTURON: null,
  PANUELO: null,
  CARTERA: null,
  BAG: null,
  RINONERA: null,
  MOCHILA: null,
  FAJA: null, // en Zattia son accesorios (categoría `ACCESORIOS`), ⛔ no ropa interior
}

/** La zona que le toca a cada familia de `atributos.core.js`, cuando la categoría existe. */
const ZONA_DE_FAMILIA: Record<Familia, ZonaPrenda> = {
  tops: 'arriba',
  abrigo: 'arriba',
  faldas: 'abajo',
  pantalon: 'abajo',
  vestidos: 'entero',
}

/**
 * Normaliza para comparar: mayúsculas, sin tildes y sin dobles espacios. Los nombres reales
 * vienen con y sin tilde en la misma palabra (`CORPIÑO` y `CORPINO`), así que la Ñ también cae.
 */
function normalizar(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/Ñ/gi, 'N')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * La zona que se PROPONE para una prenda: primero el nombre, después la categoría de GN.
 *
 * Devuelve `null` cuando ninguna de las dos lo dice, y eso ⛔ no es un error que haya que tapar:
 * es una prenda «sin zona», que la pantalla muestra y deja corregir de un toque.
 *
 * @param nombre El nombre del producto tal como viene de Gestión Nube.
 * @param categorias Las categorías de GN. 🔑 En GN `category` es **una lista separada por
 *   comas** (`'NEW IN, DAY, DENIM'`), ⛔ no una categoría: hay que partirla antes (`catsDeGN`).
 */
export function zonaSugerida(nombre: string, categorias?: string[]): ZonaPrenda | null {
  const dicho = loQueDiceElNombre(nombre)
  if (dicho !== undefined) return dicho
  const fam = familiaDe(categorias || [])
  return fam ? ZONA_DE_FAMILIA[fam] : null
}

/**
 * Lo que dice el nombre: una zona, `null` si el vocabulario lo conoce y ⛔ **no es** prenda de
 * outfit (un cinto), o `undefined` si el nombre ⛔ no dice nada.
 */
function loQueDiceElNombre(nombre: string): ZonaPrenda | null | undefined {
  const n = normalizar(nombre)
  if (!n) return undefined
  for (const [frase, zona] of FRASES) if (n === frase || n.startsWith(frase + ' ')) return zona
  const primera = n.split(' ')[0]
  return primera in PALABRAS ? PALABRAS[primera] : undefined
}

/**
 * ¿Es una prenda que puede ocupar una ranura del outfit?
 *
 * 🔴 **«No es una prenda» y «no sé qué es» ⛔ no son lo mismo**, y esta es la función que los
 * separa. Un cinto, una faja o una `MINI BAG` quedan sin zona **a propósito** y la pantalla ⛔ no
 * tiene que pedir que alguien los clasifique; un `FADE #002` sí. Medido el 4-sep-2026: de las 20
 * de Zattia que quedan sin zona, **19 son de las primeras y una sola de las segundas**.
 */
export function esPrendaDeOutfit(nombre: string, categorias?: string[]): boolean {
  const dicho = loQueDiceElNombre(nombre)
  if (dicho !== undefined) return dicho !== null
  return !fueraDeAlcance(categorias || [])
}

/**
 * Parte el `category` de Gestión Nube, que es una lista separada por comas y ⛔ no una categoría.
 * Medido el 4-sep-2026: de las 1.936 no vacías de Zattia, la mayoría trae dos o más
 * (`'NEW IN, DAY, DENIM'`). `familiaDe` ya saltea las de campaña (NEW IN, SALE…).
 */
export function catsDeGN(category?: string | null): string[] {
  return String(category || '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
}

/**
 * La zona que VALE para un ítem: la corrección a mano le gana a la propuesta.
 *
 * 🔑 La corrección es por `vid` y ⛔ no por producto: la misma prenda puede estar en dos
 * solicitudes y la decisión es de esta sesión.
 */
export function zonaEfectiva(
  vid: string,
  sugerida: ZonaPrenda | null,
  clasif?: Record<string, ZonaPrenda>,
): ZonaPrenda | null {
  const puesta = clasif && clasif[vid]
  return puesta || sugerida
}

/** Lo que le falta a una bolsa para ser un outfit armado. */
export type AlertaOutfit = {
  /** El número de bolsa/outfit. */
  n: number
  falta: 'arriba' | 'abajo'
  /** El aviso ya escrito, para que ⛔ no se redacte distinto en cada pantalla. */
  texto: string
}

/** La zona de cada ítem, ya resuelta (propuesta + corrección). */
export type ZonaPorItem = Record<string, ZonaPrenda | null>

/**
 * Resuelve la zona de cada ítem de la solicitud.
 *
 * `cats` es opcional y ⛔ no hace falta que esté: sin ella la zona sale del nombre, que es lo que
 * contesta en el 99,8% de los casos medidos. Cuando la pantalla tiene el catálogo cargado, pasarla
 * sólo agrega los productos viejos que sí tienen categoría.
 */
export function zonasDe(
  items: PrendaClasificable[],
  clasif?: Record<string, ZonaPrenda>,
  cats?: Record<string, string[]>,
): ZonaPorItem {
  const out: ZonaPorItem = {}
  for (const i of items || []) {
    const c = cats && i.pid ? cats[String(i.pid)] : undefined
    out[i.vid] = zonaEfectiva(i.vid, zonaSugerida(i.nombre, c), clasif)
  }
  return out
}

/**
 * Los avisos «al outfit 3 le falta el abajo», uno por bolsa incompleta y ordenados por número.
 *
 * Las reglas, y por qué cada una:
 * - Un outfit es **arriba + abajo, o una prenda entera** (lo dictó Bruno el 3-sep-2026). Una
 *   bolsa con un `entero` está completa aunque no tenga nada más.
 * - 🔴 **Una bolsa sin una sola prenda clasificada ⛔ no reclama nada.** Es el caso de BDI, donde
 *   los 450 productos son fundas y cables: avisarle «te falta el abajo» a una bolsa de fundas
 *   sería el sistema afirmando sobre algo que ⛔ no sabe.
 * - **Los ítems SIN bolsa ⛔ no son un outfit** y no se cuentan: todavía no los repartió nadie.
 */
export function alertasDe(
  items: PrendaClasificable[],
  clasif?: Record<string, ZonaPrenda>,
  cats?: Record<string, string[]>,
): AlertaOutfit[] {
  const zonas = zonasDe(items, clasif, cats)
  const porBolsa = new Map<number, Set<ZonaPrenda>>()
  for (const i of items || []) {
    if (typeof i.bolsa !== 'number') continue
    const z = zonas[i.vid]
    const set = porBolsa.get(i.bolsa) || new Set<ZonaPrenda>()
    if (z) set.add(z)
    porBolsa.set(i.bolsa, set)
  }
  const out: AlertaOutfit[] = []
  for (const n of [...porBolsa.keys()].sort((a, b) => a - b)) {
    const z = porBolsa.get(n) as Set<ZonaPrenda>
    if (!z.size) continue // ⛔ nada clasificado: no se afirma
    if (z.has('entero')) continue
    if (z.has('arriba') && !z.has('abajo')) out.push({ n, falta: 'abajo', texto: `Al outfit ${n} le falta el abajo` })
    else if (z.has('abajo') && !z.has('arriba')) out.push({ n, falta: 'arriba', texto: `Al outfit ${n} le falta el arriba` })
  }
  return out
}

/**
 * ¿Esta solicitud es de ropa? Es verdadero apenas **una** prenda pudo clasificarse.
 *
 * 🔴 **Es el interruptor de todo el módulo, y existe por BDI.** Ahí los 223 productos con stock
 * son fundas, cables y vidrios templados: ninguno cruza el vocabulario ni la categoría
 * `ACCESORIOS`/`BAGS` que conoce `fueraDeAlcance`. Sin este corte, una sesión de fundas mostraría
 * «223 prendas sin clasificar» — el sistema **afirmando** sobre algo de lo que ⛔ no sabe nada.
 * ⇒ **si no hay una sola prenda, el módulo entero se calla.**
 */
export function aplicaOutfits(
  items: PrendaClasificable[],
  clasif?: Record<string, ZonaPrenda>,
  cats?: Record<string, string[]>,
): boolean {
  const zonas = zonasDe(items, clasif, cats)
  return (items || []).some((i) => !!zonas[i.vid])
}

/**
 * Las prendas que hay que clasificar a mano: sin zona **y** que son prenda de outfit.
 *
 * Los accesorios ⛔ no entran —el vocabulario ya dijo que no ocupan ranura— y en una solicitud
 * donde ⛔ **nada** es ropa la lista sale vacía, por `aplicaOutfits`.
 */
export function sinZona<T extends PrendaClasificable>(
  items: T[],
  clasif?: Record<string, ZonaPrenda>,
  cats?: Record<string, string[]>,
): T[] {
  if (!aplicaOutfits(items, clasif, cats)) return []
  const zonas = zonasDe(items, clasif, cats)
  return (items || []).filter((i) => {
    if (zonas[i.vid]) return false
    const c = cats && i.pid ? cats[String(i.pid)] : undefined
    return esPrendaDeOutfit(i.nombre, c)
  })
}
