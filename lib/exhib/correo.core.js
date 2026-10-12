/**
 * **El correo del chequeo de exhibición** (Darío, 12-oct-2026): apenas la empleada cierra el
 * recorrido, a los dueños les llega el balance —cuánto se escaneó contra lo que había que escanear,
 * lo pendiente de exhibición, las duplicadas y la feria en el sector regular—. Puro: recibe el
 * reporte y devuelve asunto, texto y HTML. Lo manda `api/_exhib.js` (acción `correo`).
 *
 * 🔑 *«la nueva forma es no ir a buscar yo como dueño la información sino que a través del correo me
 * empiecen a reportar qué se fue haciendo y los errores»*. Y el chequeo es **un solo recorrido, en
 * un solo momento**: *«no me sirve que lo hagan a medias»* ⇒ si lo escaneado queda debajo de
 * `COMPLETO_PCT` de lo regular, el asunto lo dice.
 *
 * 🔴 **El reporte lo CALCULA el celular** (`reporteDelChequeo`, `lib/exhib/reporte.ts`) y viaja
 * armado: un handler ⛔ puede importar TypeScript. Acá ⛔ se recalcula nada; `limpiarReporte`
 * sólo lo acota (es lo que manda un teléfono). Quién y a qué hora salen de la BASE, ⛔ del teléfono.
 *
 * Las reglas de un mail (todo inline, en tablas, Arial) son las de `lib/reposicion/correo.core.js`.
 */

import { BASE } from '../parte/formato.core.js'

/** Debajo de esto, el chequeo se considera hecho a medias (Darío: «no me sirve a medias»). */
export const COMPLETO_PCT = 90
/** Techo de renglones por lista: un reporte normal tiene ~100; esto es sólo para que ⛔ entre basura sin fin. */
const MAX_FILAS = 2000

const TZ = 'America/Argentina/Buenos_Aires'
const C = {
  pagina: '#eef0f4', carta: '#ffffff', borde: '#e5e7eb', tinta: '#111827', texto: '#374151', gris: '#6b7280',
  indigo: '#4f46e5', rojo: '#dc2626', rojoFondo: '#fef2f2', ambar: '#b45309', ambarFondo: '#fffbeb', verde: '#15803d', verdeFondo: '#f0fdf4',
}
const FUENTE = 'Arial,Helvetica,sans-serif'

const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const str = (v, max = 200) => (v == null ? '' : String(v).slice(0, max))
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const dia = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null)
/** «Variante Única» ⛔ dice nada. */
const variante = (s) => (/^variante\s+[uú]nica$/i.test(String(s || '').trim()) ? '' : String(s || '').trim())

