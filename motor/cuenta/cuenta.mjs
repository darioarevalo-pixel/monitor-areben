/**
 * La CUENTA CORRIENTE contra la base (paso 8, BDI; sql/025, contrato §15): lo que usan la pantalla (Clientes › Cuenta
 * corriente, de B) y `bin/cuenta.mjs`. La regla es `cuenta.core.mjs`; la venta a cuenta la anota `registrarVenta`.
 *
 * 🔑 La cuenta es la del ERP (Bruno, 18-oct: «no venimos a verificar lo que hacemos, sino a construir algo mejor»): la
 * compra es la parte de una venta propia pagada con «Cuenta corriente», el pago es `registrarPagoACuenta`. Por
 * (cliente, marca, prueba).
 *
 * Devuelven `{ ok: true, … }` o `{ ok: false, error: { codigo, mensaje, campo? } }`, como la venta. Las que escriben
 * abren su transacción (`db` conectado y sin transacción, como `registrarVenta`).
 */
import { estado, frena, mayor, movimientosDeLibro } from './cuenta.core.mjs'
import { creditoDe, cuentaBloqueada, filasDe, hoyAR, insertarFila } from './libro.mjs'
import { cuentaDe as cuentaDeCobro } from '../venta/armar.mjs'
import { leerConf } from '../venta/registrar.mjs'
import { cobroReal } from '../cuentas/cuentas.mjs'

const fallo = (codigo, mensaje, campo) => ({ ok: false, error: campo ? { codigo, mensaje, campo } : { codigo, mensaje } })
const q = async (db, sql, p = []) => (await db.query(sql, p)).rows
const pesos = (x) => Math.round(Number(x) * 100) / 100
const FECHA = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f-]{36}$/i

async function enTransaccion(db, fn) {
  await db.query('begin')
  try {
    const r = await fn()
    await db.query(r && r.ok ? 'commit' : 'rollback')
    return r
  } catch (e) {
    await db.query('rollback').catch(() => {})
    throw e
  }
}

const sinPendientes = ({ pendientes, ...e }) => e
const creditoPublico = (k) => (k ? { credito: k.credito, tope: k.tope, dias: k.dias, puesto_por: k.puesto_por, puesto_en: k.puesto_en } : null)
const saldoDe = async (db, clienteId, marca, prueba) =>
  (await q(db, 'select coalesce(sum(monto), 0)::float as s from cuenta_movimiento where cliente_id = $1 and marca = $2 and prueba = $3', [clienteId, marca, prueba]))[0].s

/**
 * La lista: cada cliente de la marca que debe, tiene a favor, o tiene crédito marcado. Los atrasados primero, después
 * el que más debe.
 * @param {{ empresa_id: string, marca: string, prueba?: boolean, hoy?: string }} e
 */
export async function cuentasCorrientes(db, { empresa_id, marca, prueba = false, hoy = null }) {
  const dia = hoy ?? await hoyAR(db)
  const clientes = await q(db, `select c.id::text, c.nombre, c.doc from cliente c where c.empresa_id = $1 and (
      exists (select 1 from cuenta_movimiento m where m.cliente_id = c.id and m.marca = $2 and m.prueba = $3)
      or exists (select 1 from credito_vigente k where k.cliente_id = c.id and k.credito))`, [empresa_id, marca, prueba])
  const filas = []
  for (const c of clientes) {
    const credito = await creditoDe(db, c.id)
    const e = estado({ movs: movimientosDeLibro(await filasDe(db, { cliente_id: c.id, marca, prueba })), credito, hoy: dia })
    if (e.saldo === 0 && !credito?.credito) continue
    filas.push({ cliente_id: c.id, nombre: c.nombre, doc: c.doc, credito: creditoPublico(credito), ...sinPendientes(e) })
  }
  filas.sort((a, b) => b.vencido - a.vencido || b.debe - a.debe || a.nombre.localeCompare(b.nombre))
  return { ok: true, hoy: dia, cuentas: filas }
}

/**
 * La cuenta de UN cliente: estado, lo que debe compra por compra, y el MAYOR entre `desde` y `hasta` (para exportar:
 * `mayorCSV` del núcleo).
 * @param {{ cliente_id: string, marca: string, prueba?: boolean, hoy?: string, desde?: string, hasta?: string }} e
 */
export async function cuentaDe(db, { cliente_id, marca, prueba = false, hoy = null, desde = null, hasta = null }) {
  if (!UUID.test(String(cliente_id ?? ''))) return fallo('ENTRADA_INVALIDA', 'Falta el cliente', 'cliente_id')
  for (const [k, v] of [['desde', desde], ['hasta', hasta]]) if (v != null && !FECHA.test(v)) return fallo('ENTRADA_INVALIDA', `${k} es una fecha AAAA-MM-DD`, k)
  const [c] = await q(db, 'select id::text, nombre, doc from cliente where id = $1', [cliente_id])
  if (!c) return fallo('NO_ENCONTRADO', 'No está ese cliente', 'cliente_id')
  const dia = hoy ?? await hoyAR(db)
  const credito = await creditoDe(db, c.id)
  const movs = movimientosDeLibro(await filasDe(db, { cliente_id: c.id, marca, prueba }))
  return { ok: true, hoy: dia, cliente: c, credito: creditoPublico(credito), estado: estado({ movs, credito, hoy: dia }), mayor: mayor({ movs, desde, hasta }) }
}

