/**
 * **El parte de la mañana**: el mail que junta la venta de ayer, el stock que no puede faltar, la
 * curva rota, lo que hay que subir del depósito, la recompra, la pauta y lo sin terminar.
 *
 * Lo pidió Bruno el 30-sep-2026: *«un mail de todo lo importante… que dé un panorama real de todo,
 * cosas que están incompletas, cosas sin terminar, como un estado del día… para empezar a ordenar
 * la mañana»*. Y decidió que **reemplaza** al mail de la pauta de las 07:50: uno solo.
 *
 * # 🔑 Un bloque vacío va en UNA línea, ⛔ desaparece
 *
 * Al revés que el mail de la pauta —que con cero ⛔ se manda—, éste sale todos los días, porque la
 * venta de ayer siempre dice algo. Y adentro, un bloque que ⛔ tiene nada lo dice: si
 * desapareciera, «no hay templados por pedir» y «el bloque de templados se rompió» se verían
 * idénticos. Por la misma razón, un bloque que ⛔ se pudo leer dice **por qué**.
 *
 * # Puro, y con `hoy` por parámetro
 *
 * El texto es todo lo que este archivo produce; un reloj escondido lo haría imposible de probar.
 */

import { ETIQUETA_LINEA } from '../lineas.core.js'
import { ETIQUETA_CANAL } from '../liquidacion/canal.core.js'
import { variacion } from './ventas.core.js'
import { DIAS_PEDIR, DIAS_REPONER, DIAS_VELOCIDAD, DIAS_RECOMPRA, TOP_CURVA } from './stock.core.js'

const BASE = 'https://monitorareben.vercel.app'
/** Cuántos renglones por lista, como mucho. El resto se cuenta: «y 12 más». */
export const TOPE_LISTA = 10

const nf = new Intl.NumberFormat('es-AR')
const nf1 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 })

export const plata = (v) => `$ ${nf.format(Math.round(v || 0))}`
/** Plata corta para el asunto, que se lee en la pantalla bloqueada: `$ 2,9 M` · `$ 850 mil`. */
export function plataCorta(v) {
  const n = Math.round(v || 0)
  if (Math.abs(n) >= 1e6) return `$ ${nf1.format(n / 1e6)} M`
  if (Math.abs(n) >= 1e3) return `$ ${nf.format(Math.round(n / 1e3))} mil`
  return `$ ${nf.format(n)}`
}
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const marca = (base) => ETIQUETA_LINEA[base] || base
const dias = (d) => {
  if (!Number.isFinite(d)) return 'sin venta'
  if (d < 1) return 'menos de 1 día'
  const n = Math.floor(d)
  return `${nf.format(n)} ${n === 1 ? 'día' : 'días'}`
}

/**
 * Agrupa variantes por producto: «BOMBACHA AYLA · S (33), L (20)» en vez de un renglón por talle.
 * 📊 Medido el 30-sep-2026 en plena Feria: Zattia tenía 90 variantes críticas sin stock, que son
 * bastantes menos productos — y a un proveedor se le pide por producto.
 */
export function porProducto(filas, dato) {
  const g = new Map()
  for (const v of filas) {
    const x = g.get(v.pid) || { pid: v.pid, nombre: v.nombre, peso: 0, variantes: [] }
    x.peso += v.u28
    x.variantes.push(v)
    g.set(v.pid, x)
  }
  return [...g.values()]
    .sort((a, b) => b.peso - a.peso)
    .map((x) => `   • ${x.nombre}: ${x.variantes.map((v) => `${v.talle || '?'} (${dato(v)})`).join(', ')}`)
}

/** `+12%` · `−8%` · `sin comparación`. */
export function contraSemana(ahora, antes) {
  const v = variacion(ahora, antes)
  if (v == null) return 'sin comparación'
  const r = Math.round(v)
  return `${r > 0 ? '+' : r < 0 ? '−' : '±'}${Math.abs(r)}% vs. el mismo día de la semana pasada`
}

const variante = (v) => (v.talle ? `${v.nombre} · ${v.talle}` : v.nombre)

