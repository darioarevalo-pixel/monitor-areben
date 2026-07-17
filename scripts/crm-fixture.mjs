#!/usr/bin/env node
/**
 * Fixture del CRM: baja los datos reales que consume `cargarCRM` para que el port
 * a TypeScript se pueda verificar por paridad contra el legacy, igual que se hizo
 * con el ETL en la Fase 4 (48/48 a la primera).
 *
 * Es READ-ONLY. No escribe una sola fila.
 *
 * Replica las consultas EXACTAS de index.html (13200-13260 y 13813), incluida la
 * union-dedup de los dos modos de canal. Si el port pide otra cosa, el test lo
 * caza — que es todo el punto.
 *
 * USO
 * ---
 *   node scripts/crm-fixture.mjs                 → baja el fixture de BDI
 *
 * Necesita un dump del KV previo (scripts/crm-kv.mjs --dump), porque la marca
 * `es_mayorista` de crmSeg **arma la consulta de ventas**: sin eso, los clientes ★
 * no aparecen. Ese orden KV→ventas no es negociable (ver el plan del CRM).
 *
 * El fixture va a tests/fixtures/crm/, gitignoreado: son ventas, teléfonos y
 * nombres de clientes reales.
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const DESTINO = join(RAIZ, 'tests', 'fixtures', 'crm')

// El CRM es bdi-only por ESQUEMA, no por permisos: `ventas.channel_id` no existe
// en la base de Zattia (el ETL bifurca el select por eso). Pedirlo allá da 400.
const CUENTA = {
  url: 'https://srqzzffmiiescffabtlc.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNycXp6ZmZtaWllc2NmZmFidGxjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNzg1NDksImV4cCI6MjA5MDk1NDU0OX0.UJGWTPCXhhxv2Q-4twUBvOivPLUk0SSQvyvtEkDmWLg',
}

/** Los select textuales del legacy. Un campo de más o de menos y el port computa otra cosa. */
const SEL_VENTAS = 'select=id,date_sale,total_price,client_id,channel_id,sale_state' // index.html:13200
const SEL_CLIENTES = 'select=id,name,email,phone,city,province' // index.html:13250
const SEL_DETALLES = 'select=sale_id,product_name,size,quantity,unit_price,total' // index.html:13814
const CANAL_MAYORISTA = '10' // hardcodeado en el <option> (index.html:1714) y en el chequeo de 13416

const H = { apikey: CUENTA.key, Authorization: 'Bearer ' + CUENTA.key }

/**
 * Pagina SIEMPRE. PostgREST corta en 1000 filas sin avisar (verificado: limit=2000
 * devuelve 999), y ese truncado silencioso ya costó $12,5M sin contar en el CRM
 * (ver el commit f8977ca). Acá no se pide nada sin paginar.
 */
async function fetchAll(table, baseParams) {
  const out = []
  let offset = 0
  for (;;) {
    const r = await fetch(`${CUENTA.url}/rest/v1/${table}?${baseParams}&order=id&limit=1000&offset=${offset}`, { headers: H })
    if (!r.ok) throw new Error(`Error ${r.status} en ${table}: ${(await r.text()).slice(0, 150)}`)
    const p = await r.json()
    out.push(...p)
    if (p.length < 1000) return out
    offset += 1000
  }
}

/** El dump del KV más reciente: de ahí sale la marca es_mayorista. */
function ultimoDumpKv() {
  const base = join(RAIZ, 'tests', 'fixtures', 'kv')
  if (!existsSync(base)) return null
  const dirs = readdirSync(base).filter((d) => d.startsWith('bdi-')).sort()
  if (!dirs.length) return null
  const d = join(base, dirs[dirs.length - 1])
  return {
    dir: dirs[dirs.length - 1],
    crmSeg: JSON.parse(readFileSync(join(d, 'crmseg.json'), 'utf8')),
    crmTelOverride: JSON.parse(readFileSync(join(d, 'crmtel.json'), 'utf8')),
  }
}