/**
 * Marcar (o sacar) el crédito: tope y plazo opcionales. Quién puede (admin) lo decide la puerta; acá queda QUIÉN fue.
 * Cada cambio es una fila nueva (⛔ se pisa).
 * @param {{ empresa_id: string, cliente_id: string, credito: boolean, tope?: number|null, dias?: number|null, usuario: string }} e
 */
export async function ponerCredito(db, e) {
  if (!UUID.test(String(e?.cliente_id ?? ''))) return fallo('ENTRADA_INVALIDA', 'Falta el cliente', 'cliente_id')
  if (typeof e.credito !== 'boolean') return fallo('ENTRADA_INVALIDA', 'credito es sí o no', 'credito')
  const usuario = typeof e.usuario === 'string' ? e.usuario.trim() : ''
  if (!usuario) return fallo('ENTRADA_INVALIDA', 'Falta quién lo marca', 'usuario')
  const tope = e.tope == null || e.tope === '' ? null : Number(e.tope)
  const dias = e.dias == null || e.dias === '' ? null : Number(e.dias)
  if (tope != null && !(tope > 0)) return fallo('ENTRADA_INVALIDA', 'El tope es un monto mayor a 0, o vacío (sin tope)', 'tope')
  if (dias != null && !(Number.isInteger(dias) && dias >= 1 && dias <= 365)) return fallo('ENTRADA_INVALIDA', 'El plazo es de 1 a 365 días, o vacío (sin plazo)', 'dias')
  if (!e.credito && (tope != null || dias != null)) return fallo('ENTRADA_INVALIDA', 'Sin crédito ⛔ lleva tope ni plazo', 'credito')
  const [c] = await q(db, 'select id::text, empresa_id from cliente where id = $1 and empresa_id = $2', [e.cliente_id, e.empresa_id])
  if (!c) return fallo('NO_ENCONTRADO', 'No está ese cliente en esa empresa', 'cliente_id')
  await q(db, 'insert into cliente_credito (empresa_id, cliente_id, credito, tope, dias, usuario) values ($1, $2, $3, $4, $5, $6)', [c.empresa_id, c.id, e.credito, tope, dias, usuario])
  return { ok: true, cliente_id: c.id, credito: creditoPublico(await creditoDe(db, c.id)) }
}

/**
 * ¿Se le puede vender a cuenta `monto`? `{ ok: true, frena: null | { codigo, mensaje } }` — para que la pantalla avise
 * ANTES de mandar la venta (la venta lo vuelve a mirar, con la cuenta bloqueada).
 * @param {{ cliente_id: string, marca: string, prueba?: boolean, monto: number, hoy?: string }} e
 */
export async function frenoACuenta(db, { cliente_id, marca, prueba = false, monto, hoy = null }) {
  if (!(Number(monto) > 0)) return fallo('ENTRADA_INVALIDA', 'El monto es mayor a 0', 'monto')
  const r = await cuentaDe(db, { cliente_id, marca, prueba, hoy })
  if (!r.ok) return r
  return { ok: true, frena: frena({ cuenta: r.estado, credito: r.credito, monto: Number(monto) }), estado: sinPendientes(r.estado) }
}

/**
 * Un PAGO A CUENTA: el cliente paga un monto que baja su deuda (se aplica a la compra más vieja). Entra por una cuenta
 * de cobro de la marca (⛔ «Saldo a favor» ni «Cuenta corriente»), con su medio y la cuenta real de la ruta vigente
 * (sql/020), como el cobro de una venta. Repetir con el mismo `origen_ref` devuelve el mismo.
 * @param {{ cliente_id: string, marca: string, monto: number, cuenta: string|number, cuenta_real?: string, canal?: string,
 *   origen_ref: string, usuario: string, prueba: boolean, ocurrida_en?: string }} e
 */
