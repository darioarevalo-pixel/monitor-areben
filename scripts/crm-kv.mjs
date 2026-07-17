#!/usr/bin/env node
/**
 * Dump y restore de las 4 claves del CRM en el KV de bdi-catalogo.
 *
 * POR QUÉ EXISTE
 * --------------
 * El CRM guarda TODO su estado en 4 claves de un KV externo, y en cada acción
 * reescribe el mapa entero. Si el GET previo falló, la variable en memoria vale
 * `{}` y la escritura siguiente deja la clave vacía. El servidor no protege:
 * la única guarda es `if (!map || typeof map !== 'object') return 400`
 * (bdi-catalogo/api/ingresos.js:62,78,94) y **`{}` es un objeto**: pasa y hace
 * el SET. Para `mensajes` la guarda es `!Array.isArray(bank)` → `[]` también pasa.
 *
 * Eso no está en Supabase y no se le conoce backup. Son las cadencias, notas y
 * marcas de mayorista del seguimiento comercial.
 *
 * Y NO HAY SANDBOX: las 4 kinds hardcodean `store === 'zattia' ? 'zattia' : 'bdi'`,
 * así que no se puede crear una clave de prueba. Cualquier escritura de test pega
 * en datos reales. **Este dump es la única red que existe.**
 *
 * USO
 * ---
 *   node scripts/crm-kv.mjs --dump                → baja las 4 claves (READ-ONLY)
 *   node scripts/crm-kv.mjs --dump --store zattia
 *   node scripts/crm-kv.mjs --restore <carpeta> --kind crmseg --si-estoy-seguro
 *
 * El dump va a tests/fixtures/kv/<store>-<timestamp>/, que está gitignoreado
 * (son datos reales de clientes).
 *
 * No necesita credenciales: las 4 kinds del CRM no piden auth (solo `ingresos`
 * exige admin, ingresos.js:210). Eso es parte del problema, no una comodidad.
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const API = 'https://bdi-catalogo.vercel.app/api/ingresos'

/** Las 4 claves del CRM. `mensajes` usa `bank` (array); el resto `map` (objeto). */
const KINDS = [
  { kind: 'crmtel', campo: 'map', clave: 'crm:tel', que: 'teléfonos (override del export de GN)' },
  { kind: 'crmseg', campo: 'map', clave: 'crm:seg', que: 'seguimiento: cadencia, notas, es_mayorista' },
  { kind: 'crmleads', campo: 'map', clave: 'crm:leads', que: 'prospectos cargados a mano' },
  { kind: 'mensajes', campo: 'bank', clave: 'mensajes', que: 'banco de mensajes' },
]

const args = process.argv.slice(2)
const tiene = (f) => args.includes(f)
const valor = (f, def) => {
  const i = args.indexOf(f)
  return i >= 0 && args[i + 1] ? args[i + 1] : def
}

const store = valor('--store', 'bdi')

/**
 * Un GET al KV. Distingue los tres desenlaces que al legacy se le mezclan en uno:
 * error de red, respuesta no-ok, y ok-pero-sin-dato. Justo esa confusión es el bug.
 */
async function traer(kind, campo) {
  const url = `${API}?kind=${kind}&store=${store}&nc=${Date.now()}`
  const r = await fetch(url)
  const texto = await r.text()
  let d = null
  try {
    d = JSON.parse(texto)
  } catch {
    return { ok: false, motivo: `respuesta no es JSON (HTTP ${r.status}): ${texto.slice(0, 120)}` }
  }
  // Ojo: acá está el bug del legacy. El servidor devuelve 500 CON JSON válido
  // (ingresos.js:32 → {error:'KV no configurado'}), así que un `await r.json()`
  // no tira y el catch nunca corre. Por eso se chequean r.ok Y d.ok por separado.
  if (!r.ok) return { ok: false, motivo: `HTTP ${r.status}: ${(d && d.error) || texto.slice(0, 120)}` }
  if (!d || !d.ok) return { ok: false, motivo: `el servidor respondió ok=false: ${JSON.stringify(d).slice(0, 120)}` }
  return { ok: true, dato: d[campo] ?? null }
}

function contar(dato, campo) {
  if (dato === null || dato === undefined) return 0
  return campo === 'bank' ? (Array.isArray(dato) ? dato.length : 0) : Object.keys(dato).length
}

