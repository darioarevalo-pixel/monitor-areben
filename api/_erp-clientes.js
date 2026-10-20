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
        if (r.ok) cuenta = { cliente: r.cliente, credito: r.credito, estado: r.estado }
      }
    } catch { /* motor sin cuenta corriente: la ficha lo dice */ }
    return { compras, contacto, cuenta, cortado: compras.length === 200 }
  })
}
