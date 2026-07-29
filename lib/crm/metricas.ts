/**
 * Métricas de ventas mayoristas, mes a mes: cuántas ventas, cuánto se facturó y
 * cuántos de esos clientes compraban por primera vez.
 *
 * Todo sale de las ventas que la sección Clientes ya tiene cargadas (`useCRM`):
 * ni una consulta nueva, ni una función nueva de Vercel.
 *
 * Tres decisiones de negocio que están acá y no en la pantalla:
 *
 * 1. **Mayorista = `channel_id` 10, y nada más.** El selector "Mayorista" del
 *    header NO significa eso: trae el canal 10 **más todas** las ventas de los
 *    clientes marcados ★, compren por donde compren (`datos.ts:54-67`). Para un
 *    número que se mira todos los días eso es veneno: cambia según qué clientes
 *    estén marcados. Acá se filtra el canal a mano, así el resultado es el mismo
 *    en "Mayorista" que en "Todos los canales".
 *
 * 2. **El estado de la venta no se mira.** Una venta anulada se elimina en Gestión
 *    Nube, no se marca. Filtrar por `sale_state` fabrica un derrumbe falso: el
 *    estado "Compra Pendiente" arrancó en abril de 2026 y se llevaría puesto casi
 *    todo el mes. ⚠️ La contracara conocida: el sync solo hace upsert de ventas y
 *    nunca borra (`scripts/sync-diario.js:344`), así que una venta eliminada en GN
 *    sigue contando acá. Está medido aparte; no se tapa desde este archivo.
 *
 * 3. **"Primera compra" se calcula sobre TODAS las ventas mayoristas conocidas**,
 *    nunca sobre el recorte que se está mirando. Si se recalculara sobre el mes
 *    filtrado, todo cliente sería nuevo siempre. Por eso `primeraCompraPorCliente`
 *    es un parámetro de `metricasPorMes` y no algo que ésta derive sola.
 *
 * Ojo con el arranque de los datos: la base tiene ventas desde 2025-01-01
 * (`scripts/sync-diario.js:397`). Un cliente que ya compraba en 2024 figura como
 * nuevo la primera vez que aparece. Distorsiona los primeros meses de 2025 y nada
 * más — de ahí en adelante el dato es real.
 */

import { CANAL_MAYORISTA } from './datos'
import type { FilaVenta } from './tipos'
import { monthLabel } from '../ventas-mensuales'

export { monthLabel }

/** PostgREST devuelve `numeric` como string; el CRM hace parseFloat en cada uso. */
function num(v: number | string | null | undefined): number {
  return parseFloat(String(v)) || 0
}

