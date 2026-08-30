/**
 * El umbral de rentabilidad — la cara tipada, y el acceso a lo guardado.
 *
 * ⚠️ **La lógica no vive acá: vive en `lib/meta-ads/rentabilidad.core.js`**, en JS plano, porque
 * `api/_meta-rentabilidad.js` necesita `normalizar()` y no puede importar TypeScript. El porqué del
 * modelo entero —y por qué el semáforo es el costo por compra y no el ROAS— está en el docblock del
 * core. Acá van los tipos, el re-export y las dos llamadas al endpoint.
 *
 * 🔑 **El eje es la LÍNEA de pauta, no la marca del monitor.** Es el mismo eje con el que se leen
 * las campañas: el techo se compara contra el costo por compra de un conjunto, y los conjuntos
 * cuelgan de una línea. Stunned tiene su propia cuenta y su propia economía, y no es una `Marca`
 * —forzarlo adentro de Zattia le daría el techo de otro producto—. La marca sale de la línea con
 * `baseDeLinea()`, que es la que manda para permisos y base de datos.
 */

import { apiFetch } from '../api-fetch'
import type { LineaPauta } from './tipos'
import {
  DEFAULTS as DEFAULTS_JS,
  calcularRentabilidad as calcularJs,
  costoQueManda as costoQueMandaJs,
  escenariosDeFreno as escenariosJs,
  normalizar as normalizarJs,
  proyeccionStock as proyeccionJs,
} from './rentabilidad.core.js'

/** Los supuestos que se pueden mover. Los porcentajes van **en porcentaje** (12,5 = 12,5%). */
export type Supuestos = {
  /** PVP de lista por unidad, antes de todo descuento. */
  precio: number
  /** Descuento del raspa, en %. */
  raspa: number
  /** Qué proporción de los compradores lo usa, en %. Pondera al raspa. */
  usaRaspa: number
  /** Descuento adicional por pagar con transferencia, en %. */
  transf: number
  /** 🔑 Si el raspa y la transferencia se aplican uno sobre el otro o el mayor manda. */
  acumulan: boolean
  /** Proporción de las ventas que se cobran por transferencia, en %. El dato que falta. */
  mix: number
  /** Costo del producto, **sin IVA**. */
  costo: number
  iva: number
  /** Ingresos Brutos. */
  iibb: number
  /** Impuesto al cheque. */
  cheque: number
  /** Comisión de Tienda Nube cobrando con tarjeta, en %. */
  tnTarjeta: number
  /** Comisión de la pasarela con cuotas, en %. */
  pasTarjeta: number
  /** Comisión de Tienda Nube cobrando por transferencia, en %. Está bonificada. */
  tnTransf: number
  /** Comisión de la pasarela por transferencia, en %. */
  pasTransf: number
  /** Derecho de Registro e Inspección (municipal), en %. Nace en 0: ver el comentario del core. */
  drei: number
  /**
   * Lo que la tienda absorbe de envío por pedido, **con IVA** y **por PEDIDO, no por unidad**.
   * De la ganancia sale su neto; de la caja, entero. Cero si el cliente lo paga o si retira.
   */
  envio: number
  /**
   * 🔑 Si el IVA débito **se netea contra un saldo a favor** en vez de salir en efectivo. Prendido
   * habilita el segundo techo, el de caja. ⛔ El recupero no es ganancia: va en su propio renglón.
   */
  saldoIva: boolean
  /** Unidades por pedido. Del por-unidad al por-compra, que es lo que Meta cobra. */
  unidades: number
  /** Qué parte de la contribución se le entrega a la pauta, en %. El resto es ganancia. */
  reparto: number
  /** El objetivo de ventas por día, para traducir el techo a presupuesto diario. */
  ventasDia: number
  /** Unidades a vender, para la proyección. */
  stock: number
  /** Lo que se está pagando hoy por compra. Es la referencia contra la que se mide el techo. */
  costoHoy: number
}

/** Lo que deja **una unidad** por un camino de cobro, con su desglose. */
export type Canal = {
  /** Lo que efectivamente paga el cliente. */
  bruto: number
  /** El bruto sin IVA. */
  neto: number
  iva: number
  producto: number
  iibb: number
  cheque: number
  drei: number
  /** Tienda Nube + pasarela. */
  comision: number
  /** Lo que queda para pauta y ganancia. */
  contrib: number
}

/** El techo y el ROAS en un extremo del mix. Sirve para mostrar cuánto lo mueve el dato que falta. */
export type Extremo = { costoMax: number; roas: number }

