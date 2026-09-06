/**
 * Le pone la foto a los ítems de la Feria Septiembre 2026 de Zattia.
 *
 * `foto.imagen` es un campo CONGELADO: la pantalla de Liquidación dibuja `item.foto.imagen` y nada
 * más (`Liquidacion.tsx:1286`, `DefinirPrecio.tsx:518`), así que un ítem cargado sin imagen queda
 * sin foto para siempre aunque el catálogo de Tienda Nube la tenga. `scripts/feria-zattia-cargar.mjs`
 * los cargó con `imagen: null` y por eso la campaña se ve sin fotos.
 *
 * 🔑 **El cruce NO se copia acá.** `indexarTn` e `imagenDe` se importan de `lib/tn.ts` —Node 25
 * despoja los tipos solo— para que esto matchee EXACTAMENTE igual que la pantalla: SKU exacto →
 * nombre exacto → todas las palabras de 3+ letras. Es el mismo índice `promo` (todos los productos)
 * que usa "Mandar a liquidación" en `MandarALiquidacion.tsx:86`.
 *
 *   node scripts/feria-zattia-fotos.mjs             → sólo mide
 *   node scripts/feria-zattia-fotos.mjs --escribir  → guarda ítem por ítem
 */
import { authKv } from './lib/kv-auth.mjs'
import { indexarTn, imagenDe } from '../lib/tn.ts'

const BASE = 'https://monitorareben.vercel.app/api'
const AUDIT = 'https://bdi-catalogo.vercel.app/api/tiendanube-audit'
const H = { ...authKv(), 'content-type': 'application/json' }
const LIQ = 'l1788656536418_tdukfi'
const ESCRIBIR = process.argv.includes('--escribir')

const get = async (u) => {
  const r = await fetch(u, { headers: H })
  if (!r.ok) throw new Error(`${u} → ${r.status} ${(await r.text()).slice(0, 200)}`)
  return r.json()
}

const [{ items }, cat] = await Promise.all([
  get(`${BASE}/datos?recurso=liquidacion&store=zattia&liq=${LIQ}`),
  get(`${AUDIT}?store=zattia`),
])
const idx = indexarTn(cat.products || [])

// El ítem guarda `sku` y `nombre`; `matchTn` pide `{sku, name}`. Es el mismo producto de GN.
const conFoto = [], sinFoto = []
const cambios = []
for (const it of items) {
  const img = imagenDe({ sku: it.foto.sku, name: it.foto.nombre }, idx)
  ;(img ? conFoto : sinFoto).push(it.foto.nombre)
  if (img && it.foto.imagen !== img) cambios.push({ ...it, foto: { ...it.foto, imagen: img } })
}
console.log(`ítems: ${items.length} · matchean foto: ${conFoto.length} · sin foto: ${sinFoto.length}`)
console.log(`ya la tenían: ${items.filter((i) => i.foto.imagen).length} · a guardar: ${cambios.length}`)
if (sinFoto.length) console.log('\nsin foto en Tienda Nube:\n  ' + sinFoto.join('\n  '))

if (!ESCRIBIR) { console.log('\n(sin --escribir: no se guardó nada)'); process.exit(0) }

let ok = 0, mal = 0
for (let i = 0; i < cambios.length; i += 8) {
  await Promise.all(cambios.slice(i, i + 8).map(async (item) => {
    const r = await fetch(`${BASE}/datos`, { method: 'POST', headers: H,
      body: JSON.stringify({ recurso: 'liquidacion', store: 'zattia', action: 'guardar-item', id: LIQ, item }) })
    if (r.ok) ok++
    else { mal++; console.error(item.foto.nombre, r.status, (await r.text()).slice(0, 120)) }
  }))
  process.stdout.write(`\r  guardados ${ok}/${cambios.length}${mal ? ` (${mal} fallaron)` : ''}`)
}
console.log('')
