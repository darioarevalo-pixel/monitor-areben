// Aplica sql/migrate-productos-servidor.sql (escalón 3 de la Fase S, pieza B) y verifica.
//
// ⚠️ **Arranca en SIMULACIÓN**, como `apply-rls.mjs`, `apply-columnas-pii.mjs`,
// `apply-clientes-servidor.mjs` y `apply-venta-detalles-servidor.mjs`.
//
//   node scripts/apply-productos-servidor.mjs bdi            # simulación (empezar por acá)
//   node scripts/apply-productos-servidor.mjs bdi --aplicar  # de verdad
//   node scripts/apply-productos-servidor.mjs zattia --aplicar
//
// ⛔ **Sólo después de deployar y ver el Monitor abrir en producción.**
//
// 🔴 **Esta pieza es más peligrosa que la A.** Aquella cerraba dos columnas que la carga de datos
// nunca había pedido; `unit_cost` estaba en el select de `productos` que corre para las 14 personas
// en cada carga. Con el deploy viejo sirviéndose, esto no rompe una pantalla: **no abre el
// Monitor** — PostgREST corta con "permission denied", se lleva la consulta entera y `traerDatos`
// lanza. El rollback está al final del SQL y es un grant de una línea.
//
// Los tres lectores del navegador ya se mudaron (el ETL y el picker piden por
// `api/datos?recurso=costos`, gateado por permiso; `enriquecerConGN` dejó de pedirlo), y los dos
// que lo ESTAMPABAN sin mostrarlo lo resuelven ahora del lado del servidor: `api/_canjes.js` y
// `api/_fallas.js`.
//
// 🔑 La verificación pregunta por el permiso EFECTIVO (`has_column_privilege`), no si el revoke
// salió en verde. Es la lección del escalón 1: un `revoke` por columna termina sin error y no
// cierra nada mientras el rol tenga el permiso de la tabla.
import { readFileSync } from 'fs'
import pg from 'pg'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    }),
)

const marca = (process.argv[2] || '').toLowerCase()
const aplicar = process.argv.includes('--aplicar')

if (!['bdi', 'zattia'].includes(marca)) {
  console.error('Uso: node scripts/apply-productos-servidor.mjs bdi|zattia [--aplicar]')
  process.exit(1)
}

const url = marca === 'bdi' ? env.DATABASE_URL_BDI : env.DATABASE_URL_ZATTIA
if (!url) {
  console.error(`Falta DATABASE_URL_${marca.toUpperCase()} en .env`)
  process.exit(1)
}

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

// Las dos que se cierran, y las que la app necesita que sigan abiertas. La segunda lista es la que
// convierte esto en una verificación de verdad: preguntar sólo por las prohibidas diría "cerrado"
// también si el revoke se hubiera llevado la tabla entera, que es la pantalla en blanco.
//
// `QUE_USA_LA_APP` es, palabra por palabra, el select de `productos` de `lib/datos.ts` —con
// `proveedor`, que sólo existe en Zattia y por eso se filtra contra el esquema real más abajo.
const PLATA = ['unit_cost', 'wholesaler_price']
const QUE_USA_LA_APP = ['id', 'name', 'category', 'sku', 'proveedor', 'retailer_price', 'created_at', 'active']

const COLUMNA = `select has_column_privilege($1, 'public.productos'::regclass, $2, 'SELECT') as si`
const TABLA = `select has_table_privilege($1, 'public.productos', 'SELECT') as si`

const cfg = parse(url)
const client = new pg.Client({ ...cfg, ssl: { rejectUnauthorized: false } })
const MARCA = marca.toUpperCase()
const ROLES = ['anon', 'authenticated', 'service_role']

// Sólo las columnas que existen en ESTA base. Los dos esquemas no son iguales y preguntar por una
// columna inexistente no devuelve `false`: revienta la consulta.
async function columnasReales() {
  const { rows } = await client.query(
    `select column_name::text as c from information_schema.columns
      where table_schema = 'public' and table_name = 'productos'`,
  )
  return new Set(rows.map((r) => r.c))
}

