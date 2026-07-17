/**
 * El dominio del CRM: filas crudas + los mapas del KV → todo lo que la sección
 * muestra. Port literal de index.html:13105-13752.
 *
 * "Literal" es una regla, no una descripción: acá no se arregla nada. Los bugs
 * del CRM que ya se arreglaron (el truncado de PostgREST, el borrado del KV) se
 * arreglaron **en el legacy**, en su propio commit, para que este port se pueda
 * verificar contra un legacy que ya está bien. Mezclar port y fix hace imposible
 * saber qué rompió los números.
 *
 * Los únicos cambios, todos de forma:
 *
 *  1. `today` entra por parámetro en vez de leerse del global `TODAY` (1920).
 *  2. `crmSeg`, `crmClientes` y `crmTelOverride` entran por parámetro en vez de
 *     ser globales. Eso es lo que vuelve testeable todo el archivo.
 *  3. `calcularAgregado` devuelve `{activos, descartados}` en vez de escribir el
 *     global `crmDescartados` y devolver solo los activos (13631-13633).
 *  4. `resumenCompras` devuelve los datos; el HTML lo arma el componente.
 *
 * Nadie importa esto todavía: se conecta recién cuando la paridad esté verde.
 */

import type {
  Agregado,
  ClienteCRM,
  EstadoSeg,
  FilaCliente,
  FilaDetalle,
  FilaVenta,
  Kpis,
  MapaSeguimiento,
  MapaTelefonos,
  Nota,
  ResumenCompras,
  Seg,
  Segmento,
} from './tipos'

// ── Constantes de negocio (index.html:13105-13113) ───────────────────────────
export const CADENCIA_DIAS: Record<string, number> = { semanal: 7, quincenal: 15, mensual: 30 }
export const RIESGO_MIN_DAYS = 30 // entre estos dos días → "en riesgo"
export const RIESGO_MAX_DAYS = 90
export const DORMIDO_DAYS = 90 // > 90 → "dormido"
export const NUEVO_DAYS = 30 // primer pedido <= 30 días → "nuevo"
export const ACTIVO_MIN_PED = 3 // 3+ pedidos activos → "recurrente"
export const TOP_LIMIT = 20 // tarjeta "Top clientes"

// ── Helpers de fecha ─────────────────────────────────────────────────────────

/** addDiasISO (13278). */
export function addDiasISO(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

/** diasHasta (13283). Compara contra la medianoche local de `today`, no contra la hora. */
export function diasHasta(iso: string | null, today: Date): number | null {
  if (!iso) return null
  const target = new Date(iso + 'T00:00:00')
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((target.getTime() - base.getTime()) / 86400000)
}

/** diasDesde (13143). Ojo: usa floor y la hora exacta de `today`, no la medianoche. */
export function diasDesde(d: string | null, today: Date): number | null {
  if (!d) return null
  return Math.floor((today.getTime() - new Date(d).getTime()) / 86400000)
}

/**
 * normalizeArgPhone (13122). Devuelve dígitos listos para wa.me, o '' si no se
 * puede normalizar. El '' es lo que cuenta como "sin teléfono" en los KPIs.
 */
export function normalizeArgPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  let p = String(phone).replace(/[^\d]/g, '')
  if (!p) return ''
  if (p.startsWith('00')) p = p.slice(2)
  if (p.startsWith('54')) {
    return p.startsWith('549') ? p : '549' + p.slice(2)
  }
  if (p.startsWith('0')) p = p.slice(1)
  if (p.length === 10) return '549' + p
  if (p.length === 11 && p.startsWith('9')) return '54' + p
  if (p.length >= 12 && p.length <= 13) return p
  return ''
}

/** PostgREST devuelve numeric como string; el legacy hace parseFloat en cada uso. */
function num(v: number | string | null | undefined): number {
  return parseFloat(String(v)) || 0
}

// ── Seguimiento ──────────────────────────────────────────────────────────────

/** esDescartado (13035). */
export function esDescartado(id: number | string, crmSeg: MapaSeguimiento): boolean {
  const s = crmSeg[String(id)]
  return !!(s && s.descartado)
}

/**
 * estadoSeguimiento (13293).
 *
 * El próximo contacto sale de una fecha fijada a mano O de la cadencia sobre el
 * último contacto. Sin cadencia y sin fecha manual → no hay seguimiento.
 */
export function estadoSeguimiento(id: number | string, crmSeg: MapaSeguimiento, today: Date): Seg {
  const s = crmSeg[String(id)] || {}
  const cad = s.cadencia || ''
  const notas: Nota[] = Array.isArray(s.notas) ? s.notas : []
  let proximo: string | null = s.proximo_manual || null
  if (!proximo && cad && s.ultimo_contacto) proximo = addDiasISO(s.ultimo_contacto, CADENCIA_DIAS[cad] || 30)
  if (!cad && !proximo) return { cadencia: '', ultimo: s.ultimo_contacto || null, proximo: null, estado: 'none', dias: null, notas }
  const dias = proximo ? diasHasta(proximo, today) : null
  let estado: EstadoSeg
  if (!proximo) estado = 'pendiente' // tiene cadencia pero todavía no hay fecha
  else if ((dias as number) <= 0) estado = 'vencido'
  else if ((dias as number) <= 7) estado = 'semana'
  else estado = 'aldia'
  return { cadencia: cad, ultimo: s.ultimo_contacto || null, proximo, estado, dias, notas }
}

