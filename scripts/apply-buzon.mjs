// Aplica sql/migrate-buzon.sql a la base de BDI del monitor.
// Uso: node scripts/apply-buzon.mjs
//
// ⚠️ APUNTA A UNA SOLA BASE — LA DE BDI — Y ESO ES DELIBERADO.
//
// Quien mira los mensajes es la misma persona que arma los paquetes de las dos marcas, igual que en
// Envíos: de qué marca es cada mensaje lo dice la columna `store`. Este script ni siquiera lee
// DATABASE_URL_ZATTIA, para que correrlo donde no va sea imposible por distracción.
//
// Idempotente (`create table/index if not exists` + el `do $$` del check). Re-correrlo no hace nada.
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

const sql = readFileSync('sql/migrate-buzon.sql', 'utf8')

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

  const filas = await client.query('select count(*)::int as n from buzon_mensajes')

  // 🔴 Los candados se EJERCEN, no se suponen. Un `check` o un índice único que no llegó a aplicarse
  // no se nota hasta que alguien escribe la fila que tenía que rechazar — y en este caso la fila que
  // se cuela es un mail duplicado en la bandeja, o un "resuelto" sin fecha que nadie puede auditar.
  // Se prueban en transacciones que se deshacen.
  const sonda = async (sqlTexto) => {
    await client.query('BEGIN')
    try {
      await client.query(sqlTexto)
      await client.query('ROLLBACK')
      return false // entró: el candado NO está
    } catch {
      await client.query('ROLLBACK')
      return true
    }
  }

  const checkOk = await sonda(
    `insert into buzon_mensajes (id, store, cuerpo, resuelto, resuelto_en) values ('__sonda__', 'bdi', 'sonda', true, null)`,
  )

  await client.query('BEGIN')
  let dedupOk = false
  try {
    await client.query(`insert into buzon_mensajes (id, store, cuerpo, mensaje_ext_id) values ('__sonda1__', 'bdi', 'sonda', 'ext-sonda')`)
    await client.query(`insert into buzon_mensajes (id, store, cuerpo, mensaje_ext_id) values ('__sonda2__', 'bdi', 'sonda', 'ext-sonda')`)
  } catch {
    dedupOk = true
  }
  await client.query('ROLLBACK')

  const rls = await client.query(
    `select relrowsecurity,
            has_table_privilege('anon', 'public.buzon_mensajes', 'SELECT') as anon_lee,
            has_table_privilege('anon', 'public.buzon_mensajes', 'INSERT') as anon_escribe
       from pg_class where relname = 'buzon_mensajes'`,
  )
  const r = rls.rows[0] || {}

  console.log(`✓ BDI (${cfg.host}): buzon_mensajes lista — ${filas.rows[0].n} filas`)
  console.log(`${checkOk ? '✓' : '✗'} check "resuelto sin fecha" ${checkOk ? 'rechaza' : 'DEJA PASAR'}`)
  console.log(`${dedupOk ? '✓' : '✗'} índice único de mensaje_ext_id ${dedupOk ? 'rechaza el duplicado' : 'DEJA PASAR EL DUPLICADO'}`)
  console.log(`${r.relrowsecurity ? '✓' : '✗'} RLS ${r.relrowsecurity ? 'prendido' : 'APAGADO'} · anon lee: ${r.anon_lee} · anon escribe: ${r.anon_escribe}`)
  if (!checkOk || !dedupOk || !r.relrowsecurity || r.anon_escribe) {
    console.log('\n⚠ Algo quedó abierto. Mirá las líneas con ✗ antes de usar la sección.')
    process.exitCode = 1
  }
} catch (e) {
  await client.query('ROLLBACK').catch(() => {})
  console.log(`✗ BDI: ${e.message}`)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}
