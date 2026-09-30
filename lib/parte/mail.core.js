/**
 * **El parte de la mañana**: el mail que junta, por marca, la venta de ayer, lo que no puede
 * faltar, la curva rota, lo que hay que subir del depósito y la recompra; y al final la pauta y lo
 * sin terminar. Ficha: `docs/secciones/parte-manana.md`.
 *
 * Lo pidió Bruno el 30-sep-2026: *«un mail de todo lo importante… un panorama real de todo…
 * para empezar a ordenar la mañana»*. Esa misma tarde, leyendo el primero, pidió que fuera **por
 * marca, con su logo** —*«sino es el doble de complicado leer»*— y **lindo, con fotos**. Por eso
 * este archivo arma un MODELO por capítulo y de ahí salen las dos versiones: el HTML
 * (`html.core.js`) y el texto plano, para los clientes que ⛔ muestran HTML. Si se armaran por
 * separado, un día dirían cosas distintas.
 *
 * # 🔑 Un bloque vacío va en UNA línea, ⛔ desaparece
 *
 * «No hay templados por pedir» y «el bloque de templados se rompió» ⛔ se pueden ver iguales. Un
 * capítulo que ⛔ se pudo leer dice por qué.
 *
 * # Puro, y con `hoy` por parámetro
 */

import { ETIQUETA_CANAL } from '../liquidacion/canal.core.js'
import { BASE, TOPE_LISTA, TOPE_POR_PROVEEDOR, TOPE_PROVEEDORES, contraSemana, dias, entero, fechaLarga, marca, plata, plataCorta } from './formato.core.js'
import { DIAS_PEDIR, DIAS_VELOCIDAD, DIAS_RECOMPRA } from './stock.core.js'
import { dibujarHtml } from './html.core.js'

export { BASE, TOPE_LISTA, contraSemana, dias, entero, fechaLarga, inicialDia, marca, plata, plataCorta } from './formato.core.js'

/**
 * Agrupa variantes por producto: una fila por producto, con sus talles como chips. A un
 * proveedor se le pide por producto, y 90 renglones de talles sueltos ⛔ se leen.
 */
const CHIPS = 4

export function porProducto(filas, dato) {
  const g = new Map()
  for (const v of filas) {
    const x = g.get(v.pid) || { pid: v.pid, nombre: v.nombre, peso: 0, variantes: [] }
    x.peso += v.lleno28 ?? v.u28 ?? 0
    x.variantes.push(v)
    g.set(v.pid, x)
  }
  return [...g.values()]
    .sort((a, b) => b.peso - a.peso)
    .map((x) => ({
      pid: x.pid, nombre: x.nombre,
      // Hasta 4 talles por producto y «+N»: con la curva de un corpiño entera la fila ocupaba media
      // pantalla del celular, y el peso del mail se iba arriba del corte de Gmail.
      chips: [...x.variantes.slice(0, CHIPS).map((v) => `${v.talle || '?'} · ${dato(v)}`), ...(x.variantes.length > CHIPS ? [`+${x.variantes.length - CHIPS}`] : [])],
    }))
}

const recortar = (lista, tope = TOPE_LISTA) => ({ filas: lista.slice(0, tope), mas: Math.max(0, lista.length - tope) })

// ── El modelo ───────────────────────────────────────────────────────────────────────────────────

/**
 * La venta de un capítulo. En Zattia es la de la BASE —incluye Stunned, y lo dice—; en Stunned es
 * la de sus renglones (`ventaPorLinea`).
 *
 * ⚠️ **⛔ Se resta Stunned de Zattia.** La plata de los renglones ⛔ lleva descuento ni envío, y la
 * de la base sí: restarlas mezcla dos cuentas y da un número que no existe.
 */
