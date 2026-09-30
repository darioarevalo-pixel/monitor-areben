/**
 * **El dibujo del parte de la mañana.** Recibe el modelo de `mail.core.js` y devuelve el HTML.
 * Puro.
 *
 * Bruno el 30-sep-2026: *«me gustarían fotitos, html o algo que estéticamente sea lindo y te den
 * ganas de entrar… cuando hay cambio de marca, necesito poner los logos»*.
 *
 * # 🔴 Las reglas de un mail, que ⛔ son las de una página
 *
 * Son las de `areben-mailer` (su `AGENTS.md`), que ya manda mails de marca a clientas:
 * - **Todo inline y en tablas.** Gmail tira el `<style>` en muchos casos: ⛔ flex, ⛔ grid, ⛔
 *   `position`, ⛔ `box-shadow`, ⛔ `calc`.
 * - ⛔ **SVG ni imágenes en base64**: Gmail ⛔ las muestra. Las fotos y los logos son URLs públicas
 *   (`fotos.core.js`).
 * - **Gmail corta el mail arriba de ~102 KB** («Mensaje recortado»), y lo que queda abajo del corte
 *   ⛔ se ve. Por eso los topes de `mail.core.js`, y `tests/parte-manana.test.ts` exige < 90 KB.
 * - Arial: las fuentes web ⛔ llegan a Gmail ni a Outlook.
 * - ⛔ Hay modo oscuro armado a propósito: pintar sólo el marco deja texto oscuro sobre fondo
 *   oscuro (mismo razonamiento que el mailer).
 */

import { LOGOS } from './fotos.core.js'
import { BASE, TOPE_LISTA, entero, inicialDia, marca, plata, plataCorta } from './formato.core.js'
import { DIAS_PEDIR, DIAS_REPONER, DIAS_RECOMPRA, DIAS_VELOCIDAD, TOP_CURVA } from './stock.core.js'

// ── La paleta ───────────────────────────────────────────────────────────────────────────────────
// La del monitor (`app/tokens.css`): índigo de acento y los chips de marca.

const C = {
  pagina: '#eef0f4', carta: '#ffffff', borde: '#e5e7eb', tinta: '#111827', texto: '#374151', gris: '#6b7280', suave: '#9ca3af', fondoGris: '#f3f4f6',
  indigo: '#4f46e5',
  rojo: '#dc2626', rojoFondo: '#fef2f2', ambar: '#b45309', ambarFondo: '#fffbeb', azul: '#1d4ed8', azulFondo: '#eff6ff', verde: '#15803d', verdeFondo: '#f0fdf4',
}
const MARCA_COLOR = { bdi: '#1e40af', zattia: '#6d28d9', stunned: '#0f766e' }
const FUENTE = 'Arial,Helvetica,sans-serif'

const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Una tabla de maquetado: sin bordes ni espacios, como las del mailer. */
const tabla = (contenido, estilo = '') =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;${estilo}">${contenido}</table>`

// 🔴 Los estilos van cortos a propósito: se repiten en cada chip y cada renglón, y con las listas
// llenas pesaban 68 KB de 119 — por encima del corte de Gmail. Medido el 30-sep-2026.
const chip = (texto, color, fondo) =>
  `<span style="display:inline-block;padding:1px 7px;margin:2px 3px 2px 0;border-radius:9px;background:${fondo};color:${color};font-size:12px">${esc(texto)}</span>`

/** El chip de la comparación contra la semana: verde si sube, rojo si baja, gris si ⛔ hay con qué. */
function chipDelta(d) {
  if (!d || d.pct == null) return chip('sin comparación', C.gris, C.fondoGris)
  if (d.pct > 0) return chip(`${d.texto} vs. sem. pasada`, C.verde, C.verdeFondo)
  if (d.pct < 0) return chip(`${d.texto} vs. sem. pasada`, C.rojo, C.rojoFondo)
  return chip(`${d.texto} vs. sem. pasada`, C.gris, C.fondoGris)
}

