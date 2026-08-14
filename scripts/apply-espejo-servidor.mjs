// Aplica sql/migrate-espejo-servidor.sql (escalón 4 de la Fase S) y verifica.
//
// ⚠️ **Arranca en SIMULACIÓN**, como los otros `apply-*` de la Fase S.
//
//   node scripts/apply-espejo-servidor.mjs zattia            # simulación (empezar por acá)
//   node scripts/apply-espejo-servidor.mjs zattia --aplicar  # de verdad
//   node scripts/apply-espejo-servidor.mjs bdi --aplicar
//
// ⛔ **Sólo después de deployar y ver el Monitor abrir en producción**, con el IndexedDB borrado.
// `inventario` y las tres vistas están en la carga que corre para las 14 personas: con el deploy
// viejo sirviéndose, esto no rompe una pantalla, **no abre el Monitor**. El rollback está al final
// del SQL y es un grant de una línea.
//
// 🔑 La verificación pregunta por el permiso EFECTIVO (`has_table_privilege`) y además **cuenta las
// filas con la conexión de servicio**: preguntar sólo "¿anon puede?" diría "cerrado" también si la
// vista se hubiera quedado vacía o hubiera desaparecido, que es la pantalla en blanco.
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
  console.error('Uso: node scripts/apply-espejo-servidor.mjs bdi|zattia [--aplicar]')
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

// Los cuatro que se cierran, y los que NO se tocan. La segunda lista es la que convierte esto en
// una verificación de verdad: sin ella, un revoke que se hubiera llevado media base también daría
// "cerrado". `productos` y `ventas` siguen abiertos para `anon` en las columnas que el ETL usa —
// eso lo dejaron los escalones 1 y 3, y romperlo acá sería no abrir el Monitor.
//
// 🔴 **A `productos` y `ventas` hay que preguntarles por COLUMNA, no por tabla.** Los escalones 1 y
// 3 les sacaron el permiso de tabla y lo devolvieron enumerando columnas, así que
// `has_table_privilege('anon', 'productos', 'SELECT')` es **false** y el ETL las lee igual. Medido
// acá mismo: la primera versión de este script preguntaba por tabla y daba rojo con todo sano. Es
// la misma trampa del escalón 2 al revés — allá un verde falso, acá un rojo falso.
const SE_CIERRAN = ['inventario', 'ventas_por_mes', 'ventas_por_categoria_mes', 'fundas_por_modelo_mes']
const NO_SE_TOCAN = ['productos', 'ventas']
/** Una columna que el ETL sí pide de cada una, para preguntar por el permiso EFECTIVO. */
const COLUMNA_TESTIGO = { productos: 'id', ventas: 'id' }

const cfg = parse(url)
const client = new pg.Client({ ...cfg, ssl: { rejectUnauthorized: false } })
const MARCA = marca.toUpperCase()
const ROLES = ['anon', 'authenticated', 'service_role']

/** Sólo los objetos que existen en ESTA base: preguntar por uno inexistente revienta la consulta. */
async function existentes(nombres) {
  const { rows } = await client.query(`select unnest($1::text[]) as o`, [nombres])
  const vivos = []
  for (const { o } of rows) {
    const { rows: r } = await client.query(`select to_regclass('public.' || $1) is not null as si`, [o])
    if (r[0].si) vivos.push(o)
  }
  return vivos
}

async function foto(cierran, quedan) {
  const out = {}
  for (const rol of ROLES) {
    const lee = []
    for (const o of cierran) {
      const { rows } = await client.query(`select has_table_privilege($1, 'public.' || $2, 'SELECT') as si`, [rol, o])
      if (rows[0].si) lee.push(o)
    }
    for (const o of quedan) {
      // Por COLUMNA: ver el comentario de `COLUMNA_TESTIGO`. Preguntar por tabla acá da rojo falso.
      const { rows } = await client.query(
        `select has_column_privilege($1, ('public.' || $2)::regclass, $3, 'SELECT') as si`,
        [rol, o, COLUMNA_TESTIGO[o]],
      )
      if (rows[0].si) lee.push(o)
    }
    out[rol] = { cierran: lee.filter((o) => cierran.includes(o)), quedan: lee.filter((o) => quedan.includes(o)) }
  }
  return out
}

