// Aplica sql/migrate-insumo-pedido.sql a la base de BDI.
//
// ⚠️ **A UNA sola base, a diferencia de los demás `apply-*`.** No es un olvido: una caja de bolsas
// no es de BDI ni de Zattia, así que el catálogo vive en la maestra de BDI y en ninguna otra. El
// motivo está en el encabezado del `.sql`. Mismo criterio que `apply-memo.mjs`.
//
// Uso: node scripts/apply-insumo-pedido.mjs
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

const sql = readFileSync('sql/migrate-insumo-pedido.sql', 'utf8')

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
  const p = await client.query('select count(*)::int as n from insumo_pedido')
  const a = await client.query('select count(*)::int as n from insumo_pedido where cancelado_at is null')
  // 🔑 El oráculo no es que la tabla exista: es que los candados RECHACEN de verdad. Una
  // constraint escrita en el .sql y no aplicada deja pasar exactamente lo que dice frenar.
  const rechaza = async (sql, que) => {
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('ROLLBACK')
      console.log(`✗ ${que}: la base lo ACEPTÓ y no debería`)
      process.exitCode = 1
    } catch {
      await client.query('ROLLBACK').catch(() => {})
      console.log(`✓ ${que}: rechazado`)
    }
  }
  const insumo = await client.query('select id from insumo limit 1')
  if (insumo.rows[0]) {
    const iid = insumo.rows[0].id
    await rechaza(
      `insert into insumo_pedido (id, insumo_id, cantidad, pedido_at) values ('pd_test_neg', '${iid}', -1, '2026-08-28')`,
      'cantidad negativa',
    )
    await rechaza(
      `insert into insumo_pedido (id, insumo_id, pedido_at, promesa_at) values ('pd_test_prom', '${iid}', '2026-08-28', '2026-08-01')`,
      'promesa anterior al pedido',
    )
  } else {
    console.log('⚠ no hay ningún insumo cargado: los candados no se pudieron ejercer')
  }
  console.log(`✓ BDI (${cfg.host}): insumo_pedido ${p.rows[0].n} filas (${a.rows[0].n} sin cancelar)`)
} catch (e) {
  await client.query('ROLLBACK').catch(() => {})
  console.log(`✗ BDI: ${e.message}`)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}