const link = (href, texto) =>
  `<a href="${esc(href)}" style="color:${C.indigo};text-decoration:none;font-weight:bold;font-size:13px">${esc(texto)} →</a>`

/** La foto de 48 px, o un cuadrado gris con la inicial si el producto ⛔ tiene foto en Tienda Nube. */
function foto(url, nombre, lado = 48) {
  if (url) {
    return `<img src="${esc(url)}" width="${lado}" height="${lado}" alt="" style="display:block;border-radius:8px;border:1px solid ${C.borde}">`
  }
  const inicial = esc(String(nombre || '?').trim().charAt(0).toUpperCase())
  return `<div style="width:${lado}px;height:${lado}px;border-radius:8px;background:${C.fondoGris};color:${C.suave};font-size:${Math.round(lado / 2.4)}px;line-height:${lado}px;text-align:center;font-weight:bold">${inicial}</div>`
}

/** Un renglón de producto: foto, nombre, y abajo los chips o el detalle. */
function filaProducto({ foto: url, nombre, arriba, chips = [], colorChip = C.texto, fondoChip = C.fondoGris, detalle, lado = 48 }) {
  const td = `padding:7px 0;border-top:1px solid ${C.fondoGris}`
  return `<tr><td width="${lado + 12}" style="${td};vertical-align:top">${foto(url, nombre, lado)}</td><td style="${td}">`
    + (arriba ? `<div style="font-size:11px;color:${C.gris}">${esc(arriba.toUpperCase())}</div>` : '')
    + `<b style="font-size:14px">${esc(nombre)}</b>`
    + (chips.length ? `<div style="margin-top:3px">${chips.map((c) => chip(c, colorChip, fondoChip)).join('')}</div>` : '')
    + (detalle ? `<div style="font-size:13px;color:${C.texto};margin-top:2px">${detalle}</div>` : '')
    + '</td></tr>'
}

/** Una tarjeta de un bloque: filete de color a la izquierda, título, contenido y link. */
function tarjeta({ color, titulo, bajada, cuerpo, pie }) {
  return `<div style="margin:0 0 14px;border:1px solid ${C.borde};border-left:4px solid ${color};border-radius:10px;background:${C.carta};padding:12px 14px">`
    + `<div style="font-size:13px;font-weight:bold;color:${color};text-transform:uppercase;letter-spacing:.5px">${titulo}</div>`
    + (bajada ? `<div style="font-size:12px;color:${C.gris};margin-top:2px">${bajada}</div>` : '')
    + `<div style="margin-top:6px">${cuerpo}</div>`
    + (pie ? `<div style="margin-top:8px">${pie}</div>` : '')
    + '</div>'
}

const vacio = (texto) => `<div style="font-size:13px;color:${C.verde}">✓ ${esc(texto)}</div>`
const masDe = (n, href) => (n ? `<div style="font-size:12px;color:${C.gris};padding-top:6px">y ${n} más · ${link(href, 'ver todo')}</div>` : '')

// ── Las piezas grandes ──────────────────────────────────────────────────────────────────────────

