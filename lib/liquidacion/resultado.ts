/**
 * El resultado de una campaña: qué se vendió de lo liquidado, a qué precio salió de verdad, y si el
 * descuento movió algo que no se movía solo.
 *
 * Tres ideas, y la primera es la que da vuelta el módulo:
 *
 * 🔑 **Se contrasta el precio decidido contra el precio COBRADO.** Un producto que se vendió catorce
 * veces a precio de lista es una campaña que para el cliente no existió, y hasta que esto se
 * construyó no había forma de enterarse: la pantalla lo mostraba igual de verde que a los demás.
 *
 * ⚠️ **Este docblock decía que los precios se cargan a mano porque el token no puede escribir
 * productos. Eso dejó de ser cierto el 13-ago-2026**, cuando la tanda 3 destrabó el token y el
 * aplicador empezó a escribir el precio promocional en Gestión Nube. El contraste sigue valiendo
 * igual —lo aplicado puede fallar, y el precio de lista SÍ se sigue cargando a mano— pero ya no es
 * el único control posible.
 *
 * 🔑 **Los descartados son el grupo de control.** Se miraron el mismo día, estaban en la misma
 * situación, y no se les tocó el precio. Si se movieron parecido a los liquidados, el descuento no
 * era lo que hacía falta. Sale gratis: ya están en la campaña, con su foto congelada.
 *
 * 🔑 **El ritmo previo sale de la foto, no del ETL de hoy.** La foto guardó las ventas de 90 días
 * del momento en que el producto entró; el ETL de hoy ya incluye las ventas de la campaña y
 * compararse contra sí mismo daría siempre un levante de uno.
 *
 * Puro: no lee la hora ni la red. `hoy` entra por parámetro.
 */

import {
  CANALES as CANALES_JS,
  CANALES_MINORISTA as CANALES_MINORISTA_JS,
  ETIQUETA_CANAL as ETIQUETA_CANAL_JS,
  canalDe as canalDeJs,
} from './canal.core.js'
import type { EstadoItem, LiquidacionItem } from './tipos'
import type { LineaVenta } from './ventas'

/**
 * A dónde se fue la unidad.
 *
 * `mayorista` va aparte porque **sale a precio mayorista**: mezclarla hunde el precio promedio y un
 * producto bien cargado aparecería como "no se cargó". `tecnica` son las ventas del propio Monitor
 * (Sesión de Fotos y Fallas, canal "Ninguno", precio 0) — no son ventas, sólo descuentan stock, y
 * el ETL ya las excluye de toda la analítica desde hace meses.
 */
export type Canal = 'local' | 'online' | 'mayorista' | 'tecnica' | 'otro'

/** Los canales que forman minorista. **La lista vive en `canal.core.js`**, que es la que también
 * lee el memo desde un `.core.js`: acá sólo se le pone el tipo. */
export const CANALES_MINORISTAS = CANALES_MINORISTA_JS as readonly Canal[]

/** Todos los canales. La lista vive en `canal.core.js`: el handler de Norte también la valida. */
export const CANALES = CANALES_JS as readonly Canal[]

/**
 * El canal por su nombre en Gestión Nube. **La implementación vive en `canal.core.js`**, que es
 * `.js` plano porque `api/_norte.js` la necesita para calcular la contribución y los handlers no
 * pueden importar TypeScript. Acá sólo se le pone el tipo, una vez.
 */
export const canalDe: (nombre: string | null) => Canal = canalDeJs

/**
 * Cómo se llama cada canal en la pantalla. **El rótulo vive en `canal.core.js`** por lo mismo que
 * la lista: el día que un canal no tenga nombre, no se dibuja mal — desaparece.
 */
export const ETIQUETA_CANAL = ETIQUETA_CANAL_JS as Record<Canal, string>

/**
 * Si el precio de sale llegó a estar puesto, leído desde lo que se cobró.
 *
 * `no_puesto` es el hallazgo caro: todo se vendió al precio de lista ⇒ nadie lo cargó en Gestión
 * Nube. `a_medias` es el otro modo de falla real de una carga manual — se cargó tarde, o en un canal
 * solo. `otro_precio` no acusa a nadie: puede ser un descuento de caja o una promo encima.
 */
export type EstadoCarga = 'sin_precio' | 'sin_ventas' | 'puesto' | 'a_medias' | 'no_puesto' | 'otro_precio'

/** Dos precios son el mismo si difieren en menos de un peso: el espejo guarda centavos. */
const MISMO = (a: number, b: number) => Math.abs(a - b) < 1

export interface PorCanal {
  unidades: number
  plata: number
}

