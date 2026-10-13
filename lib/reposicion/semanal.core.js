/**
 * **El correo de los lunes de la reposición de BDI** (Darío, 12-oct-2026): lo que la reposición
 * descubre pero no puede resolver, porque son decisiones de él. Puro: recibe las listas ya armadas y
 * devuelve asunto, texto y HTML. Lo manda `scripts/reposicion-semanal.mjs`.
 *
 * 🔑 Las tres listas (Darío no quiere ir a buscar la información, ver la memoria del proyecto):
 * 1. **Para comprar**: se vende y no queda en el depósito. ⛔ Sin las fundas: casi todas se importan,
 *    no es una compra de acá (Darío, 12-oct-2026). Vidrios y accesorios.
 * 2. **No encontradas al armar**: el sistema dice que hay y en el estante no. Diferencia de stock.
 * 3. **Sin ventas en 60 días** (sólo el primer lunes del mes: de una semana a otra casi no cambia).
 *
 * Las reglas de un mail (todo inline, en tablas, Arial) son las de `lib/parte/html.core.js`.
 */

import { BASE } from '../parte/formato.core.js'

const C = { pagina: '#eef0f4', carta: '#ffffff', borde: '#e5e7eb', tinta: '#111827', texto: '#374151', gris: '#6b7280', indigo: '#4f46e5', rojo: '#dc2626' }
const FUENTE = 'Arial,Helvetica,sans-serif'
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const num = (n) => Number(n).toLocaleString('es-AR', { maximumFractionDigits: 1 })
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const dia = (iso) => `${Number(iso.slice(8, 10))}-${MESES[Number(iso.slice(5, 7)) - 1]}`

/** Cuántos renglones entran por lista: el correo se lee en cinco minutos. */
export const TOPE_RENGLONES = 25

/** ¿Va la lista mensual? El primer lunes del mes (día 1 a 7). */
export const esPrimerLunes = (hoy) => Number(hoy.slice(8, 10)) <= 7

/**
 * @param {{
 *   hoy: string,
 *   sinDeposito: { name: string, size: string, porSemana: number, local: number, dep: number }[],
 *   noEncontradas: { name: string, size: string, veces: number, unidades: number }[] | null,
 *   sinVenta: { name: string, local: number, dep: number }[] | null,
 * }} p  `noEncontradas` null = el armado todavía no se usa. `sinVenta` null = no es el primer lunes.
 */
export function armarSemanal({ hoy, sinDeposito, noEncontradas, sinVenta }) {
  const secciones = []
  secciones.push({
    titulo: 'Para comprar: se vende y no queda en el depósito',
    ayuda: 'Vidrios y accesorios (las fundas se importan y no van acá). La reposición no puede llevar al local lo que no hay atrás.',
    vacio: 'Nada: todo lo que se vende tiene stock en el depósito.',
    cols: ['Producto', 'Por semana', 'Local', 'Depósito'],
    filas: sinDeposito.map((x) => [nombre(x), num(x.porSemana), String(x.local), String(x.dep)]),
  })
  if (noEncontradas)
    secciones.push({
      titulo: 'No encontradas al armar (últimos 7 días)',
      ayuda: 'El sistema dice que hay y en el estante no: hay que contarlas.',
      vacio: 'Nada: todo lo pedido apareció.',
      cols: ['Producto', 'Veces', 'Unidades'],
      filas: noEncontradas.map((x) => [nombre(x), String(x.veces), String(x.unidades)]),
    })
  if (sinVenta)
    secciones.push({
      titulo: 'Sin ninguna venta en 60 días',
      ayuda: 'Ni en el local, ni online, ni mayorista. Liquidar, dejar de comprar o mover. Va una vez por mes.',
      vacio: 'Nada: todo lo que tiene stock vendió algo.',
      cols: ['Producto', 'Local', 'Depósito'],
      filas: sinVenta.map((x) => [x.name, String(x.local), String(x.dep)]),
    })

  const partes = [`${sinDeposito.length} sin depósito`]
  if (noEncontradas && noEncontradas.length) partes.push(`${noEncontradas.length} no encontradas`)
  if (sinVenta) partes.push(`${sinVenta.length} sin ventas`)
  const asunto = `Reposición BDI · semana del ${dia(hoy)}: ${partes.join(' · ')}`
  return { asunto, texto: texto(secciones), html: html(hoy, asunto, secciones), secciones }
}

