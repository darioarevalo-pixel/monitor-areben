/**
 * ERP › Ventas › Cobros › Cheques: la CARTERA de cheques recibidos y lo que le pasa a cada uno (motor `cuenta/cheque.mjs`, sql/079;
 * Bruno 10-nov). SÓLO ADMIN («los cargan los admin, administración no usa cheques»): la vista y las tres acciones van con
 * `configurar` en `lib/permisos.core.js`. Núcleo de la pantalla: `lib/erp/cheque.core.js`.
 *
 *   GET  ?recurso=erp&vista=cheques&marca=bdi|zattia&linea&prueba=0|1        la cartera + las cuentas donde se puede depositar
 *   POST {recurso:'erp', accion:'cheque-depositar', marca, linea, chequeId, cuentaReal, fecha?}
 *   POST {recurso:'erp', accion:'cheque-acreditar', marca, linea, chequeId, fecha?}
 *   POST {recurso:'erp', accion:'cheque-rechazar',  marca, linea, chequeId, motivo, fecha?}   ⇒ la deuda VUELVE al cliente
 *
 * 🔑 RECIBIR un cheque ⛔ está acá: es «Cobrar» (`cobrar-cuenta` / `cobrar-venta`) con la cuenta «Cheque» y `cheque: {…}`.
 * Una base sin la sql/079 ⇒ 409 con lo que falta (⛔ un 500).
 */
const MARCAS = ['bdi', 'zattia']
const LINEAS = { bdi: ['bdi'], zattia: ['zattia', 'stunned'] }
const UUID = /^[0-9a-f-]{36}$/i
const FECHA = /^\d{4}-\d{2}-\d{2}$/
const SIN_079 = { status: 409, error: 'Los cheques todavía no están en la base del ERP (falta la migración 079).' }
const TIPOS_DEPOSITO = ['banco', 'billetera', 'caja']

const hay079 = async (pg) => (await pg.query(`select to_regclass('public.cheque') is not null as hay`)).rows[0].hay
const errorDe = (e) => ({ status: e?.codigo === 'NO_ENCONTRADO' ? 404 : e?.codigo === 'ENTRADA_INVALIDA' || e?.codigo === 'FALTA_MOTIVO' ? 400 : 409, error: e?.mensaje ?? 'El ERP no pudo registrarlo.' })

/**
 * @param {{ marca: string, linea: string, prueba?: boolean }} p
 * @param {{ conMotor: Function }} deps
 */
export async function carteraDeCheques({ marca, linea, prueba = false }, deps) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  if (!LINEAS[marca].includes(linea)) return { status: 400, error: 'Falta la línea (Zattia o Stunned).' }
  return deps.conMotor(marca, 'Los cheques', async (pg) => {
    if (!(await hay079(pg))) return SIN_079
    const { chequesDe } = await import('../motor/cuenta/cheque.mjs')
    const [m] = (await pg.query('select empresa_id::text from marca where id = $1', [linea])).rows
    if (!m) return { status: 400, error: 'Línea desconocida' }
    const r = await chequesDe(pg, { empresa_id: m.empresa_id, marca: linea, prueba })
    if (!r.ok) return errorDe(r.error)
    const cuentas = (await pg.query(
      `select id::text, titular, nombre, banco, tipo from cuenta_real where empresa_id = $1 and activa and tipo = any($2) order by titular <> 'areben', banco nulls last, nombre`,
      [m.empresa_id, TIPOS_DEPOSITO])).rows
    return { hoy: r.hoy, prueba, cheques: r.cheques, totales: r.totales, cuentasDeposito: cuentas }
  })
}

/**
 * Las tres acciones sobre un cheque de la cartera.
 * @param {{ accion: string, marca: string, body: any, usuario: string }} p
 * @param {{ conMotor: Function, cheque?: any }} deps `cheque` = el módulo del motor (tests)
 */
export async function accionDeCheque({ accion, marca, body, usuario }, deps) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const linea = String(body?.linea || '') || marca
  if (!LINEAS[marca].includes(linea)) return { status: 400, error: 'Falta la línea (Zattia o Stunned).' }
  if (!UUID.test(String(body?.chequeId || ''))) return { status: 400, error: 'Falta el cheque.' }
  if (body?.fecha != null && !FECHA.test(String(body.fecha))) return { status: 400, error: 'Fecha inválida.' }
  if (accion === 'cheque-depositar' && !UUID.test(String(body?.cuentaReal || ''))) return { status: 400, error: 'Elegí en qué cuenta se deposita.' }
  const motivo = String(body?.motivo ?? '').trim()
  if (accion === 'cheque-rechazar' && !motivo) return { status: 400, error: 'Escribí por qué se rechazó.' }
  if (motivo.length > 300) return { status: 400, error: 'El motivo es demasiado largo.' }
  // El día elegido a las 12 de Argentina (⛔ la hora: el banco trabaja por día).
  const ocurrida_en = body?.fecha ? `${body.fecha}T15:00:00.000Z` : undefined
  return deps.conMotor(marca, 'El cheque', async (pg) => {
    if (!(await hay079(pg))) return SIN_079
    const m = deps.cheque || await import('../motor/cuenta/cheque.mjs')
    const [ch] = (await pg.query('select empresa_id::text from cheque where id = $1 and marca = $2', [body.chequeId, linea])).rows
    if (!ch) return { status: 404, error: 'Ese cheque no está en esta línea.' }
    const base = { empresa_id: ch.empresa_id, cheque_id: body.chequeId, usuario, ...(ocurrida_en ? { ocurrida_en } : {}) }
    const r = accion === 'cheque-depositar' ? await m.depositarCheque(pg, { ...base, cuenta_real_id: String(body.cuentaReal) })
      : accion === 'cheque-acreditar' ? await m.acreditarCheque(pg, base)
      : accion === 'cheque-rechazar' ? await m.rechazarCheque(pg, { ...base, motivo })
      : null
    if (!r) return { status: 400, error: 'Acción desconocida' }
    return r.ok ? { ok: true, cheque: r.cheque, ...(r.cuenta != null ? { cuenta: r.cuenta } : {}) } : errorDe(r.error)
  })
}

/**
 * Los datos de un cheque que llegan con «Cobrar»: la forma, sin decidir (lo valida el motor). null = ⛔ vino.
 * @returns {{ cheque: object | null } | { error: string }}
 */
export function chequeDelCobro(body) {
  const c = body?.cheque
  if (c == null) return { cheque: null }
  if (typeof c !== 'object' || Array.isArray(c)) return { error: 'Los datos del cheque no son válidos.' }
  const t = (x, n) => (x == null ? undefined : String(x).slice(0, n))
  return { cheque: { tipo: t(c.tipo, 10), numero: t(c.numero, 40), banco: t(c.banco, 80), librador: t(c.librador, 120), vence_el: t(c.vence_el, 10), ...(c.librador_cuit ? { librador_cuit: t(c.librador_cuit, 20) } : {}), ...(c.emitido_el ? { emitido_el: t(c.emitido_el, 10) } : {}) } }
}