export interface ResultadoItem {
  pid: string
  nombre: string
  sku: string | null
  imagen: string | null
  estado: EstadoItem
  /** Unidades vendidas en el rango, sin mayorista ni ventas técnicas. */
  unidades: number
  plata: number
  /** Lo que se cobró por unidad, en promedio. `null` si no vendió nada. */
  precioReal: number | null
  porCanal: Record<Canal, PorCanal>
  precioDecidido: number | null
  precioLista: number
  unidadesAlSale: number
  unidadesALista: number
  unidadesOtroPrecio: number
  carga: EstadoCarga
  /** El stock que tenía cuando entró a la campaña. */
  stockInicial: number
  /** Qué parte de ese stock se movió, en %. `null` si no había stock. */
  pctStockMovido: number | null
  /** Unidades por día en los 90 días previos a entrar (de la foto congelada). */
  ritmoPrevio: number
  /** Unidades por día durante la campaña. */
  ritmoDurante: number
  /** Cuántas veces se aceleró. `null` si antes no vendía nada — ahí no hay proporción, hay arranque. */
  levante: number | null
}

export interface BloqueResultado {
  productos: number
  unidades: number
  plata: number
  /** Lo que esas mismas unidades habrían dado a precio de lista. */
  plataALista: number
  /** La diferencia: lo que costó el descuento, sobre lo que se vendió de verdad. */
  resignado: number
  stockInicial: number
  pctMovido: number | null
  ritmoPrevio: number
  ritmoDurante: number
  levante: number | null
  /** Cuántos no vendieron una sola unidad. */
  sinMoverse: number
}

/**
 * Un agotado **cuya cuenta no da**: entró con N, salieron M, y el sistema dice 0 con N ≠ M.
 *
 * 🔑 **No acusa: señala.** Las dos explicaciones legítimas —se repuso durante la campaña, o el stock
 * de entrada estaba mal cargado— son tan probables como la prenda traspapelada. La fila dice por
 * cuántas unidades no cierra, y el que camina decide.
 */
export interface AgotadoQueNoCierra {
  pid: string
  nombre: string
  sku: string | null
  estado: EstadoItem
  /** El stock que tenía cuando entró a la campaña, de la foto congelada. */
  stockInicial: number
  /** Todo lo que salió de stock desde entonces. Ver `agotadosQueNoCierran`. */
  salieron: number
  /**
   * `stockInicial - salieron`, sobre un stock de hoy que es cero.
   *
   * **Positivo**: hay esa cantidad de prendas en algún lado y el sistema no las ve.
   * **Negativo**: salieron más de las que había ⇒ se repuso, o el stock de entrada estaba mal.
   */
  diferencia: number
}

export interface ResultadoCampania {
  desde: string
  hasta: string
  /** Días del rango, inclusive de las dos puntas. */
  dias: number
  /** El rango se cortó en hoy porque la campaña sigue andando. */
  enCurso: boolean
  /** Lo que se liquidó: definidos y aplicados con precio. */
  liquidados: BloqueResultado
  /** El grupo de control: los descartados, que se miraron y no se tocaron. */
  control: BloqueResultado
  items: ResultadoItem[]
  /** Los que se vendieron enteros a precio de lista: el precio nunca se cargó. */
  sinCargar: number
  /** Los que se vendieron parte al sale y parte a otro precio. */
  aMedias: number
}

const CANAL_VACIO = (): Record<Canal, PorCanal> => ({
  local: { unidades: 0, plata: 0 },
  online: { unidades: 0, plata: 0 },
  mayorista: { unidades: 0, plata: 0 },
  tecnica: { unidades: 0, plata: 0 },
  otro: { unidades: 0, plata: 0 },
})

/** Días entre dos fechas YYYY-MM-DD, contando las dos puntas. Nunca menos de uno. */
export function diasDeRango(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T00:00:00Z`)
  const b = Date.parse(`${hasta}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 1
  return Math.round((b - a) / 86400000) + 1
}

/**
 * El rango que se va a mirar. `hasta` se corta en hoy: una campaña que termina el 30 y hoy es 20 se
 * mide sobre diez días, no sobre treinta — dividir por días que todavía no pasaron haría parecer
 * floja a una campaña que va bien.
 */
export function rangoDeCampania(
  campania: { desde: string | null; hasta: string | null },
  hoy: string,
): { desde: string; hasta: string; enCurso: boolean } | null {
  if (!campania.desde) return null
  const tope = campania.hasta && campania.hasta < hoy ? campania.hasta : hoy
  return { desde: campania.desde, hasta: tope, enCurso: !campania.hasta || campania.hasta > hoy }
}

