/**
 * `erp › Reglas` del lado del monitor (puro): leer lo que manda la pantalla (una regla, una simulación) y comparar las
 * reglas guardadas con lo que hoy cobra la Caja. La REGLA y la CUENTA son del motor (`motor/venta/reglas.mjs`): acá
 * ⛔ se decide ningún %. Lo usan `api/_erp-reglas.js` y la pantalla (`components/erp/ReglasComerciales.tsx`).
 */
import { parsearMonto } from '../compromisos/plata.core.js'
import { CANALES, LINEAS_DE, MEDIOS, efectoEnTexto, validarRegla } from '../../motor/venta/reglas.mjs'

/**
 * Las marcas de reglas que vive cada pantalla: Zattia y su línea Stunned (Bruno, 17-oct: «cada negocio dentro del ERP
 * puede configurar sus propias reglas»). La prenda de Stunned cobra con las de Stunned; si ⛔ hay, con las de Zattia.
 * @param {string} marca @returns {string[]}
 */
export const marcasDe = (marca) => [marca, ...(LINEAS_DE[marca] || [])]

export const MAX_RENGLONES_SIMULADOR = 30

/**
 * La regla que manda la pantalla, para guardar. La marca la pone el servidor (la de la pantalla); el cuerpo sólo puede
 * elegir una LÍNEA de ella (Stunned en Zattia). Devuelve `{ regla }` o `{ error }` (el texto del núcleo, para que
 * pantalla y servidor digan lo mismo).
 * @param {any} x @param {{ marca: string }} o
 */
export function leerReglaDePantalla(x, { marca }) {
  if (!x || typeof x !== 'object') return { error: 'Falta la regla' }
  const linea = marcasDe(marca).includes(x.marca) ? x.marca : marca
  const v = validarRegla({ ...x, marca: linea, origen: undefined })
  if (!v.ok) return { error: v.error.mensaje, campo: v.error.campo }
  return { regla: v.regla }
}

/**
 * Lo que manda el simulador: las prendas (con producto de GN o sueltas, con precio), la fecha (hoy si falta), el
 * canal, el banco y las cuotas del crédito, la rebaja a toda la venta y una regla en borrador.
 * @param {any} b @param {{ marca: string, ahora: number }} o
 */
export function leerSimulacion(b, { marca, ahora }) {
  if (!b || typeof b !== 'object') return { error: 'Falta la venta a simular' }
  const lista = Array.isArray(b.renglones) ? b.renglones : []
  if (!lista.length) return { error: 'Agregá al menos un producto' }
  if (lista.length > MAX_RENGLONES_SIMULADOR) return { error: `Hasta ${MAX_RENGLONES_SIMULADOR} productos` }
  const renglones = []
  for (const [i, r] of lista.entries()) {
    const precio = parsearMonto(r && r.precio)
    if (!(precio > 0)) return { error: `Producto ${i + 1}: falta el precio` }
    const cantidad = Number(r.cantidad ?? 1)
    if (!(Number.isInteger(cantidad) && cantidad > 0 && cantidad <= 50)) return { error: `Producto ${i + 1}: cantidad inválida` }
    const producto = r.producto == null || r.producto === '' ? null : Number(r.producto)
    if (producto != null && !(Number.isInteger(producto) && producto > 0)) return { error: `Producto ${i + 1}: producto inválido` }
    // Una prenda suelta (sin producto) puede decir a qué campañas pertenece, para probar una regla de campaña.
    const campanias = producto ? [] : (Array.isArray(r.campanias) ? r.campanias.map(String).filter(Boolean).slice(0, 5) : [])
    // Las categorías son las de Tienda Nube y las pone la PANTALLA (`matchTn` sobre el catálogo), como en la Caja.
    const categorias = Array.isArray(r.categorias) ? r.categorias.slice(0, 30).map((x) => String(x).slice(0, 80)).filter(Boolean) : []
    // La línea (Stunned) la pone la pantalla por el SKU, como en la Caja: con ella la prenda cobra con las reglas de su línea.
    const linea = r.linea && r.linea !== marca && marcasDe(marca).includes(r.linea) ? r.linea : null
    renglones.push({ producto, nombre: typeof r.nombre === 'string' ? r.nombre.slice(0, 120) : null, precio, cantidad, campanias, categorias, ...(linea ? { linea } : {}) })
  }
  const canal = b.canal == null ? 'local' : b.canal
  if (!CANALES.includes(canal)) return { error: 'Canal inválido' }
  let fecha = new Date(ahora).toISOString()
  if (b.fecha) {
    // Un día ('aaaa-mm-dd') se simula al mediodía argentino; una fecha con hora, tal cual.
    const t = /^\d{4}-\d{2}-\d{2}$/.test(b.fecha) ? Date.parse(`${b.fecha}T15:00:00Z`) : Date.parse(b.fecha)
    if (Number.isNaN(t)) return { error: 'Fecha inválida' }
    fecha = new Date(t).toISOString()
  }
  const banco = typeof b.banco === 'string' && b.banco.trim() ? b.banco.trim().slice(0, 40) : null
  const cuotas = b.cuotas == null || b.cuotas === '' ? null : Number(b.cuotas)
  if (cuotas != null && !(Number.isInteger(cuotas) && cuotas > 1 && cuotas <= 24)) return { error: 'Cuotas inválidas' }
  let rebaja = null
  if (b.rebaja != null && b.rebaja !== '') {
    const valor = parsearMonto(b.rebaja.valor)
    if (!(valor > 0) || !['pct', 'pesos'].includes(b.rebaja.tipo)) return { error: 'Descuento a la venta inválido' }
    if (b.rebaja.tipo === 'pct' && valor > 100) return { error: 'Descuento a la venta inválido' }
    rebaja = { tipo: b.rebaja.tipo, valor }
  }
  return {
    renglones, canal, fecha, rebaja,
    credito: { ...(banco ? { banco } : {}), ...(cuotas ? { cuotas } : {}) },
    borrador: b.borrador && typeof b.borrador === 'object' ? b.borrador : null,
  }
}

