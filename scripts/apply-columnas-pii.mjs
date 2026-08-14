// Aplica sql/migrate-columnas-pii.sql a UNA base por vez, y verifica el resultado.
//
// ⚠️ **Arranca en SIMULACIÓN**, como `apply-rls.mjs`. Sin `--aplicar` sólo muestra qué columnas
// puede leer hoy `anon` de las que no debería, y confirma que las que la app sí usa están.
//
//   node scripts/apply-columnas-pii.mjs zattia            # simulación (empezar por acá)
//   node scripts/apply-columnas-pii.mjs zattia --aplicar  # de verdad
//   node scripts/apply-columnas-pii.mjs bdi --aplicar     # recién después de verificar Zattia A MANO
//
// 🔑 **La verificación pregunta `has_column_privilege`, no si el revoke salió bien.** Un revoke por
// columna sobre alguien que tiene el permiso de la tabla entera sale en verde y no hace nada (ver
// el bloque rojo del .sql). Preguntar por el permiso efectivo es lo único que distingue las dos
// cosas, y es la diferencia entre cerrar la puerta y creer que se cerró.
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
  console.error('Uso: node scripts/apply-columnas-pii.mjs bdi|zattia [--aplicar]')
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

// Las que se cierran. Tiene que decir lo mismo que el `values` del .sql: si se separan, el script
// verifica una cosa y la migración hace otra.
const PROHIBIDAS = {
  ventas: ['client_name', 'client_email', 'client_phone', 'client_city', 'client_province', 'total_cost', 'profit'],
  clientes: ['address', 'postal_code', 'total_sales', 'total_amount'],
}

// Las que la app SÍ pide. No es decorativo: son las que, si esto se las lleva puestas, dejan una
// pantalla vacía. `channel_id` no existe en Zattia y `clientes` tampoco, y eso no es un error.
const QUE_USA_LA_APP = {
  ventas: ['id', 'date_sale', 'channel', 'channel_id', 'total_price', 'client_id', 'sale_state'],
  clientes: ['id', 'name', 'email', 'phone', 'city', 'province'],
}

const PERMISOS = `
  select c.table_name, c.column_name,
         has_column_privilege('anon', format('public.%I', c.table_name)::regclass, c.column_name, 'SELECT') as anon,
         has_column_privilege('authenticated', format('public.%I', c.table_name)::regclass, c.column_name, 'SELECT') as auth
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = any ($1)
   order by c.table_name, c.ordinal_position`

const cfg = parse(url)
const client = new pg.Client({ ...cfg, ssl: { rejectUnauthorized: false } })
const MARCA = marca.toUpperCase()
const TABLAS = Object.keys(PROHIBIDAS)

/** Devuelve { expuestas, faltantes } — lo que se filtra y lo que la app perdería. */
async function foto() {
  const { rows } = await client.query(PERMISOS, [TABLAS])
  const lee = new Set(rows.filter((r) => r.anon || r.auth).map((r) => `${r.table_name}.${r.column_name}`))
  const existe = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`))
  const expuestas = []
  const faltantes = []
  for (const t of TABLAS) {
    for (const c of PROHIBIDAS[t]) if (lee.has(`${t}.${c}`)) expuestas.push(`${t}.${c}`)
    for (const c of QUE_USA_LA_APP[t]) if (existe.has(`${t}.${c}`) && !lee.has(`${t}.${c}`)) faltantes.push(`${t}.${c}`)
  }
  return { expuestas, faltantes, tablas: [...new Set(rows.map((r) => r.table_name))] }
}

try {
  await client.connect()

  const antes = await foto()
  console.log(`\n=== ${MARCA} (${cfg.host}) — ANTES ===`)
  console.log(`  tablas presentes              : ${antes.tablas.join(', ') || '(ninguna)'}`)
  console.log(`  columnas que anon NO debería leer y lee : ${antes.expuestas.length}`)
  if (antes.expuestas.length) console.log(`    ${antes.expuestas.join(', ')}`)

  if (!aplicar) {
    console.log(`\n(simulación — no se tocó nada). Para aplicar de verdad:`)
    console.log(`    node scripts/apply-columnas-pii.mjs ${marca} --aplicar\n`)
    process.exit(0)
  }

  await client.query('BEGIN')
  await client.query(readFileSync('sql/migrate-columnas-pii.sql', 'utf8'))
  await client.query('COMMIT')

  const despues = await foto()
  console.log(`\n=== ${MARCA} — DESPUÉS ===`)
  console.log(`  columnas expuestas            : ${despues.expuestas.length}${despues.expuestas.length ? ' → ' + despues.expuestas.join(', ') : ' ✓'}`)
  console.log(`  columnas que la app usa y perdió: ${despues.faltantes.length}${despues.faltantes.length ? ' → ' + despues.faltantes.join(', ') : ' ✓'}`)

  // Lo mismo que hace el navegador, contra la base: si esto devuelve filas, Resumen y el CRM
  // siguen teniendo con qué. Un cero acá es la pantalla vacía antes de que la vea alguien.
  const v = await client.query('select count(*)::int as n from ventas')
  console.log(`  ventas legibles               : ${v.rows[0].n}`)

  const ok = despues.expuestas.length === 0 && despues.faltantes.length === 0
  console.log(ok ? `\n✓ ${MARCA} cerrada.` : `\n✗ ${MARCA}: mirá el detalle de arriba.`)
  console.log(`\nFalta lo que no se puede ver desde acá: con la anon key, que`)
  console.log(`\`?select=client_email\` dé 403 y \`?select=id,date_sale\` dé 200, y abrir el Monitor`)
  console.log(`de ${MARCA} en Resumen, Ventas mensuales, Liquidación y Clientes.\n`)
  if (!ok) process.exitCode = 1
} catch (e) {
  await client.query('ROLLBACK').catch(() => {})
  console.log(`✗ ${MARCA}: ${e.message}`)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}
