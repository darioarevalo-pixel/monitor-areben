/**
 * Los borradores de descripción, escritos POR UNA SESIÓN.
 *
 * 🔴 **La dinámica la fijó Bruno**: los párrafos los escribe la sesión mirando las fotos, ⛔ no un
 * botón. El motivo ⛔ no es la plata —los 277 pendientes con el modelo por defecto son US$0,80 en
 * total—: es que la sesión **ve el ruedo**, cruza la ficha con la foto y puede decir «acá la ficha
 * miente». Lo que se pierde es que deja de ser un botón que aprieta el local; por eso este script
 * existe, para que la parte mecánica sea siempre la misma.
 *
 *   node scripts/desc-borradores.mjs listar [--marca zattia] [--cuantos 20] [--que mudos|borradores]
 *   node scripts/desc-borradores.mjs guardar --id 123 --parrafo "…" [--tip "…"] [--chivato escote=redondo>cuello alto]
 *
 * 🔑 **`guardar` corre el VALIDADOR REAL** —el mismo `validarParrafo`/`validarTip` que usa la
 * pantalla y que exige el botón de aprobar— y si algo no pasa, **⛔ no guarda y sale 1**. Un
 * borrador escrito por una sesión que no pasa el validador es un borrador que después nadie puede
 * aprobar: el problema se ve acá y no tres pantallas después.
 *
 * 🔑 Y **relee la fila después de escribir**: que el POST conteste 200 ⛔ no prueba que quedó
 * guardado el texto que se mandó.
 *
 * 🔴 **`guardar` AFIRMA que miraste las fotos.** Guarda `chivatos: []` cuando ⛔ no le pasás
 * ninguno, y en la pantalla eso se dibuja como **«revisado contra la foto: la ficha coincide»** —
 * que es distinto de una prenda que nadie miró. ⛔ No lo uses para arreglar una coma sin abrir las
 * fotos: estarías firmando una revisión que ⛔ no hiciste.
 *
 * ⛔ Este script NO publica. Escribir en la tienda es otro verbo, lo aprieta una persona mirando
 * el texto, y vive en la pantalla.
 */

import { authKv, leerEnv } from './lib/kv-auth.mjs'
import { validarParrafo, validarTip } from '../lib/tn-desc/formato.core.js'
import { bulletsDe, sinTela } from '../lib/tn-desc/atributos.core.js'
import { familiaDe } from '../lib/tn-desc/atributos.core.js'

const MONITOR = process.env.MONITOR_URL || 'https://monitorareben.vercel.app'
const AUDIT = 'https://bdi-catalogo.vercel.app/api/tiendanube-audit'

function arg(nombre, def = null) {
  const i = process.argv.indexOf(`--${nombre}`)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def
}
/** Todas las veces que aparece una bandera repetible (`--chivato` va una vez por aviso). */
function args(nombre) {
  const out = []
  process.argv.forEach((v, i) => { if (v === `--${nombre}` && process.argv[i + 1]) out.push(process.argv[i + 1]) })
  return out
}

const marca = arg('marca', 'zattia')
const headers = { ...authKv(leerEnv()), 'Content-Type': 'application/json' }

/** El catálogo de TiendaNube y la cola del monitor, juntos y por `tn_id`. */
async function traerTodo() {
  const [rAudit, rCola] = await Promise.all([
    fetch(`${AUDIT}?store=${marca}&variantes=1`),
    fetch(`${MONITOR}/api/datos?recurso=tn-desc&store=${marca}`, { headers }),
  ])
  if (!rAudit.ok) throw new Error(`el audit contestó ${rAudit.status}`)
  const audit = await rAudit.json()
  if (!rCola.ok) throw new Error(`la cola contestó ${rCola.status}: ${(await rCola.text()).slice(0, 160)}`)
  const cola = await rCola.json()
  if (!cola.ok) throw new Error(`la cola contestó ok:false — ${cola.error}`)

  const filas = Object.fromEntries((cola.filas || []).map((f) => [String(f.tn_id), f]))
  return { productos: audit.products || [], filas, atributos: cola.atributos || {} }
}

/**
 * Los valores de variante de un producto (colores y talles), aplanados.
 *
 * 🔴 Es la MISMA cuenta que hace `normalizar()` en la pantalla, y tiene que serlo: de acá sale la
 * lista de palabras que el párrafo ⛔ no puede nombrar. Si acá saliera distinto, el validador de
 * este script aprobaría un texto que el de la pantalla rechaza.
 */
function valoresDe(p) {
  const out = []
  for (const v of p.variantes || []) for (const val of v.valores || []) if (val) out.push(String(val))
  return [...new Set(out)]
}

/** La familia con la que se dibuja la ficha: la de TiendaNube gana sobre la elegida a mano. */
function familiaDeProducto(p, fila) {
  return familiaDe(p.categories || []) || (fila && fila.familia) || null
}

