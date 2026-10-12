/**
 * **El reporte del chequeo** (Darío, 11-oct-2026): al cerrar los recorridos del día, la app arma
 * sola las dos listas que hasta el 10-oct se hacían a mano —lo **pendiente de exhibición** y las
 * **variantes duplicadas**—, sólo de productos **regulares**, ordenadas por SKU.
 *
 * 🔑 **Un chequeo son VARIOS recorridos**: uno por sector («Tops», «Partes de abajo»), el mismo día.
 * El 10-oct fueron dos (302 + 258 escaneos). Una prenda que se escaneó en cualquiera de los dos está
 * exhibida, así que el reporte se arma sobre todos juntos y ⛔ recorrido por recorrido.
 *
 * 🔴 **Es una afirmación sobre TODO lo regular del local.** Darío definió que el chequeo recorre el
 * sector regular entero (~40 min). Si un día se camina sólo un perchero, el reporte pide todo lo
 * demás — por eso la pantalla dice cuánto pasó por el lector contra lo que hay.
 *
 * Qué entra (documento «Chequeo de exhibición — Zattia»):
 * - **Regular** = precio de Tienda Nube conocido y ⛔ en oferta (`precioDeGondola`). Lo oculto en TN
 *   cuenta según su precio. Sin precio de TN = sólo local (outlet, accesorios): afuera.
 * - ⛔ Stunned (`seChequea`) y ⛔ lo que el Mapa del local marca que no va en percha (`cuelga`).
 * - Los modelos «una sola variante» (`mapa.unaVariante`): con una exhibida, el resto ⛔ queda
 *   pendiente; sin ninguna, queda pendiente UNA, en un renglón.
 * - **Duplicada** = la misma variante leída más de una vez (en el mismo lugar o en dos), sin contar
 *   lo escaneado en una exhibición FRONTAL (`D03 frontal`, desde el 12-oct-2026): ahí se repite a
 *   propósito. Lo frontal que ⛔ se marcó al escanear lo sigue marcando la empleada en el ticket.
 * - **Feria en regulares** (Darío, 11-oct-2026) = una prenda en promoción que pasó por el lector. El
 *   chequeo recorre sólo el sector regular, así que si se leyó, estaba colgada ahí. ⛔ Se corrige en
 *   el chequeo: se reporta para decidirlo después, y por eso ⛔ va al ticket de la empleada.
 *   El 10-oct fueron 11 sin haber pasado la feria.
 */

import { colgadasDeMas } from './balance'
import { esFrontal } from './paradas'
import { exhibId, precioDeGondola, seChequea, tipoDePrenda } from './core'
import { pasoPorElLector, unidadesVistas, type EscaneoLibre } from './libre'
import type { ExhibItem } from './tipos'
import type { MapaLocal } from '@/lib/mapa-local/tipos'

/** ¿Es un producto regular de Zattia? Precio de TN conocido, sin oferta, y ⛔ Stunned. */
export function esRegular(it: Pick<ExhibItem, 'sku' | 'precio' | 'promo'>): boolean {
  if (!seChequea('zattia', it)) return false
  const g = precioDeGondola(it)
  if (g.lista == null && g.aCobrar == null) return false
  return !g.enOferta
}

/** Un renglón de «Pendiente de exhibición». */
export type Pendiente = {
  /** `exhibId` de la variante, o `<productId>|*` si el modelo se exhibe con una sola variante. */
  clave: string
  sku: string
  productId: string
  nombre: string
  /** `size_name` de GN («Negro - M»). Vacío si es «una cualquiera». */
  variante: string
  /** Unidades en el Local según el sistema (salón + depósito del local). */
  enLocal: number
  /** El modelo se exhibe con una sola variante y ⛔ hay ninguna: va UNA cualquiera. */
  unaCualquiera: boolean
  /**
   * El día de alta en GN (`YYYY-MM-DD`) si el producto es **nuevo desde el chequeo anterior**; si ⛔, `null`.
   * ⚠️ Es el alta del PRODUCTO: la reposición de algo que ya existía ⛔ se marca (el TOP MALTA del
   * 8-oct figura del 19-sep).
   */
  nuevo: string | null
}

/** Un renglón de «Variantes duplicadas». */
export type Duplicada = {
  clave: string
  sku: string
  nombre: string
  variante: string
  /** Cuántas veces pasó por el lector, sumando todos los recorridos. Siempre 2 o más. */
  veces: number
  lugares: string[]
  /** Prendas distintas leídas entre la primera y la última lectura: 0 = puede ser la misma pasada dos veces. */
  otrasEnMedio: number
}

