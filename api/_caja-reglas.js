/**
 * Las reglas con las que la Caja cobra HOY, fuera del handler para que las use también el cambio de
 * `erp › Caja` (`api/_erp.js`): el descuento de la forma de pago y la cuenta de la transferencia salen de
 * ACÁ, ⛔ de una copia. Movidas tal cual de `api/_caja.js` (14-oct, sesión B del ERP).
 */
import { createClient } from '@supabase/supabase-js'
import { verificaTransferencias } from '../lib/caja/core.core.js'
import { LINEAS_DE, reglasDeAgenda } from '../motor/venta/reglas.mjs'
import { cuentasDe } from './_pagos-recibidos.js'

/** La fila de `caja_config` de la marca (sin sembrarla: eso lo hace la Caja al abrir). @returns {Promise<any>} */
export async function reglasGuardadas(sb, store, marca) {
  const { data, error } = await sb.from('caja_config').select('reglas').eq('store', store).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? data.reglas : marca.reglasIniciales
}

/**
 * Las reglas con las que se cobra HOY. 🔑 Bruno, 11-oct: la cuenta de GN de la transferencia SALE de la
 * cuenta de Mercado Pago donde se detecta (la de Pagos recibidos en uso): la de Darío ⇒ Transferencia
 * CG (20595), Areben Comercial ⇒ Transferencia (13015). El mapeo lo carga un admin en
 * `reglas.transferenciaPorMp` ({ [cuenta de MP]: cuenta de GN }); sin mapeo para la cuenta en uso, la
 * transferencia ⛔ se cobra (`transferenciaA: null` ⇒ `cuentaDeMedio` lo dice). ⛔ Hay modo feria
 * general: la feria es por producto (`feriaProductos`).
 * 🔑 V4 (Bruno, 12-oct): una tienda SIN verificación (`verificarTransferencia: false`) ⛔ mira MP: la cuenta
 * de GN es `transferenciaFija`. Y la que verifica pero TODAVÍA ⛔ tiene cuenta de MP conectada (BDI, 12-oct),
 * o cuya cuenta en uso ⛔ tiene mapeo, también va a `transferenciaFija`: la venta espera igual y la cajera
 * la confirma a mano («Transferencia confirmada»); cuando se conecte la cuenta, el cruce es automático.
 * Zattia ⛔ tiene `transferenciaFija` ⇒ sin mapeo sigue sin cobrar transferencia, como antes.
 */
export async function reglasDeHoy(sb, store, reglas) {
  const { feria: _f, feriaIdsCampania: _x, feriaPrecios: _p, reglasComerciales: _rc, comerciales: _c, ...guardadas } = reglas
  const sinFeria = { ...guardadas, comerciales: await comercialesDeHoy(sb, store, reglas) }
  // 🔑 V4: la tienda que ⛔ verifica en Mercado Pago manda la transferencia a SU cuenta fija.
  if (!verificaTransferencias(reglas)) {
    const fija = Number(reglas.transferenciaFija)
    return { ...sinFeria, transferenciaA: Number.isInteger(fija) && fija > 0 ? fija : null, ...(await feriaDeCampanias(sb, store, reglas.feriaCampanias)) }
  }
  let enUso = null
  try {
    ;({ enUso } = await cuentasDe(sb, store))
  } catch { /* sin cuenta de MP: la transferencia ⛔ se cobra */ }
  const mapa = reglas.transferenciaPorMp || {}
  const gn = enUso != null ? Number(mapa[String(enUso)]) : NaN
  const fija = Number(reglas.transferenciaFija)
  const a = Number.isInteger(gn) && gn > 0 ? gn : Number.isInteger(fija) && fija > 0 ? fija : null
  return { ...sinFeria, transferenciaA: a, ...(await feriaDeCampanias(sb, store, reglas.feriaCampanias)) }
}

/**
 * 🔑 La FERIA es la de LIQUIDACIÓN (Bruno, 11-oct: «tenés la lista, está todo en el monitor»): los
 * productos con el precio de una campaña de feria APLICADO (`liquidacion_items.estado = 'aplicado'`).
 * Qué campañas son de feria lo elige un admin (`reglas.feriaCampanias`); cuando la campaña se saca, sus
 * productos dejan de ser feria solos. 🔴 Si la lectura falla, LANZA: cobrar una prenda de feria con el %
 * de la forma de pago la deja debajo del costo.
 *
 * 🔑 Y el PRECIO de la prenda de feria es el de la CAMPAÑA (Bruno, 13-oct: «son dos campañas conectadas»):
 * Tienda Nube puede tener aplicada otra campaña encima —la «Feria Online» pone feria ÷ 0,9 para que el
 * 10 % de la transferencia vuelva al de feria— y la Caja, que ⛔ le aplica el % a la feria, cobraba ese
 * número ~11 % más caro. Con dos campañas de feria sobre el mismo producto, gana la aplicada más tarde.
 */