/** Las 7 barras de la semana. Celdas con altura: lo único que dibuja un gráfico en Gmail. */
function barras(serie, color) {
  if (!serie || !serie.length) return ''
  const max = Math.max(...serie.map((d) => d.plata), 1)
  const ALTO = 44
  const celdas = serie.map((d, i) => {
    const h = Math.max(3, Math.round((d.plata / max) * ALTO))
    const ayer = i === serie.length - 1
    return `<td style="vertical-align:bottom;padding:0 2px;width:14px"><div style="height:${h}px;background:${color};opacity:${ayer ? 1 : 0.28};border-radius:3px 3px 0 0" title="${esc(plata(d.plata))}"></div></td>`
  }).join('')
  const letras = serie.map((d, i) => `<td style="padding:3px 2px 0;font-size:10px;color:${i === serie.length - 1 ? C.tinta : C.suave};text-align:center">${inicialDia(d.fecha)}</td>`).join('')
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr style="height:${ALTO}px">${celdas}</tr><tr>${letras}</tr></table>`
}

/** La franja de la marca: el logo sobre su fondo, y la línea fina del color de la marca. */
function franja(linea, fecha) {
  const l = LOGOS[linea]
  const nombre = l.nombre ? `<td style="padding-left:10px;font-size:20px;font-weight:bold;letter-spacing:3px;color:${l.tinta};vertical-align:middle">${esc(l.nombre)}</td>` : ''
  return `<div style="margin:28px 0 14px;background:${l.fondo};border:1px solid ${linea === 'stunned' ? l.fondo : C.borde};border-bottom:3px solid ${MARCA_COLOR[linea]};border-radius:12px;padding:14px 16px">`
    + tabla(`<tr><td style="vertical-align:middle">${tabla(`<tr><td style="vertical-align:middle;width:${l.ancho}px"><img src="${esc(l.url)}" width="${l.ancho}" height="${l.alto}" alt="${esc(marca(linea))}" style="display:block;width:${l.ancho}px;height:${l.alto}px;border:0"></td>${nombre}</tr>`, 'width:auto')}</td>`
      + `<td style="text-align:right;vertical-align:middle;font-size:12px;color:${linea === 'stunned' ? '#d1d5db' : C.gris}">${esc(fecha)}</td></tr>`)
    + '</div>'
}

function bloqueVenta(linea, v, completo) {
  const aviso = completo === false
    ? `<div style="margin-top:8px;padding:6px 10px;border-radius:8px;background:${C.ambarFondo};color:${C.ambar};font-size:12px">⚠️ Parcial: el sync de hoy todavía no corrió, falta parte del día.</div>`
    : completo == null ? `<div style="margin-top:8px;font-size:12px;color:${C.ambar}">⚠️ no se sabe si el día está completo.</div>` : ''
  const canales = v.canales.map((c) => chip(`${c.nombre} ${plataCorta(c.plata)} · ${c.compras}`, C.texto, C.fondoGris)).join('')
  const may = v.mayorista
    ? `<div style="font-size:12px;color:${C.gris};margin-top:6px">Mayorista aparte: <b style="color:${C.texto}">${plata(v.mayorista.plata)}</b> (${v.mayorista.compras}) · la semana pasada ${plata(v.mayorista.antes)} (${v.mayorista.comprasAntes})</div>`
    : ''
  const nota = v.nota ? `<div style="font-size:12px;color:${C.gris};margin-top:4px">${esc(v.nota)}</div>` : ''
  const izq = `<div style="font-size:12px;color:${C.gris};text-transform:uppercase;letter-spacing:.5px">Ayer · minorista</div>`
    + `<div style="font-size:30px;font-weight:bold;color:${C.tinta};line-height:36px">${plata(v.plata)}</div>`
    + `<div style="margin-top:2px">${chipDelta(v.delta)}</div>`
    + `<div style="font-size:13px;color:${C.texto};margin-top:6px">${entero(v.compras)} ventas · ${entero(v.unidades)} unidades</div>`
  return `<div style="margin:0 0 14px;border:1px solid ${C.borde};border-radius:12px;background:${C.carta};padding:16px">`
    + tabla(`<tr><td style="vertical-align:top">${izq}</td><td style="vertical-align:bottom;text-align:right;width:120px">${barras(v.serie7, MARCA_COLOR[linea])}<div style="font-size:10px;color:${C.suave};text-align:right;margin-top:2px">últimos 7 días</div></td></tr>`)
    + (canales ? `<div style="margin-top:10px">${canales}</div>` : '')
    + may + nota + aviso
    + `<div style="margin-top:10px">${link(`${BASE}/ventas-mensuales?m=${linea === 'stunned' ? 'zattia' : linea}`, 'Ventas día a día')}</div>`
    + '</div>'
}

function bloqueCriticos(linea, f) {
  const m = linea === 'stunned' ? 'zattia' : linea
  const repo = `${BASE}/reposicion?m=${m}`
  const n = f.sinStock.filas.length + f.pedir.filas.length + f.reponer.filas.length
  const fuera = f.rebajadas ? ` · ${entero(f.rebajadas)} u. vendidas con descuento no cuentan` : ''
  if (!n) {
    return tarjeta({ color: C.verde, titulo: `${esc(f.nombre)} · no puede faltar`, bajada: `Velocidad: venta a precio lleno de ${DIAS_VELOCIDAD} días${fuera}`, cuerpo: vacio(`Todo con más de ${DIAS_PEDIR} días de stock.`) })
  }
  const grupo = (titulo, color, fondo, l) => (l.filas.length
    ? `<div style="margin-top:10px;font-size:12px;font-weight:bold;color:${color}">${titulo}</div>`
      + tabla(l.filas.map((x) => filaProducto({ foto: x.foto, nombre: x.nombre, chips: x.chips, colorChip: color, fondoChip: fondo })).join(''))
      + masDe(l.mas, repo)
    : '')
  const cuerpo = grupo('● SIN STOCK EN NINGÚN LADO', C.rojo, C.rojoFondo, f.sinStock)
    + grupo(`● PEDIR AL PROVEEDOR · queda para menos de ${DIAS_PEDIR} días`, C.ambar, C.ambarFondo, f.pedir)
    + grupo(`● REPONER AL LOCAL · menos de ${DIAS_REPONER} días en el local`, C.azul, C.azulFondo, f.reponer)
  const color = f.sinStock.filas.length ? C.rojo : f.pedir.filas.length ? C.ambar : C.azul
  return tarjeta({ color, titulo: `${esc(f.nombre)} · no puede faltar`, bajada: `Velocidad: venta a precio lleno de ${DIAS_VELOCIDAD} días${fuera}`, cuerpo, pie: link(repo, 'Abrir Reposición') })
}

function bloqueCurva(linea, c) {
  const href = `${BASE}/productos?m=${linea === 'stunned' ? 'zattia' : linea}`
  const fuera = c.rebajadas ? ` · ${entero(c.rebajadas)} u. con descuento quedaron afuera` : ''
  const bajada = `De los ${c.mirados} más vendidos sin descuento (top ${TOP_CURVA}, ${DIAS_VELOCIDAD} días)${fuera}`
  if (!c.filas.length) return tarjeta({ color: C.verde, titulo: 'Curva rota', bajada, cuerpo: vacio('Ninguno tiene un talle o modelo en 0.') })
  const filas = c.filas.map((p) => filaProducto({
    foto: p.foto, nombre: p.nombre, arriba: `#${p.puesto} más vendido${p.proveedor ? ` · ${p.proveedor}` : ''}`,
    chips: [...p.chips, ...(p.masChips ? [`+${p.masChips}`] : [])], colorChip: C.rojo, fondoChip: C.rojoFondo,
  })).join('')
  return tarjeta({ color: C.rojo, titulo: 'Curva rota · se vende y le falta un talle', bajada, cuerpo: tabla(filas) + masDe(c.mas, href), pie: link(href, 'Abrir Por producto') })
}