async function dump() {
  const sello = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const destino = join(RAIZ, 'tests', 'fixtures', 'kv', `${store}-${sello}`)
  mkdirSync(destino, { recursive: true })

  console.log(`\nDump del KV del CRM · store=${store}\n`)
  let fallos = 0
  const resumen = []

  for (const { kind, campo, clave, que } of KINDS) {
    const r = await traer(kind, campo)
    if (!r.ok) {
      console.log(`  ✗ ${kind.padEnd(9)} ${r.motivo}`)
      fallos++
      continue
    }
    const n = contar(r.dato, campo)
    writeFileSync(join(destino, `${kind}.json`), JSON.stringify(r.dato, null, 1))
    const vacio = r.dato === null ? '  ← el KV no tiene la clave (nunca se escribió)' : n === 0 ? '  ← VACÍA' : ''
    console.log(`  ✓ ${kind.padEnd(9)} ${String(n).padStart(5)} ${campo === 'bank' ? 'grupos' : 'claves'}   ${clave}:${store}${vacio}`)
    console.log(`    ${' '.repeat(9)}       ${que}`)
    resumen.push({ kind, clave: `${clave}:${store}`, campo, total: n, nulo: r.dato === null })
  }

  writeFileSync(join(destino, '_resumen.json'), JSON.stringify({ store, fecha: new Date().toISOString(), kinds: resumen }, null, 1))
  console.log(`\nGuardado en ${destino.replace(RAIZ + '/', '')}`)
  if (fallos) {
    console.log(`\n⚠️  ${fallos} de ${KINDS.length} fallaron: el dump está INCOMPLETO, no sirve de red.`)
    process.exit(1)
  }
  console.log('\nEste dump es la red para cualquier prueba de escritura del CRM. Sin sandbox, no hay otra.\n')
}

/**
 * Restore. Es la única parte que escribe, y escribe en producción.
 *
 * Guarda deliberada: se niega a restaurar algo vacío. Restaurar `{}` es
 * exactamente el bug que este script existe para poder deshacer — sería absurdo
 * que la herramienta de rescate supiera hacerlo.
 */
async function restore() {
  const carpeta = valor('--restore')
  const kind = valor('--kind')
  const def = KINDS.find((k) => k.kind === kind)

  if (!carpeta || !def) {
    console.error('Uso: node scripts/crm-kv.mjs --restore <carpeta> --kind <crmtel|crmseg|crmleads|mensajes> --si-estoy-seguro')
    process.exit(1)
  }
  const archivo = join(carpeta, `${kind}.json`)
  if (!existsSync(archivo)) {
    console.error(`No existe ${archivo}`)
    process.exit(1)
  }

  const dato = JSON.parse(readFileSync(archivo, 'utf8'))
  const n = contar(dato, def.campo)

  if (n === 0) {
    console.error(`\n⛔ El archivo tiene 0 ${def.campo === 'bank' ? 'grupos' : 'claves'}. Restaurar eso ES el bug que este script existe para deshacer.\n`)
    process.exit(1)
  }

  console.log(`\nVa a SOBRESCRIBIR ${def.clave}:${store} en producción con ${n} ${def.campo === 'bank' ? 'grupos' : 'claves'} de ${archivo}`)
  if (!tiene('--si-estoy-seguro')) {
    console.log('\nFaltó --si-estoy-seguro. No se escribió nada.\n')
    process.exit(1)
  }

  const r = await fetch(`${API}?kind=${kind}&store=${store}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ [def.campo]: dato }),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d || !d.ok) {
    console.error(`\n✗ Falló: HTTP ${r.status} ${JSON.stringify(d)}\n`)
    process.exit(1)
  }
  console.log(`\n✓ Restaurado. El servidor confirma ${d.total} ${def.campo === 'bank' ? 'grupos' : 'claves'}.\n`)
}

if (tiene('--dump')) await dump()
else if (tiene('--restore')) await restore()
else {
  console.log(`
Dump y restore de las 4 claves del CRM en el KV.

  --dump                    baja las 4 claves (READ-ONLY, no escribe nada)
  --store <bdi|zattia>      default: bdi (el CRM es bdi-only)
  --restore <carpeta> --kind <k> --si-estoy-seguro
                            SOBRESCRIBE la clave en PRODUCCIÓN
`)
}
