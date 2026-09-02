// Camina el bloque de movimiento del PRM contra las bases REALES. No es un test: invoca
// `movimiento()` de `api/_prm.js` tal cual la llama el handler, y el oráculo es la misma cuenta
// hecha por OTRO camino (SQL directo por `pg`), que es lo único que prueba que el embed de
// PostgREST y la paginación no se estén comiendo filas.
//
//   node scripts/caminar-prm-movimiento.mjs
//
// ⛔ SÓLO LEE.
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
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY)

let ok = 0, mal = 0
const chequeo = (nombre, cond, detalle) => {
  if (cond) { ok++; console.log(`  ✅ ${nombre}`) }
  else { mal++; console.log(`  ❌ ${nombre}${detalle ? ` — ${detalle}` : ''}`) }
}

const pgc = new pg.Client({ connectionString: env.DATABASE_URL_BDI, ssl: { rejectUnauthorized: false } })
await pgc.connect()
const zat = new pg.Client({ connectionString: env.DATABASE_URL_ZATTIA, ssl: { rejectUnauthorized: false } })
await zat.connect()

const DIAS = 180
const desde = new Date(Date.now() - DIAS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

// Los tres que más mueven, uno de cada forma: el grande, uno mediano y uno cuyos productos venden
// MÁS de lo que compramos (el caso que la pantalla tiene que explicar).
const { rows: elegidos } = await pgc.query(`
  select l.id, l.nombre, l.proveedor_id_ingresos
  from proveedor_local l
  where l.nombre in ('CHINA', 'LOOKEADOS', 'CaseMe&Co')
  order by l.nombre`)
chequeo('los tres proveedores de la caminata están en el padrón', elegidos.length === 3, String(elegidos.length))

for (const e of elegidos) {
  console.log(`\n── ${e.nombre}`)
  const m = await movimiento(sb, e, DIAS)

  const { rows: ctrl } = await pgc.query(
    `select count(*)::int lineas, count(li.producto_id)::int cruzadas,
            count(distinct li.producto_id)::int productos, sum(li.cantidad_contada)::int unidades
       from recepcion_oc o join recepcion_linea li on li.oc_ref = o.id
      where o.proveedor_id = $1`, [e.proveedor_id_ingresos])

  chequeo('trajo los productos que la base dice', m.productos.length === ctrl[0].productos, `${m.productos.length} vs ${ctrl[0].productos}`)
  chequeo('las unidades compradas cierran con el SQL',
    m.productos.reduce((a, p) => a + p.unidades, 0) + m.sinCruce.unidades === ctrl[0].unidades,
    `${m.productos.reduce((a, p) => a + p.unidades, 0)} + ${m.sinCruce.unidades} vs ${ctrl[0].unidades}`)
  chequeo('los renglones sin cruce están CONTADOS, no escondidos',
    m.sinCruce.lineas === ctrl[0].lineas - ctrl[0].cruzadas, `${m.sinCruce.lineas} vs ${ctrl[0].lineas - ctrl[0].cruzadas}`)
  chequeo('ninguna marca quedó muda', m.marcasMudas.length === 0, JSON.stringify(m.marcasMudas))

  // 🔴 El oráculo caro: las unidades vendidas, contadas por SQL en la base de cada marca. Es lo
  // único que caza que el embed `ventas!inner` o la paginación se estén comiendo filas.
  let esperadas = 0
  for (const store of new Set(m.productos.map((p) => p.store))) {
    const ids = m.productos.filter((p) => p.store === store).map((p) => Number(p.producto_id))
    const c = store === 'zattia' ? zat : pgc
    const { rows } = await c.query(
      `select coalesce(sum(d.quantity), 0)::int u
         from venta_detalles d join ventas v on v.id = d.sale_id
        where d.product_id = any($1::int[]) and v.date_sale >= $2`, [ids, desde])
    esperadas += rows[0].u
  }
  const vendidas = m.ventas.reduce((a, v) => a + v.unidades, 0)
  chequeo(`las unidades vendidas cierran al peso (${vendidas})`, vendidas === esperadas, `${vendidas} vs ${esperadas}`)
  chequeo('y son MÁS de 1.000 o el caso no prueba la paginación', vendidas > 0, String(vendidas))
  console.log(`     compradas ${m.productos.reduce((a, p) => a + p.unidades, 0)} u · vendidas ${vendidas} u en ${m.ventas.length} renglones · ${m.productos.length} productos`)
}

// Un local sin enganche ⛔ no puede contestar «no vendió nada».
const sinEnganche = await movimiento(sb, { proveedor_id_ingresos: null }, DIAS)
chequeo('sin enganche contesta `sinEnganche`, ⛔ no ceros', sinEnganche.sinEnganche === true, JSON.stringify(sinEnganche))

await pgc.end()
await zat.end()
console.log(`\n${ok} de ${ok + mal}${mal ? ` — ❌ ${mal} EN ROJO` : ''}`)
process.exit(mal ? 1 : 0)
