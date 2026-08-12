// ⚠️ ESTE SCRIPT ESCRIBE EN PRODUCCIÓN.
//
// Sube un informe del analista de pauta al monitor, **como borrador**. Es la pieza que saca los
// informes de una carpeta de un solo disco y los pone donde los pueda abrir el equipo.
//
//   node scripts/informe-meta.mjs informe.html --linea=bdi --fecha=2026-08-11 \
//        --titulo="Informe 02 · BDI" [--resumen="…"] [--pisar] [--dry]
//   node scripts/informe-meta.mjs --listar
//
// # Por qué postea al endpoint y no escribe en la tabla
//
// Igual que `novedad.mjs`, y por el mismo motivo: escribir la fila a mano **esquiva el handler**,
// así que si el handler valida algo, el informe lo saltea y el problema recién aparece cuando
// alguien lo abre. Posteando se ejerce exactamente el mismo camino que la pantalla.
//
// # Por qué no hay `--publicar`
//
// Porque la garantía de que al equipo no le aparece un informe a medio revisar no puede depender de
// que yo me acuerde de no usar un flag. Publicar es un click en `/meta-ads/informes`.
//
// # `--pisar` es a mano, y es la convención del analista
//
// La clave es `(fecha, línea)` porque el historial vale por no pisarse: leer qué se pensaba en
// agosto con lo que se sabía en agosto. Sin el flag, subir dos veces la misma fecha contesta 409
// diciendo cuál es el informe que ya está ahí.
import { readFileSync } from 'node:fs'
import { authKv } from './lib/kv-auth.mjs'

const API = 'https://monitorareben.vercel.app/api/meta-ads?recurso=informe'
const API_LISTA = 'https://monitorareben.vercel.app/api/meta-ads?recurso=informes'

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const pisar = args.includes('--pisar')
const listar = args.includes('--listar')
const sueltos = args.filter((a) => !a.startsWith('--'))

const opt = (nombre) => {
  const arg = args.find((a) => a.startsWith(`--${nombre}=`))
  return arg ? arg.slice(nombre.length + 3) : undefined
}

const headers = { 'Content-Type': 'application/json', ...authKv() }

if (listar) {
  const r = await fetch(API_LISTA, { headers })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) {
    console.error(`✗ ${(d && d.error) || r.status}`)
    process.exit(1)
  }
  for (const i of d.informes) {
    console.log(`${i.publicado ? '●' : '○'} ${i.fecha}  ${String(i.linea).padEnd(8)} ${i.titulo}   (${i.id})`)
  }
  if (!d.informes.length) console.log('(no hay ninguno todavía)')
  process.exit(0)
}

if (sueltos.length < 1) {
  console.error('Uso: node scripts/informe-meta.mjs informe.html --linea=bdi --fecha=AAAA-MM-DD --titulo="…" [--resumen="…"] [--pisar] [--dry]')
  process.exit(1)
}

const archivo = sueltos[0]
let html
try {
  html = readFileSync(archivo, 'utf8')
} catch {
  console.error(`No pude leer ${archivo}.`)
  process.exit(1)
}

// La fecha y la línea salen del nombre del archivo si no se pasan: la carpeta del analista los
// nombra `AAAA-MM-DD-<marca>.html` justamente porque son los dos datos que identifican un informe.
const delNombre = /(\d{4}-\d{2}-\d{2})-([a-z]+)\.html$/i.exec(archivo)
const fecha = opt('fecha') || (delNombre && delNombre[1])
const linea = (opt('linea') || (delNombre && delNombre[2]) || '').toLowerCase()

const cuerpo = {
  accion: 'guardar',
  fecha,
  linea,
  titulo: opt('titulo') || '',
  resumen: opt('resumen') || '',
  html,
  ...(pisar ? { pisar: true } : {}),
}

if (dry) {
  console.log(JSON.stringify({ ...cuerpo, html: `«${Math.round(html.length / 1024)} KB»` }, null, 2))
  console.log('\n(--dry: no se mandó nada)')
  process.exit(0)
}

const r = await fetch(API, { method: 'POST', headers, body: JSON.stringify(cuerpo) })
const d = await r.json().catch(() => null)
if (!r.ok || !d?.ok) {
  console.error(`✗ ${(d && d.error) || r.status}`)
  process.exit(1)
}

console.log(`✓ ${d.reemplazo ? 'Reemplazado' : 'Cargado'} como BORRADOR: ${d.informe.fecha} · ${d.informe.linea} · «${d.informe.titulo}»  (${d.informe.id})`)
for (const a of d.avisos || []) console.log(`  ⚠️  ${a}`)
console.log('  Se ve en /meta-ads/informes. Nadie más lo ve hasta que le des Publicar.')
