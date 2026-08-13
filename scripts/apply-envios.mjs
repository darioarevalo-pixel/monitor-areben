// Aplica sql/migrate-envios.sql a la base de BDI del monitor.
// Uso: node scripts/apply-envios.mjs
//
// ⚠️⚠️ APUNTA A UNA SOLA BASE — LA DE BDI — Y ESO ES DELIBERADO. ⚠️⚠️
//
// El reparto en moto es UNO: el cadete sale con paquetes de BDI y de Zattia en la misma mochila, el
// turno es uno y la rendición es una. De qué marca es cada envío lo dice la columna `store`. Partir
// la tabla por marca partiría un turno en dos mitades que nadie sabría volver a sumar.
//
// Este script está escrito para que correrlo donde no va sea imposible por distracción: ni siquiera
// lee DATABASE_URL_ZATTIA. Si alguna vez `select count(*) from envios_reparto` funciona en el
// Supabase de Zattia, alguien lo corrió mal.
//
// La migración es idempotente (`create table if not exists` + `create index if not exists`), así que
// re-correrla no hace nada. Crea tablas NUEVAS: no toca ninguna existente ni migra datos.
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

const sql = readFileSync('sql/migrate-envios.sql', 'utf8')

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
  const r = await client.query('select count(*)::int as n from envios_reparto')
  const t = await client.query('select count(*)::int as n from envios_turno')
  // El RLS es la mitad del punto de esta migración: si quedara apagado, sería la única tabla
  // abierta de la base justo después de que `migrate-rls.sql` la dejara en cero. Se verifica, no
  // se supone.
  const rls = await client.query(
    `select relname, relrowsecurity from pg_class
     where relname in ('envios_reparto', 'envios_turno') order by relname`,
  )
  const estado = rls.rows.map((x) => `${x.relname}=${x.relrowsecurity ? 'RLS ✓' : 'RLS ✗ ABIERTA'}`).join(' · ')
  console.log(`✓ BDI (${cfg.host}): envios_reparto ${r.rows[0].n} · envios_turno ${t.rows[0].n} filas`)
  console.log(`  ${estado}`)
  if (rls.rows.some((x) => !x.relrowsecurity)) process.exitCode = 1
} catch (e) {
  await client.query('ROLLBACK').catch(() => {})
  console.log(`✗ BDI: ${e.message}`)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}
