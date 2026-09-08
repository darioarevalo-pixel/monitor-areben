// **El mail de la recompra**: qué entró hace poco, se está vendiendo y se termina esta semana.
//
//   node scripts/estrellas-prm.mjs                # manda el mail
//   node scripts/estrellas-prm.mjs --simulacro    # lo imprime y ⛔ NO lo manda
//   node scripts/estrellas-prm.mjs --dias 15      # otra ventana de ingreso
//
// ⛔ SÓLO LEE. Lo único que escribe es el mail.
//
// 🔑 **⛔ No reimplementa nada.** Llama `movimiento()` de `api/_prm.js` —la misma función que sirve
// la ficha, con su recruce contra el espejo y su paginación— y le pasa el resultado a
// `estrellas()`, el mismo núcleo que dibuja la tabla. Si el mail tuviera su propia cuenta, diría
// otra cosa que la pantalla y quien abriera las dos ⛔ no sabría a cuál creerle.
//
// 🔑 **Sólo se miran los proveedores con una orden en la ventana.** Sin una llegada reciente ⛔ no
// puede haber un producto nuevo, así que preguntarle al resto es un viaje a la base por nada:
// medido el 8-sep-2026, son **16 de 34** en 30 días.
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { movimiento } from '../api/_prm.js'
import { estrellas, paraAvisar, VENTANAS_ESTRELLAS } from '../lib/prm/estrellas.core.js'
import { armarMail } from '../lib/prm/mail-estrellas.core.js'
import { mandarMail } from './lib/mail.mjs'

// En Actions las variables vienen del entorno; en la Mac, del `.env`. ⛔ El `.env` ⛔ no pisa lo que
// ya está puesto: en el workflow manda el Secret.
try {
  for (const l of readFileSync('.env', 'utf8').split('\n')) {
    if (!l.includes('=') || l.trim().startsWith('#')) continue
    const i = l.indexOf('=')
    const k = l.slice(0, i).trim()
    if (!process.env[k]) process.env[k] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
} catch {
  // Sin `.env` ⛔ no pasa nada: es el caso normal en Actions.
}

const args = process.argv.slice(2)
const SIMULACRO = args.includes('--simulacro') || process.env.ENTRADA_SIMULACRO === 'true'
const pedidos = Number(args[args.indexOf('--dias') + 1] || process.env.ENTRADA_DIAS)
const VENTANA = Number.isFinite(pedidos) && pedidos > 0 ? pedidos : VENTANAS_ESTRELLAS[1]

/**
 * A quién le llega. Es la sección de UNA persona (la que compra), así que el default es su casilla
 * y ⛔ no hay tabla de suscriptores que mantener. `MAIL_ESTRELLAS_A` lo pisa el día que sean dos.
 */
const MAIL_A = process.env.MAIL_ESTRELLAS_A || process.env.MAIL_HALLAZGOS_A || 'brunoarevalo@arebensrl.com'

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY)
const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
const desde = new Date(Date.now() - VENTANA * 24 * 60 * 60 * 1000).toISOString()

console.log(`Estrellas del PRM · hoy ${hoy} · ventana de ingreso ${VENTANA} días${SIMULACRO ? ' · SIMULACRO' : ''}`)

// ── Quién recibió algo en la ventana ─────────────────────────────────────────────────────────
const { data: ocs, error: eOcs } = await sb
  .from('recepcion_oc')
  .select('proveedor_id')
  .gte('confirmada_at', desde)
  .not('proveedor_id', 'is', null)
if (eOcs) {
  console.error(`No se pudieron leer las órdenes de la ventana: ${eOcs.message}`)
  process.exit(1)
}
const conOrden = [...new Set((ocs || []).map((o) => o.proveedor_id))]
console.log(`${conOrden.length} proveedor(es) con órdenes en la ventana.`)
if (!conOrden.length) {
  console.log('Mail: nadie recibió nada, así que ⛔ no hay producto nuevo del que avisar.')
  process.exit(0)
}

const { data: locales, error: eLoc } = await sb
  .from('proveedor_local')
  .select('id, nombre, proveedor_id_ingresos')
  .in('proveedor_id_ingresos', conOrden)
if (eLoc) {
  console.error(`No se pudo leer el padrón: ${eLoc.message}`)
  process.exit(1)
}

