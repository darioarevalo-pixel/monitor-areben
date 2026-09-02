// Siembra el padrón del PRM con los proveedores que YA aparecen en las órdenes de compra.
//
// Uso: node scripts/sembrar-prm.mjs [--dry]
//
// # Por qué esto es parte del módulo y no un extra
//
// 🔴 El PRM se alimenta **100% a mano**. Un módulo que nace vacío no lo abre nadie y muere en una
// semana — y peor: la primera vez que alguien entra, la pantalla no le contesta nada, así que no
// vuelve. Estos 30 proveedores llegan con `proveedor_id_ingresos` puesto, o sea que **su ficha
// muestra el cumplimiento de entrega desde el día uno**, sin que nadie haya cargado nada.
//
// ⚠️ **Quedan con `zona = null` a propósito.** La mayoría no son de Flores (`CHINA`, `RHOVE`,
// `ASKDENIM`): son proveedores a los que se les compra por otro camino. La recorrida filtra por
// zona, así que un `null` **no entra a un viaje por accidente**; clasificarlos es una mano de Bruno.
//
// 🔑 **Idempotente.** Vuelve a correrse sin duplicar: se saltean los `proveedor_id` que ya tienen
// local. El oráculo es que la segunda corrida diga `0 nuevos`.
//
// 🆕 **Desde el 2-sep-2026 esto ⛔ ya NO es la única puerta**: `api/_oc-webhook.js` le abre la ficha
// a cada proveedor nuevo en cuanto llega su primera OC (`abrirFichaDeProveedor`), con la MISMA fila
// —`lib/prm/sembrado.core.js`—. Este script quedó para el backfill y para reparar: el padrón se
// había quedado en la foto del 30-ago y en dos días ya le faltaban cuatro proveedores.
import { readFileSync } from 'fs'
import pg from 'pg'
import { filaDeLocalSembrado, nuevoIdDeLocal } from '../lib/prm/sembrado.core.js'

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

function parse(raw) {
  const afterProto = raw.slice(raw.indexOf('://') + 3)
  const at = afterProto.lastIndexOf('@')
  const userpass = afterProto.slice(0, at)
  const hostpart = afterProto.slice(at + 1)
  const ci = userpass.indexOf(':')
  const slash = hostpart.indexOf('/')
  const [host, port] = hostpart.slice(0, slash).split(':')
  return {
    user: userpass.slice(0, ci),
    password: userpass.slice(ci + 1),
    host,
    port: Number(port) || 5432,
    database: hostpart.slice(slash + 1).split('?')[0],
  }
}

const url = env.DATABASE_URL_BDI
if (!url) {
  console.error('Falta DATABASE_URL_BDI en .env')
  process.exit(1)
}

const client = new pg.Client({ ...parse(url), ssl: { rejectUnauthorized: false } })

try {
  await client.connect()

  const { rows: proveedores } = await client.query(
    `select proveedor_id,
            max(proveedor_nombre) as nombre,
            count(*)::int         as ocs
       from recepcion_oc
      where proveedor_id is not null
      group by proveedor_id
      order by max(proveedor_nombre)`,
  )
  const { rows: yaEstan } = await client.query(
    `select proveedor_id_ingresos from proveedor_local where proveedor_id_ingresos is not null`,
  )
  const conocidos = new Set(yaEstan.map((r) => r.proveedor_id_ingresos))
  const nuevos = proveedores.filter((p) => !conocidos.has(p.proveedor_id))

  console.log(`\n${proveedores.length} proveedores en las órdenes de compra · ${conocidos.size} ya tienen local · ${nuevos.length} nuevos`)
  for (const p of nuevos) console.log(`  + ${p.nombre || `#${p.proveedor_id}`} (${p.ocs} OC)`)

  if (DRY) {
    console.log('\n(--dry: no se escribió nada)')
  } else if (nuevos.length) {
    for (const p of nuevos) {
      // 🔑 La fila la arma el núcleo, que es el MISMO que usa `api/_oc-webhook.js` cuando aparece un
      // proveedor nuevo. Escribirla acá a mano serían dos reglas sobre la misma ficha.
      const fila = filaDeLocalSembrado({
        id: nuevoIdDeLocal({ ahora: Date.now(), azar: Math.random().toString(36).slice(2, 8) }),
        proveedorId: p.proveedor_id,
        nombre: p.nombre,
        origen: `Sembrado desde las órdenes de compra (${p.ocs} OC)`,
      })
      await client.query(
        `insert into proveedor_local (id, nombre, estado, proveedor_id_ingresos, creado_por, nota)
         values ($1, $2, $3, $4, $5, $6)`,
        [fila.id, fila.nombre, fila.estado, fila.proveedor_id_ingresos, fila.creado_por, fila.nota],
      )
    }
    console.log(`\n✓ ${nuevos.length} locales sembrados.`)
  }

  const { rows: control } = await client.query(
    `select count(*)::int as locales,
            count(proveedor_id_ingresos)::int as enganchados
       from proveedor_local`,
  )
  // El oráculo: TODOS los sembrados quedan enganchados. Un local sin enganche entre los sembrados
  // sería una ficha muda, que es justo lo que este script viene a evitar.
  console.log(`Padrón: ${control[0].locales} locales · ${control[0].enganchados} enganchados a Ingresos`)
  if (!DRY && control[0].enganchados < proveedores.length) {
    console.log('⚠ Quedaron proveedores de OC sin local. Mirá la lista de arriba.')
    process.exitCode = 1
  }
} catch (e) {
  console.log(`✗ ${e.message}`)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}