function bloqueSubir(linea, s) {
  const href = `${BASE}/reposicion?m=${linea === 'stunned' ? 'zattia' : linea}`
  if (!s.filas.length) return tarjeta({ color: C.verde, titulo: 'Subir hoy del depósito', cuerpo: vacio('Nada vendido esta semana que esté en 0 en el local con stock en el depósito.') })
  const filas = s.filas.map((x) => filaProducto({
    foto: x.foto, nombre: x.nombre, chips: x.talle ? [x.talle] : [],
    detalle: `Vendió <b>${entero(x.vendidas)}</b> en el local esta semana · local <b style="color:${C.rojo}">0</b> · depósito <b>${entero(x.deposito)}</b>`,
  })).join('')
  return tarjeta({ color: C.azul, titulo: 'Subir hoy del depósito al local', bajada: 'Se vendió en el local, se terminó ahí y hay en el depósito', cuerpo: tabla(filas) + masDe(s.mas, href), pie: link(href, 'Abrir Reposición') })
}

/** La barra de cobertura: cuántos días de stock quedan, con el color de la urgencia. */
function cobertura(diasN, txt) {
  const tope = 60
  const d = Number.isFinite(diasN) ? diasN : tope
  const pct = Math.max(4, Math.min(100, Math.round((d / tope) * 100)))
  const ancho = Math.round(pct * 0.6)
  const color = d < DIAS_PEDIR ? C.rojo : d < 30 ? C.ambar : C.verde
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:4px"><tr><td width="${ancho}" height="6" style="background:${color};font-size:0">&nbsp;</td><td width="${60 - ancho}" height="6" style="background:${C.fondoGris};font-size:0">&nbsp;</td><td style="padding-left:8px;font-size:12px;color:${color}">${esc(txt)}</td></tr></table>`
}

