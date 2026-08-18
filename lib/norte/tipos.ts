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
import type { Medidor } from './medidores'

export type { Canal, Linea, Medidor }

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
 * El costo de **un bloque** de la importación: un material, con su precio.
 *
 * 🔑 **El costo NO es uno por importación, y promediarlo sería inventar.** Una importación trae
 * IMD, encapsuladas y transparentes en el mismo contenedor, y cada material tiene su precio (US$1,08
 * las comunes, hasta US$1,35 las encapsuladas). Un promedio ponderado da el mismo total y **miente
 * en cada línea**: el día que se pregunte cuánto cuesta una encapsulada, la respuesta va a ser el
 * promedio de otra cosa.
 *
 * Las unidades salen del bloque en el KV y no se copian: `unidades` es el override para cuando la
 * factura no coincide con el pedido, igual que antes, pero ahora por material.
 */
export type CostoBloque = {
  /** El `id` del bloque en el KV de ingresos. */
  bloqueId: string
  /** Snapshot del nombre. Sólo para poder NOMBRAR un costo cuyo bloque ya no está. */
  nombre: string
  costo: number
  /** `null` = las del bloque, que es la fuente viva. */
  unidades: number | null
}

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
  /** Un costo por bloque. Mientras falte uno, la compra no se puede totalizar. */
  costos: CostoBloque[]
  moneda: Moneda
  cuotas: Cuota[]
  nota: string
  /**
   * 🔑 **El tilde que convierte una proyección en una deuda.** Lo pone quien carga la plata, y no
   * se deduce del `estado` de la importación: ese estado lo mueve otra pantalla y otra persona, y
   * hoy tiene importaciones que ya llegaron figurando «en tránsito». Deducirlo de ahí haría que
   * un olvido ajeno mueva el calendario de pagos.
   */
  confirmado: boolean
  /** ISO. La fecha de ingreso **real**, la que se firma junto con el tilde. `''` mientras no esté. */
  fechaIngreso: string
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
  /** Los materiales de esta compra, con sus unidades. Es dónde se cuelga el costo. */
  bloques: BloqueImportacion[]
  condiciones: Condiciones | null
}

/** Un bloque del ingreso, reducido a lo que Norte necesita: qué material es y cuántas unidades trae. */
export type BloqueImportacion = { id: string; nombre: string; unidades: number }

/**
 * Desde qué fecha se contaron los plazos de un pago. **Va a la pantalla**: un vencimiento estimado
 * que no dice contra qué se estimó se lee igual que uno pactado.
 *
 * - `factura` — la fecha de la factura del proveedor. Es la única que hace deuda.
 * - `ingreso` — la fecha de ingreso real, ya confirmada, mientras la factura no llegó.
 * - `llegada` — la fecha estimada de llegada del KV. Todo acá es proyección.
 */
export type BasePago = 'factura' | 'ingreso' | 'llegada'

/**
 * En qué peldaño está una compra. **Cada uno se gana con un dato**, y el orden no es decorativo:
 * es lo que hace que el número no empeore al cargar más información.
 *
 * - `incompleta` — falta el costo de algún bloque, o las cuotas, o una fecha desde la cual contar.
 *   No se proyecta: un total sobre los bloques cargados sería una deuda más chica que la real.
 * - `estimada` — todo costeado, pero el ingreso no está confirmado: los plazos cuentan desde la
 *   llegada **estimada**.
 * - `confirmada` — alguien firmó el ingreso y su fecha: se cuenta desde ahí, que ya es firme,
 *   pero todavía no hay factura.
 * - `firme` — hay factura: los plazos cuentan desde ella y el vencimiento es deuda.
 */
export type Peldano = 'incompleta' | 'estimada' | 'confirmada' | 'firme'

/**
 * El estado económico de una compra: en qué peldaño está, qué le falta para subir, y su total.
 *
 * ⚠️ **`total` es 0 mientras el peldaño sea `incompleta`**, y no es «no cuesta nada»: es que no se
 * puede saber. Por eso viene con `sinCosto`, que dice exactamente qué bloques faltan.
 */
export type EstadoCompra = {
  peldano: Peldano
  /** Lo que falta para el peldaño siguiente, ya redactado. `null` cuando ya es `firme`. */
  falta: string | null
  total: number
  moneda: Moneda
  unidades: number
  /** Los bloques que todavía no tienen costo. */
  sinCosto: BloqueImportacion[]
  /**
   * Costos cargados cuyo bloque **ya no existe** en el ingreso.
   *
   * 🔑 No se descuentan en silencio ni se suman: sus unidades no existen. Se nombran, porque el
   * caso real es que alguien borró un bloque en Ingresos y esa plata quedó sin material.
   */
  huerfanos: CostoBloque[]
  /** La fecha desde la que se cuentan los plazos, y de dónde salió. `''` si no hay ninguna. */
  desde: string
  base: BasePago
}

/** El ritmo de salida de un canal, con lo que deja. */
export type RitmoCanal = {
  canal: Canal
  unidadesDia: number
  contribUnidad: number
  contribDia: number
}

/**
 * Un pago con su fecha y su monto en las dos monedas.
 *
 * 🔑 **`firme` separa la deuda del pronóstico, y es la razón por la que los dos salen de la misma
 * cuenta.** Escribir el estimativo aparte habría sido escribir la cascada de plazos dos veces, y
 * dos cuentas del mismo pago se separan el día que alguien toca una.
 */
