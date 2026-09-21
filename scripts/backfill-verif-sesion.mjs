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

  if (!aplicar) {
    console.log(`   [dry-run] quedaría: con tilde ${items} · estado preparada`)
    continue
  }

  const r = await fetch(`${BASE}/api/postventa?recurso=solicitudes`, {
    method: 'POST',
    headers: cabeceras,
    body: JSON.stringify({ store, kind: 'sesionfotos', solicitud: preparada(s) }),
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
    console.log(`   ${ok ? '✔' : '❌'} ${id}: con tilde ${con}/${items} · completos ${completos}/${items} · estado ${s.estado}`)
  }
}

if (!aplicar) console.log('\n(dry-run: no se escribió nada. Agregá --aplicar para guardar.)')