/** Port de la union-dedup del legacy (index.html:13226-13238). */
async function ventasModoMayorista(flagged) {
  const porCanal = await fetchAll('ventas', `${SEL_VENTAS}&channel_id=eq.${CANAL_MAYORISTA}&client_id=not.is.null`)
  let porMarcados = []
  for (let i = 0; i < flagged.length; i += 150) {
    const lote = flagged.slice(i, i + 150)
    porMarcados = porMarcados.concat(await fetchAll('ventas', `${SEL_VENTAS}&client_id=in.(${lote.join(',')})&client_id=not.is.null`))
  }
  const porId = new Map()
  for (const v of porCanal.concat(porMarcados)) porId.set(v.id, v)
  return { ventas: [...porId.values()], porCanal: porCanal.length, porMarcados: porMarcados.length }
}

async function main() {
  const kv = ultimoDumpKv()
  if (!kv) {
    console.error('\nFalta el dump del KV. Corré primero: node scripts/crm-kv.mjs --dump\n')
    process.exit(1)
  }
  const flagged = Object.keys(kv.crmSeg).filter((id) => kv.crmSeg[id] && kv.crmSeg[id].es_mayorista)
  console.log(`\nFixture del CRM · BDI\n\n  KV: ${kv.dir} → ${flagged.length} clientes marcados ★`)

  // Modo Mayorista (el default del select, index.html:1714)
  const may = await ventasModoMayorista(flagged)
  console.log(`  mayorista : ${may.ventas.length} ventas (canal ${may.porCanal} ∪ marcados ${may.porMarcados}, dedup por id)`)

  // Modo "Todos los canales" — la otra rama de cargarCRM (13225)
  const todas = await fetchAll('ventas', `${SEL_VENTAS}&client_id=not.is.null`)
  console.log(`  todos     : ${todas.length} ventas`)

  // Clientes de ambos modos, en lotes de 200 como el legacy (13249)
  const ids = [...new Set([...may.ventas, ...todas].map((v) => v.client_id).filter(Boolean))]
  const clientes = {}
  for (let i = 0; i < ids.length; i += 200) {
    const lote = ids.slice(i, i + 200)
    for (const c of await fetchAll('clientes', `${SEL_CLIENTES}&id=in.(${lote.join(',')})`)) clientes[c.id] = c
  }
  console.log(`  clientes  : ${Object.keys(clientes).length}`)

  // venta_detalles del cliente más grande: es lo que alimenta renderResumenCompras
  // (13754-13800), que el crítico del workflow marcó como el hueco sin cobertura.
  const porCliente = {}
  may.ventas.forEach((v) => { porCliente[v.client_id] = (porCliente[v.client_id] || 0) + 1 })
  const top = Object.entries(porCliente).sort((a, b) => b[1] - a[1])[0]
  const ventasTop = may.ventas.filter((v) => String(v.client_id) === top[0]).map((v) => v.id)
  let detalles = []
  for (let i = 0; i < ventasTop.length; i += 150) {
    detalles = detalles.concat(await fetchAll('venta_detalles', `${SEL_DETALLES}&sale_id=in.(${ventasTop.slice(i, i + 150).join(',')})`))
  }
  console.log(`  detalles  : ${detalles.length} líneas del cliente ${top[0]} (${top[1]} ventas, el más grande)`)

  mkdirSync(DESTINO, { recursive: true })
  const fixture = {
    fecha: new Date().toISOString(),
    dumpKv: kv.dir,
    ctx: { crmSeg: kv.crmSeg, crmTelOverride: kv.crmTelOverride, flagged },
    mayorista: { ventas: may.ventas },
    todos: { ventas: todas },
    clientes,
    resumenCompras: { clienteId: top[0], ventas: ventasTop, detalles },
  }
  const archivo = join(DESTINO, 'crm-bdi.json')
  writeFileSync(archivo, JSON.stringify(fixture))
  const mb = (JSON.stringify(fixture).length / 1024 / 1024).toFixed(1)
  console.log(`\nGuardado en ${archivo.replace(RAIZ + '/', '')} (${mb} MB)\n`)
}

await main()
