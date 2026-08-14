// Aplica sql/migrate-rls.sql a UNA base por vez, y verifica el resultado.
//
// ⚠️ **Arranca en SIMULACIÓN**, como `scripts/purga-historica.js`. Sin `--aplicar` sólo muestra qué
// tablas quedarían con RLS y qué permisos de escritura tiene hoy `anon`. Es la migración con más
// consecuencias del repo: si en Vercel falta una service key, después de esto el Monitor deja de
// guardar. Leer el PASO 0 del `.sql` antes.
//
//   node scripts/apply-rls.mjs zattia            # simulación (empezar por acá)
//   node scripts/apply-rls.mjs zattia --aplicar  # de verdad
//   node scripts/apply-rls.mjs bdi --aplicar     # recién después de verificar Zattia A MANO
//
// 🔑 **Una base por vez y Zattia primero, a propósito.** Es la chica y la de menos gente encima, así
// que si algo dejó de guardar se ve antes y molesta menos. Correrlas juntas sería descubrir el
// problema en las dos a la vez.
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

const marca = (process.argv[2] || '').toLowerCase()
const aplicar = process.argv.includes('--aplicar')

if (!['bdi', 'zattia'].includes(marca)) {
  console.error('Uso: node scripts/apply-rls.mjs bdi|zattia [--aplicar]')
  process.exit(1)
}

const url = marca === 'bdi' ? env.DATABASE_URL_BDI : env.DATABASE_URL_ZATTIA
if (!url) {
  console.error(`Falta DATABASE_URL_${marca.toUpperCase()} en .env`)
  process.exit(1)
}

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

const SIN_RLS = `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity order by 1`
// 🔴 `authenticated` va en la lista, no sólo `anon`. Mirando sólo `anon`, este chequeo dio verde el
// 13-ago-2026 con `meta_ads_rentabilidad:TRUNCATE` puesto para `authenticated` — la migración
// revoca los dos roles, así que verificar uno solo es verificar la mitad.
const ESCRIBE = `select grantee, table_name, privilege_type from information_schema.role_table_grants
                 where grantee in ('anon', 'authenticated') and table_schema = 'public'
                   and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE') order by 1, 2, 3`

const cfg = parse(url)
const client = new pg.Client({ ...cfg, ssl: { rejectUnauthorized: false } })
const MARCA = marca.toUpperCase()

try {
  await client.connect()

  const antesRls = (await client.query(SIN_RLS)).rows.map((r) => r.relname)
  const antesEsc = (await client.query(ESCRIBE)).rows
  const tablasQueEscriben = new Set(antesEsc.map((r) => r.table_name))

  console.log(`\n=== ${MARCA} (${cfg.host}) — ANTES ===`)
  console.log(`  tablas SIN row level security : ${antesRls.length}`)
  console.log(`  tablas donde anon/auth ESCRIBEN: ${tablasQueEscriben.size}`)
  if (tablasQueEscriben.size) {
    const m = [...tablasQueEscriben].slice(0, 8).join(', ')
    console.log(`    p.ej.: ${m}${tablasQueEscriben.size > 8 ? ', …' : ''}`)
  }

  if (!aplicar) {
    console.log(`\n(simulación — no se tocó nada). Para aplicar de verdad:`)
    console.log(`    node scripts/apply-rls.mjs ${marca} --aplicar`)
    console.log(`\nPASO 0 antes de aplicar: Monitor → Usuarios → "Credenciales del servidor".`)
    console.log(`${MARCA} tiene que decir «escribe como servicio». Si dice «escribe como anónimo»,`)
    console.log(`esto la deja sin poder guardar nada (los handlers hacen SERVICE_KEY || KEY).\n`)
    process.exit(0)
  }

  await client.query('BEGIN')
  await client.query(readFileSync('sql/migrate-rls.sql', 'utf8'))
  await client.query('COMMIT')

  const despuesRls = (await client.query(SIN_RLS)).rows.map((r) => r.relname)
  const despuesEsc = (await client.query(ESCRIBE)).rows

  console.log(`\n=== ${MARCA} — DESPUÉS ===`)
  console.log(`  tablas SIN row level security : ${despuesRls.length}${despuesRls.length ? ' → ' + despuesRls.join(', ') : ' ✓'}`)
  console.log(`  escritura de anon/authenticated: ${despuesEsc.length}${despuesEsc.length ? ' → ' + despuesEsc.map((r) => `${r.grantee}:${r.table_name}:${r.privilege_type}`).join(', ') : ' ✓'}`)

  // Que la lectura del navegador siga entrando. Si esto da 0 filas en `productos`, el Monitor de
  // esta marca ya no muestra nada y hay que hacer el rollback del final del .sql.
  const p = await client.query('select count(*)::int as n from productos')
  console.log(`  productos legibles            : ${p.rows[0].n}`)

  // 🔴 El `grant select on all tables` de arriba es a nivel tabla y **pisa los permisos por columna**
  // de `migrate-columnas-pii.sql`: correr esto de nuevo vuelve a entregar los mails y los costos.
  // Sin este aviso, la re-apertura no la nota nadie — el resto de la salida queda igual de verde.
  const pii = await client.query(
    `select has_column_privilege('anon', 'public.ventas'::regclass, 'client_email', 'SELECT') as lee
       from pg_class where oid = 'public.ventas'::regclass
        and exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'ventas' and column_name = 'client_email')`,
  )
  if (pii.rows[0]?.lee) {
    console.log(`\n⚠️  anon volvió a leer \`ventas.client_email\`: este grant pisó los permisos por columna.`)
    console.log(`    Corré:  node scripts/apply-columnas-pii.mjs ${marca} --aplicar`)
  }

  const ok = despuesRls.length === 0 && despuesEsc.length === 0
  console.log(ok ? `\n✓ ${MARCA} cerrada.` : `\n✗ ${MARCA}: quedó algo abierto, mirá el detalle de arriba.`)
  console.log(`\nFalta lo que no se puede verificar desde acá: entrar al Monitor de ${MARCA} y`)
  console.log(`**guardar algo de verdad** (una falla, un conteo). Es lo único que esta migración`)
  console.log(`puede romper, y un verde de pantalla no lo dice.\n`)
  if (!ok) process.exitCode = 1
} catch (e) {
  await client.query('ROLLBACK').catch(() => {})
  console.log(`✗ ${MARCA}: ${e.message}`)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}