/**
 * La recompra va SIN foto y en una línea por producto: es la lista que se tiene a mano al llamar al
 * proveedor, y con foto eran 30 renglones pesados que empujaban el mail arriba del corte de Gmail.
 */
function bloqueRecompra(linea, r) {
  const href = `${BASE}/proveedores?m=${linea === 'stunned' ? 'zattia' : linea}`
  if (!r.length) return tarjeta({ color: C.gris, titulo: 'Recompra por proveedor', cuerpo: `<div style="font-size:13px;color:${C.gris}">Sin ventas en ${DIAS_RECOMPRA} días.</div>` })
  const td = `padding:5px 0;border-top:1px solid ${C.fondoGris};font-size:13px`
  const cuerpo = r.map((g) => `<div style="margin-top:10px;font-size:13px"><b>${esc(g.proveedor)}</b> <span style="color:${C.gris}">· ${entero(g.u14)} u. en ${DIAS_RECOMPRA} días</span></div>`
    // Dos renglones por producto y ⛔ tres columnas: a 390 px de ancho las tres no entran.
    + tabla(g.productos.map((p) => `<tr><td style="${td}"><div>${esc(p.nombre)}</div><div style="color:${C.gris};font-size:12px;margin-top:2px">vendió <b style="color:${C.tinta}">${entero(p.u14)}</b> · hay <b style="color:${C.tinta}">${entero(p.stock)}</b></div>${cobertura(p.dias, p.diasTxt)}</td></tr>`).join(''))).join('')
  return tarjeta({ color: MARCA_COLOR[linea], titulo: 'Recompra por proveedor', bajada: `Lo más vendido de ${DIAS_RECOMPRA} días, el stock de hoy y para cuántos días alcanza`, cuerpo, pie: linea === 'bdi' ? '' : link(href, 'Abrir Proveedores') })
}

function capitulo(c, fecha) {
  if (c.error) {
    return franja(c.linea, fecha) + tarjeta({ color: C.rojo, titulo: 'No se pudo leer', cuerpo: `<div style="font-size:13px;color:${C.texto}">${esc(c.error)}</div>` })
  }
  return franja(c.linea, fecha)
    + bloqueVenta(c.linea, c.venta, c.venta.completo)
    + c.criticos.map((f) => bloqueCriticos(c.linea, f)).join('')
    + bloqueCurva(c.linea, c.curva)
    + bloqueSubir(c.linea, c.subir)
    + bloqueRecompra(c.linea, c.recompra)
}