export type Rentabilidad = {
  /** Una unidad cobrada con tarjeta. */
  tarjeta: Canal
  /** Una unidad cobrada por transferencia. */
  transferencia: Canal
  /** Una unidad, ponderada por el mix. Es la cascada que se dibuja. */
  unidad: Canal
  /** Lo que factura una compra. Es el ticket contra el que Meta calcula el ROAS. */
  ticket: number
  /** Lo que deja una compra para pauta y ganancia. **Es la GANANCIA**, sin el recupero de saldo. */
  contribPedido: number
  /**
   * El IVA débito que se netea contra el saldo a favor en vez de pagarse. **No es ganancia**: es
   * plata propia que se descongela, de un stock finito, y la libera cualquier venta facturada.
   * Cero cuando `saldoIva` está apagado.
   */
  recuperoPedido: number
  /** Ganancia + recupero: la caja que entra por la compra. Igual a `contribPedido` sin saldo. */
  cajaPedido: number
  /** La proporción del ticket que sobrevive, en %. */
  margenPct: number
  /** Lo mismo, contando el recupero. */
  margenCajaPct: number
  /** El ROAS donde la pauta se come toda la ganancia. Debajo de acá se pierde plata. */
  roasBE: number
  /** El de equilibrio contando el recupero. Es el más bajo de los dos. */
  roasBECaja: number
  /** 🔑 El semáforo: lo máximo que se puede pagar por una compra. Es el de GANANCIA, a propósito. */
  costoMax: number
  /** El techo si además se cuenta el recupero. Sirve para un empujón con fecha, no como regla. */
  costoMaxCaja: number
  /** El ROAS que corresponde a ese techo. Es objetivo, no piso. */
  roasObj: number
  /** El objetivo del techo de caja. */
  roasObjCaja: number
  /** Cuántas veces entra el costo de hoy en el techo. Es el aire que hay para escalar. */
  aire: number
  /** El presupuesto diario que sostiene el objetivo de ventas al precio del techo. */
  diario: number
  compras: number
  dias: number
  factu: number
  extremos: {
    /** Todo tarjeta. */
    tarjeta: Extremo
    /** Todo transferencia. */
    transferencia: Extremo
    /** Cuánto separa a los dos extremos, en % del techo. Debajo de 5% el mix deja de importar. */
    spreadPct: number
  }
}

/** Un reparto posible de la contribución, con lo que implica. */
export type Escenario = {
  /** Qué parte de la contribución se le da a la pauta, en %. */
  reparto: number
  etiqueta: string
  /** Verde = queda ganancia de sobra; ámbar = al hueso; rojo = no queda nada. */
  tono: 'success' | 'warning' | 'danger' | 'neutral'
  costoMax: number
  roas: number
  diario: number
  /** El que está elegido con los supuestos de ahora. */
  elegido: boolean
}

/** Qué deja vender todo el stock, pagando tanto por compra. */
export type Proyeccion = {
  etiqueta: string
  costoPorCompra: number
  pauta: number
  ganancia: number
  roas: number
}

/** Lo que la foto contesta sobre una línea. `null` cuando no contestó. */
export type CostoMedido = {
  /** Gasto de la ventana dividido los pedidos REALES de la tienda. Es el de `pctTecho` de la zona. */
  costo: number
  /** Cuántos pedidos lo respaldan. 🔴 Con 0 el cociente da 0 y ese 0 se lee como «gratis». */
  pedidos: number
  /** El primer día de la ventana, ya cerrado. */
  desde: string
  /** El último día CERRADO. ⚠️ Es propio de cada línea: el 30-ago BDI cerraba el 29 y Zattia el 26. */
  hasta: string
}

/** Quién gobierna el aire de esta ficha, y por qué. */
export type CostoVigente = {
  /** El que se usa. `0` cuando no hay ninguno. */
  costo: number
  fuente: 'foto' | 'ficha' | 'ninguno'
  /** Por qué no mandó la foto. Vacío cuando mandó ella. */
  motivo: string
  /** Cuánto se pasa lo tipeado sobre lo medido, en %. `null` si falta alguno de los dos. */
  discrepaPct: number | null
}

export const DEFAULTS = DEFAULTS_JS as Supuestos
export const costoQueManda = costoQueMandaJs as (
  args: { medido?: CostoMedido | null; tipeado?: number },
) => CostoVigente
export const normalizar = normalizarJs as (crudo: unknown) => Supuestos
export const calcularRentabilidad = calcularJs as (s: Supuestos) => Rentabilidad
export const escenariosDeFreno = escenariosJs as (s: Supuestos, r: Rentabilidad) => Escenario[]
export const proyeccionStock = proyeccionJs as (s: Supuestos, r: Rentabilidad) => Proyeccion[]

/** Los supuestos de una línea, con la firma de quién los dejó así. */
export type Guardado = {
  linea: LineaPauta
  supuestos: Supuestos
  /**
   * `false` cuando la línea todavía no tiene fila propia y lo que se ve son los `DEFAULTS`.
   *
   * 🔑 **La pantalla lo dice en voz alta.** Los defaults son la economía de las fundas de BDI: si
   * Zattia los mostrara callada, su techo se leería como un dato medido de Zattia.
   */
  guardado: boolean
  /** Quién lo guardó por última vez. `null` si todavía no se guardó. */
  por: string | null
  /** Cuándo, en ISO. `null` si todavía no se guardó. */
  cuando: string | null
}

/** Qué puede hacer esta persona con el umbral de esta línea. Lo contesta el servidor. */
export type PoderesRentabilidad = {
  /** Guardar cambia lo que TODOS leen como «rinde»: hoy es sólo de un admin. */
  editar: boolean
}

export type RespuestaRentabilidad = Guardado & { puede: PoderesRentabilidad }

const API = '/api/datos?recurso=meta-rentabilidad'

export async function leerRentabilidad(linea: LineaPauta): Promise<RespuestaRentabilidad> {
  const r = await apiFetch(`${API}&linea=${linea}&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo leer el umbral de rentabilidad.')
  return {
    linea: d.linea as LineaPauta,
    supuestos: normalizar(d.supuestos),
    guardado: Boolean(d.guardado),
    por: d.por ?? null,
    cuando: d.cuando ?? null,
    puede: d.puede || { editar: false },
  }
}

export async function guardarRentabilidad(linea: LineaPauta, supuestos: Supuestos): Promise<RespuestaRentabilidad> {
  const r = await apiFetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ linea, supuestos }),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo guardar el umbral de rentabilidad.')
  return {
    linea: d.linea as LineaPauta,
    supuestos: normalizar(d.supuestos),
    guardado: true,
    por: d.por ?? null,
    cuando: d.cuando ?? null,
    puede: d.puede || { editar: false },
  }
}
