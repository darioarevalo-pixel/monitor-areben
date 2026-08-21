// Aplica sql/migrate-disenos-votacion.sql a las bases de BDI y ZATTIA del monitor.
// Lee las connection strings de .env: DATABASE_URL_BDI y DATABASE_URL_ZATTIA (una o ambas).
// Uso: node scripts/apply-disenos-votacion.mjs
//
// La migración es idempotente (`create table if not exists` + `create index if not exists`), así
// que re-correrla no hace nada. Crea tablas NUEVAS: no toca `disenos` ni migra datos.
//
// Va a las DOS bases porque el tablero de diseños ya es dual-base: `cfgFor` en `api/_disenos.js`
// elige credenciales por marca, y la ronda es de la marca del tablero que la abrió.
//
// Detalle del pooler de Supabase que ya costó una vez: el host es `aws-1-<region>.pooler...`
// (NO `aws-0`), el usuario es `postgres.<ref>` y el puerto 5432. La "Direct connection"
// (`db.<ref>.supabase.co`) no resuelve desde acá porque es IPv6.
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

const sql = readFileSync('sql/migrate-disenos-votacion.sql', 'utf8')

// Parse robusto (la contraseña puede tener caracteres especiales sin encodear).
function parse(raw) {
  const afterProto = raw.slice(raw.indexOf('://') + 3)
  const at = afterProto.lastIndexOf('@')
  const userpass = afterProto.slice(0, at)
  const hostpart = afterProto.slice(at + 1)
  const ci = userpass.indexOf(':')
  const user = userpass.slice(0, ci)
  const password = userpass.slice(ci + 1)
  const slash = hostpart.indexOf('/')
  const hostport = hostpart.slice(0, slash)
  const dbname = hostpart.slice(slash + 1).split('?')[0]
  const [host, port] = hostport.split(':')
  return { user, password, host, port: Number(port) || 5432, database: dbname }
}

const targets = [
  ['BDI', env.DATABASE_URL_BDI],
  ['ZATTIA', env.DATABASE_URL_ZATTIA],
].filter(([, url]) => url)

if (!targets.length) {
  console.error('Falta DATABASE_URL_BDI y/o DATABASE_URL_ZATTIA en .env')
  process.exit(1)
}

for (const [nombre, url] of targets) {
  const cfg = parse(url)
  const client = new pg.Client({ ...cfg, ssl: { rejectUnauthorized: false } })
  try {
    await client.connect()
    await client.query('BEGIN')
    await client.query(sql)
    await client.query('COMMIT')
    // Verificación: las dos tablas existen, cuenta filas, y confirma que el índice único del token
    // está — es el que usa el portal público en CADA visita, y sin él el link es un scan.
    const r = await client.query('select count(*)::int as n from disenos_rondas')
    const v = await client.query('select count(*)::int as n from disenos_votos')
    const t = await client.query(
      "select count(*)::int as n from pg_indexes where tablename = 'disenos_rondas' and indexdef ilike '%unique%' and indexdef ilike '%(token)%'",
    )
    console.log(
      `${t.rows[0].n ? '✓' : '✗'} ${nombre} (${cfg.host}): ${r.rows[0].n} rondas, ${v.rows[0].n} votos, ` +
        `índice único del token ${t.rows[0].n ? 'presente' : 'AUSENTE'}`,
    )
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    console.log(`✗ ${nombre}: ${e.message}`)
  } finally {
    await client.end().catch(() => {})
  }
}
console.log('\nListo.')