export async function feriaDeCampanias(sb, store, ids) {
  const lista = Array.isArray(ids) ? ids.map(String).filter(Boolean) : []
  if (!lista.length) return { feriaIdsCampania: [], feriaPrecios: {} }
  const pids = new Set()
  const precios = {}
  const cuando = {}
  for (let desde = 0; desde < 20_000; desde += 1000) {
    const { data, error } = await sb.from('liquidacion_items').select('pid, datos').eq('store', store).in('liq_id', lista).eq('estado', 'aplicado')
      .order('pid').range(desde, desde + 999)
    if (error) throw new Error(`No se pudieron leer los productos en oferta de Liquidación (${error.message}).`)
    for (const f of data || []) {
      const n = Number(f.pid)
      if (!Number.isInteger(n) || n <= 0) continue
      pids.add(n)
      const d = f.datos || {}
      const precio = Number((d.aplicacion && d.aplicacion.precioEscrito) ?? (d.decision && d.decision.precioSale))
      const t = Number((d.aplicacion && d.aplicacion.aplicadoEn) || 0)
      if (Number.isFinite(precio) && precio > 0 && !(cuando[n] > t)) { precios[n] = precio; cuando[n] = t }
    }
    if (!data || data.length < 1000) break
  }
  return { feriaIdsCampania: [...pids], feriaPrecios: precios }
}

/**
 * 🔑 **LA CAJA COBRA CON LAS REGLAS COMERCIALES** (parte 3 de `reglas-comerciales.md`, 17-oct). Si la marca la prendió en
 * `erp › Reglas`, `caja_config.reglas.reglasComerciales` guarda `{ prendida, lista, copiadasEn, por }`: la COPIA de las
 * reglas activas de `regla_comercial` (motor) que se hace al prender y en cada cambio de una regla. La Caja cobra con esa
 * copia para ⛔ depender del motor en el mostrador (la cajera está esperando). Acá se le suma lo que ⛔ se copia:
 * - la promo bancaria de la AGENDA, LEÍDA (`reglasDeAgenda`: se edita en la Agenda, como siempre);
 * - de qué campañas de Liquidación es cada producto (`campaniasDe`), para las reglas de campaña.
 * Apagada (o sin la clave) ⇒ `null`: el % sale de la cuenta de GN, como siempre. 🔴 Si algo de esto ⛔ se puede leer,
 * LANZA: cobrar sin la promo o sin la regla de la campaña cobra MAL (lo mismo que la feria).
 * @returns {Promise<import('../lib/caja/core.core.js').Comerciales | null>}
 */
export async function comercialesDeHoy(sb, store, reglas) {
  const rc = reglas && reglas.reglasComerciales
  if (!rc || rc.prendida !== true || !Array.isArray(rc.lista)) return null
  // Las de la marca y las de sus líneas (Stunned en Zattia): cada prenda usa las suyas (`deLaLinea`; Bruno, 17-oct).
  const marcas = [store, ...(LINEAS_DE[store] || [])]
  const lista = rc.lista.filter((r) => r && r.activa && r.canal === 'local' && marcas.includes(r.marca))
  const url = process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co'
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
  const { data, error } = await createClient(url, key).from('agenda_promos')
    .select('id, banco, medio, beneficio, regla, desde, hasta, canales, marcas, activa').eq('activa', true)
  if (error) throw new Error('No se pudo leer la Agenda (las promos bancarias de las reglas). Reintentar.')
  const ids = [...new Set([...lista.map((r) => r.campania).filter(Boolean), ...(reglas.feriaCampanias || [])].map(String))]
  return { marca: store, lista: [...lista, ...reglasDeAgenda(data || [], { marca: store })], campaniasDe: await campaniasDe(sb, store, ids) }
}

/** De qué campañas (con el precio APLICADO) es cada producto: `{ [pid]: [liq_id] }`. Lanza si ⛔ se puede leer. */
async function campaniasDe(sb, store, ids) {
  /** @type {Record<string, string[]>} */
  const de = {}
  if (!ids.length) return de
  for (let desde = 0; desde < 40_000; desde += 1000) {
    const { data, error } = await sb.from('liquidacion_items').select('pid, liq_id').eq('store', store).in('liq_id', ids).eq('estado', 'aplicado')
      .order('pid').order('liq_id').range(desde, desde + 999)
    if (error) throw new Error(`No se pudieron leer las campañas de Liquidación (${error.message}).`)
    for (const f of data || []) {
      const k = String(Number(f.pid))
      if (k === 'NaN' || k === '0') continue
      if (!de[k]) de[k] = []
      if (!de[k].includes(String(f.liq_id))) de[k].push(String(f.liq_id))
    }
    if (!data || data.length < 1000) break
  }
  return de
}
