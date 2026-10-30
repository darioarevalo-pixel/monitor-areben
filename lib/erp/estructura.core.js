/**
 * ERP › Configuración › Cuentas y › Marcas, depósitos y puntos de venta (v8 `Configuracion.dc.html`, tabs `cuentas` y
 * `estructura`): SÓLO LECTURA. Puro: el servidor (`api/_erp-estructura.js`, `vista=estructura`) trae las filas del motor
 * y esto las arma.
 *
 * Cuentas = dónde cae la plata: la copia de las del dashboard (`cuenta_real`). ⛔ el ERP arma otra lista ni guarda saldos
 *   (el saldo está en el dashboard). Lo que suma el ERP es QUÉ RUTAS vigentes de la marca caen en cada una.
 * Estructura = una fila por marca/línea: depósitos, punto de venta y con qué razón social factura.
 */
import { NOMBRE_CANAL, NOMBRE_MARCA } from './venta.core.js'
import { NOMBRE_MEDIO, NOMBRE_TITULAR } from './rutas.core.js'

const normal = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const MARCA = /** @type {Record<string, string>} */ (NOMBRE_MARCA)
const CANAL = /** @type {Record<string, string>} */ (NOMBRE_CANAL)
const MEDIO = /** @type {Record<string, string>} */ (NOMBRE_MEDIO)
const TITULAR = /** @type {Record<string, string>} */ (NOMBRE_TITULAR)

export const NOMBRE_TIPO = { caja: 'Caja', banco: 'Banco', billetera: 'Billetera', transito: 'Tránsito' }
const TIPO = /** @type {Record<string, string>} */ (NOMBRE_TIPO)

/**
 * Cada cuenta con las rutas vigentes de la marca que caen en ella («Zattia · Local · Efectivo»).
 * @param {{ cuentas: any[], rutas: Array<{ marca: string, canal: string, medio: string, cuenta_real_id: string | null }> }} d
 */
export function armarCuentas({ cuentas, rutas }) {
  /** @type {Map<string, string[]>} */
  const recibe = new Map()
  for (const r of rutas ?? []) {
    if (!r.cuenta_real_id) continue
    const t = `${MARCA[r.marca] ?? r.marca} · ${CANAL[r.canal] ?? r.canal} · ${MEDIO[r.medio] ?? r.medio}`
    recibe.set(r.cuenta_real_id, [...(recibe.get(r.cuenta_real_id) ?? []), t])
  }
  return (cuentas ?? []).map((c) => {
    const nombre = `${c.banco ? `${c.banco} · ` : ''}${c.nombre}`
    const titular = TITULAR[c.titular] ?? c.titular ?? '—'
    const tipo = TIPO[c.tipo] ?? c.tipo ?? '—'
    const rutasDe = (recibe.get(c.id) ?? []).sort()
    return {
      id: c.id, nombre, titularClave: c.titular ?? '', titular, tipoClave: c.tipo ?? '', tipo, activa: Boolean(c.activa), recibe: rutasDe,
      busca: normal([nombre, titular, tipo, ...rutasDe].join(' ')),
    }
  })
}

/** @type {Array<[string, string, (f: any) => boolean]>} */
export const VISTAS_CUENTAS = [
  ['activas', 'Activas', (f) => f.activa],
  ['con_ruta', 'Reciben plata', (f) => f.activa && f.recibe.length > 0],
  ['sin_ruta', 'No reciben plata', (f) => f.activa && f.recibe.length === 0],
  ['inactivas', 'Dadas de baja', (f) => !f.activa],
]

/** @param {any[]} filas */
export const contarVistasCuentas = (filas) => Object.fromEntries(VISTAS_CUENTAS.map(([k, , entra]) => [k, filas.filter(entra).length]))

/**
 * @param {any[]} filas @param {{ vista?: string, q?: string, titular?: string, tipo?: string }} o
 */
export function filtrarCuentas(filas, { vista = 'activas', q = '', titular = '', tipo = '' } = {}) {
  const entra = VISTAS_CUENTAS.find(([k]) => k === vista)?.[2] ?? (() => true)
  const t = normal(q).trim()
  return filas.filter((f) => entra(f) && (!titular || f.titularClave === titular) && (!tipo || f.tipoClave === tipo) && (!t || f.busca.includes(t)))
}

/**
 * Una fila por línea (BDI · Zattia · Stunned): depósitos (los que venden primero), punto de venta, razón social y CUIT.
 * @param {{ empresas: any[], marcas: any[], depositos: any[] }} d
 */
export function armarEstructura({ empresas, marcas, depositos }) {
  const empresa = new Map((empresas ?? []).map((e) => [e.id, e]))
  return (marcas ?? []).map((m) => {
    const deps = (depositos ?? []).filter((d) => d.marca === m.id)
    const e = empresa.get(m.empresa_id)
    return {
      id: m.id, nombre: m.nombre ?? MARCA[m.id] ?? m.id, linea: m.id === 'stunned' ? 'línea de Zattia' : null, tienda: m.tienda ?? null,
      depositos: deps.map((d) => ({ id: d.id, nombre: d.nombre, vende: Boolean(d.vende), gn: d.gn_store_id ?? null })),
      puntoVenta: m.punto_venta ?? null, nombreFiscal: m.nombre_fiscal ?? null, domicilio: m.domicilio_fiscal ?? null, inicio: m.inicio_actividades ?? null,
      razonSocial: e?.razon_social ?? null, cuit: e?.cuit ?? null, condicionIva: e?.condicion_iva ?? null, ingresosBrutos: e?.ingresos_brutos ?? null,
    }
  })
}

/** 30718508181 ⇒ 30-71850818-1 */
export const cuitConGuiones = (c) => (/^\d{11}$/.test(String(c ?? '')) ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : (c ?? '—'))
