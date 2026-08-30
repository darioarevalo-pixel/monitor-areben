// Aplica sql/migrate-organizacion.sql a la base de BDI.
//
// ⚠️ **A UNA sola base, a diferencia de los demás `apply-*`.** No es un olvido: quién responde de
// qué no cambia entre BDI y Zattia —es la misma persona en las dos—, así que vive en la maestra de
// BDI y en ninguna otra. Mismo criterio que `apply-manuales.mjs` y la Agenda.
//
// Uso: node scripts/apply-organizacion.mjs
// Idempotente (create table if not exists): seguro re-correr.
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

const sql = readFileSync('sql/migrate-organizacion.sql', 'utf8')

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

const cfg = parse(url)
const client = new pg.Client({ ...cfg, ssl: { rejectUnauthorized: false } })
try {
  await client.connect()
  await client.query('BEGIN')
  await client.query(sql)
  await client.query('COMMIT')
  const nn = await client.query('select count(*)::int as n from organizacion_nodos')
  const nr = await client.query('select count(*)::int as n from organizacion_resp')
  // El conteo de los sin dueño va en el mensaje del propio script: es el número que justifica la
  // sección, y un cero acá se lee como «no hay grises», que casi nunca es cierto.
  const sd = await client.query('select count(*)::int as n from organizacion_resp where persona is null and activo')
  console.log(`✓ BDI (${cfg.host}): organizacion_nodos ${nn.rows[0].n} · organizacion_resp ${nr.rows[0].n} (${sd.rows[0].n} sin dueño)`)
} catch (e) {
  await client.query('ROLLBACK').catch(() => {})
  console.log(`✗ BDI: ${e.message}`)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}