function ventaDeCapitulo(linea, v) {
  if (linea === 'stunned') {
    const st = v.lineas && v.lineas.stunned
    const antes = v.lineasAntes && v.lineasAntes.stunned
    return {
      plata: st ? st.facturado : 0,
      compras: st ? st.tickets : 0,
      unidades: st ? st.unidades : 0,
      delta: contraSemana(st ? st.facturado : 0, antes ? antes.facturado : v.minoristaAntes ? 0 : null),
      canales: [],
      mayorista: null,
      serie7: v.stunned7 || [],
      completo: v.completo,
      nota: 'Suma de los renglones de Stunned (sin el descuento ni el envío de la orden).',
    }
  }
  const m = v.minorista || { compras: 0, unidades: 0, plata: 0 }
  const may = (v.porCanal && v.porCanal.mayorista) || { compras: 0, plata: 0 }
  const mayAntes = (v.porCanalAntes && v.porCanalAntes.mayorista) || { compras: 0, plata: 0 }
  const st = linea === 'zattia' && v.lineas && v.lineas.stunned
  return {
    plata: m.plata,
    compras: m.compras,
    unidades: m.unidades,
    delta: contraSemana(m.plata, v.minoristaAntes && v.minoristaAntes.plata),
    canales: Object.entries(v.porCanal || {})
      .filter(([c, x]) => c !== 'mayorista' && x.compras !== 0)
      .map(([c, x]) => ({ nombre: ETIQUETA_CANAL[c] || c, plata: x.plata, compras: x.compras })),
    mayorista: may.compras || mayAntes.compras ? { plata: may.plata, compras: may.compras, antes: mayAntes.plata, comprasAntes: mayAntes.compras } : null,
    serie7: v.serie7 || [],
    completo: v.completo,
    nota: st ? `Incluye Stunned: ${plata(st.facturado)}.` : null,
  }
}

/**
 * Arma el modelo del mail.
 *
 * @param entrada.hoy        día argentino
 * @param entrada.capitulos  `[{ linea, base, venta, stock, error }]` — `venta` es la de la BASE
 *                           (`ventaDeAyer`), `stock` las listas de ESA línea
 * @param entrada.fotos      `{ [base]: Map pid → url de miniatura }`
 * @param entrada.pauta      lo de `armarMail` de la pauta, `null` o `{ error }`
 * @param entrada.pendientes `[{ proyecto, estado, items | motivo }]`
 * @param entrada.notas      avisos para el pie (p. ej. «sin fotos: el catálogo ⛔ contestó»)
 */
export function armarModelo({ hoy, capitulos, fotos = {}, pauta, pendientes, notas = [] }) {
  const fotoDe = (base, pid) => (fotos[base] && fotos[base].get(String(pid))) || null

  const caps = capitulos.map((c) => {
    if (c.error) return { linea: c.linea, error: c.error }
    const s = c.stock
    const foto = (pid) => fotoDe(c.base, pid)
    const conFoto = (x) => ({ ...x, foto: foto(x.pid) })

    const criticos = (s.criticos || []).map((f) => ({
      nombre: f.nombre,
      rebajadas: f.rebajadas || 0,
      sinStock: recortar(porProducto(f.sinStock, (v) => `vendió ${entero(v.lleno28)}`).map(conFoto)),
      pedir: recortar(porProducto(f.pedir, (v) => `${entero(v.local + v.deposito)} u. · ${dias(v.dias)}`).map(conFoto)),
      reponer: recortar(porProducto(f.reponer, (v) => `local ${entero(v.local)} · dep. ${entero(v.deposito)}`).map(conFoto)),
    }))

    const curva = {
      rebajadas: s.curva.rebajadas,
      mirados: s.curva.mirados,
      ...recortar(s.curva.rotos.map((p) => ({
        pid: p.pid, puesto: p.puesto, nombre: p.nombre, proveedor: p.proveedor, foto: foto(p.pid),
        chips: p.rotas.slice(0, CHIPS).map((v) => `${v.talle || '?'} · vendió ${entero(v.u28)}`),
        masChips: Math.max(0, p.rotas.length - CHIPS),
      }))),
    }

    const subir = recortar(s.subir.map((v) => ({
      pid: v.pid, nombre: v.nombre, talle: v.talle, foto: foto(v.pid),
      vendidas: v.uLocal7, deposito: v.deposito,
    })))

    const recompra = s.recompra.slice(0, TOPE_PROVEEDORES).map((g) => ({
      proveedor: g.proveedor, u14: g.u14,
      productos: g.productos.slice(0, TOPE_POR_PROVEEDOR).map((p) => ({ ...p, foto: foto(p.pid), diasTxt: dias(p.dias) })),
    }))

    return { linea: c.linea, venta: ventaDeCapitulo(c.linea, c.venta), criticos, curva, subir, recompra }
  })

  // La portada: el minorista por marca. Stunned va con su número, pero ⛔ se suma al total: ya
  // está adentro del de Zattia.
  const ok = caps.filter((c) => !c.error)
  const total = ok.filter((c) => c.linea !== 'stunned').reduce((s, c) => s + c.venta.plata, 0)
  const totalAntes = capitulos
    .filter((c) => !c.error && c.linea !== 'stunned')
    .reduce((s, c) => (s == null || !c.venta.minoristaAntes ? null : s + c.venta.minoristaAntes.plata), 0)
  const parcial = ok.some((c) => c.venta.completo !== true)

  const pids = new Set()
  let paraPedir = 0
  for (const c of ok) {
    for (const f of c.criticos) {
      for (const p of [...f.sinStock.filas]) pids.add(`${c.linea}:${p.pid}`)
      paraPedir += f.sinStock.filas.length + f.sinStock.mas + f.pedir.filas.length + f.pedir.mas
    }
    for (const p of c.curva.filas) pids.add(`${c.linea}:${p.pid}`)
  }

  return {
    hoy,
    fecha: fechaLarga(hoy),
    resumen: {
      plata: total,
      delta: contraSemana(total, totalAntes),
      parcial,
      marcas: caps.map((c) => (c.error ? { linea: c.linea, error: true } : { linea: c.linea, plata: c.venta.plata, delta: c.venta.delta })),
      sinStock: pids.size,
      paraPedir,
    },
    capitulos: caps,
    pauta: pauta ? (pauta.error ? { error: pauta.error } : { cuantas: pauta.cuantas, quema: pauta.quema, renglones: pauta.renglones || [] }) : null,
    pendientes,
    notas,
  }
}

