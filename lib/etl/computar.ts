/**
 * El ETL del monitor: filas crudas de Supabase → todo lo que las secciones leen.
 *
 * Port literal de computarDatos (index.html:2226-2621). "Literal" es una regla,
 * no una descripción: **acá no se arregla nada**. Si el ETL tiene bugs, se
 * arreglan después, con la migración ya verificada. Mezclar port y fix hace
 * imposible saber qué rompió los números.
 *
 * Los tres únicos cambios respecto del original, todos de forma y no de fórmula:
 *
 *  1. `today` y `colorManualMap` entran por parámetro (`ContextoETL`) en vez de
 *     leerse de los globales TODAY (index.html:1914) y colorManualMap (1923).
 *     Eso es lo que la vuelve pura y testeable.
 *  2. Se cayó el parámetro `lastSync`: estaba en la firma, procesarYRenderizar se
 *     lo pasaba (index.html:2676) y el cuerpo no lo leía nunca.
 *  3. Los helpers anidados (_matchModelo, extractColor) viven ahora en ./modelos
 *     y ./helpers, sin cambios.
 *
 * Y tres cosas que NO se portaron porque estaban muertas en el original —
 * verificado con grep sobre el archivo entero, no a ojo:
 *
 *  - `invByVariant` (index.html:2228): se llenaba y no lo leía nadie, ni se devolvía.
 *  - `categoryByPid` (2288): idem.
 *  - `normalizeCat` (2282): su único llamador era categoryByPid, así que muere con él.
 *
 * No devolverlas no cambia un solo número: no salían de la función. Si alguna
 * sección las llega a necesitar, se reviven acá (normalizeCat mapea MAYORISTA y
 * MINORISTA → FUNDAS, que es la regla que se perdería de vista).
 */

import { matchModelo } from './modelos'
import {
  COLOR_UNICA,
  daysSince,
  extractColor,
  getPhase,
  lifespanDays,
  lifespanDaysFromFirst,
  num,
} from './helpers'
import { LIFESPAN_SIN_DATO } from './tipos'
import type {
  Agotamiento,
  ColorAgotamiento,
  ContextoETL,
  DatosETL,
  EntradaETL,
  EstadisticaMensual,
  Producto,
  ProductoProveedor,
  Variante,
  VentaColor,
  VentasVariante,
  VentaTalle,
} from './tipos'

/** Acumulador de ventas por producto. `first` no existe en el de variantes. */
type VentasProducto = {
  total: number
  s7: number
  s15: number
  s30: number
  s60: number
  s90: number
  byMonth: Record<string, number>
  last: string | null
  first: string | null
  name: string
}

/** Fábricas, no constantes: cada acumulador necesita su propio `byMonth`. */
const vacioProd = () => ({ total: 0, s7: 0, s15: 0, s30: 0, s60: 0, s90: 0, byMonth: {} as Record<string, number>, last: null, first: null })
const vacioVar = () => ({ total: 0, s7: 0, s15: 0, s30: 0, s60: 0, s90: 0, byMonth: {} as Record<string, number>, last: null })

