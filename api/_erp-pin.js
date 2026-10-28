/**
 * El PIN de la ENCARGADA, por persona y por marca (motor sql/051; Bruno 26-oct: 4 dígitos, 5 fallos ⇒ 15 min de bloqueo, lo fija sólo Admin).
 * Cada marca guarda sus PINs en SU base (como los roles): el Admin lo fija en la marca donde esa persona autoriza.
 *
 *   GET  ?recurso=erp&vista=pines&marca=bdi                      quién tiene PIN, quién lo puso y si está bloqueado (sólo Admin) · ⛔ nunca el hash
 *   POST {recurso:'erp', accion:'poner-pin', marca, persona, pin}   fija o cambia (y desbloquea) · sólo Admin
 *   POST {recurso:'erp', accion:'quitar-pin', marca, persona}       sólo Admin
 *   POST {recurso:'erp', accion:'verificar-pin', marca, persona, pin}   `{ ok: true, persona }` · permiso `autorizar-pin` (Local + Admin, configurable)
 *
 * `persona` = el usuario del monitor de la encargada (minúsculas). `autorizarConPin` es lo que usa la venta de la Caja (paso 3): arma
 * `autoriza: { usuario, motivo: 'pin_encargada' }` ACÁ, en el servidor; ⛔ se acepta un `autoriza` que venga armado del navegador.
 * 🔴 Si la base no responde o la tabla no está, la respuesta lo DICE (409/503); ⛔ se toma por «PIN incorrecto» ni se deja pasar.
 */
const importar = () => import('../motor/stock/pin.mjs')
const MARCAS = ['bdi', 'zattia']
const sinTabla = { status: 409, error: 'Los PINs todavía no están en la base del motor (migración 051).' }

function entrada(body, { conPin }) {
  const marca = String(body?.marca || '')
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const persona = String(body?.persona ?? '').trim().toLowerCase()
  if (!persona || persona.length > 100) return { status: 400, error: 'Falta de quién es el PIN' }
  if (conPin && typeof body?.pin !== 'string') return { status: 400, error: 'Falta el PIN' }
  return { marca, persona, pin: conPin ? body.pin : undefined }
}

const deMotor = (r) => (r?.error ? { status: r.error.codigo === 'PIN_INCORRECTO' || r.error.codigo === 'BLOQUEADO' ? 403 : 400, error: r.error.mensaje, codigo: r.error.codigo, hasta: r.error.hasta, quedan: r.error.quedan } : null)

async function conTabla(marca, que, conMotor, fn) {
  try {
    return await conMotor(marca, que, fn)
  } catch (err) {
    if (err?.code === '42P01') return sinTabla
    throw err
  }
}

export async function pinesErp({ marca }, { conMotor }) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const { pinesDe } = await importar()
  const r = await conTabla(marca, 'Los PINs', conMotor, (db) => pinesDe(db))
  return r?.status ? r : { marca, pines: r }
}

/**
 * La lista de «Autoriza la encargada» del POS: quien cobra en la caja de esa marca y tiene PIN (`encargadasDeMarca`).
 * Permiso `autorizar-pin` (la cajera la lee; `vista=pines` sigue siendo de Admin). Sin padrón ⇒ `encargadas: null`.
 */
export async function encargadasErp({ marca }, { conMotor, padron }) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const { pinesDe } = await importar()
  const r = await conTabla(marca, 'Los PINs', conMotor, (db) => pinesDe(db))
  if (r?.status) return r
  const usuarios = await padron()
  if (!usuarios) return { marca, encargadas: null }
  const { encargadasDeMarca } = await import('../lib/erp/encargadas.core.js')
  return { marca, encargadas: encargadasDeMarca({ usuarios, conPin: r.map((p) => p.usuario), marca }) }
}

export async function ponerPinErp({ body, usuario }, { conMotor }) {
  const e = entrada(body, { conPin: true })
  if (e.status) return e
  const { ponerPin } = await importar()
  const r = await conTabla(e.marca, 'Los PINs', conMotor, (db) => ponerPin(db, { usuario: e.persona, pin: e.pin, por: usuario }))
  return r?.status ? r : deMotor(r) || { ok: true, marca: e.marca, persona: e.persona }
}

export async function quitarPinErp({ body }, { conMotor }) {
  const e = entrada(body, { conPin: false })
  if (e.status) return e
  const { quitarPin } = await importar()
  const r = await conTabla(e.marca, 'Los PINs', conMotor, (db) => quitarPin(db, { usuario: e.persona }))
  return r?.status ? r : { ok: true, marca: e.marca, persona: e.persona }
}

export async function verificarPinErp({ body }, { conMotor }) {
  const e = entrada(body, { conPin: true })
  if (e.status) return e
  const { verificarPin } = await importar()
  const r = await conTabla(e.marca, 'Los PINs', conMotor, (db) => verificarPin(db, { usuario: e.persona, pin: e.pin }))
  return r?.status ? r : deMotor(r) || { ok: true, marca: e.marca, persona: r.usuario }
}

/** Para la venta: `{ autoriza }` listo para `registrarVenta`, o el error (con `status`) que la pantalla muestra. */
export async function autorizarConPin({ marca, persona, pin }, { conMotor }) {
  const r = await verificarPinErp({ body: { marca, persona, pin } }, { conMotor })
  return r.ok ? { autoriza: { usuario: r.persona, motivo: 'pin_encargada' } } : r
}
