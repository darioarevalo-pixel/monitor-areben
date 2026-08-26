/**
 * La bandeja de retornos: **todo lo que estamos esperando que vuelva**, en un solo lugar.
 *
 * 🔑 Por qué es una capa y no una fila más de la tabla de efectos: un reintegro se hace y se
 * termina, pero **una vuelta DURA**. Entre que se decide que el producto vuelve y que alguien lo
 * tiene en la mano pasan días, y en el medio hay que mandar la etiqueta, mirar el seguimiento y
 * recibirlo. Todo eso ya se guardaba —`via_retorno`, `seguimiento_vuelta`, los estados
 * `en_transito`/`recibido`, la alerta a los 15 días— pero **adentro de la fila de cada reclamo**:
 * para saber qué estábamos esperando había que abrirlos de a uno.
 *
 * ⛔ **No es el módulo Envíos**, que es reparto y cadetería LOCAL (lo que sale). Esto es lo que
 * entra, y lo miran Depósito y Local, que son los que abren el paquete.
 *
 * Son **dos andenes**, no una lista:
 *  1. **Esperando** — `estado='en_transito'`. El único estado que significa "todavía no está acá".
 *  2. **Llegó, falta guardarlo** — ya se recibió pero el producto no terminó de moverse: falta
 *     reingresarlo en Gestión Nube, o falta darlo de alta en Fallas. Es trabajo físico igual, y
 *     hasta ahora sólo se veía como un pendiente más adentro del reclamo.
 */

import {
  DIAS_ALERTA, MOTIVO_LABEL, desdeQueEsta, desdeQueSeDecidio, diasDesde, hayEnvio, loQueFaltaLlegar,
  numeroReclamo, pideSeguimiento, saleUnEnvio, trabaParaRecibir, unidadesQueVuelven,
  type DestinoPrenda, type EstadoReclamo, type ReclamoRow, type UnidadQueVuelve,
} from './tipos'

// ⛔ `desdeQueEsta` y `diasDesde` NO se reimplementan acá: viven en `tipos.ts` porque la alerta de
// "hace N días que no llega" cuenta exactamente lo mismo, y dos implementaciones del mismo número
// son dos números. Copiarlas ya había pasado: la copia local se quedó sin el piso en cero y ningún
// test lo vio, porque cada test miraba su propia copia.
export { desdeQueEsta, desdeQueSeDecidio, diasDesde } from './tipos'

/**
 * Lo que la bandeja necesita de un reclamo, y **nada más**.
 *
 * 🔑 No es `ReclamoRow` a propósito: de este endpoint sale lo más sensible que tiene el Monitor
 * sobre gente de afuera —el relato del cliente, los montos, la llave del portal público— y la
 * bandeja la mira Depósito, que sólo tiene que abrir una caja y decir si llegó. La puerta
 * `vista=retornos` devuelve exactamente estas columnas.
 */
export type RetornoRow = Pick<ReclamoRow,
  | 'id' | 'orden_tn' | 'cliente' | 'motivo' | 'escenario' | 'estado' | 'items'
  // 🔴 `items_correctos` y `retorno_decidido` NO son de más: en un `mal_armado` lo que vuelve es lo
  // que se le mandó POR ERROR, que vive en `items_correctos`, y `retorno_decidido` es lo que
  // distingue una falla que vuelve de una que se queda el cliente. Sin los dos, la bandeja le
  // muestra a Depósito el producto equivocado.
  | 'items_correctos' | 'retorno_decidido'
  // 🔑 **El paquete que SALE.** `items_nuevos` es lo que se lleva en un cambio, `seguimiento_ida`
  // su código y `envio_nuevo_estado` si ya se despachó. Sin los tres la bandeja mostraba media
  // operación: un cambio o un reenvío tienen un paquete yendo, lo despacha la misma persona que
  // abre la caja, y para verlo había que entrar a Reclamos — que Depósito ⛔ no puede abrir.
  // ⛔ `envio_ida_costo` ⛔ NO entra: es plata, y por esta puerta no pasan montos.
  | 'items_nuevos' | 'seguimiento_ida' | 'envio_nuevo_estado'
  | 'destino_prenda' | 'compensacion' | 'via_retorno' | 'seguimiento_vuelta' | 'solicitud_envio'
  | 'reingreso_estado' | 'falla_ids' | 'historial' | 'created_at' | 'updated_at'>