function bloque(items: ResultadoItem[], dias: number): BloqueResultado {
  const unidades = items.reduce((a, i) => a + i.unidades, 0)
  const stockInicial = items.reduce((a, i) => a + i.stockInicial, 0)
  const plataALista = items.reduce((a, i) => a + i.precioLista * i.unidades, 0)
  const plata = items.reduce((a, i) => a + i.plata, 0)
  // El ritmo previo del conjunto se suma en unidades/día, no se promedian los ritmos: un producto
  // que vendía diez por día pesa diez veces más que uno que vendía uno.
  const ritmoPrevio = items.reduce((a, i) => a + i.ritmoPrevio, 0)
  const ritmoDurante = dias > 0 ? unidades / dias : 0

  return {
    productos: items.length,
    unidades,
    plata,
    plataALista,
    resignado: Math.max(0, plataALista - plata),
    stockInicial,
    pctMovido: stockInicial > 0 ? (unidades / stockInicial) * 100 : null,
    ritmoPrevio,
    ritmoDurante,
    levante: ritmoPrevio > 0 ? ritmoDurante / ritmoPrevio : null,
    sinMoverse: items.filter((i) => i.unidades === 0).length,
  }
}

/** Cómo se cargó el precio, leído desde las unidades vendidas a cada precio. */
function estadoDeCarga(
  precioDecidido: number | null,
  unidades: number,
  alSale: number,
  aLista: number,
): EstadoCarga {
  if (precioDecidido == null || precioDecidido <= 0) return 'sin_precio'
  if (unidades === 0) return 'sin_ventas'
  if (alSale === unidades) return 'puesto'
  if (aLista === unidades) return 'no_puesto'
  if (alSale > 0) return 'a_medias'
  return 'otro_precio'
}

/**
 * El resultado de la campaña.
 *
 * `lineas` son las de `leerVentasDeCampania`, crudas: el filtro de canal se hace acá para que sea
 * puro y quede testeado. Los ítems sin precio decidido y sin ventas siguen apareciendo en `items`
 * —haberlos mirado es información— pero no entran en ningún bloque.
 */
export function resultadoCampania(
  items: LiquidacionItem[],
  lineas: LineaVenta[],
  rango: { desde: string; hasta: string; enCurso: boolean },
): ResultadoCampania {
  const dias = diasDeRango(rango.desde, rango.hasta)

  const porPid = new Map<string, LineaVenta[]>()
  for (const l of lineas) {
    const ls = porPid.get(l.pid)
    if (ls) ls.push(l)
    else porPid.set(l.pid, [l])
  }

  const resultados: ResultadoItem[] = items.map((it) => {
    const precioDecidido = it.decision.precioSale
    const precioLista = it.foto.precioNormal
    const porCanal = CANAL_VACIO()

    let unidades = 0
    let plata = 0
    let alSale = 0
    let aLista = 0
    let otro = 0

    for (const l of porPid.get(it.pid) || []) {
      // 🔴 **El rango se filtra acá y no se da por hecho.** La pantalla baja las ventas hasta HOY,
      // no hasta el fin de la campaña, porque la conciliación de stock de `agotadosQueNoCierran`
      // necesita todo lo que salió —si no, un producto vendido después de cerrada la campaña
      // aparecería como prenda perdida—. El resultado de la campaña, en cambio, es del rango: sin
      // este corte, una campaña cerrada seguiría sumando ventas de la semana siguiente.
      if (l.fecha < rango.desde || l.fecha > rango.hasta) continue
      // Una devolución (`quantity` negativo) no se vendió al precio de sale: acá se descarta, y en
      // `agotadosQueNoCierran` se cuenta, porque ahí la pregunta es dónde está la prenda. Estaba en
      // `leerVentasDeCampania` y se movió acá: la decisión es de cada consumidor, no del transporte.
      if (l.unidades <= 0) continue
      const canal = canalDe(l.canal)
      porCanal[canal].unidades += l.unidades
      porCanal[canal].plata += l.plata
      // Mayorista y las técnicas quedan contadas y visibles, pero fuera de todo lo que se compara
      // contra el precio de sale: no se decidieron con este precio.
      if (canal === 'mayorista' || canal === 'tecnica') continue

      unidades += l.unidades
      plata += l.plata
      if (precioDecidido != null && precioDecidido > 0 && MISMO(l.precioUnitario, precioDecidido)) alSale += l.unidades
      else if (precioLista > 0 && MISMO(l.precioUnitario, precioLista)) aLista += l.unidades
      else otro += l.unidades
    }

    const ritmoPrevio = it.foto.ventas90 / 90
    const ritmoDurante = dias > 0 ? unidades / dias : 0

    return {
      pid: it.pid,
      nombre: it.foto.nombre,
      sku: it.foto.sku,
      imagen: it.foto.imagen,
      estado: it.estado,
      unidades,
      plata,
      precioReal: unidades > 0 ? plata / unidades : null,
      porCanal,
      precioDecidido,
      precioLista,
      unidadesAlSale: alSale,
      unidadesALista: aLista,
      unidadesOtroPrecio: otro,
      carga: estadoDeCarga(precioDecidido, unidades, alSale, aLista),
      stockInicial: it.foto.stock,
      pctStockMovido: it.foto.stock > 0 ? (unidades / it.foto.stock) * 100 : null,
      ritmoPrevio,
      ritmoDurante,
      levante: ritmoPrevio > 0 ? ritmoDurante / ritmoPrevio : null,
    }
  })

  // `confirmado` es un `definido` con segunda mirada: para el resultado son lo mismo, se les decidió
  // un precio. Dejarlo afuera vaciaría la tabla de una campaña que pasó por revisión.
  const liquidados = resultados.filter(
    (r) => (r.estado === 'definido' || r.estado === 'confirmado' || r.estado === 'aplicado') && (r.precioDecidido || 0) > 0,
  )
  const control = resultados.filter((r) => r.estado === 'descartado')

  return {
    desde: rango.desde,
    hasta: rango.hasta,
    dias,
    enCurso: rango.enCurso,
    liquidados: bloque(liquidados, dias),
    control: bloque(control, dias),
    items: resultados,
    sinCargar: liquidados.filter((r) => r.carga === 'no_puesto').length,
    aMedias: liquidados.filter((r) => r.carga === 'a_medias').length,
  }
}

