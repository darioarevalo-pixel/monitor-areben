/**
 * Chequeo de exhibición **libre**: recorrer el local por LUGAR en vez de por categoría.
 *
 * 🔑 **Por qué existe.** El modo por categoría ⛔ no se parece al salón: una misma categoría de
 * Tienda Nube está colgada en varios lugares, y la categoría engloba mal —el perchero de tops se
 * compara contra «TOPS Y BODIES», un bolsón de 291 que se come tops, bodies, blusas, camisas,
 * corsets y musculosas—. Acá se escanea donde uno está parado («perchero tops») y cada escaneo se
 * guarda **con su lugar**, en la base, para poder compararlo después contra lo que corresponda.
 *
 * ⛔ **Este archivo NO calcula faltantes.** Es el dato de qué se escaneó en cada lugar y nada más.
 * Lo único que la app deriva —**los hermanos de lo que el recorrido tocó**— vive aparte, en
 * `colgar.ts`, y sigue ⛔ sin decidir qué debería estar colgado en cada perchero.
 *
 * Todo lo de acá es puro: se ejerce entero en `tests/exhib-libre.test.ts` sin red ni base.
 */

import type { Filas } from '../excel'
import { normCode, exhibId, precioDeGondola } from './core'
import type { ExhibEstado, ExhibItem } from './tipos'

/** Un escaneo del recorrido libre: la prenda, y **dónde** apareció. Espeja `exhib_escaneo`. */
export type EscaneoLibre = {
  /** Tal como lo escribió la persona parada ahí. Texto libre, ⛔ no un catálogo. */
  lugar: string
  /** `exhibId()`, o `'?'+normCode(codigo)` cuando el código ⛔ no cruzó con el inventario. */
  variante_id: string
  /**
   * `false` = el código ⛔ no cruzó con ninguna variante del Local. Se guarda igual.
   *
   * ⚠️ `true` con `qty` en **0** ⛔ no es lo mismo: ésa es una prenda que existe, está colgada, y el
   * sistema la tiene en cero. Ver `hallazgoDe`.
   */
  encontrado: boolean
  codigo_crudo: string
  barcode: string | null
  sku: string | null
  product_id: string | null
  product_name: string | null
  size: string | null
  /** TODAS las categorías TN limpias del producto, ⛔ no la primera. Ver `filasExport`. */
  cats: string[]
  qty: number | null
  /** Los dos precios de TN congelados al escanear. `null` = el producto ⛔ no cruzó con TN. */
  precio: number | null
  promo: number | null
  /** ISO. El reloj del teléfono: la cola puede subirse mucho después. */
  escaneado_en: string
  /**
   * **Cuántas unidades de esta variante se vieron en este lugar.** Ausente = 1 (las filas de antes
   * del 19-sep-2026 a la tarde).
   *
   * 🔑 **El recorrido cuenta UNIDADES y ⛔ no «si apareció».** Lo pidió Bruno: *«que te permita
   * escanear todo aunque vaya repetido… que se pueda anotar que hay dos repetidos, pero te deje»*.
   * Con un sí/no, un perchero con 2 de las 3 que el sistema dice sale «exhibido» y la que falta ⛔
   * no la ve nadie; contando, el faltante es **medido** —vistas contra stock— y ⛔ no inferido.
   *
   * ⚠️ La fila sigue siendo **una sola** por (recorrido, lugar, variante): el único de la base ⛔ no
   * se toca, lo que sube es el contador. Así el repetido ⛔ no puede ensuciar la lista de lo que se
   * caminó, y sigue habiendo un solo renglón por prenda en el Excel.
   */
  veces?: number
  /**
   * ISO de la **última** vez que se sumó una. La primera queda en `escaneado_en`.
   *
   * 🔑 Las dos horas y ⛔ no una: `escaneado_en` es cuándo se pasó por ese perchero —lo que ordena
   * la caminata— y `ultimo_en` es lo que deja ver un repetido que llegó media hora después, que ⛔
   * no es la misma prenda mirada dos veces sino una vuelta al mismo mueble.
   */
  ultimo_en?: string | null
  /**
   * Sólo en el recorrido **por categoría**: qué pasó con esa variante.
   *
   * `null`/ausente = escaneo del modo **libre**, que ⛔ no tiene triage. `'exhibido'` = pasó por el
   * lector; los otros tres son la marca de lo que ⛔ no apareció y **⛔ no pasó por el lector**.
   *
   * 🔴 **Esa diferencia la usa `paraColgar`**: un triage ⛔ no «toca» el producto —nadie lo vio— y
   * una variante marcada «no se encuentra» es **BUSCAR**, ⛔ no colgar.
   */
  estado?: EstadoTriage | null
}

