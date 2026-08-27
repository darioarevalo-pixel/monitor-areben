// Aplica un archivo .sql a las bases de BDI y ZATTIA del monitor.
//
//   node scripts/aplicar-sql.mjs sql/migrate-tn-atributos.sql tn_atributos
//
// El segundo argumento es opcional: si va, después de aplicar cuenta las filas de esa tabla,
// que es la forma más barata de ver que la migración hizo algo y no sólo «no falló».
//
// 🔑 Es la versión genérica de `scripts/apply-tn-descripciones.mjs`, que quedó clavado a su
// archivo. No se tocó aquél: ya corrió en las dos bases el 19-ago-2026 y re-escribirlo para
// generalizarlo sería cambiar algo que anda por algo que no aporta. Las migraciones nuevas
// entran por acá.
//
// Lee DATABASE_URL_BDI / DATABASE_URL_ZATTIA del .env (una o ambas).
import { readFileSync } from 'fs'
import pg from 'pg'

const [, , archivo, tabla] = process.argv
if (!archivo) {
  console.error('Uso: node scripts/aplicar-sql.mjs <archivo.sql> [tabla-para-contar]')
  process.exit(1)
}

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    }),
)

const sql = readFileSync(archivo, 'utf8')

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

const targets = [
  ['BDI', env.DATABASE_URL_BDI],
  ['ZATTIA', env.DATABASE_URL_ZATTIA],
].filter(([, url]) => url)

if (!targets.length) {
  console.error('Falta DATABASE_URL_BDI y/o DATABASE_URL_ZATTIA en .env')
  process.exit(1)
}

let fallo = false
for (const [nombre, url] of targets) {
  const cfg = parse(url)
  const client = new pg.Client({ ...cfg, ssl: { rejectUnauthorized: false } })
  try {
    await client.connect()
    await client.query('BEGIN')
    await client.query(sql)
    await client.query('COMMIT')
    let extra = ''
    if (tabla) {
      const r = await client.query(`select count(*)::int as n from ${tabla}`)
      extra = ` — ${r.rows[0].n} filas en ${tabla}`
    }
    console.log(`✓ ${nombre} (${cfg.host}): ${archivo} aplicado${extra}`)
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    console.log(`✗ ${nombre}: ${e.message}`)
    fallo = true
  } finally {
    await client.end().catch(() => {})
  }
}

// ⛔ Sale 1 si alguna base falló: una migración que "no anduvo" y sale 0 es una migración que
// alguien va a dar por aplicada.
process.exit(fallo ? 1 : 0)
