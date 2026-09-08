// Camina «Lo que entró hace poco y ya se vende» contra las bases REALES.
//
//   node scripts/caminar-prm-estrellas.mjs
//
// ⛔ SÓLO LEE.
//
// 🔑 **No es un test, y el oráculo es la misma cuenta por OTRO camino.** `estrellas()` sale de lo
// que devuelve `movimiento()` de `api/_prm.js` —PostgREST, con su paginación y su recruce—; el
// control lo rehace en SQL directo por `pg`. Es lo único que caza que la paginación o el embed se
// estén comiendo filas: un conteo más bajo se ve exactamente igual que un producto que no se vendió.
//
// 🔴 **El proveedor NO se elige a mano.** La primera versión de la caminata hermana nombraba tres
// de BDI y salía 20 de 20 sin haber tocado nunca la base de Zattia, que es la mitad de las órdenes
// y 28 de los 34 proveedores. Acá se eligen **desde la base**: el que más productos nuevos trajo en
// la ventana, de cada marca.
import { readFileSync } from 'fs'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    }),
)
for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'SUPABASE_KEY', 'ZATTIA_SUPABASE_URL', 'ZATTIA_SUPABASE_SERVICE_KEY', 'ZATTIA_SUPABASE_KEY'])
  if (env[k]) process.env[k] = env[k]

const { movimiento } = await import('../api/_prm.js')
const { estrellas, paraAvisar } = await import('../lib/prm/estrellas.core.js')

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY)
const pgc = new pg.Client({ connectionString: env.DATABASE_URL_BDI, ssl: { rejectUnauthorized: false } })
await pgc.connect()
const zat = new pg.Client({ connectionString: env.DATABASE_URL_ZATTIA, ssl: { rejectUnauthorized: false } })
await zat.connect()
const baseDe = (store) => (store === 'zattia' ? zat : pgc)

let ok = 0
let mal = 0
const chequeo = (nombre, cond, detalle) => {
  if (cond) { ok++; console.log(`  ✅ ${nombre}`) }
  else { mal++; console.log(`  ❌ ${nombre}${detalle ? ` — ${detalle}` : ''}`) }
}

const VENTANA = 30
const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
console.log(`\nHoy: ${hoy} · ventana: ${VENTANA} días\n`)

// ── Quién trajo productos NUEVOS en la ventana, por marca ────────────────────────────────────
const { rows: candidatos } = await pgc.query(
  `select o.store, o.proveedor_id, max(o.proveedor_nombre) nombre, count(distinct l.sku)::int skus
     from recepcion_oc o join recepcion_linea l on l.oc_ref = o.id
    where o.confirmada_at >= now() - interval '${VENTANA} days' and o.proveedor_id is not null
    group by 1, 2 order by 4 desc`,
)
const elegidos = []
for (const store of ['zattia', 'bdi']) {
  const c = candidatos.find((x) => x.store === store)
  if (c) elegidos.push(c)
  else console.log(`⚠️  ${store}: ninguna orden en la ventana, así que no hay a quién caminar.`)
}