/**
 * Lo que se puede marcar en el recorrido por categoría.
 *
 * 🔑 **Es el mismo tipo de `tipos.ts` y ⛔ no una copia**: la lista de estados la conocen la
 * pantalla, el PDF y ahora la base, y tres listas iguales escritas aparte es la que se despega.
 */
export type EstadoTriage = ExhibEstado

/** ¿Este escaneo pasó de verdad por el lector? El triage ⛔ no: es una marca sobre lo que faltó. */
export function pasoPorElLector(e: Pick<EscaneoLibre, 'encontrado' | 'estado'>): boolean {
  return e.encontrado && (e.estado == null || e.estado === 'exhibido')
}

/**
 * El estado de cada variante **derivado de los escaneos del recorrido**, que es lo que la pantalla
 * y el PDF pintan desde el 19-sep-2026.
 *
 * 🔴 **La regla vive acá y ⛔ no en el hook**: es la que decide qué dice «EXHIBIDO CORRECTAMENTE»,
 * y adentro de un `useMemo` ⛔ no se puede ejercer. Antes era un `localStorage` sin fecha que ⛔ no
 * se limpiaba nunca.
 *
 * 🔑 **Gana la marca MÁS NUEVA, por el reloj del escaneo y ⛔ no por el orden del array.** La misma
 * variante puede marcarse dos veces —«no se encuentra» y, cuando aparece, «solucionado»—, y la cola
 * puede subir y releerse en cualquier orden. El orden de llegada ⛔ no es el orden de los hechos.
 */
export function estadosDe(escaneos: EscaneoLibre[]): Record<string, EstadoTriage> {
  const out: Record<string, EstadoTriage> = {}
  const cuando: Record<string, string> = {}
  for (const e of escaneos) {
    if (!e.estado) continue
    const previo = cuando[e.variante_id]
    if (previo && previo > e.escaneado_en) continue
    out[e.variante_id] = e.estado
    cuando[e.variante_id] = e.escaneado_en
  }
  return out
}

/** Las unidades que registra un escaneo. Las filas viejas ⛔ no tienen el campo, y valen 1. */
export function vecesDe(e: Pick<EscaneoLibre, 'veces'>): number {
  const n = Math.trunc(Number(e.veces))
  return Number.isFinite(n) && n > 0 ? n : 1
}

/**
 * 🔴 **El corte entre «hay dos colgadas» y «el aparato disparó dos veces».**
 *
 * 📊 **Medido, ⛔ no estimado** (19-sep-2026, los 166 escaneos de los dos recorridos reales de
 * Zattia): el intervalo **más corto entre dos escaneos de una persona fue de 997 ms**, y sólo 9 de
 * 164 bajaron de 2 s. Un doble disparo del lector —que entra como teclado y repite el Enter— es de
 * decenas de milisegundos. Se corta en **600 ms**: deja 400 ms de aire contra la persona más rápida
 * que hubo, y ningún rebote del aparato llega tan lejos.
 *
 * ⚠️ Vale **sólo para el MISMO código**: dos prendas distintas seguidas ⛔ no se tocan nunca.
 */
export const DOBLE_LECTURA_MS = 600