/** Un renglón de «Feria en el sector regular»: una prenda en promoción que pasó por el lector. */
export type FeriaEnRegulares = {
  clave: string
  sku: string
  nombre: string
  variante: string
  /** Cuántas veces pasó por el lector, sumando todos los recorridos. */
  veces: number
  lugares: string[]
}

/**
 * Un tipo de prenda del que ⛔ pasó NINGUNA variante por el lector (Darío, 12-oct-2026). Es la señal
 * de que se salteó un sector: el porcentaje solo ⛔ lo dice, porque lo que ⛔ se escaneó también es
 * lo que ⛔ está colgado (el 10-oct dio 88 % con el local recorrido entero; BODY 0 de 7).
 */
export type TipoSinEscanear = { tipo: string; variantes: number }
/** Desde cuántas variantes con stock un tipo entero sin escanear se avisa: con menos, es ruido. */
export const MIN_TIPO_SIN_ESCANEAR = 5

export type ReporteChequeo = {
  pendientes: Pendiente[]
  tiposSinEscanear: TipoSinEscanear[]
  duplicadas: Duplicada[]
  feria: FeriaEnRegulares[]
  /** Variantes regulares con stock que pasaron por el lector, contra el total. */
  vistas: number
  total: number
  /** Modelos «una sola variante» con una exhibida: sus otras variantes ⛔ se piden. */
  porUnaVariante: number
}

/**
 * Por SKU con los números en orden de número (`RTO-0100` después de `RTO-0099`); sin SKU, al final.
 * Así cada tipo de prenda queda junto, como está ordenado el depósito del local.
 */
export function porSku(a: { sku: string; nombre: string; variante: string }, b: { sku: string; nombre: string; variante: string }): number {
  if (!a.sku !== !b.sku) return a.sku ? -1 : 1
  return (
    a.sku.localeCompare(b.sku, 'es', { numeric: true, sensitivity: 'base' }) ||
    a.nombre.localeCompare(b.nombre, 'es') ||
    a.variante.localeCompare(b.variante, 'es', { numeric: true })
  )
}

/**
 * **Desde cuándo un producto es «nuevo»** (Darío, 12-oct-2026): desde el chequeo ANTERIOR al que se
 * mira —lo que entró después ⛔ pudo estar colgado en ese chequeo—. Sin chequeo anterior, la semana
 * de antes (el chequeo es semanal).
 *
 * 🔑 **Por DÍA y ⛔ por hora**: `productos.created_at` de GN viene sin zona horaria. El alta del mismo
 * día del chequeo anterior cuenta como nueva: el chequeo es antes de abrir y las compras se cargan
 * a la tarde (la del 8-oct, 17:10).
 *
 * 🔑 **Una prueba ⛔ es un chequeo**: el 7-oct hubo 4 recorridos de 7 a 15 escaneos y, tomados como
 * «el anterior» del 10-oct, habrían corrido el corte. Cuenta el día con `MIN_ESCANEOS_CHEQUEO` o más
 * (los reales: 415, 638 y 560).
 *
 * @param recorridos los cerrados, con su día (`YYYY-MM-DD`) y cuántos escaneos tienen.
 */
export const MIN_ESCANEOS_CHEQUEO = 100

export function nuevosDesde(dia: string, recorridos: { dia: string; escaneos: number }[]): { desde: string; hayAnterior: boolean } {
  const porDia = new Map<string, number>()
  for (const r of recorridos) porDia.set(r.dia, (porDia.get(r.dia) ?? 0) + r.escaneos)
  const anterior = [...porDia].filter(([d, n]) => d < dia && n >= MIN_ESCANEOS_CHEQUEO).map(([d]) => d).sort().at(-1)
  if (anterior) return { desde: anterior, hayAnterior: true }
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 7)
  return { desde: d.toISOString().slice(0, 10), hayAnterior: false }
}

/**
 * El reporte de un chequeo.
 *
 * @param escaneos los de TODOS los recorridos del chequeo, juntos.
 * @param items el inventario del Local (con o sin stock: acá se filtra).
 * @param mapa el Mapa del local guardado, por `unaVariante` y los tipos que ⛔ se cuelgan. Sin mapa, ninguno.
 * @param nuevos `productId` → día de alta, sólo de los dados de alta desde el chequeo anterior (`nuevosDesde`).
 */