// ── Asunto, preheader y texto ───────────────────────────────────────────────────────────────────

/** Se lee en la pantalla bloqueada: la plata de ayer por marca, lo sin stock y la pauta. */
export function asuntoDe(m) {
  const partes = []
  const ok = m.resumen.marcas.filter((x) => !x.error && x.linea !== 'stunned')
  if (ok.length) {
    partes.push(`ayer ${plataCorta(m.resumen.plata)} minorista${m.resumen.parcial ? ' (parcial)' : ''} (${ok.map((x) => `${marca(x.linea)} ${plataCorta(x.plata)}`).join(' · ')})`)
  } else {
    partes.push('ayer: no se pudo leer la venta')
  }
  if (m.resumen.sinStock) partes.push(`${m.resumen.sinStock} ${m.resumen.sinStock === 1 ? 'producto' : 'productos'} sin stock`)
  if (m.pauta && !m.pauta.error && m.pauta.cuantas) partes.push(`${m.pauta.cuantas} pauta${m.pauta.quema ? ` (${m.pauta.quema} para pausar)` : ''}`)
  return `Parte · ${partes.join(' · ')}`
}

/** El renglón gris que muestra la bandeja al lado del asunto. */
export function preheaderDe(m) {
  const marcas = m.resumen.marcas.filter((x) => !x.error).map((x) => `${marca(x.linea)} ${plataCorta(x.plata)} ${x.delta.pct == null ? '' : x.delta.texto}`.trim())
  const pedir = m.resumen.paraPedir ? ` · ${m.resumen.paraPedir} para pedir` : ''
  return `${marcas.join(' · ')}${pedir}`
}

