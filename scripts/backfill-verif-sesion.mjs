// Marca como PREPARADOS los ítems de una solicitud que ya se separó físicamente.
//
// POR QUÉ EXISTE
// --------------
// Hasta el 21-sep-2026 el escáner del borrador («¿Ya los separaste? Escaneálos») tiraba el dato del
// escaneo: `procesarDraft` armaba los `items` y ⛔ nunca escribía `verif`, que es lo que dibuja el
// tilde y lo que decide qué sale en la venta de Gestión Nube. Administración escaneó 140 prendas ya
// separadas y la solicitud salió con los 140 renglones en `0/1`. El código ya está arreglado, pero
// las solicitudes que nacieron antes quedan sin tilde, y ⛔ **no hay forma de marcarlas en la
// pantalla sin volver a escanear una por una**: los −/+ del detalle son sólo para los ítems «a mano».
//
// 🔴 ESTO AFIRMA UN HECHO FÍSICO. Escribir `verif` es decir «esta mercadería está separada», y de
// ahí sale la venta de GN y lo que la devolución espera de vuelta. Se corre sólo sobre una
// solicitud cuyo responsable confirmó que salió entera del escáner.
//
// Uso:
//   node scripts/backfill-verif-sesion.mjs --store zattia --id s1789991477589_17455        # dry-run
//   node scripts/backfill-verif-sesion.mjs --store zattia --id s179... --id s178... --aplicar
//
// Con `--origen-por-stock` además corrige el depósito/local de cada ítem contra el stock del
// sistema, y SÓLO cuando el stock lo ubica de un solo lado (si alcanza en los dos, la elección de
// quien armó la solicitud es el único dato que hay).
//
// Lee por el API de PRODUCCIÓN (⛔ no por Supabase directo) para pasar por los mismos permisos y el
// mismo handler que la pantalla. Necesita `MONITOR_PASS` en el `.env`.
//
// ⛔ NO siembra en la Agenda: `idsNuevos` de `api/_solicitudes.js` pregunta ANTES de la upsert y
// estas solicitudes ya existen, así que `nuevas` queda vacío y los nueve pasos no se repiten.
import { readFileSync } from 'fs'

const BASE = 'https://monitorareben.vercel.app'
const USUARIO = 'Bruno Arevalo'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    }),
)

const args = process.argv.slice(2)
const store = args[args.indexOf('--store') + 1] || 'zattia'
const ids = args.map((a, n) => (a === '--id' ? args[n + 1] : null)).filter(Boolean)
const aplicar = args.includes('--aplicar')
const porStock = args.includes('--origen-por-stock')

if (!ids.length) {
  console.error('Falta al menos un --id. Uso: --store zattia --id s1789991477589_17455 [--aplicar]')
  process.exit(1)
}
if (!env.MONITOR_PASS) {
  console.error('Falta MONITOR_PASS en el .env.')
  process.exit(1)
}

const auth = Buffer.from(JSON.stringify({ user: USUARIO, pass: env.MONITOR_PASS })).toString('base64')
const cabeceras = { 'x-monitor-auth': auth, 'Content-Type': 'application/json' }

