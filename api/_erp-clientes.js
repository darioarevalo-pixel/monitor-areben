/**
 * ERP › Clientes y proveedores › Clientes (el molde del diseño, `~/Documents/erp-monitor/diseno.md` §3 y §7; tablero 4 del
 * v8): la LISTA de clientes y la FICHA de uno. Sólo LEE. Lo arma `lib/erp/clientes-lista.core.js`; lo llama `api/_erp.js`.
 *
 *   GET ?recurso=erp&vista=clientes-lista&marca=bdi|zattia&linea=…       una fila por cliente (de esa línea)
 *   GET ?recurso=erp&vista=cliente-ficha&marca=bdi|zattia&linea=…&clave=<clave>  sus compras, contacto y cuenta corriente
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
import { SQL_CTE_LINEA_GN, sqlVentaDeLinea } from '../lib/erp/linea-gn.core.js'

const MARCAS = ['bdi', 'zattia']
/** Las líneas de cada base: Stunned vive en la de Zattia. */
const LINEAS = { bdi: ['bdi'], zattia: ['zattia', 'stunned'] }
const CLAVE = { bdi: `coalesce(client_id::text, 'n:' || lower(trim(client_name)))`, zattia: `'n:' || lower(trim(client_name))` }
const NO_ES_CLIENTE = `client_name is not null and lower(trim(client_name)) <> 'consumidor final'`

/**
 * 🔑 Cada pantalla es de UNA línea (Bruno, 30-oct): en Zattia la línea es obligatoria y las compras de GN salen sólo de las
 * ventas con algún renglón de ella (`linea-gn.core.js`, criterio «lista»). BDI ⛔ tiene líneas.
 */
const lineaValida = (marca, linea) => (marca === 'bdi' ? linea === 'bdi' || !linea : LINEAS[marca]?.includes(linea))
const conLinea = (marca, linea) => (marca === 'bdi' ? { cte: '', join: '', donde: 'true' } : {
  cte: `with ${SQL_CTE_LINEA_GN} `, join: 'left join linea_gn lg on lg.sale_id = v.id', donde: sqlVentaDeLinea(linea, 'lista'),
})

/**
 * 🔑 Una ficha del motor (`cliente`) es de la EMPRESA, ⛔ de una línea: es de la línea `$n` si tiene alguna venta, algún
 * movimiento de cuenta o alguna orden de la Tienda Nube de ella (Bruno, 30-oct: «los clientes van en cada marca, sí o sí»).
 * La usan Clientes y el ⌘K; los buscadores que ELIGEN una clienta para escribir (factura A, Cargar venta) ⛔: ahí, sin
 * verla, se cargaría repetida.
 * Medido 30-oct en Zattia (`scripts/medir-lineas-clientes-proveedores.mjs`): 5.634 fichas, 4.971 con venta o cuenta, 47 sólo
 * con orden de TN y 616 clientas de GN sin nada en el motor ⇒ ésas las suma el ⌘K por NOMBRE con sus ventas de GN
 * (`sqlClienteDeGn`); la lista de Clientes ya las cruza así.
 * @param {string} id la columna del id de la ficha @param {number} n el parámetro de la línea
 */
export const sqlClienteDeLinea = (id, n) => `(exists (select 1 from venta v where v.cliente_id = ${id} and v.marca = $${n})
  or exists (select 1 from cuenta_movimiento m where m.cliente_id = ${id} and m.marca = $${n})
  or exists (select 1 from tn_orden o where o.cliente_id = ${id} and o.tienda = $${n}))`

/**
 * La ficha tiene alguna compra de la línea en el espejo de GN, por NOMBRE (el espejo de Zattia ⛔ trae el id de la clienta).
 * Va con `with ${SQL_CTE_LINEA_GN}` al principio de la consulta. @param {string} nombre la columna @param {'zattia'|'stunned'} linea
 */
export const sqlClienteDeGn = (nombre, linea) => `exists (select 1 from ventas gv left join linea_gn lg on lg.sale_id = gv.id
  where lower(trim(gv.client_name)) = lower(trim(${nombre})) and ${sqlVentaDeLinea(linea, 'lista')})`

