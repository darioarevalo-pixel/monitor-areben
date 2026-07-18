#!/usr/bin/env node
/**
 * Dump y restore de la clave de Sesión de fotos (`sesionfotos:<marca>`) en el KV
 * de bdi-catalogo. Calcado de `scripts/crm-kv.mjs`.
 *
 * POR QUÉ EXISTE
 * --------------
 * Sesión de fotos guarda TODO su historial en una clave por marca (`{list:[...]}`)
 * y en cada guardado reescribe el array entero. Si el GET previo falló, la lista
 * en memoria vale `[]` y la escritura siguiente deja la clave vacía. El servidor
 * no protege: `!Array.isArray(list)` → `[]` pasa y hace el SET. (El fix del
 * legacy — SF-1, flag `sfCargado` — evita el caso de red caída; este dump es la
 * red para las PRUEBAS DE ESCRITURA del port, que no tienen sandbox.)
 *
 * Y NO HAY SANDBOX: la kind hardcodea `store === 'zattia' ? 'zattia' : 'bdi'`, así
 * que no se puede crear una clave de prueba real. Toda escritura de test pega en
 * datos reales del equipo. **Este dump es la única red que existe.**
 *
 * SF es DUAL-MARCA: `--dump` sin `--store` baja bdi Y zattia.
 *
 * USO
 * ---
 *   node scripts/sf-kv.mjs --dump                → baja bdi y zattia (READ-ONLY)
 *   node scripts/sf-kv.mjs --dump --store zattia
 *   node scripts/sf-kv.mjs --restore <carpeta> --store <marca> --si-estoy-seguro
 *
 * El dump va a tests/fixtures/kv/sf-<store>-<timestamp>/, gitignoreado (datos
 * reales). No necesita credenciales: la kind no pide auth (parte del problema A7).
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const API = 'https://bdi-catalogo.vercel.app/api/ingresos'
const KIND = 'sesionfotos'

const args = process.argv.slice(2)
const tiene = (f) => args.includes(f)
const valor = (f, def) => {
  const i = args.indexOf(f)
  return i >= 0 && args[i + 1] ? args[i + 1] : def
}

/** Un GET al KV. Distingue red caída / no-ok / ok-sin-dato (la confusión que es el bug). */
async function traer(store) {
  const url = `${API}?kind=${KIND}&store=${store}&nc=${Date.now()}`
  const r = await fetch(url)
  const texto = await r.text()
  let d = null
  try {
    d = JSON.parse(texto)
  } catch {
    return { ok: false, motivo: `respuesta no es JSON (HTTP ${r.status}): ${texto.slice(0, 120)}` }
  }
  if (!r.ok) return { ok: false, motivo: `HTTP ${r.status}: ${(d && d.error) || texto.slice(0, 120)}` }
  if (!d || !d.ok) return { ok: false, motivo: `el servidor respondió ok=false: ${JSON.stringify(d).slice(0, 120)}` }
  return { ok: true, lista: Array.isArray(d.list) ? d.list : [] }
}

/** Medición de una lista de solicitudes (la data de SF-0 que no se había tomado). */
function medir(lista) {
  const porEstado = {}
  let conVentas = 0
  let conNuevoOManual = 0
  let items = 0
  for (const s of lista) {
    porEstado[s.estado || '(sin estado)'] = (porEstado[s.estado || '(sin estado)'] || 0) + 1
    if (s.ventas && Object.keys(s.ventas).length) conVentas++
    const its = Array.isArray(s.items) ? s.items : []
    items += its.length
    if (its.some((i) => i.nuevo || i.manual)) conNuevoOManual++
  }
  return { solicitudes: lista.length, items, conVentas, conNuevoOManual, porEstado }
}