export type Pago = {
  fecha: string
  importacionId: string
  etiqueta: string
  monto: number
  moneda: Moneda
  /** El mismo monto a la cotización que se le pasó. Si la moneda es ARS, es igual a `monto`. */
  montoPesos: number
  /** `true` sólo cuando sale de la factura de un ingreso confirmado. Lo demás es proyección. */
  firme: boolean
  /** Contra qué fecha se contaron los plazos. */
  base: BasePago
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

/**
 * Un objetivo de mediano plazo. **Declara qué se cuenta; el número de hoy no se guarda.**
 *
 * 🔑 **`medido` no es un campo de la meta y no debe volver a serlo.** Se calcula al mirar, con
 * `medirMeta`, contra la venta real. Una meta con su avance guardado es una meta que miente el día
 * que nadie la actualiza, y ese día llega siempre.
 *
 * 🔑 **La unidad la trae el `medidor`, no la escribe una persona.** Antes `unidad` era texto libre
 * y nada impedía cargar un objetivo «por mes» contra un medido que sale por día: el avance da un
 * número plausible y falso, y no falla nada.
 */
export type Meta = {
  key: string
  label: string
  /** Qué cuenta. El catálogo —con su unidad— está en `lib/norte/medidores.core.js`. */
  medidor: Medidor
  /** El canal que se mide, o `null` = todos juntos. */
  canal: Canal | null
  objetivo: number
  /** ISO. Si está, se calcula el ritmo semanal que hace falta para llegar. */
  fechaObjetivo?: string
}

/**
 * Lo que el medidor pudo medir, o por qué no pudo.
 *
 * ⚠️ **`valor: null` no es cero y la diferencia es la razón de este tipo.** Sin el dashboard
 * conectado no hay contribución: mostrar `$0/día` afirma «no deja nada», que es otra cosa y es
 * falsa. `motivo` va a la pantalla tal cual, como en `Contribucion`.
 */
export type Medicion = { valor: number | null; motivo: string | null }

/**
 * Todo lo que `medirMeta` necesita, ya medido por la pantalla.
 *
 * Es el mismo `ritmo` que se muestra arriba a propósito: si la meta calculara su contribución por
 * su cuenta —sobre la ventana del servidor en vez de la del ETL— la misma pantalla mostraría dos
 * números distintos para la misma cosa, y no habría forma de saber cuál mirar.
 */
export type ContextoMedida = {
  ritmo: RitmoCanal[]
  /** `false` cuando la contribución no está disponible: entonces `contribUnidad` es 0 por defecto. */
  hayPlata: boolean
}

export type AvanceMeta = {
  meta: Meta
  /** Lo que se está midiendo hoy. `null` si no se pudo: `motivo` dice por qué. */
  medido: number | null
  motivo: string | null
  /** 0-100, recortado. `null` sin medido: un 0 se leería como «no avanzamos». */
  pct: number | null
  falta: number | null
  /** Cuántas veces hay que multiplicar lo de hoy. `Infinity` si hoy es cero. */
  veces: number | null
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

/**
 * Una fila del **P&L «por arriba» por línea**: la misma cascada, abierta por negocio en vez de por
 * canal, y cortada en la contribución.
 *
 * 🔑 **`ventas` no se puede sumar entre filas.** Una venta de Zattia que lleva una funda Stunned es
 * una venta para cada línea —igual que los tickets del memo—, así que la columna suma más ventas de
 * las que hubo. La plata sí se reparte bien: los pesos del reparto suman 1. Por eso el total lo
 * arma el núcleo (`totalDe`) y no la pantalla.
 *
 * ⛔ **Termina en la contribución, no en el resultado.** Los gastos fijos (la estructura, $25-30M
 * por mes de las tres marcas) viven en el dashboard y no tienen endpoint. Un P&L que se corta donde
 * se corta y lo dice sirve; uno que estima la estructura inventa justo el número que decide si una
 * línea da o no da.
 */
export type PylFila = {
  /** `'total'` en la fila de cierre; una `Linea` en las demás. */
  linea: Linea | 'total'
  ventas: number
  unidades: number
  mercaderia: number
  iva: number
  envios: number
  descuentos: number
  netas: number
  cmv: number
  /** Netas − CMV. El renglón que el corte por canal no muestra y que el P&L lee de arriba. */
  margenBruto: number
  comisiones: number
  costoEnvios: number
  contribucion: number
  /** `null` sin unidades: no hay por qué dividir, y un 0 se leería como «no deja nada». */
  contribUnidad: number | null
  /** Sobre las netas. `null` con netas en cero: un `0%` es una afirmación, y sería falsa. */
  pctContribucion: number | null
}

/**
 * La cobertura del P&L: la de la contribución, más las ventas que **no tienen línea**.
 *
 * ⚠️ `sinReparto` es propio de este corte y no existe en el de canal: el canal lo tiene toda venta,
 * la línea sale de los renglones. Una venta sin renglones —o con todo en cero, que pasa— no se
 * manda a la línea más grande: eso movería plata real de un negocio al otro.
 */
export type CoberturaPyl = CoberturaContribucion & {
  sinReparto: number
  /**
   * La contribución que cargan esas ventas, y que el corte por canal **sí** cuenta.
   *
   * 🔑 **Es lo que ata las dos tablas de la pantalla.** Sin este número, el total del P&L y el de
   * la contribución por canal difieren y no hay con qué explicar la diferencia — y un «6 ventas»
   * no dice si son $5.000 o $5.000.000. Medido contra producción el 18-ago-2026: son devoluciones
   * (CMV negativo, sin renglones que sumen), −$4.639 en BDI y −$7.643 en Zattia.
   */
  sinRepartoContribucion: number
}

export type Pyl = {
  disponible: boolean
  /** Por qué no está, cuando no está. Va a la pantalla tal cual. */
  motivo: string | null
  ventana: { desde: string; hasta: string; dias: number } | null
  lineas?: PylFila[]
  total?: PylFila
  cobertura?: CoberturaPyl
}
