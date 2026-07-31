#!/usr/bin/env node
/**
 * Migración de las solicitudes del KV de bdi-catalogo a la tabla `solicitudes` del
 * monitor (Fase 2A: un solo cajón).
 *
 * QUÉ HACE, EN ORDEN
 * ------------------
 *   1. Baja los DOS kinds (`sesionfotos` y `solicitudesinternas`) de la(s) marca(s) y los
 *      guarda a archivo. **Ese respaldo es la red de toda la operación**: mientras exista,
 *      cualquier error se deshace volviendo a escribir el KV con scripts/sf-kv.mjs --restore.
 *   2. Inserta cada solicitud en la tabla, por id (upsert). Repetible: correrlo dos veces
 *      no duplica nada ni pisa lo que el equipo haya cambiado después… salvo que se pase
 *      `--pisar`, que sí re-escribe el documento con lo que dice el KV.
 *   3. Cuenta y compara: solicitudes por estado en el KV vs en la tabla. Si no coinciden,
 *      lo dice y termina con error.
 *
 * NO BORRA NADA. Las claves del KV quedan intactas, y la app durante la convivencia lee
 * los dos lados (ver lib/solicitudes/cajon.ts, MIGRACION_LISTA).
 *
 * USO
 * ---
 *   node scripts/migrar-solicitudes.mjs --dry-run             ← default: no escribe
 *   node scripts/migrar-solicitudes.mjs --aplicar
 *   node scripts/migrar-solicitudes.mjs --aplicar --store zattia
 *   node scripts/migrar-solicitudes.mjs --aplicar --pisar     ← re-escribe documentos ya migrados
 *
 * Escribe con la connection string directa (DATABASE_URL_BDI / DATABASE_URL_ZATTIA del
 * .env), igual que scripts/apply-fallas.mjs — no pasa por el endpoint, así no depende del
 * deploy. **Leer el KV sí necesita credencial** desde que se cerró `api/ingresos`
 * (27-jul-2026): `MONITOR_PASS` en el .env, ver scripts/lib/kv-auth.mjs.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { authKv } from './lib/kv-auth.mjs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const KV_API = 'https://bdi-catalogo.vercel.app/api/ingresos'
const KINDS = ['sesionfotos', 'solicitudesinternas']

const args = process.argv.slice(2)
const tiene = (f) => args.includes(f)
const valor = (f, def) => {
  const i = args.indexOf(f)
  return i >= 0 && args[i + 1] ? args[i + 1] : def
}
const APLICAR = tiene('--aplicar')
const PISAR = tiene('--pisar')
const STORES = tiene('--store') ? [valor('--store', 'bdi')] : ['bdi', 'zattia']

const env = Object.fromEntries(
  readFileSync(join(RAIZ, '.env'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    }),
)

function parseUrl(raw) {
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

/** GET al KV. Distingue "no se pudo leer" de "leí y está vacío" (leer mal = migrar de menos). */
async function traerKv(kind, store) {
  const r = await fetch(`${KV_API}?kind=${kind}&store=${store}&nc=${Date.now()}`, { headers: authKv(env) })
  const texto = await r.text()
  let d = null
  try {
    d = JSON.parse(texto)
  } catch {
    return { ok: false, motivo: `respuesta no es JSON (HTTP ${r.status})` }
  }
  if (!r.ok || !d?.ok) return { ok: false, motivo: `HTTP ${r.status}: ${d?.error || texto.slice(0, 120)}` }
  return { ok: true, lista: Array.isArray(d.list) ? d.list : [] }
}

const porEstado = (lista) =>
  lista.reduce((acc, s) => ({ ...acc, [s.estado || '(sin estado)']: (acc[s.estado || '(sin estado)'] || 0) + 1 }), {})

/** Las columnas se derivan del documento; `datos` es la fuente de verdad (igual que api/solicitudes.js). */
function fila(store, kind, s) {
  return [
    String(s.id),
    store,
    kind,
    s.motivo ? String(s.motivo) : null,
    s.tipo === 'consumo' ? 'consumo' : 'retornable',
    String(s.estado || 'pendiente'),
    Number(s.creado) || null,
    s.creadoPor ? String(s.creadoPor) : null,
    s.fecha ? String(s.fecha) : null,
    JSON.stringify(s),
  ]
}

