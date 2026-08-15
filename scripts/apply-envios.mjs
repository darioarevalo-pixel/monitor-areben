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

// ⛔ **El `drop` de `pago_cadete` va detrás de una bandera, y no es prolijidad.**
//
// Prod y los previews comparten UNA base, y `api/_envios.js` pide sus columnas por nombre: mientras
// haya una versión vieja andando, dropear la columna le contesta 500 a cada lectura de la hoja. El
// orden correcto es deployar primero y cerrar después:
//
//     node scripts/apply-envios.mjs                    ← antes de deployar (todo aditivo)
//     node scripts/apply-envios.mjs --cerrar-tanda-a   ← después, con el código nuevo sirviendo
//
// Si el drop viviera en el array de siempre, "correr las migraciones" antes de deployar rompería
// prod sin que nadie hubiera pedido nada raro. Que haya que escribirlo aparte ES el recordatorio.
const cerrarTandaA = process.argv.includes('--cerrar-tanda-a')

// El orden importa: el segundo afloja columnas que crea el primero, el tercero agrega la cuenta
// corriente y se lleva `envios_turno` (sólo si está vacía), y el cuarto suma el tilde de bonificado.
// Van en la misma transacción, así que o entran todos o no entra ninguno.
const archivos = [
  'sql/migrate-envios.sql',
  'sql/migrate-envios-pendientes.sql',
  'sql/migrate-envios-cuenta.sql',
  'sql/migrate-envios-plata.sql',
  'sql/migrate-envios-estados.sql',
  'sql/migrate-envios-bandeja.sql',
  'sql/migrate-envios-portal.sql',
]
if (cerrarTandaA) archivos.push('sql/migrate-envios-plata-drop.sql', 'sql/migrate-envios-estados-cierre.sql')

const sql = archivos.map((f) => readFileSync(f, 'utf8')).join('\n;\n')

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
  const t = await client.query('select count(*)::int as n from envios_dia')
  // El RLS es la mitad del punto de esta migración: si quedara apagado, sería la única tabla
  // abierta de la base justo después de que `migrate-rls.sql` la dejara en cero. Se verifica, no
  // se supone. Y con él, que `anon` no pueda ESCRIBIR: son dos candados distintos —RLS filtra filas,
  // el privilegio niega el verbo— y ya pasó una vez que uno tapara la ausencia del otro.
  const rls = await client.query(
    `select relname, relrowsecurity,
            has_table_privilege('anon', 'public.' || relname, 'INSERT') as anon_escribe
       from pg_class
      where relname in ('envios_reparto', 'envios_dia', 'envios_portal') order by relname`,
  )
  // La tabla vieja del cierre por turno. Tenía que irse, pero sólo si estaba vacía: con filas, esos
  // serían los únicos datos de caja que existen.
  const vieja = await client.query(`select to_regclass('public.envios_turno') is not null as sigue`)
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

  // Lo mismo para el candado nuevo: pagado y bonificado son dos verdades sobre la misma plata y la
  // base los tiene que rechazar juntos. Se ejerce escribiendo la fila prohibida, igual que arriba —
  // un `check` declarado `not valid` que no llegó a aplicarse se ve exactamente igual que uno que sí.
  let plataOk = false
  await client.query('BEGIN')
  try {
    await client.query(
      `insert into envios_reparto (id, store, direccion, envio_pagado, envio_bonificado)
       values ('__sonda2__', 'bdi', 'sonda', true, true)`,
    )
  } catch {
    plataOk = true
  }
  await client.query('ROLLBACK')

  // `pago_cadete`: mientras exista, cuántas filas la usan. Con filas NO se dropea — cada una es el
  // único registro de lo que ese reparto le costó a la empresa. Ver `migrate-envios-plata-drop.sql`.
  const viejaCol = await client.query(
    `select count(*)::int as n
       from information_schema.columns
      where table_name = 'envios_reparto' and column_name = 'pago_cadete'`,
  )
  const conTarifaPropia = viejaCol.rows[0].n
    ? (await client.query('select count(*)::int as n from envios_reparto where pago_cadete is not null')).rows[0].n
    : 0

  // Los estados que hay de verdad. Se imprimen SIEMPRE y no sólo cuando hay legados: es el número
  // que hay que mirar antes de estrechar el check, y pedirlo aparte es la forma de no mirarlo.
  const est = await client.query('select estado, count(*)::int as n from envios_reparto group by 1 order by 2 desc')
  const legados = est.rows.filter((r) => r.estado === 'despachado' || r.estado === 'reintento')
  // 🔴 El caso ambiguo del renombrado: un `reintento` CON fecha puede ser un paquete ya reagendado
  // (⇒ `pendiente`) o uno que volvió y nadie sacó del día (⇒ `no_entregado`). Se miran de a uno.
  const reintentoConFecha = (
    await client.query(`select count(*)::int as n from envios_reparto where estado = 'reintento' and fecha is not null`)
  ).rows[0].n

  const estado = rls.rows
    .map((x) => `${x.relname}=${x.relrowsecurity ? 'RLS ✓' : 'RLS ✗ ABIERTA'}${x.anon_escribe ? ' ✗ anon ESCRIBE' : ''}`)
    .join(' · ')
  console.log(`✓ BDI (${cfg.host}): envios_reparto ${r.rows[0].n} · envios_dia ${t.rows[0].n} filas`)
  console.log(`  ${estado}`)
  console.log(`  fecha sin turno: ${checkOk ? 'rechazada ✓' : '✗ SE GUARDÓ — el check no está'}`)
  console.log(`  pagado + bonificado: ${plataOk ? 'rechazado ✓' : '✗ SE GUARDÓ — el check no está'}`)
  console.log(`  envios_turno: ${vieja.rows[0].sigue ? '⚠️ SIGUE (tenía filas: son datos de caja, mirarlos)' : 'se fue ✓'}`)
  console.log(
    `  pago_cadete: ${
      !viejaCol.rows[0].n
        ? 'se fue ✓'
        : conTarifaPropia === 0
          ? `sigue (0 filas la usan — cerrá con --cerrar-tanda-a después de deployar)`
          : `⚠️ SIGUE y ${conTarifaPropia} filas la usan: son bonificados del modelo viejo, pasarlos a monto_envio + envio_bonificado ANTES de dropear`
    }`,
  )
  console.log(`  estados: ${est.rows.map((r) => `${r.estado} ${r.n}`).join(' · ') || '(sin filas)'}`)
  if (legados.length) {
    console.log(
      `  ⚠️ quedan ${legados.map((r) => `${r.estado} ${r.n}`).join(' · ')} — se renombran con --cerrar-tanda-a` +
        (reintentoConFecha ? `; ${reintentoConFecha} reintento CON fecha: MIRALOS DE A UNO antes` : ''),
    )
  }
  if (rls.rows.some((x) => !x.relrowsecurity || x.anon_escribe) || !checkOk || !plataOk) process.exitCode = 1
} catch (e) {
  await client.query('ROLLBACK').catch(() => {})
  console.log(`✗ BDI: ${e.message}`)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}
