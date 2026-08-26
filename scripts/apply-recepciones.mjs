// Aplica sql/migrate-recepciones.sql a la base de BDI.
// Uso: node scripts/apply-recepciones.mjs
//
// ⚠️ VA A UNA SOLA BASE, al revés que `apply-pedidos-clientes.mjs`. Las recepciones de las dos
// marcas viven juntas con una columna `store`: un webhook no puede elegir base, y si la credencial
// de una marca no está cargada el evento se pierde para siempre (el emisor no lo vuelve a mandar
// después de sus 17 horas de reintentos). El razonamiento largo está en el .sql.
//
// Idempotente (`create table/index if not exists` + los `do $$` de los checks). Re-correrlo no hace
// nada.
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

const sql = readFileSync('sql/migrate-recepciones.sql', 'utf8')

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

  // 🔴 Los candados se EJERCEN, no se suponen. Acá el que más importa es el de la clave del evento:
  // si `webhook_id` no fuera único, **cada reintento del emisor entraría como un evento nuevo** y la
  // misma OC se procesaría cinco veces sin que nada falle ni se vea.
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

  const EV = `insert into recepcion_evento (webhook_id, tipo, payload)`
  const estadoOk = await sonda(`${EV.replace('payload)', 'payload, estado)')} values ('__s__', 'oc.confirmada', '{}'::jsonb, 'inventado')`)
  const dedupOk = await sonda(`${EV} values ('__s__', 'oc.confirmada', '{}'::jsonb), ('__s__', 'oc.confirmada', '{}'::jsonb)`)
  const storeOk = await sonda(
    `${EV} values ('__s__', 'oc.confirmada', '{}'::jsonb);
     insert into recepcion_oc (id, store, oc_id, evento_id) values ('__s__:1', 'otra', 1, '__s__')`,
  )
  const naturalOk = await sonda(
    `${EV} values ('__s__', 'oc.confirmada', '{}'::jsonb);
     insert into recepcion_oc (id, store, oc_id, evento_id) values ('a:1', 'bdi', 1, '__s__'), ('b:1', 'bdi', 1, '__s__')`,
  )
  const fkOk = await sonda(`insert into recepcion_linea (id, oc_ref, store) values ('__s__', 'no-existe', 'bdi')`)

  // ⚠️ El espejo POSITIVO de las cinco sondas. Sin él, una tabla que rechazara todo —un permiso mal
  // dado, un trigger de más— daría los cinco ✓ y el script diría que está perfecta: toda negación
  // necesita su punta positiva o no mide nada.
  const filaSanaEntra = !(await sonda(
    `${EV} values ('__s__', 'oc.confirmada', '{}'::jsonb);
     insert into recepcion_oc (id, store, oc_id, evento_id) values ('bdi:999', 'bdi', 999, '__s__');
     insert into recepcion_linea (id, oc_ref, store, sku, cantidad_pedida, cantidad_contada, diferencia)
       values ('bdi:999:0', 'bdi:999', 'bdi', 'REM-0007-NG-M', 12, 10, -2)`,
  ))

  // Y que el cascade borre los renglones con su OC: si no, borrar una OC deja renglones huérfanos
  // que ninguna pantalla muestra y que igual pesan.
  await client.query('BEGIN')
  let cascadaOk = false
  try {
    await client.query(`${EV} values ('__s__', 'oc.confirmada', '{}'::jsonb)`)
    await client.query(`insert into recepcion_oc (id, store, oc_id, evento_id) values ('bdi:998', 'bdi', 998, '__s__')`)
    await client.query(`insert into recepcion_linea (id, oc_ref, store) values ('bdi:998:0', 'bdi:998', 'bdi')`)
    await client.query(`delete from recepcion_oc where id = 'bdi:998'`)
    const q = await client.query(`select count(*)::int as n from recepcion_linea where oc_ref = 'bdi:998'`)
    cascadaOk = q.rows[0].n === 0
  } catch { /* queda en false */ }
  await client.query('ROLLBACK')

  const cuentas = await client.query(
    `select (select count(*)::int from recepcion_evento) as eventos,
            (select count(*)::int from recepcion_oc)     as ocs,
            (select count(*)::int from recepcion_linea)  as lineas`,
  )
  const c = cuentas.rows[0]

  const rls = await client.query(
    `select relname, relrowsecurity,
            has_table_privilege('anon', 'public.' || relname, 'SELECT') as anon_lee,
            has_table_privilege('anon', 'public.' || relname, 'INSERT') as anon_escribe
       from pg_class where relname in ('recepcion_evento', 'recepcion_oc', 'recepcion_linea')`,
  )

  console.log(`\n✓ BDI (${cfg.host}): recepciones listas — ${c.eventos} eventos · ${c.ocs} OC · ${c.lineas} renglones`)
  console.log(`  ${dedupOk ? '✓' : '✗'} webhook_id ${dedupOk ? 'rechaza el reintento duplicado' : 'DEJA ENTRAR EL MISMO EVENTO DOS VECES'}`)
  console.log(`  ${naturalOk ? '✓' : '✗'} (store, oc_id) ${naturalOk ? 'rechaza' : 'DEJA PASAR'} la misma OC dos veces`)
  console.log(`  ${estadoOk ? '✓' : '✗'} check de estado ${estadoOk ? 'rechaza' : 'DEJA PASAR'} un valor inventado`)
  console.log(`  ${storeOk ? '✓' : '✗'} check de store ${storeOk ? 'rechaza' : 'DEJA PASAR'} una marca inventada`)
  console.log(`  ${fkOk ? '✓' : '✗'} un renglón sin su OC ${fkOk ? 'no entra' : 'ENTRA HUÉRFANO'}`)
  console.log(`  ${cascadaOk ? '✓' : '✗'} borrar una OC ${cascadaOk ? 'se lleva sus renglones' : 'DEJA LOS RENGLONES HUÉRFANOS'}`)
  console.log(`  ${filaSanaEntra ? '✓' : '✗'} y una OC SANA ${filaSanaEntra ? 'entra' : 'NO ENTRA (los ✓ de arriba no valen)'}`)
  let abierto = false
  for (const r of rls.rows) {
    console.log(`  ${r.relrowsecurity ? '✓' : '✗'} ${r.relname}: RLS ${r.relrowsecurity ? 'prendido' : 'APAGADO'} · anon lee: ${r.anon_lee} · anon escribe: ${r.anon_escribe}`)
    if (!r.relrowsecurity || r.anon_escribe) abierto = true
  }
  if (rls.rows.length !== 3) { console.log('  ✗ faltan tablas'); abierto = true }

  if (!dedupOk || !naturalOk || !estadoOk || !storeOk || !fkOk || !cascadaOk || !filaSanaEntra || abierto) {
    console.log('\n⚠ Algo quedó abierto. Mirá las líneas con ✗ antes de darle la URL al emisor.')
    process.exitCode = 1
  }
} catch (e) {
  await client.query('ROLLBACK').catch(() => {})
  console.log(`✗ BDI: ${e.message}`)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}