const SQL_INSERT = `
  insert into solicitudes (id, store, kind, motivo, destino, estado, creado, creado_por, fecha, datos)
  values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
  on conflict (store, id) do nothing
`
const SQL_UPSERT = `
  insert into solicitudes (id, store, kind, motivo, destino, estado, creado, creado_por, fecha, datos)
  values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
  on conflict (store, id) do update set
    kind = excluded.kind, motivo = excluded.motivo, destino = excluded.destino,
    estado = excluded.estado, creado = excluded.creado, creado_por = excluded.creado_por,
    fecha = excluded.fecha, datos = excluded.datos, updated_at = now()
`

const sello = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const respaldo = join(RAIZ, 'tests', 'fixtures', 'kv', `migracion-solicitudes-${sello}`)
mkdirSync(respaldo, { recursive: true })

console.log(`\nMigración de solicitudes → tabla · ${STORES.join(', ')} · ${APLICAR ? (PISAR ? 'APLICAR + PISAR' : 'APLICAR') : 'DRY-RUN'}\n`)

let problemas = 0

for (const store of STORES) {
  const url = env[`DATABASE_URL_${store.toUpperCase()}`]
  if (!url) {
    console.log(`✗ ${store}: falta DATABASE_URL_${store.toUpperCase()} en .env`)
    problemas++
    continue
  }

  // 1. Respaldo primero. Si el KV no se deja leer, no se migra esa marca: migrar de menos
  //    sin saberlo es peor que no migrar.
  const cajones = {}
  let leidoOk = true
  for (const kind of KINDS) {
    const r = await traerKv(kind, store)
    if (!r.ok) {
      console.log(`✗ ${store}/${kind}: ${r.motivo}`)
      leidoOk = false
      continue
    }
    cajones[kind] = r.lista
    writeFileSync(join(respaldo, `${kind}-${store}.json`), JSON.stringify(r.lista, null, 1))
    console.log(`  respaldo ${store}/${kind}: ${r.lista.length} solicitud(es) · ${JSON.stringify(porEstado(r.lista))}`)
  }
  if (!leidoOk) {
    problemas++
    console.log(`✗ ${store}: NO se migra (el respaldo quedó incompleto).\n`)
    continue
  }

  const total = KINDS.reduce((n, k) => n + cajones[k].length, 0)
  if (!APLICAR) {
    console.log(`  (dry-run) ${store}: se migrarían ${total} solicitud(es).\n`)
    continue
  }

  // 2. Insertar.
  const client = new pg.Client({ ...parseUrl(url), ssl: { rejectUnauthorized: false } })
  try {
    await client.connect()
    await client.query('BEGIN')
    let escritas = 0
    for (const kind of KINDS) {
      for (const s of cajones[kind]) {
        if (!s?.id) continue
        const r = await client.query(PISAR ? SQL_UPSERT : SQL_INSERT, fila(store, kind, s))
        escritas += r.rowCount || 0
      }
    }
    await client.query('COMMIT')

    // 3. Verificar: la cuenta por estado tiene que dar igual del lado del KV y de la tabla.
    const esperado = porEstado([...cajones.sesionfotos, ...cajones.solicitudesinternas])
    const { rows } = await client.query('select estado, count(*)::int as n from solicitudes where store = $1 group by estado', [store])
    const enTabla = Object.fromEntries(rows.map((r) => [r.estado, r.n]))
    const difs = [...new Set([...Object.keys(esperado), ...Object.keys(enTabla)])].filter((e) => (esperado[e] || 0) !== (enTabla[e] || 0))

    console.log(`  ✓ ${store}: ${escritas} fila(s) nueva(s) de ${total} leída(s)`)
    console.log(`    KV:    ${JSON.stringify(esperado)}`)
    console.log(`    tabla: ${JSON.stringify(enTabla)}`)
    if (difs.length) {
      problemas++
      console.log(`    ⚠️  NO coinciden en: ${difs.join(', ')} — revisar antes de seguir.`)
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    problemas++
    console.log(`✗ ${store}: ${e.message}`)
  } finally {
    await client.end().catch(() => {})
  }
  console.log('')
}

console.log(`Respaldo del KV en ${respaldo.replace(RAIZ + '/', '')}`)
console.log('Las claves del KV quedan INTACTAS: nada se borró.\n')
if (problemas) {
  console.log(`⚠️  ${problemas} problema(s). No prendas MIGRACION_LISTA hasta resolverlos.\n`)
  process.exit(1)
}
if (APLICAR) console.log('Listo. La app ya escribe en la tabla y lee los dos lados hasta que se prenda MIGRACION_LISTA.\n')