/** Los clientes del motor y su cuenta corriente. Sin las tablas (motor viejo) ⇒ vacío y se dice. */
async function delMotor(pg, marca, linea) {
  try {
    // `de_la_linea`: la ficha sin compras de GN de la línea entra a la lista sólo si es de ella (`armarFilasClientes`).
    const erp = (await (marca === 'bdi'
      ? pg.query('select id::text, empresa_id, nombre, doc, gn_client_id, true as de_la_linea from cliente')
      : pg.query(`select id::text, empresa_id, nombre, doc, gn_client_id, ${sqlClienteDeLinea('cliente.id', 1)} as de_la_linea from cliente`, [linea]))).rows
    if (!erp.length) return { erp, cuentas: [], cuentaLista: true }
    const { cuentasCorrientes } = await import('../motor/cuenta/cuenta.mjs')
    const cuentas = []
    for (const empresa_id of new Set(erp.map((c) => c.empresa_id))) {
      const r = await cuentasCorrientes(pg, { empresa_id, marca: linea })
      if (r.ok) cuentas.push(...r.cuentas)
    }
    return { erp, cuentas, cuentaLista: true }
  } catch {
    return { erp: [], cuentas: [], cuentaLista: false }
  }
}

/**
 * @param {{ marca: string, linea?: string }} p
 * Devuelve los de GN como TUPLAS (`aTupla`) y la cuenta del motor aparte: las arma el navegador con `armarFilasClientes`.
 * @param {{ conMotor: Function }} deps
 */
