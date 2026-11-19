/**
 * ERP › Stock › ficha de una prenda › «Movimientos» (Darío 18-nov, propuesta https://claude.ai/artifact/S7rgTeqyFmvhhR8a2k4qpb):
 * el historial como TABLA, como en el sistema anterior — Fecha · Movimiento · Entrada · Salida · Saldo · Descripción —,
 * por depósito o todos juntos, con filtro por tipo. Puro: el servidor (`api/_erp.js` › `historialDePrenda`) lee el libro y
 * los cruces (venta, venta de GN, ajuste) y esto arma los renglones.
 *
 * 🔑 La regla de Darío: **un renglón por cada vez que la prenda entra o sale de verdad**. Lo que el sistema acomoda por
 *    dentro no se muestra:
 *    · el pedido de Tienda Nube (su venta + el armado + el «desarme» de cuando cambió la regla el 16-nov) es UN renglón
 *      «Venta», con lo que salió neto y la fecha del último paso. Si ese neto da 0 (se canceló antes de salir), no hay renglón.
 *    · el pedido que se DESARMÓ de verdad (cancelado o devuelto después de armarse) sí es su renglón: «vuelve al depósito».
 *    · las correcciones de una venta que se anulan entre sí no se ven; si no dan 0, son «Ajuste de venta» (o «Anulación» si
 *      deshacen la venta entera).
 * 🔑 El saldo es lo que quedó en ESE depósito (o en todos, en «Todos») después del movimiento: mismo orden que el libro.
 */
import { NOMBRE_DEPOSITO, NOMBRE_TIPO } from './stock.core.js'

/** Los tipos de renglón: nombre y grupo del filtro. El color lo pone la pantalla. */
export const TIPOS = {
  compra: ['Compra', 'compras'],
  venta: ['Venta', 'ventas'],
  cambio: ['Cambio', 'ventas'],
  anulada: ['Anulación', 'ventas'],
  cancelado: ['Pedido cancelado', 'ventas'],
  transf: ['Transferencia', 'transf'],
  ajuste: ['Ajuste', 'ajustes'],
  ajusteventa: ['Ajuste de venta', 'ajustes'],
  salida: ['Salida', 'ajustes'],
  inicial: ['Stock inicial', 'otros'],
  otro: ['Otro', 'otros'],
}

/** Los filtros de arriba, en orden. */
export const FILTROS = [['todo', 'Todo'], ['ventas', 'Ventas'], ['compras', 'Compras'], ['ajustes', 'Ajustes'], ['transf', 'Transferencias'], ['otros', 'Otros']]

/** El «desarme» que escribió el cambio de regla del 16-nov (el pedido todavía no se había preparado): ⛔ es un movimiento real. */
const CAMBIO_DE_REGLA = ['sin', 'armar'].join(' ')
const MOTIVO = { fallado: 'Con falla', canje: 'Canje', regalo: 'Regalo', otro: 'Otro', conteo: 'Conteo' }
const PROPOSITO = { canje: 'Canje', falla: 'Con falla', fotos: 'Fotos', regalo: 'Regalo' }
const CANAL = { online: 'Tienda online', 'Tienda Nube': 'Tienda online', local: 'Local', 'Mi Local': 'Local', mayorista: 'Mayorista', Mayorista: 'Mayorista', ml: 'Mercado Libre', 'Mercado Libre': 'Mercado Libre' }

const canalDe = (c) => (c == null || c === '' || c === 'Ninguno' ? null : CANAL[c] ?? String(c))
const depNombre = (d) => NOMBRE_DEPOSITO[d] ?? d
const base = (ref) => String(ref ?? '').split('#')[0]
const primero = (ref) => String(ref ?? '').split(':')[0]
const juntar = (...xs) => xs.filter((x) => x != null && String(x).trim() !== '').map((x) => String(x).trim()).join(' · ')
// En hora de Argentina (UTC−3, sin horario de verano).
const diaMes = (iso) => { const d = new Date(Date.parse(iso) - 3 * 3_600_000); return Number.isNaN(d.getTime()) ? '' : `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}` }