async function leerTodas() {
  const r = await fetch(`${BASE}/api/postventa?recurso=solicitudes&store=${store}&kind=sesionfotos&limit=2000`, {
    headers: { 'x-monitor-auth': auth },
  })
  if (!r.ok) throw new Error(`GET ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const j = await r.json()
  return j.list || []
}

/**
 * Cada ítem movido al lado donde el sistema dice que está la mercadería.
 *
 * 🔴 **Sólo cuando el stock lo ubica de un solo lado.** Si alcanza en los dos, el sistema ⛔ no
 * puede saberlo y la elección de quien armó la solicitud es el único dato que hay: no se toca.
 * Si no alcanza en ninguno, tampoco — ahí el origen lo puso una persona que tenía la prenda en la
 * mano y el sistema es el que está desactualizado.
 *
 * El `vid` ⛔ no cambia, así que `verif`, `devuelto`, `fotos` y las bolsas siguen enganchadas.
 */
function origenPorStock(s) {
  const cambios = []
  const items = (s.items || []).map((i) => {
    if (i.nuevo || i.manual) return i
    const q = Math.max(1, Number(i.qty) || 1)
    const dep = (Number(i.stockDep) || 0) >= q
    const loc = (Number(i.stockLoc) || 0) >= q
    if (dep === loc) return i // en los dos, o en ninguno: ⛔ no se decide solo
    const donde = dep ? 'deposito' : 'local'
    if (i.origen === donde) return i
    cambios.push(`${i.nombre} · ${i.variante}: ${i.origen} → ${donde}`)
    return { ...i, origen: donde }
  })
  return { sol: { ...s, items }, cambios }
}

/**
 * La solicitud con todos sus ítems preparados.
 *
 * ⚠️ `verif` se arma DESDE CERO con lo pedido, ⛔ no sumando sobre lo que hubiera: si alguien ya
 * escaneó una parte, el número correcto sigue siendo `qty` (es «está todo separado»), y sumar
 * duplicaría. El tope es `qty` porque preparado nunca puede ser más que lo pedido.
 */
function preparada(s) {
  const verif = {}
  for (const i of s.items || []) verif[i.vid] = Math.max(1, Number(i.qty) || 1)
  return { ...s, verif, estado: 'preparada' }
}

const todas = await leerTodas()
let escribi = 0

for (const id of ids) {
  const s = todas.find((x) => x.id === id)
  if (!s) {
    console.error(`❌ ${id}: no está en ${store}/sesionfotos.`)
    continue
  }
  const items = (s.items || []).length
  const antes = Object.keys(s.verif || {}).length
  console.log(`\n${id} · ${s.fecha} · "${s.descripcion || '(sin descripción)'}" · ${s.creadoPor}`)
  console.log(`   ítems: ${items} · con tilde hoy: ${antes} · estado: ${s.estado}`)
  const manuales = (s.items || []).filter((i) => i.manual).length
  const nuevos = (s.items || []).filter((i) => i.nuevo && !i.manual).length
  if (manuales || nuevos) console.log(`   ⚠️ de esos, "a mano": ${manuales} · sin producto en GN: ${nuevos}`)

  /*
    🔴 **Una solicitud que ya SALIÓ ⛔ no se toca, ni en dry-run.** Con la venta de Gestión Nube
    creada, `verif` ya ⛔ no es una anotación: es lo que esa venta descontó y lo que la devolución
    espera de vuelta. Subirlo después deja la solicitud pidiendo de vuelta unidades que nunca
    salieron, y el estado volvería para atrás sobre un hecho que ya ocurrió.
    Pasó el 21-sep: mientras se preparaba este backfill, la sesión del 21.09 pasó a `cargada` con 8
    de 12 escaneados — alguien la estaba trabajando en ese momento.
  */
  const salio = !!s.ventas && Object.keys(s.ventas).length > 0
  if (salio || ['cargada', 'retirada', 'devuelta', 'cerrada'].includes(String(s.estado))) {
    console.error(`   ⛔ SE SALTEA: ya salió (estado ${s.estado}${salio ? ', con venta GN' : ''}). Esto se marca escaneando, ⛔ no acá.`)
    continue
  }

  if (porStock) {
    const { cambios } = origenPorStock(s)
    console.log(`   origen contra el stock: ${cambios.length} de ${items}`)
    for (const c of cambios.slice(0, 5)) console.log(`      · ${c}`)
    if (cambios.length > 5) console.log(`      · … y ${cambios.length - 5} más`)
  }

  if (!aplicar) {
    console.log(`   [dry-run] quedaría: con tilde ${items} · estado preparada`)
    continue
  }

  const { sol: conOrigen } = porStock ? origenPorStock(s) : { sol: s }
  const r = await fetch(`${BASE}/api/postventa?recurso=solicitudes`, {
    method: 'POST',
    headers: cabeceras,
    body: JSON.stringify({ store, kind: 'sesionfotos', solicitud: preparada(conOrigen) }),
  })
  if (!r.ok) {
    console.error(`   ❌ POST ${r.status}: ${(await r.text()).slice(0, 200)}`)
    continue
  }
  escribi++
  console.log('   ✔ guardada')
}

// 🔑 Se vuelve a LEER y se cuenta: el 200 del POST dice que la fila se escribió, ⛔ no que el
// documento quedó como se quería.
if (aplicar && escribi) {
  const despues = await leerTodas()
  console.log('\n— verificación, releyendo —')
  for (const id of ids) {
    const s = despues.find((x) => x.id === id)
    if (!s) {
      console.error(`   ❌ ${id}: desapareció.`)
      continue
    }
    const items = (s.items || []).length
    const con = Object.keys(s.verif || {}).length
    const completos = (s.items || []).filter((i) => (s.verif || {})[i.vid] >= i.qty).length
    const ok = con === items && completos === items && s.estado === 'preparada'
    const contra = (s.items || []).filter((i) => {
      const q = Math.max(1, Number(i.qty) || 1)
      const dep = (Number(i.stockDep) || 0) >= q
      const loc = (Number(i.stockLoc) || 0) >= q
      return dep !== loc && i.origen !== (dep ? 'deposito' : 'local')
    }).length
    const porOrigen = (o) => (s.items || []).filter((i) => i.origen === o).length
    console.log(`   ${ok ? '✔' : '❌'} ${id}: con tilde ${con}/${items} · completos ${completos}/${items} · estado ${s.estado}`)
    console.log(`      depósito ${porOrigen('deposito')} · local ${porOrigen('local')} · contra el stock ${contra}`)
  }
}

if (!aplicar) console.log('\n(dry-run: no se escribió nada. Agregá --aplicar para guardar.)')
