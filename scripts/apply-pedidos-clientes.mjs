// Aplica sql/migrate-pedidos-clientes.sql a las bases de BDI y de Zattia.
// Uso: node scripts/apply-pedidos-clientes.mjs
//
// ⚠️ VA A LAS DOS BASES, al revés que `apply-buzon.mjs`. Lo que se decide con esta tabla es qué
// compra cada marca —dos plata distintas y dos compradores distintos—, así que cada una tiene la
// suya. Mismo criterio que `apply-atencion.mjs`.
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

const sql = readFileSync('sql/migrate-pedidos-clientes.sql', 'utf8')

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

    const filas = await client.query('select count(*)::int as n from pedidos_clientes')

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

    const base = `insert into pedidos_clientes (id, store, texto`
    const tipoOk = await sonda(`${base}, tipo) values ('__sonda__', 'bdi', 'sonda', 'inventado')`)
    const estadoOk = await sonda(`${base}, estado) values ('__sonda__', 'bdi', 'sonda', 'inventado')`)
    const canalOk = await sonda(`${base}, canal) values ('__sonda__', 'bdi', 'sonda', 'inventado')`)
    const textoOk = await sonda(`${base}) values ('__sonda__', 'bdi', '   ')`)

    // ⚠️ El espejo POSITIVO de las cuatro sondas de arriba. Sin él, una tabla que rechazara todo
    // —un permiso mal dado, un trigger de más— daría los cuatro ✓ y el script diría que está
    // perfecta: toda negación necesita su punta positiva o no mide nada.
    const filaSanaEntra = !(await sonda(`${base}, tipo, estado, canal) values ('__sonda__', 'bdi', 'clear case iphone 15', 'no_trabajamos', 'pedido', 'local')`))

    const rls = await client.query(
      `select relrowsecurity,
              has_table_privilege('anon', 'public.pedidos_clientes', 'SELECT') as anon_lee,
              has_table_privilege('anon', 'public.pedidos_clientes', 'INSERT') as anon_escribe
         from pg_class where relname = 'pedidos_clientes'`,
    )
    const r = rls.rows[0] || {}

    const bien = tipoOk && estadoOk && canalOk && textoOk && filaSanaEntra && r.relrowsecurity && !r.anon_escribe
    console.log(`\n✓ ${nombre} (${cfg.host}): pedidos_clientes lista — ${filas.rows[0].n} filas`)
    console.log(`  ${tipoOk ? '✓' : '✗'} check de tipo ${tipoOk ? 'rechaza' : 'DEJA PASAR'} un valor inventado`)
    console.log(`  ${estadoOk ? '✓' : '✗'} check de estado ${estadoOk ? 'rechaza' : 'DEJA PASAR'} un valor inventado`)
    console.log(`  ${canalOk ? '✓' : '✗'} check de canal ${canalOk ? 'rechaza' : 'DEJA PASAR'} un valor inventado`)
    console.log(`  ${textoOk ? '✓' : '✗'} check de texto ${textoOk ? 'rechaza' : 'DEJA PASA'} un pedido en blanco`)
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