export async function listaDeClientes({ marca, linea = marca === 'bdi' ? 'bdi' : '' }, deps) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  if (!lineaValida(marca, linea)) return { status: 400, error: 'Falta la línea (Zattia o Stunned).' }
  const l = marca === 'bdi' ? 'bdi' : linea
  const k = conLinea(marca, l)
  return deps.conMotor(marca, 'Los clientes del ERP', async (pg) => {
    const gn = (await pg.query(`${k.cte}select ${CLAVE[marca]} as clave, max(client_name) as nombre, count(*)::int as compras,
        sum(total_price)::float as total, min(date_sale)::date::text as primera, max(date_sale)::date::text as ultima,
        count(*) filter (where channel = 'Mayorista')::int as mayorista, array_agg(distinct channel) as canales
      from ventas v ${k.join} where ${NO_ES_CLIENTE} and ${k.donde} group by 1`)).rows
    const [{ hasta } = {}] = (await pg.query('select max(date_sale)::date::text as hasta from ventas')).rows
    const m = await delMotor(pg, marca, l)
    return {
      gn: gn.map(aTupla),
      erp: m.erp.map((c) => ({ id: c.id, nombre: c.nombre, doc: c.doc, gn_client_id: c.gn_client_id == null ? null : String(c.gn_client_id), deLaLinea: !!c.de_la_linea })),
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
 * La ficha: el contacto (BDI, del CRM), sus compras en GN (las últimas 200) y, si el motor lo tiene, su cuenta corriente —
 * todo de UNA línea (antes la cuenta salía SIEMPRE de Zattia: `LINEAS[marca][0]`, mirando Stunned).
 * @param {{ marca: string, linea?: string, clave: string }} p
 * @param {{ conMotor: Function, leerContacto?: Function }} deps
 */
export async function fichaDeCliente({ marca, linea = marca === 'bdi' ? 'bdi' : '', clave }, deps) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  if (!lineaValida(marca, linea)) return { status: 400, error: 'Falta la línea (Zattia o Stunned).' }
  const l = marca === 'bdi' ? 'bdi' : linea
  const lk = conLinea(marca, l)
  const k = String(clave ?? '')
  if (!k || k.length > 200) return { status: 400, error: 'Falta el cliente' }
  return deps.conMotor(marca, 'La ficha del cliente', async (pg) => {
    const erpId = k.startsWith('erp:') ? k.slice(4) : null
    const porId = marca === 'bdi' && /^\d+$/.test(k)
    const donde = erpId ? 'false' : porId ? 'client_id = $1::bigint' : `lower(trim(client_name)) = $1 and ${NO_ES_CLIENTE}`
    const valor = porId ? k : k.replace(/^n:/, '')
    const compras = erpId ? [] : (await pg.query(`${lk.cte}select v.id::text, number, date_sale::date::text as fecha, channel, total_price::float as total,
        sale_state, payment_method, tn_order::text from ventas v ${lk.join} where ${donde} and ${lk.donde} order by date_sale desc, v.id desc limit 200`, [valor])).rows
    const contacto = porId ? await (deps.leerContacto ?? contactoDeBdi)(k).catch(() => null) : null
    let cuenta = null
    try {
      const [c] = (await pg.query(`select id::text from cliente where ${erpId ? 'id::text = $1' : porId ? 'gn_client_id = $1::bigint' : 'lower(trim(nombre)) = $1'} limit 1`, [erpId ?? valor])).rows
      if (c) {
        const { cuentaDe } = await import('../motor/cuenta/cuenta.mjs')
        const r = await cuentaDe(pg, { cliente_id: c.id, marca: l })
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
 * 🔑 De UNA línea (Bruno, 30-oct): mirando Stunned, ⛔ los saldos de Zattia —ni en la lista ni en el resumen ni en «el otro libro»—.
 * @param {{ marca: string, linea?: string, prueba?: boolean }} p
 * @param {{ conMotor: Function }} deps
 */
export async function cuentasDeLaMarca({ marca, linea = marca === 'bdi' ? 'bdi' : '', prueba = false }, deps) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  if (!lineaValida(marca, linea)) return { status: 400, error: 'Falta la línea (Zattia o Stunned).' }
  const lineas = [marca === 'bdi' ? 'bdi' : linea]
  return deps.conMotor(marca, 'La cuenta corriente', async (pg) => {
    let empresas, otroLibro
    try {
      empresas = (await pg.query('select distinct empresa_id from cliente')).rows.map((r) => r.empresa_id)
      ;[{ n: otroLibro }] = (await pg.query('select count(distinct cliente_id)::int as n from cuenta_movimiento where prueba = $1 and marca = any($2)', [!prueba, lineas])).rows
    } catch {
      return { status: 409, error: 'El motor de esta marca todavía no tiene cuenta corriente (falta la 025).' }
    }
    const { cuentasCorrientes } = await import('../motor/cuenta/cuenta.mjs')
    const cuentas = []
    let hoy = null
    for (const empresa_id of empresas) {
      for (const linea of lineas) {
        const r = await cuentasCorrientes(pg, { empresa_id, marca: linea, prueba })
        if (!r.ok) return { status: 409, error: r.error?.mensaje ?? 'El motor no devolvió la cuenta corriente.' }
        hoy = r.hoy
        cuentas.push(...r.cuentas.map((c) => ({ ...c, linea })))
      }
    }
    // El WhatsApp para el botón de la fila: una lectura aparte (el motor ⛔ lo trae en `cuentasCorrientes`). Si falla, la lista sale sin botón.
    try {
      const ids = [...new Set(cuentas.map((c) => c.cliente_id))]
      // Y el id de GN: tocar el nombre en el panel de WhatsApp (Pagos › Cuentas) abre la ficha de ese cliente.
      const wa = new Map((ids.length ? (await pg.query('select id::text, whatsapp, gn_client_id::text from cliente where id = any($1::uuid[])', [ids])).rows : []).map((r) => [r.id, r]))
      for (const c of cuentas) { c.whatsapp = wa.get(c.cliente_id)?.whatsapp ?? null; c.gn_client_id = wa.get(c.cliente_id)?.gn_client_id ?? null }
    } catch { /* sin WhatsApp: el botón queda apagado */ }
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

/**
 * Cargar o corregir el WhatsApp / mail de UN cliente por su id (sólo admin: lo chequea el handler). El motor normaliza el
 * WhatsApp a 549 + 10 dígitos o lo rechaza (⛔ adivina: un número mal armado le escribe a otra persona) y ⛔ borra nada.
 * @param {{ marca: string, body: any, usuario: string|null }} p
 * @param {{ conMotor: Function }} deps
 */
export async function ponerContactoCliente({ marca, body, usuario }, deps) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  if (!UUID.test(String(body?.clienteId || ''))) return { status: 400, error: 'Falta el cliente' }
  if (!usuario) return { status: 400, error: 'Falta quién lo carga' }
  return deps.conMotor(marca, 'El contacto', async (pg) => {
    const [c] = (await pg.query('select empresa_id from cliente where id = $1', [body.clienteId])).rows
    if (!c) return { status: 404, error: 'No está ese cliente.' }
    const { ponerContactoCliente: poner } = await import('../motor/venta/cliente.mjs')
    const r = await poner(pg, { empresa_id: c.empresa_id, cliente_id: body.clienteId, whatsapp: body.whatsapp, email: body.email })
    return r.ok ? { ok: true, contacto: { whatsapp: r.cliente.whatsapp, email: r.cliente.email } } : { status: r.error?.codigo === 'FALTA_CLIENTE' ? 404 : 400, error: r.error?.mensaje ?? 'No se pudo guardar el contacto.' }
  })
}

// ── La cuenta corriente en el panel de WhatsApp (plan «BDI directo al ERP», Bruno 30-oct, fases 2 y 3) ──

/**
 * El interruptor del panel, `PANEL_CUENTA_CORRIENTE`: `1` = para todos los que tengan el permiso; una lista de usuarios
 * (`bruno,otro`) = sólo para ellos. 🔴 Mientras GN siga vivo un pago cargado acá ⛔ baja en GN ⇒ se prende primero sólo para
 * probar (Bruno/admin), ⛔ para Darío, hasta que Bruno lo acuerde. Apagado ⇒ el panel queda IDÉNTICO a hoy (la vista
 * contesta sin leer la base).
 * @param {Record<string, string|undefined>} [env] @param {string|null} [usuario]
 */
export function panelCuentaPrendido(env = process.env, usuario = null) {
  const v = String(env.PANEL_CUENTA_CORRIENTE ?? '').trim()
  if (v === '1') return true
  if (!v || !usuario) return false
  return v.toLowerCase().split(',').map((x) => x.trim()).filter(Boolean).includes(String(usuario).toLowerCase())
}

/**
 * La cuenta del cliente del CHAT, para el panel de WhatsApp de Darío (`components/panel/PanelWhatsApp.tsx`): sólo BDI (la
 * cuenta corriente es de BDI, Bruno 14-oct). Resuelve la ficha del motor por `gn_client_id` —el panel ya conoce el id de GN
 * del cliente— y, si ⛔ hay, por el WhatsApp del chat (`clientePorWhatsapp` del motor, sql/061); con más de una ficha por ese
 * número ⛔ elige: contesta `ambiguo`. Devuelve saldo, compras con saldo, últimos pagos y las cuentas con que se cobra (lo
 * mismo que `cuentaDeCliente`). 🔴 Lee el libro que diga `prueba` (⛔ el real fijo de `fichaDeCliente`): hoy BDI sólo tiene
 * el de PRUEBA. Cargar el pago va por `cobrar-cuenta` (`cobrarCuentaErp`), el mismo de ERP › Clientes.
 * Sin cliente (la solapa Pagos, sin chat) contesta sólo si está prendido.
 * @param {{ gnId?: string, tel?: string, prueba?: boolean, usuario?: string|null }} p
 * @param {{ conMotor: Function, prendido?: boolean }} deps
 */
export async function cuentaDelPanel({ gnId = '', tel = '', prueba = false, usuario = null }, deps) {
  if (!(deps.prendido ?? panelCuentaPrendido(process.env, usuario))) return { prendido: false }
  const gn = /^\d{1,12}$/.test(String(gnId)) ? String(gnId) : null
  const wa = String(tel || '').replace(/\D/g, '').slice(0, 20)
  if (!gn && !wa) return { prendido: true, prueba, cliente: null }
  return deps.conMotor('bdi', 'La cuenta corriente', async (pg) => {
    let clienteId = gn ? (await pg.query('select id::text from cliente where gn_client_id = $1::bigint limit 1', [gn])).rows[0]?.id ?? null : null
    if (!clienteId && wa) {
      const { clientePorWhatsapp } = await import('../motor/venta/cliente.mjs')
      if (typeof clientePorWhatsapp === 'function') {
        const encontrados = []
        for (const { empresa_id } of (await pg.query('select distinct empresa_id from cliente')).rows) {
          const r = await clientePorWhatsapp(pg, { empresa_id, whatsapp: wa })
          if (r.ok) encontrados.push(...r.clientes)
        }
        if (encontrados.length > 1) return { prendido: true, prueba, cliente: null, ambiguo: encontrados.length }
        clienteId = encontrados[0]?.id ?? null
      }
    }
    if (!clienteId) return { prendido: true, prueba, cliente: null }
    const { cuentaDe } = await import('../motor/cuenta/cuenta.mjs')
    const r = await cuentaDe(pg, { cliente_id: clienteId, marca: 'bdi', prueba })
    if (!r.ok) return { status: 409, error: r.error?.mensaje ?? 'No se pudo leer la cuenta.' }
    const ventas = nombresDeVentas(r.mayor)
    const pagos = r.mayor.renglones.filter((x) => x.tipo === 'pago').slice(-4).reverse()
      .map((x) => ({ fecha: x.fecha, monto: x.haber, detalle: x.detalle }))
    const cuentas = await pg.query(`select id, nombre, medio from cuenta_cobro where marca = 'bdi' and activa and medio not in ('saldo', 'cuenta') order by nombre`)
      .then((x) => x.rows).catch(() => [])
    return {
      prendido: true, prueba, hoy: r.hoy, cliente: r.cliente, linea: 'bdi', credito: r.credito,
      estado: { ...r.estado, pendientes: r.estado.pendientes.map((v) => ({ ...v, nombre: ventas.get(v.ref) ?? null })) },
      pagos, cuentas,
    }
  })
}