function textoCapitulo(c) {
  const r = [`■ ${marca(c.linea).toUpperCase()}`]
  if (c.error) return [...r, `⚠️ no se pudo leer (${c.error}).`].join('\n')
  const v = c.venta
  r.push(`Ayer: ${plata(v.plata)} · ${entero(v.compras)} ventas · ${entero(v.unidades)} u. — ${v.delta.texto} vs. el mismo día de la semana pasada${v.completo === false ? ' ⚠️ PARCIAL: el sync de hoy todavía no corrió' : ''}`)
  if (v.canales.length) r.push(`  ${v.canales.map((x) => `${x.nombre} ${plata(x.plata)} (${x.compras})`).join(' · ')}`)
  if (v.mayorista) r.push(`  Mayorista: ${plata(v.mayorista.plata)} (${v.mayorista.compras}) — la semana pasada ${plata(v.mayorista.antes)} (${v.mayorista.comprasAntes})`)
  if (v.nota) r.push(`  ${v.nota}`)
  const lista = (t, l) => {
    if (!l.filas.length) return
    r.push(t)
    for (const f of l.filas) r.push(`   • ${f.nombre}: ${f.chips.join(', ')}`)
    if (l.mas) r.push(`   … y ${l.mas} más`)
  }
  for (const f of c.criticos) {
    const n = f.sinStock.filas.length + f.pedir.filas.length + f.reponer.filas.length
    if (!n) { r.push(`✅ ${f.nombre}: todo con más de ${DIAS_PEDIR} días de stock.`); continue }
    r.push(`${f.nombre} (no puede faltar):`)
    lista('  🔴 Sin stock:', f.sinStock)
    lista(`  🟡 Pedir, queda para menos de ${DIAS_PEDIR} días:`, f.pedir)
    lista('  🔵 Reponer al local:', f.reponer)
  }
  if (c.curva.filas.length) {
    r.push(`Curva rota (los más vendidos a precio lleno con un talle o modelo en 0):`)
    for (const p of c.curva.filas) r.push(`   • #${p.puesto} ${p.nombre}${p.proveedor ? ` (${p.proveedor})` : ''}: falta ${p.chips.join(', ')}`)
  }
  if (c.subir.filas.length) {
    r.push('Subir hoy del depósito al local:')
    for (const x of c.subir.filas) r.push(`   • ${x.nombre}${x.talle ? ` · ${x.talle}` : ''} — vendió ${x.vendidas} esta semana, depósito ${x.deposito}`)
  }
  if (c.recompra.length) {
    r.push(`Recompra (${DIAS_RECOMPRA} días):`)
    for (const g of c.recompra) {
      r.push(`  ${g.proveedor} — ${entero(g.u14)} u.`)
      for (const p of g.productos) r.push(`   • ${p.nombre}: vendió ${entero(p.u14)}, hay ${entero(p.stock)} (${p.diasTxt})`)
    }
  }
  return r.join('\n')
}

function textoDe(m) {
  const partes = [`PARTE DE LA MAÑANA · ${m.fecha}`, `Ayer: ${plata(m.resumen.plata)} minorista — ${m.resumen.delta.texto}`]
  for (const c of m.capitulos) partes.push(textoCapitulo(c))
  if (m.pauta && m.pauta.error) partes.push(`■ PAUTA\n⚠️ no se pudieron leer los hallazgos (${m.pauta.error}).`)
  else if (m.pauta) partes.push(['■ PAUTA', ...m.pauta.renglones.map((r) => `• ${r.nombre} · ${r.linea} · ${r.cuando}\n   ${r.motivo}\n   → ${r.propone || 'mirarlo'}`)].join('\n'))
  else partes.push('■ PAUTA\n✅ Nada para decidir.')
  const pend = ['■ SIN TERMINAR']
  for (const p of m.pendientes) {
    if (p.estado !== 'ok') { pend.push(`⚠️ ${p.proyecto}: ${p.motivo}`); continue }
    pend.push(`${p.proyecto} (${p.items.length}):`)
    for (const i of p.items.slice(0, TOPE_LISTA)) pend.push(`   • ${i.titulo}${i.dias != null ? ` — hace ${i.dias} días` : ''}`)
    if (p.items.length > TOPE_LISTA) pend.push(`   … y ${p.items.length - TOPE_LISTA} más`)
  }
  partes.push(pend.join('\n'))
  partes.push(`Stock: local + depósito minorista. Velocidad: venta minorista a precio lleno de ${DIAS_VELOCIDAD} días.${m.notas.length ? ` ${m.notas.join(' ')}` : ''}\n${BASE}`)
  return partes.join('\n\n')
}

/** @returns `{ asunto, texto, html, modelo }` */
export function armarParte(entrada) {
  const modelo = armarModelo(entrada)
  return { asunto: asuntoDe(modelo), texto: textoDe(modelo), html: dibujarHtml(modelo, preheaderDe(modelo)), modelo }
}