/** paraContactar (13312). */
export function paraContactar(c: ClienteCRM): boolean {
  return c.seg_estado === 'vencido' || c.seg_estado === 'pendiente'
}

// ── Agregado (RFM) ───────────────────────────────────────────────────────────

export type EntradaAgregado = {
  ventas: FilaVenta[]
  clientes: Record<string | number, FilaCliente>
  crmSeg: MapaSeguimiento
  crmTelOverride: MapaTelefonos
  today: Date
}

/** calcularAgregadoCRM (13576). Ver el comentario de `Agregado` sobre los descartados. */
export function calcularAgregado({ ventas, clientes, crmSeg, crmTelOverride, today }: EntradaAgregado): Agregado {
  type Acum = { id: number; ventas: FilaVenta[]; first_sale: string | null; last_sale: string | null; total_sales: number; total_amount: number }
  const map = new Map<number, Acum>()

  for (const v of ventas) {
    if (!v.client_id) continue
    const id = v.client_id
    if (!map.has(id)) {
      map.set(id, { id, ventas: [], first_sale: null, last_sale: null, total_sales: 0, total_amount: 0 })
    }
    const e = map.get(id) as Acum
    e.ventas.push(v)
    e.total_sales += 1
    e.total_amount += num(v.total_price)
    const d = v.date_sale
    if (d) {
      if (!e.first_sale || d < e.first_sale) e.first_sale = d
      if (!e.last_sale || d > e.last_sale) e.last_sale = d
    }
  }

  const result: ClienteCRM[] = []
  for (const e of map.values()) {
    const cliente = clientes[e.id] || ({} as FilaCliente)
    const dias = diasDesde(e.last_sale, today)
    const diasFirst = diasDesde(e.first_sale, today)
    const avg = e.total_sales > 0 ? e.total_amount / e.total_sales : 0
    const seg = estadoSeguimiento(e.id, crmSeg, today)
    result.push({
      id: e.id,
      name: cliente.name || 'Cliente #' + e.id,
      email: cliente.email || '',
      phone: cliente.phone || crmTelOverride[String(e.id)] || '',
      city: cliente.city || '',
      province: cliente.province || '',
      first_sale: e.first_sale,
      last_sale: e.last_sale,
      dias_ultimo: dias,
      dias_primero: diasFirst,
      total_sales: e.total_sales,
      total_amount: e.total_amount,
      avg_ticket: avg,
      ventas: e.ventas,
      cadencia: seg.cadencia,
      ultimo_contacto: seg.ultimo,
      proximo_contacto: seg.proximo,
      seg_estado: seg.estado,
      dias_proximo: seg.dias,
      notas: seg.notas,
    })
  }

  // Los "ya no se dedica" quedan fuera de KPIs/segmentos/recontacto y solo se ven
  // con "Ver descartados".
  return {
    activos: result.filter((c) => !esDescartado(c.id, crmSeg)),
    descartados: result.filter((c) => esDescartado(c.id, crmSeg)),
  }
}

/** segmentoCliente (13638). El orden de los ifs ES la lógica: gana el primero. */
export function segmentoCliente(c: ClienteCRM): Segmento {
  if (c.dias_primero !== null && c.dias_primero <= NUEVO_DAYS) return 'nuevos'
  if (c.dias_ultimo !== null && c.dias_ultimo > DORMIDO_DAYS) return 'dormidos'
  if (c.total_sales >= 2 && c.dias_ultimo !== null && c.dias_ultimo >= RIESGO_MIN_DAYS && c.dias_ultimo <= RIESGO_MAX_DAYS) return 'riesgo'
  if (c.total_sales >= ACTIVO_MIN_PED && c.dias_ultimo !== null && c.dias_ultimo < RIESGO_MIN_DAYS) return 'activos'
  return 'otros'
}

/** Los contadores de las tarjetas de segmento (dentro de renderCRM, 13654-13663). */
export function contarKpis(agregado: ClienteCRM[]): Kpis {
  const counts: Kpis = { top: Math.min(TOP_LIMIT, agregado.length), activos: 0, riesgo: 0, dormidos: 0, nuevos: 0, sinTel: 0, contactar: 0 }
  for (const c of agregado) {
    const seg = segmentoCliente(c)
    if (seg === 'activos') counts.activos++
    else if (seg === 'riesgo') counts.riesgo++
    else if (seg === 'dormidos') counts.dormidos++
    else if (seg === 'nuevos') counts.nuevos++
    if (!normalizeArgPhone(c.phone)) counts.sinTel++
    if (paraContactar(c)) counts.contactar++
  }
  return counts
}

// ── Filtro + orden de la tabla ───────────────────────────────────────────────

