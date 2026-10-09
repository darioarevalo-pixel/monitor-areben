#!/usr/bin/env node
/**
 * Pone el stock de la Tienda Nube de Stunned igual al de Gestión Nube, sin que nadie apriete nada.
 *
 * Es lo mismo que «Aplicar las N con diferencia» de Integraciones → Stock, corrido por el reloj:
 * va como paso de `sync-diario-zattia.yml`, **después** de bajar el inventario, así que lee el
 * espejo recién sincronizado. Si el sync falla, este paso no corre.
 *
 *   node scripts/sync-stock-stunned.mjs              # escribe
 *   node scripts/sync-stock-stunned.mjs --simulacro  # sólo dice qué escribiría
 *
 * 🔑 La regla (qué variantes, qué stock y cuándo frenar) vive en `lib/sync-tn/stock-plan.core.js`,
 * la misma que usa el botón. Acá sólo se lee, se escribe y se vuelve a medir.
 *
 * 🔴 **Escribe en la TIENDA VIVA.** Por eso:
 * - antes de escribir pasa por `motivoParaFrenar`: un inventario vacío o a medias pondría la tienda
 *   en 0, y eso no se escribe;
 * - escribe de a 20 (como el botón: más no entra en el timeout de la función) y **frena** si una
 *   tanda no contesta — no se sabe si quedó escrita;
 * - al final **vuelve a leer TN con `refresh=1`** y cuenta las diferencias que quedan. Ése es el
 *   oráculo: el `aplicados` del handler no dice qué quedó en la tienda.
 * Cualquiera de esas cosas sale en rojo (exit 1), que es lo que hace que GitHub avise.
 *
 * La llave (`STOCK_CRON_KEY`) sólo sirve para la acción `stock` de Stunned en `tn-categorias`
 * (bdi-catalogo): el token de Tienda Nube nunca sale de Vercel.
 */

import { createClient } from '@supabase/supabase-js'
import { FILTRO_OR_STUNNED, planDeStock } from '../lib/sync-tn/stock-plan.core.js'

const AUDIT = 'https://bdi-catalogo.vercel.app/api/tiendanube-audit'
const TN_STOCK_API = 'https://bdi-catalogo.vercel.app/api/tn-categorias?store=stunned'
const TAM_TANDA = 20

const simulacro = process.argv.includes('--simulacro')
const url = process.env.ZATTIA_SUPABASE_URL
const key = process.env.ZATTIA_SUPABASE_SERVICE_KEY || process.env.ZATTIA_SUPABASE_KEY
const llave = process.env.STOCK_CRON_KEY

if (!url || !key) {
  console.error('Faltan ZATTIA_SUPABASE_URL / ZATTIA_SUPABASE_SERVICE_KEY.')
  process.exit(1)
}
if (!simulacro && !llave) {
  console.error('Falta STOCK_CRON_KEY: sin la llave no se puede escribir en Tienda Nube.')
  process.exit(1)
}

const supabase = createClient(url, key)

/** Lee una tabla entera de a 1.000 (el tope de PostgREST corta callado). */
async function leerTodo(tabla, columnas, filtrar) {
  const out = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await filtrar(supabase.from(tabla).select(columnas)).range(desde, desde + 999)
    if (error) throw new Error(`${tabla}: ${error.message}`)
    out.push(...(data || []))
    if (!data || data.length < 1000) return out
  }
}

async function leerTn() {
  const r = await fetch(`${AUDIT}?store=stunned&variantes=1&refresh=1&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d || !Array.isArray(d.products)) throw new Error(`Tienda Nube no devolvió los productos (HTTP ${r.status}).`)
  return d.products
}

async function main() {
  const [validadas, inv, tn] = await Promise.all([
    leerTodo('sku_map', 'sku,tn_product_id,tn_variant_id', (q) => q.eq('store', 'stunned').eq('validado', true).order('sku')),
    leerTodo('inventario', 'sku,product_name,available_quantity', (q) => q.or(FILTRO_OR_STUNNED).order('product_id').order('size_id').order('store_name')),
    leerTn(),
  ])

  const { filas, candidatas, freno } = planDeStock(validadas, inv, tn)
  console.log(`${filas.length} variantes validadas · ${inv.length} filas de inventario de Stunned · ${candidatas.length} con diferencia.`)
  for (const r of candidatas) console.log(`  ${r.sku.padEnd(22)} TN ${String(r.tn).padStart(3)} → ${String(r.gn).padStart(3)}   ${r.nombre || ''}`)

  if (freno) {
    console.error(`\n🛑 FRENADO: ${freno}`)
    process.exit(1)
  }
  if (!candidatas.length) {
    console.log('\nTienda Nube ya está igual a Gestión Nube. No se escribe nada.')
    return
  }
  if (simulacro) {
    console.log('\nSimulacro: no se escribió nada.')
    return
  }

  let escritas = 0
  const errores = []
  for (let i = 0; i < candidatas.length; i += TAM_TANDA) {
    const tanda = candidatas.slice(i, i + TAM_TANDA)
    const updates = tanda.map((r) => ({ product_id: r.tnProductId, variant_id: r.tnVariantId, stock: r.gn }))
    let resp
    try {
      const r = await fetch(TN_STOCK_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-stock-cron-key': llave },
        body: JSON.stringify({ store: 'stunned', accion: 'stock', updates }),
        signal: AbortSignal.timeout(60_000),
      })
      resp = await r.json().catch(() => null)
      if (!r.ok || !resp?.ok) throw new Error(resp?.error || `HTTP ${r.status}`)
    } catch (e) {
      // No se sabe si la tanda quedó escrita: seguir sería escribir a ciegas. La verificación de
      // abajo dice cómo quedó.
      console.error(`\n⚠️ La tanda ${i / TAM_TANDA + 1} no contestó (${e.message}). Se frena y se verifica.`)
      errores.push(`tanda ${i / TAM_TANDA + 1} sin respuesta`)
      break
    }
    escritas += resp.aplicados || 0
    for (const e of resp.errores || []) errores.push(`${e.product_id}/${e.variant_id}: ${e.msg || e.error || e.status}`)
  }
  console.log(`\nEscritas según Tienda Nube: ${escritas} de ${candidatas.length}.`)
  for (const e of errores) console.error(`  ✗ ${e}`)

  // El oráculo: volver a leer la tienda de verdad y contar lo que sigue distinto.
  const despues = planDeStock(validadas, inv, await leerTn()).candidatas
  console.log(`Verificación (Tienda Nube releída): ${despues.length} variantes siguen distintas.`)
  for (const r of despues) console.error(`  ≠ ${r.sku}: TN ${r.tn}, GN ${r.gn}`)

  if (errores.length || despues.length) process.exit(1)
}

main().catch((e) => {
  console.error('ERROR:', e.message)
  process.exit(1)
})