/**
 * Qué hay que hacer con el producto cuando esté en la mano. Sale del destino ya decidido.
 *
 * ⚠️ `no_vuelve` ⛔ **no es lo mismo que `nada`**: `nada` significa que nadie decidió todavía, y es
 * lo que traba la vuelta; `no_vuelve` es una decisión tomada — se la queda el cliente. Mientras
 * `regalada` no existía como destino, ese caso caía en `nada` y la bandeja pedía decidir algo que
 * ya estaba decidido.
 */
export type QueHacer = 'stock' | 'falla' | 'no_vuelve' | 'nada'

export type FilaRetorno = {
  reclamo: RetornoRow
  /** Las unidades que todavía no aparecieron. Es lo que hay que buscar adentro de la caja. */
  faltan: UnidadQueVuelve[]
  /** `R-0042`. */
  numero: string
  /** Desde cuándo esperamos (ISO), o null si no se puede saber. */
  desde: string | null
  /** Hace cuántos días. Es la columna por la que se ordena: primero lo más viejo. */
  dias: number
  /** Pasó el plazo en el que una vuelta deja de ser normal. */
  tarde: boolean
  queHacer: QueHacer
  /**
   * Lo que impide que el producto se mueva, si hay algo. ⛔ No es una alerta por tiempo: es una
   * cosa que falta hacer **acá**, y por eso va en la fila y no en un badge.
   */
  traba: string | null
  /**
   * **El paquete que sale**, si hay uno: qué se le manda al cliente. ⛔ No es lo mismo que lo que
   * vuelve, y en un cambio ni siquiera es el mismo producto.
   *
   * Va en TODAS las filas, no sólo en el andén de despachar: quien abre la caja de un cambio tiene
   * que saber que además hay algo que mandar, aunque todavía no le toque.
   */
  sale: string | null
  /** El paquete que sale todavía no salió. Es lo que pone la fila en el tercer andén. */
  faltaDespacharlo: boolean
}

export type Bandeja = { esperando: FilaRetorno[]; guardar: FilaRetorno[]; despachar: FilaRetorno[] }


/** Lo estamos esperando: salió del cliente (o lo va a traer) y todavía no está acá. */
export function estaEsperando(d: RetornoRow): boolean {
  return d.estado === 'en_transito'
}

/**
 * Ya llegó pero el producto no terminó de moverse.
 *
 * Son los dos pasos físicos que quedan del otro lado del mostrador: volver a stock (que en Gestión
 * Nube es a mano, porque no acepta escribir stock negativo por API) o darlo de alta en Fallas.
 */
export function faltaGuardarlo(d: RetornoRow): boolean {
  if (d.estado !== 'recibido' && d.estado !== 'resuelto') return false
  if (d.reingreso_estado === 'pendiente') return true
  return d.destino_prenda === 'falla' && !(d.falla_ids || []).length
}

/**
 * **Le tenemos que mandar algo y todavía no salió.**
 *
 * 🔴 Existe porque el botón para tildarlo vivía sólo en **Reclamos**, que es de Administración —y
 * despachar lo hace Depósito, que ⛔ no puede abrir esa pantalla. O sea: el pendiente tenía handler
 * (`action: 'despachado'`, deliberadamente fuera de `DE_ADMIN`) y no tenía dónde apretarse. Es la
 * segunda vuelta del mismo agujero: primero no había botón, después el botón quedó del lado
 * equivocado de la puerta.
 *
 * ⚠️ El estado ⛔ no se mira: un cambio queda `en_transito` (la venta ya se creó) y un reenvío sin
 * retorno queda `resuelto`. Lo único que dice que falta despachar es el pendiente.
 */