function portada(m) {
  const tarjetas = m.resumen.marcas.map((x) => {
    const l = LOGOS[x.linea]
    const valor = x.error ? `<div style="font-size:13px;color:${C.rojo}">no se pudo leer</div>`
      : `<div style="font-size:18px;font-weight:bold;color:${l.tinta};margin-top:8px">${plataCorta(x.plata)}</div><div style="font-size:12px;margin-top:2px;color:${x.delta.pct == null ? (x.linea === 'stunned' ? '#d1d5db' : C.gris) : x.delta.pct >= 0 ? (x.linea === 'stunned' ? '#86efac' : C.verde) : (x.linea === 'stunned' ? '#fca5a5' : C.rojo)}">${esc(x.delta.texto)}</div>`
    // En la portada van tres logos lado a lado y tienen que entrar en 390 px de celular: ninguno
    // pasa de 76 px de ancho (Stunned, que es apaisado, queda más bajito).
    const ancho = Math.min(76, Math.round((l.ancho / l.alto) * 20))
    const alto = Math.round((l.alto / l.ancho) * ancho)
    return `<td width="33%" style="padding:0 3px;vertical-align:top"><div style="background:${l.fondo};border:1px solid ${x.linea === 'stunned' ? l.fondo : C.borde};border-radius:10px;padding:12px 4px;text-align:center">`
      + `<img src="${esc(l.url)}" width="${ancho}" height="${alto}" alt="${esc(marca(x.linea))}" style="display:inline-block;width:${ancho}px;height:${alto}px;border:0">`
      + valor + '</div></td>'
  }).join('')
  const extra = [
    m.resumen.sinStock ? chip(`${m.resumen.sinStock} sin stock`, C.rojo, C.rojoFondo) : '',
    m.resumen.paraPedir ? chip(`${m.resumen.paraPedir} para pedir`, C.ambar, C.ambarFondo) : '',
    m.pauta && !m.pauta.error && m.pauta.cuantas ? chip(`${m.pauta.cuantas} en la pauta`, C.indigo, '#eef2ff') : '',
  ].join('')
  return `<div style="border-radius:14px;background:${C.carta};border:1px solid ${C.borde};padding:20px 16px 16px">`
    + `<div style="font-size:12px;color:${C.indigo};font-weight:bold;text-transform:uppercase;letter-spacing:1px">Parte de la mañana</div>`
    + `<div style="font-size:14px;color:${C.gris};margin-top:2px">${esc(m.fecha)}</div>`
    + `<div style="margin-top:14px;font-size:13px;color:${C.gris}">Ayer se vendió, minorista</div>`
    + `<div style="font-size:36px;font-weight:bold;color:${C.tinta};line-height:42px">${plata(m.resumen.plata)}</div>`
    + `<div style="margin-top:2px">${chipDelta(m.resumen.delta)}${m.resumen.parcial ? chip('parcial', C.ambar, C.ambarFondo) : ''}</div>`
    + `<div style="margin:16px -4px 0">${tabla(`<tr>${tarjetas}</tr>`)}</div>`
    + (extra ? `<div style="margin-top:12px">${extra}</div>` : '')
    + '</div>'
}

function seccion(titulo, color) {
  return `<div style="margin:28px 0 12px;padding-bottom:6px;border-bottom:3px solid ${color};font-size:16px;font-weight:bold;color:${C.tinta};letter-spacing:.5px">${esc(titulo)}</div>`
}

function bloquePauta(p) {
  const href = `${BASE}/meta-ads/decidir`
  if (!p) return seccion('Pauta', C.indigo) + tarjeta({ color: C.verde, titulo: 'Meta', cuerpo: vacio('Nada para decidir en la pauta.') })
  if (p.error) return seccion('Pauta', C.indigo) + tarjeta({ color: C.rojo, titulo: 'Meta', cuerpo: `<div style="font-size:13px">no se pudieron leer los hallazgos (${esc(p.error)}).</div>` })
  const color = { quema: C.rojo, mirar: C.ambar, oportunidad: C.azul }
  const filas = p.renglones.map((r) => `<div style="margin-top:10px;padding-left:10px;border-left:3px solid ${color[r.g] || C.gris}">`
    + `<div style="font-size:14px;font-weight:bold;color:${C.tinta}">${esc(r.nombre)} <span style="font-weight:normal;font-size:12px;color:${C.gris}">· ${esc(r.linea)} · ${esc(r.cuando)}</span></div>`
    + `<div style="font-size:13px;color:${C.texto};margin-top:2px">${esc(r.motivo)}</div>`
    + `<div style="margin-top:4px">${link(r.ruta, r.propone ? r.propone.charAt(0).toUpperCase() + r.propone.slice(1) : 'Mirarlo')}</div></div>`).join('')
  return seccion(`Pauta · ${p.cuantas} para decidir`, C.indigo) + tarjeta({ color: C.indigo, titulo: 'Meta Ads', cuerpo: filas, pie: link(href, 'Abrir Decidir') })
}