/** `HH:MM` en Argentina: el servidor está en UTC. */
export function horaAR(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ })
}
/** `2026-10-13` (o una hora ISO) → `13-oct`. */
export function diaCorto(fecha) {
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  const d0 = String(fecha).length > 10 ? new Date(fecha).toLocaleDateString('en-CA', { timeZone: TZ }) : String(fecha)
  const [, m, d] = d0.split('-').map(Number)
  return `${d}-${MES[m - 1]}`
}
function duracion(desde, hasta) {
  if (!desde || !hasta) return null
  const min = Math.max(0, Math.round((Date.parse(hasta) - Date.parse(desde)) / 60000))
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`
}

/**
 * El reporte tal como lo manda el celular, acotado: tipos, largos y cantidad de renglones.
 * @param {any} r
 */
export function limpiarReporte(r) {
  const o = r && typeof r === 'object' ? r : {}
  const lista = (v) => (Array.isArray(v) ? v.slice(0, MAX_FILAS) : [])
  const lugares = (v) => (Array.isArray(v) ? v.slice(0, 20).map((x) => str(x, 80)) : [])
  return {
    vistas: num(o.vistas),
    total: num(o.total),
    porUnaVariante: num(o.porUnaVariante),
    escaneos: num(o.escaneos),
    noLeyo: num(o.noLeyo),
    porLugar: lista(o.porLugar).slice(0, 50).map((x) => ({ lugar: str(x?.lugar, 80), escaneos: num(x?.escaneos) })),
    nuevosDesde: o.nuevosDesde && dia(o.nuevosDesde.desde) ? { desde: dia(o.nuevosDesde.desde), hayAnterior: !!o.nuevosDesde.hayAnterior } : null,
    pendientes: lista(o.pendientes).map((p) => ({
      sku: str(p?.sku, 60), nombre: str(p?.nombre), variante: str(p?.variante, 80), enLocal: num(p?.enLocal), unaCualquiera: !!p?.unaCualquiera, nuevo: dia(p?.nuevo),
    })),
    duplicadas: lista(o.duplicadas).map((d) => ({
      sku: str(d?.sku, 60), nombre: str(d?.nombre), variante: str(d?.variante, 80), veces: num(d?.veces), lugares: lugares(d?.lugares), otrasEnMedio: num(d?.otrasEnMedio),
    })),
    feria: lista(o.feria).map((f) => ({ sku: str(f?.sku, 60), nombre: str(f?.nombre), variante: str(f?.variante, 80), veces: num(f?.veces), lugares: lugares(f?.lugares) })),
  }
}

const pctDe = (r) => (r.total ? Math.round((r.vistas / r.total) * 100) : 0)
const desdeTexto = (n) => (n ? (n.hayAnterior ? `desde el chequeo del ${diaCorto(n.desde)}` : `desde el ${diaCorto(n.desde)}`) : '')
const nombreDe = (x) => `${x.nombre}${x.unaCualquiera ? ' (una cualquiera)' : variante(x.variante) ? ` ${variante(x.variante)}` : ''}`
const marcasDe = (p) => [p.nuevo ? `Nuevo ${diaCorto(p.nuevo)}` : '', p.enLocal === 1 ? '1 sola' : ''].filter(Boolean)
const dondeDup = (d) => (d.lugares.length > 1 ? `en ${d.lugares.slice(0, -1).join(', ')} y ${d.lugares.at(-1)}` : '')
/** Entre las dos lecturas ⛔ pasó otra prenda: puede ser la misma pasada dos veces. */
const pegadaDup = (d) => (d.otrasEnMedio === 0 ? 'puede ser la misma pasada dos veces' : '')

/**
 * El correo entero.
 * @param {{ recorrido: { persona?: string|null, creado_en?: string, cerrado_en?: string|null }, reporte: ReturnType<typeof limpiarReporte> }} p
 */
export function armarCorreoChequeo({ recorrido, reporte: r }) {
  const cuando = recorrido.cerrado_en || recorrido.creado_en || new Date().toISOString()
  const pct = pctDe(r)
  const incompleto = pct < COMPLETO_PCT
  const nPend = r.pendientes.length
  const nDup = r.duplicadas.length
  const asunto = incompleto
    ? `⚠️ Chequeo de exhibición ${diaCorto(cuando)}: incompleto (${pct} %) · ${nPend} pendientes`
    : `Chequeo de exhibición ${diaCorto(cuando)}: ${nPend} pendientes · ${nDup} duplicadas`
  const resumen = {
    persona: recorrido.persona || '—',
    inicio: recorrido.creado_en || null,
    fin: recorrido.cerrado_en || null,
    duracion: duracion(recorrido.creado_en, recorrido.cerrado_en),
    pct,
    incompleto,
    nuevos: r.pendientes.filter((p) => p.nuevo).length,
    unaSola: r.pendientes.filter((p) => p.enLocal === 1).length,
  }
  return { asunto, texto: texto(cuando, resumen, r), html: html(cuando, asunto, resumen, r) }
}

// ── Texto plano ─────────────────────────────────────────────────────────────────────────────────

function texto(cuando, s, r) {
  const out = []
  out.push(`CHEQUEO DE EXHIBICIÓN · ZATTIA · ${diaCorto(cuando)}`)
  out.push(`${s.persona} · ${horaAR(s.inicio)} a ${horaAR(s.fin)}${s.duracion ? ` · ${s.duracion}` : ''}`)
  out.push(`Escaneadas ${r.vistas} de ${r.total} variantes regulares (${s.pct} %)${s.incompleto ? ' · ⚠️ INCOMPLETO' : ''}`)
  out.push(`${r.escaneos} lecturas${r.noLeyo ? ` · ${r.noLeyo} no leídas` : ''}${r.porLugar.length ? ` · ${r.porLugar.map((l) => `${l.lugar || 'sin lugar'} ${l.escaneos}`).join(' · ')}` : ''}`)
  out.push('')
  out.push(`PENDIENTE DE EXHIBICIÓN (${r.pendientes.length})${s.nuevos ? ` · ${s.nuevos} nuevos ${desdeTexto(r.nuevosDesde)}` : ''}${s.unaSola ? ` · ${s.unaSola} con 1 sola unidad` : ''}`)
  for (const p of r.pendientes) out.push(`  - ${p.sku || '(sin SKU)'} ${nombreDe(p)} · en el local ${p.enLocal}${marcasDe(p).length ? ` · ${marcasDe(p).join(' · ')}` : ''}`)
  out.push('')
  out.push(`VARIANTES DUPLICADAS (${r.duplicadas.length})`)
  for (const d of r.duplicadas) out.push(`  - ${d.sku || '(sin SKU)'} ${nombreDe(d)} · ×${d.veces}${dondeDup(d) ? ` · ${dondeDup(d)}` : ''}${pegadaDup(d) ? ` · ${pegadaDup(d)}` : ''}`)
  if (r.feria.length) {
    out.push('')
    out.push(`FERIA EN EL SECTOR REGULAR (${r.feria.length})`)
    for (const f of r.feria) out.push(`  - ${f.sku || '(sin SKU)'} ${nombreDe(f)}${f.lugares.length ? ` · ${f.lugares.join(', ')}` : ''}`)
  }
  out.push('')
  out.push(`Detalle en el Monitor: ${BASE}/exhib?m=zattia`)
  return out.join('\n')
}

// ── El dibujo ───────────────────────────────────────────────────────────────────────────────────

const celda = (contenido, extra = '') => `<td style="padding:6px 8px 6px 0;border-top:1px solid ${C.borde};font-family:${FUENTE};font-size:13px;color:${C.tinta};${extra}">${contenido}</td>`
const encabezado = (cols) =>
  `<tr>${cols.map(([t, a]) => `<td style="padding:0 8px 4px 0;font-family:${FUENTE};font-size:11px;color:${C.gris};text-transform:uppercase${a ? `;text-align:${a}` : ''}">${t}</td>`).join('')}</tr>`
const prenda = (x) => `<b>${esc(x.sku || '(sin SKU)')}</b><div style="color:${C.texto}">${esc(nombreDe(x))}</div>`
const etiqueta = (t, color) => `<span style="display:inline-block;margin:2px 4px 0 0;padding:1px 6px;border:1px solid ${color};border-radius:4px;color:${color};font-size:11px;font-weight:bold;white-space:nowrap">${esc(t)}</span>`

function seccion(titulo, sub, tabla, vacio) {
  return `<tr><td style="padding:18px 20px;border-top:1px solid ${C.borde}">
<div style="font-family:${FUENTE};font-size:15px;font-weight:bold;color:${C.tinta}">${esc(titulo)}</div>
${sub ? `<div style="font-family:${FUENTE};font-size:12px;color:${C.gris};margin-top:2px">${esc(sub)}</div>` : ''}
${tabla ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:10px 0 0;border-collapse:collapse">${tabla}</table>` : `<div style="font-family:${FUENTE};font-size:13px;color:${C.gris};margin-top:8px">${esc(vacio)}</div>`}
</td></tr>`
}

function html(cuando, asunto, s, r) {
  const [tinta, fondo] = s.incompleto ? [C.rojo, C.rojoFondo] : [C.verde, C.verdeFondo]
  const numero = (n, rotulo, color = C.tinta) =>
    `<td style="padding:6px 18px 6px 0;font-family:${FUENTE}"><div style="font-size:20px;font-weight:bold;color:${color}">${n}</div><div style="font-size:12px;color:${C.gris}">${rotulo}</div></td>`

  const cabecera = `<tr><td style="padding:18px 20px 14px;font-family:${FUENTE}">
<div style="font-size:12px;color:${C.gris};text-transform:uppercase;letter-spacing:.04em">Zattia · ${esc(diaCorto(cuando))}</div>
<div style="font-size:19px;font-weight:bold;color:${C.tinta};margin-top:4px">Chequeo de exhibición</div>
<div style="font-size:13px;color:${C.texto};margin-top:4px">${esc(s.persona)} · de ${horaAR(s.inicio)} a ${horaAR(s.fin)}${s.duracion ? ` · ${esc(s.duracion)}` : ''}</div>
<div style="margin:10px 0 0;padding:10px 12px;border-radius:8px;background:${fondo};color:${tinta};font-size:13px;font-weight:bold">${s.incompleto ? `Incompleto: se escaneó el ${s.pct} % de lo regular` : `Completo: se escaneó el ${s.pct} % de lo regular`}</div>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 0"><tr>
${numero(`${r.vistas} / ${r.total}`, 'Escaneadas / a escanear')}${numero(r.pendientes.length, 'Pendientes', r.pendientes.length ? C.ambar : C.tinta)}${numero(r.duplicadas.length, 'Duplicadas', r.duplicadas.length ? C.ambar : C.tinta)}
</tr></table>
<div style="font-size:12px;color:${C.gris};margin-top:4px">${r.escaneos} lecturas${r.noLeyo ? ` · <span style="color:${C.rojo}">${r.noLeyo} no leídas</span>` : ''}${r.porLugar.length ? ` · ${esc(r.porLugar.map((l) => `${l.lugar || 'sin lugar'} ${l.escaneos}`).join(' · '))}` : ''}</div>
</td></tr>`

  const pend = r.pendientes.length
    ? encabezado([['Prenda'], ['En el local', 'center']]) +
      r.pendientes
        .map((p) => {
          const marcas = [p.nuevo ? etiqueta(`Nuevo ${diaCorto(p.nuevo)}`, C.indigo) : '', p.enLocal === 1 ? etiqueta('1 sola', C.rojo) : ''].join('')
          return `<tr>${celda(prenda(p) + (marcas ? `<div>${marcas}</div>` : ''))}${celda(p.enLocal, 'text-align:center')}</tr>`
        })
        .join('')
    : ''
  const subPend = [s.nuevos ? `${s.nuevos} nuevos ${desdeTexto(r.nuevosDesde)}` : '', s.unaSola ? `${s.unaSola} con 1 sola unidad` : '', r.porUnaVariante ? `${r.porUnaVariante} sin pedir por «una sola variante»` : ''].filter(Boolean).join(' · ')

  const dup = r.duplicadas.length
    ? encabezado([['Prenda'], ['Veces', 'center']]) +
      r.duplicadas
        .map((d) => {
          const nota = [dondeDup(d), pegadaDup(d)].filter(Boolean).join(' · ')
          return `<tr>${celda(prenda(d) + (nota ? `<div style="font-size:12px;color:${C.gris}">${esc(nota)}</div>` : ''))}${celda(d.veces, 'text-align:center')}</tr>`
        })
        .join('')
    : ''

  const feria = r.feria.length
    ? encabezado([['Prenda'], ['Dónde']]) + r.feria.map((f) => `<tr>${celda(prenda(f))}${celda(esc(f.lugares.join(', ') || '—'))}</tr>`).join('')
    : ''

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(asunto)}</title></head>
<body style="margin:0;padding:0;background:${C.pagina}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.pagina}"><tr><td align="center" style="padding:16px 8px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${C.carta};border-radius:12px;border:1px solid ${C.borde}">
${cabecera}
${seccion(`Pendiente de exhibición (${r.pendientes.length})`, subPend, pend, 'No hay variantes pendientes.')}
${seccion(`Variantes duplicadas (${r.duplicadas.length})`, 'Fuera de los percheros frontales, sobra una por renglón.', dup, 'No hay variantes duplicadas.')}
${r.feria.length ? seccion(`Feria en el sector regular (${r.feria.length})`, 'Para decidir después.', feria, '') : ''}
<tr><td style="padding:14px 20px 18px;border-top:1px solid ${C.borde};font-family:${FUENTE}"><a href="${BASE}/exhib?m=zattia" style="color:${C.indigo};text-decoration:none;font-weight:bold;font-size:13px">Ver el reporte en el Monitor →</a></td></tr>
</table></td></tr></table></body></html>`
}