export function reporteDelChequeo(
  escaneos: EscaneoLibre[],
  items: ExhibItem[],
  mapa: Pick<Partial<MapaLocal>, 'unaVariante' | 'tipos'> | null,
  nuevos: Map<string, string> = new Map(),
): ReporteChequeo {
  const vistas = unidadesVistas(escaneos)
  const modelosVistos = new Set(escaneos.filter((e) => pasoPorElLector(e) && e.encontrado && e.product_id).map((e) => String(e.product_id)))
  const unaSola = new Set(mapa?.unaVariante ?? [])
  const noCuelga = new Set((mapa?.tipos ?? []).filter((t) => t.cuelga === false).map((t) => t.tipo))

  const pendientes = new Map<string, Pendiente>()
  /** Por tipo de prenda: cuántas variantes hay y cuántas pasaron por el lector. */
  const porTipo = new Map<string, { n: number; vistas: number }>()
  let total = 0
  let vistasRegulares = 0
  let porUnaVariante = 0
  for (const it of items) {
    if (!(it.qty > 0) || !esRegular(it) || noCuelga.has(tipoDePrenda(it.name))) continue
    total++
    const tipo = porTipo.get(tipoDePrenda(it.name)) ?? { n: 0, vistas: 0 }
    tipo.n++
    porTipo.set(tipoDePrenda(it.name), tipo)
    if (vistas.has(exhibId(it))) {
      tipo.vistas++
      vistasRegulares++
      continue
    }
    if (unaSola.has(it.productId)) {
      if (modelosVistos.has(it.productId)) {
        porUnaVariante++
        continue
      }
      const k = `${it.productId}|*`
      const ya = pendientes.get(k)
      if (ya) {
        ya.enLocal += it.qty
        // El SKU más bajo del modelo: es por donde se empieza a buscar en el depósito.
        if (it.sku && (!ya.sku || porSku({ sku: it.sku, nombre: '', variante: '' }, { sku: ya.sku, nombre: '', variante: '' }) < 0)) ya.sku = it.sku
      } else pendientes.set(k, { clave: k, sku: it.sku, productId: it.productId, nombre: it.name, variante: '', enLocal: it.qty, unaCualquiera: true, nuevo: nuevos.get(it.productId) ?? null })
      continue
    }
    const k = exhibId(it)
    pendientes.set(k, { clave: k, sku: it.sku, productId: it.productId, nombre: it.name, variante: it.size, enLocal: it.qty, unaCualquiera: false, nuevo: nuevos.get(it.productId) ?? null })
  }

  // Las duplicadas salen de la MISMA cuenta que el balance (`colgadasDeMas`), sobre todos los
  // recorridos juntos: la prenda que está en «Tops» y en la vidriera ocupa dos perchas igual.
  const primera = new Map<string, EscaneoLibre>()
  for (const e of escaneos) if (pasoPorElLector(e) && e.encontrado && !primera.has(e.variante_id)) primera.set(e.variante_id, e)
  const duplicadas: Duplicada[] = []
  // 🔑 Lo escaneado en una exhibición FRONTAL ⛔ cuenta para duplicadas: ahí se repite a propósito
  // (Darío, 12-oct-2026). Igual cuenta como exhibido: `vistas` sale de todos los escaneos.
  for (const c of colgadasDeMas(escaneos.filter((e) => !esFrontal(e.lugar)))) {
    const e = primera.get(c.variante_id)
    if (!e || !esRegular({ sku: e.sku || '', precio: e.precio, promo: e.promo })) continue
    duplicadas.push({ clave: c.variante_id, sku: e.sku || '', nombre: c.nombre, variante: c.size, veces: c.unidades, lugares: [...c.lugares].sort(), otrasEnMedio: c.otrasEnMedio })
  }

  // La feria con el precio CONGELADO al escanear: es el que tenía colgado en ese momento.
  // Stunned y lo que ⛔ cruzó con TN (outlet, accesorios) tampoco son regulares, pero ⛔ son feria.
  const feria: FeriaEnRegulares[] = []
  for (const [id, e] of primera) {
    const it = { sku: e.sku || '', precio: e.precio, promo: e.promo }
    if (!seChequea('zattia', it) || !precioDeGondola(it).enOferta) continue
    const lugares = [...new Set(escaneos.filter((x) => x.variante_id === id && pasoPorElLector(x) && x.lugar).map((x) => x.lugar))].sort()
    feria.push({ clave: id, sku: e.sku || '', nombre: e.product_name || '—', variante: e.size || '', veces: vistas.get(id) || 1, lugares })
  }

  const tiposSinEscanear = [...porTipo]
    .filter(([, t]) => t.vistas === 0 && t.n >= MIN_TIPO_SIN_ESCANEAR)
    .map(([tipo, t]) => ({ tipo, variantes: t.n }))
    .sort((a, b) => b.variantes - a.variantes)

  return {
    pendientes: [...pendientes.values()].sort(porSku),
    tiposSinEscanear,
    duplicadas: duplicadas.sort(porSku),
    feria: feria.sort(porSku),
    vistas: vistasRegulares,
    total,
    porUnaVariante,
  }
}