export type OpcionesTabla = {
  /** Texto del buscador, ya en minúsculas y trimmeado. */
  q: string
  /** El valor del select de segmento, o 'todos'. */
  seg: string
  sort: { col: string; dir: number }
}

/** renderCRMTabla (13695-13744), sin el DOM: la parte que decide QUÉ filas y en qué orden. */
export function filtrarOrdenar(lista: ClienteCRM[], { q, seg, sort }: OpcionesTabla): ClienteCRM[] {
  let out = lista.slice()

  if (seg === 'top') {
    out.sort((a, b) => b.total_amount - a.total_amount)
    out = out.slice(0, TOP_LIMIT)
  } else if (seg === 'sin-tel') {
    out = out.filter((c) => !normalizeArgPhone(c.phone))
  } else if (seg === 'contactar') {
    // Vencidos + pendientes + los de esta semana. Más urgentes primero.
    out = out.filter((c) => c.seg_estado === 'vencido' || c.seg_estado === 'pendiente' || c.seg_estado === 'semana')
    const ord: Record<string, number> = { vencido: 0, pendiente: 1, semana: 2 }
    out.sort((a, b) => ord[a.seg_estado] - ord[b.seg_estado] || (a.dias_proximo ?? 0) - (b.dias_proximo ?? 0))
  } else if (seg !== 'todos') {
    out = out.filter((c) => segmentoCliente(c) === seg)
  }

  if (q) {
    out = out.filter(
      (c) =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q),
    )
  }

  // "Para contactar" trae su propio orden por urgencia; no se pisa.
  if (seg !== 'contactar') {
    const { col, dir } = sort
    out.sort((a, b) => {
      let av: string | number, bv: string | number
      if (col === 'name') { av = (a.name || '').toLowerCase(); bv = (b.name || '').toLowerCase() }
      else if (col === 'contact') { av = (a.email || a.phone || '').toLowerCase(); bv = (b.email || b.phone || '').toLowerCase() }
      else if (col === 'city') { av = (a.city || '').toLowerCase(); bv = (b.city || '').toLowerCase() }
      else if (col === 'last_sale') { av = a.last_sale || ''; bv = b.last_sale || '' }
      else if (col === 'proximo') {
        // Sin cadencia van al final; entre los que tienen, por fecha de próximo contacto.
        av = a.proximo_contacto || (a.seg_estado === 'pendiente' ? '0000-00-00' : '9999-12-31')
        bv = b.proximo_contacto || (b.seg_estado === 'pendiente' ? '0000-00-00' : '9999-12-31')
        if (a.seg_estado === 'none') av = '~'
        if (b.seg_estado === 'none') bv = '~'
      } else {
        av = (a as unknown as Record<string, number>)[col] || 0
        bv = (b as unknown as Record<string, number>)[col] || 0
      }
      if (av < bv) return -dir
      if (av > bv) return dir
      return 0
    })
  }

  return out
}

// ── Resumen de compras del modal ─────────────────────────────────────────────

/**
 * renderResumenCompras (13826), sin el HTML.
 *
 * "Última compra" = la venta con `date_sale` más reciente **que tenga detalle**:
 * no es la última venta del cliente, es la última de la que sabemos qué llevó.
 */
export function resumenCompras(ventasDelCliente: FilaVenta[], det: FilaDetalle[]): ResumenCompras {
  if (!det || !det.length) return { ultima: null, top: [] }

  const fechaPorVenta: Record<string, string> = {}
  ;(ventasDelCliente || []).forEach((v) => { fechaPorVenta[String(v.id)] = v.date_sale || '' })

  let lastSid: string | null = null
  let lastFecha = ''
  det.forEach((d) => {
    const f = fechaPorVenta[String(d.sale_id)] || ''
    if (f && (!lastFecha || f > lastFecha)) { lastFecha = f; lastSid = String(d.sale_id) }
  })
  const itemsUltima = lastSid ? det.filter((d) => String(d.sale_id) === lastSid) : []

  // Lo que más compró, agregado por product_name
  type Acum = { name: string; unidades: number; ventas: Set<string>; ultFecha: string; ultPrecio: number }
  const agg = new Map<string, Acum>()
  det.forEach((d) => {
    const name = d.product_name || '—'
    const f = fechaPorVenta[String(d.sale_id)] || ''
    if (!agg.has(name)) agg.set(name, { name, unidades: 0, ventas: new Set(), ultFecha: '', ultPrecio: 0 })
    const a = agg.get(name) as Acum
    a.unidades += d.quantity || 0
    a.ventas.add(String(d.sale_id))
    if (f && (!a.ultFecha || f > a.ultFecha)) { a.ultFecha = f; a.ultPrecio = num(d.unit_price) }
  })

  return {
    ultima: itemsUltima.length ? { fecha: lastFecha, items: itemsUltima } : null,
    top: [...agg.values()]
      .sort((a, b) => b.unidades - a.unidades)
      .slice(0, 8)
      .map((a) => ({ name: a.name, unidades: a.unidades, veces: a.ventas.size, ultPrecio: a.ultPrecio })),
  }
}