/** La firma de lo que una regla HACE (sin nombre ni quién la cargó): para comparar dos juegos de reglas. */
const firma = (r) => [r.canal, r.campania || '', [...r.medios].sort().join('/'), r.alcance, [...(r.alcance_ids || [])].sort().join(','),
  r.banco || '', r.cuotas ?? '', r.monto_minimo ?? '', r.efecto, r.pct ?? '', r.desde || '', r.hasta || '', (r.dias || []).join(',')].join('|')

/**
 * 🔴 Mientras la Caja cobre con su configuración (hasta la parte 3), las reglas guardadas y lo que la Caja cobra se pueden
 * SEPARAR callados. Esto los compara: lo que la Caja hace y ninguna regla activa dice (`faltan`), y lo que las reglas
 * activas dicen y la Caja ⛔ hace (`sobran`). Sin reglas guardadas de la Caja, ⛔ compara: falta traerlas.
 * @param {any[]} guardadas @param {any[]} deCaja
 */
export function compararConCaja(guardadas, deCaja) {
  const activas = guardadas.filter((r) => r.activa)
  if (!guardadas.some((r) => r.origen === 'caja')) return { sinTraer: true, faltan: [], sobran: [] }
  const enReglas = new Set(activas.map(firma))
  const enCaja = new Set(deCaja.map(firma))
  return {
    sinTraer: false,
    faltan: deCaja.filter((r) => !enReglas.has(firma(r))).map(resumenDeRegla),
    sobran: activas.filter((r) => !enCaja.has(firma(r))).map(resumenDeRegla),
  }
}

const NOMBRE_MEDIO = { efectivo: 'efectivo', transferencia: 'transferencia', debito: 'débito', credito: 'crédito' }

/** Una línea que dice qué hace la regla: «efectivo: −15 % · toda la tienda · local». */
export function resumenDeRegla(r) {
  const medios = MEDIOS.filter((m) => r.medios.includes(m)).map((m) => NOMBRE_MEDIO[m]).join(', ')
  const cond = [r.banco ? `tarjeta ${r.banco}` : null, r.cuotas ? `${r.cuotas} cuotas` : null,
    r.monto_minimo != null ? `más de $${Number(r.monto_minimo).toLocaleString('es-AR')}` : null].filter(Boolean)
  return `${medios}${cond.length ? ` (${cond.join(', ')})` : ''}: ${efectoEnTexto(r)}`
}

/**
 * Parte 3: lo que se COPIA a la Caja (`caja_config.reglas.reglasComerciales.lista`): las reglas ACTIVAS del local de la
 * marca y de sus líneas (Stunned va en la Caja de Zattia), con lo que el cobro usa, en un orden fijo (para saber si la copia está al día comparándola).
 * @param {any[]} guardadas @param {string} marca
 */
export function copiaParaCaja(guardadas, marca) {
  return guardadas
    .filter((r) => r.activa && r.canal === 'local' && marcasDe(marca).includes(r.marca))
    .map((r) => ({
      id: String(r.id), nombre: r.nombre, marca: r.marca, canal: r.canal, campania: r.campania || null, alcance: r.alcance,
      alcance_ids: [...(r.alcance_ids || [])].map(String), medios: [...r.medios], banco: r.banco || null,
      cuotas: r.cuotas == null ? null : Number(r.cuotas), monto_minimo: r.monto_minimo == null ? null : Number(r.monto_minimo),
      efecto: r.efecto, pct: r.pct == null ? null : Number(r.pct),
      // De Postgres llegan como Date; de la copia guardada, como texto: las dos, ISO.
      desde: r.desde ? new Date(r.desde).toISOString() : null, hasta: r.hasta ? new Date(r.hasta).toISOString() : null,
      dias: r.dias ? r.dias.map(Number) : null, activa: true,
    }))
    .sort((a, b) => a.id.localeCompare(b.id, 'es', { numeric: true }))
}

/**
 * 🔴 Las reglas activas del local que la Caja ⛔ puede cobrar tal cual, con el porqué: la Caja pregunta sólo «¿es
 * tarjeta del banco de la promo de hoy?» (el banco de la Agenda) y «¿6 cuotas?». Una regla que pide otra cosa queda
 * cargada pero en el mostrador ⛔ se aplica nunca: se dice, ⛔ se calla.
 * @param {any[]} guardadas @param {string} marca
 */
export function queNoCobraLaCaja(guardadas, marca) {
  const no = []
  for (const r of guardadas.filter((x) => x.activa && x.canal === 'local' && marcasDe(marca).includes(x.marca))) {
    if (r.banco && r.medios.includes('debito')) no.push({ id: r.id, nombre: r.nombre, porque: 'la Caja no pregunta el banco del débito' })
    else if (r.banco) no.push({ id: r.id, nombre: r.nombre, porque: 'la Caja pregunta sólo por el banco de la promo de la Agenda: cargala en la Agenda' })
    else if (r.cuotas != null && r.cuotas !== 6) no.push({ id: r.id, nombre: r.nombre, porque: `la Caja pregunta sólo por 6 cuotas, no por ${r.cuotas}` })
  }
  return no
}