/** `YYYY-MM` de un `date_sale`, o null si la fecha no sirve. */
export function mesDe(fecha: string | null): string | null {
  const m = String(fecha || '').match(/^(\d{4})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}` : null
}

/** Día del mes de un `date_sale`, o null. */
export function diaDe(fecha: string | null): number | null {
  const m = String(fecha || '').match(/^\d{4}-\d{2}-(\d{2})/)
  return m ? parseInt(m[1], 10) : null
}

/**
 * Las ventas mayoristas: canal 10 con fecha utilizable. Ver la decisión 1.
 *
 * `channel_id` viene como number de PostgREST y `CANAL_MAYORISTA` es el string
 * '10' del `<option>` — se comparan como texto para no depender de eso.
 */
export function ventasMayoristas(ventas: FilaVenta[]): FilaVenta[] {
  return ventas.filter((v) => String(v.channel_id) === CANAL_MAYORISTA && mesDe(v.date_sale) !== null)
}

/**
 * cliente → fecha de su primera compra mayorista conocida.
 *
 * Se alimenta SIEMPRE del set completo. Ver la decisión 3.
 */
export function primeraCompraPorCliente(ventas: FilaVenta[]): Record<number, string> {
  const out: Record<number, string> = {}
  for (const v of ventas) {
    if (v.client_id == null || !v.date_sale) continue
    const prev = out[v.client_id]
    if (!prev || v.date_sale < prev) out[v.client_id] = v.date_sale
  }
  return out
}

/**
 * Recorta al día `dia` de cada mes, para comparar meses de la misma altura.
 *
 * Sin esto el mes en curso siempre parece un derrumbe: el 29 de julio compite
 * contra un junio de 30 días. Recorta QUÉ ventas se cuentan; no toca la primera
 * compra de nadie, que se calcula aparte sobre el set entero.
 */
export function recortarAlDia(ventas: FilaVenta[], dia: number): FilaVenta[] {
  return ventas.filter((v) => {
    const d = diaDe(v.date_sale)
    return d !== null && d <= dia
  })
}

export type MetricaMes = {
  /** `YYYY-MM`. */
  mes: string
  /** `Jul 26`. */
  label: string
  ventas: number
  facturacion: number
  /** Facturación / ventas. 0 si no hubo ventas. */
  ticket: number
  /** Clientes distintos que compraron en el mes. `nuevos + repiten`. */
  clientes: number
  /** De esos, los que compraban por primera vez. */
  nuevos: number
  /** De esos, los que ya habían comprado antes. */
  repiten: number
}

/**
 * Una fila por mes con ventas, de la más reciente a la más vieja.
 *
 * Las ventas sin `client_id` cuentan para la plata y para la cantidad, pero no
 * para nuevos/repiten: sin cliente no hay a quién estrenar. Hoy no llegan
 * ninguna — las dos consultas del CRM piden `client_id=not.is.null` — pero el
 * total no puede depender de eso.
 */
export function metricasPorMes(ventas: FilaVenta[], primeras: Record<number, string>): MetricaMes[] {
  type Acum = { ventas: number; facturacion: number; nuevos: Set<number>; repiten: Set<number> }
  const porMes = new Map<string, Acum>()

  for (const v of ventas) {
    const mes = mesDe(v.date_sale)
    if (!mes) continue
    let a = porMes.get(mes)
    if (!a) {
      a = { ventas: 0, facturacion: 0, nuevos: new Set(), repiten: new Set() }
      porMes.set(mes, a)
    }
    a.ventas += 1
    a.facturacion += num(v.total_price)
    if (v.client_id != null) {
      // El estreno se decide con la primera compra global, no con la de este mes.
      const primera = primeras[v.client_id]
      if (primera && mesDe(primera) === mes) a.nuevos.add(v.client_id)
      else a.repiten.add(v.client_id)
    }
  }

  return [...porMes.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0)) // más reciente primero
    .map(([mes, a]) => ({
      mes,
      label: monthLabel(mes),
      ventas: a.ventas,
      facturacion: a.facturacion,
      ticket: a.ventas > 0 ? a.facturacion / a.ventas : 0,
      clientes: a.nuevos.size + a.repiten.size,
      nuevos: a.nuevos.size,
      repiten: a.repiten.size,
    }))
}

/** Variación porcentual de `b` a `a`. null cuando la base es 0: de la nada no se crece un %. */
export function variacion(a: number, b: number): number | null {
  if (!b) return null
  return ((a - b) / b) * 100
}

/** El mes anterior a un `YYYY-MM`. */
export function mesAnterior(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

export type Comparacion = {
  actual: MetricaMes | null
  previo: MetricaMes | null
  /** Altura de la comparación: hasta qué día de cada mes se contó. */
  dia: number
  /** El mes de `actual` todavía no terminó (por eso se recortó el previo). */
  parcial: boolean
}

/**
 * El mes en curso contra el anterior, medidos a la misma altura.
 *
 * `hoy` entra por parámetro (el CRM ya congela su `TODAY` al montar) para que
 * esto sea testeable sin tocar el reloj.
 */
export function compararConMesPrevio(ventasMay: FilaVenta[], hoy: Date): Comparacion {
  const mes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
  const dia = hoy.getDate()
  const primeras = primeraCompraPorCliente(ventasMay)

  // Un mes cerrado se compara entero; el mes en curso, contra el previo recortado
  // a la misma altura. `finDeMes` evita recortar de más en un mes más corto.
  const finDeMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate()
  const parcial = dia < finDeMes
  const filas = metricasPorMes(parcial ? recortarAlDia(ventasMay, dia) : ventasMay, primeras)
  const buscar = (m: string) => filas.find((f) => f.mes === m) || null

  return { actual: buscar(mes), previo: buscar(mesAnterior(mes)), dia, parcial }
}
