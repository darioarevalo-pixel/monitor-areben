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
  DIAS_ALERTA, MOTIVO_LABEL, desdeQueEsta, diasDesde, hayEnvio, numeroReclamo, pideSeguimiento,
  type DestinoPrenda, type EstadoReclamo, type ReclamoRow,
} from './tipos'

// ⛔ `desdeQueEsta` y `diasDesde` NO se reimplementan acá: viven en `tipos.ts` porque la alerta de
// "hace N días que no llega" cuenta exactamente lo mismo, y dos implementaciones del mismo número
// son dos números. Copiarlas ya había pasado: la copia local se quedó sin el piso en cero y ningún
// test lo vio, porque cada test miraba su propia copia.
export { desdeQueEsta, diasDesde } from './tipos'

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
  | 'destino_prenda' | 'compensacion' | 'via_retorno' | 'seguimiento_vuelta' | 'solicitud_envio'
  | 'reingreso_estado' | 'falla_ids' | 'historial' | 'created_at' | 'updated_at'>

/** Qué hay que hacer con el producto cuando esté en la mano. Sale del destino ya decidido. */
export type QueHacer = 'stock' | 'falla' | 'nada'

export type FilaRetorno = {
  reclamo: RetornoRow
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
}

export type Bandeja = { esperando: FilaRetorno[]; guardar: FilaRetorno[] }


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

/** Qué se hace con la unidad cuando esté en la mano. */
export function queHacerConEl(destino: DestinoPrenda | null | undefined): QueHacer {
  if (destino === 'stock') return 'stock'
  if (destino === 'falla') return 'falla'
  return 'nada'
}

export const QUE_HACER_LABEL: Record<QueHacer, string> = {
  stock: 'Vuelve a stock',
  falla: 'Va a Fallas',
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
  return null
}

/** Lo que falta hacer una vez que llegó, en criollo. */
export function trabaDeLoQueLlego(d: RetornoRow): string | null {
  if (d.reingreso_estado === 'pendiente') return 'Reingresarlo en Gestión Nube (a mano)'
  if (d.destino_prenda === 'falla' && !(d.falla_ids || []).length) return 'Darlo de alta en Fallas'
  return null
}

function fila(d: RetornoRow, estado: EstadoReclamo, ahora: number, llego: boolean): FilaRetorno {
  const desde = desdeQueEsta(d, estado)
  const dias = diasDesde(desde, ahora)
  return {
    reclamo: d,
    numero: numeroReclamo(d.id),
    desde,
    dias,
    tarde: !llego && dias >= DIAS_ALERTA.transito,
    queHacer: queHacerConEl(d.destino_prenda),
    traba: llego ? trabaDeLoQueLlego(d) : trabaDeLaVuelta(d),
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
  return {
    esperando: filas.filter(estaEsperando).map((d) => fila(d, 'en_transito', ahora, false)).sort(viejoPrimero),
    guardar: filas.filter(faltaGuardarlo).map((d) => fila(d, 'recibido', ahora, true)).sort(viejoPrimero),
  }
}

/** El texto de una unidad: "2× Buzo Girlhood · Talle M". Para leerlo contra lo que hay en la caja. */
export function detalleDeLoQueVuelve(d: RetornoRow): string {
  const items = Array.isArray(d.items) ? d.items : []
  if (!items.length) return '—'
  return items
    .map((i) => `${Number(i.cantidad) > 1 ? `${i.cantidad}× ` : ''}${i.producto}${i.variante ? ` · ${i.variante}` : ''}`)
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
