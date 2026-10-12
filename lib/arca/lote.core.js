/**
 * Facturar un lote de punta a punta: candado, reserva, pedido a ARCA y lo que quedó a medias.
 *
 * Es el orquestador, sin base ni red propias: recibe `arca` (el cliente de `api/_arca.js`) y `repo`
 * (las filas de `facturas`, en `api/_facturacion.js`). Así se testea con dobles, incluidos los cortes.
 *
 * 🔑 **El número se RESERVA en la base ANTES de pedirlo.** Si la función se muere entre el pedido y
 * la respuesta (timeout de Vercel, corte), la fila queda `reservada` y la próxima corrida la resuelve
 * PRIMERO, consultando a ARCA, antes de pedir un número nuevo. Sin la reserva no habría rastro de lo
 * que se mandó, y reintentar duplica la factura.
 *
 * 🔴 **Un lote por punto de venta y tipo a la vez** (`repo.tomarCandado`): la numeración es «el último
 * + 1» y dos lotes en paralelo piden el mismo número.
 */
import { CBTE, desglosarIVA, problemasDe, reconciliar } from './arca.core.js'

const esNC = (tipo) => tipo === CBTE.NC_A || tipo === CBTE.NC_B

/** Cuántos comprobantes por pedido. ARCA acepta 250; con 100 entra holgado en los 30 s de Vercel. */
export const POR_PEDIDO = 100

/**
 * @param {{ arca: any, repo: any, ambiente: string, marca: string, ptoVta: number, tipo: number,
 *           comprobantes: Array<any>, reglas: { umbralIdentificar: number, hoy: string },
 *           lote: string, usuario: string }} p
 *   Cada comprobante trae `ventaId` (de dónde sale) además de lo que pide `problemasDe`.
 * @returns {Promise<{ autorizadas: any[], rechazadas: any[], noSalen: any[], resueltasDeAntes: any }>}
 */
export async function facturarLote({ arca, repo, ambiente, marca, ptoVta, tipo, comprobantes, reglas, lote, usuario }) {
  if (comprobantes.some((c) => c.tipo !== tipo)) throw new Error('Un lote lleva un solo tipo de comprobante')

  // Lo que no pasa la validación ⛔ toma número: se devuelve con su motivo.
  const noSalen = [], salen = []
  for (const c of comprobantes) {
    const motivos = problemasDe(c, reglas)
    if (!c.ventaId) motivos.push('Falta la venta')
    if (motivos.length) noSalen.push({ ...c, motivos })
    else salen.push(c)
  }

  if (!(await repo.tomarCandado({ ambiente, ptoVta, tipo, lote, usuario }))) {
    throw new Error('Ya hay otro lote facturando en ese punto de venta. Probá en un minuto.')
  }
  try {
    const resueltasDeAntes = await resolverPendientes({ arca, repo, ambiente, ptoVta, tipo })
    if (resueltasDeAntes.ajenas.length) throw new Error(ajenasMsg(resueltasDeAntes.ajenas))
    // Una venta que ya tiene factura (de antes, o de una pendiente recién resuelta) ⛔ se vuelve a facturar.
    // (Una nota de crédito por venta: cubre la devolución entera, que es lo que hace GN hoy.)
    const yaFacturadas = await repo.ventasFacturadas({ ambiente, marca, nc: esNC(tipo), ventaIds: salen.map((c) => c.ventaId) })
    // Y la misma venta repetida ADENTRO del lote sale una sola vez (probado contra homologación el
    // 12-oct: sin esto salieron dos facturas con CAE para la misma venta).
    const nuevas = [], enEsteLote = new Set()
    for (const c of salen) {
      const id = String(c.ventaId)
      if (yaFacturadas.has(id)) noSalen.push({ ...c, motivos: [esNC(tipo) ? 'La venta ya tiene nota de crédito' : 'La venta ya tiene factura'] })
      else if (enEsteLote.has(id)) noSalen.push({ ...c, motivos: ['La venta está repetida en el lote'] })
      else { enEsteLote.add(id); nuevas.push(c) }
    }

    const autorizadas = [], rechazadas = []
    for (let i = 0; i < nuevas.length; i += POR_PEDIDO) {
      const tanda = nuevas.slice(i, i + POR_PEDIDO)
      const desde = (await arca.ultimo(ptoVta, tipo)) + 1
      const filas = tanda.map((c, j) => filaReservada({ c, numero: desde + j, ambiente, marca, ptoVta, lote, usuario }))
      await repo.reservar(filas)

      let resp
      try {
        resp = await arca.solicitar({ ptoVta, tipo, desde, comprobantes: tanda })
      } catch (e) {
        if (!e?.corte) throw e
        // Se cortó sin respuesta: las filas siguen `reservadas`. Se resuelven ya, con el candado tomado.
        const r = await resolverPendientes({ arca, repo, ambiente, ptoVta, tipo })
        autorizadas.push(...r.autorizadas)
        rechazadas.push(...r.perdidas.map((f) => ({ ...f, motivos: ['No llegó a ARCA'] })))
        if (r.ajenas.length) throw new Error(ajenasMsg(r.ajenas))
        continue
      }

      const porNumero = new Map(resp.detalles.map((d) => [d.numero, d]))
      for (const f of filas) {
        const d = porNumero.get(f.numero)
        if (d?.resultado === 'A' && d.cae) {
          const hecha = { ...f, estado: 'autorizada', cae: d.cae, cae_vence: d.caeVence, observaciones: d.observaciones }
          await repo.resolver(f.id, { estado: 'autorizada', cae: d.cae, cae_vence: d.caeVence, observaciones: d.observaciones })
          autorizadas.push(hecha)
        } else {
          // Rechazada ⛔ consume número: se le saca, así el próximo lo puede usar.
          const motivos = [...(d?.observaciones || []), ...(resp.errores || [])].map((o) => `${o.codigo} ${o.mensaje}`)
          await repo.resolver(f.id, { estado: 'rechazada', numero: null, observaciones: d?.observaciones || resp.errores })
          rechazadas.push({ ...f, estado: 'rechazada', numero: null, motivos })
        }
      }
    }
    return { autorizadas, rechazadas, noSalen, resueltasDeAntes }
  } finally {
    await repo.soltarCandado({ ambiente, ptoVta, tipo, lote })
  }
}

