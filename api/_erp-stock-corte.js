/**
 * Lo que entra por Ingresos en una línea que YA CORTÓ, sin esperar a la madrugada: recalcula el libro y escribe en el espejo `inventario` esas variantes. Bruno, 3-nov: al importar, «entran sus
 * unidades y la Caja lo encuentra». La búsqueda de la Caja y ~30 pantallas leen el espejo, que sólo se reescribe con `sync-diario` o el Sync rápido (`scripts/erp-inventario-espejo.mjs`).
 *
 * 🔑 Manda `erp_corte`, ⛔ una llave aparte: sin corte, ⛔ recalcula ni escribe nada (hasta el corte el espejo lo llena el sync de GN).
 * 🔑 El recálculo lo corre el MOTOR (`erp.arebensrl.com/api/eventos`, trabajo `libro`, con su candado y su envío a TN): con `ERP_LLAVE_MONITOR`, que allá sólo abre ese trabajo. Si ⛔ contesta a
 * tiempo, se escribe lo que el libro tenga, se dice, y lo termina la vuelta de la hora (`api/_ingresos-lectura.js`).
 * 🔑 Las filas salen de las mismas piezas que el script: `SQL_INVENTARIO_LINEAS` + `planInventarioErp`, filtradas a esos códigos. ⛔ borra nada: limpiar el espejo es del script, que lo ve entero.
 * ⛔ Archivo `_`: NO es una ruta.
 */
import { createClient } from '@supabase/supabase-js'
import { cfgDeMarca } from './_recepciones-base.js'
import { cortesDeFilas, lineasEnErp, SQL_CORTES } from '../lib/erp/corte.core.js'
import { planInventarioErp, SQL_INVENTARIO_LINEAS } from '../lib/erp/inventario-espejo.core.js'
import { configPg } from '../lib/pg.core.js'
import { escribirInventario } from '../scripts/lib/erp-inventario-escribir.mjs'
import { registrarCambiosDeStock } from '../scripts/lib/stock-cambios.mjs'

const PG_DE_MARCA = { bdi: 'DATABASE_URL_BDI', zattia: 'DATABASE_URL_ZATTIA' }
const EVENTOS = 'https://erp.arebensrl.com/api/eventos'
const norm = (x) => String(x ?? '').trim().toUpperCase()

async function conBase(marca, fn) {
  const conexion = process.env[PG_DE_MARCA[marca]]
  if (!conexion) throw new Error(`falta ${PG_DE_MARCA[marca]}`)
  const { default: pg } = await import('pg')
  const db = new pg.Client({ ...configPg(conexion), connectionTimeoutMillis: 5000, statement_timeout: 15000 })
  await db.connect()
  try { return await fn(db) } finally { await db.end().catch(() => {}) }
}

/** Pide el recálculo y espera a que termine. `false` si ⛔ se pudo: el stock queda para la vuelta siguiente. */
async function recalcularLibro(marca, espera, { env = process.env, fetchFn = fetch } = {}) {
  if (!env.ERP_LLAVE_MONITOR) { console.error('[erp-stock-corte] falta ERP_LLAVE_MONITOR'); return false }
  try {
    const r = await fetchFn(EVENTOS, {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(espera),
      headers: { 'content-type': 'application/json', 'x-erp-llave': env.ERP_LLAVE_MONITOR },
      body: JSON.stringify({ tipo: 'libro', clave: marca, origen: 'ingresos' }),
    })
    if (!r.ok) console.error(`[erp-stock-corte] ${marca}: el recálculo contestó ${r.status}`)
    return r.ok
  } catch (e) {
    console.error(`[erp-stock-corte] ${marca}: el recálculo no contestó (${e?.name ?? 'error'})`)
    return false
  }
}

/**
 * @param {{ marca: 'bdi'|'zattia', skus: string[], recalcular?: boolean, espera?: number }} p `recalcular: false`: sólo el espejo, con lo que el libro ya tiene
 * @param {{ conBase?: Function, sb?: any, env?: any, fetchFn?: typeof fetch, registrar?: Function }} [deps]
 * @returns {Promise<{ corrio: false, motivo: string } | { corrio: true, libro: boolean|null, filas: number, unidades: number }>}
 */
export async function refrescarStockDeCorte({ marca, skus, recalcular = true, espera = 15_000 }, deps = {}) {
  const querer = new Set((skus || []).map(norm).filter(Boolean))
  if (!querer.size) return { corrio: false, motivo: 'nada' }
  const abrir = deps.conBase ?? conBase
  const lineas = await abrir(marca, async (db) => lineasEnErp(cortesDeFilas((await db.query(SQL_CORTES)).rows), marca))
  if (!lineas.includes(marca)) return { corrio: false, motivo: 'sin_corte' }
  const libro = recalcular ? await recalcularLibro(marca, espera, deps) : null
  const filas = (await abrir(marca, async (db) => (await db.query(SQL_INVENTARIO_LINEAS, [[marca]])).rows)).filter((r) => querer.has(norm(r.sku)))
  const plan = planInventarioErp(marca, [marca], filas, [])
  if (!plan.upserts.length) return { corrio: true, libro, filas: 0, unidades: 0 }
  const cfg = cfgDeMarca(marca)
  const sb = deps.sb ?? createClient(cfg.url, cfg.key)
  // Historia de stock (Reposición separa lo que entra al local): ANTES del upsert, como en los syncs. Si falla se dice y ⛔ frena: un stock sin historia es mejor que uno viejo.
  const historia = await (deps.registrar ?? registrarCambiosDeStock)(sb, plan.upserts, 'erp')
  if (historia.error) console.error(`[erp-stock-corte] ${marca}: historia de stock: ${historia.error}`)
  await escribirInventario(sb, plan.upserts)
  return { corrio: true, libro, filas: plan.upserts.length, unidades: plan.upserts.reduce((a, r) => a + r.available_quantity, 0) }
}
