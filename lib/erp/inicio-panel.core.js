/**
 * ERP › Inicio · el PANEL (tanda 2, Bruno 30-oct: «el ÚNICO lugar que tiene que tener un panel importante»; maqueta del
 * diseñador, tablero «Inicio · propuesta»). Puro: arma lo que dibujan los gráficos a partir de lecturas que YA existen.
 *
 * 🔑 Ninguna cuenta nueva: cada número sale de un núcleo que ya usa una pantalla, y su ORÁCULO es esa pantalla:
 *   - día a día, 12 meses y canales ⇒ `api/_erp-inicio.js` (la misma consulta del «Vendido», agrupada): suman `mes.vendido`.
 *   - stock a costo ⇒ las filas de Productos (`productos-lista.core.js`), cuyo `disponible` es el de la lista de Stock:
 *     las unidades dan el «disponible» del resumen de Stock de la misma línea, y el costo es el que dice cada producto.
 *   - lo que más deja ⇒ `agrupar` de Ventas › Por producto (`ventas-producto.core.js`), ordenado por margen.
 */
import { CANAL } from './ventas-producto.core.js'

/**
 * El acumulado día por día de un mes: `[{ dia: 1, total }, …]` hasta `hasta` (los días sin ventas suman 0).
 * @param {Array<{ dia: string, vendido: number }>} dias @param {string} desde AAAA-MM-01 @param {string} hasta AAAA-MM-DD
 */
export function acumulado(dias, desde, hasta) {
  const mes = desde.slice(0, 7)
  const porDia = new Map(dias.filter((d) => d.dia.startsWith(mes)).map((d) => [Number(d.dia.slice(8, 10)), d.vendido]))
  const ultimo = Number(hasta.slice(8, 10))
  let total = 0
  return Array.from({ length: ultimo }, (_, i) => {
    total += porDia.get(i + 1) || 0
    return { dia: i + 1, total }
  })
}

/** Los días del mes (`AAAA-MM`): 28 a 31. */
export const diasDelMes = (mes) => new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate()

/**
 * «Cómo viene el mes»: una fila por día del mes (1 al último) con el acumulado de este mes (hasta hoy; después, `null`)
 * y el del mes anterior ENTERO (para ver cómo terminó).
 * @param {Array<{ dia: string, vendido: number }>} dias
 * @param {{ desde: string, hasta: string }} mes @param {{ desde: string }} anterior
 */
export function comoVieneElMes(dias, mes, anterior) {
  const ultimoAnt = diasDelMes(anterior.desde.slice(0, 7))
  const ahora = acumulado(dias, mes.desde, mes.hasta)
  const antes = acumulado(dias, anterior.desde, `${anterior.desde.slice(0, 8)}${String(ultimoAnt).padStart(2, '0')}`)
  const n = Math.max(diasDelMes(mes.desde.slice(0, 7)), ultimoAnt)
  return Array.from({ length: n }, (_, i) => ({ dia: i + 1, ahora: ahora[i]?.total ?? null, antes: antes[i]?.total ?? null }))
}

/** Lo vendido HOY (el último día del tramo; sin ventas, 0). @param {Array<{ dia: string, vendido: number }>} dias @param {string} hoy */
export const vendidoDelDia = (dias, hoy) => dias.find((d) => d.dia === hoy)?.vendido ?? 0

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

/**
 * Los 12 meses hasta el de `hasta` (los que no tienen ventas, en 0): vendido y margen (vendido − costo de GN).
 * @param {Array<{ mes: string, vendido: number, costo: number }>} meses @param {string} hasta AAAA-MM-DD
 */
export function doceMeses(meses, hasta) {
  const por = new Map(meses.map((m) => [m.mes, m]))
  const n0 = Number(hasta.slice(0, 4)) * 12 + Number(hasta.slice(5, 7)) - 1
  return Array.from({ length: 12 }, (_, i) => {
    const n = n0 - 11 + i
    const clave = `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`
    const m = por.get(clave)
    // 🔴 GN sin costo en todo el mes (Zattia nov-25 a may-26, medido 30-oct) ⇒ el margen ⛔ es lo vendido: va vacío y se dice.
    return { mes: clave, nombre: MESES_CORTOS[n % 12], vendido: m?.vendido ?? 0, margen: m && m.costo > 0 ? m.vendido - m.costo : null, enCurso: i === 11 }
  })
}

/**
 * Por canal, del más grande al más chico, con su parte de lo vendido y su margen. El nombre, como lo dice Por producto.
 * @param {Array<{ canal: string, ventas: number, vendido: number, costo: number }>} canales
 */
export function porCanal(canales) {
  const total = canales.reduce((a, c) => a + c.vendido, 0)
  const m = new Map()
  for (const c of canales) {
    const nombre = CANAL[c.canal] ?? c.canal
    const g = m.get(nombre) ?? { nombre, ventas: 0, vendido: 0, costo: 0 }
    g.ventas += c.ventas; g.vendido += c.vendido; g.costo += c.costo
    m.set(nombre, g)
  }
  return [...m.values()].sort((a, b) => b.vendido - a.vendido).map((g) => ({
    ...g, parte: total ? g.vendido / total : 0, margen: g.vendido ? (g.vendido - g.costo) / g.vendido : null,
  }))
}

/**
 * El stock a COSTO de las filas de Productos (ya filtradas por la línea): disponible × costo vigente. Las unidades de
 * productos SIN costo ⛔ suman un 0 callado: se cuentan aparte.
 * @param {Array<{ disponible: number, costo: number | null }>} filas
 */
export function stockACosto(filas) {
  let costo = 0, unidades = 0, sinCosto = 0, productosSinCosto = 0
  for (const f of filas) {
    if (f.disponible <= 0) continue
    unidades += f.disponible
    if (f.costo == null) { sinCosto += f.disponible; productosSinCosto++ } else costo += f.disponible * f.costo
  }
  return { costo, unidades, sinCosto, productosSinCosto }
}

/**
 * Lo que más deja: los productos agrupados de Por producto con margen, del que más al que menos.
 * @param {Array<{ id: string, nombre: string, margen: number | null, vendido: number, unidades: number }>} agrupados @param {number} [n]
 */
export const masDejan = (agrupados, n = 6) => agrupados.filter((g) => g.margen != null && g.margen > 0).sort((a, b) => b.margen - a.margen).slice(0, n)

/** Las rayas de un eje en números redondos (0, 10 M, 20 M…), 4 o 5, hasta pasar `max`. @param {number} max */
export function rayasRedondas(max) {
  if (!(max > 0)) return [0]
  const bruto = max / 4, mag = 10 ** Math.floor(Math.log10(bruto))
  const paso = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((p) => p >= bruto)
  return Array.from({ length: Math.ceil(max / paso) + 1 }, (_, i) => i * paso)
}

/** «34,1 M», «850 mil», «12.300»: para los ejes y las etiquetas cortas. @param {number} v */
export function plataCorta(v) {
  const a = Math.abs(v)
  if (a >= 1e6) return `${(v / 1e6).toLocaleString('es-AR', { maximumFractionDigits: a >= 1e7 ? 0 : 1 })} M`
  if (a >= 1e3) return `${Math.round(v / 1e3).toLocaleString('es-AR')} mil`
  return Math.round(v).toLocaleString('es-AR')
}