const nombre = (x) => `${x.name}${x.size && x.size !== '-' ? ` · ${x.size}` : ''}`

function cortar(filas) {
  return filas.length > TOPE_RENGLONES ? { ver: filas.slice(0, TOPE_RENGLONES), resto: filas.length - TOPE_RENGLONES } : { ver: filas, resto: 0 }
}

function texto(secciones) {
  const out = []
  for (const s of secciones) {
    out.push(s.titulo.toUpperCase())
    out.push(`  ${s.ayuda}`)
    if (!s.filas.length) out.push(`  ${s.vacio}`)
    const { ver, resto } = cortar(s.filas)
    for (const f of ver) out.push(`   - ${f[0]} · ${s.cols.slice(1).map((c, i) => `${c} ${f[i + 1]}`).join(' · ')}`)
    if (resto) out.push(`   … y ${resto} más`)
    out.push('')
  }
  out.push(`Detalle en el Monitor: ${BASE}/reposicion?m=bdi`)
  return out.join('\n')
}

function tabla(s) {
  if (!s.filas.length) return `<div style="margin:10px 0 0;font-family:${FUENTE};font-size:13px;color:${C.gris}">${esc(s.vacio)}</div>`
  const { ver, resto } = cortar(s.filas)
  const th = s.cols
    .map((c, i) => `<td style="padding:0 8px 4px ${i ? '8px' : '0'};font-family:${FUENTE};font-size:11px;color:${C.gris};text-transform:uppercase;${i ? 'text-align:center' : ''}">${esc(c)}</td>`)
    .join('')
  const filas = ver
    .map(
      (f) =>
        `<tr>${f.map((v, i) => `<td style="padding:5px ${i ? '8px' : '8px 5px 0'};border-top:1px solid ${C.borde};font-family:${FUENTE};font-size:13px;color:${C.texto};${i ? 'text-align:center;white-space:nowrap' : ''}">${esc(v)}</td>`).join('')}</tr>`,
    )
    .join('')
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:10px 0 0;border-collapse:collapse"><tr>${th}</tr>${filas}</table>${
    resto ? `<div style="margin:6px 0 0;font-family:${FUENTE};font-size:12px;color:${C.gris}">… y ${resto} más</div>` : ''
  }`
}

function html(hoy, asunto, secciones) {
  const cuerpo = secciones
    .map(
      (s) => `<tr><td style="padding:18px 20px;border-top:1px solid ${C.borde}">
<div style="font-family:${FUENTE};font-size:15px;font-weight:bold;color:${C.tinta}">${esc(s.titulo)}${s.filas.length ? ` <span style="color:${C.rojo}">(${s.filas.length})</span>` : ''}</div>
<div style="font-family:${FUENTE};font-size:12px;color:${C.gris};margin-top:3px">${esc(s.ayuda)}</div>
${tabla(s)}
</td></tr>`,
    )
    .join('')
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(asunto)}</title></head>
<body style="margin:0;padding:0;background:${C.pagina}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.pagina}"><tr><td align="center" style="padding:16px 8px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${C.carta};border-radius:12px;border:1px solid ${C.borde}">
<tr><td style="padding:18px 20px 4px;font-family:${FUENTE}"><div style="font-size:12px;color:${C.gris};text-transform:uppercase;letter-spacing:.04em">BDI · lunes ${esc(dia(hoy))}</div>
<div style="font-size:19px;font-weight:bold;color:${C.tinta};margin-top:4px">Reposición: lo que hay que decidir</div></td></tr>
${cuerpo}
<tr><td style="padding:14px 20px 18px;border-top:1px solid ${C.borde};font-family:${FUENTE}"><a href="${BASE}/reposicion?m=bdi" style="color:${C.indigo};text-decoration:none;font-weight:bold;font-size:13px">Ver la reposición en el Monitor →</a></td></tr>
</table></td></tr></table></body></html>`
}
