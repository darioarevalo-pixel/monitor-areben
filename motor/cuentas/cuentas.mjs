/**
 * Las CUENTAS REALES (sql/019): la copia de las del dashboard, la RUTA que elige gerencia y la regla de facturar.
 * Núcleo puro (⛔ base): `bin/cuentas.mjs` lee y escribe. Diseño: `~/Documents/erp-monitor/cuentas-cobro.md`.
 */

export const MEDIOS = ['efectivo', 'transferencia', 'debito', 'credito', 'mp', 'pagonube', 'saldo']

/**
 * El MEDIO del ERP de una cuenta de cobro de GN (`cuenta_cobro`). GN pone MP y Pago Nube los dos en «otro» ⇒ ahí manda el
 * nombre (sql/020: Pago Nube tiene su comisión y su acreditación). null = ⛔ se sabe (el cobro queda sin medio).
 * @param {{ medio: string, nombre?: string }} c
 */
export function medioDeCuenta(c) {
  if (MEDIOS.includes(c.medio)) return c.medio
  // La «Cuenta corriente» (sql/025): ⛔ es plata que entra ⇒ ⛔ lleva ruta ni cuenta real (⛔ va en MEDIOS de las rutas).
  if (c.medio === 'cuenta') return 'cuenta'
  // «Contraentrega» (sql/032): tampoco ⇒ la plata entra al cerrarla, con su propio medio.
  if (c.medio === 'entrega') return 'entrega'
  if (c.medio !== 'otro') return null
  const nombre = String(c.nombre ?? '')
  if (/pago ?nube/i.test(nombre)) return 'pagonube'
  if (/mercado ?pago/i.test(nombre)) return 'mp'
  return null
}

/**
 * El titular del ERP de un titular del dashboard (`cuentas_titulares`). Uno que ⛔ se reconoce FRENA: un titular
 * mal puesto decide si se factura.
 * @param {{ nombre: string, tipo: string }} t
 */
export function titularDe(t) {
  const nombre = String(t.nombre ?? '').trim().toLowerCase()
  if (t.tipo === 'EMPRESA' && /^areben/.test(nombre)) return 'areben'
  if (t.tipo === 'SOCIO' && /^bruno\b/.test(nombre)) return 'bruno'
  if (t.tipo === 'SOCIO' && /^dar[ií]o\b/.test(nombre)) return 'dario'
  throw new Error(`titular del dashboard desconocido: ${t.nombre} (${t.tipo})`)
}

/**
 * El tipo del ERP de una cuenta del dashboard (`cuentas_bancarias.tipo`), o null si ⛔ es una cuenta donde se cobra:
 * «Mayoristas» CTA_CORRIENTE es la cuenta corriente de los clientes, ⛔ un lugar donde cae plata.
 * «Pendiente de Acreditación» (ML, Payway) cobra y acredita después ⇒ tránsito.
 */
export function tipoDe(b) {
  if (b.tipo === 'CTA_CORRIENTE') return null
  if (/pendiente de acreditaci/i.test(String(b.nombre ?? ''))) return 'transito'
  const tipo = { CAJA: 'caja', BANCO: 'banco', BILLETERA: 'billetera' }[b.tipo]
  if (!tipo) throw new Error(`tipo de cuenta del dashboard desconocido: ${b.tipo} (${b.banco} ${b.nombre})`)
  return tipo
}

/**
 * Las filas de `cuenta_real` que salen del dashboard. Las inactivas se copian igual (`activa` false): un cobro viejo
 * puede apuntarles.
 * @param {{ empresa: string, titulares: any[], bancarias: any[], acreedores: any[] }} p
 *   bancarias: `cuentas_bancarias` · acreedores: `acreedor_cuentas` + `proveedor_nombre`
 */
export function cuentasDelDashboard({ empresa, titulares, bancarias, acreedores }) {
  const titular = new Map(titulares.map((t) => [t.id, t]))
  const filas = []
  for (const b of bancarias) {
    const tipo = tipoDe(b)
    if (!tipo) continue
    const t = titular.get(b.titular_id)
    if (!t) throw new Error(`la cuenta ${b.id} apunta a un titular que no está: ${b.titular_id}`)
    filas.push({
      id: b.id, empresa_id: empresa, origen: 'dashboard', titular: titularDe(t), proveedor_id: null,
      nombre: String(b.nombre).trim(), banco: b.banco ? String(b.banco).trim() : null, tipo, activa: b.activo === true,
    })
  }
  for (const a of acreedores) {
    filas.push({
      id: a.id, empresa_id: empresa, origen: 'acreedor', titular: 'tercero', proveedor_id: a.proveedor_id,
      nombre: String(a.proveedor_nombre ?? a.titular ?? 'Tercero').trim(), banco: a.banco ? String(a.banco).trim() : null,
      tipo: 'billetera', activa: a.activa === true,
    })
  }
  return filas.sort((x, y) => (x.id < y.id ? -1 : 1))
}

const CAMPOS = ['origen', 'titular', 'proveedor_id', 'nombre', 'banco', 'tipo', 'activa']