// ── Los bloques ─────────────────────────────────────────────────────────────────────────────────
// Cada uno devuelve `{ titulo, renglones: [texto] }`. El HTML y el texto salen de lo mismo: si se
// armaran por separado, un día dirían cosas distintas.

function bloqueVentas(ventas) {
  const r = []
  for (const v of ventas) {
    if (v.error) {
      r.push(`⚠️ ${marca(v.base)}: ⛔ se pudo leer la venta (${v.error}).`)
      continue
    }
    const aviso = v.completo === false
      ? ' ⚠️ PARCIAL: el sync de hoy todavía ⛔ corrió, falta parte del día'
      : v.completo == null ? ' ⚠️ ⛔ se sabe si el día está completo' : ''
    const m = v.minorista || { compras: 0, unidades: 0, plata: 0 }
    const may = (v.porCanal && v.porCanal.mayorista) || { compras: 0, plata: 0 }
    const mayAntes = v.porCanalAntes && v.porCanalAntes.mayorista
    // 🔴 El renglón de arriba es el MINORISTA, y el mayorista va aparte con su propia comparación:
    // ver el 🔴 de `minorista` en `ventas.core.js` (un pedido mayorista daba vuelta el total).
    r.push(`${marca(v.base)}: ${plata(m.plata)} minorista · ${nf.format(m.compras)} ventas · ${nf.format(m.unidades)} u. — ${contraSemana(m.plata, v.minoristaAntes && v.minoristaAntes.plata)}${aviso}`)
    const canales = Object.entries(v.porCanal || {}).filter(([c, x]) => c !== 'mayorista' && x.compras !== 0)
    if (canales.length) {
      r.push(`   ${canales.map(([c, x]) => `${ETIQUETA_CANAL[c] || c} ${plata(x.plata)} (${nf.format(x.compras)})`).join(' · ')}`)
    }
    if (may.compras || (mayAntes && mayAntes.compras)) {
      r.push(`   Mayorista: ${plata(may.plata)} (${nf.format(may.compras)}) — la semana pasada ${plata(mayAntes ? mayAntes.plata : 0)} (${nf.format(mayAntes ? mayAntes.compras : 0)})`)
    }
    // Stunned vive en la base de Zattia: se abre aparte porque es otra marca comercial.
    const st = v.lineas && v.lineas.stunned
    if (v.base === 'zattia') {
      const antes = v.lineasAntes && v.lineasAntes.stunned
      r.push(`   de eso, Stunned: ${st ? `${plata(st.facturado)} · ${nf.format(st.unidades)} u.` : 'sin ventas'} — ${contraSemana(st ? st.facturado : 0, antes ? antes.facturado : v.previo ? 0 : null)}`)
    }
  }
  return { titulo: 'Ventas de ayer', renglones: r }
}

function listar(filas, fmt) {
  const out = filas.slice(0, TOPE_LISTA).map(fmt)
  if (filas.length > TOPE_LISTA) out.push(`   … y ${filas.length - TOPE_LISTA} más`)
  return out
}

function bloqueCriticos(stock) {
  const r = []
  for (const s of stock) {
    if (s.error) { r.push(`⚠️ ${marca(s.base)}: ⛔ se pudo leer el stock (${s.error}).`); continue }
    for (const fam of s.criticos) {
      const n = fam.sinStock.length + fam.pedir.length + fam.reponer.length
      if (!n) { r.push(`✅ ${marca(s.base)} · ${fam.nombre}: todo con más de ${DIAS_PEDIR} días de stock.`); continue }
      r.push(`${marca(s.base)} · ${fam.nombre}:`)
      if (fam.sinStock.length) {
        r.push(`  🔴 Sin stock en ningún lado — entre paréntesis, lo que vendió en ${DIAS_VELOCIDAD} días:`)
        r.push(...listar(porProducto(fam.sinStock, (v) => nf.format(v.u28)), (x) => x))
      }
      if (fam.pedir.length) {
        r.push(`  🟡 Pedir al proveedor, queda para menos de ${DIAS_PEDIR} días — entre paréntesis, cuánto hay y para cuánto:`)
        r.push(...listar(porProducto(fam.pedir, (v) => `${nf.format(v.local + v.deposito)} u., ${dias(v.dias)}`), (x) => x))
      }
      if (fam.reponer.length) {
        r.push('  🔵 Reponer al local desde el depósito — entre paréntesis, local / depósito:')
        r.push(...listar(porProducto(fam.reponer, (v) => `${nf.format(v.local)} / ${nf.format(v.deposito)}`), (x) => x))
      }
    }
  }
  return { titulo: 'Lo que no puede faltar', renglones: r }
}