// ── Uno por uno, con la misma función que sirve la ficha ─────────────────────────────────────
const proveedores = []
const mudas = new Set()
const stockAlDe = []
let mirados = 0
for (const local of locales || []) {
  let mov
  try {
    // 🔑 La ventana de VENTAS es más ancha que la de ingreso a propósito: un producto que llegó
    // hace 30 días necesita sus 30 días de ventas, y el margen deja ver lo vendido ANTES de llegar,
    // que es lo que prueba que el producto ⛔ no es sólo suyo.
    mov = await movimiento(sb, local, Math.max(90, VENTANA * 2))
  } catch (e) {
    console.log(`  ⚠️  ${local.nombre}: ${e instanceof Error ? e.message : e}`)
    continue
  }
  if (mov.sinEnganche || !mov.productos || !mov.productos.length) continue
  mirados += 1
  for (const m of mov.marcasMudas || []) mudas.add(m)
  for (const s of mov.stockAl || []) stockAlDe.push(s.cuando)
  const stock = new Map((mov.stockPorProducto || []).map((s) => [`${s.store}:${s.producto_id}`, s.unidades]))
  const e = estrellas(mov.productos, mov.ventas, hoy, {
    dias: VENTANA,
    // 🔴 Con el inventario mudo ⛔ no se pasa un mapa a medias: el mail dice «no se pudo leer» en
    // vez de dibujar ceros que mandan a comprar de más.
    stock: (mov.stockMudo || []).length ? null : stock,
  })
  const avisan = e.filas.filter((f) => paraAvisar(f))
  console.log(
    `  ${local.nombre}: ${e.filas.length} nuevo(s) · ${e.repuestos} repuesto(s) · ${avisan.length} para avisar`,
  )
  if (!avisan.length) continue
  // La marca sale de las órdenes, igual que en la sección: `esDeLaMarca` mide, ⛔ no tilda.
  const marca = avisan[0].store
  proveedores.push({ nombre: local.nombre, marca, filas: avisan })
}

console.log(`\n${mirados} proveedor(es) mirados.`)
// 🔴 Una marca muda ⛔ no es «no vendió»: se dice fuerte, porque un mail corto por una credencial
// caída se lee igual que una semana sin nada que recomprar.
if (mudas.size) console.log(`⚠️  Marcas que ⛔ NO contestaron: ${[...mudas].join(', ')}. Lo de abajo está incompleto.`)

/**
 * Cuándo se sincronizó el espejo de stock. 🔑 **La MÁS VIEJA de las marcas**: es la que limita lo
 * que el mail puede afirmar, y decir la más nueva sería decir que todo está más fresco de lo que
 * está. En la zona de Argentina y explícita: `updated_at` es UTC y formatearlo con el reloj del
 * runner de GitHub —que corre en UTC— lo correría tres horas.
 */
const cuandoElStock = stockAlDe.sort()[0]
const stockAl = cuandoElStock
  ? new Date(cuandoElStock).toLocaleString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      day: 'numeric',
      month: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  : null

const mail = armarMail(proveedores, VENTANA, stockAl)
if (!mail) {
  // ⛔ No se manda un mail para decir que no hay nada: ver el 🔑 del núcleo. El log sí lo dice,
  // porque acá la pregunta «¿corrió y no encontró nada, o no corrió?» tiene que tener respuesta.
  console.log('Mail: ningún producto llegó al umbral, así que ⛔ no se manda nada.')
  process.exit(0)
}

if (SIMULACRO) {
  console.log(`\nMail [SIMULACRO, ⛔ no se manda] → ${MAIL_A}\n  ${mail.asunto}\n`)
  console.log(mail.texto.split('\n').map((l) => `  | ${l}`).join('\n'))
  process.exit(0)
}

const r = await mandarMail({ para: MAIL_A, asunto: mail.asunto, texto: mail.texto, html: mail.html })
if (r.ok) {
  console.log(`\nMail enviado a ${MAIL_A}: «${mail.asunto}» (${r.id})`)
  process.exit(0)
}
if (!r.configurado) {
  // ⛔ Ausente ⛔ NO es roto: sin las credenciales esto todavía no está prendido, y tumbar la corrida
  // por eso sería romper lo que sí anda. Se dice fuerte y se sale en verde.
  console.log(`\n⚠️  Mail SIN ENVIAR: faltan las credenciales de SES. Había para enviar: «${mail.asunto}».`)
  console.log('    Se prende con AWS_ACCESS_KEY_ID y AWS_SECRET_ACCESS_KEY en Secrets → Actions (las mismas de areben-mailer).')
  process.exit(0)
}
// Con la key puesta, un envío que falla SÍ tiñe el workflow: alguien pidió el mail y no llegó.
console.error(`\n❌ El mail ⛔ no salió: ${r.motivo}`)
process.exit(1)