export async function registrarPagoACuenta(db, e) {
  if (!UUID.test(String(e?.cliente_id ?? ''))) return fallo('ENTRADA_INVALIDA', 'Falta el cliente', 'cliente_id')
  const monto = pesos(e.monto)
  if (!(monto > 0)) return fallo('ENTRADA_INVALIDA', 'El pago es un monto mayor a 0', 'monto')
  const ref = typeof e.origen_ref === 'string' ? e.origen_ref.trim() : ''
  if (!ref || ref.startsWith('venta:') || ref.endsWith(':anulacion')) return fallo('ENTRADA_INVALIDA', 'Falta origen_ref (la clave que evita duplicar)', 'origen_ref')
  const usuario = typeof e.usuario === 'string' ? e.usuario.trim() : ''
  if (!usuario) return fallo('ENTRADA_INVALIDA', 'Falta quién lo registra', 'usuario')
  if (typeof e.prueba !== 'boolean') return fallo('ENTRADA_INVALIDA', 'Falta decir si es de prueba', 'prueba')
  if (e.ocurrida_en != null && Number.isNaN(Date.parse(e.ocurrida_en))) return fallo('ENTRADA_INVALIDA', 'Fecha inválida', 'ocurrida_en')
  return enTransaccion(db, async () => {
    const [c] = await q(db, 'select id::text, empresa_id from cliente where id = $1', [e.cliente_id])
    if (!c) return fallo('NO_ENCONTRADO', 'No está ese cliente', 'cliente_id')
    // Primero el candado: dos reintentos del mismo pago a la vez ⇒ el segundo ve el primero (⛔ choca con el unique).
    await cuentaBloqueada(db, { cliente_id: c.id, marca: e.marca, prueba: e.prueba })
    const [y] = await q(db, 'select cliente_id::text, marca, monto::float, prueba from cuenta_movimiento where empresa_id = $1 and ref = $2', [c.empresa_id, ref])
    if (y) {
      if (y.cliente_id === c.id && y.marca === e.marca && y.monto === -monto && y.prueba === e.prueba) return { ok: true, pago: { ref, monto }, ya_existia: true, cuenta: await saldoDe(db, c.id, e.marca, e.prueba) }
      return fallo('CONFLICTO_IDEMPOTENCIA', `Ya entró otro movimiento con ${ref} y es distinto: no se pisa`, 'origen_ref')
    }
    const conf = await leerConf(db, e.marca)
    if (!conf.marcas[e.marca]) return fallo('MARCA_DESCONOCIDA', `Marca desconocida: ${e.marca}`, 'marca')
    const cuenta = cuentaDeCobro(conf, e.marca, e.cuenta)
    if (!cuenta) return fallo('CUENTA_DESCONOCIDA', `La cuenta de cobro ${e.cuenta} no es de ${e.marca}`, 'cuenta')
    if (cuenta.medio === 'saldo' || cuenta.medio === 'cuenta') return fallo('CUENTA_DESCONOCIDA', `Un pago a cuenta entra con plata, ⛔ con «${cuenta.nombre}»`, 'cuenta')
    const en = new Date(e.ocurrida_en ?? Date.now()).toISOString()
    const real = cobroReal({ monto, elegida: e.cuenta_real ?? null }, cuenta, { marca: e.marca, canal: e.canal ?? 'mayorista', en }, conf)
    if (!real.ok) return fallo(real.codigo, real.mensaje, 'cuenta_real')
    await insertarFila(db, {
      empresa_id: c.empresa_id, marca: e.marca, cliente_id: c.id, tipo: 'pago', ref, monto: -monto, cuenta_cobro_id: cuenta.id,
      medio: real.cobro.medio ?? null, cuenta_real_id: real.cobro.cuenta_real_id ?? null, detalle: {}, prueba: e.prueba, usuario, ocurrida_en: en,
    })
    return { ok: true, pago: { ref, monto, cuenta: cuenta.nombre, medio: real.cobro.medio ?? null }, ya_existia: false, cuenta: await saldoDe(db, c.id, e.marca, e.prueba) }
  })
}

/**
 * Anular un pago a cuenta (se cargó mal): la fila contraria, con el motivo. La deuda vuelve.
 * @param {{ empresa_id: string, origen_ref: string, motivo: string, usuario: string }} e
 */
export async function anularPagoACuenta(db, e) {
  const ref = typeof e?.origen_ref === 'string' ? e.origen_ref.trim() : ''
  if (!ref) return fallo('ENTRADA_INVALIDA', 'Falta el pago', 'origen_ref')
  if (!(typeof e.motivo === 'string' && e.motivo.trim())) return fallo('FALTA_MOTIVO', 'Falta el motivo', 'motivo')
  if (!(typeof e.usuario === 'string' && e.usuario.trim())) return fallo('ENTRADA_INVALIDA', 'Falta quién lo anula', 'usuario')
  return enTransaccion(db, async () => {
    const [p] = await q(db, `select * from cuenta_movimiento where empresa_id = $1 and ref = $2 and tipo = 'pago'`, [e.empresa_id, ref])
    if (!p) return fallo('NO_ENCONTRADO', 'No está ese pago a cuenta', 'origen_ref')
    await cuentaBloqueada(db, { cliente_id: p.cliente_id, marca: p.marca, prueba: p.prueba })
    const [ya] = await q(db, 'select 1 from cuenta_movimiento where empresa_id = $1 and ref = $2', [e.empresa_id, `${ref}:anulacion`])
    if (ya) return fallo('YA_ANULADO', 'Ese pago ya está anulado')
    await insertarFila(db, {
      empresa_id: p.empresa_id, marca: p.marca, cliente_id: p.cliente_id, tipo: 'anulacion', ref: `${ref}:anulacion`, monto: -Number(p.monto),
      detalle: { motivo: e.motivo.trim() }, prueba: p.prueba, usuario: e.usuario.trim(), ocurrida_en: new Date().toISOString(),
    })
    return { ok: true, anulado: ref, cuenta: await saldoDe(db, p.cliente_id, p.marca, p.prueba) }
  })
}
