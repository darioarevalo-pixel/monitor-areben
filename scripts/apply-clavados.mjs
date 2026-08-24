// Aplica sql/migrate-clavados.sql a las bases de BDI y de Zattia.
// Uso: node scripts/apply-clavados.mjs
//
// ⚠️ VA A LAS DOS BASES: `producto_id` es de la base de su marca (el 1234 de BDI y el 1234 de
// Zattia son dos productos distintos). Mismo criterio que `apply-pedidos-clientes.mjs`.
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

const sql = readFileSync('sql/migrate-clavados.sql', 'utf8')

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

const targets = [
  ['BDI', env.DATABASE_URL_BDI],
  ['ZATTIA', env.DATABASE_URL_ZATTIA],
].filter(([, url]) => url)

if (targets.length < 2) {
  console.error('Faltan DATABASE_URL_BDI y/o DATABASE_URL_ZATTIA en .env — esta tabla va en las DOS.')
  process.exit(1)
}

let algoAbierto = false

for (const [nombre, url] of targets) {
  const cfg = parse(url)
  const client = new pg.Client({ ...cfg, ssl: { rejectUnauthorized: false } })
  try {
    await client.connect()
    await client.query('BEGIN')
    await client.query(sql)
    await client.query('COMMIT')

    const filas = await client.query('select count(*)::int as n from clavados')

    // 🔴 Los candados se EJERCEN, no se suponen. Un `check` que no llegó a aplicarse no se nota
    // hasta que alguien escribe la fila que tenía que rechazar — y acá esa fila no falla ni se ve:
    // se guarda con un `tipo` que no es ninguno de los dos y **desaparece de los dos cortes del
    // ranking en silencio**. Se prueban en transacciones que se deshacen.
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

    const base = `insert into clavados (id, store, producto_id`

    // El check de `store`: un valor inventado no falla ni se ve, se guarda y esa fila desaparece
    // de la lista de las dos marcas en silencio.
    const storeOk = await sonda(`${base}) values ('__sonda__', 'inventado', 1)`)

    // 🔴 El único PARCIAL es la regla más fácil de romper al escribirla, y la que más caro sale: si
    // fuera total, un producto que se cerró no se podría volver a marcar nunca; si no existiera,
    // dos marcas activas del mismo producto contarían su recupero dos veces. Se ejerce en los dos
    // sentidos, porque acá una sola punta no mide nada.
    const dosActivosNo = await sonda(
      `${base}) values ('__s1__', 'bdi', 9999999), ('__s2__', 'bdi', 9999999)`)
    const cerradoMasActivoSi = !(await sonda(
      `${base}, visto_en_cero) values ('__s1__', 'bdi', 9999999, now()), ('__s2__', 'bdi', 9999999, null)`))

    // ⚠️ El espejo POSITIVO: una tabla que rechazara todo —un permiso mal dado, un trigger de más—
    // daría los ✓ de arriba y el script diría que está perfecta. Toda negación necesita su punta
    // positiva o no mide nada.
    const filaSanaEntra = !(await sonda(
      `${base}, sku, nombre) values ('__sonda__', 'bdi', 9999999, 'ABC-1', 'Vestido rojo')`))

    const rls = await client.query(
      `select relrowsecurity,
              has_table_privilege('anon', 'public.clavados', 'SELECT') as anon_lee,
              has_table_privilege('anon', 'public.clavados', 'INSERT') as anon_escribe
         from pg_class where relname = 'clavados'`,
    )
    const r = rls.rows[0] || {}

    const bien = storeOk && dosActivosNo && cerradoMasActivoSi && filaSanaEntra && r.relrowsecurity && !r.anon_escribe
    console.log(`\n✓ ${nombre} (${cfg.host}): clavados lista — ${filas.rows[0].n} filas`)
    console.log(`  ${storeOk ? '✓' : '✗'} check de store ${storeOk ? 'rechaza' : 'DEJA PASAR'} un valor inventado`)
    console.log(`  ${dosActivosNo ? '✓' : '✗'} dos marcas ACTIVAS del mismo producto ${dosActivosNo ? 'se rechazan' : 'ENTRAN (contarían dos veces)'}`)
    console.log(`  ${cerradoMasActivoSi ? '✓' : '✗'} una cerrada + una activa ${cerradoMasActivoSi ? 'entran' : 'NO ENTRAN (el único es total: se pierde el historial)'}`)
    console.log(`  ${filaSanaEntra ? '✓' : '✗'} y una fila SANA ${filaSanaEntra ? 'entra' : 'NO ENTRA (los ✓ de arriba no valen)'}`)
    console.log(`  ${r.relrowsecurity ? '✓' : '✗'} RLS ${r.relrowsecurity ? 'prendido' : 'APAGADO'} · anon lee: ${r.anon_lee} · anon escribe: ${r.anon_escribe}`)
    if (!bien) algoAbierto = true
  } catch (e) {
    console.log(`\n✗ ${nombre}: ${e.message}`)
    await client.query('ROLLBACK').catch(() => {})
    algoAbierto = true
  } finally {
    await client.end().catch(() => {})
  }
}

if (algoAbierto) {
  console.log('\n⚠ Algo quedó abierto o falló. Mirá las líneas con ✗ antes de usar la sección.')
  process.exitCode = 1
} else {
  console.log('\nListo, en las dos bases.')
}
