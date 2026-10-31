/**
 * Facturación de MAYORISTAS desde el panel de WhatsApp (pedido de Darío §5; decidido por Bruno 31-oct). Lo puro está en
 * `lib/erp/factura-mayorista.core.js`; las filas, en `facturas` (base de BDI, `sql/migrate-facturas-mayorista.sql`).
 *
 *   - factura LIBRE: sin venta («100 fundas» con nuestro nombre y precio a mano). Suma al techo del mes (`mes`), ⛔ mueve stock
 *     ni toca la cuenta corriente: el motor ni se entera, salvo la ficha si se completan los datos fiscales en el mismo paso.
 *   - las facturas de la FICHA del cliente (`cliente_id`).
 *
 * Doble llave, como el pedido: verlo = `PANEL_CUENTA_CORRIENTE`; facturar ADEMÁS `VENTA_MAYORISTA_REAL` (en producción el
 * ambiente de ARCA es el REAL: una factura con CAE ⛔ se borra).
 */
import { ptoVtaDe } from '../motor/arca/arca.core.js'
import { facturarLote } from '../motor/arca/lote.core.js'
import { diaArgentino } from '../lib/envios/portal.core.js'
import { leerFacturaLibre, opcionDeCondicionPanel, receptorMayorista } from '../lib/erp/factura-mayorista.core.js'
import { SIN_ARCA, baseFacturacion, repoFacturas } from './_facturacion.js'
import { panelCuentaPrendido } from './_erp-clientes.js'
import { escribirPrendido } from './_erp-pedido.js'
import { pedirFacturaPorMail } from '../lib/mailer/factura.core.js'
import { UMBRAL_IDENTIFICAR, ambienteSeguro, arcaDe, filaParaPdf } from './_erp.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SIN_MIGRAR = 'Falta la migración de la facturación de mayoristas (sql/migrate-facturas-mayorista.sql).'

/**
 * El `repo` del lote, con los campos de la factura que el lote ⛔ conoce (clase, renglones, cliente, venta de la parte) puestos
 * en la fila que RESERVA: así quedan desde el primer momento, también si la corrida se corta antes del CAE.
 * @param {any} repo @param {Map<string, object>} extras venta_id → campos
 */
export function repoConExtras(repo, extras) {
  return { ...repo, reservar: (filas) => repo.reservar(filas.map((f) => ({ ...f, ...(extras.get(String(f.venta_id)) || {}) }))) }
}

/** La ficha fiscal del cliente (motor de BDI). */
const leerFicha = async (pg, clienteId) =>
  (await pg.query('select id, empresa_id, doc, nombre, razon_social, condicion_iva, domicilio, email from cliente where id = $1', [clienteId])).rows[0] ?? null

/**
 * Completa la ficha con lo que se pidió en el mismo paso (`ponerFiscalCliente` del motor: la MISMA ficha, ⛔ otra).
 * @returns {Promise<null | { status: number, error: string }>}
 */
async function completarFicha(pg, ficha, datos) {
  const m = await import('../motor/venta/cliente.mjs')
  if (typeof m.ponerFiscalCliente !== 'function') return { status: 409, error: 'Falta traer el motor con los datos fiscales de la ficha.' }
  const r = await m.ponerFiscalCliente(pg, {
    empresa_id: ficha.empresa_id, cliente_id: ficha.id, doc: datos.doc || undefined, condicion_iva: datos.condicionIva,
    razon_social: datos.razonSocial || undefined, domicilio: datos.domicilio || undefined,
  })
  return r.ok ? null : { status: 409, error: r.error?.mensaje ?? 'No se pudo completar la ficha.' }
}

/**
 * La factura LIBRE. `body`: `{ clienteId, renglones: [{ descripcion, cantidad, unitario }], doc?, condicion?, razonSocial?, domicilio? }`.
 * Sin datos fiscales suficientes contesta 409 con `falta` (la pantalla los pide en el mismo paso y vuelve a mandar).
 * @param {{ body: any, usuario: string|null, quien?: any }} p
 * @param {{ conMotor: Function, prendido?: boolean, escribir?: boolean, arca?: any, repo?: any, sb?: any, env?: any }} deps
 */
