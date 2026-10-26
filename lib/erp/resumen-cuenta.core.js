/**
 * ERP › Clientes › Cuenta corriente: «Escribir por WhatsApp» e «Imprimir resumen de cuenta» (🎨 26-oct, Resto; tablero 4 del v8).
 * Núcleo puro: el número listo para `wa.me`, el texto del mensaje y el HTML del resumen. ⛔ llama a nada: la pantalla abre
 * el enlace y la ventana de impresión.
 */

import { NOMBRE_LINEA } from './cuenta-corriente.core.js'

const plata = (n) => `$ ${Math.round(Math.abs(Number(n) || 0)).toLocaleString('es-AR')}`
const dmy = (f) => (/^\d{4}-\d{2}-\d{2}/.test(String(f ?? '')) ? `${String(f).slice(8, 10)}/${String(f).slice(5, 7)}/${String(f).slice(0, 4)}` : String(f ?? ''))
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/**
 * El número tal como se escribe a mano (11 5555-1234, 0351 15 555-1234, +54 9 11…) ⇒ el de `wa.me` (54 9 + 10 dígitos), o
 * `null` si no se puede asegurar. 🔑 ⛔ adivinar: un número mal armado le escribe a OTRA persona; si no cierra, el botón queda
 * apagado y lo dice.
 * @param {unknown} crudo
 * @returns {string | null}
 */
export function numeroWhatsapp(crudo) {
  let d = String(crudo ?? '').replace(/\D/g, '')
  if (!d) return null
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('54')) {
    d = d.slice(2)
    if (d.startsWith('9')) d = d.slice(1) // ya viene como móvil
  }
  if (d.startsWith('0')) d = d.slice(1) // el 0 del código de área
  if (d.length === 12) {
    // código de área + 15 + número: el 15 sobra (el área tiene 2, 3 o 4 dígitos)
    for (const area of [2, 3, 4]) if (d.slice(area, area + 2) === '15') { d = d.slice(0, area) + d.slice(area + 2); break }
  }
  return d.length === 10 ? `549${d}` : null
}

/**
 * El mensaje para el cliente, según cómo esté la cuenta. Sólo dice lo que el sistema sabe (saldo y vencido): ⛔ datos para
 * transferir ni plazos inventados.
 * @param {{ nombre: string, linea: string, saldo: number, vencido: number }} f
 * @returns {string | null} null si la cuenta está en cero (no hay nada para decir)
 */
export function mensajeDeCuenta({ nombre, linea, saldo, vencido }) {
  const marca = NOMBRE_LINEA[linea] ?? linea
  const hola = `Hola ${String(nombre ?? '').trim().split(/\s+/)[0] || ''}`.trim()
  if (saldo > 0.5) {
    const venc = vencido > 0.5 ? ` De eso, ${plata(vencido)} ya está vencido.` : ''
    return `${hola}, te escribimos de ${marca}. Tu cuenta corriente tiene un saldo pendiente de ${plata(saldo)}.${venc} ¿Cuándo podés abonarlo? ¡Gracias!`
  }
  if (saldo < -0.5) return `${hola}, te escribimos de ${marca}. Tu cuenta corriente tiene ${plata(saldo)} a tu favor, para usar en tu próxima compra. ¡Gracias!`
  return null
}

/**
 * El enlace o el motivo por el que no se puede: el botón se apaga y lo dice en el `title`.
 * @param {{ whatsapp?: string | null, nombre: string, linea: string, saldo: number, vencido: number }} f
 * @returns {{ url: string | null, motivo: string | null }}
 */
export function enlaceWhatsapp(f) {
  if (!String(f.whatsapp ?? '').trim()) return { url: null, motivo: 'No tiene WhatsApp cargado.' }
  const n = numeroWhatsapp(f.whatsapp)
  if (!n) return { url: null, motivo: `El WhatsApp cargado (${String(f.whatsapp).trim()}) no se entiende como número.` }
  const texto = mensajeDeCuenta(f)
  if (!texto) return { url: null, motivo: 'La cuenta está en cero: no hay nada para decirle.' }
  return { url: `https://wa.me/${n}?text=${encodeURIComponent(texto)}`, motivo: null }
}

