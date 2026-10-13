// **El correo de los lunes de la reposición de BDI** (Darío, 12-oct-2026): lo que la reposición
// descubre y no puede resolver — lo que se vende sin stock en el depósito, lo que no se encontró al
// armar y, el primer lunes del mes, lo que no vendió nada en 60 días.
//
//   node scripts/reposicion-semanal.mjs                # manda el correo
//   node scripts/reposicion-semanal.mjs --simulacro    # lo imprime y ⛔ NO lo manda
//   node scripts/reposicion-semanal.mjs --mensual      # incluye «sin ventas» aunque no sea el primer lunes
//   node scripts/reposicion-semanal.mjs --html a.html  # además guarda el HTML
//
// ⛔ SÓLO LEE la base de BDI. El armado del correo está en `lib/reposicion/semanal.core.js`.
// Lo dispara el cron de GitHub de los lunes: si llega unas horas tarde no importa (es un resumen).
import { readFileSync, writeFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { fechaAR } from '../lib/reposicion/armado.core.js'
import { sumarDias } from '../lib/fechas/dia.core.js'
import { armarSemanal, esPrimerLunes } from '../lib/reposicion/semanal.core.js'
import { tipoBdi } from '../lib/reposicion/tipo-bdi.core.js'
import { mandarMail } from './lib/mail.mjs'

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
const MENSUAL = process.argv.includes('--mensual') || process.env.ENTRADA_MENSUAL === 'true'
const HTML_A = process.argv.includes('--html') ? process.argv[process.argv.indexOf('--html') + 1] : process.env.CORREO_HTML || null
const MAIL_A = (process.env.MAIL_REPOSICION_A || 'darioarevalo@arebensrl.com').split(',').map((s) => s.trim()).filter(Boolean)
const HOY = fechaAR()
const VENTANA = 60
/** Desde cuántas ventas (minoristas, en 60 días) algo «se vende» para la lista del depósito vacío. */
const VENDE_DESDE = 4
/** Lo que no pasa por el depósito: se compra directo al local (Darío, 12-oct-2026). */
const DIRECTO_AL_LOCAL = /HIDROGEL/i
/** Lo que se está por discontinuar: no se compra más (Darío, 12-oct-2026: el 9D común). */
const DISCONTINUADO = /^\s*TEMPLADO 9D\s*$/i

async function todo(sb, tabla, select, armar = (q) => q) {
  const out = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await armar(sb.from(tabla).select(select)).range(desde, desde + 999)
    if (error) throw new Error(`${tabla}: ${error.message}`)
    out.push(...(data || []))
    if (!data || data.length < 1000) return out
  }
}