const linea = (rol, f) =>
  `  ${rol.padEnd(14)} espejo: ${(f.cierran.length ? f.cierran.join(', ') : '—').padEnd(62)} sin tocar: ${f.quedan.length ? f.quedan.join(', ') : '—'}`

try {
  await client.connect()

  const cierran = await existentes(SE_CIERRAN)
  const quedan = await existentes(NO_SE_TOCAN)
  if (!cierran.length) {
    console.log(`\n=== ${MARCA} (${cfg.host}) ===\n  ninguno de los cuatro existe en esta base.\n`)
    process.exit(0)
  }

  const antes = await foto(cierran, quedan)
  console.log(`\n=== ${MARCA} (${cfg.host}) — ANTES ===`)
  for (const rol of ROLES) console.log(linea(rol, antes[rol]))

  if (!aplicar) {
    console.log(`\n(simulación — no se tocó nada). Para aplicar de verdad:`)
    console.log(`    node scripts/apply-espejo-servidor.mjs ${marca} --aplicar\n`)
    process.exit(0)
  }

  await client.query('BEGIN')
  await client.query(readFileSync('sql/migrate-espejo-servidor.sql', 'utf8'))
  await client.query('COMMIT')

  const despues = await foto(cierran, quedan)
  console.log(`\n=== ${MARCA} — DESPUÉS ===`)
  for (const rol of ROLES) console.log(linea(rol, despues[rol]))

  // Las filas se cuentan con la conexión de servicio, que es la que usa la puerta: un objeto
  // cerrado y vacío se ve igual que uno cerrado y sano desde el lado de los permisos.
  console.log('')
  const conFilas = []
  for (const o of cierran) {
    const { rows } = await client.query(`select count(*)::int as n from ${o}`)
    console.log(`  filas en ${o.padEnd(26)}: ${rows[0].n}`)
    if (rows[0].n > 0) conFilas.push(o)
  }

  const cerrado = ['anon', 'authenticated'].every((r) => !despues[r].cierran.length)
  const sigueAbierto = ['anon', 'authenticated'].every((r) => quedan.every((o) => despues[r].quedan.includes(o)))
  // `fundas_por_modelo_mes` está vacía en Zattia a propósito (no vende fundas): se exige que
  // service_role las lea todas, y que al menos una traiga filas.
  const servicio = despues.service_role.cierran.length === cierran.length && conFilas.length > 0

  console.log(`\n  el espejo sale del navegador   : ${cerrado ? '✓' : '✗'}`)
  console.log(`  productos y ventas sin tocar   : ${sigueAbierto ? '✓' : '✗'}`)
  console.log(`  service_role lee los cuatro    : ${servicio ? '✓' : '✗'}`)
  const ok = cerrado && sigueAbierto && servicio
  console.log(ok ? `\n✓ ${MARCA}: el espejo de GN sale del navegador.` : `\n✗ ${MARCA}: mirá el detalle de arriba.`)
  console.log(`\nFalta lo que no se puede ver desde acá: con la anon key, que \`inventario?select=sku\``)
  console.log(`y \`ventas_por_mes?select=mes\` den 401 y \`productos?select=id\` siga en 200; y en el`)
  console.log(`Monitor con el IndexedDB borrado, que ABRA, que Ventas mensuales tenga los 27 meses,`)
  console.log(`que Talles/Colores/Proveedores conserven el rango largo, y que Reposición, Exhibición`)
  console.log(`y Ubicaciones traigan stock.\n`)
  if (!ok) process.exitCode = 1
} catch (e) {
  await client.query('ROLLBACK').catch(() => {})
  console.log(`✗ ${MARCA}: ${e.message}`)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}
