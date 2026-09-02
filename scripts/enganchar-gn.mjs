// Engancha el `proveedor_gn` de los locales del PRM usando la MISMA sugerencia que muestra la
// pantalla (`sugerirProveedorGn`, de `lib/prm/core.ts`). ⛔ No se copia la regla acá.
//
//   node scripts/enganchar-gn.mjs --dry     ← muestra qué haría, sin escribir
//   node scripts/enganchar-gn.mjs           ← escribe
//
// # Por qué existe si la pantalla ya lo sugiere
//
// Porque son 24 clicks y el módulo lleva **0 enganches** desde que salió. Lo pidió Bruno el
// 2-sep-2026: *«¿podés armar vos el enganche?»*. La pantalla sigue siendo la que manda: esto sólo
// aprieta los mismos botones de una.
//
// 🔴 **Idempotente y ⛔ NO pisa lo tildado a mano.** El que ya tiene `proveedor_gn` se saltea: el
// oráculo es que la segunda corrida diga `0`.
//
// 🔴 **Sólo locales con órdenes de ZATTIA.** `productos.proveedor` existe únicamente de ese lado, y
// un proveedor de BDI enganchado a un nombre de Zattia mostraría en su ficha ventas de otro.
//
// 🔴 **Dos locales que caen en el MISMO nombre de GN se saltean los dos.** Ese enganche cuenta las
// ventas del mismo catálogo dos veces, y desde la ficha ⛔ no se ve que esté pasando.
import { readFileSync } from 'fs'
import pg from 'pg'

const { sugerirProveedorGn } = await import('../lib/prm/core.ts')

const DRY = process.argv.includes('--dry')
const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    }),
)

const bdi = new pg.Client({ connectionString: env.DATABASE_URL_BDI, ssl: { rejectUnauthorized: false } })
const zat = new pg.Client({ connectionString: env.DATABASE_URL_ZATTIA, ssl: { rejectUnauthorized: false } })
await bdi.connect()
await zat.connect()

try {
  const { rows: locales } = await bdi.query(`
    select l.id, l.nombre, l.proveedor_gn
      from proveedor_local l
     where exists (select 1 from recepcion_oc o
                    where o.proveedor_id = l.proveedor_id_ingresos and o.store = 'zattia')
     order by l.nombre`)
  const { rows: cat } = await zat.query(`select distinct proveedor from productos where proveedor is not null order by 1`)
  const opciones = cat.map((r) => r.proveedor)
  console.log(`${locales.length} locales con órdenes de Zattia · ${opciones.length} nombres en el catálogo de GN`)

  const yaTienen = locales.filter((l) => l.proveedor_gn)
  const pendientes = locales.filter((l) => !l.proveedor_gn)
  if (yaTienen.length) console.log(`  ${yaTienen.length} ya estaban enganchados y ⛔ no se tocan.`)

  // ⚠️ `local` y `gn` van en campos DISTINTOS a propósito: con un spread, el nombre del catálogo
  // pisa el del padrón y la lista queda mostrando «X ← X» en las 24 filas, que es justo lo que hay
  // que poder leer para aceptar o frenar.
  const plan = []
  const sin = []
  for (const l of pendientes) {
    const s = sugerirProveedorGn(l.nombre, opciones)
    if (s) plan.push({ id: l.id, local: l.nombre, gn: s.nombre, seguridad: s.seguridad })
    else sin.push(l.nombre)
  }

  // El choque: dos locales distintos que caen en el mismo nombre de GN.
  const cuenta = new Map()
  for (const p of plan) cuenta.set(p.gn, (cuenta.get(p.gn) || 0) + 1)
  const chocan = plan.filter((p) => cuenta.get(p.gn) > 1)
  const buenos = plan.filter((p) => cuenta.get(p.gn) === 1)

  console.log()
  for (const p of buenos) {
    console.log(`  ${p.seguridad === 'exacta' ? '=' : '~'} ${p.local.padEnd(26)} → ${p.gn}`)
  }

  if (chocan.length) {
    console.log(`\n⚠️  ${chocan.length} se saltean por CHOQUE (dos locales al mismo nombre de GN):`)
    for (const p of chocan) console.log(`     ${p.local} → ${p.gn}`)
  }
  if (sin.length) console.log(`\nSin sugerencia (${sin.length}): ${sin.join(' · ')}`)

  console.log(`\n${buenos.length} para enganchar (${buenos.filter((p) => p.seguridad === 'exacta').length} exactas · ${buenos.filter((p) => p.seguridad === 'probable').length} probables)`)

  if (DRY) {
    console.log('\n(--dry: no se escribió nada)')
  } else {
    for (const p of buenos) {
      // ⚠️ El `and proveedor_gn is null` ⛔ no es adorno: si alguien lo tildó a mano entre el
      // arranque de este script y esta línea, gana la mano.
      await bdi.query(
        `update proveedor_local set proveedor_gn = $1, actualizado_en = now() where id = $2 and proveedor_gn is null`,
        [p.gn, p.id],
      )
    }
    const { rows: control } = await bdi.query(`select count(proveedor_gn)::int n from proveedor_local`)
    console.log(`\n✓ Enganchados. El padrón tiene ahora ${control[0].n} con proveedor de Gestión Nube.`)
  }
} catch (e) {
  console.log(`✗ ${e.message}`)
  process.exitCode = 1
} finally {
  await bdi.end().catch(() => {})
  await zat.end().catch(() => {})
}