async function main() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('faltan SUPABASE_URL / SUPABASE_SERVICE_KEY')
  const sb = createClient(url, key)
  const desde = sumarDias(HOY, -VENTANA)

  // Ventas de 60 días, todos los canales: el mayorista cuenta para «sin ventas», no para el depósito
  // minorista (sale de otro lado). Orden con desempate único: ver `ventasLocal` en `lib/reposicion/cliente.ts`.
  const ventas = await todo(sb, 'ventas', 'id, channel', (q) => q.gte('date_sale', desde).order('id'))
  const canal = new Map(ventas.map((v) => [v.id, v.channel || '']))
  const minId = ventas.length ? Math.min(...ventas.map((v) => v.id)) : 0
  const det = ventas.length
    ? await todo(sb, 'venta_detalles', 'sale_id, product_id, size_id, quantity', (q) => q.gte('sale_id', minId).order('sale_id').order('product_id').order('size_id'))
    : []
  const minorista = {}
  const porProducto = {}
  for (const d of det) {
    if (!canal.has(d.sale_id)) continue
    const q = d.quantity || 1
    porProducto[d.product_id] = (porProducto[d.product_id] || 0) + q
    if (!/mayorista/i.test(canal.get(d.sale_id))) minorista[`${d.product_id}_${d.size_id}`] = (minorista[`${d.product_id}_${d.size_id}`] || 0) + q
  }

  const inv = await todo(sb, 'inventario', 'product_id, size_id, product_name, size_name, sku, available_quantity, store_name', (q) => q.order('product_id').order('size_id').order('store_name'))
  const vars = {}
  for (const r of inv) {
    const k = `${r.product_id}_${r.size_id}`
    const v = (vars[k] ??= { pid: String(r.product_id), name: r.product_name || '—', size: r.size_name || '', sku: r.sku || '', local: 0, dep: 0 })
    const q = Math.max(0, r.available_quantity || 0)
    if (r.store_name === 'Local') v.local += q
    else if (r.store_name === 'Deposito Minorista') v.dep += q
  }

  // 1) Se vende y no queda en el depósito (1 = la reserva para el online: tampoco se puede llevar).
  // ⛔ Sin las fundas: casi todas se importan, no es una compra de acá (Darío, 12-oct-2026).
  const sinDeposito = Object.entries(vars)
    .filter(([k, v]) => (minorista[k] || 0) >= VENDE_DESDE && v.dep <= 1 && !DIRECTO_AL_LOCAL.test(v.name) && !DISCONTINUADO.test(v.name) && tipoBdi(v) !== 'funda')
    .map(([k, v]) => ({ name: v.name, size: v.size, porSemana: Math.round(((minorista[k] / VENTANA) * 7) * 10) / 10, local: v.local, dep: v.dep }))
    .sort((a, b) => b.porSemana - a.porSemana)

  // 2) No encontradas al armar, últimos 7 días. Sin la tabla (todavía no se creó) = null, no error.
  let noEncontradas = null
  const arm = await sb.from('repo_armado').select('estado, pedido, escaneos, faltantes').eq('store', 'bdi').eq('estado', 'transferido').gte('fecha', sumarDias(HOY, -7))
  if (!arm.error) {
    const m = new Map()
    for (const a of arm.data || []) {
      for (const l of a.pedido || []) {
        const f = a.faltantes?.[l.vid]
        if (f !== 'no-estaba' && f !== 'rechazada') continue
        const x = m.get(l.vid) ?? { name: l.name, size: l.size, veces: 0, unidades: 0 }
        x.veces++
        x.unidades += l.cant - (a.escaneos?.[l.vid] || 0)
        m.set(l.vid, x)
      }
    }
    noEncontradas = [...m.values()].sort((a, b) => b.veces - a.veces || b.unidades - a.unidades)
  } else console.log(`repo_armado: ${arm.error.message} (se manda sin esa lista)`)

  // 3) Primer lunes del mes: sin NINGUNA venta en 60 días, con stock, y con más de 60 días de alta.
  let sinVenta = null
  if (MENSUAL || esPrimerLunes(HOY)) {
    const prods = await todo(sb, 'productos', 'id, created_at', (q) => q.order('id'))
    const alta = new Map(prods.map((p) => [String(p.id), p.created_at]))
    const P = {}
    for (const v of Object.values(vars)) {
      if (v.local + v.dep <= 0) continue
      const p = (P[v.pid] ??= { name: v.name, local: 0, dep: 0 })
      p.local += v.local
      p.dep += v.dep
    }
    sinVenta = Object.entries(P)
      .filter(([pid]) => !porProducto[pid] && (!alta.get(pid) || alta.get(pid).slice(0, 10) <= desde))
      .map(([, p]) => p)
      .sort((a, b) => b.local + b.dep - (a.local + a.dep))
  }

  const c = armarSemanal({ hoy: HOY, sinDeposito, noEncontradas, sinVenta })
  console.log(`Semanal BDI · ${HOY} · ${sinDeposito.length} sin depósito · ${noEncontradas ? noEncontradas.length : '—'} no encontradas · ${sinVenta ? sinVenta.length : '—'} sin ventas${SIMULACRO ? ' · SIMULACRO' : ''}`)
  if (HTML_A) writeFileSync(HTML_A, c.html)
  if (SIMULACRO) {
    console.log(`\n[SIMULACRO, no se manda] → ${MAIL_A.join(', ')}\n  ${c.asunto}\n`)
    console.log(c.texto.split('\n').map((l) => `  | ${l}`).join('\n'))
    return
  }
  let fallas = 0
  for (const para of MAIL_A) {
    const r = await mandarMail({ para, asunto: c.asunto, texto: c.texto, html: c.html })
    if (r.ok) console.log(`Mandado a ${para}: «${c.asunto}» (${r.id})`)
    else if (!r.configurado) throw new Error('faltan AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY')
    else {
      fallas++
      console.log(`✗ ${para}: ${r.motivo}`)
    }
  }
  if (fallas) process.exitCode = 1
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
