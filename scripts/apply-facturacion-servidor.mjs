// Aplica sql/migrate-facturacion-servidor.sql (escalón 5 de la Fase S) y verifica.
//
// ⚠️ **Arranca en SIMULACIÓN**, como los otros `apply-*` de la Fase S.
//
//   node scripts/apply-facturacion-servidor.mjs zattia            # simulación (empezar por acá)
//   node scripts/apply-facturacion-servidor.mjs zattia --aplicar  # de verdad
//   node scripts/apply-facturacion-servidor.mjs bdi --aplicar
//
// ⛔ **Sólo después de deployar y ver el Monitor abrir en producción**, con el IndexedDB borrado,
// en las DOS marcas, y el CRM en sus dos modos. Estas tres tablas son la entrada del ETL: con el
// deploy viejo sirviéndose, esto no rompe una pantalla — **no abre el Monitor**.
//
// 🔑 La verificación pregunta por el permiso EFECTIVO (`has_column_privilege` sobre TODAS las
// columnas, no una testigo) y además **cuenta las filas con la conexión de servicio**: preguntar
// sólo "¿anon puede?" diría "cerrado" también si la tabla se hubiera vaciado, que es la pantalla en
// blanco. Y `has_table_privilege` acá daría un rojo/verde falso: los escalones 1 y 3 dejaron estas
// tablas sin permiso de TABLA y con permisos de COLUMNA.
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
  console.error('Uso: node scripts/apply-facturacion-servidor.mjs bdi|zattia [--aplicar]')
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

// Las cuatro que se cierran. `variante_color_manual` sólo existe en Zattia.
const SE_CIERRAN = ['ventas', 'venta_detalles', 'productos', 'variante_color_manual']

const cfg = parse(url)
const client = new pg.Client({ ...cfg, ssl: { rejectUnauthorized: false } })
const MARCA = marca.toUpperCase()
const ROLES = ['anon', 'authenticated', 'service_role']

/** Sólo las que existen en ESTA base: preguntar por una inexistente revienta la consulta. */
async function existentes(nombres) {
  const vivos = []
  for (const o of nombres) {
    const { rows } = await client.query(`select to_regclass('public.' || $1) is not null as si`, [o])
    if (rows[0].si) vivos.push(o)
  }
  return vivos
}

/**
 * Qué columnas lee cada rol de cada tabla.
 *
 * 🔴 **Se pregunta por TODAS las columnas, no por una testigo.** Estas tablas llegan acá con
 * permisos por columna puestos a mano por los escalones 1 y 3: una testigo bien elegida diría
 * "cerrado" mientras otras diez siguen abiertas. Lo que hay que poder afirmar es "ninguna".
 */
async function foto(tablas) {
  const out = {}
  for (const rol of ROLES) {
    out[rol] = {}
    for (const t of tablas) {
      const { rows } = await client.query(
        `select column_name from information_schema.columns
          where table_schema = 'public' and table_name = $2
            and has_column_privilege($1, ('public.' || $2)::regclass, column_name, 'SELECT')
          order by ordinal_position`,
        [rol, t],
      )
      out[rol][t] = rows.map((r) => r.column_name)
    }
  }
  return out
}

function imprimir(titulo, f, tablas) {
  console.log(`\n=== ${MARCA} (${cfg.host}) — ${titulo} ===`)
  for (const rol of ROLES) {
    for (const t of tablas) {
      const cols = f[rol][t]
      const cuantas = cols.length ? `${String(cols.length).padStart(2)} → ${cols.join(',')}` : ' 0 → —'
      console.log(`  ${rol.padEnd(14)} ${t.padEnd(23)} ${cuantas.slice(0, 110)}`)
    }
  }
}

try {
  await client.connect()

  const tablas = await existentes(SE_CIERRAN)
  if (!tablas.length) {
    console.log(`\n=== ${MARCA} (${cfg.host}) ===\n  ninguna de las cuatro existe en esta base.\n`)
    process.exit(0)
  }
  const faltan = SE_CIERRAN.filter((t) => !tablas.includes(t))
  if (faltan.length) console.log(`\n(no existen en ${MARCA} y se saltean: ${faltan.join(', ')})`)

  const antes = await foto(tablas)
  imprimir('ANTES', antes, tablas)

  if (!aplicar) {
    console.log(`\n(simulación — no se tocó nada). Para aplicar de verdad:`)
    console.log(`    node scripts/apply-facturacion-servidor.mjs ${marca} --aplicar\n`)
    process.exit(0)
  }

  await client.query('BEGIN')
  await client.query(readFileSync('sql/migrate-facturacion-servidor.sql', 'utf8'))
  await client.query('COMMIT')

  const despues = await foto(tablas)
  imprimir('DESPUÉS', despues, tablas)

  // Las filas se cuentan con la conexión de servicio, que es la que usa la puerta: una tabla
  // cerrada y vacía se ve igual que una cerrada y sana desde el lado de los permisos.
  console.log('')
  let conFilas = 0
  for (const t of tablas) {
    const { rows } = await client.query(`select count(*)::int as n from ${t}`)
    console.log(`  filas en ${t.padEnd(23)}: ${rows[0].n}`)
    if (rows[0].n > 0) conFilas++
  }

  const cerrado = ['anon', 'authenticated'].every((r) => tablas.every((t) => despues[r][t].length === 0))
  const servicio = tablas.every((t) => despues.service_role[t].length > 0)

  console.log(`\n  anon y authenticated no leen NINGUNA columna : ${cerrado ? '✓' : '✗'}`)
  console.log(`  service_role las sigue leyendo todas         : ${servicio ? '✓' : '✗'}`)
  console.log(`  y con filas adentro                          : ${conFilas > 0 ? '✓' : '✗'}`)
  const ok = cerrado && servicio && conFilas > 0
  console.log(
    ok
      ? `\n✓ ${MARCA}: la anon key ya no lee una sola fila de esta base.`
      : `\n✗ ${MARCA}: mirá el detalle de arriba.`,
  )
  console.log(`\nFalta lo que no se puede ver desde acá: con la anon key, que \`ventas?select=id\`,`)
  console.log(`\`venta_detalles?select=sale_id\` y \`productos?select=id\` den 401; y en el Monitor con`)
  console.log(`el IndexedDB borrado, que ABRA en las dos marcas, que Ventas mensuales tenga sus meses,`)
  console.log(`que Reposición traiga stock, y que el CRM cargue en los dos modos del select.\n`)
  if (!ok) process.exitCode = 1
} catch (e) {
  await client.query('ROLLBACK').catch(() => {})
  console.log(`✗ ${MARCA}: ${e.message}`)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}
