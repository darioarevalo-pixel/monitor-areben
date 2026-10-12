/**
 * **El correo de las 10:00 de la reposición** (Darío, 11/12-oct-2026): cómo quedó la reposición del
 * día cuando abre el local. Puro: recibe las filas de `repo_armado` y devuelve asunto, texto y HTML.
 * Lo manda `scripts/reposicion-correo.mjs`. La ficha es `docs/secciones/reposicion.md`.
 *
 * 🔑 Lo que pidió Darío: lo pedido contra lo llevado, lo no encontrado, las devoluciones, la hora y
 * quién, y **el aviso si no se cerró** (a las 10:00 la reposición tiene que estar en el local).
 * Poco texto: de cada armado sólo se listan los renglones que NO salieron completos.
 *
 * Las reglas de un mail (todo inline, en tablas, Arial) son las de `lib/parte/html.core.js`.
 */

import { BASE } from '../parte/formato.core.js'

/** Los estados que todavía no cerraron (mismos que `api/_repo-armado.js`). */
const ABIERTOS = ['en_curso', 'transfiriendo', 'revisar']

/** Cuántos días se miran para «también faltó antes». */
export const DIAS_VECES = 14

const TZ = 'America/Argentina/Buenos_Aires'

const C = {
  pagina: '#eef0f4', carta: '#ffffff', borde: '#e5e7eb', tinta: '#111827', texto: '#374151', gris: '#6b7280',
  indigo: '#4f46e5', rojo: '#dc2626', rojoFondo: '#fef2f2', ambar: '#b45309', ambarFondo: '#fffbeb', verde: '#15803d', verdeFondo: '#f0fdf4',
}
const FUENTE = 'Arial,Helvetica,sans-serif'

const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** «Variante Única» no dice nada (igual que `talle` de `armado.ts`). */
const talle = (s) => (/^variante\s+[uú]nica$/i.test(String(s || '').trim()) ? '' : String(s || '').trim())

/** `HH:MM` en Argentina: el script corre en Actions, que está en UTC. */
export function horaAR(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ })
}

/** `13-oct` a partir de `2026-10-13`. */
export function diaCorto(fecha) {
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  const [, m, d] = String(fecha).split('-').map(Number)
  return `${d}-${MES[m - 1]}`
}

