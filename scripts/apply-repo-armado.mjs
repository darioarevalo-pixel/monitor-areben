// Aplica sql/migrate-repo-armado.sql a la base de ZATTIA (el armado con el lector de Reposición).
// Uso: node scripts/apply-repo-armado.mjs
//
// Sólo ZATTIA: BDI sigue con la transferencia a mano en Gestión Nube.
// Idempotente (`create … if not exists`). Re-correrlo no hace nada.
//
// Detalle del pooler de Supabase que ya costó una vez: el host es `aws-1-<region>.pooler...`
// (NO `aws-0`), el usuario es `postgres.<ref>` y el puerto 5432.
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

if (!env.DATABASE_URL_ZATTIA) {
  console.error('Falta DATABASE_URL_ZATTIA en .env.')
  process.exit(1)
}

const client = new pg.Client({ ...parse(env.DATABASE_URL_ZATTIA), ssl: { rejectUnauthorized: false } })
try {
  await client.connect()
  await client.query('BEGIN')
  await client.query(readFileSync('sql/migrate-repo-armado.sql', 'utf8'))
  await client.query('COMMIT')
  const n = await client.query('select count(*)::int as n from repo_armado')
  // 🔴 El candado de «uno abierto por lista» se EJERCE, no se supone: sin él, dos compus armando
  // la misma lista terminan en dos transferencias.
  await client.query('BEGIN')
  let candado = false
  try {
    const fila = (id) => `insert into repo_armado (id, store, linea, sentido, fecha) values ('${id}', 'zattia', '__sonda__', 'llevar', current_date)`
    await client.query(fila('__sonda_1__'))
    await client.query(fila('__sonda_2__'))
  } catch {
    candado = true
  }
  await client.query('ROLLBACK')
  console.log(`ZATTIA: repo_armado lista (${n.rows[0].n} filas) · uno abierto por lista: ${candado ? 'OK' : '⛔ NO ESTÁ'}`)
  if (!candado) process.exitCode = 1
} catch (e) {
  await client.query('ROLLBACK').catch(() => {})
  console.error('ZATTIA:', e.message)
  process.exitCode = 1
} finally {
  await client.end()
}