function bloqueCurva(stock) {
  const r = []
  for (const s of stock) {
    if (s.error) continue
    const { rotos, rebajadas, mirados } = s.curva
    const nota = rebajadas ? ` (${nf.format(rebajadas)} u. vendidas con descuento quedaron afuera)` : ''
    if (!rotos.length) {
      r.push(`✅ ${marca(s.base)}: de los ${mirados} más vendidos a precio lleno, ninguno tiene un talle/modelo en 0${nota}.`)
      continue
    }
    r.push(`${marca(s.base)}: ${rotos.length} de los ${mirados} más vendidos a precio lleno tienen variantes en 0${nota}`)
    r.push(...listar(rotos, (p) => `   • #${p.puesto} ${p.nombre}${p.proveedor ? ` (${p.proveedor})` : ''} — falta: ${p.rotas.slice(0, 6).map((v) => `${v.talle || '?'} (vendió ${nf.format(v.u28)})`).join(', ')}${p.rotas.length > 6 ? '…' : ''}`))
  }
  return { titulo: `Curva rota: lo que se vende a precio lleno y se quedó sin un talle o modelo (top ${TOP_CURVA}, ${DIAS_VELOCIDAD} días)`, renglones: r }
}

function bloqueSubir(stock) {
  const r = []
  for (const s of stock) {
    if (s.error) continue
    if (!s.subir.length) { r.push(`✅ ${marca(s.base)}: nada vendido esta semana que esté en 0 en el local y con stock en el depósito.`); continue }
    r.push(`${marca(s.base)} (${s.subir.length}):`)
    r.push(...listar(s.subir, (v) => `   • ${variante(v)} — vendió ${nf.format(v.uLocal7)} en el local esta semana, depósito ${nf.format(v.deposito)}`))
  }
  return { titulo: 'Subir hoy del depósito al local', renglones: r }
}

function bloqueRecompra(stock) {
  const r = []
  for (const s of stock) {
    if (s.error) continue
    if (!s.recompra.length) { r.push(`${marca(s.base)}: sin ventas en ${DIAS_RECOMPRA} días.`); continue }
    r.push(`${marca(s.base)}:`)
    for (const g of s.recompra) {
      r.push(`  ${g.proveedor} — ${nf.format(g.u14)} u. en ${DIAS_RECOMPRA} días`)
      for (const p of g.productos) r.push(`   • ${p.nombre}: vendió ${nf.format(p.u14)}, hay ${nf.format(p.stock)} (${dias(p.dias)})`)
    }
  }
  return { titulo: `Recompra por proveedor: lo más vendido de ${DIAS_RECOMPRA} días y el stock de hoy`, renglones: r }
}

function bloquePauta(pauta) {
  if (!pauta) return { titulo: 'Pauta', renglones: ['✅ Nada para decidir en la pauta.'], html: null }
  if (pauta.error) return { titulo: 'Pauta', renglones: [`⚠️ ⛔ se pudieron leer los hallazgos (${pauta.error}).`], html: null }
  return { titulo: `Pauta: ${pauta.cuantas} para decidir`, renglones: pauta.texto.split('\n'), html: pauta.html }
}