/**
 * Los agotados **cuya cuenta no da**: la caminata corta que sí se hace.
 *
 * Lo pidió Bruno al cerrar la campaña —*«listar los productos agotados así la gente del local
 * verifique que realmente no haya stock»*—, pero la lista de agotados a secas no sirve: casi todos
 * cierran solos y una caminata de catorce productos no la hace nadie. **Medido sobre el sale vivo de
 * Zattia el 17-ago-2026: 18 agotados, y sólo 6 no cierran.** Los dos del grupo liquidado son
 * exactamente los que hay que ir a ver: uno entró con 2, vendió 0 y el sistema dice 0 (hay dos
 * prendas en algún lado); el otro entró con 2 y vendió 3.
 *
 * 🔑 **Cuenta TODO lo que saca stock, no sólo las ventas que se comparan contra el precio.** Un canje
 * o una falla descuentan la prenda igual, y el mayorista también: mirar sólo los canales minoristas
 * —que es lo que hace `resultadoCampania`, y ahí está bien— acusaría al local de perder prendas que
 * salieron bien. Por eso `lineas` entra cruda y sin filtrar por canal.
 *
 * 🔴 **Y las devoluciones se restan.** Una línea con unidades negativas es una prenda que volvió al
 * stock: sumarla como salida —o peor, descartarla— deja la cuenta corta. Medido en prod el
 * 17-ago-2026: BODY SOUTH tenía una venta y su devolución, neto cero, y la primera versión de esta
 * pantalla pedía buscar **una** prenda cuando faltan **dos**.
 *
 * 🔑 **`lineas` tiene que llegar hasta HOY**, no hasta el fin de la campaña. La foto se congeló el
 * día que el producto entró y el stock de `stockHoy` es el de este momento: cualquier venta que
 * quede afuera del medio se lee como una prenda perdida.
 *
 * ⚠️ **Un producto sin fila en el inventario no se acusa.** Sin dato no se sabe si está agotado o si
 * no cruzó con el espejo, y las dos cosas se ven igual desde acá. Medido el 17-ago-2026 sobre la
 * campaña de Zattia: los 266 ítems tienen fila, así que hoy no esconde nada.
 *
 * @param stockHoy pid → unidades de hoy, sumando los dos depósitos. Sin la clave = no se sabe.
 */
export function agotadosQueNoCierran(
  items: LiquidacionItem[],
  lineas: LineaVenta[],
  stockHoy: Record<string, number>,
): AgotadoQueNoCierra[] {
  const salidas = new Map<string, number>()
  for (const l of lineas) salidas.set(l.pid, (salidas.get(l.pid) || 0) + l.unidades)

  const out: AgotadoQueNoCierra[] = []
  for (const it of items) {
    const hoy = stockHoy[it.pid]
    if (hoy == null || hoy > 0) continue
    const salieron = salidas.get(it.pid) || 0
    const diferencia = it.foto.stock - salieron
    if (diferencia === 0) continue
    out.push({
      pid: it.pid,
      nombre: it.foto.nombre,
      sku: it.foto.sku,
      estado: it.estado,
      stockInicial: it.foto.stock,
      salieron,
      diferencia,
    })
  }
  // Lo que más lejos está de cerrar, primero: es donde más unidades hay para encontrar.
  return out.sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia))
}
