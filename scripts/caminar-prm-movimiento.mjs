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

const { movimiento, comparativa } = await import('../api/_prm.js')
const { comparativa: filasDe } = await import('../lib/prm/movimiento.ts')
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

// Los tres que más mueven de BDI, uno de cada forma: el grande, uno mediano y uno cuyos productos
// venden MÁS de lo que compramos (el caso que la pantalla tiene que explicar).
//
// 🔴 **Y uno de ZATTIA, elegido por la base y ⛔ no escrito a mano.** La primera versión de esta
// caminata tenía los tres de BDI nomás y salía 20 de 20: las bases son DOS y la mitad de las
// órdenes —28 de los 34 proveedores— nunca se ejercía. Lo destapó la comparativa, que las toca a
// las dos.
const { rows: elegidos } = await pgc.query(`
  select l.id, l.nombre, l.proveedor_id_ingresos
    from proveedor_local l
   where l.nombre in ('CHINA', 'LOOKEADOS', 'CaseMe&Co')
   union all
  select l.id, l.nombre, l.proveedor_id_ingresos
    from proveedor_local l
    join (select proveedor_id, count(*) n from recepcion_oc where store = 'zattia' group by 1
          order by 2 desc limit 1) z on z.proveedor_id = l.proveedor_id_ingresos`)