async function dumpUno(store, destino) {
  const r = await traer(store)
  if (!r.ok) {
    console.log(`  ✗ ${store.padEnd(6)} ${r.motivo}`)
    return { store, ok: false }
  }
  const m = medir(r.lista)
  writeFileSync(join(destino, `sesionfotos-${store}.json`), JSON.stringify(r.lista, null, 1))
  const vacio = m.solicitudes === 0 ? '  ← VACÍA / nunca escrita' : ''
  console.log(`  ✓ ${store.padEnd(6)} ${String(m.solicitudes).padStart(4)} solicitudes · ${m.items} items · ${m.conVentas} con ventas GN · ${m.conNuevoOManual} con nuevo/manual${vacio}`)
  console.log(`    ${' '.repeat(6)}      estados: ${JSON.stringify(m.porEstado)}`)
  return { store, ok: true, ...m }
}

async function dump() {
  const stores = tiene('--store') ? [valor('--store', 'bdi')] : ['bdi', 'zattia']
  const sello = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const destino = join(RAIZ, 'tests', 'fixtures', 'kv', `sf-${stores.join('_')}-${sello}`)
  mkdirSync(destino, { recursive: true })

  console.log(`\nDump de Sesión de fotos · ${stores.join(', ')}\n`)
  const resumen = []
  let fallos = 0
  for (const store of stores) {
    const r = await dumpUno(store, destino)
    if (!r.ok) fallos++
    else resumen.push(r)
  }

  writeFileSync(join(destino, '_resumen.json'), JSON.stringify({ fecha: new Date().toISOString(), stores: resumen }, null, 1))
  console.log(`\nGuardado en ${destino.replace(RAIZ + '/', '')}`)
  if (fallos) {
    console.log(`\n⚠️  ${fallos} store(s) fallaron: el dump está INCOMPLETO, no sirve de red.`)
    process.exit(1)
  }
  console.log('\nEste dump es la red para las pruebas de escritura de SF-4. Sin sandbox, no hay otra.\n')
}

/**
 * Restore. La única parte que escribe, y escribe en producción. Se niega a
 * restaurar una lista vacía: restaurar `[]` ES el bug que este script deshace.
 */
async function restore() {
  const carpeta = valor('--restore')
  const store = valor('--store')
  if (!carpeta || !store) {
    console.error('Uso: node scripts/sf-kv.mjs --restore <carpeta> --store <bdi|zattia> --si-estoy-seguro')
    process.exit(1)
  }
  const archivo = join(carpeta, `sesionfotos-${store}.json`)
  if (!existsSync(archivo)) {
    console.error(`No existe ${archivo}`)
    process.exit(1)
  }
  const lista = JSON.parse(readFileSync(archivo, 'utf8'))
  if (!Array.isArray(lista) || lista.length === 0) {
    console.error('\n⛔ El archivo tiene 0 solicitudes. Restaurar eso ES el bug que este script existe para deshacer.\n')
    process.exit(1)
  }

  console.log(`\nVa a SOBRESCRIBIR sesionfotos:${store} en producción con ${lista.length} solicitudes de ${archivo}`)
  if (!tiene('--si-estoy-seguro')) {
    console.log('\nFaltó --si-estoy-seguro. No se escribió nada.\n')
    process.exit(1)
  }
  const r = await fetch(`${API}?kind=${KIND}&store=${store}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store, list: lista }),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d || !d.ok) {
    console.error(`\n✗ Falló: HTTP ${r.status} ${JSON.stringify(d)}\n`)
    process.exit(1)
  }
  console.log(`\n✓ Restaurado. El servidor confirma ${d.total ?? lista.length} solicitudes.\n`)
}

if (tiene('--dump')) await dump()
else if (tiene('--restore')) await restore()
else {
  console.log(`
Dump y restore de Sesión de fotos (kind=sesionfotos) en el KV.

  --dump                    baja bdi y zattia (READ-ONLY, no escribe nada)
  --store <bdi|zattia>      restringe a una marca
  --restore <carpeta> --store <marca> --si-estoy-seguro
                            SOBRESCRIBE la clave en PRODUCCIÓN
`)
}
