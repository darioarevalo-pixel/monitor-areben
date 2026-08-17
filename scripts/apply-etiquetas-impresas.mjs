// Aplica sql/migrate-etiquetas-impresas.sql a las bases de BDI y ZATTIA del monitor.
// Lee DATABASE_URL_BDI / DATABASE_URL_ZATTIA del .env (una o ambas).
// Uso: node scripts/apply-etiquetas-impresas.mjs
//
// Va a las DOS bases por lo mismo que apply-liquidacion-bitacora.mjs: la tabla lleva `store` y cada
// marca tiene la suya.
//
// Idempotente (`create table if not exists` + `create index if not exists`): seguro re-correr.
// Crea una tabla NUEVA, no toca ninguna existente ni migra datos. ⚠️ Prod y las previews comparten
// base, así que esto se corre sabiendo que lo ve producción en el momento — es aditivo por eso.
//
// ⚠️ NO hay backfill, y es a propósito: no existe ningún registro de qué se etiquetó antes de hoy.
// Inventarlo (por ejemplo, dar por etiquetado todo lo que ya tiene precio puesto) haría arrancar la
// cola vacía justo cuando hay 260 prendas del WINTER SALE para rehacer. Arranca en cero y la primera
// lectura muestra todo lo que cambió de precio: eso es lo correcto, no un defecto.
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

const sql = readFileSync('sql/migrate-etiquetas-impresas.sql', 'utf8')
const TABLAS = ['etiquetas_impresas']

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

for (const [nombre, url] of targets) {
  const cfg = parse(url)
  const client = new pg.Client({ ...cfg, ssl: { rejectUnauthorized: false } })
  try {
    await client.connect()
    await client.query('BEGIN')
    await client.query(sql)
    await client.query('COMMIT')
    console.log(`✓ ${nombre} (${cfg.host}):`)
    for (const t of TABLAS) {
      const r = await client.query(`select count(*)::int as n from ${t}`)
      console.log(`  ${t.padEnd(22)} ${String(r.rows[0].n).padStart(5)} filas`)
    }
    // RLS prendido sin políticas: es lo que deja la tabla cerrada para la anon key. Se verifica acá
    // porque es la única línea de la migración que no se nota si falta.
    const rls = await client.query(
      `select relrowsecurity from pg_class where relname = 'etiquetas_impresas'`,
    )
    console.log(`  RLS                    ${rls.rows[0]?.relrowsecurity ? 'prendido ✓' : '🔴 APAGADO'}`)
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    console.log(`✗ ${nombre}: ${e.message}`)
    process.exitCode = 1
  } finally {
    await client.end().catch(() => {})
  }
}
console.log('\nListo.')