export function faltaDespachar(d: RetornoRow): boolean {
  return d.envio_nuevo_estado === 'pendiente'
}

/**
 * **Qué le sale al cliente**, en criollo, o `null` si esta resolución no manda nada.
 *
 * 🔑 De qué lista sale ⛔ no es obvio y es el mismo tipo de trampa que `deDondeVuelve`: en un
 * **cambio** lo que se lleva es otro producto (`items_nuevos`), y en una **reposición** o un
 * **reenvío** es lo que compró (`items`) — incluso en un `mal_armado`, donde lo que compró es
 * justo el único que nunca salió del depósito.
 */
export function detalleDeLoQueSale(d: RetornoRow): string | null {
  if (!d.compensacion || !saleUnEnvio(d.compensacion)) return null
  const lista = d.compensacion === 'otro_producto' ? d.items_nuevos : d.items
  const items = (lista || []).filter((i) => i && i.producto)
  if (!items.length) return null
  return items
    .map((i) => `${Number(i.cantidad) > 1 ? `${i.cantidad}× ` : ''}${i.producto}${i.variante ? ` · ${i.variante}` : ''}`)
    .join(' · ')
}

/** Qué se hace con la unidad cuando esté en la mano. */
export function queHacerConEl(destino: DestinoPrenda | null | undefined): QueHacer {
  if (destino === 'stock') return 'stock'
  if (destino === 'falla') return 'falla'
  if (destino === 'regalada' || destino === 'perdida') return 'no_vuelve'
  return 'nada'
}

export const QUE_HACER_LABEL: Record<QueHacer, string> = {
  stock: 'Vuelve a stock',
  falla: 'Va a Fallas',
  no_vuelve: 'No vuelve',
  nada: 'Sin destino decidido',
}

/**
 * Lo que traba la vuelta, si hay algo.
 *
 * 🔑 Es la mitad que la lista de reclamos no mostraba: un paquete "en camino" que **nunca tuvo
 * etiqueta** no está en camino, está parado, y el contador de días corriendo hacía pensar que el
 * problema era del correo.
 */
export function trabaDeLaVuelta(d: RetornoRow): string | null {
  if (!d.via_retorno) return 'Falta decidir cómo vuelve'
  if (pideSeguimiento(d.via_retorno) && !d.seguimiento_vuelta) return 'Falta la etiqueta: sin código de seguimiento no salió'
  if (queHacerConEl(d.destino_prenda) === 'nada') return 'Falta decidir qué se hace con el producto'
  // 🔑 Y lo que faltaba nombrar: **qué vuelve**. En un `mal_armado` lo que vuelve es lo que se le
  // mandó por error, y si nadie lo cargó al decidir, la caja no se puede contrastar con nada.
  return trabaParaRecibir(d)
}

/** Lo que falta hacer una vez que llegó, en criollo. */
export function trabaDeLoQueLlego(d: RetornoRow): string | null {
  if (d.reingreso_estado === 'pendiente') return 'Reingresarlo en Gestión Nube (a mano)'
  if (d.destino_prenda === 'falla' && !(d.falla_ids || []).length) return 'Darlo de alta en Fallas'
  return null
}

/**
 * @param anden De cuál de los tres andenes es la fila. Decide **desde cuándo se cuenta** y con qué
 *   plazo, que ⛔ no son el mismo para las tres cosas: esperar un paquete del correo son quince
 *   días, y despachar el que sale es del día siguiente.
 */
function fila(d: RetornoRow, anden: 'esperando' | 'guardar' | 'despachar', ahora: number): FilaRetorno {
  const estado: EstadoReclamo = anden === 'esperando' ? 'en_transito' : 'recibido'
  // El despacho ⛔ no se cuenta desde el estado: la fila puede estar en `resuelto` y haber recibido
  // tres eventos `resuelto` más por otros pendientes del caso.
  const desde = anden === 'despachar' ? desdeQueSeDecidio(d) : desdeQueEsta(d, estado)
  const dias = diasDesde(desde, ahora)
  const plazo = anden === 'despachar' ? DIAS_ALERTA.despacho : DIAS_ALERTA.transito
  return {
    reclamo: d,
    faltan: loQueFaltaLlegar(d),
    numero: numeroReclamo(d.id),
    desde,
    dias,
    tarde: anden !== 'guardar' && dias >= plazo,
    queHacer: queHacerConEl(d.destino_prenda),
    traba: anden === 'esperando' ? trabaDeLaVuelta(d) : trabaDeLoQueLlego(d),
    sale: detalleDeLoQueSale(d),
    faltaDespacharlo: faltaDespachar(d),
  }
}