/**
 * El resumen de cuenta para imprimir (o guardar como PDF): el saldo, lo que debe venta por venta y el mayor. Una página
 * suelta, sin menú ni botones. Todo texto del cliente pasa por `esc`.
 * @param {{ fila: { nombre: string, doc: string | null, linea: string }, hoy: string, prueba?: boolean,
 *   estado: { saldo: number, debe: number, a_favor: number, vencido: number, tramos?: Record<string, number>, pendientes: Array<{ ref: string, fecha: string, monto: number, pendiente: number, dias: number }> },
 *   mayor: { anterior: number, renglones: Array<{ fecha: string, tipo: string, ref: string, detalle: string, debe: number, haber: number, saldo: number }> },
 *   ventas?: Map<string, string> }} d
 */
export function resumenDeCuentaHtml({ fila, hoy, prueba = false, estado, mayor, ventas = new Map() }) {
  const marca = NOMBRE_LINEA[fila.linea] ?? fila.linea
  const saldo = estado.saldo
  const fila2 = (celdas, clase = '') => `<tr${clase ? ` class="${clase}"` : ''}>${celdas.map(([t, der]) => `<td${der ? ' class="n"' : ''}>${esc(t)}</td>`).join('')}</tr>`
  const pendientes = estado.pendientes.length
    ? `<table><thead><tr><th>Venta</th><th>Fecha</th><th class="n">Días</th><th class="n">Total</th><th class="n">Pendiente</th></tr></thead><tbody>${
      estado.pendientes.map((p) => fila2([[ventas.get(p.ref) ?? p.ref], [dmy(p.fecha)], [String(p.dias), true], [plata(p.monto), true], [plata(p.pendiente), true]])).join('')
    }</tbody></table>`
    : '<p class="mut">No debe ninguna venta.</p>'
  const renglones = [
    ...(mayor.anterior !== 0 ? [fila2([[''], ['Saldo anterior'], [''], [''], [(mayor.anterior < 0 ? '−' : '') + plata(mayor.anterior), true]])] : []),
    ...mayor.renglones.map((r) => fila2([
      [dmy(r.fecha)], [r.tipo === 'compra' ? r.detalle || 'Compra' : `Pago${r.detalle ? ` · ${r.detalle}` : ''}`],
      [r.debe ? plata(r.debe) : '', true], [r.haber ? plata(r.haber) : '', true], [(r.saldo < 0 ? '−' : '') + plata(r.saldo), true],
    ])),
  ]
  const mayorHtml = renglones.length
    ? `<table><thead><tr><th>Fecha</th><th>Movimiento</th><th class="n">Debe</th><th class="n">Haber</th><th class="n">Saldo</th></tr></thead><tbody>${renglones.join('')}</tbody></table>`
    : '<p class="mut">Sin movimientos.</p>'
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Resumen de cuenta · ${esc(fila.nombre)}</title><style>
body{font:13px/1.45 system-ui,sans-serif;color:#0f1729;margin:28px}
h1{font-size:20px;margin:0}h2{font-size:15px;margin:22px 0 6px}
.mut{color:#64748b}.saldo{font-size:26px;font-weight:700}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
th,td{padding:5px 8px;border-bottom:1px solid #e3e8ef;text-align:left}th{font-size:12px;color:#64748b}
.n{text-align:right}.cab{display:flex;justify-content:space-between;align-items:flex-end;gap:16px}
.prueba{display:inline-block;margin-top:6px;padding:2px 8px;border:1px solid #b45309;color:#b45309;border-radius:99px;font-size:12px}
@media print{body{margin:12mm}}
</style></head><body>
<div class="cab"><div><h1>Resumen de cuenta corriente</h1>
<div>${esc(fila.nombre)} · <span class="mut">${esc(fila.doc ?? 'sin documento')}</span></div>
<div class="mut">${esc(marca)} · al ${esc(dmy(hoy))}</div>${prueba ? '<div class="prueba">Movimientos de prueba</div>' : ''}</div>
<div style="text-align:right"><div class="mut">${saldo < 0 ? 'Saldo a favor' : 'Saldo a pagar'}</div><div class="saldo">${esc(plata(saldo))}</div>
<div class="mut">${saldo > 0 && estado.vencido > 0 ? `${esc(plata(estado.vencido))} vencido` : ''}</div></div></div>
<h2>Ventas con saldo</h2>${pendientes}
<h2>Movimientos</h2>${mayorHtml}
</body></html>`
}
