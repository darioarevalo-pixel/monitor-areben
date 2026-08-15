// Reconstruye la IDA de los precios que ya están puestos, para las campañas anteriores a la bitácora.
//
// Uso:
//   node scripts/backfill-liquidacion-bitacora.mjs             ← simulación (no escribe nada)
//   node scripts/backfill-liquidacion-bitacora.mjs --aplicar   ← escribe
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// 🔴 POR QUÉ ESTO TIENE APURO
//
// El ítem es la única memoria de que un precio estuvo puesto, y la pierde al sacarlo: `aplicar` en
// modo `sacar` deja `aplicadoEn` y `precioEscrito` en `null` (api/_liquidacion.js). Es correcto
// —`aplicado` quiere decir "está puesto AHORA"— pero el día que se levante el sale, la ida de esos
// productos deja de existir en cualquier lado. Con el WINTER SALE eso son ~260 productos.
//
// ⇒ Correr esto ANTES de levantar un sale. Después no hay nada que reconstruir.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// QUÉ ENTRA Y QUÉ NO
//
// Sólo los ítems en `aplicado` **con `aplicadoEn`**: son los únicos de los que consta que se les
// escribió el precio en Gestión Nube y cuándo. Nada de reconstruir vueltas: un producto que ya
// volvió a lista perdió la fecha, y anotar la vuelta con la de hoy sería inventar el dato que
// justamente se quería tener.
//
// La fila se arma con `filaBitacora`, el MISMO código que usa el handler. Si acá se armara distinto,
// la campaña de agosto quedaría anotada con otra forma que la de septiembre y las dos mitades de la
// bitácora no se podrían leer juntas.
//
// Idempotente: el índice único `(store, liq_id, pid, modo, cuando)` + `on conflict do nothing`.
// Como `cuando` es el `aplicadoEn` original —y no el momento de correr el script—, re-correrlo no
// duplica nada.
import { readFileSync } from 'fs'
import pg from 'pg'
import { filaBitacora } from '../lib/liquidacion/bitacora.core.js'

const APLICAR = process.argv.includes('--aplicar')

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    }),
)

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
  ['bdi', 'BDI', env.DATABASE_URL_BDI],
  ['zattia', 'ZATTIA', env.DATABASE_URL_ZATTIA],
].filter(([, , url]) => url)

if (!targets.length) {
  console.error('Falta DATABASE_URL_BDI y/o DATABASE_URL_ZATTIA en .env')
  process.exit(1)
}

console.log(APLICAR ? '⚠️  MODO ESCRITURA\n' : '🔍 SIMULACIÓN — no se escribe nada. Con --aplicar escribe.\n')

for (const [store, nombre, url] of targets) {
  const client = new pg.Client({ ...parse(url), ssl: { rejectUnauthorized: false } })
  try {
    await client.connect()

    const { rows } = await client.query(
      `select i.liq_id, i.pid, i.datos, c.nombre as liq_nombre
         from liquidacion_items i
         join liquidaciones c on c.store = i.store and c.id = i.liq_id
        where i.store = $1 and i.estado = 'aplicado'`,
      [store],
    )

    const filas = []
    const sinPrecio = []
    const sinFecha = []
    for (const r of rows) {
      const item = r.datos || {}
      const ap = item.aplicacion || {}
      if (!ap.aplicadoEn) { sinFecha.push(`${r.pid} ${(item.foto || {}).nombre || ''}`); continue }
      // `precioEscrito` es el número que se le mandó a GN. Los ítems anteriores a la tanda 3 no lo
      // traen: ahí el mejor dato disponible es el precio decidido, que es lo que se cargó a mano.
      const precioA = ap.precioEscrito != null ? Number(ap.precioEscrito) : Number((item.decision || {}).precioSale)
      if (!(precioA > 0)) { sinPrecio.push(`${r.pid} ${(item.foto || {}).nombre || ''}`); continue }
      filas.push(filaBitacora({
        store,
        liqId: r.liq_id,
        liqNombre: r.liq_nombre,
        item: { ...item, pid: r.pid },
        modo: 'poner',
        // La foto es el único "antes" que existe para un evento reconstruido: no hay bitácora previa
        // que consultar, que es exactamente el caso que `precioAnterior` resuelve con `null`.
        precioDe: (item.foto || {}).promoPrevia > 0 ? Number(item.foto.promoPrevia) : null,
        precioA,
        porQuien: (item.decision || {}).porQuien || null,
        cuando: new Date(Number(ap.aplicadoEn)).toISOString(),
      }))
    }

    let insertados = 0
    if (APLICAR) {
      for (const f of filas) {
        const r = await client.query(
          `insert into liquidacion_bitacora
             (store, liq_id, liq_nombre, pid, producto, sku, modo, precio_de, precio_a, precio_lista, por_quien, cuando)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           on conflict do nothing`,
          [f.store, f.liq_id, f.liq_nombre, f.pid, f.producto, f.sku, f.modo,
            f.precio_de, f.precio_a, f.precio_lista, f.por_quien, f.cuando],
        )
        insertados += r.rowCount
      }
    }

    const total = await client.query('select count(*)::int as n from liquidacion_bitacora where store = $1', [store])

    console.log(`${nombre}:`)
    console.log(`  ítems aplicados          ${String(rows.length).padStart(5)}`)
    console.log(`  eventos a reconstruir    ${String(filas.length).padStart(5)}`)
    if (APLICAR) console.log(`  insertados de verdad     ${String(insertados).padStart(5)}  (el resto ya estaba)`)
    console.log(`  en la bitácora ahora     ${String(total.rows[0].n).padStart(5)}`)
    // 🔑 Los que quedan afuera se NOMBRAN, no se cuentan: "3 no se pudieron" obliga a revisar los
    // 260 a mano para encontrar cuáles. Es la misma regla que el aplicador.
    for (const [rotulo, lista] of [['sin precio escrito ni decidido', sinPrecio], ['sin fecha de aplicación', sinFecha]]) {
      if (lista.length) console.log(`  ⚠️ ${lista.length} ${rotulo}: ${lista.join(' · ')}`)
    }
    console.log('')
  } catch (e) {
    console.log(`✗ ${nombre}: ${e.message}\n`)
    process.exitCode = 1
  } finally {
    await client.end().catch(() => {})
  }
}

console.log(APLICAR ? 'Listo.' : 'Simulación terminada. Con --aplicar se escribe.')