async function listar() {
  const { productos, filas, atributos } = await traerTodo()
  const que = arg('que', 'mudos')
  const cuantos = Number(arg('cuantos', 20))
  const salida = []
  // 🔴 El EMBUDO, que se imprime siempre. Una lista vacía sin esto se lee como «no hay nada que
  // hacer», y puede ser cualquiera de cuatro cosas distintas: que no queden mudos, que les falte
  // la categoría, que les falte la tela, o que YA tengan borrador esperando que alguien lo mire.
  const embudo = { publicados: 0, mudos: 0, conFicha: 0, conTela: 0, yaTienenBorrador: 0 }

  for (const p of productos) {
    if (!p.published) continue
    embudo.publicados++
    const fila = filas[String(p.id)]
    const ficha = atributos[String(p.id)] || {}
    const familia = familiaDeProducto(p, fila)
    const estado = fila && fila.estado
    const mudo = !p.has_desc || p.desc_length === 0
    if (mudo) embudo.mudos++
    if (que === 'mudos') {
      if (!mudo) continue
      // ⛔ Sin ficha o sin tela no se escribe: la tela decide los cuidados y sin ella no se
      // publica. Escribir el párrafo igual deja un texto que el botón después no va a dejar salir.
      if (!familia) continue
      embudo.conFicha++
      if (sinTela(ficha)) continue
      embudo.conTela++
      if (estado) { embudo.yaTienenBorrador++; continue }
    }
    if (que === 'borradores' && estado !== 'borrador') continue
    if (que === 'borradores' && !familia) continue
    salida.push({
      id: p.id,
      nombre: p.name,
      categorias: p.categories,
      fotos: (p.images || []).slice(0, 2),
      bullets: bulletsDe(familia, ficha).map((b) => `${b.etiqueta}: ${b.texto}`),
      variantes: valoresDe(p),
      insumo: (fila && fila.insumo) || '',
      dice_hoy: (p.desc || '').slice(0, 300),
      // 🔑 Con `--que borradores` va también el texto QUE HAY QUE REVISAR. Sin esto, revisar
      // obliga a abrir la pantalla producto por producto, que es justo la fricción que se está
      // sacando. `null` cuando todavía no hay borrador: es distinto de la cadena vacía.
      parrafo: (fila && fila.borrador && fila.borrador.parrafo) || null,
      tip: (fila && fila.borrador && fila.borrador.tip) || null,
      chivatos: (fila && fila.borrador && fila.borrador.chivatos) || [],
      ficha,
    })
    if (salida.length >= cuantos) break
  }
  console.log(JSON.stringify(salida, null, 1))
  if (que === 'mudos') {
    console.error(
      `\nEmbudo: ${embudo.publicados} publicados · ${embudo.mudos} sin una palabra · ` +
        `${embudo.conFicha} con categoría · ${embudo.conTela} con tela cargada · ` +
        `${embudo.yaTienenBorrador} YA tienen borrador esperando ⇒ ${salida.length} para escribir.`,
    )
  }
  console.error(`${salida.length} prendas. Mirá LAS DOS fotos de cada una antes de escribir.`)
}

/** `escote=redondo>cuello alto` → `{campo, dice, veo}`. */
function chivatoDe(txt) {
  const [campo, resto] = String(txt).split('=')
  const [dice, veo] = String(resto || '').split('>')
  return { campo: String(campo || '').trim().toLowerCase(), dice: String(dice || '').trim(), veo: String(veo || '').trim() }
}

async function guardar() {
  const id = arg('id')
  const parrafo = arg('parrafo')
  const tip = arg('tip', '')
  if (!id || !parrafo) {
    console.error('Faltan --id y --parrafo.')
    process.exit(1)
  }
  const { productos, filas, atributos } = await traerTodo()
  const p = productos.find((x) => String(x.id) === String(id))
  if (!p) {
    console.error(`No hay ningún producto ${id} en el catálogo de ${marca}.`)
    process.exit(1)
  }
  const ficha = atributos[String(id)] || {}
  const familia = familiaDeProducto(p, filas[String(id)])
  const bullets = bulletsDe(familia, ficha)

  // 🔴 EL VALIDADOR REAL, el mismo que exige el botón de aprobar. Si acá no pasa, no se guarda.
  const ctx = { variantes: valoresDe(p), nombre: p.name, bullets }
  const problemas = [...validarParrafo(parrafo, ctx), ...validarTip(tip, ctx)]
  if (problemas.length) {
    console.error(`⛔ ${p.name}: el validador lo rechaza, así que NO se guardó.`)
    for (const x of problemas) console.error(`   - ${x.campo}: ${x.motivo}`)
    process.exit(1)
  }

  const chivatos = args('chivato').map(chivatoDe).filter((c) => c.campo && c.veo)
  const cuerpo = { recurso: 'tn-desc', store: marca, tn_id: String(id), nombre: p.name, op: 'borrador', borrador: { parrafo, bullets, tip: String(tip).trim(), chivatos } }
  const r = await fetch(`${MONITOR}/api/datos?recurso=tn-desc`, { method: 'POST', headers, body: JSON.stringify(cuerpo) })
  const d = await r.json().catch(() => ({}))
  if (!r.ok || !d.ok) {
    console.error(`⛔ no se guardó: ${d.error || r.status}`)
    process.exit(1)
  }

  // 🔑 La relectura, por otro camino: un 200 no prueba que haya quedado el texto que se mandó.
  const rel = await fetch(`${MONITOR}/api/datos?recurso=tn-desc&store=${marca}`, { headers })
  const dr = await rel.json()
  const fila = (dr.filas || []).find((f) => String(f.tn_id) === String(id))
  const guardado = fila && fila.borrador && fila.borrador.parrafo
  if (guardado !== parrafo) {
    console.error(`⛔ se escribió pero la relectura NO coincide. Miralo en la pantalla.`)
    process.exit(1)
  }
  console.log(`✅ ${p.name}: borrador guardado y releído${chivatos.length ? ` · ${chivatos.length} chivato(s)` : ''}.`)
}

const verbo = process.argv[2]
if (verbo === 'listar') await listar()
else if (verbo === 'guardar') await guardar()
else {
  console.error('Verbos: listar | guardar. Ver el comentario de arriba del archivo.')
  process.exit(1)
}