export async function facturaLibrePanel({ body, usuario, quien = usuario }, deps) {
  if (!(deps.prendido ?? panelCuentaPrendido(process.env, quien))) return { status: 409, error: 'La cuenta corriente del panel está apagada.' }
  if (!(deps.escribir ?? (await escribirPrendido()))) return { status: 409, error: 'Se factura desde acá el día que BDI pasa al ERP. Hasta entonces, en Gestión Nube.' }
  if (!usuario) return { status: 400, error: 'Falta quién lo hace' }
  const p = leerFacturaLibre(body)
  if (p.error) return { status: 400, error: p.error }
  const { ambiente, error: errorAmbiente } = ambienteSeguro()
  if (!ambiente) return { status: 409, error: errorAmbiente }
  const sb = deps.sb || (deps.repo ? null : baseFacturacion())

  return deps.conMotor('bdi', 'La factura', async (pg) => {
    const ficha = await leerFicha(pg, p.clienteId)
    if (!ficha) return { status: 404, error: 'No está ese cliente.' }
    const rec = receptorMayorista(ficha, p.datos)
    if (rec.falta) return { status: 409, error: rec.falta, falta: true }
    const arca = arcaDe(deps, sb)
    if (!arca) return { status: 409, error: SIN_ARCA }
    if (rec.guardar) {
      const mal = await completarFicha(pg, ficha, rec.ficha)
      if (mal) return mal
    }
    const hoy = diaArgentino(Date.now())
    const ventaId = `libre:${globalThis.crypto.randomUUID()}`
    const extras = new Map([[ventaId, { clase: 'libre', renglones: p.renglones, cliente_id: ficha.id }]])
    const r = await facturarLote({
      arca, repo: repoConExtras(deps.repo || repoFacturas(sb), extras), ambiente, marca: 'bdi',
      ptoVta: ptoVtaDe(ambiente, 'bdi', deps.env || process.env), tipo: rec.tipo,
      comprobantes: [{ ventaId, mes: hoy.slice(0, 7), tipo: rec.tipo, fecha: hoy, total: p.total, receptor: rec.receptor }],
      reglas: { umbralIdentificar: UMBRAL_IDENTIFICAR, hoy },
      lote: globalThis.crypto.randomUUID(), usuario,
    })
    const [hecha] = r.autorizadas
    if (!hecha) {
      const motivos = [...r.rechazadas, ...r.noSalen].flatMap((x) => x.motivos || [])
      return { status: 409, error: `ARCA no la autorizó: ${motivos.join(' · ') || 'sin motivo'}` }
    }
    const receptor = { nombre: rec.ficha.razonSocial || ficha.razon_social || ficha.nombre, domicilio: rec.ficha.domicilio || ficha.domicilio || null }
    return { ok: true, factura: { ...filaParaPdf(hecha, { numero: null, renglones: p.renglones, receptor }), clase: 'libre' } }
  })
}

/**
 * Las facturas de la ficha del cliente (las que salieron desde el panel: libre y por partes), con lo que hace falta para el PDF,
 * y los datos fiscales de la ficha (para saber qué pedir antes de facturar). Sólo lee.
 * @param {{ clienteId?: string, usuario?: any }} p @param {{ conMotor: Function, prendido?: boolean, sb?: any }} deps
 */
export async function facturasDeClientePanel({ clienteId = '', usuario = null }, deps) {
  if (!(deps.prendido ?? panelCuentaPrendido(process.env, usuario))) return { prendido: false }
  if (!UUID.test(String(clienteId))) return { status: 400, error: 'Falta el cliente' }
  const { ambiente, error } = ambienteSeguro()
  if (!ambiente) return { status: 409, error }
  const ficha = await deps.conMotor('bdi', 'La ficha del cliente', (pg) => leerFicha(pg, String(clienteId)))
  if (ficha && typeof ficha === 'object' && ficha.status) return ficha
  if (!ficha) return { status: 404, error: 'No está ese cliente.' }
  const sb = deps.sb || baseFacturacion()
  const { data, error: e } = await sb.from('facturas')
    .select('id, ambiente, marca, venta_id, venta_ref, clase, tipo, pto_vta, numero, fecha, total, neto, iva, doc_tipo, doc_nro, cond_iva, estado, cae, cae_vence, renglones')
    .eq('ambiente', ambiente).eq('cliente_id', String(clienteId)).eq('estado', 'autorizada').order('creado_en', { ascending: false }).limit(100)
  const fiscal = {
    doc: ficha.doc ?? null, razonSocial: ficha.razon_social ?? null, domicilio: ficha.domicilio ?? null, email: ficha.email ?? null,
    condicion: opcionDeCondicionPanel(ficha.condicion_iva),
  }
  if (e) {
    if (e.code === '42703') return { prendido: true, ambiente, fiscal, facturas: [], sinMigrar: SIN_MIGRAR }
    throw new Error(`facturas: ${e.message}`)
  }
  const receptor = { nombre: ficha.razon_social || ficha.nombre, domicilio: ficha.domicilio ?? null }
  return {
    prendido: true, ambiente, fiscal,
    facturas: (data || []).map((f) => ({ ...filaParaPdf(f, { numero: null, renglones: f.renglones || [], receptor }), clase: f.clase, venta_ref: f.venta_ref ?? null })),
  }
}

const MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const LETRA = { 1: 'A', 6: 'B' }
/** En homologación la factura es de PRUEBA: sólo a una casilla de la empresa, ⛔ a un cliente. */
export const CASILLA_INTERNA = '@arebensrl.com'

/**
 * «Enviar por mail» una factura YA hecha de la ficha del cliente (Darío §5; Bruno 31-oct: un botón). El PDF lo arma el
 * navegador (el mismo de «PDF»); acá se valida que la factura exista, sea de ESE cliente y esté autorizada, y el número,
 * el total y la fecha salen de la BASE, ⛔ del pedido. Sale por Mailer (SES) con el remitente de la marca.
 * `body`: `{ clienteId, facturaId, para, pdf }` (pdf en base64; `lib/erp/entrada.core.js` le da su propio tope).
 * ⛔ pide `VENTA_MAYORISTA_REAL`: la factura ya está hecha; mandarla no factura nada.
 * @param {{ body: any, quien?: any }} p
 * @param {{ conMotor: Function, prendido?: boolean, sb?: any, mailer?: any, ambiente?: string }} deps
 */
export async function enviarFacturaPanel({ body, quien = null }, deps) {
  if (!(deps.prendido ?? panelCuentaPrendido(process.env, quien))) return { status: 409, error: 'La cuenta corriente del panel está apagada.' }
  const clienteId = String(body?.clienteId ?? ''), facturaId = String(body?.facturaId ?? '')
  if (!UUID.test(clienteId) || !UUID.test(facturaId)) return { status: 400, error: 'Falta la factura o el cliente' }
  const para = String(body?.para ?? '').trim().toLowerCase()
  if (!MAIL.test(para) || para.length > 200) return { status: 400, error: 'El mail no es válido.' }
  const pdf = String(body?.pdf ?? '')
  if (!pdf) return { status: 400, error: 'Falta el PDF.' }
  const ambiente = deps.ambiente || (() => { const a = ambienteSeguro(); return a.ambiente })()
  if (!ambiente) return { status: 409, error: ambienteSeguro().error }
  if (ambiente !== 'produccion' && !para.endsWith(CASILLA_INTERNA)) {
    return { status: 409, error: `Es una factura de PRUEBA (homologación de ARCA): sólo se manda a una casilla ${CASILLA_INTERNA}.` }
  }

  const sb = deps.sb || baseFacturacion()
  const { data, error } = await sb.from('facturas').select('id, ambiente, marca, tipo, pto_vta, numero, fecha, total, estado, cliente_id')
    .eq('id', facturaId).eq('ambiente', ambiente).eq('cliente_id', clienteId).limit(1)
  if (error) throw new Error(`facturas: ${error.message}`)
  const f = data?.[0]
  if (!f) return { status: 404, error: 'No está esa factura en la ficha de este cliente.' }
  if (f.estado !== 'autorizada') return { status: 409, error: 'La factura no está autorizada por ARCA.' }
  const letra = LETRA[Number(f.tipo)]
  if (!letra) return { status: 409, error: 'Sólo se mandan facturas A o B.' }

  const ficha = await deps.conMotor('bdi', 'La ficha del cliente', (pg) => leerFicha(pg, clienteId))
  if (ficha && typeof ficha === 'object' && ficha.status) return ficha
  const comprobante = `${letra} ${String(f.pto_vta).padStart(5, '0')}-${String(f.numero).padStart(8, '0')}`
  const r = await pedirFacturaPorMail(deps.mailer || { url: process.env.MAILER_URL, key: process.env.MAILER_TICKET_KEY, fetch }, {
    marca: f.marca, para, comprobante, cliente: ficha?.razon_social || ficha?.nombre || '', total: Number(f.total), fecha: String(f.fecha).slice(0, 10),
    archivo: `Factura ${comprobante}.pdf`, pdf,
  })
  if (!r.ok && !r.configurado) return { status: 503, error: 'Falta la conexión con Mailer (MAILER_URL / MAILER_TICKET_KEY) en Vercel.' }
  if (!r.ok) return { status: 502, error: `No salió: ${r.motivo}` }
  return { ok: true, para, de: r.de, comprobante }
}
