// **El parte de la mañana**: un solo mail con la venta de ayer, el stock que no puede faltar, la
// curva rota, lo que hay que subir del depósito, la recompra, la pauta y lo sin terminar.
//
//   node scripts/parte-manana.mjs               # manda el mail
//   node scripts/parte-manana.mjs --simulacro   # lo imprime y ⛔ NO lo manda
//
// ⛔ SÓLO LEE. Lo único que escribe es el mail. Todo el cálculo vive en `lib/parte/*.core.js`
// (probado en `tests/parte-*.test.ts`); acá están las lecturas y nada más. La ficha es
// `docs/secciones/parte-manana.md`.
//
// 🔑 **Un bloque que se cae ⛔ tumba el mail.** Cada lectura va en su propio try, y lo que falla
// sale ADENTRO del mail con su motivo: un parte que ⛔ llega porque se cayó la lectura de un repo
// es peor que uno que llega diciendo «esto ⛔ se pudo leer». El workflow sí se tiñe de rojo, para
// que se vea también desde afuera.
import { readFileSync, writeFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { leerTodo } from '../lib/supabase/paginar.core.js'
import { diaArgentino } from '../lib/envios/portal.core.js'
import { sumarDias, diasEntre } from '../lib/fechas/dia.core.js'
import { agruparHallazgos } from '../lib/meta-ads/reglas.core.js'
import { armarMail as armarPauta } from '../lib/meta-ads/mail-hallazgos.core.js'
import { ayerCompleto, ventaDeAyer } from '../lib/parte/ventas.core.js'
import { armarUniverso, criticos, curvaRota, paradoEnDeposito, partirPorLinea, recompra, claveDe, DIAS_VELOCIDAD } from '../lib/parte/stock.core.js'
import { fotoDe, indiceDeFotos } from '../lib/parte/fotos.core.js'
import { abiertosPorTitulo, abiertosPorCasilla } from '../lib/parte/pendientes.core.js'
import { armarParte } from '../lib/parte/mail.core.js'
import { mandarMail } from './lib/mail.mjs'

// En Actions las variables vienen del entorno; en la Mac, del `.env`, que ⛔ pisa lo ya puesto.
try {
  for (const l of readFileSync('.env', 'utf8').split('\n')) {
    if (!l.includes('=') || l.trim().startsWith('#')) continue
    const i = l.indexOf('=')
    const k = l.slice(0, i).trim()
    if (!process.env[k]) process.env[k] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
} catch {
  // Sin `.env` ⛔ pasa nada: es el caso normal en Actions.
}

const SIMULACRO = process.argv.includes('--simulacro') || process.env.ENTRADA_SIMULACRO === 'true'
// `--html <archivo>` guarda el HTML del mail: es como se MIRA antes de mandarlo (el workflow lo sube
// como artefacto de la corrida, porque Zattia sólo se lee desde Actions).
const HTML_A = process.argv.includes('--html') ? process.argv[process.argv.indexOf('--html') + 1] : process.env.PARTE_HTML || null
const MAIL_A = process.env.MAIL_HALLAZGOS_A || 'brunoarevalo@arebensrl.com'
const HOY = diaArgentino(Date.now())
const AYER = sumarDias(HOY, -1)

const problemas = []
const anotar = (que, motivo) => {
  problemas.push(`${que}: ${motivo}`)
  console.log(`  ✗ ${que}: ${motivo}`)
}

const bases = {
  bdi: createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY),
  zattia: process.env.ZATTIA_SUPABASE_URL && (process.env.ZATTIA_SUPABASE_SERVICE_KEY || process.env.ZATTIA_SUPABASE_KEY)
    ? createClient(process.env.ZATTIA_SUPABASE_URL, process.env.ZATTIA_SUPABASE_SERVICE_KEY || process.env.ZATTIA_SUPABASE_KEY)
    : null,
}

// ── Las lecturas de una base ───────────────────────────────────────────────────────────────────

async function leerBase(base) {
  const sb = bases[base]
  if (!sb) throw new Error('faltan las credenciales de Supabase')
  const desde = sumarDias(HOY, -DIAS_VELOCIDAD)

  const { data: syncState, error: eSync } = await sb.from('sync_state').select('clave, ventas_date, updated_at')
  if (eSync) throw new Error(`sync_state: ${eSync.message}`)

  // ⚠️ `channel_id` sólo en BDI: Zattia ⛔ tiene la columna y PostgREST rechaza el select ENTERO.
  const cols = `id, date_sale, channel, discount, shipping_cost, total_price${base === 'bdi' ? ', channel_id' : ''}`
  const ventas = await leerTodo(sb, 'ventas', (q) => q.select(cols).gte('date_sale', desde).lte('date_sale', AYER).order('id'))

  let detalles = []
  if (ventas.length) {
    // `venta_detalles` ⛔ tiene fecha: el sale_id es el único puente, y el rango arrastra ventas de
    // otras fechas — los núcleos cruzan contra el mapa de ventas, ⛔ contra el rango.
    const min = ventas[0].id
    const max = ventas[ventas.length - 1].id
    detalles = await leerTodo(sb, 'venta_detalles', (q) =>
      q.select('sale_id, product_id, size_id, size, quantity, total, unit_price').gte('sale_id', min).lte('sale_id', max).order('id'))
  }

  const colsProd = `id, name, sku, category, retailer_price${base === 'zattia' ? ', proveedor' : ''}`
  const productos = await leerTodo(sb, 'productos', (q) => q.select(colsProd).order('id'))
  const inventario = await leerTodo(sb, 'inventario', (q) =>
    q.select('product_id, size_id, size_name, store_name, available_quantity').order('product_id').order('size_id').order('store_name'))

  return { syncState, ventas, detalles, productos, inventario }
}

/**
 * El proveedor de BDI sale de las órdenes de compra, porque Gestión Nube ⛔ lo tiene en el
 * producto. Si un producto entró con dos proveedores, gana la orden más nueva.
 */
async function proveedoresBdi() {
  const sb = bases.bdi
  const ocs = await leerTodo(sb, 'recepcion_oc', (q) => q.select('id, proveedor_nombre, confirmada_at').eq('store', 'bdi').order('id'))
  const ocPor = new Map(ocs.map((o) => [o.id, o]))
  const lineas = await leerTodo(sb, 'recepcion_linea', (q) => q.select('oc_ref, producto_id').eq('store', 'bdi').not('producto_id', 'is', null).order('id'))
  const out = new Map()
  const cuando = new Map()
  for (const l of lineas) {
    const oc = ocPor.get(l.oc_ref)
    if (!oc || !oc.proveedor_nombre) continue
    const t = Date.parse(oc.confirmada_at || '') || 0
    if (t >= (cuando.get(l.producto_id) ?? -1)) {
      out.set(String(l.producto_id), oc.proveedor_nombre)
      cuando.set(l.producto_id, t)
    }
  }
  return out
}

/** Las listas de stock de UNA línea. Los críticos se calculan sobre la base entera. */
function stockDeLinea(base, universo, crit) {
  const sinStockCritico = new Set(crit.flatMap((f) => f.sinStock.map(claveDe)))
  const reponerCritico = new Set(crit.flatMap((f) => f.reponer.map(claveDe)))
  return {
    criticos: crit,
    curva: curvaRota(universo, undefined, sinStockCritico),
    subir: paradoEnDeposito(universo, reponerCritico),
    recompra: recompra(universo),
  }
}

/**
 * La base entera: su venta, y el stock partido por línea. En la de Zattia sale también el capítulo
 * de Stunned, que vive en el mismo Gestión Nube.
 */
async function leerCapitulos(base) {
  const lineas = base === 'zattia' ? ['zattia', 'stunned'] : ['bdi']
  try {
    const d = await leerBase(base)
    const completo = ayerCompleto(d.syncState, HOY)
    const skuPor = new Map(d.productos.map((p) => [String(p.id), p.sku]))
    const venta = ventaDeAyer({ base, ventas: d.ventas, detalles: d.detalles, skuPor, hoy: HOY, completo })

    let proveedorDe = null
    if (base === 'bdi') {
      try { proveedorDe = await proveedoresBdi() } catch (e) { anotar('proveedores de BDI', e.message) }
    }
    const universo = armarUniverso({ base, productos: d.productos, inventario: d.inventario, ventas: d.ventas, detalles: d.detalles, proveedorDe, hoy: HOY })
    const crit = criticos(base, universo)
    const partes = partirPorLinea(universo)
    console.log(`  ${base}: ${d.ventas.length} ventas · ${d.detalles.length} renglones · ${d.inventario.length} filas de stock · ayer completo: ${completo}`)
    if (completo !== true) anotar(`venta de ${base}`, `el día ${AYER} no está completo en el espejo (sync_state.diario = ${JSON.stringify(d.syncState.find((f) => f.clave === 'diario') || null)})`)
    return {
      productos: d.productos,
      capitulos: lineas.map((linea) => ({
        linea, base, venta,
        // Los críticos son de la base: hoy ninguna familia de Stunned está en `CRITICOS`.
        stock: stockDeLinea(base, partes[linea] || [], linea === 'stunned' ? [] : crit),
      })),
    }
  } catch (e) {
    anotar(`leer ${base}`, e.message)
    return { productos: [], capitulos: lineas.map((linea) => ({ linea, base, error: e.message })) }
  }
}

// ── Las fotos ──────────────────────────────────────────────────────────────────────────────────

/**
 * El catálogo de Tienda Nube de una tienda, del mismo endpoint que usa la app. Es público: si un
 * día pide login, esto devuelve `null`, el mail sale SIN FOTOS y el pie lo dice — ⛔ se rompe.
 */
async function catalogo(tienda) {
  try {
    const r = await fetch(`https://bdi-catalogo.vercel.app/api/tiendanube-audit?store=${tienda}`)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const d = await r.json()
    return Array.isArray(d && d.products) ? d.products : []
  } catch (e) {
    console.log(`  ✗ catálogo de Tienda Nube de ${tienda}: ${e.message}`)
    return null
  }
}

/** `Map pid → miniatura` de cada producto de la base que matchea con una foto. */
function fotosDe(productos, indice) {
  const out = new Map()
  for (const p of productos) {
    const u = fotoDe(p, indice)
    if (u) out.set(String(p.id), u)
  }
  return out
}

// ── La pauta ───────────────────────────────────────────────────────────────────────────────────

/** Los hallazgos abiertos, igual que los leía el mail de las 07:50 (`evaluar-reglas-meta.mjs`). */
async function pauta() {
  try {
    const sb = bases.bdi
    const { data, error } = await sb.from('meta_ads_hallazgo')
      .select('regla_id,objeto_id,objeto_nombre,linea,fecha,motivo,sugerencia')
      .eq('estado', 'nuevo').order('fecha', { ascending: false }).limit(200)
    if (error) throw new Error(error.message)
    // 🔴 El `preset` vive en la REGLA: sin él `esParaDecidir` cuenta los datos como decisiones.
    const { data: reglas, error: e2 } = await sb.from('meta_ads_regla').select('id,preset')
    if (e2) throw new Error(e2.message)
    const presetDe = new Map((reglas || []).map((r) => [r.id, r.preset]))
    const conPreset = (data || []).map((h) => ({ ...h, preset: presetDe.get(h.regla_id) || null }))
    return armarPauta(agruparHallazgos(conPreset), HOY, { pie: false })
  } catch (e) {
    anotar('hallazgos de la pauta', e.message)
    return { error: e.message }
  }
}

// ── Lo sin terminar ────────────────────────────────────────────────────────────────────────────

const conDias = (items) => items.map((i) => ({ ...i, dias: i.fecha ? Math.max(0, diasEntre(i.fecha, HOY)) : null }))

async function pendientes() {
  const out = []

  // monitor-areben: el archivo ya está en el checkout del workflow.
  try {
    out.push({ proyecto: 'Monitor', estado: 'ok', items: conDias(abiertosPorTitulo(readFileSync('PENDIENTES.md', 'utf8'), HOY)) })
  } catch (e) {
    out.push({ proyecto: 'Monitor', estado: 'error', motivo: `no se pudo leer PENDIENTES.md (${e.message})` })
  }

  // areben-produccion es público: se lee por raw, sin token.
  try {
    const r = await fetch('https://raw.githubusercontent.com/brunoarevalo-arbn/areben-produccion/main/PENDIENTES.md')
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    out.push({ proyecto: 'Producción', estado: 'ok', items: conDias(abiertosPorCasilla(await r.text(), HOY)) })
  } catch (e) {
    out.push({ proyecto: 'Producción', estado: 'error', motivo: `no se pudo leer PENDIENTES.md (${e.message})` })
  }

  // areben-marketing (Maketa) es privado: pide un token de sólo lectura. Sin él se DICE.
  const token = process.env.PENDIENTES_TOKEN
  if (!token) {
    out.push({ proyecto: 'Maketa', estado: 'no-configurado', motivo: 'sin configurar: falta el secret PENDIENTES_TOKEN (lectura de brunoarevalo-arbn/areben-marketing).' })
  } else {
    try {
      const r = await fetch('https://api.github.com/repos/brunoarevalo-arbn/areben-marketing/contents/PENDIENTES.md', {
        headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github.raw', 'x-github-api-version': '2022-11-28' },
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      out.push({ proyecto: 'Maketa', estado: 'ok', items: conDias(abiertosPorTitulo(await r.text(), HOY)) })
    } catch (e) {
      anotar('PENDIENTES de Maketa', e.message)
      out.push({ proyecto: 'Maketa', estado: 'error', motivo: `no se pudo leer PENDIENTES.md (${e.message})` })
    }
  }
  return out
}

// ── El trabajo ─────────────────────────────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now()
  console.log(`Parte de la mañana · hoy ${HOY} · ayer ${AYER}${SIMULACRO ? ' · SIMULACRO' : ''}`)

  const [bdi, zattia, hallazgos, pend, tnBdi, tnZattia, tnStunned] = await Promise.all([
    leerCapitulos('bdi'), leerCapitulos('zattia'), pauta(), pendientes(),
    catalogo('bdi'), catalogo('zattia'), catalogo('stunned'),
  ])
  const notas = []
  const fotos = {
    bdi: fotosDe(bdi.productos, tnBdi ? indiceDeFotos(tnBdi) : null),
    // Stunned tiene su propia Tienda Nube pero vive en el Gestión Nube de Zattia.
    zattia: fotosDe(zattia.productos, tnZattia || tnStunned ? indiceDeFotos(tnZattia || [], tnStunned || []) : null),
  }
  const caidos = [['BDI', tnBdi], ['Zattia', tnZattia], ['Stunned', tnStunned]].filter(([, c]) => !c).map(([n]) => n)
  if (caidos.length) notas.push(`Sin fotos de ${caidos.join(', ')}: el catálogo de Tienda Nube no contestó.`)
  console.log(`  fotos: BDI ${fotos.bdi.size} de ${bdi.productos.length} · Zattia+Stunned ${fotos.zattia.size} de ${zattia.productos.length}`)

  const parte = armarParte({
    hoy: HOY,
    capitulos: [...bdi.capitulos, ...zattia.capitulos],
    fotos,
    pauta: hallazgos,
    pendientes: pend,
    notas,
  })
  console.log(`  HTML: ${(Buffer.byteLength(parte.html) / 1024).toFixed(1)} KB`)
  if (HTML_A) { writeFileSync(HTML_A, parte.html); console.log(`  HTML guardado en ${HTML_A}`) }

  if (SIMULACRO) {
    console.log(`\nMail [SIMULACRO, no se manda] → ${MAIL_A}\n  ${parte.asunto}\n`)
    console.log(parte.texto.split('\n').map((l) => `  | ${l}`).join('\n'))
  } else {
    const r = await mandarMail({ para: MAIL_A, asunto: parte.asunto, texto: parte.texto, html: parte.html })
    if (r.ok) console.log(`\nMail mandado a ${MAIL_A}: «${parte.asunto}» (${r.id})`)
    else if (!r.configurado) anotar('mandar el parte', 'faltan AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY')
    else anotar('mandar el parte', r.motivo)
  }

  console.log(`\nListo en ${((Date.now() - t0) / 1000).toFixed(1)} s.`)
  if (problemas.length) {
    console.log(`\n${problemas.length} problema${problemas.length === 1 ? '' : 's'}:`)
    for (const p of problemas) console.log(`  - ${p}`)
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
