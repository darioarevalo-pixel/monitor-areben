/**
 * La SITUACIÓN CREDITICIA de un cliente, de la Central de Deudores del BCRA (Bruno, 31-oct: «sumalo»).
 *
 * API PÚBLICA, sin clave y gratis (`api.bcra.gob.ar/CentralDeDeudores/v1.0`; manual «APIs Públicas – Central de Deudores»):
 *   · `Deudas/{cuit}`                   el último período: por banco, situación, monto, días de atraso.
 *   · `Deudas/Historicas/{cuit}`        24 meses, por banco (situación y monto).
 *   · `Deudas/ChequesRechazados/{cuit}` los cheques rechazados, por causal y banco.
 * 🔴 **El `monto` de las deudas viene en MILES de pesos** (manual: «Información en miles de pesos»); el de los cheques, en pesos.
 * 🔴 Un 404 con «No se encontró datos» ⛔ es un error: es que NO DEBE nada (o no tiene cheques rechazados). Sólo acepta 11
 *    dígitos (CUIT/CUIL/CDI): un DNI ⛔ se consulta.
 * Situación (normas de Clasificación de deudores): 1 normal · 2 seguimiento especial / riesgo bajo · 3 con problemas /
 * riesgo medio · 4 alto riesgo de insolvencia · 5 irrecuperable · 6 irrecuperable por disposición técnica. 0 = sin deuda.
 *
 * Acá lo puro (leer y resumir); la red vive en `api/_erp-clientes.js` (`situacionBcra`).
 */

export const BCRA_URL = 'https://api.bcra.gob.ar/CentralDeDeudores/v1.0/Deudas'

export const SITUACION_BCRA = {
  0: 'sin deuda', 1: 'normal', 2: 'seguimiento especial', 3: 'con problemas',
  4: 'alto riesgo', 5: 'irrecuperable', 6: 'irrecuperable (técnica)',
}

/** El CUIT/CUIL de 11 dígitos de un documento, o null (un DNI ⛔ sirve). */
export function cuitParaBcra(doc) {
  const d = String(doc ?? '').replace(/\D/g, '')
  return d.length === 11 ? d : null
}

/**
 * Lo que contestó una de las tres consultas → `{ estado: 'ok', results }` · `{ estado: 'nada' }` (404 = no figura) ·
 * `{ estado: 'error', mensaje }`.
 * @param {number} status @param {any} json
 */
export function leerRespuestaBcra(status, json) {
  if (status === 200 && json?.results) return { estado: 'ok', results: json.results }
  const msgs = Array.isArray(json?.errorMessages) ? json.errorMessages.join(' ') : ''
  if (status === 404 && /no se encontr/i.test(msgs)) return { estado: 'nada' }
  return { estado: 'error', mensaje: msgs || `El BCRA contestó ${status}` }
}

const peorDe = (ents) => ents.reduce((m, e) => Math.max(m, Number(e.situacion) || 0), 0)

/**
 * Las tres consultas → lo que se muestra.
 * @param {{ deudas: ReturnType<typeof leerRespuestaBcra>, historicas?: ReturnType<typeof leerRespuestaBcra>|null,
 *           cheques?: ReturnType<typeof leerRespuestaBcra>|null }} r
 */
export function resumirBcra({ deudas, historicas = null, cheques = null }) {
  if (deudas.estado === 'error') return { ok: false, error: deudas.mensaje }
  const res = deudas.estado === 'ok' ? deudas.results : null
  const periodo = res?.periodos?.[0] ?? null
  const bancos = (periodo?.entidades ?? []).map((e) => ({
    entidad: String(e.entidad ?? ''),
    situacion: Number(e.situacion) || 0,
    monto: Math.round((Number(e.monto) || 0) * 1000),
    diasAtraso: Number(e.diasAtrasoPago) || 0,
    juicio: !!(e.procesoJud || e.situacionJuridica),
  })).sort((a, b) => b.situacion - a.situacion || b.monto - a.monto)

  // El PEOR de cada mes de los 24 (el más nuevo primero, como viene).
  const historia = historicas?.estado === 'ok'
    ? (historicas.results?.periodos ?? []).map((p) => ({ periodo: String(p.periodo), peor: peorDe(p.entidades ?? []) }))
    : null
  const peor12 = historia ? historia.slice(0, 12).reduce((m, p) => Math.max(m, p.peor), 0) : null

  let chequesRes = null
  if (cheques?.estado === 'nada') chequesRes = { total: 0, sinPagar: 0, monto: 0 }
  else if (cheques?.estado === 'ok') {
    const det = (cheques.results?.causales ?? []).flatMap((c) => (c.entidades ?? []).flatMap((e) => e.detalle ?? []))
    const sinPagar = det.filter((d) => !d.fechaPago)
    chequesRes = { total: det.length, sinPagar: sinPagar.length, monto: Math.round(sinPagar.reduce((s, d) => s + (Number(d.monto) || 0), 0)) }
  }

  return {
    ok: true,
    denominacion: res?.denominacion ?? historicas?.results?.denominacion ?? cheques?.results?.denominacion ?? null,
    periodo: periodo ? String(periodo.periodo) : null,
    peor: peorDe(bancos),
    deuda: bancos.reduce((s, b) => s + b.monto, 0),
    bancos, historia, peor12, cheques: chequesRes,
  }
}

/** «202609» → «sep-26». */
export function mesBcra(p) {
  const m = /^(\d{4})(\d{2})$/.exec(String(p ?? ''))
  if (!m) return ''
  return `${['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][Number(m[2]) - 1]}-${m[1].slice(2)}`
}

/** El tono de la línea: verde (todo 1), ámbar (algún 2, o cheque rechazado ya pagado), rojo (3 o peor, o cheque sin pagar). */
export function tonoBcra(r) {
  if (!r?.ok) return 'neutro'
  const peor = Math.max(r.peor, r.peor12 ?? 0)
  if (peor >= 3 || (r.cheques?.sinPagar ?? 0) > 0) return 'rojo'
  if (peor === 2 || (r.cheques?.total ?? 0) > 0) return 'ambar'
  return 'verde'
}