function bloquePendientes(pendientes) {
  const cuerpo = pendientes.map((p) => {
    if (p.estado !== 'ok') return `<div style="margin-top:10px;font-size:13px;color:${C.ambar}">⚠️ <b>${esc(p.proyecto)}</b>: ${esc(p.motivo)}</div>`
    if (!p.items.length) return `<div style="margin-top:10px">${vacio(`${p.proyecto}: nada abierto.`)}</div>`
    const items = p.items.slice(0, TOPE_LISTA).map((i) => {
      const viejo = i.dias != null && i.dias > 14
      const edad = i.dias == null ? '' : chip(i.dias === 0 ? 'hoy' : `${i.dias} d`, viejo ? C.rojo : C.gris, viejo ? C.rojoFondo : C.fondoGris)
      return `<tr><td style="padding:5px 0;border-top:1px solid ${C.fondoGris};font-size:13px;color:${C.texto}">${esc(i.titulo)}</td><td style="padding:5px 0 5px 8px;border-top:1px solid ${C.fondoGris};text-align:right;vertical-align:top;width:56px">${edad}</td></tr>`
    }).join('')
    const mas = p.items.length > TOPE_LISTA ? `<div style="font-size:12px;color:${C.gris};padding-top:4px">y ${p.items.length - TOPE_LISTA} más</div>` : ''
    return `<div style="margin-top:12px;font-size:13px;font-weight:bold;color:${C.tinta}">${esc(p.proyecto)} <span style="font-weight:normal;color:${C.gris}">· ${p.items.length} abiertos</span></div>${tabla(items)}${mas}`
  }).join('')
  return seccion('Sin terminar', C.gris) + tarjeta({ color: C.gris, titulo: 'PENDIENTES.md de los proyectos', bajada: 'Lo marcado ▶️ · el chip es cuántos días lleva abierto', cuerpo })
}

/** El documento entero. `preheader` es el renglón gris que muestra la bandeja al lado del asunto. */
export function dibujarHtml(m, preheader) {
  const pie = `Lo arma el reloj de las 6:40 leyendo el espejo de Gestión Nube, el catálogo de Tienda Nube, los hallazgos de la pauta y los PENDIENTES.md. Stock: local + depósito minorista (el mayorista no cuenta).${m.notas.length ? ` ${m.notas.join(' ')}` : ''}`
  const cuerpo = portada(m)
    + m.capitulos.map((c) => capitulo(c, m.fecha)).join('')
    + bloquePauta(m.pauta)
    + bloquePendientes(m.pendientes)
    + `<div style="margin:24px 8px 8px;font-size:11px;line-height:16px;color:${C.suave};text-align:center">${esc(pie)}<br><a href="${BASE}" style="color:${C.suave}">monitorareben.vercel.app</a></div>`
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">'
    + `<title>Parte de la mañana</title><style>a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}</style></head>`
    + `<body style="margin:0;padding:0;background:${C.pagina};font-family:${FUENTE}">`
    + `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}${'&#8199;&#847; '.repeat(40)}</div>`
    + tabla(`<tr><td align="center" style="padding:16px 10px">`
      + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;max-width:640px"><tr><td style="font-family:${FUENTE};color:${C.tinta}">${cuerpo}</td></tr></table>`
      + '</td></tr>', `background:${C.pagina}`)
    + '</body></html>'
}
