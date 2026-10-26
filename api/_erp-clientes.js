/**
 * ERP › Clientes y proveedores › Clientes (el molde del diseño, `~/Documents/erp-monitor/diseno.md` §3 y §7; tablero 4 del
 * v8): la LISTA de clientes y la FICHA de uno. Sólo LEE. Lo arma `lib/erp/clientes-lista.core.js`; lo llama `api/_erp.js`.
 *
 *   GET ?recurso=erp&vista=clientes-lista&marca=bdi|zattia               una fila por cliente
 *   GET ?recurso=erp&vista=cliente-ficha&marca=bdi|zattia&clave=<clave>  sus compras, contacto y cuenta corriente
 *
 * 🔑 Medido 19-oct: el motor todavía ⛔ tiene clientes (`cliente` vacía, 0 ventas con `cliente_id`) ⇒ la lista sale del
 *    espejo de GN (`ventas`), sumada EN LA BASE por pg (`conMotor`; supabase-js ⛔ agrupa y son 30.000 ventas). BDI va por
 *    `client_id` (y el contacto de `clientes`, el CRM); Zattia sólo por NOMBRE: su espejo ⛔ trae el id. La cuenta
 *    corriente del motor (contrato §15, `motor/cuenta/cuenta.mjs`) se suma encima; hoy ⛔ hay movimientos.
 */
import { createClient } from '@supabase/supabase-js'
import { cfgDeMarca } from './_recepciones-base.js'
import { aTupla } from '../lib/erp/clientes-lista.core.js'
import { nombresDeVentas } from '../lib/erp/cuenta-corriente.core.js'

const MARCAS = ['bdi', 'zattia']
/** Las líneas de cada base: Stunned vive en la de Zattia. */
const LINEAS = { bdi: ['bdi'], zattia: ['zattia', 'stunned'] }
const CLAVE = { bdi: `coalesce(client_id::text, 'n:' || lower(trim(client_name)))`, zattia: `'n:' || lower(trim(client_name))` }
const NO_ES_CLIENTE = `client_name is not null and lower(trim(client_name)) <> 'consumidor final'`

/** Los clientes del motor y su cuenta corriente. Sin las tablas (motor viejo) ⇒ vacío y se dice. */
async function delMotor(pg, marca) {
  try {
    const erp = (await pg.query('select id::text, empresa_id, nombre, doc, gn_client_id from cliente')).rows
    if (!erp.length) return { erp, cuentas: [], cuentaLista: true }
    const { cuentasCorrientes } = await import('../motor/cuenta/cuenta.mjs')
    const cuentas = []
    for (const empresa_id of new Set(erp.map((c) => c.empresa_id))) {
      for (const linea of LINEAS[marca]) {
        const r = await cuentasCorrientes(pg, { empresa_id, marca: linea })
        if (r.ok) cuentas.push(...r.cuentas)
      }
    }
    return { erp, cuentas, cuentaLista: true }
  } catch {
    return { erp: [], cuentas: [], cuentaLista: false }
  }
}

/**
 * @param {{ marca: string }} p
 * Devuelve los de GN como TUPLAS (`aTupla`) y la cuenta del motor aparte: las arma el navegador con `armarFilasClientes`.
 * @param {{ conMotor: Function }} deps
 */
export async function listaDeClientes({ marca }, deps) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  return deps.conMotor(marca, 'Los clientes del ERP', async (pg) => {
    const gn = (await pg.query(`select ${CLAVE[marca]} as clave, max(client_name) as nombre, count(*)::int as compras,
        sum(total_price)::float as total, min(date_sale)::date::text as primera, max(date_sale)::date::text as ultima,
        count(*) filter (where channel = 'Mayorista')::int as mayorista, array_agg(distinct channel) as canales
      from ventas where ${NO_ES_CLIENTE} group by 1`)).rows
    const [{ hasta } = {}] = (await pg.query('select max(date_sale)::date::text as hasta from ventas')).rows
    const m = await delMotor(pg, marca)
    return {
      gn: gn.map(aTupla),
      erp: m.erp.map((c) => ({ id: c.id, nombre: c.nombre, doc: c.doc, gn_client_id: c.gn_client_id == null ? null : String(c.gn_client_id) })),
      cuentas: m.cuentas.map((c) => ({ cliente_id: c.cliente_id, saldo: c.saldo, a_favor: c.a_favor, vencido: c.vencido })),
      gnHasta: hasta ?? null,
      clientesErp: m.erp.length,
      cuentaLista: m.cuentaLista,
      porNombre: marca === 'zattia',
    }
  })
}