export function esDobleLectura(previo: Pick<EscaneoLibre, 'escaneado_en' | 'ultimo_en'>, ahora: number): boolean {
  const ultimo = Date.parse(previo.ultimo_en || previo.escaneado_en)
  return Number.isFinite(ultimo) && ahora - ultimo < DOBLE_LECTURA_MS
}

/**
 * **Las unidades vistas por variante en todo el recorrido**, que es el número contra el que se
 * compara el stock. Sólo cuenta lo que **pasó por el lector**: un triage ⛔ no vio nada.
 *
 * 🔑 Del recorrido ENTERO y ⛔ no de un lugar: la misma prenda puede estar colgada en dos muebles,
 * y para «cuántas hay en el salón» las dos cuentan.
 */
export function unidadesVistas(escaneos: EscaneoLibre[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const e of escaneos) {
    if (!pasoPorElLector(e)) continue
    out.set(e.variante_id, (out.get(e.variante_id) || 0) + vecesDe(e))
  }
  return out
}

/** Suma una unidad a un escaneo que ya estaba: es lo que pasa cuando el repetido ⛔ no se rechaza. */
export function sumarUna(e: EscaneoLibre, ahora: number = Date.now()): EscaneoLibre {
  return { ...e, veces: vecesDe(e) + 1, ultimo_en: new Date(ahora).toISOString() }
}

/** La cabecera de un recorrido. Espeja `exhib_recorrido`. */
export type RecorridoLibre = {
  id: string
  store: string
  modo: string
  persona: string | null
  estado: 'en_curso' | 'cerrado'
  nota: string | null
  creado_en: string
  cerrado_en: string | null
  /** Sólo en la lista de recorridos: cuántos escaneos tiene. */
  escaneos?: number
}

/**
 * Id del recorrido, generado en el teléfono. Mismo formato que los de PRM (`rc<epoch>_<azar>`).
 *
 * ⚠️ Lo genera el cliente y ⛔ no la base: el recorrido tiene que poder arrancar y recibir escaneos
 * sin haber hablado con el servidor todavía. Si esperara un id de la base, un local sin señal ⛔ no
 * podría ni empezar.
 */