function bloquePendientes(pendientes) {
  const r = []
  for (const p of pendientes) {
    if (p.estado !== 'ok') { r.push(`⚠️ ${p.proyecto}: ${p.motivo}`); continue }
    if (!p.items.length) { r.push(`✅ ${p.proyecto}: nada abierto.`); continue }
    r.push(`${p.proyecto} (${p.items.length}):`)
    r.push(...listar(p.items, (i) => `   • ${i.titulo}${i.dias != null ? ` — ${i.dias === 0 ? 'de hoy' : `hace ${i.dias} días`}` : ''}`))
  }
  return { titulo: 'Sin terminar', renglones: r }
}

// ── El asunto y el armado ───────────────────────────────────────────────────────────────────────

/**
 * Se lee en la pantalla bloqueada, así que lleva lo que ordena la mañana: la plata de ayer por
 * marca, cuántas cosas se quedaron sin stock y cuánto hay para decidir en la pauta.
 */
export function asuntoDe({ ventas, stock, pauta }) {
  const partes = []
  const ok = ventas.filter((v) => !v.error && v.minorista)
  if (ok.length) {
    const total = ok.reduce((s, v) => s + v.minorista.plata, 0)
    const parcial = ok.some((v) => v.completo !== true) ? ' (parcial)' : ''
    partes.push(`ayer ${plataCorta(total)} minorista${parcial} (${ok.map((v) => `${marca(v.base)} ${plataCorta(v.minorista.plata)}`).join(' · ')})`)
  } else {
    partes.push('ayer: ⛔ se pudo leer la venta')
  }
  // Se cuentan PRODUCTOS, ⛔ variantes: «90 sin stock» por los talles de 30 prendas asusta de más.
  const pids = new Set()
  for (const s of stock.filter((x) => !x.error)) {
    for (const f of s.criticos) for (const v of f.sinStock) pids.add(`${s.base}:${v.pid}`)
    for (const p of s.curva.rotos) pids.add(`${s.base}:${p.pid}`)
  }
  if (pids.size) partes.push(`${pids.size} ${pids.size === 1 ? 'producto' : 'productos'} sin stock`)
  if (pauta && !pauta.error && pauta.cuantas) partes.push(`${pauta.cuantas} pauta${pauta.quema ? ` (${pauta.quema} para pausar)` : ''}`)
  return `Parte · ${partes.join(' · ')}`
}

/**
 * @param entrada `{ hoy, ventas, stock, pauta, pendientes }` — ver `scripts/parte-manana.mjs`.
 * @returns `{ asunto, texto, html }`
 */
export function armarParte({ hoy, ventas, stock, pauta, pendientes }) {
  const bloques = [
    bloqueVentas(ventas),
    bloqueCriticos(stock),
    bloqueCurva(stock),
    bloqueSubir(stock),
    bloqueRecompra(stock),
    bloquePauta(pauta),
    bloquePendientes(pendientes),
  ]
  const pie = `Parte del ${hoy}. Lo arma el reloj de la mañana leyendo el espejo de Gestión Nube, los hallazgos de la pauta y los PENDIENTES.md de los repos. Stock: local + depósito minorista (el mayorista ⛔ cuenta). Velocidad: venta minorista de ${DIAS_VELOCIDAD} días. Reponer = menos de ${DIAS_REPONER} días en el local.`

  const texto = [
    ...bloques.map((b) => [`■ ${b.titulo.toUpperCase()}`, ...b.renglones].join('\n')),
    pie,
    `${BASE}`,
  ].join('\n\n')

  const html = [
    '<div style="font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;max-width:720px">',
    ...bloques.map((b) => [
      `<h2 style="font-size:15px;margin:22px 0 6px;padding-bottom:4px;border-bottom:1px solid #e5e5e5">${esc(b.titulo)}</h2>`,
      b.html
        ? b.html
        : `<div style="white-space:pre-wrap;font-size:13.5px">${b.renglones.map(esc).join('\n')}</div>`,
    ].join('')),
    `<p style="color:#777;font-size:12px;margin-top:24px">${esc(pie)} <a href="${BASE}">Abrir el monitor</a></p>`,
    '</div>',
  ].join('')

  return { asunto: asuntoDe({ ventas, stock, pauta }), texto, html }
}