chequeo('los cuatro proveedores de la caminata están en el padrón', elegidos.length === 4, String(elegidos.length))
chequeo('y uno de ellos es de ZATTIA, o se camina media base', elegidos.length === 4)

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
  if (m.marcasMudas.length) {
    // ⚠️ No es un rojo del código: es un pedazo sin caminar, y se dice con su causa.
    console.log(`  ⚠️  SIN CAMINAR las ventas de ${m.marcasMudas.join(', ')} — falta la service key de esa marca en .env`)
  }

  // 🔴 El oráculo caro: las unidades vendidas, contadas por SQL en la base de cada marca. Es lo
  // único que caza que el embed `ventas!inner` o la paginación se estén comiendo filas.
  let esperadas = 0
  for (const store of new Set(m.productos.map((p) => p.store))) {
    if (m.marcasMudas.includes(store)) continue
    const ids = m.productos.filter((p) => p.store === store).map((p) => Number(p.producto_id))
    const c = store === 'zattia' ? zat : pgc
    const { rows } = await c.query(
      `select coalesce(sum(d.quantity), 0)::int u
         from venta_detalles d join ventas v on v.id = d.sale_id
        where d.product_id = any($1::int[]) and v.date_sale >= $2`, [ids, desde])
    esperadas += rows[0].u
  }
  const vendidas = m.ventas.reduce((a, v) => a + v.unidades, 0)
  if (!m.marcasMudas.length) {
    chequeo(`las unidades vendidas cierran al peso (${vendidas})`, vendidas === esperadas, `${vendidas} vs ${esperadas}`)
    chequeo('y no son cero, o el caso no prueba nada', vendidas > 0, String(vendidas))
  }
  console.log(`     compradas ${m.productos.reduce((a, p) => a + p.unidades, 0)} u · vendidas ${vendidas} u en ${m.ventas.length} renglones · ${m.productos.length} productos`)
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// La comparativa: los 34 en una tabla
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n── la comparativa de todos')
const DIAS_C = 30
const desdeC = new Date(Date.now() - DIAS_C * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
const cmp = await comparativa(sb, DIAS_C)
const filas = filasDe(cmp.locales, cmp.ocs, cmp.lineas, cmp.ventasPorProducto, DIAS_C)

// 🔴 **Una marca muda ⛔ NO es un rojo del código: es un pedazo SIN CAMINAR, y se dice con su
// causa.** En esta Mac `ZATTIA_SUPABASE_SERVICE_KEY` no está en `.env` y con la anon key la base de
// Zattia contesta `permission denied for table venta_detalles` — a propósito: ahí hay plata. Sin
// esta distinción, el próximo que corra esto lee 22 rojos y sale a arreglar código sano.
const mudas = new Set(cmp.marcasMudas || [])
if (mudas.size) {
  console.log(`  ⚠️  SIN CAMINAR: ${[...mudas].join(', ')} — el cliente no pudo leer venta_detalles.`)
  console.log('     En esta Mac falta ZATTIA_SUPABASE_SERVICE_KEY en .env (la anon key no llega a esa tabla).')
}

const { rows: cuantos } = await pgc.query(`select count(*)::int n from proveedor_local where proveedor_id_ingresos is not null`)
chequeo('están todos los enganchados', filas.length === cuantos[0].n, `${filas.length} vs ${cuantos[0].n}`)

// 🔴 El oráculo caro de esta tabla: lo COMPRADO de cada proveedor, contra el SQL.
const { rows: compradoSql } = await pgc.query(`
  select o.proveedor_id, sum(li.cantidad_contada)::int u, count(distinct o.id)::int ocs
    from recepcion_oc o join recepcion_linea li on li.oc_ref = o.id
   where o.proveedor_id is not null group by 1`)
const esperado = new Map(compradoSql.map((r) => [r.proveedor_id, r]))
const malComprado = filas.filter((f) => (esperado.get(f.proveedorId)?.u ?? 0) !== f.comprado)
chequeo('lo comprado de cada uno cierra con el SQL', malComprado.length === 0, JSON.stringify(malComprado.slice(0, 2)))

// Y lo VENDIDO, proveedor por proveedor, contra las bases de cada marca. Sólo se controlan los
// proveedores cuyas marcas contestaron: exigirle un número a una marca muda sería controlar el
// `catch`, no la cuenta.
let malVendido = 0
let caminados = 0
for (const f of filas) {
  const { rows: ids } = await pgc.query(
    `select o.store, array_agg(distinct li.producto_id::int) ids
       from recepcion_oc o join recepcion_linea li on li.oc_ref = o.id
      where o.proveedor_id = $1 and li.producto_id is not null group by 1`, [f.proveedorId])
  if (ids.some((g) => mudas.has(g.store))) continue
  caminados++
  let u = 0
  for (const g of ids) {
    const c = g.store === 'zattia' ? zat : pgc
    const { rows } = await c.query(
      `select coalesce(sum(d.quantity), 0)::int u from venta_detalles d join ventas v on v.id = d.sale_id
        where d.product_id = any($1::int[]) and v.date_sale >= $2`, [g.ids, desdeC])
    u += rows[0].u
  }
  if (u !== f.vendidas) { malVendido++; console.log(`     ✗ ${f.nombre}: ${f.vendidas} vs ${u}`) }
}
chequeo(`lo vendido cierra al peso en los ${caminados} que se pudieron caminar`, malVendido === 0, `${malVendido} en rojo`)
chequeo('y se caminó más de uno, o esto no prueba nada', caminados > 1, `${caminados} caminados de ${filas.length}`)

// 🔴 La punta del solape: la columna NO se puede sumar, y la diferencia tiene que ser EXACTAMENTE
// lo vendido de los productos que trajeron dos. Si diera 0, el caso no estaría probado.
const { rows: solape } = await pgc.query(`
  with p as (
    select o.store, li.producto_id, count(distinct o.proveedor_id)::int provs
      from recepcion_oc o join recepcion_linea li on li.oc_ref = o.id
     where li.producto_id is not null and o.proveedor_id is not null group by 1,2)
  select store, array_agg(producto_id::int) ids from p where provs > 1 group by 1`)
let doble = 0
for (const g of solape) {
  if (mudas.has(g.store)) continue
  const c = g.store === 'zattia' ? zat : pgc
  const { rows } = await c.query(
    `select coalesce(sum(d.quantity), 0)::int u from venta_detalles d join ventas v on v.id = d.sale_id
      where d.product_id = any($1::int[]) and v.date_sale >= $2`, [g.ids, desdeC])
  doble += rows[0].u
}
const sumaFilas = filas.reduce((a, f) => a + f.vendidas, 0)
const { rows: unicos } = await pgc.query(`
  select coalesce(sum(d.quantity), 0)::int u from venta_detalles d join ventas v on v.id = d.sale_id
   where v.date_sale >= $1 and d.product_id in (
     select distinct li.producto_id::int from recepcion_oc o join recepcion_linea li on li.oc_ref = o.id
      where o.store = 'bdi' and li.producto_id is not null and o.proveedor_id is not null)`, [desdeC])
console.log(`     suma de la columna ${sumaFilas} · productos distintos de BDI ${unicos[0].u} · doble contado ${doble}`)
chequeo('el solape existe y está identificado', solape.length > 0, 'ningún producto compartido: el caso no se probó')
chequeo('algún proveedor lo declara en `compartidos`', filas.some((f) => f.compartidos > 0), '0 filas con compartidos')

// Un local sin enganche ⛔ no puede contestar «no vendió nada».
const sinEnganche = await movimiento(sb, { proveedor_id_ingresos: null }, DIAS)
chequeo('sin enganche contesta `sinEnganche`, ⛔ no ceros', sinEnganche.sinEnganche === true, JSON.stringify(sinEnganche))

await pgc.end()
await zat.end()
console.log(`\n${ok} de ${ok + mal}${mal ? ` — ❌ ${mal} EN ROJO` : ''}`)
process.exit(mal ? 1 : 0)