function duracion(desde, hasta) {
  if (!desde || !hasta) return null
  const min = Math.max(0, Math.round((Date.parse(hasta) - Date.parse(desde)) / 60000))
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`
}

/**
 * Las veces que cada variante quedó «no encontrada» en los armados transferidos ANTERIORES a hoy:
 * la misma señal que «Más veces no encontradas» del Historial (stock mal cargado).
 */
export function vecesNoEncontrada(anteriores) {
  const m = new Map()
  for (const a of anteriores) {
    if (a.estado !== 'transferido') continue
    for (const l of a.pedido || []) {
      const f = a.faltantes?.[l.vid]
      if (f === 'no-estaba' || f === 'rechazada') m.set(l.vid, (m.get(l.vid) || 0) + 1)
    }
  }
  return m
}

/**
 * Un armado en palabras: el estado, los números y los renglones que no salieron completos.
 * `faltante`: 'no-estaba' | 'rechazada' | 'despues' | 'sin-respuesta' (sin escanear y sin contestar).
 */
export function resumirArmado(a, veces = new Map()) {
  const escaneos = a.escaneos || {}
  const faltantes = a.faltantes || {}
  let pedidas = 0
  let llevadas = 0
  const renglones = []
  for (const l of a.pedido || []) {
    const n = Math.min(l.cant, escaneos[l.vid] || 0)
    pedidas += l.cant
    llevadas += n
    if (n >= l.cant) continue
    renglones.push({
      sku: l.sku || '',
      nombre: l.name,
      talle: talle(l.size),
      falta: l.cant - n,
      pedida: l.cant,
      motivo: faltantes[l.vid] || 'sin-respuesta',
      antes: veces.get(l.vid) || 0,
    })
  }
  // Las no encontradas primero (son las que piden acción), después el resto; dentro, por SKU.
  const peso = { 'no-estaba': 0, rechazada: 1, 'sin-respuesta': 2, despues: 3 }
  renglones.sort((x, y) => peso[x.motivo] - peso[y.motivo] || x.sku.localeCompare(y.sku, 'es', { numeric: true }))

  const t = a.transfer || {}
  const transferencias = (t.tandas || []).map((x) => x.transfer_id).filter((x) => x != null)
  if (!transferencias.length && t.transfer_id != null) transferencias.push(t.transfer_id)

  let estado
  if (a.estado === 'transferido') estado = 'finalizado'
  else if (a.estado === 'revisar' || a.estado === 'transfiriendo') estado = 'revisar'
  else estado = 'en-curso'

  return {
    sentido: a.sentido,
    linea: a.linea,
    fecha: a.fecha,
    persona: a.persona || '—',
    estado,
    inicio: a.creado_en,
    fin: a.cerrado_en,
    duracion: estado === 'finalizado' ? duracion(a.creado_en, a.cerrado_en) : null,
    pedidas,
    llevadas,
    noEncontradas: renglones.filter((r) => r.motivo === 'no-estaba' || r.motivo === 'rechazada').reduce((s, r) => s + r.falta, 0),
    renglones,
    transferencias,
    error: a.error || null,
  }
}

const TITULO = { llevar: 'Reposición (depósito → local)', devolver: 'Devolución (local → depósito)' }
const MOTIVO = { 'no-estaba': 'No encontrada', rechazada: 'Rechazada por GN', despues: 'Pendiente', 'sin-respuesta': 'Sin escanear' }

/**
 * El correo entero.
 * @param {{ hoy: string, armados: any[], anteriores: any[] }} p
 *   `armados`: los de hoy (sin descartados) + los abiertos de cualquier día. `anteriores`: los
 *   transferidos de los últimos `DIAS_VECES` días, sin los de hoy.
 */
export function armarCorreo({ hoy, armados, anteriores }) {
  const veces = vecesNoEncontrada(anteriores)
  const vistos = new Set()
  const lista = []
  for (const a of armados) {
    if (vistos.has(a.id) || a.estado === 'cancelado') continue
    if (a.fecha !== hoy && !ABIERTOS.includes(a.estado)) continue
    vistos.add(a.id)
    lista.push(a)
  }
  lista.sort((x, y) => String(x.creado_en).localeCompare(String(y.creado_en)))

  // Zattia siempre (la reposición es diaria); Stunned sólo si hubo movimiento: hoy no tiene rutina propia.
  const secciones = []
  for (const linea of ['zattia', 'stunned']) {
    // ⛔ Sin la devolución (Darío, 12-oct-2026: «por ahora no»). Se suma agregando 'devolver' acá.
    for (const sentido of ['llevar']) {
      const deAca = lista.filter((a) => (a.linea || 'zattia') === linea && a.sentido === sentido).map((a) => resumirArmado(a, veces))
      if (linea === 'stunned' && !deAca.length) continue
      secciones.push({ linea, sentido, armados: deAca })
    }
  }

  const repo = secciones.find((s) => s.linea === 'zattia' && s.sentido === 'llevar')
  const todos = secciones.flatMap((s) => s.armados)
  const noEnc = repo.armados.reduce((s, r) => s + r.noEncontradas, 0)

  // 🔑 El asunto avisa por la REPOSICIÓN de Zattia, que es la que tiene que estar a las 10:00. Una
  // transferencia sin confirmar (también de Stunned) gana: puede haber stock movido sin que nadie lo sepa.
  let asunto
  if (todos.some((r) => r.estado === 'revisar')) asunto = `⚠️ Reposición ${diaCorto(hoy)}: transferencia a verificar`
  else if (!repo.armados.length) asunto = `⚠️ Reposición ${diaCorto(hoy)}: sin iniciar`
  else if (repo.armados.some((r) => r.estado !== 'finalizado')) asunto = `⚠️ Reposición ${diaCorto(hoy)}: sin transferir`
  else asunto = `Reposición ${diaCorto(hoy)}: transferida${noEnc ? ` · ${noEnc} no encontrada${noEnc === 1 ? '' : 's'}` : ''}`

  return { asunto, texto: texto(hoy, secciones), html: html(hoy, asunto, secciones), secciones }
}

// ── Las palabras de un armado ───────────────────────────────────────────────────────────────────

function estadoTexto(r, hoy) {
  const desde = r.fecha !== hoy ? ` (iniciada el ${diaCorto(r.fecha)})` : ''
  if (r.estado === 'finalizado') return `Transferida a las ${horaAR(r.fin)} · ${r.persona}${r.duracion ? ` · ${r.duracion}` : ''}`
  if (r.estado === 'revisar') return `Transferencia sin confirmar: verificar en Gestión Nube${desde} · ${r.persona}`
  return `Sin transferir: iniciada a las ${horaAR(r.inicio)}${desde} · ${r.persona}`
}

// 🔑 «Transferidas» sólo si la transferencia salió: antes de Finalizar no se movió nada en GN y son
// sólo escaneadas (Darío, 12-oct-2026: «Llevadas» confundía).
const rotuloHechas = (r) => (r.estado === 'finalizado' ? 'Transferidas' : 'Escaneadas')

const nombreRenglon = (x) => `${x.nombre}${x.talle ? ` ${x.talle}` : ''}`
const antesTexto = (x) => (x.antes ? `ya faltó ${x.antes} ${x.antes === 1 ? 'vez' : 'veces'} en ${DIAS_VECES} días` : '')

function texto(hoy, secciones) {
  const out = []
  for (const s of secciones) {
    out.push(`${s.linea === 'stunned' ? 'STUNNED · ' : ''}${TITULO[s.sentido].toUpperCase()}`)
    if (!s.armados.length) out.push(s.sentido === 'llevar' ? '  ⚠️ No se inició.' : '  No se inició.')
    for (const r of s.armados) {
      out.push(`  ${estadoTexto(r, hoy)}`)
      out.push(`  Pedidas ${r.pedidas} · ${rotuloHechas(r)} ${r.llevadas}${r.noEncontradas ? ` · No encontradas ${r.noEncontradas}` : ''}`)
      if (r.transferencias.length) out.push(`  Transferencia en GN: ${r.transferencias.join(', ')}`)
      for (const x of r.renglones) out.push(`   - ${x.sku ? `${x.sku} ` : ''}${nombreRenglon(x)} · faltan ${x.falta} de ${x.pedida} · ${MOTIVO[x.motivo]}${x.antes ? ` (${antesTexto(x)})` : ''}`)
    }
    out.push('')
  }
  out.push(`Detalle en el Monitor: ${BASE}/reposicion?m=zattia`)
  return out.join('\n')
}

// ── El dibujo ───────────────────────────────────────────────────────────────────────────────────

const TONO = {
  finalizado: [C.verde, C.verdeFondo],
  'en-curso': [C.ambar, C.ambarFondo],
  revisar: [C.rojo, C.rojoFondo],
}

function bloqueArmado(r, sentido, hoy) {
  const [tinta, fondo] = TONO[r.estado]
  const num = (n, rotulo, color = C.tinta) =>
    `<td style="padding:6px 14px 6px 0;font-family:${FUENTE}"><div style="font-size:20px;font-weight:bold;color:${color}">${n}</div><div style="font-size:12px;color:${C.gris}">${rotulo}</div></td>`
  const filas = r.renglones
    .map((x) => {
      const rojo = x.motivo === 'no-estaba' || x.motivo === 'rechazada'
      return `<tr>
<td style="padding:6px 8px 6px 0;border-top:1px solid ${C.borde};font-family:${FUENTE};font-size:13px;color:${C.tinta}"><b>${esc(x.sku)}</b><div style="color:${C.texto}">${esc(nombreRenglon(x))}</div></td>
<td style="padding:6px 8px;border-top:1px solid ${C.borde};font-family:${FUENTE};font-size:13px;color:${C.tinta};text-align:center;white-space:nowrap">${x.falta} de ${x.pedida}</td>
<td style="padding:6px 0 6px 8px;border-top:1px solid ${C.borde};font-family:${FUENTE};font-size:13px;color:${rojo ? C.rojo : C.texto}">${MOTIVO[x.motivo]}${x.antes ? `<div style="font-size:12px;color:${C.gris}">${esc(antesTexto(x))}</div>` : ''}</td>
</tr>`
    })
    .join('')
  return `<div style="margin:10px 0 0;padding:10px 12px;border-radius:8px;background:${fondo};color:${tinta};font-family:${FUENTE};font-size:13px;font-weight:bold">${esc(estadoTexto(r, hoy))}</div>
${r.error && r.estado === 'revisar' ? `<div style="margin:6px 0 0;font-family:${FUENTE};font-size:12px;color:${C.gris}">${esc(r.error)}</div>` : ''}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 0"><tr>
${num(r.pedidas, 'Pedidas')}${num(r.llevadas, rotuloHechas(r))}${num(r.noEncontradas, 'No encontradas', r.noEncontradas ? C.rojo : C.tinta)}
</tr></table>
${r.transferencias.length ? `<div style="font-family:${FUENTE};font-size:12px;color:${C.gris}">Transferencia en GN: ${esc(r.transferencias.join(', '))}</div>` : ''}
${filas ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:10px 0 0;border-collapse:collapse">
<tr><td style="padding:0 8px 4px 0;font-family:${FUENTE};font-size:11px;color:${C.gris};text-transform:uppercase">Prenda</td><td style="padding:0 8px 4px;font-family:${FUENTE};font-size:11px;color:${C.gris};text-transform:uppercase;text-align:center">Faltan</td><td style="padding:0 0 4px 8px;font-family:${FUENTE};font-size:11px;color:${C.gris};text-transform:uppercase">Motivo</td></tr>
${filas}</table>` : ''}`
}

function html(hoy, asunto, secciones) {
  const cuerpo = secciones
    .map((s) => {
      const vacio = !s.armados.length
        ? `<div style="margin:10px 0 0;padding:10px 12px;border-radius:8px;background:${s.sentido === 'llevar' ? C.rojoFondo : '#f3f4f6'};color:${s.sentido === 'llevar' ? C.rojo : C.gris};font-family:${FUENTE};font-size:13px;font-weight:bold">No se inició.</div>`
        : ''
      return `<tr><td style="padding:18px 20px;border-top:1px solid ${C.borde}">
<div style="font-family:${FUENTE};font-size:15px;font-weight:bold;color:${C.tinta}">${s.linea === 'stunned' ? 'Stunned · ' : ''}${TITULO[s.sentido]}</div>
${vacio}${s.armados.map((r) => bloqueArmado(r, s.sentido, hoy)).join('')}
</td></tr>`
    })
    .join('')
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(asunto)}</title></head>
<body style="margin:0;padding:0;background:${C.pagina}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.pagina}"><tr><td align="center" style="padding:16px 8px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${C.carta};border-radius:12px;border:1px solid ${C.borde}">
<tr><td style="padding:18px 20px 4px;font-family:${FUENTE}"><div style="font-size:12px;color:${C.gris};text-transform:uppercase;letter-spacing:.04em">Zattia · ${esc(diaCorto(hoy))} · 10:00</div>
<div style="font-size:19px;font-weight:bold;color:${C.tinta};margin-top:4px">${esc(asunto.replace(/^⚠️ /, ''))}</div></td></tr>
${cuerpo}
<tr><td style="padding:14px 20px 18px;border-top:1px solid ${C.borde};font-family:${FUENTE}"><a href="${BASE}/reposicion?m=zattia" style="color:${C.indigo};text-decoration:none;font-weight:bold;font-size:13px">Ver el detalle en el Monitor →</a></td></tr>
</table></td></tr></table></body></html>`
}
