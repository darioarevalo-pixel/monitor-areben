/**
 * Tipos de **Norte** (key `norte`, área Dirección): la pantalla que mira hacia adelante.
 *
 * Dirección ya tiene dos pantallas y son dos tiempos distintos: **Gerencial** dice qué decidir
 * *hoy*, el **Memo semanal** dice qué *pasó*. Norte dice **hacia dónde vamos**: el stock que entra
 * contra el que sale, los pagos que vienen, y las metas con su avance.
 *
 * 🔑 **El eje de Norte es la LÍNEA (`bdi` · `zattia` · `stunned`), no la marca.** Es el mismo eje
 * que ya usan `lib/memo` (que parte Stunned por prefijo de SKU) y `meta_ads_rentabilidad` (que
 * guarda la economía unitaria por línea). Eso no es casualidad y hay que sostenerlo: son las tres
 * piezas que se cruzan.
 */

import type { Canal } from '../liquidacion/resultado'
import type { Linea } from '../memo/tipos'

export type { Canal, Linea }

/**
 * La moneda de una compra.
 *
 * 🔴 **No es un detalle de formato: es riesgo.** Las fundas se compran en dólares (US$1,08
 * promedio, hasta US$1,35 las encapsuladas) y se venden en pesos. Una cuota a 60 días tiene el
 * monto en pesos **sin fijar** hasta que se paga, y la contribución de una funda mayorista es de
 * ~$1.046: no aguanta una devaluación grande. Por eso Norte guarda la moneda de origen y convierte
 * al mirar, en vez de guardar pesos congelados.
 */
export type Moneda = 'USD' | 'ARS'

/**
 * Una cuota del proveedor: a cuántos días de la factura, y qué porción del total.
 *
 * 🔑 **`fecha` pisa a `dias`, y existe porque el mundo real no es aritmética.** «A 30 días» del
 * 7-ago da 6-sep contando días, pero el proveedor de BDI cobra el **7-sep**: en la práctica «30 y
 * 60» quiere decir «el mismo día de los dos meses que siguen». Forzar la cuenta corría cada
 * vencimiento un día y ese día se ve como un pago adelantado. Cuando la fecha está pactada, se
 * carga y listo; `dias` queda para el caso común en que no se pactó nada raro.
 */
export type Cuota = { dias: number; pct: number; fecha?: string }

/**
 * La economía de una importación — **lo único que Norte agrega al dato que ya existe**.
 *
 * La sección `ingresos` (Compras → Ingresos proyectados) ya tiene cantidad, modelos, proveedor,
 * fecha estimada y estado. De plata no dice una palabra: no hay costo, ni moneda, ni plazo. Esto
 * es esa mitad que falta, y por eso se referencia por `ingresoId` en vez de duplicar nada.
 *
 * 🔴 **Vive en la base, NO en el KV donde viven los ingresos.** El endpoint de ingresos
 * (`bdi-catalogo/api/ingresos`) tiene el GET **abierto sin credencial** —su portero sólo corre
 * cuando viene `?kind=`, y los ingresos proyectados usan la ruta default—, así que meter ahí la
 * deuda de la empresa sería publicarla. Ver `docs/secciones/norte.md`.
 */
export type Condiciones = {
  /** El `id` del `Ingreso` en el KV. Es la clave que une las dos mitades. */
  ingresoId: string
  /** ISO `YYYY-MM-DD`. **No es la fecha de llegada**: los plazos cuentan desde la factura. */
  fechaFactura: string
  costoUnitario: number
  moneda: Moneda
  /** Snapshot opcional. Si es `null` se toma `totalU()` del ingreso, que es la fuente viva. */
  unidades: number | null
  cuotas: Cuota[]
  nota: string
}

/**
 * Una importación lista para proyectar: lo que trae el KV + lo que agrega `Condiciones`.
 *
 * ⚠️ `condiciones` puede ser `null` y **eso no es un error**: una importación recién cargada
 * todavía no tiene su economía. Norte la cuenta para el stock (que sí sabe) y la deja afuera del
 * calendario de pagos (que no sabe) **diciéndolo**, en vez de asumir un costo.
 */
export type ImportacionProyectada = {
  id: string
  desc: string
  /** Fecha estimada de llegada, ISO. Puede venir vacía del KV. */
  llega: string
  unidades: number
  /** `estado === 'arribado'`: ya está en el depósito, no vuelve a entrar en la proyección. */
  arribada: boolean
  condiciones: Condiciones | null
}