/**
 * Los dos andenes, **ordenados por hace cuánto**: lo más viejo primero.
 *
 * ⚠️ El orden es al revés que el de la lista de reclamos (que muestra lo último abierto). Acá lo
 * urgente es lo que hace más tiempo que no aparece, no lo que se acaba de decidir.
 */
export function bandejaDeRetornos(filas: RetornoRow[], ahora = Date.now()): Bandeja {
  const viejoPrimero = (a: FilaRetorno, b: FilaRetorno) => b.dias - a.dias || a.reclamo.id - b.reclamo.id
  const anden = (quien: (d: RetornoRow) => boolean, cual: 'esperando' | 'guardar' | 'despachar') =>
    filas.filter(quien).map((d) => fila(d, cual, ahora)).sort(viejoPrimero)
  return {
    esperando: anden(estaEsperando, 'esperando'),
    guardar: anden(faltaGuardarlo, 'guardar'),
    // ⚠️ Un mismo reclamo puede estar en DOS andenes a la vez, y ⛔ no es un error: en un cambio
    // esperamos lo que devuelve *y* tenemos que mandarle lo que se lleva. Son dos trabajos físicos
    // distintos y cada uno se tilda por su lado.
    despachar: anden(faltaDespachar, 'despachar'),
  }
}

/**
 * El texto de lo que VUELVE: "2× Buzo Girlhood · Talle M". Para leerlo contra lo que hay en la caja.
 *
 * 🔴 **Antes listaba `items`, que es lo que el cliente COMPRÓ.** En los diez casos coincide… salvo
 * en `mal_armado`, que es justo donde no: ahí vuelve **lo que se le mandó por error**, y lo que
 * compró es el único producto que nunca salió del depósito. Depósito abría la caja esperando otra
 * cosa, y con el contenido equivocado a la vista nadie puede decir si llegó lo que esperábamos.
 *
 * Lo ya tildado se marca, para que se lea qué falta y no haya que acordarse.
 */
export function detalleDeLoQueVuelve(d: RetornoRow): string {
  const { unidades } = unidadesQueVuelven(d)
  if (!unidades.length) return '—'
  return unidades
    .map(({ item: i }) => `${Number(i.cantidad) > 1 ? `${i.cantidad}× ` : ''}${i.producto}${i.variante ? ` · ${i.variante}` : ''}${i.recibida_at ? ' ✓' : ''}`)
    .join(' · ')
}

/** El renglón que se copia para preguntar por un paquete que no llega. */
export function textoDeReclamoAlCorreo(f: FilaRetorno): string {
  const d = f.reclamo
  const partes = [
    `${f.numero}${d.orden_tn ? ` (orden #${d.orden_tn})` : ''} — ${MOTIVO_LABEL[d.motivo] || d.motivo}`,
    `Cliente: ${d.cliente || 'sin nombre'}`,
    `Vuelve por: ${d.via_retorno || 'sin definir'}${d.seguimiento_vuelta ? ` · seguimiento ${d.seguimiento_vuelta}` : ''}`,
    `Esperando hace ${f.dias} día${f.dias === 1 ? '' : 's'}`,
    `Contenido: ${detalleDeLoQueVuelve(d)}`,
  ]
  return partes.join('\n')
}

/** ¿Tiene envío de verdad (o lo trae el cliente al mostrador)? Para no ofrecer seguimiento al pedo. */
export const vuelvePorEnvio = (d: RetornoRow): boolean => hayEnvio(d.via_retorno)