export function nuevoRecorridoId(): string {
  return `ex${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Arma la fila de un escaneo. `it` en `null` = el código ⛔ no cruzó con el inventario del Local.
 *
 * 🔑 **El que no cruza se guarda igual.** Hasta el 19-sep-2026 la pantalla contestaba «ese código no
 * está en la lista» y el dato se perdía. Pero escanear en el salón algo que ⛔ no figura con stock
 * en el Local **es** un hallazgo del recorrido —stock mal cargado, prenda de otra marca, una
 * devolución sin ingresar— y es el único que nadie puede reconstruir después.
 *
 * 🔑 **Y la prenda en CERO entra por la otra puerta**: `it` con `qty` en 0 es un escaneo
 * `encontrado`, con su nombre, su SKU y sus categorías. ⛔ No hace falta una columna nueva en la
 * tabla: en la base el caso se lee `encontrado and qty <= 0`, y en la pantalla y el Excel lo dice
 * `hallazgoDe`.
 */
export function aEscaneo(it: ExhibItem | null, codigoCrudo: string, lugar: string, ahora: number = Date.now()): EscaneoLibre {
  const codigo = String(codigoCrudo || '').trim()
  const base = {
    lugar: lugar.trim(),
    codigo_crudo: codigo,
    escaneado_en: new Date(ahora).toISOString(),
  }
  if (!it) {
    return {
      ...base,
      // El `?` adelante ⛔ no es decorativo: mantiene al no-encontrado fuera del espacio de ids de
      // variante, así que jamás puede chocar con una prenda real en el único de la tabla.
      variante_id: '?' + normCode(codigo),
      encontrado: false,
      barcode: null,
      sku: null,
      product_id: null,
      product_name: null,
      size: null,
      cats: [],
      qty: null,
      precio: null,
      promo: null,
    }
  }
  return {
    ...base,
    variante_id: exhibId(it),
    encontrado: true,
    barcode: it.barcode || null,
    sku: it.sku || null,
    product_id: it.productId,
    product_name: it.name,
    size: it.size || null,
    // 🔑 `cleanCats` y ⛔ no `cat`: `cat` es `cleanCats[0]`, la primera y nada más, que es lo que
    // hace que BLUSAS, SHORTS y BERMUDAS muestren CERO en el modo por categoría. Acá se guardan
    // todas porque son exactamente lo que se va a comparar contra el lugar.
    cats: it.cleanCats,
    qty: it.qty,
    precio: it.precio,
    promo: it.promo,
  }
}

/**
 * Las categorías de un escaneo **como se muestran**: sin repetir la misma escrita distinto.
 *
 * 🔴 **Se vio en producción el 19-sep-2026**: la columna decía «TOPS Y BODIES / TOPS Y BODIES».
 * ⛔ No es un bug del escaneo —el producto está de verdad en **dos categorías de TN con el mismo
 * nombre y distinto ID**, de las 13 que alguien creó de una sentada sin borrar las viejas— pero en
 * la columna con la que se compara el perchero se lee como un error de la app y ⛔ no agrega nada.
 *
 * ⚠️ Es **presentación**: lo guardado ⛔ no se toca. El día que `limpiarCats` trabaje por ID (el
 * pendiente 3), esto deja de hacer falta solo.
 */
export function catsVisibles(cats: string[]): string[] {
  const vistas = new Map<string, string>()
  for (const c of cats || []) {
    const k = String(c ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
    if (k && !vistas.has(k)) vistas.set(k, String(c).trim())
  }
  return [...vistas.values()]
}

/**
 * La clave del único, igual que `ux_exhib_escaneo`: **(lugar, variante)**.
 *
 * 🔑 Lleva el lugar adentro a propósito. La misma prenda colgada en dos percheros son DOS escaneos
 * —y eso es información, no un duplicado—; lo que se corta es el doble escaneo en el mismo lugar.
 * ⚠️ Esta función y el índice de la base dicen lo mismo, y tienen que seguir diciéndolo: si acá se
 * dedupla por variante sola, la pantalla mostraría uno menos de lo que la base guardó.
 */
export function claveEscaneo(e: Pick<EscaneoLibre, 'lugar' | 'variante_id'>): string {
  return e.lugar + '\u0000' + e.variante_id
}

/** ¿Este código ya se escaneó en este lugar? (el único de la base lo rechazaría en silencio). */
export function yaEscaneado(escaneos: EscaneoLibre[], clave: string): boolean {
  return escaneos.some((e) => claveEscaneo(e) === clave)
}

/** Grupo de un lugar, para la pantalla y para el export. */
export type GrupoLugar = { lugar: string; escaneos: EscaneoLibre[] }

/**
 * Agrupa por lugar, **en el orden en que se recorrió** (el lugar aparece donde se escaneó el
 * primero de sus ítems), y adentro lo último arriba.
 *
 * ⚠️ Alfabético sería peor: el recorrido tiene un orden físico —se arranca por la entrada y se
 * termina en el fondo— y ése es el orden en el que después se lo camina para verificar.
 */
export function agruparPorLugar(escaneos: EscaneoLibre[]): GrupoLugar[] {
  const grupos = new Map<string, EscaneoLibre[]>()
  for (const e of escaneos) {
    const g = grupos.get(e.lugar)
    if (g) g.push(e)
    else grupos.set(e.lugar, [e])
  }
  return [...grupos].map(([lugar, lista]) => ({
    lugar,
    escaneos: [...lista].sort((a, b) => b.escaneado_en.localeCompare(a.escaneado_en)),
  }))
}

/**
 * El titular de un recorrido: **quién ⛔ no, eso vive en la cabecera; acá va lo que sale de los
 * escaneos**.
 *
 * 🔑 **Es lo que hasta el 19-sep-2026 sólo viajaba al Excel.** La pantalla mostraba las filas y
 * nada más, así que para saber a qué hora se caminó, cuántos muebles se tocaron o cuántos
 * hallazgos hubo había que **bajar la planilla** — y eso ⛔ no se hace desde el teléfono en el
 * local. Bruno: *«el Excel no sé si es buena opción, habría que mejorarlo como el libre, y que
 * tenga registro de hora, día y quién»*.
 *
 * ⚠️ `desde`/`hasta` salen del **reloj del teléfono que escaneó** (`escaneado_en`) y ⛔ no de
 * cuándo se subió: un recorrido sin señal sube entero media hora después.
 */
export type ResumenRecorrido = { escaneos: number; unidades: number; lugares: number; desde: string | null; hasta: string | null; enCero: number; noCruzo: number }

export function resumenRecorrido(escaneos: EscaneoLibre[]): ResumenRecorrido {
  const horas = escaneos.map((e) => e.escaneado_en).sort((a, b) => a.localeCompare(b))
  return {
    escaneos: escaneos.length,
    // 🔑 **Prendas** (filas) y **unidades** (con los repetidos) son dos números distintos, y los dos
    // se muestran: «97 prendas · 103 unidades» dice algo que ninguno de los dos dice solo.
    unidades: escaneos.reduce((n, e) => n + vecesDe(e), 0),
    lugares: lugaresDe(escaneos).length,
    desde: horas[0] ?? null,
    hasta: horas.at(-1) ?? null,
    enCero: escaneos.filter((e) => hallazgoDe(e) === 'EN CERO').length,
    noCruzo: escaneos.filter((e) => hallazgoDe(e) === 'NO CRUZÓ').length,
  }
}

/** Los lugares del recorrido, en orden de aparición. */
export function lugaresDe(escaneos: EscaneoLibre[]): string[] {
  return agruparPorLugar(escaneos).map((g) => g.lugar)
}

/**
 * Las sugerencias del campo «Lugar»: primero los de este recorrido (son los percheros de hoy),
 * después los de recorridos anteriores que todavía no se usaron. Sin repetir, comparando sin
 * distinguir mayúsculas ni espacios de más — «Perchero Tops» y «perchero tops» son el mismo mueble.
 *
 * ⚠️ Es una **sugerencia y ⛔ no una lista cerrada**: el salón se reacomoda, y un desplegable que no
 * tiene el perchero de hoy obliga a elegir uno que miente.
 */
export function lugaresSugeridos(delServidor: string[], deEsteRecorrido: string[]): string[] {
  const vistos = new Set<string>()
  const out: string[] = []
  for (const l of [...deEsteRecorrido, ...delServidor]) {
    const t = String(l ?? '').trim()
    if (!t) continue
    const k = t.toLowerCase()
    if (vistos.has(k)) continue
    vistos.add(k)
    out.push(t)
  }
  return out
}

/** Cuántos escaneos hay en este lugar (el contador de la pantalla mientras se camina). */
export function contarEnLugar(escaneos: EscaneoLibre[], lugar: string): number {
  const l = lugar.trim()
  // 🔑 **Unidades y ⛔ no filas**: el número que mira la persona parada en el perchero es «cuántas
  // pasé», y desde que el repetido suma, dos prendas iguales son 2. Contando filas diría 1 y ⛔ no
  // cuadraría contra lo que tiene colgado adelante.
  return escaneos.filter((e) => e.lugar === l).reduce((n, e) => n + vecesDe(e), 0)
}

/**
 * Los tres finales posibles de un escaneo, en una palabra.
 *
 * 🔴 **Antes eran DOS y uno se comía al otro.** Hasta el 19-sep-2026 el recorrido sólo veía las
 * variantes con stock, así que una prenda colgada que el sistema tiene en **cero** caía en «no
 * cruzó», exactamente igual que una lectura a medias del lector. Son dos hallazgos distintos y el
 * del cero es el que más vale —stock mal cargado, devolución sin ingresar—: es el único que ⛔ no
 * se descubre de ninguna otra forma.
 *
 * 🔑 **Una sola función para la pantalla y para el Excel.** Si el badge de la fila y la columna del
 * export decidieran cada uno por su cuenta, el día que cambie el criterio van a discrepar sobre la
 * misma prenda, y quien compare no tiene cómo saber cuál de los dos miente.
 */
export type Hallazgo = '' | 'EN CERO' | 'NO CRUZÓ'

export function hallazgoDe(e: Pick<EscaneoLibre, 'encontrado' | 'qty'>): Hallazgo {
  if (!e.encontrado) return 'NO CRUZÓ'
  // El negativo entra acá también: 12 variantes del Local están abajo de cero, y «colgada con el
  // stock mal» es lo mismo que se quiere ver.
  return e.qty != null && e.qty <= 0 ? 'EN CERO' : ''
}

export const HEADER_EXPORT = [
  'Lugar',
  'Producto',
  'Talle',
  'SKU',
  'Código de barras',
  'Categorías en Tienda Nube',
  'Stock Local',
  'Precio a cobrar',
  'Escaneado',
  // 🔑 Va **última** y ⛔ no al lado del nombre: las nueve de arriba son las que Bruno ya cruza a
  // mano contra el salón, y moverlas de columna rompe la comparación con los recorridos anteriores.
  'Hallazgo',
  // 🆕 19-sep-2026. Va **después** de Hallazgo por lo mismo: las diez de arriba ⛔ no se mueven.
  // Es cuántas unidades de esa prenda se contaron en ese mueble — el repetido ⛔ ya no rebota.
  'Unidades contadas',
] as const

/** Anchos de columna del `.xlsx`, en caracteres. */
export const ANCHOS_EXPORT = [22, 40, 8, 16, 18, 42, 11, 14, 18, 12, 18]

/**
 * Las filas del `.xlsx` que se baja al terminar: **es el dato con el que se compara por afuera**.
 *
 * 🔑 «Categorías en Tienda Nube» lleva **todas**, separadas por ` / `, y ésa es la columna entera
 * del pedido: mirando el perchero de tops contra ella se ve de una cuáles de esas prendas TN las
 * tiene en «TOPS Y BODIES» junto con blusas, camisas y corsets. Con la primera categoría sola —que
 * es lo que guarda el modo por categoría— la comparación ⛔ no se puede hacer.
 *
 * 🔑 El que ⛔ no cruzó entra igual, con el código crudo en lugar del nombre y la aclaración al
 * lado: sacarlo del Excel sería perder justo el renglón que hay que ir a mirar.
 *
 * 🔑 **La columna «Hallazgo» es la que se filtra.** Los dos renglones que hay que ir a mirar —la
 * prenda colgada con el stock en cero y el código que ⛔ no cruzó— son pocos entre cientos, y
 * buscarlos leyendo nombre por nombre es lo mismo que no tenerlos.
 */
export function filasExport(escaneos: EscaneoLibre[]): Filas {
  const filas: Filas = [[...HEADER_EXPORT]]
  for (const g of agruparPorLugar(escaneos)) {
    // Dentro del lugar, el orden del export es el de escaneo (el de la caminata), y ⛔ no el de la
    // pantalla, que muestra lo último arriba para confirmar lo que se acaba de pasar por el lector.
    for (const e of [...g.escaneos].reverse()) {
      const { aCobrar } = precioDeGondola(e)
      filas.push([
        e.lugar,
        // «sin stock en el Local» ya ⛔ no alcanza como motivo: desde que el cero se puede
        // registrar, hay prendas con nombre y stock 0 en esta misma planilla.
        e.encontrado ? (e.product_name ?? '') : `${e.codigo_crudo} — no cruzó con el inventario`,
        e.size ?? '',
        e.sku ?? '',
        e.barcode ?? e.codigo_crudo,
        catsVisibles(e.cats).join(' / '),
        e.qty ?? '',
        aCobrar ?? '',
        e.escaneado_en,
        hallazgoDe(e),
        vecesDe(e),
      ])
    }
  }
  return filas
}