/** El ritmo de salida de un canal, con lo que deja. */
export type RitmoCanal = {
  canal: Canal
  unidadesDia: number
  contribUnidad: number
  contribDia: number
}

/** Un pago con fecha cierta y monto en las dos monedas. */
export type Pago = {
  fecha: string
  importacionId: string
  etiqueta: string
  monto: number
  moneda: Moneda
  /** El mismo monto a la cotización que se le pasó. Si la moneda es ARS, es igual a `monto`. */
  montoPesos: number
}

/** Un día de la proyección de stock. */
export type PuntoStock = {
  fecha: string
  entra: number
  sale: number
  /** Stock al cierre de ese día. */
  stock: number
}

/**
 * El semáforo de Norte.
 *
 * - `holgado` — sale más de lo que entra: el stock baja.
 * - `ajustado` — la diferencia es menor al 10%: empata, sin margen.
 * - `no-llega` — entra más de lo que sale: el stock se acumula.
 * - `sin-datos` — no hay importaciones cargadas con fecha, o no hay ventas para medir el ritmo.
 */
export type EstadoVeredicto = 'holgado' | 'ajustado' | 'no-llega' | 'sin-datos'

export type Veredicto = {
  estado: EstadoVeredicto
  entranDia: number
  salenDia: number
  /** Positiva = faltan vender. Negativa = sobra ritmo. */
  brechaDia: number
  /** La frase que va arriba de todo, ya redactada con los números adentro. */
  titular: string
}

/** Un objetivo de mediano plazo con su medición. */
export type Meta = {
  key: string
  label: string
  /** Qué se cuenta: «ventas por día», «fundas por día», «%»… */
  unidad: string
  objetivo: number
  medido: number
  /** ISO. Si está, se calcula el ritmo semanal que hace falta para llegar. */
  fechaObjetivo?: string
}

export type AvanceMeta = {
  meta: Meta
  /** 0-100, recortado. */
  pct: number
  falta: number
  /** Cuántas veces hay que multiplicar lo de hoy. `Infinity` si hoy es cero. */
  veces: number
  /** Cuánto hay que sumar por semana para llegar a `fechaObjetivo`. `null` si no hay fecha. */
  porSemana: number | null
}

/**
 * La contribución de un canal en la ventana medida, con la cascada abierta renglón por renglón.
 *
 * 🔑 **Los nombres son los del dashboard a propósito** (`netas`, `cmv`, `comisiones`): el día que
 * los dos números no coincidan, hay que poder cotejarlos línea contra línea en vez de discutir
 * cuál está bien. La cascada vive en `lib/norte/contribucion.core.js`.
 */
export type ContribucionCanal = {
  canal: Canal
  ventas: number
  unidades: number
  mercaderia: number
  iva: number
  envios: number
  descuentos: number
  netas: number
  cmv: number
  comisiones: number
  costoEnvios: number
  contribucion: number
  /** `null` sin unidades: no se puede dividir, y un 0 se leería como «no deja nada». */
  contribUnidad: number | null
}

/**
 * Cuánto del período entró de verdad al cálculo.
 *
 * ⚠️ **Sin esto el número no se puede creer.** Una venta cuya cuenta de cobro no está clasificada
 * queda afuera —no hay default barato: asumirla no facturable sube la contribución 21%— y una sin
 * CMV también, porque sin costo la contribución sale inflada. Si la pantalla muestra la plata sin
 * decir sobre cuántas ventas la calculó, un 40% de cobertura se ve igual que un 100%.
 */
export type CoberturaContribucion = {
  ventas: number
  usadas: number
  sinCuenta: number
  sinCosto: number
  /** Cuentas de cobro que el dashboard todavía no clasificó. Se nombran: es un dato que falta cargar. */
  cuentasDesconocidas: string[]
  /** `false` cuando ninguna comisión tiene porcentaje cargado ⇒ la contribución no las descuenta. */
  comisionesCargadas: boolean
}

export type Contribucion = {
  disponible: boolean
  /** Por qué no está, cuando no está. Va a la pantalla tal cual. */
  motivo: string | null
  ventana: { desde: string; hasta: string; dias: number } | null
  canales?: ContribucionCanal[]
  cobertura?: CoberturaContribucion
}
