// Aplica sql/migrate-canjes.sql a la base de BDI del monitor.
// Uso: node scripts/apply-canjes.mjs
//
// ⚠️⚠️ APUNTA A UNA SOLA BASE — LA DE BDI — Y ESO ES DELIBERADO. ⚠️⚠️
//
// A diferencia de scripts/apply-devoluciones.mjs, este script NO itera BDI + ZATTIA. El módulo de
// Canjes vive entero en la base de BDI porque `canje_personas` es un padrón ÚNICO compartido por
// las tres marcas: la misma creadora trabaja para BDI y para Zattia, y "¿hace cuánto no hacemos
// una acción con ella?" tiene que tener UNA respuesta. De qué marca es cada canje lo dice la
// columna `store`. Ver el encabezado de sql/migrate-canjes.sql para el razonamiento completo.
//
// Si alguna vez `select count(*) from canje_personas` funciona en el Supabase de Zattia, alguien
// corrió la migración donde no iba. Este script está escrito para que eso sea imposible por
// distracción: ni siquiera lee DATABASE_URL_ZATTIA.
//
// La migración es idempotente (`create table if not exists` + `create index if not exists`), así
// que re-correrla no hace nada. Crea tablas NUEVAS: no toca ninguna existente ni migra datos.
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

const sql = readFileSync('sql/migrate-canjes.sql', 'utf8')

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

const url = env.DATABASE_URL_BDI
if (!url) {
  console.error('Falta DATABASE_URL_BDI en .env')
  process.exit(1)
}

const TABLAS = [
  'canje_personas', 'canjes', 'canje_items', 'canje_entregables', 'canje_evidencias', 'canje_config',
  'canje_vitrinas', 'canje_vitrina_items',
]

const cfg = parse(url)
const client = new pg.Client({ ...cfg, ssl: { rejectUnauthorized: false } })
try {
  await client.connect()
  await client.query('BEGIN')
  await client.query(sql)
  await client.query('COMMIT')

  // Verificación: las ocho tablas existen, con cuántas filas y cuántos índices cada una.
  console.log(`✓ BDI (${cfg.host}): migración aplicada\n`)
  for (const t of TABLAS) {
    const r = await client.query(`select count(*)::int as n from ${t}`)
    const i = await client.query('select count(*)::int as n from pg_indexes where tablename = $1', [t])
    console.log(`  ${t.padEnd(18)} ${String(r.rows[0].n).padStart(5)} filas · ${i.rows[0].n} índices`)
  }
  // La config se siembra con una fila por marca: si no están las tres, el panel abre en blanco.
  const c = await client.query('select store from canje_config order by store')
  console.log(`\n  canje_config sembrada para: ${c.rows.map((x) => x.store).join(', ')}`)
} catch (e) {
  await client.query('ROLLBACK').catch(() => {})
  console.log(`✗ BDI: ${e.message}`)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}
console.log('\nListo. (Recordá: esto NO se corre en Zattia.)')
