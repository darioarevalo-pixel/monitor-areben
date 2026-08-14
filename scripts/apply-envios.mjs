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

// Los dos archivos y en este orden: el segundo afloja columnas que crea el primero. Van en la misma
// transacción, así que o entran los dos o no entra ninguno.
const sql = ['sql/migrate-envios.sql', 'sql/migrate-envios-pendientes.sql']
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n;\n')

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
  // Igual que el RLS: el candado nuevo se **ejerce**, no se supone. Una fila con fecha y sin turno
  // es el estado que la planilla vieja tenía en el 53,8% de sus filas, y un `check` que no llegó a
  // aplicarse no se nota hasta que alguien la escribe. Se prueba en una transacción que se deshace.
  let checkOk = false
  await client.query('BEGIN')
  try {
    await client.query(
      `insert into envios_reparto (id, store, fecha, turno, direccion) values ('__sonda__', 'bdi', '2026-01-01', null, 'sonda')`,
    )
  } catch {
    checkOk = true
  }
  await client.query('ROLLBACK')

  const estado = rls.rows.map((x) => `${x.relname}=${x.relrowsecurity ? 'RLS ✓' : 'RLS ✗ ABIERTA'}`).join(' · ')
  console.log(`✓ BDI (${cfg.host}): envios_reparto ${r.rows[0].n} · envios_turno ${t.rows[0].n} filas`)
  console.log(`  ${estado}`)
  console.log(`  fecha sin turno: ${checkOk ? 'rechazada ✓' : '✗ SE GUARDÓ — el check no está'}`)
  if (rls.rows.some((x) => !x.relrowsecurity) || !checkOk) process.exitCode = 1
} catch (e) {
  await client.query('ROLLBACK').catch(() => {})
  console.log(`✗ BDI: ${e.message}`)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}
