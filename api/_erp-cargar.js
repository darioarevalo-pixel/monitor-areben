/**
 * ERP › Ventas › Cargar venta (a mano, «Manual»): `registrarVenta` del motor con `origen: 'manual'` (contrato §19, sql/031).
 *
 *   GET  ?recurso=erp&vista=cargar-venta&marca=bdi|zattia          lo que pide el formulario: cuentas de cobro, canales, depósitos
 *   POST { accion: 'cargar-venta', marca, linea, origen_ref, … }   registra la venta
 *
 * 🔴 Hasta el corte va SIEMPRE `prueba: true` (corre en paralelo con GN: ⛔ mueve el libro ni pasa a GN), como la Caja.
 *    Excepción: la línea Stunned con `ERP_STUNNED_PRUEBA=0` (ya vive en el ERP, ⛔ vuelta a GN).
 * 🔑 `origen_ref` lo genera la pantalla al ABRIR el formulario ⇒ reintentar devuelve la misma venta (`ya_existia`).
 * Sin permiso nombrado en `lib/permisos.core.js` ⇒ `configurar` (sólo admin) hasta que Bruno diga quién carga.
 */
import { textoDelMotor } from '../lib/erp/venta.core.js'
import { verificarPinErp } from './_erp-pin.js'
import { cuentasSueltas, formasDePago } from '../lib/erp/formas-pago.core.js'

const MARCAS = ['bdi', 'zattia']
const LINEAS = { bdi: ['bdi'], zattia: ['zattia', 'stunned'] }
const DEPOSITOS = { bdi: ['local', 'deposito_minorista', 'deposito_mayorista'], zattia: ['local', 'deposito'] }
const pesos = (x) => Math.round(Number(x) * 100) / 100
/** Los frenos de la venta A CUENTA que se saltan con el PIN de un admin (motor `frena`): la pantalla pide el PIN recién cuando llega uno. */
export const FRENOS_DE_CUENTA = ['SIN_CREDITO', 'ATRASADO', 'SUPERA_TOPE']

/**
 * @param {{ marca: string }} p
 * @param {{ conMotor: Function, reglasDeCaja?: (linea: string) => Promise<any | null> }} deps  `reglasDeCaja`: `caja_config.reglas` de una línea (las MISMAS del POS)
 * 🔑 `formas` = las formas de pago como las del POS, por línea, cada una con su cuenta de cobro y la RUTA de cada canal (cuenta real y tasa).
 */
export async function datosParaCargar({ marca }, deps) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const reglas = {}
  for (const l of LINEAS[marca]) reglas[l] = deps.reglasDeCaja ? await deps.reglasDeCaja(l).catch(() => null) : null
  return deps.conMotor(marca, 'Cargar venta', async (pg) => {
    const cuentas = (await pg.query(
      `select id::text, nombre, medio, marca, gn_cuenta_id from cuenta_cobro where marca = any($1) and activa and medio <> 'saldo' order by marca, nombre`,
      [LINEAS[marca]])).rows
    const canales = (await pg.query('select id from canal order by id')).rows.map((r) => r.id)
    const [{ ok } = { ok: false }] = (await pg.query(`select pg_get_constraintdef(oid) like '%manual%' as ok from pg_constraint where conname = 'venta_origen_check'`)).rows
    // Las rutas (marca × canal × medio ⇒ cuenta real): sin la tabla, la forma de pago igual se ve, sin su ruta.
    const [{ hay }] = (await pg.query(`select to_regclass('public.ruta_cobro') is not null as hay`)).rows
    const { rutasVigentes } = hay ? await import('../motor/cuentas/rutas.mjs') : { rutasVigentes: null }
    const formas = {}
    const sueltas = {}
    for (const l of LINEAS[marca]) {
      const delaLinea = cuentas.filter((c) => c.marca === l)
      formas[l] = formasDePago({ reglas: reglas[l], cuentas: delaLinea, rutas: rutasVigentes ? await rutasVigentes(pg, { marca: l }) : [], canales })
      sueltas[l] = cuentasSueltas({ formas: formas[l], cuentas: delaLinea }).map(({ id, nombre, medio, marca: m }) => ({ id, nombre, medio, marca: m }))
    }
    return {
      lineas: LINEAS[marca], cuentas: cuentas.map(({ id, nombre, medio, marca: m }) => ({ id, nombre, medio, marca: m })), canales, depositos: DEPOSITOS[marca],
      manualHabilitado: Boolean(ok), formas, sueltas, sinReglas: LINEAS[marca].filter((l) => !reglas[l]?.medios),
    }
  })
}

/**
 * Lo que manda el formulario ⇒ la entrada del motor. Puro (lo prueba `tests/erp-cargar-venta.test.ts`).
 * @param {any} b @param {string} marca @param {string | null} usuario
 * @returns {{ entrada: any } | { error: string }}
 */