/**
 * El contacto de un cliente de BDI, del CRM (`clientes`). 🔴 Por supabase-js, ⛔ por pg: el rol del motor ⛔ tiene permiso
 * sobre `clientes` (en prod daba 500 «permission denied», 19-oct). Si falla, la ficha sale sin contacto.
 */
async function contactoDeBdi(id) {
  const { url, key } = cfgDeMarca('bdi')
  const { data, error } = await createClient(url, key).from('clientes').select('name, email, phone, city, province, address').eq('id', Number(id)).maybeSingle()
  return error ? null : data ?? null
}

/**
 * La ficha: el contacto (BDI, del CRM), sus compras en GN (las últimas 200) y, si el motor lo tiene, su cuenta corriente.
 * @param {{ marca: string, clave: string }} p
 * @param {{ conMotor: Function, leerContacto?: Function }} deps
 */
export async function fichaDeCliente({ marca, clave }, deps) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const k = String(clave ?? '')
  if (!k || k.length > 200) return { status: 400, error: 'Falta el cliente' }
  return deps.conMotor(marca, 'La ficha del cliente', async (pg) => {
    const erpId = k.startsWith('erp:') ? k.slice(4) : null
    const porId = marca === 'bdi' && /^\d+$/.test(k)
    const donde = erpId ? 'false' : porId ? 'client_id = $1::bigint' : `lower(trim(client_name)) = $1 and ${NO_ES_CLIENTE}`
    const valor = porId ? k : k.replace(/^n:/, '')
    const compras = erpId ? [] : (await pg.query(`select id::text, number, date_sale::date::text as fecha, channel, total_price::float as total,
        sale_state, payment_method, tn_order::text from ventas where ${donde} order by date_sale desc, id desc limit 200`, [valor])).rows
    const contacto = porId ? await (deps.leerContacto ?? contactoDeBdi)(k).catch(() => null) : null
    let cuenta = null
    try {
      const [c] = (await pg.query(`select id::text from cliente where ${erpId ? 'id::text = $1' : porId ? 'gn_client_id = $1::bigint' : 'lower(trim(nombre)) = $1'} limit 1`, [erpId ?? valor])).rows
      if (c) {
        const { cuentaDe } = await import('../motor/cuenta/cuenta.mjs')
        const r = await cuentaDe(pg, { cliente_id: c.id, marca: LINEAS[marca][0] })
        if (r.ok) cuenta = { cliente: r.cliente, credito: r.credito, estado: r.estado, ventas: Object.fromEntries(nombresDeVentas(r.mayor)) }
      }
    } catch { /* motor sin cuenta corriente: la ficha lo dice */ }
    return { compras, contacto, cuenta, cortado: compras.length === 200 }
  })
}

// ── Cuenta corriente (🎨 20-oct, Diseño 8 · 7; contrato §15): la pestaña propia, por cliente × línea ──

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FECHA = /^\d{4}-\d{2}-\d{2}$/

/**
 * Las cuentas de la marca (`cuentasCorrientes` del motor, por cada empresa × línea). `prueba`: las del libro de PRUEBA
 * (las ventas del ERP en paralelo con GN), que es aparte: ⛔ se suman con las reales. Se cuentan las del otro libro para
 * que la pantalla lo diga.
 * @param {{ marca: string, prueba?: boolean }} p
 * @param {{ conMotor: Function }} deps
 */