/**
 * Qué cambia en `cuenta_real`. La que el dashboard ya ⛔ trae se DESACTIVA, ⛔ se borra (los cobros la referencian).
 * 🔴 Una cuenta que cambia de TITULAR frena: cambiaría si se facturó lo ya cobrado (el pasado ⛔ se reescribe).
 * @returns {{ nuevas: any[], cambian: any[], desactivar: string[], iguales: number }}
 */
export function planCopia(delDashboard, existentes) {
  const ya = new Map(existentes.map((e) => [e.id, e]))
  const vistas = new Set()
  const nuevas = [], cambian = []
  let iguales = 0
  for (const f of delDashboard) {
    vistas.add(f.id)
    const e = ya.get(f.id)
    if (!e) { nuevas.push(f); continue }
    if (e.titular !== f.titular) throw new Error(`la cuenta ${f.banco ?? ''} ${f.nombre} (${f.id}) cambió de titular: ${e.titular} → ${f.titular}`)
    if (CAMPOS.some((c) => (e[c] ?? null) !== (f[c] ?? null))) cambian.push(f)
    else iguales++
  }
  const desactivar = existentes.filter((e) => e.activa && !vistas.has(e.id)).map((e) => e.id).sort()
  return { nuevas, cambian, desactivar, iguales }
}

/**
 * La ruta VIGENTE para un cobro: la de mayor `desde` que ya empezó. null = ⛔ hay ruta (el cobro ⛔ sabe adónde va).
 * Una ruta con `cuenta_real_id` null dice «se elige en cada cobro».
 * @param {Array<{ marca: string, canal: string, medio: string, desde: Date|string, cuenta_real_id: string|null }>} rutas
 * @param {{ marca: string, canal: string, medio: string, en: Date|string }} cobro
 */
export function rutaVigente(rutas, { marca, canal, medio, en }) {
  const t = new Date(en).getTime()
  let mejor = null
  for (const r of rutas) {
    if (r.marca !== marca || r.canal !== canal || r.medio !== medio) continue
    const d = new Date(r.desde).getTime()
    if (d <= t && (!mejor || d > new Date(mejor.desde).getTime())) mejor = r
  }
  return mejor
}

/**
 * Bruno (17-oct): se factura SÓLO si el titular es Areben Y el medio ⛔ es efectivo (el efectivo es de Areben, pero la
 * forma de pago excluye la factura). Lo demás va al pendiente a facturar.
 */
export const esFacturable = ({ titular, medio }) => titular === 'areben' && medio !== 'efectivo'

/** Pesos con 2 decimales. */
const centavos = (x) => Math.round(x * 100) / 100

/**
 * Lo que la 020 le agrega a un cobro: su MEDIO, su CUENTA REAL (la de la ruta vigente a la hora del cobro) y lo que se
 * queda el procesador. Sin ruta ⇒ cuenta en BLANCO (⛔ se inventa). Una ruta «se elige en cada cobro» (cuenta null) toma
 * la que trae el pago (`elegida`); si la ruta YA dice la cuenta, el pago ⛔ la cambia (la decide gerencia, ⛔ la Caja).
 * @param {{ monto: number, elegida?: string|null }} pago
 * @param {{ medio: string, nombre?: string }} cuenta  la `cuenta_cobro` del pago
 * @param {{ marca: string, canal: string, en: Date|string }} venta
 * @param {{ rutas: any[], cuentasReales: Array<{ id: string, activa: boolean }> }} conf
 * @returns {{ ok: true, cobro: { medio: string|null, cuenta_real_id: string|null, comision: number|null, acredita_el: string|null } }
 *   | { ok: false, codigo: string, mensaje: string }}
 */
export function cobroReal(pago, cuenta, venta, conf) {
  const medio = medioDeCuenta(cuenta)
  const ruta = medio ? rutaVigente(conf.rutas ?? [], { marca: venta.marca, canal: venta.canal, medio, en: venta.en }) : null
  const elegida = pago.elegida ?? null
  if (elegida != null) {
    if (!ruta || ruta.cuenta_real_id != null) {
      return { ok: false, codigo: 'CUENTA_REAL_NO_SE_ELIGE', mensaje: `La cuenta de ${medio ?? 'este cobro'} la pone la ruta de gerencia, no el cobro` }
    }
    const c = (conf.cuentasReales ?? []).find((x) => x.id === elegida)
    if (!c || !c.activa) return { ok: false, codigo: 'CUENTA_REAL_DESCONOCIDA', mensaje: `La cuenta ${elegida} no está o está inactiva` }
  }
  const cuenta_real_id = ruta ? ruta.cuenta_real_id ?? elegida : null
  const tasa = ruta && ruta.tasa != null ? Number(ruta.tasa) : null
  const comision = tasa != null && pago.monto > 0 ? centavos(pago.monto * tasa / 100) : null
  let acredita_el = null
  if (ruta && ruta.dias_acreditacion != null) {
    // El día del cobro en Argentina (UTC−3, sin horario de verano) + el plazo.
    const dia = new Date(new Date(venta.en).getTime() - 3 * 3600e3)
    dia.setUTCDate(dia.getUTCDate() + Number(ruta.dias_acreditacion))
    acredita_el = dia.toISOString().slice(0, 10)
  }
  return { ok: true, cobro: { medio, cuenta_real_id, comision, acredita_el } }
}