export function entradaManual(b, marca, usuario, { stunnedReal = false } = {}) {
  const linea = String(b?.linea || '')
  if (!LINEAS[marca]?.includes(linea)) return { error: 'Línea inválida' }
  if (!/^[0-9a-f-]{36}$/i.test(String(b.origen_ref || ''))) return { error: 'Falta la clave del formulario: volvé a abrirlo.' }
  if (!DEPOSITOS[marca].includes(String(b.deposito || ''))) return { error: 'Elegí de dónde sale.' }
  const prendas = Array.isArray(b.lineas) ? b.lineas : []
  if (!prendas.length) return { error: 'Agregá al menos una prenda.' }
  const lineas = []
  for (const l of prendas) {
    const cantidad = Number(l.cantidad), precio = pesos(l.precio)
    if (!Number.isInteger(cantidad) || cantidad <= 0) return { error: 'Cada prenda lleva una cantidad entera mayor a 0.' }
    if (!(precio >= 0)) return { error: 'Cada prenda lleva un precio.' }
    lineas.push({
      product_id: Number(l.producto), size_id: Number(l.talle), cantidad, precio, descuento: 0, rebaja: 0, importe: pesos(precio * cantidad),
      ...(l.sku ? { sku: String(l.sku) } : {}), ...(l.barcode ? { barcode: String(l.barcode) } : {}),
    })
  }
  const subtotal = pesos(lineas.reduce((a, l) => a + l.importe, 0))
  const pagos = (Array.isArray(b.pagos) ? b.pagos : []).filter((p) => Number(p.monto) > 0)
    .map((p) => ({ cuenta: String(p.cuenta), base: pesos(p.monto), porcentaje: 0, descuento: 0, redondeo: 0, monto: pesos(p.monto) }))
  if (!pagos.length) return { error: 'Falta cómo paga.' }
  if (pesos(pagos.reduce((a, p) => a + p.monto, 0)) !== subtotal) return { error: 'Lo que paga no suma el total.' }
  const doc = String(b.cliente?.doc ?? '').replace(/\D/g, '')
  const nombre = String(b.cliente?.nombre ?? '').trim()
  const cuando = b.ocurrida_en ? new Date(b.ocurrida_en) : null
  if (cuando && Number.isNaN(cuando.getTime())) return { error: 'La fecha no se entiende.' }
  if (cuando && cuando.getTime() > Date.now() + 60_000) return { error: 'La fecha no puede ser futura.' }
  return {
    entrada: {
      origen: 'manual', origen_ref: String(b.origen_ref), marca: linea, canal: String(b.canal || ''), deposito: String(b.deposito),
      ...(doc && nombre ? { cliente: { doc, nombre } } : {}),
      ...(cuando ? { ocurrida_en: cuando.toISOString() } : {}),
      usuario: usuario || 'admin', prueba: !(linea === 'stunned' && stunnedReal), lineas, pagos, subtotal, total: subtotal,
      ...(String(b.nota || '').trim() ? { detalle: { nota: String(b.nota).trim().slice(0, 500) } } : {}),
    },
  }
}

/**
 * @param {{ marca: string, body: any, usuario: string | null, persona?: string | null }} p @param {{ conMotor: Function }} deps
 * 🔑 Una venta A CUENTA frenada (sin crédito, atrasado, pasa el tope) se salta con el PIN de un admin: el navegador manda sólo `pin`, y el
 *    `autoriza` se arma ACÁ con la persona de la SESIÓN (⛔ se acepta uno que venga armado de afuera). El PIN se verifica antes de escribir.
 */
export async function cargarVentaManual({ marca, body, usuario, persona = null }, deps) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  // 🔑 Stunned pasa al ERP (Bruno, 26-oct): con `ERP_STUNNED_PRUEBA=0` SUS ventas son reales (mueven el libro y se facturan). BDI y Zattia siguen en prueba hasta su corte.
  const e = entradaManual(body, marca, usuario, { stunnedReal: process.env.ERP_STUNNED_PRUEBA === '0' })
  if ('error' in e) return { status: 400, error: e.error }
  if (typeof body?.pin === 'string' && body.pin !== '') {
    if (!persona) return { status: 400, error: 'Falta quién autoriza' }
    const v = await verificarPinErp({ body: { marca, persona, pin: body.pin } }, deps)
    if (!v.ok) return { status: v.status || 403, error: v.error || 'PIN incorrecto', ...(v.codigo ? { codigo: v.codigo } : {}) }
    e.entrada.autoriza = { motivo: 'pin_admin', usuario: v.persona }
  }
  return deps.conMotor(marca, 'Cargar venta', async (db, { registrarVenta }) => {
    const r = await registrarVenta(db, e.entrada)
    if (!r.ok) return { status: r.error?.codigo === 'ENTRADA_INVALIDA' ? 400 : 409, error: textoDelMotor(r.error), ...(FRENOS_DE_CUENTA.includes(r.error?.codigo) ? { codigo: r.error.codigo } : {}) }
    return { ok: true, venta: r.venta, yaExistia: r.ya_existia, avisos: r.avisos ?? [] }
  })
}