/**
 * Las filas `reservadas` de ese punto de venta y tipo (de una corrida que se cortó): se consulta cada
 * número y se marca autorizada (con su CAE) o perdida (ARCA no la tiene ⇒ se libera el número).
 * `ajenas` = ARCA tiene ese número con otro contenido: alguien más factura en ese punto de venta.
 */
export async function resolverPendientes({ arca, repo, ambiente, ptoVta, tipo }) {
  const pendientes = await repo.reservadas({ ambiente, ptoVta, tipo })
  if (!pendientes.length) return { autorizadas: [], perdidas: [], ajenas: [] }
  const consultados = new Map()
  for (const f of pendientes) consultados.set(f.numero, await arca.consultar(ptoVta, tipo, f.numero))
  const r = reconciliar(pendientes.map((f) => ({
    ...f, total: Number(f.total), docTipo: f.doc_tipo, docNro: Number(f.doc_nro),
  })), consultados)
  for (const f of r.autorizados) await repo.resolver(f.id, { estado: 'autorizada', cae: f.cae, cae_vence: f.caeVence })
  for (const f of r.faltan) await repo.resolver(f.id, { estado: 'rechazada', numero: null, observaciones: [{ codigo: 0, mensaje: 'No llegó a ARCA' }] })
  return {
    autorizadas: r.autorizados.map((f) => ({ ...f, estado: 'autorizada', cae_vence: f.caeVence })),
    perdidas: r.faltan,
    ajenas: r.ajenos,
  }
}

const ajenasMsg = (ajenas) =>
  `Hay ${ajenas.length} número(s) que ARCA tiene con OTRO contenido (¿otro sistema factura en este punto de venta?): revisar a mano antes de seguir.`

function filaReservada({ c, numero, ambiente, marca, ptoVta, lote, usuario }) {
  const { total, neto, iva } = desglosarIVA(c.total)
  return {
    id: c.id || globalThis.crypto.randomUUID(),
    ambiente, marca, venta_id: String(c.ventaId),
    tipo: c.tipo, pto_vta: ptoVta, numero, fecha: c.fecha,
    total, neto, iva,
    doc_tipo: c.receptor.docTipo, doc_nro: Number(c.receptor.docNro), cond_iva: c.receptor.condicionIva,
    asociado_id: c.asociadoId || null,
    estado: 'reservada', lote, creado_por: usuario,
  }
}
