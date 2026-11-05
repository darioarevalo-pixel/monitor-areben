/**
 * Seguimiento de envíos: leer lo que dice el Correo de cada paquete y decidir en qué solapa va.
 * Puro y en JS plano porque lo importa el handler. Ver `docs/secciones/seguimiento-envios.md`.
 *
 * 🔴 **«ENTREGADO» en el Correo ⛔ alcanza para decir que lo recibió el cliente.** Un paquete que no se
 * retira sigue `PLAZO VENCIDO NO RECLAMO` → `RETORNAND0` → `ENTREGADO`, y ese último lo firma una planta
 * de Rosario: volvió a nosotros (medido 5-nov). Por eso `volvio` se mira en TODA la historia.
 */

/** Sin movimiento desde hace estos días ⇒ Trabado. Medido 5-nov: 6 paquetes con 22 días o más y el resto con 2 o menos. */
export const DIAS_TRABADO = 7

const DIA_MS = 86_400_000

/** `04-11-2026 21:41`, hora de Argentina, a milisegundos. `null` si el Correo cambió el formato. */
export function instanteCorreo(texto) {
  const m = /^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2})/.exec(String(texto || '').trim())
  if (!m) return null
  const ms = Date.parse(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00-03:00`)
  return Number.isNaN(ms) ? null : ms
}

const limpio = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * Las filas de la historia, la más nueva primero. Se lee por `data-title` porque el Correo ⛔ cierra los
 * `<tr>`: un primer intento por `<tr>/<td>` dio «sin filas» en 77 de 77, un cero falso.
 */
export function leerHistoriaCorreo(html) {
  const filas = []
  for (const tramo of String(html || '').split(/<tr\b[^>]*>/i).slice(1)) {
    const celda = (titulo) => {
      const m = new RegExp(`data-title="${titulo}:?"[^>]*>([\\s\\S]*?)(?=</td>|<td\\b|$)`, 'i').exec(tramo)
      return m ? limpio(m[1]) : ''
    }
    const fecha = celda('Fecha')
    const instante = instanteCorreo(fecha)
    if (instante == null) continue
    filas.push({ fecha, instante, planta: celda('Planta'), historia: celda('Historia'), estado: celda('Estado') })
  }
  return filas.sort((a, b) => b.instante - a.instante)
}

/** El número de pieza del Correo (`HC-560088547-AR`, algunos `HE-…`): está en el título de la respuesta. */
export function leerPiezaCorreo(html) {
  const m = /pieza:\s*<span[^>]*>\s*([^<]*?)\s*<\/span>/i.exec(String(html || ''))
  return m && m[1] ? m[1] : null
}

// ⚠️ El Correo escribe `RETORNAND0` con un CERO.
const RETORNANDO = /RETORNAND[O0]/i
const RESCATADA = /RESCATADA/i
const ROBADO = /SUSTRA[IÍ]DO/i
const EN_ESPERA = /EN ESPERA EN SUCURSAL/i
const ENTREGADO = /^(ENTREGADO|ENTREGA EN SUCURSAL)$/i

/**
 * Situación de un paquete según su historia.
 *  - `retiro`: en sucursal. `volvio` true ⇒ está esperando que lo busquemos NOSOTROS: ⛔ se le avisa al cliente.
 *  - `trabado`: lo robaron, o lleva `DIAS_TRABADO` sin movimiento.
 *  - `volvio`: el Correo lo dio por entregado después de retornar.
 *  - `entregado` · `en-camino` · `sin-datos`.
 * `RESCATADA` (n=1, BDI #20981): lo pidieron antes de que volviera y terminó entregado en una agencia.
 */
export function situacionDe(filas, ahora = Date.now()) {
  const actual = filas && filas[0]
  if (!actual) return { situacion: 'sin-datos', dias: null, volvio: false, motivo: null }
  const dias = Math.max(0, Math.floor((ahora - actual.instante) / DIA_MS))
  const volvio = filas.some((f) => RETORNANDO.test(f.estado)) && !filas.some((f) => RESCATADA.test(f.estado))
  if (ROBADO.test(actual.estado)) return { situacion: 'trabado', dias, volvio, motivo: 'robado' }
  if (ENTREGADO.test(actual.estado)) return { situacion: volvio ? 'volvio' : 'entregado', dias, volvio, motivo: null }
  if (EN_ESPERA.test(actual.estado)) return { situacion: 'retiro', dias, volvio, motivo: null }
  if (dias >= DIAS_TRABADO) return { situacion: 'trabado', dias, volvio, motivo: 'sin-movimiento' }
  return { situacion: 'en-camino', dias, volvio, motivo: null }
}

/** ¿Hay que preguntarle al Correo? Andreani es la entrega 3. */
export function esDelCorreo(o) {
  return Boolean(o && o.envio_estado === 'shipped' && o.estado_orden !== 'cancelled' && o.envio_tracking
    && !/andreani/i.test(String(o.envio || '')))
}

/** Tramos de `dias` hacia atrás desde `hasta`, para pedirle a TN de a pedazos. */
export function tramosDeFechas(hasta, dias, largo) {
  const out = []
  for (let k = 0; k < dias; k += largo) {
    const fin = new Date(hasta.getTime() - k * DIA_MS)
    out.push({ desde: new Date(fin.getTime() - (Math.min(largo, dias - k) - 1) * DIA_MS), hasta: fin })
  }
  return out
}

/**
 * Las solapas. Más viejo primero: en una bandeja de espera importa lo que hace más tiempo que está.
 * @param {Array<{ tienda: string, orden: any, filas: any[] | null, pieza?: string | null }>} leidos `filas: null` ⇒ el Correo no contestó.
 */
export function armarSolapas(leidos, ahora = Date.now()) {
  const retiro = []
  const trabados = []
  const volvieron = []
  const resumen = { consultados: leidos.length, enCamino: 0, entregados: 0, sinLeer: [] }
  for (const { tienda, orden, filas, pieza } of leidos) {
    const s = situacionDe(filas || [], ahora)
    const base = { tienda, id: orden.id, numero: orden.number }
    if (s.situacion === 'sin-datos') { resumen.sinLeer.push(base); continue }
    if (s.situacion === 'en-camino') { resumen.enCamino++; continue }
    if (s.situacion === 'entregado') { resumen.entregados++; continue }
    const fila = {
      ...base,
      cliente: orden.cliente || null,
      envio: orden.envio_tipo === 'pickup' ? 'Punto de retiro' : 'A domicilio',
      codigo: orden.envio_tracking,
      pieza: pieza || null,
      pedido: orden.fecha || null,
      planta: filas[0].planta,
      ultimo: filas[0].estado || filas[0].historia,
      dias: s.dias,
      volvio: s.volvio,
      motivo: s.motivo,
    }
    ;(s.situacion === 'retiro' ? retiro : s.situacion === 'volvio' ? volvieron : trabados).push(fila)
  }
  const porDias = (a, b) => b.dias - a.dias
  return { retiro: retiro.sort(porDias), trabados: trabados.sort(porDias), volvieron: volvieron.sort(porDias), resumen }
}