for (const c of elegidos) {
  const { data: local } = await sb
    .from('proveedor_local')
    .select('id, nombre, proveedor_id_ingresos')
    .eq('proveedor_id_ingresos', c.proveedor_id)
    .maybeSingle()
  if (!local) { console.log(`⚠️  ${c.nombre}: sin ficha en el padrón, se saltea.`); continue }

  console.log(`\n── ${local.nombre} (${c.store}, proveedor ${c.proveedor_id})`)
  const mov = await movimiento(sb, local, 90)
  if (mov.marcasMudas && mov.marcasMudas.length) {
    // 🔴 En esta Mac falta `ZATTIA_SUPABASE_SERVICE_KEY`, así que la base de Zattia contesta
    // `permission denied` y sus ventas salen mudas. ⛔ No es un rojo del código: se dice y se sigue.
    console.log(`  ⚠️  MARCA MUDA (${mov.marcasMudas.join(', ')}): sin credencial, sus ventas y su stock no se pudieron leer desde acá.`)
  }
  const stock = new Map((mov.stockPorProducto || []).map((s) => [`${s.store}:${s.producto_id}`, s.unidades]))
  const e = estrellas(mov.productos, mov.ventas, hoy, { dias: VENTANA, stock: stock.size ? stock : null })
  console.log(`  ${e.filas.length} producto(s) nuevo(s) · ${e.repuestos} repuesto(s) · ${e.sinFecha} sin fecha`)
  for (const f of e.filas.slice(0, 8)) {
    console.log(
      `   ${paraAvisar(f) ? '⭐' : '  '} ${String(f.nombre).slice(0, 30).padEnd(30)} hace ${String(f.dias).padStart(2)}d · compró ${String(f.unidades).padStart(3)} · vendió ${String(f.vendidas).padStart(3)}` +
        ` · ${f.colocado == null ? '—' : `${Math.round(f.colocado * 100)}%`} · se termina ${f.seAgotaEn == null ? '—' : `en ${f.seAgotaEn.toFixed(1)} d`} · stock ${f.stock == null ? '—' : f.stock}`,
    )
  }

  // ── El oráculo: la MISMA cuenta por otro camino ────────────────────────────────────────────
  //
  // 🔴 **El grano es el PRODUCTO, ⛔ no el SKU, y la primera versión de este control se equivocó
  // justo ahí**: agrupó los renglones por `sku` y dijo «75 contra 6». Cada producto de Gestión Nube
  // tiene un SKU por talle y color — `JEAN SLATE` son 8 —, así que un control por SKU ⛔ no cuenta
  // productos: cuenta variantes, y el rojo que tira ⛔ no es un bug del código.
  //
  // 🔑 Y el cruce del control es **suyo**: SKU → `inventario` de la marca por `pg`, ⛔ sin pasar por
  // `espejo.core.js` ni por PostgREST. Es lo que lo hace un oráculo y no un espejo del código.
  const base = baseDe(c.store)
  const { rows: crudas } = await pgc.query(
    `select l.sku, l.codigo_barras, l.nombre, o.confirmada_at::date fecha, l.cantidad_contada u
       from recepcion_linea l join recepcion_oc o on o.id = l.oc_ref
      where o.proveedor_id = $1`,
    [c.proveedor_id],
  )
  const skus = [...new Set(crudas.map((r) => r.sku).filter(Boolean))]
  const barras = [...new Set(crudas.map((r) => r.codigo_barras).filter(Boolean))]
  const { rows: espejo } = await base.query(
    `select sku, barcode, product_id from inventario where sku = any($1) or barcode = any($2)`,
    [skus, barras],
  )
  const porSku = new Map(espejo.filter((r) => r.sku).map((r) => [String(r.sku), String(r.product_id)]))
  const porBarra = new Map(espejo.filter((r) => r.barcode).map((r) => [String(r.barcode), String(r.product_id)]))

  const control = new Map()
  for (const r of crudas) {
    const pid = (r.sku && porSku.get(String(r.sku))) || (r.codigo_barras && porBarra.get(String(r.codigo_barras))) || null
    if (!pid) continue
    const a = control.get(pid) || { clave: `${c.store}:${pid}`, store: c.store, producto_id: pid, nombre: r.nombre, sku: r.sku, unidades: 0, desde: null, hasta: null }
    a.unidades += Number(r.u) || 0
    const f = r.fecha.toISOString().slice(0, 10)
    if (!a.desde || f < a.desde) a.desde = f
    if (!a.hasta || f > a.hasta) a.hasta = f
    control.set(pid, a)
  }
  const ids = [...control.keys()].map(Number).filter(Number.isFinite)
  const { rows: ventasSql } = await base.query(
    `select d.product_id::text producto_id, v.date_sale::date fecha, sum(d.quantity)::int unidades
       from venta_detalles d join ventas v on v.id = d.sale_id
      where d.product_id = any($1) and v.date_sale >= now() - interval '120 days'
      group by 1, 2`,
    [ids],
  )
  const { rows: stockSql } = await base.query(
    `select product_id::text producto_id, coalesce(sum(available_quantity),0)::int unidades from inventario where product_id = any($1) group by 1`,
    [ids],
  )
  const eControl = estrellas(
    [...control.values()],
    ventasSql.map((r) => ({ store: c.store, producto_id: r.producto_id, fecha: r.fecha.toISOString().slice(0, 10), unidades: r.unidades })),
    hoy,
    { dias: VENTANA, stock: new Map(stockSql.map((r) => [`${c.store}:${r.producto_id}`, r.unidades])) },
  )

  console.log(`  ── el control por pg: ${eControl.filas.length} nuevo(s) · ${eControl.repuestos} repuesto(s)`)
  for (const f of eControl.filas.slice(0, 8)) {
    console.log(
      `   ${paraAvisar(f) ? '⭐' : '  '} ${String(f.nombre).slice(0, 30).padEnd(30)} hace ${String(f.dias).padStart(2)}d · compró ${String(f.unidades).padStart(3)} · vendió ${String(f.vendidas).padStart(3)}` +
        ` · ${f.colocado == null ? '—' : `${Math.round(f.colocado * 100)}%`} · se termina ${f.seAgotaEn == null ? '—' : `en ${f.seAgotaEn.toFixed(1)} d`} · stock ${f.stock == null ? '—' : f.stock}`,
    )
  }

  // 🔴 **Con la marca muda, el control VE (entra por `pg`) y el handler NO.** Comparar los dos ahí
  // tiraría un rojo que ⛔ no es del código: es la credencial que falta en esta Mac. Se dice y se
  // sigue — pero la REGLA queda ejercida igual, contra los datos de verdad.
  const muda = (mov.marcasMudas || []).includes(c.store)
  if (muda) {
    console.log('  ⚠️  El handler ⛔ NO se puede comparar con el control: sin `ZATTIA_SUPABASE_SERVICE_KEY`, PostgREST no contesta desde acá. La regla sí quedó ejercida contra la base real.')
    chequeo('el control encontró productos nuevos de verdad para ejercer la regla', eControl.filas.length > 0)
  } else {
    chequeo(
      `los productos nuevos coinciden (handler ${e.filas.length} · control ${eControl.filas.length})`,
      e.filas.length === eControl.filas.length,
    )
    chequeo(`los repuestos coinciden (${e.repuestos} contra ${eControl.repuestos})`, e.repuestos === eControl.repuestos)
    const porClave = new Map(eControl.filas.map((f) => [f.clave, f]))
    const distintas = e.filas.filter((f) => {
      const k = porClave.get(f.clave)
      return !k || k.unidades !== f.unidades || k.vendidas !== f.vendidas || k.stock !== f.stock
    })
    chequeo(
      'compradas, vendidas y stock coinciden producto por producto',
      distintas.length === 0,
      distintas.slice(0, 3).map((f) => {
        const k = porClave.get(f.clave)
        return k ? `${f.nombre}: ${f.unidades}/${f.vendidas}/${f.stock} vs ${k.unidades}/${k.vendidas}/${k.stock}` : `${f.nombre}: no está en el control`
      }).join(' · '),
    )
  }

  // 🔑 **El chequeo que ⛔ no depende de ninguna base**: el stock ⛔ no puede ser `comprado − vendido`.
  // Si un día lo fuera, la columna dejó de decir lo que dice y nadie se enteraría.
  const conStock = eControl.filas.filter((f) => f.stock != null)
  const comoResta = conStock.filter((f) => f.stock === f.unidades - f.vendidas)
  if (conStock.length) {
    console.log(`  📌 stock ≠ comprado − vendido en ${conStock.length - comoResta.length} de ${conStock.length}: la reserva ⛔ no siempre entra por una orden.`)
  }
}

console.log(`\n${ok} de ${ok + mal}`)
await pgc.end()
await zat.end()
process.exit(mal ? 1 : 0)