export async function cuentasDeLaMarca({ marca, prueba = false }, deps) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  return deps.conMotor(marca, 'La cuenta corriente', async (pg) => {
    let empresas, otroLibro
    try {
      empresas = (await pg.query('select distinct empresa_id from cliente')).rows.map((r) => r.empresa_id)
      ;[{ n: otroLibro }] = (await pg.query('select count(distinct cliente_id)::int as n from cuenta_movimiento where prueba = $1 and marca = any($2)', [!prueba, LINEAS[marca]])).rows
    } catch {
      return { status: 409, error: 'El motor de esta marca todavía no tiene cuenta corriente (falta la 025).' }
    }
    const { cuentasCorrientes } = await import('../motor/cuenta/cuenta.mjs')
    const cuentas = []
    let hoy = null
    for (const empresa_id of empresas) {
      for (const linea of LINEAS[marca]) {
        const r = await cuentasCorrientes(pg, { empresa_id, marca: linea, prueba })
        if (!r.ok) return { status: 409, error: r.error?.mensaje ?? 'El motor no devolvió la cuenta corriente.' }
        hoy = r.hoy
        cuentas.push(...r.cuentas.map((c) => ({ ...c, linea })))
      }
    }
    return { hoy, prueba, cuentas, clientesErp: empresas.length ? (await pg.query('select count(*)::int as n from cliente')).rows[0].n : 0, otroLibro }
  })
}

/**
 * La cuenta de UN cliente en UNA línea: estado (con lo que debe compra por compra) y el MAYOR entre `desde` y `hasta`,
 * con su CSV para Excel (`mayorCSV` del motor: el «Exportar» de Darío).
 * @param {{ marca: string, clienteId: string, linea: string, prueba?: boolean, desde?: string, hasta?: string }} p
 * @param {{ conMotor: Function }} deps
 */
export async function cuentaDeCliente({ marca, clienteId, linea, prueba = false, desde = '', hasta = '' }, deps) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  if (!LINEAS[marca].includes(linea)) return { status: 400, error: 'Línea inválida' }
  if (!UUID.test(String(clienteId || ''))) return { status: 400, error: 'Falta el cliente' }
  for (const f of [desde, hasta]) if (f && !FECHA.test(f)) return { status: 400, error: 'Las fechas van AAAA-MM-DD' }
  return deps.conMotor(marca, 'La cuenta corriente', async (pg) => {
    const [{ cuentaDe }, { mayorCSV }] = await Promise.all([import('../motor/cuenta/cuenta.mjs'), import('../motor/cuenta/cuenta.core.mjs')])
    const r = await cuentaDe(pg, { cliente_id: clienteId, marca: linea, prueba, desde: desde || null, hasta: hasta || null })
    if (!r.ok) return { status: r.error?.codigo === 'NO_ENCONTRADO' ? 404 : 409, error: r.error?.mensaje ?? 'No se pudo leer la cuenta.' }
    const csv = mayorCSV(r.mayor, { cliente: r.cliente.nombre, marca: linea, desde: desde || undefined, hasta: hasta || undefined })
    // Con qué cuentas se puede COBRAR (las mismas que la venta: ⛔ «Saldo a favor» ni «Cuenta corriente», que no son plata que entra).
    const cuentas = await pg.query(`select id, nombre, medio from cuenta_cobro where marca = $1 and activa and medio not in ('saldo', 'cuenta') order by nombre`, [linea])
      .then((x) => x.rows).catch(() => [])
    return { hoy: r.hoy, cliente: r.cliente, credito: r.credito, estado: r.estado, mayor: r.mayor, csv, cuentas }
  })
}

/**
 * Marcar o sacar el crédito (sólo admin: lo chequea el handler). Cada cambio es una fila nueva del motor con quién fue.
 * @param {{ marca: string, body: any, usuario: string|null }} p
 * @param {{ conMotor: Function }} deps
 */
export async function ponerCreditoCliente({ marca, body, usuario }, deps) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  if (!UUID.test(String(body?.clienteId || ''))) return { status: 400, error: 'Falta el cliente' }
  if (!usuario) return { status: 400, error: 'Falta quién lo marca' }
  return deps.conMotor(marca, 'El crédito', async (pg) => {
    const [c] = (await pg.query('select empresa_id from cliente where id = $1', [body.clienteId])).rows
    if (!c) return { status: 404, error: 'No está ese cliente.' }
    const { ponerCredito } = await import('../motor/cuenta/cuenta.mjs')
    const r = await ponerCredito(pg, { empresa_id: c.empresa_id, cliente_id: body.clienteId, credito: body.credito === true, tope: body.tope ?? null, dias: body.dias ?? null, usuario })
    return r.ok ? { ok: true, credito: r.credito } : { status: 400, error: r.error?.mensaje ?? 'No se pudo marcar el crédito.' }
  })
}