export function computarDatos(entrada: EntradaETL, ctx: ContextoETL): DatosETL {
  const { productos, ventas, detalles, inventario, vmMes, vmCat, vmFundas, syncMeta } = entrada
  const { today, colorManualMap } = ctx

  // ── Inventario: stock por producto y por modelo ──────────────────────────────
  const invByProduct: Record<string, number> = {}
  const invByProdModelo: Record<string, number> = {}
  const invDepoMin: Record<string, number> = {} // stock SOLO del Deposito Minorista (para detectar agotamiento real)

  ;(inventario || []).forEach((i) => {
    if (/mayorista/i.test(i.store_name || '')) return // Depósito Mayorista: canal aparte, no se cuenta en el stock de análisis
    const pid = String(i.product_id)
    const qty = i.available_quantity || 0
    invByProduct[pid] = (invByProduct[pid] || 0) + qty
    const modelo = matchModelo(i.size_name)
    if (modelo) {
      const key = pid + '|||' + modelo
      invByProdModelo[key] = (invByProdModelo[key] || 0) + qty
      // Solo el Deposito Minorista cuenta para "agotado" (Local = vidriera, Mayorista = inactivo)
      if (/minorista/i.test(i.store_name || '')) {
        invDepoMin[key] = (invDepoMin[key] || 0) + qty
      }
    }
  })

  // Metadata de productos para el cálculo de demanda por modelo (fecha de lanzamiento + categoría)
  const prodMeta: Record<string, { created: string | null; cat: string }> = {}
  ;(productos || []).forEach((p) => {
    prodMeta[String(p.id)] = {
      created: p.created_at ? p.created_at.substring(0, 10) : null,
      cat: (p.category || '').toUpperCase().trim(),
    }
  })

  const nameByPid: Record<string, string> = {}
  ;(productos || []).forEach((p) => {
    nameByPid[String(p.id)] = p.name || ''
  })

  // ── Ventas por producto y por variante, desde venta_detalles planos ──────────
  const vprod: Record<string, VentasProducto> = {}
  const vvar: Record<string, VentasVariante> = {}
  const cutoff7 = new Date(today); cutoff7.setDate(cutoff7.getDate() - 7)
  const cutoff15 = new Date(today); cutoff15.setDate(cutoff15.getDate() - 15)
  const cutoff30 = new Date(today); cutoff30.setDate(cutoff30.getDate() - 30)
  const cutoff60 = new Date(today); cutoff60.setDate(cutoff60.getDate() - 60)
  const cutoff90 = new Date(today); cutoff90.setDate(cutoff90.getDate() - 90)

  // Últimos 16 meses para análisis mensual de producto
  const months: string[] = []
  const cursorMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  for (let i = 15; i >= 0; i--) {
    const d = new Date(cursorMonth.getFullYear(), cursorMonth.getMonth() - i, 1)
    months.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'))
  }

  // Mapa sale_id → date_sale para unir detalles con su fecha de venta
  const ventasMap: Record<string, string | null> = {}
  ;(ventas || []).forEach((v) => {
    ventasMap[String(v.id)] = v.date_sale
  })

  ;(detalles || []).forEach((item) => {
    const fecha = (ventasMap[String(item.sale_id)] || '').substring(0, 10)
    const fechaMes = fecha.substring(0, 7)
    const fechaObj = new Date(fecha)
    const pid = String(item.product_id || '')
    const sid = String(item.size_id || '')
    const vid = pid + '_' + sid
    const qty = item.quantity || 1
    const name = nameByPid[pid] || ''
    const size = item.size || ''

    if (!vprod[pid]) vprod[pid] = { ...vacioProd(), name }
    vprod[pid].total += qty
    vprod[pid].byMonth[fechaMes] = (vprod[pid].byMonth[fechaMes] || 0) + qty
    if (fechaObj >= cutoff7) vprod[pid].s7 += qty
    if (fechaObj >= cutoff15) vprod[pid].s15 += qty
    if (fechaObj >= cutoff30) vprod[pid].s30 += qty
    else if (fechaObj >= cutoff60) vprod[pid].s60 += qty
    if (fechaObj >= cutoff90) vprod[pid].s90 += qty
    if (!vprod[pid].last || fecha > vprod[pid].last) vprod[pid].last = fecha
    if (!vprod[pid].first || fecha < vprod[pid].first) vprod[pid].first = fecha

    if (!vvar[vid]) vvar[vid] = { ...vacioVar(), name, size, pid, sid }
    vvar[vid].total += qty
    vvar[vid].byMonth[fechaMes] = (vvar[vid].byMonth[fechaMes] || 0) + qty
    if (fechaObj >= cutoff7) vvar[vid].s7 += qty
    if (fechaObj >= cutoff15) vvar[vid].s15 += qty
    if (fechaObj >= cutoff30) vvar[vid].s30 += qty
    else if (fechaObj >= cutoff60) vvar[vid].s60 += qty
    if (!vvar[vid].last || fecha > vvar[vid].last) vvar[vid].last = fecha
  })

  // ── Estadísticas mensuales desde vistas materializadas ──────────────────────
  const mStats: Record<string, EstadisticaMensual> = {}
  ;(vmMes || []).forEach((row) => {
    const ms = mStats[row.mes] || (mStats[row.mes] = { mes: row.mes, items: 0, ventasCount: 0, byCategory: {}, byChannel: {} })
    ms.items += Number(row.total_items) || 0
    ms.ventasCount += Number(row.cantidad_ventas) || 0
    const ch = (row.channel || 'Sin canal').trim()
    ms.byChannel[ch] = (ms.byChannel[ch] || 0) + (Number(row.cantidad_ventas) || 0)
  })
  ;(vmCat || []).forEach((row) => {
    if (!mStats[row.mes]) mStats[row.mes] = { mes: row.mes, items: 0, ventasCount: 0, byCategory: {}, byChannel: {} }
    mStats[row.mes].byCategory[row.categoria] = Number(row.total_items) || 0
  })

  // ── Fundas por modelo (clave compuesta modelo|||product_name) ───────────────
  const fStats: Record<string, Record<string, number>> = {}
  const fmProdCreatedAt: Record<string, string> = {}
  const fmKeyPids: Record<string, Set<string>> = {}
  ;(vmFundas || []).forEach((row) => {
    if (!row.modelo) return
    if (!fStats[row.mes]) fStats[row.mes] = {}
    const key = row.modelo + '|||' + (row.product_name || 'Sin nombre')
    fStats[row.mes][key] = (fStats[row.mes][key] || 0) + (Number(row.total_items) || 0)
    if (!fmKeyPids[key]) fmKeyPids[key] = new Set()
    fmKeyPids[key].add(String(row.product_id))
    if (row.product_created_at && row.product_name && !fmProdCreatedAt[row.product_name]) {
      fmProdCreatedAt[row.product_name] = row.product_created_at.substring(0, 10)
    }
  })

  // ── Productos ───────────────────────────────────────────────────────────────
  const allProductos: Producto[] = (productos || []).map((p) => {
    const pid = String(p.id)
    const d = vprod[pid] || vacioProd()
    const dsl = d.last ? daysSince(d.last, today) : 999
    const stock = invByProduct[pid] || 0
    const ls = lifespanDays(stock, d.s30)
    const lsFirst = lifespanDaysFromFirst(stock, d.total, d.first, today)
    const ingresoMes = p.created_at ? p.created_at.substring(0, 7) : null
    const rp = num(p.retailer_price)
    const uc = num(p.unit_cost)
    return {
      id: pid,
      name: p.name || 'Producto ' + pid,
      sku: p.sku || null,
      proveedor: p.proveedor || null,
      category: p.category || null,
      retailer_price: rp,
      unit_cost: uc,
      margin: rp > 0 ? ((rp - uc) / rp) * 100 : null, // margen sobre PVP
      markup: uc > 0 ? (rp / uc - 1) * 100 : null, // recargo sobre costo
      ingresoMes,
      firstSale: d.first || null,
      lastSale: d.last || null,
      daysSinceLast: dsl,
      sales7: d.s7, sales15: d.s15, sales30: d.s30, sales60: d.s60, sales90: d.s90,
      totalSales: d.total,
      monthlySales: months.map((m) => d.byMonth[m] || 0),
      stock,
      lifespan: ls === null ? LIFESPAN_SIN_DATO : ls,
      lifespanFirst: lsFirst === null ? LIFESPAN_SIN_DATO : lsFirst,
      phase: getPhase(d.s60, d.s30, dsl),
    }
  })

  const proveedoresList = [...new Set(allProductos.map((p) => p.proveedor).filter(Boolean))].sort() as string[]

  // ── Variantes ───────────────────────────────────────────────────────────────
  type VarBase = Pick<Variante, 'id' | 'pid' | 'sid' | 'name' | 'size' | 'stock' | 'local' | 'deposito' | 'sku' | 'barcode'>
  const variantesMap: Record<string, VarBase> = {}
  ;(inventario || []).forEach((i) => {
    if (/mayorista/i.test(i.store_name || '')) return // Depósito Mayorista: no se cuenta en el stock de análisis
    const pid = String(i.product_id)
    const sid = String(i.size_id)
    const vid = pid + '_' + sid
    if (!variantesMap[vid]) {
      variantesMap[vid] = { id: vid, pid, sid, name: i.product_name || '', size: i.size_name || '', stock: 0, local: 0, deposito: 0, sku: i.sku || '', barcode: i.barcode || '' }
    }
    const qty = i.available_quantity || 0
    variantesMap[vid].stock += qty
    // Split por ubicación, mismo criterio que repoCargarInventario: el Mayorista
    // ya quedó afuera arriba, así que acá solo resta separar Local del resto (Depósito).
    if (String(i.store_name || '').toLowerCase().trim() === 'local') variantesMap[vid].local += qty
    else variantesMap[vid].deposito += qty
    if (!variantesMap[vid].sku && i.sku) variantesMap[vid].sku = i.sku
    if (!variantesMap[vid].barcode && i.barcode) variantesMap[vid].barcode = i.barcode
  })

  const activeProductIds = new Set(allProductos.map((p) => p.id))

  const allVariantes: Variante[] = Object.values(variantesMap)
    .filter((v) => activeProductIds.has(v.pid))
    .map((v) => {
      const d = vvar[v.id] || vacioVar()
      const dsl = d.last ? daysSince(d.last, today) : 999
      const ls = lifespanDays(v.stock, d.s30)
      return {
        ...v,
        lastSale: d.last || null,
        daysSinceLast: dsl,
        sales7: d.s7, sales15: d.s15, sales30: d.s30, sales60: d.s60, sales90: d.s90,
        totalSales: d.total,
        lifespan: ls === null ? LIFESPAN_SIN_DATO : ls,
        phase: getPhase(d.s60, d.s30, dsl),
      }
    })

  // Fecha de la venta más reciente cargada (date_sale es 'YYYY-MM-DD', compara como string)
  let maxVentaDate: string | null = null
  for (const v of ventas || []) {
    if (v.date_sale && (!maxVentaDate || v.date_sale > maxVentaDate)) maxVentaDate = v.date_sale
  }

  // allMonths: unión de meses de vistas y últimos 16 meses, ordenados
  const viewMeses = new Set([...Object.keys(mStats), ...Object.keys(fStats)])
  const allMonths = [...new Set([...months, ...viewMeses])].sort()
  // El legacy escribía `{ mes: m, ...mStats[m] }` (index.html:2446), donde el spread
  // pisaba `mes` con el del acumulador. Da igual: mStats se indexa por row.mes y
  // guarda `mes: row.mes`, así que el valor pisado es el mismo. Acá va al revés
  // solo para que TS no marque la clave duplicada. Mismo resultado.
  const allMonthlyStats: EstadisticaMensual[] = allMonths.map((m) => ({
    ...(mStats[m] || { items: 0, ventasCount: 0, byCategory: {}, byChannel: {} }),
    mes: m,
  }))

  // ── Proveedores (pestaña Zattia) ────────────────────────────────────────────
  const allProveedoresData: Record<string, { products: ProductoProveedor[] }> = {}
  ;(productos || []).forEach((p) => {
    if (!p.proveedor) return
    const pid = String(p.id)
    const stock = invByProduct[pid] || 0
    const sales = vprod[pid] || vacioProd()
    const rp = num(p.retailer_price)
    const uc = num(p.unit_cost)
    const margin = rp > 0 ? ((rp - uc) / rp) * 100 : null
    if (!allProveedoresData[p.proveedor]) allProveedoresData[p.proveedor] = { products: [] }
    allProveedoresData[p.proveedor].products.push({
      id: pid,
      name: p.name,
      retailer_price: rp,
      unit_cost: uc,
      firstSale: sales.first || null,
      stock,
      soldTotal: sales.total,
      soldByMonth: sales.byMonth,
      margin,
    })
  })

  // ── Colores (pestaña Colores — Zattia) ──────────────────────────────────────
  const allColoresSales: VentaColor[] = []
  ;(detalles || []).forEach((item) => {
    const fecha = (ventasMap[String(item.sale_id)] || '').substring(0, 10)
    if (!fecha) return
    const mes = fecha.substring(0, 7)
    const qty = item.quantity || 1
    const pnombre = nameByPid[String(item.product_id || '')] || ''
    const extracted = extractColor(item.size)
    if (!extracted) return
    let color: string
    if (extracted === COLOR_UNICA) {
      const manual = colorManualMap[pnombre] || null
      if (!manual) return
      color = manual
    } else {
      color = extracted
    }
    allColoresSales.push({ product_name: pnombre, color, qty, mes })
  })

  // ── Agotamiento por color ───────────────────────────────────────────────────
  const invByProdColor: Record<string, number> = {}
  ;(inventario || []).forEach((i) => {
    if (/mayorista/i.test(i.store_name || '')) return // Depósito Mayorista: no se cuenta
    const c = extractColor(i.size_name)
    if (!c || c === COLOR_UNICA) return
    const key = `${i.product_id}|${c}`
    invByProdColor[key] = (invByProdColor[key] || 0) + (i.available_quantity || 0)
  })

  const salesByProdColorDate: Record<string, Record<string, number>> = {}
  ;(detalles || []).forEach((item) => {
    const fecha = (ventasMap[String(item.sale_id)] || '').substring(0, 10)
    if (!fecha) return
    const c = extractColor(item.size)
    if (!c || c === COLOR_UNICA) return
    const key = `${item.product_id}|${c}`
    if (!salesByProdColorDate[key]) salesByProdColorDate[key] = {}
    salesByProdColorDate[key][fecha] = (salesByProdColorDate[key][fecha] || 0) + (item.quantity || 1)
  })

  const allAgotamientoData: Agotamiento[] = []
  ;(productos || []).filter((p) => p.active !== false).forEach((prod) => {
    const pid = String(prod.id)
    const colorSet = new Set<string>()
    Object.keys(invByProdColor).filter((k) => k.startsWith(pid + '|')).forEach((k) => colorSet.add(k.slice(pid.length + 1)))
    Object.keys(salesByProdColorDate).filter((k) => k.startsWith(pid + '|')).forEach((k) => colorSet.add(k.slice(pid.length + 1)))
    if (colorSet.size < 2) return

    const colors: Record<string, ColorAgotamiento> = {}
    colorSet.forEach((color) => {
      const salesMap = salesByProdColorDate[`${pid}|${color}`] || {}
      const totalSold = Object.values(salesMap).reduce((s, q) => s + q, 0)
      const currentStock = invByProdColor[`${pid}|${color}`] || 0
      const initialStock = totalSold + currentStock
      if (initialStock === 0) return
      const sortedDates = Object.keys(salesMap).sort()
      let cum = 0
      const cumByDate = sortedDates.map((date) => ({ date, cum: (cum += salesMap[date]) }))
      const selloutEntry = cumByDate.find((d) => d.cum >= initialStock)
      colors[color] = { initialStock, totalSold, currentStock, selloutDate: selloutEntry?.date || null, cumByDate }
    })
    if (Object.keys(colors).length < 2) return

    const selloutDates = Object.values(colors).filter((c) => c.selloutDate).map((c) => c.selloutDate as string).sort()
    const firstSelloutDate = selloutDates[0] || null
    // El legacy usaba `new Date()` acá (index.html:2560) en vez del global TODAY.
    // Ahora es `today`, igual que el resto: la diferencia real entre ambos era de
    // milisegundos, salvo en una pestaña abierta cruzando la medianoche.
    const refDate = firstSelloutDate || today.toISOString().substring(0, 10)

    const ratioAtRef: Record<string, { sold: number; pct?: number }> = {}
    let totalAtRef = 0
    Object.entries(colors).forEach(([color, data]) => {
      const lastEntry = [...data.cumByDate].filter((d) => d.date <= refDate).pop()
      const soldAtRef = lastEntry?.cum || 0
      ratioAtRef[color] = { sold: soldAtRef }
      totalAtRef += soldAtRef
    })
    if (totalAtRef > 0) {
      Object.keys(ratioAtRef).forEach((color) => {
        ratioAtRef[color].pct = (ratioAtRef[color].sold / totalAtRef) * 100
      })
    }

    const soldOutColors = Object.entries(colors).filter(([, c]) => c.selloutDate === firstSelloutDate).map(([c]) => c)
    allAgotamientoData.push({
      product_name: prod.name,
      product_id: pid,
      proveedor: prod.proveedor || null,
      firstSelloutDate,
      soldOutColors,
      colors,
      ratioAtRef,
    })
  })

  // ── Talles (pestaña Talles — Zattia) ────────────────────────────────────────
  const productInfoMap: Record<string, { category: string; active: FilaActive }> = {}
  ;(productos || []).forEach((p) => {
    productInfoMap[String(p.id)] = { category: (p.category || '').trim(), active: p.active }
  })

  const allTallesCategories = [...new Set(
    (productos || [])
      .filter((p) => p.active !== false)
      .map((p) => (p.category || '').trim())
      .filter(Boolean),
  )].sort()

  const allTallesData: VentaTalle[] = []
  ;(detalles || []).forEach((item) => {
    const fecha = (ventasMap[String(item.sale_id)] || '').substring(0, 10)
    if (!fecha) return
    const mes = fecha.substring(0, 7)
    const qty = item.quantity || 1
    const pid = String(item.product_id || '')
    const info = productInfoMap[pid]
    if (!info || info.active === false) return
    const size = (item.size || '').trim()
    if (!size) return
    allTallesData.push({ category: info.category, size, qty, mes })
  })

  return {
    ventas: ventas || [],
    detalles: detalles || [],
    invByProduct, invByProdModelo, invDepoMin,
    prodMeta, fmKeyPids, fmProdCreatedAt,
    allVvar: vvar, allProductos, allVariantes,
    allMonths, allMonthlyStats, allFundasStats: fStats, allProveedoresData,
    allColoresSales, allAgotamientoData, allTallesData, allTallesCategories,
    proveedoresList, maxVentaDate, syncMeta,
  }
}

type FilaActive = boolean | number | null | undefined
