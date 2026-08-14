// Aplica sql/migrate-clientes-servidor.sql (escalón 2 de la Fase S) y verifica el resultado.
//
// ⚠️ **Arranca en SIMULACIÓN**, como `apply-rls.mjs` y `apply-columnas-pii.mjs`.
//
//   node scripts/apply-clientes-servidor.mjs bdi            # simulación (empezar por acá)
//   node scripts/apply-clientes-servidor.mjs bdi --aplicar  # de verdad
//
// ⛔ **Sólo después de deployar y ver el padrón en producción.** El navegador ya no lee esta tabla
// —lo hace `api/_crm.js` con la clave de servicio— pero si el deploy viejo se sigue sirviendo, esto
// deja el CRM en blanco. PostgREST no omite la tabla sin permiso: corta con "permission denied".
//
// 🔑 La verificación pregunta por el permiso EFECTIVO (`has_table_privilege` /
// `has_column_privilege`), no si el revoke salió en verde. Es la misma lección del escalón 1: un
// comando de permisos puede terminar sin error y no haber cerrado nada.
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
  console.error('Uso: node scripts/apply-clientes-servidor.mjs bdi|zattia [--aplicar]')
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

// 🔴 **La tabla y las columnas, las dos.** Preguntar sólo por la tabla dejaría pasar el estado
// intermedio que dejó el escalón 1 —sin permiso de tabla pero con `select (id, name, …)` por
// columna—, que desde `has_table_privilege` se ve idéntico a estar cerrado y no lo está.
const FOTO = `
  select
    has_table_privilege($1, 'public.clientes', 'SELECT')                             as tabla,
    (select count(*) from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'clientes'
        and has_column_privilege($1, 'public.clientes'::regclass, c.column_name, 'SELECT'))::int as columnas`

const cfg = parse(url)
const client = new pg.Client({ ...cfg, ssl: { rejectUnauthorized: false } })
const MARCA = marca.toUpperCase()
const ROLES = ['anon', 'authenticated', 'service_role']

async function foto() {
  const out = {}
  for (const rol of ROLES) {
    const { rows } = await client.query(FOTO, [rol])
    out[rol] = rows[0]
  }
  return out
}

const linea = (rol, f) => `  ${rol.padEnd(14)} tabla: ${f.tabla ? 'SÍ' : 'no'}   columnas legibles: ${f.columnas}`

try {
  await client.connect()

  const existe = await client.query(`select to_regclass('public.clientes') is not null as hay`)
  if (!existe.rows[0].hay) {
    console.log(`\n=== ${MARCA} (${cfg.host}) ===\n  clientes no existe en esta base: no hay nada que cerrar.\n`)
    process.exit(0)
  }

  const antes = await foto()
  console.log(`\n=== ${MARCA} (${cfg.host}) — ANTES ===`)
  for (const rol of ROLES) console.log(linea(rol, antes[rol]))

  if (!aplicar) {
    console.log(`\n(simulación — no se tocó nada). Para aplicar de verdad:`)
    console.log(`    node scripts/apply-clientes-servidor.mjs ${marca} --aplicar\n`)
    process.exit(0)
  }

  await client.query('BEGIN')
  await client.query(readFileSync('sql/migrate-clientes-servidor.sql', 'utf8'))
  await client.query('COMMIT')

  const despues = await foto()
  console.log(`\n=== ${MARCA} — DESPUÉS ===`)
  for (const rol of ROLES) console.log(linea(rol, despues[rol]))

  // El padrón tiene que seguir estando: acá se lee como superusuario, o sea el mismo camino que
  // tiene `service_role`. Un cero es el CRM vacío y el sync roto, no un permiso de más.
  const n = await client.query('select count(*)::int as n from clientes')
  console.log(`  filas en clientes            : ${n.rows[0].n}`)

  const cerrado = ['anon', 'authenticated'].every((r) => !despues[r].tabla && despues[r].columnas === 0)
  const servicio = despues.service_role.tabla && n.rows[0].n > 0
  console.log(cerrado && servicio ? `\n✓ ${MARCA}: clientes sale del navegador.` : `\n✗ ${MARCA}: mirá el detalle de arriba.`)
  console.log(`\nFalta lo que no se puede ver desde acá: con la anon key, que`)
  console.log(`\`clientes?select=id&limit=1\` dé 401 y \`ventas?select=id&limit=1\` siga en 200, y`)
  console.log(`abrir el Monitor de BDI en Clientes — el padrón, el modal y la pestaña Leads.\n`)
  if (!cerrado || !servicio) process.exitCode = 1
} catch (e) {
  await client.query('ROLLBACK').catch(() => {})
  console.log(`✗ ${MARCA}: ${e.message}`)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}
