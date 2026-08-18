// Aplica sql/migrate-ventas-cobro.sql a las bases de BDI y ZATTIA del monitor.
// Lee DATABASE_URL_BDI / DATABASE_URL_ZATTIA del .env (una o ambas).
// Uso: node scripts/apply-ventas-cobro.mjs
//
// Le agrega al espejo de ventas las cuatro columnas que hacen falta para calcular la CONTRIBUCION
// con la misma cascada que el dashboard: account_display (la cuenta de cobro, que es lo unico que
// decide si va IVA), discount, shipping_cost y total_cost (el CMV, que en Zattia no existia).
//
// Va a las DOS bases: Norte contesta por las dos marcas y Stunned vive adentro de la de Zattia.
//
// Idempotente (`add column if not exists`) y ningun script borra estas columnas, asi que re-correrlo
// no resucita nada. Imprime cuantas filas de los ultimos 30 dias ya tienen cuenta de cobro: recien
// arriba de 0 la contribucion se puede calcular, y el sync las llena solo (relee 90 dias).
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

const sql = readFileSync('sql/migrate-ventas-cobro.sql', 'utf8')
const COLUMNAS = ['account_display', 'discount', 'shipping_cost', 'total_cost']

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

    // El oraculo NO es que el ALTER no haya tirado: es que las cuatro columnas esten en el catalogo
    // y cuantas filas recientes tienen ya la cuenta de cobro cargada.
    const r = await client.query(
      `select column_name from information_schema.columns where table_name='ventas' and column_name = any($1)`,
      [COLUMNAS],
    )
    const estan = new Set(r.rows.map((x) => x.column_name))
    const faltan = COLUMNAS.filter((c) => !estan.has(c))
    const con = await client.query(
      `select count(*)::int total, count(account_display)::int con_cuenta
         from ventas where date_sale > (select max(date_sale) from ventas) - 30`,
    )
    const { total, con_cuenta } = con.rows[0]
    console.log(`${faltan.length ? '✗' : '✓'} ${nombre} (${cfg.host}):`)
    console.log(`  columnas          ${COLUMNAS.filter((c) => estan.has(c)).join(', ') || '(ninguna)'}`)
    if (faltan.length) console.log(`  🔴 FALTAN         ${faltan.join(', ')}`)
    console.log(`  ultimos 30 dias   ${con_cuenta} de ${total} ventas con cuenta de cobro`)
    if (!con_cuenta) console.log(`  ⚠️  todavia ninguna: la contribucion no se puede calcular hasta que corra el sync`)
    if (faltan.length) process.exitCode = 1
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    console.log(`✗ ${nombre}: ${e.message}`)
    process.exitCode = 1
  } finally {
    await client.end().catch(() => {})
  }
}
console.log('\nListo.')