/**
 * @param {{ movimientos: any[], ventasGn?: Map<string, any>, ventas?: Map<string, any>, ventasCaja?: Map<string, any>, ventasTn?: Map<string, any>, ajustes?: Map<string, any> }} p
 *   `movimientos`: las filas del libro de la prenda · `ventasGn`: id de GN → { number, client_name, channel } ·
 *   `ventas`: id de la venta del ERP → { numero, origen, origen_ref, canal, usuario, cliente } · `ventasCaja`: id de la caja →
 *   lo mismo · `ventasTn`: tn_id → lo mismo · `ajustes`: id → { numero, motivo, detalle, creado_por }
 * @returns {{ filas: any[], depositos: Array<{ deposito: string, nombre: string, saldo: number, movimientos: number }>, total: number }}
 */
export function armarHistorial({ movimientos, ventasGn = new Map(), ventas = new Map(), ventasCaja = new Map(), ventasTn = new Map(), ajustes = new Map() }) {
  const orden = [...movimientos].sort((a, b) => Date.parse(a.ocurrido_en) - Date.parse(b.ocurrido_en) || Number(a.id) - Number(b.id))
  const saldo = new Map()
  let total = 0
  const cuenta = new Map()
  // Las patas de cada transferencia (para decir «desde» o «a» qué depósito).
  const patas = new Map()
  for (const m of orden) {
    const s = (saldo.get(m.deposito) ?? 0) + Number(m.cantidad)
    saldo.set(m.deposito, s)
    total += Number(m.cantidad)
    m._saldo = s
    m._total = total
    cuenta.set(m.deposito, (cuenta.get(m.deposito) ?? 0) + 1)
    const t = claveTransf(m)
    if (t) { if (!patas.has(t)) patas.set(t, new Set()); patas.get(t).add(m.deposito) }
  }

  const ventaDe = (m) => {
    if (m.origen === 'caja') return ventasCaja.get(String(m.detalle?.caja ?? '')) ?? null
    if (m.origen === 'motor') return ventas.get(primero(m.origen_ref)) ?? null
    return null
  }
  const tnDe = (m) => {
    if (m.tipo === 'armado' || m.tipo === 'desarme') return m.detalle?.tn?.tn_id != null ? String(m.detalle.tn.tn_id) : null
    const v = ventaDe(m)
    return v?.origen === 'tn' ? String(v.origen_ref ?? '').split(':')[1] ?? null : null
  }

  /** Renglones sueltos y grupos (pedido de TN, correcciones de una venta), en orden de aparición. */
  const items = []
  const grupos = new Map()
  const aGrupo = (clave, m, tipoGrupo) => {
    if (!grupos.has(clave)) { const g = { grupo: tipoGrupo, movs: [] }; grupos.set(clave, g); items.push(g) }
    grupos.get(clave).movs.push(m)
  }
  const ventaGnPorBase = new Map()
  for (const m of orden) if (m.origen === 'gn' && m.tipo === 'venta') ventaGnPorBase.set(base(m.origen_ref), m)

  for (const m of orden) {
    const tn = tnDe(m)
    const realDesarme = m.tipo === 'desarme' && m.detalle?.motivo !== CAMBIO_DE_REGLA
    if (tn && !realDesarme && ['venta', 'anulacion', 'correccion', 'armado', 'desarme'].includes(m.tipo)) { aGrupo(`tn:${tn}:${m.deposito}`, m, 'tn'); continue }
    if (m.origen === 'gn' && (m.tipo === 'correccion' || m.tipo === 'anulacion')) { aGrupo(`gn:${base(m.origen_ref)}`, m, 'corr'); continue }
    if (m.origen === 'motor' && m.tipo === 'correccion') { aGrupo(`mc:${primero(m.origen_ref)}:${m.deposito}`, m, 'corr'); continue }
    items.push({ suelto: m })
  }

  const filas = []
  for (const it of items) {
    if (it.suelto) { filas.push(fila(it.suelto, renglonDe(it.suelto))); continue }
    const neto = it.movs.reduce((a, m) => a + Number(m.cantidad), 0)
    if (neto === 0) continue
    const ultimo = it.movs[it.movs.length - 1]
    if (it.grupo === 'tn') {
      const tnId = tnDe(ultimo)
      const v = ventasTn.get(tnId) ?? it.movs.map(ventaDe).find(Boolean) ?? null
      const numeroTn = it.movs.map((m) => m.detalle?.tn?.numero).find((x) => x != null)
      filas.push(fila(ultimo, { tipo: neto < 0 ? 'venta' : 'cancelado', ref: v?.numero != null ? `#${v.numero}` : numeroTn != null ? `Tienda Nube ${numeroTn}` : '',
        desc: juntar(v?.cliente, v?.numero != null && numeroTn != null ? `Tienda Nube ${numeroTn}` : 'Tienda online') }, neto))
      continue
    }
    // Correcciones de una venta: si deshacen la venta entera, es una anulación; si no, un ajuste de esa venta.
    const v = ultimo.origen === 'gn' ? ventaGnPorBase.get(base(ultimo.origen_ref)) : null
    const gn = ventasGn.get(primero(ultimo.origen_ref))
    const vm = ultimo.origen === 'motor' ? ventaDe(ultimo) : null
    const numero = gn?.number ?? vm?.numero ?? null
    const entera = v && neto === -Number(v.cantidad)
    filas.push(fila(ultimo, { tipo: entera ? 'anulada' : 'ajusteventa', ref: numero != null ? `#${numero}` : '',
      desc: entera ? 'Venta anulada' : neto < 0 ? 'Se agregó a la venta' : 'Se sacó de la venta' }, neto))
  }

  function fila(m, r, cantidad = Number(m.cantidad)) {
    const [nombre, grupo] = TIPOS[r.tipo] ?? TIPOS.otro
    return {
      id: String(m.id), cuando: new Date(m.ocurrido_en).toISOString(), horaExacta: m.hora_exacta !== false,
      deposito: m.deposito, depositoNombre: depNombre(m.deposito),
      tipo: r.tipo, tipoNombre: r.nombre ?? nombre, grupo, ref: r.ref || '', cantidad,
      saldo: m._saldo, saldoTotal: m._total, desc: r.desc || '', quien: r.quien || null,
    }
  }

  function renglonDe(m) {
    const d = m.detalle || {}
    switch (m.tipo) {
      case 'apertura': return { tipo: 'inicial', desc: 'Al pasar a Areben Gestión' }
      case 'reapertura': return { tipo: 'inicial', desc: d.motivo ? `Igualado a Gestión Nube (${d.motivo})` : 'Igualado a Gestión Nube' }
      case 'ingreso': return { tipo: 'compra', ref: d.oc ?? '', desc: 'Ingreso de mercadería' }
      case 'transferencia': {
        if (m.origen === 'gn_foto') return { tipo: 'transf', desc: juntar(m.cantidad > 0 ? `Desde ${depNombre(d.desde)}` : `A ${depNombre(d.hacia)}`, 'Gestión Nube') }
        const t = claveTransf(m)
        const otro = t ? [...(patas.get(t) ?? [])].find((x) => x !== m.deposito) : null
        const n = m.origen === 'repo' ? d.transfer_id : d.transferencia
        return { tipo: 'transf', ref: n != null ? `T-${n}` : '', desc: otro ? `${m.cantidad > 0 ? 'Desde' : 'A'} ${depNombre(otro)}` : (m.origen === 'repo' ? 'Reposición' : '') }
      }
      case 'ajuste': case 'ajuste_conteo': {
        const a = ajustes.get(primero(m.origen_ref))
        const n = a?.numero ?? d.ajuste
        if (m.tipo === 'ajuste_conteo') return { tipo: 'ajuste', ref: d.conteo != null ? `Conteo ${d.conteo}` : '', desc: 'Conteo' }
        return { tipo: 'ajuste', ref: n != null ? `A-${n}` : '', desc: juntar(a?.detalle || MOTIVO[a?.motivo ?? d.motivo], a?.creado_por), quien: a?.creado_por ?? null }
      }
      case 'venta': case 'anulacion': {
        const anul = m.tipo === 'anulacion'
        if (m.origen === 'gn') {
          const g = ventasGn.get(primero(m.origen_ref))
          return { tipo: anul ? 'anulada' : 'venta', ref: g?.number != null ? `#${g.number}` : '', desc: juntar(g?.client_name, canalDe(d.canal ?? g?.channel)) }
        }
        // La venta que se eliminó en Gestión Nube: la copia nocturna la sacó y lo anota en `detalle.purgada`.
        if (d.purgada != null) return { tipo: 'anulada', desc: d.venta_del ? `Venta del ${diaMes(d.venta_del)} eliminada en Gestión Nube` : 'Venta eliminada en Gestión Nube' }
        if (m.origen === 'monitor') {
          const p = PROPOSITO[d.proposito] ?? (d.proposito ? String(d.proposito) : 'Salida')
          return anul ? { tipo: 'salida', nombre: 'Vuelta', desc: p } : { tipo: 'salida', desc: p }
        }
        const v = ventaDe(m)
        const numero = v?.numero ?? d.venta_numero ?? null
        return { tipo: anul ? 'anulada' : 'venta', ref: numero != null ? `#${numero}` : '', desc: juntar(v?.cliente, m.origen === 'caja' ? 'Local' : canalDe(v?.canal), v?.usuario), quien: v?.usuario ?? null }
      }
      case 'cambio_entra': case 'cambio_sale':
        return { tipo: 'cambio', ref: d.venta_numero != null ? `#${d.venta_numero}` : '', desc: m.tipo === 'cambio_entra' ? 'Entra por cambio' : 'Sale por cambio' }
      case 'desarme': {
        const v = ventasTn.get(String(d.tn?.tn_id ?? ''))
        return { tipo: 'cancelado', nombre: d.status === 'cancelled' ? 'Pedido cancelado' : 'Pedido devuelto', ref: d.tn?.numero != null ? `Tienda Nube ${d.tn.numero}` : '', desc: juntar('Vuelve al depósito', v?.cliente) }
      }
      case 'armado': return { tipo: 'venta', ref: d.tn?.numero != null ? `Tienda Nube ${d.tn.numero}` : '', desc: 'Pedido preparado' }
      case 'salida_vuelta': return { tipo: 'salida', desc: PROPOSITO[d.tipo] ?? 'Salida' }
      case 'vuelta': return { tipo: 'salida', nombre: 'Vuelta', desc: `${PROPOSITO[d.tipo] ?? 'Salida'} · vuelve` }
      case 'correccion': return { tipo: 'ajusteventa', desc: '' }
      default: return { tipo: 'otro', nombre: NOMBRE_TIPO[m.tipo] ?? m.tipo }
    }
  }

  const depositos = [...cuenta.keys()].map((d) => ({ deposito: d, nombre: depNombre(d), saldo: saldo.get(d) ?? 0, movimientos: cuenta.get(d) ?? 0 }))
  return { filas: filas.reverse(), depositos, total }
}

/** La transferencia a la que pertenece la pata (las dos patas comparten la clave). */
function claveTransf(m) {
  if (m.tipo !== 'transferencia') return null
  const d = m.detalle || {}
  if (m.origen === 'repo' && d.transfer_id != null) return `repo:${d.transfer_id}`
  if (m.origen === 'transferencia' && d.transferencia != null) return `t:${d.transferencia}`
  return null
}

/**
 * Lo que se ve: el depósito elegido ('todos' = todos juntos, con el saldo total) y el filtro de tipo.
 * @param {any[]} filas @param {{ deposito: string, filtro: string }} o
 */
export function filtrarHistorial(filas, { deposito, filtro }) {
  return filas
    .filter((f) => (deposito === 'todos' || f.deposito === deposito) && (filtro === 'todo' || f.grupo === filtro))
    .map((f) => ({ ...f, saldoVisto: deposito === 'todos' ? f.saldoTotal : f.saldo }))
}

/** El depósito con el que arranca: el que más movimientos tiene (en BDI, casi siempre el Minorista). */
export function depositoInicial(depositos) {
  return [...depositos].sort((a, b) => b.movimientos - a.movimientos)[0]?.deposito ?? 'todos'
}
