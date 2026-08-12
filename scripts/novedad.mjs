// ⚠️ ESTE SCRIPT ESCRIBE EN PRODUCCIÓN.
//
// Deja una novedad cargada en el monitor **como borrador**. Es la pieza que hace que las novedades
// no dependan de que alguien se acuerde: yo la escribo al terminar un cambio, Bruno la publica de
// un click cuando la mira.
//
//   node scripts/novedad.mjs "Título" cuerpo.md [--importante] [--dry] [--destino=…] [--marca=…]
//   node scripts/novedad.mjs --listar
//
// # A quién le llega (--destino)
//
// Por defecto, a todos. Las otras dos formas evitan el ruido de mandarle a todo el mundo algo de
// una pantalla que la mitad no abre, y sobre todo evitan que un cambio grande se cuente UNA sola
// vez para dos equipos que hacen cosas distintas con él:
//
//   --destino=seccion:canjes        → a quien puede VER esa pantalla (los destinatarios salen de
//                                     los permisos que ya existen, así que se ajusta solo).
//   --destino=roles:local,deposito  → a quien tenga alguna de esas funciones.
//
// # De qué marca (--marca)
//
// Es un filtro APARTE, que se combina con el de arriba y que ausente significa las dos:
//
//   --destino=roles:local --marca=zattia   → al local de Zattia, y NO al de BDI.
//   --marca=bdi                            → a todo el equipo de BDI.
//
// Queda afuera sólo quien está clavado a la otra marca (`cuenta` fija en el padrón): a quien
// trabaja en las dos le llega igual, porque le hace falta igual.
//
// ⚠️ El admin recibe TODO igual, por diseño (ver `esParaMi` en lib/novedades/destino.core.js): es
// el que se tiene que dar cuenta si algo salió al grupo equivocado.
//
// # Por qué postea al endpoint y no escribe en la tabla
//
// Con `pg` y `DATABASE_URL_BDI` sería más directo, y estaría mal: escribir la fila a mano **esquiva
// el handler**, así que si el handler valida algo, el borrador lo saltea y el problema recién
// aparece cuando alguien le da Publicar. Posteando se ejerce exactamente el mismo camino que la
// pantalla, con los mismos permisos.
//
// # Por qué no hay `--publicar`
//
// Porque la garantía de que nada le aparece al equipo sin que Bruno lo apriete no puede depender de
// que yo me acuerde de no usar un flag. El handler además ignora cualquier `estado` que venga en el
// cuerpo: una novedad nace en borrador y punto.
//
// El cuerpo va por ARCHIVO y no por argumento: es markdown con saltos de línea y comillas, y meterlo
// en `argv` es pedir que se escape mal.
import { readFileSync } from 'node:fs'
import { authKv } from './lib/kv-auth.mjs'

const API = 'https://monitorareben.vercel.app/api/datos?recurso=sistema'

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const importante = args.includes('--importante')
const listar = args.includes('--listar')
const sueltos = args.filter((a) => !a.startsWith('--'))

/** `--marca=bdi` · `--marca=zattia` · ausente = las dos. Es un filtro APARTE del `--destino`. */
function marcaDeArgs() {
  const arg = args.find((a) => a.startsWith('--marca='))
  if (!arg) return null
  const v = arg.slice('--marca='.length)
  if (v === 'bdi' || v === 'zattia') return v
  console.error(`✗ --marca inválida: "${v}". Usá bdi o zattia.`)
  process.exit(1)
}

/** `--destino=seccion:canjes` · `--destino=roles:local,marketing` · ausente = todos. */
function destinoDeArgs() {
  const marca = marcaDeArgs()
  const conMarca = (d) => (marca ? { ...d, marca } : d)
  const arg = args.find((a) => a.startsWith('--destino='))
  // Sin `--destino` pero con `--marca` sigue habiendo algo que decir: a todo el equipo de esa marca.
  if (!arg) return marca ? { tipo: 'todos', marca } : undefined
  const v = arg.slice('--destino='.length)
  const [tipo, resto = ''] = v.split(':')
  if (tipo === 'seccion' && resto) return conMarca({ tipo: 'seccion', key: resto })
  if (tipo === 'roles') {
    const roles = resto.split(',').map((r) => r.trim()).filter(Boolean)
    if (roles.length) return conMarca({ tipo: 'roles', roles })
  }
  console.error(`✗ --destino inválido: "${v}". Usá seccion:<key> o roles:<a,b>.`)
  process.exit(1)
}
const destino = destinoDeArgs()

const headers = { 'Content-Type': 'application/json', ...authKv() }

if (listar) {
  const r = await fetch(API, { headers })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) {
    console.error(`✗ ${(d && d.error) || r.status}`)
    process.exit(1)
  }
  for (const n of d.novedades) {
    const marca = n.estado === 'publicada' ? '●' : n.estado === 'borrador' ? '○' : '·'
    console.log(`${marca} ${n.estado.padEnd(9)} ${n.importante ? '⚠ ' : '  '}${n.titulo}   (${n.id})`)
  }
  if (!d.novedades.length) console.log('(no hay ninguna todavía)')
  process.exit(0)
}

if (sueltos.length < 2) {
  console.error('Uso: node scripts/novedad.mjs "Título" cuerpo.md [--importante] [--dry]')
  process.exit(1)
}

const [titulo, archivo] = sueltos
let cuerpo
try {
  cuerpo = readFileSync(archivo, 'utf8')
} catch {
  console.error(`No pude leer ${archivo}.`)
  process.exit(1)
}

const novedad = {
  id: `n${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  titulo,
  cuerpo,
  importante,
  ...(destino ? { destino } : {}),
}

if (dry) {
  console.log(JSON.stringify({ action: 'novedad-guardar', novedad }, null, 2))
  console.log('\n(--dry: no se mandó nada)')
  process.exit(0)
}

// ⚠️ El `Content-Type: application/json` no es opcional: sin él Vercel no parsea el cuerpo y el
// handler contesta por el primer campo que le falta, señalando a quien llama.
const r = await fetch(API, {
  method: 'POST',
  headers,
  body: JSON.stringify({ recurso: 'sistema', action: 'novedad-guardar', novedad }),
})
const d = await r.json().catch(() => null)
if (!r.ok || !d?.ok) {
  console.error(`✗ ${(d && d.error) || r.status}`)
  process.exit(1)
}
const aQuien = destino
  ? (destino.tipo === 'seccion' ? `los que ven "${destino.key}"` : `los de ${destino.roles.join(', ')}`)
  : 'todos'
console.log(`✓ Cargada como BORRADOR: ${novedad.id}  (le llega a ${aQuien})`)
console.log(`  Se ve en /novedades, en "Sin publicar". Nadie más la ve hasta que le des Publicar.`)