async function foto(hay) {
  const out = {}
  for (const rol of ROLES) {
    const tabla = (await client.query(TABLA, [rol])).rows[0].si
    const lee = []
    for (const c of [...PLATA, ...QUE_USA_LA_APP]) {
      if (!hay.has(c)) continue
      if ((await client.query(COLUMNA, [rol, c])).rows[0].si) lee.push(c)
    }
    out[rol] = { tabla, plata: lee.filter((c) => PLATA.includes(c)), app: lee.filter((c) => QUE_USA_LA_APP.includes(c)) }
  }
  return out
}

const linea = (rol, f) =>
  `  ${rol.padEnd(14)} tabla: ${(f.tabla ? 'SÍ' : 'no').padEnd(3)}  plata: ${(f.plata.length ? f.plata.join(', ') : '—').padEnd(18)}  columnas de la app: ${f.app.length ? f.app.join(', ') : '—'}`

try {
  await client.connect()

  const hay = await columnasReales()
  if (!hay.size) {
    console.log(`\n=== ${MARCA} (${cfg.host}) ===\n  productos no existe en esta base.\n`)
    process.exit(0)
  }
  const esperadas = QUE_USA_LA_APP.filter((c) => hay.has(c))

  const antes = await foto(hay)
  console.log(`\n=== ${MARCA} (${cfg.host}) — ANTES ===`)
  for (const rol of ROLES) console.log(linea(rol, antes[rol]))

  if (!aplicar) {
    console.log(`\n(simulación — no se tocó nada). Para aplicar de verdad:`)
    console.log(`    node scripts/apply-productos-servidor.mjs ${marca} --aplicar\n`)
    process.exit(0)
  }

  await client.query('BEGIN')
  await client.query(readFileSync('sql/migrate-productos-servidor.sql', 'utf8'))
  await client.query('COMMIT')

  const despues = await foto(hay)
  console.log(`\n=== ${MARCA} — DESPUÉS ===`)
  for (const rol of ROLES) console.log(linea(rol, despues[rol]))

  const n = await client.query('select count(*)::int as n from productos')
  console.log(`  filas en productos      : ${n.rows[0].n}`)

  // Las tres condiciones. La del medio es la que evita festejar una pantalla en blanco.
  const cerrado = ['anon', 'authenticated'].every((r) => !despues[r].plata.length)
  const sigueAbierto = ['anon', 'authenticated'].every((r) => esperadas.every((c) => despues[r].app.includes(c)))
  const servicio = despues.service_role.plata.length === PLATA.filter((c) => hay.has(c)).length && n.rows[0].n > 0

  console.log(`\n  la plata sale del navegador  : ${cerrado ? '✓' : '✗'}`)
  console.log(`  lo que la app usa sigue vivo : ${sigueAbierto ? '✓' : '✗'}`)
  console.log(`  service_role lee todo        : ${servicio ? '✓' : '✗'}`)
  const ok = cerrado && sigueAbierto && servicio
  console.log(ok ? `\n✓ ${MARCA}: el costo sale del navegador.` : `\n✗ ${MARCA}: mirá el detalle de arriba.`)
  console.log(`\nFalta lo que no se puede ver desde acá: con la anon key, que`)
  console.log(`\`productos?select=unit_cost&limit=1\` y \`select=*\` den 401 y`)
  console.log(`\`select=id,name&limit=1\` siga en 200; y en el Monitor, que ABRA (es lo que el ETL`)
  console.log(`puede romper), Márgenes con cifras, un ítem cargado a un canje con su costo, y una`)
  console.log(`falla nueva con su valuación.\n`)
  if (!ok) process.exitCode = 1
} catch (e) {
  await client.query('ROLLBACK').catch(() => {})
  console.log(`✗ ${MARCA}: ${e.message}`)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}
