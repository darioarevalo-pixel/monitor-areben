// ⚠️ ESTE SCRIPT ESCRIBE EN PRODUCCIÓN.
//
// Deja cargado el manual de una pantalla —el procedimiento de trabajo, no los pasos de la UI—
// **sin publicar**. Es el gemelo de `scripts/novedad.mjs` y existe por el mismo motivo: escribir el
// texto es lo caro, y que quede esperando un click es lo que hace que nada le aparezca al equipo
// sin que Bruno lo mire.
//
//   node scripts/manual.mjs "Título" cuerpo.md --seccion=envios [--dry] [--editar]
//   node scripts/manual.mjs --listar
//
// # Qué es un manual y qué NO
//
// El manual es **el procedimiento de trabajo** y vive en la base: cambia cuando cambia cómo
// trabaja el local, no cuando cambia el código. Los pasos DE la pantalla —los que se mueven con
// cada deploy— van en un `<Instructivo>` adentro del componente. Está escrito en
// `lib/manuales/tipos.ts` y es la frontera que hace que ninguno de los dos envejezca mintiendo.
//
// # Por qué postea al endpoint y no escribe en la tabla
//
// Igual que `novedad.mjs`: con `pg` sería más directo y esquivaría el handler, así que lo que el
// handler valide se saltearía y el problema aparecería recién cuando alguien le da Publicar.
// Posteando se ejerce el mismo camino que la pantalla, con el mismo permiso (`manuales.editar`).
//
// # 🔴 Por qué hay que LEER el manual que existe antes de pisarlo
//
// `manual-guardar` hace `upsert` con `publicado: !!m.publicado` (api/_sistema.js): un cuerpo sin
// ese campo escribe `false`. O sea que volver a correr este script sobre un manual **ya publicado
// lo despublicaría en silencio** — el botón "Cómo se usa" desaparecería de la pantalla y nadie
// tendría por qué enterarse. Lo mismo vale para `orden`. Por eso, cuando el manual ya existe:
//
//   · sin `--editar` el script **no escribe** y dice cuál es;
//   · con `--editar` lee la fila entera primero (`vista=manual&id=…`) y **conserva `publicado` y
//     `orden`** tal como estaban. Editar el texto no es una decisión sobre si se publica.
//
// El cuerpo va por ARCHIVO y no por argumento: es markdown con saltos de línea y comillas.
// ⛔ El markdown del repo NO tiene imágenes ni tablas (`lib/markdown/core.ts`): `## ### - 1.
// **negrita** _cursiva_ `código` [texto](url)` y nada más.
import { readFileSync } from 'node:fs'
import { authKv } from './lib/kv-auth.mjs'

const API = 'https://monitorareben.vercel.app/api/datos?recurso=sistema'

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const editar = args.includes('--editar')
const listar = args.includes('--listar')
const sueltos = args.filter((a) => !a.startsWith('--'))

/** `--seccion=envios` · ausente = manual suelto, sin pantalla (ej. "cerrar la caja"). */
function seccionDeArgs() {
  const arg = args.find((a) => a.startsWith('--seccion='))
  if (!arg) return null
  const v = arg.slice('--seccion='.length).trim()
  if (!v) {
    console.error('✗ --seccion vacía. Usá --seccion=envios, o no la pongas para un manual suelto.')
    process.exit(1)
  }
  return v
}

const headers = { 'Content-Type': 'application/json', ...authKv() }

/** El índice (id, seccion, titulo, publicado). Con `manuales.editar` vienen también los que no están publicados. */
async function indice() {
  const r = await fetch(API, { headers })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) {
    console.error(`✗ ${(d && d.error) || r.status}`)
    process.exit(1)
  }
  return d.manuales || []
}

if (listar) {
  const manuales = await indice()
  for (const m of manuales) {
    const estado = m.publicado ? '● publicado ' : '○ sin publicar'
    console.log(`${estado}  ${(m.seccion || '(suelto)').padEnd(16)} ${m.titulo}   (${m.id})`)
  }
  if (!manuales.length) console.log('(no hay ninguno todavía)')
  process.exit(0)
}

if (sueltos.length < 2) {
  console.error('Uso: node scripts/manual.mjs "Título" cuerpo.md --seccion=envios [--dry] [--editar]')
  process.exit(1)
}

const [titulo, archivo] = sueltos
const seccion = seccionDeArgs()
let cuerpo
try {
  cuerpo = readFileSync(archivo, 'utf8')
} catch {
  console.error(`No pude leer ${archivo}.`)
  process.exit(1)
}

// El índice único parcial de la base deja UN manual por sección. El chequeo va acá igual —el
// handler contesta 409— porque desde acá se puede decir CUÁL es el que ya está y con qué flag se
// edita, y sobre todo porque un manual suelto (sin sección) no lo protege ningún índice.
const yaEstan = await indice()
const existente = seccion
  ? yaEstan.find((m) => m.seccion === seccion)
  : yaEstan.find((m) => !m.seccion && m.titulo === titulo)

if (existente && !editar) {
  console.error(`✗ Ya hay un manual para ${seccion ? `"${seccion}"` : 'ese título'}: "${existente.titulo}" (${existente.id}), ${existente.publicado ? 'PUBLICADO' : 'sin publicar'}.`)
  console.error('  Para reemplazar su texto, volvé a correrlo con --editar. Se conserva si está publicado o no.')
  process.exit(1)
}

// 🔴 Leer la fila entera antes de pisarla: el upsert escribe `publicado` y `orden` con lo que le
// mandemos, así que lo que no se relee se pierde. Un manual publicado que se despublica solo es
// justo el modo de falla que nadie mira.
let publicado = false
let orden = 0
if (existente) {
  const r = await fetch(`${API}&vista=manual&id=${encodeURIComponent(existente.id)}`, { headers })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) {
    console.error(`✗ no pude leer el manual que iba a editar: ${(d && d.error) || r.status}`)
    process.exit(1)
  }
  publicado = !!d.manual.publicado
  orden = Number(d.manual.orden) || 0
}

const manual = {
  id: existente ? existente.id : `m${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  ...(seccion ? { seccion } : {}),
  titulo,
  cuerpo,
  orden,
  publicado,
}

if (dry) {
  console.log(JSON.stringify({ action: 'manual-guardar', manual }, null, 2))
  console.log(`\n(--dry: no se mandó nada · ${cuerpo.length} caracteres de cuerpo)`)
  process.exit(0)
}

// ⚠️ El `Content-Type: application/json` no es opcional: sin él Vercel no parsea el cuerpo y el
// handler contesta por el primer campo que le falta, señalando a quien llama.
const r = await fetch(API, {
  method: 'POST',
  headers,
  body: JSON.stringify({ recurso: 'sistema', action: 'manual-guardar', manual }),
})
const d = await r.json().catch(() => null)
if (!r.ok || !d?.ok) {
  console.error(`✗ ${(d && d.error) || r.status}`)
  process.exit(1)
}

if (existente) {
  console.log(`✓ Reemplazado el texto de "${titulo}" (${manual.id}) · sigue ${publicado ? 'PUBLICADO' : 'sin publicar'}.`)
} else {
  console.log(`✓ Cargado SIN PUBLICAR: ${manual.id}${seccion ? ` (pantalla "${seccion}")` : ''}`)
  console.log('  Se ve en /manuales. El botón "Cómo se usa" de esa pantalla aparece recién cuando le des Publicar.')
}
