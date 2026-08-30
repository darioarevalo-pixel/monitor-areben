// Aplica sql/migrate-prm.sql a la base de BDI.
// Uso: node scripts/apply-prm.mjs
//
// ⚠️ VA A UNA SOLA BASE, y acá no es por el webhook (como en recepciones) sino porque el dato mismo
// no tiene marca: un local de Avellaneda me vende para BDI o para Zattia según el día. El
// razonamiento largo está en el .sql.
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

const sql = readFileSync('sql/migrate-prm.sql', 'utf8')

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

const TABLAS = ['proveedor_local', 'proveedor_visita', 'proveedor_interes', 'proveedor_compromiso', 'recorrida', 'recorrida_parada']

try {
  await client.connect()
  await client.query('BEGIN')
  await client.query(sql)
  await client.query('COMMIT')

  // 🔴 Los candados se EJERCEN, no se suponen.
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

  const LOCAL = `insert into proveedor_local (id, nombre) values ('__s__', 'Sonda')`

  const estadoOk = await sonda(
    `insert into proveedor_local (id, nombre, estado) values ('__s__', 'Sonda', 'inventado')`,
  )
  const marcaOk = await sonda(
    `${LOCAL};
     insert into proveedor_interes (id, local_id, descripcion, visto_en, marca)
       values ('__i__', '__s__', 'jean', current_date, 'stunned')`,
  )
  const deQuienOk = await sonda(
    `${LOCAL};
     insert into proveedor_compromiso (id, local_id, que, de_quien)
       values ('__c__', '__s__', 'me guarda 20', 'el')`,
  )
  const puntajeOk = await sonda(
    `${LOCAL};
     insert into proveedor_visita (id, local_id, fecha, puntaje) values ('__v__', '__s__', current_date, 9)`,
  )
  // 🔴 El que más importa: dos locales colgados del MISMO proveedor del sistema de Ingresos harían
  // que las dos fichas mostraran las mismas OCs y que el cumplimiento se contara dos veces.
  const engancheOk = await sonda(
    `insert into proveedor_local (id, nombre, proveedor_id_ingresos)
       values ('__a__', 'Uno', 77), ('__b__', 'Otro', 77)`,
  )
  const fkOk = await sonda(
    `insert into proveedor_visita (id, local_id, fecha) values ('__v__', 'no-existe', current_date)`,
  )
  const paradaOk = await sonda(
    `${LOCAL};
     insert into recorrida (id, fecha) values ('__r__', current_date);
     insert into recorrida_parada (id, recorrida_id, local_id) values ('__p1__', '__r__', '__s__'), ('__p2__', '__r__', '__s__')`,
  )

  // ⚠️ El espejo POSITIVO. Sin él, una tabla que rechazara TODO —un permiso mal dado, un trigger de
  // más— daría todos los ✓ de arriba y el script diría que está perfecta.
  const filaSanaEntra = !(await sonda(
    `insert into proveedor_local (id, nombre, galeria, zona, estado, proveedor_id_ingresos)
       values ('__s__', 'Los Tres Hermanos', 'Galería Punto Once, local 23', 'Flores', 'compro', 77);
     insert into proveedor_visita (id, local_id, fecha, opinion, puntaje, compre, que_compre)
       values ('__v__', '__s__', current_date, 'Buen género, atienden rápido', 4, true, '3 docenas de jean mom');
     insert into proveedor_interes (id, local_id, visita_id, descripcion, precio_visto, visto_en, marca)
       values ('__i__', '__s__', '__v__', 'Jean mom tiro alto', 18500.00, current_date, 'bdi');
     insert into proveedor_compromiso (id, local_id, visita_id, que, de_quien, para_cuando)
       values ('__c__', '__s__', '__v__', 'Me guarda 20 del celeste', 'ellos', current_date + 7);
     insert into recorrida (id, fecha, zona, estado) values ('__r__', current_date, 'Flores', 'en_curso');
     insert into recorrida_parada (id, recorrida_id, local_id, orden, visita_id)
       values ('__p__', '__r__', '__s__', 0, '__v__')`,
  ))

  // 🔑 Y la punta positiva del índice PARCIAL, que es la que se olvida: el enganche vacío es el
  // caso NORMAL (un local de Flores al que todavía no se le compró), así que dos nulls tienen que
  // poder convivir. Un `unique` sin el `where` los rechazaría y nadie podría cargar dos locales.
  const dosSinEngancheEntran = !(await sonda(
    `insert into proveedor_local (id, nombre) values ('__a__', 'Uno'), ('__b__', 'Otro')`,
  ))

  // Que el cascade se lleve la historia con el local: si no, quedan visitas huérfanas que ninguna
  // pantalla muestra y que igual pesan.
  await client.query('BEGIN')
  let cascadaOk = false
  try {
    await client.query(`insert into proveedor_local (id, nombre) values ('__s__', 'Sonda')`)
    await client.query(`insert into proveedor_visita (id, local_id, fecha) values ('__v__', '__s__', current_date)`)
    await client.query(`insert into proveedor_interes (id, local_id, descripcion, visto_en) values ('__i__', '__s__', 'x', current_date)`)
    await client.query(`insert into proveedor_compromiso (id, local_id, que, de_quien) values ('__c__', '__s__', 'x', 'yo')`)
    await client.query(`delete from proveedor_local where id = '__s__'`)
    const q = await client.query(
      `select (select count(*)::int from proveedor_visita where local_id = '__s__')
            + (select count(*)::int from proveedor_interes where local_id = '__s__')
            + (select count(*)::int from proveedor_compromiso where local_id = '__s__') as n`,
    )
    cascadaOk = q.rows[0].n === 0
  } catch { /* queda en false */ }
  await client.query('ROLLBACK')

  const cuentas = await client.query(
    `select (select count(*)::int from proveedor_local)      as locales,
            (select count(*)::int from proveedor_visita)     as visitas,
            (select count(*)::int from proveedor_interes)    as intereses,
            (select count(*)::int from proveedor_compromiso) as compromisos,
            (select count(*)::int from recorrida)            as recorridas`,
  )
  const c = cuentas.rows[0]

  const rls = await client.query(
    `select relname, relrowsecurity,
            has_table_privilege('anon', 'public.' || relname, 'SELECT') as anon_lee,
            has_table_privilege('anon', 'public.' || relname, 'INSERT') as anon_escribe
       from pg_class where relname = any($1)`,
    [TABLAS],
  )

  console.log(`\n✓ BDI (${cfg.host}): PRM listo — ${c.locales} locales · ${c.visitas} visitas · ${c.intereses} intereses · ${c.compromisos} compromisos · ${c.recorridas} recorridas`)
  console.log(`  ${engancheOk ? '✓' : '✗'} el enganche a Ingresos ${engancheOk ? 'rechaza' : 'DEJA PASAR'} dos locales con el mismo proveedor`)
  console.log(`  ${dosSinEngancheEntran ? '✓' : '✗'} y dos locales SIN enganche ${dosSinEngancheEntran ? 'conviven' : 'NO ENTRAN (el índice parcial está mal)'}`)
  console.log(`  ${paradaOk ? '✓' : '✗'} la misma parada dos veces en una recorrida ${paradaOk ? 'no entra' : 'ENTRA'}`)
  console.log(`  ${estadoOk ? '✓' : '✗'} check de estado ${estadoOk ? 'rechaza' : 'DEJA PASAR'} un valor inventado`)
  console.log(`  ${marcaOk ? '✓' : '✗'} check de marca ${marcaOk ? 'rechaza' : 'DEJA PASAR'} una marca inventada`)
  console.log(`  ${deQuienOk ? '✓' : '✗'} check de de_quien ${deQuienOk ? 'rechaza' : 'DEJA PASAR'} un valor inventado`)
  console.log(`  ${puntajeOk ? '✓' : '✗'} check de puntaje ${puntajeOk ? 'rechaza' : 'DEJA PASAR'} un 9`)
  console.log(`  ${fkOk ? '✓' : '✗'} una visita sin su local ${fkOk ? 'no entra' : 'ENTRA HUÉRFANA'}`)
  console.log(`  ${cascadaOk ? '✓' : '✗'} eliminar un local ${cascadaOk ? 'se lleva su historia' : 'DEJA LA HISTORIA HUÉRFANA'}`)
  console.log(`  ${filaSanaEntra ? '✓' : '✗'} y un local SANO con su historia ${filaSanaEntra ? 'entra' : 'NO ENTRA (los ✓ de arriba no valen)'}`)
  let abierto = false
  for (const r of rls.rows) {
    console.log(`  ${r.relrowsecurity ? '✓' : '✗'} ${r.relname}: RLS ${r.relrowsecurity ? 'prendido' : 'APAGADO'} · anon lee: ${r.anon_lee} · anon escribe: ${r.anon_escribe}`)
    if (!r.relrowsecurity || r.anon_escribe) abierto = true
  }
  if (rls.rows.length !== TABLAS.length) { console.log(`  ✗ faltan tablas (${rls.rows.length} de ${TABLAS.length})`); abierto = true }

  const candados = [engancheOk, dosSinEngancheEntran, paradaOk, estadoOk, marcaOk, deQuienOk, puntajeOk, fkOk, cascadaOk, filaSanaEntra]
  if (candados.some((x) => !x) || abierto) {
    console.log('\n⚠ Algo quedó abierto. Mirá las líneas con ✗ antes de cargar un solo local.')
    process.exitCode = 1
  }
} catch (e) {
  await client.query('ROLLBACK').catch(() => {})
  console.log(`✗ BDI: ${e.message}`)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}
