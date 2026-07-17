/**
 * Baja un fixture real de Supabase para el test de paridad del ETL (Fase 4).
 *
 * Es SOLO LECTURA: replica los mismos queries que fetchFresh (index.html:2060),
 * nada más. No confundir con api/sync.js, que escribe en Supabase y pega a
 * Gestión Nube (límite 100/min).
 *
 * El fixture queda en tests/fixtures/ y NO se commitea: son ventas reales.
 *
 *   npm run fixture-etl            # las dos cuentas
 *   npm run fixture-etl -- zattia  # una sola
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const DESTINO = join(RAIZ, 'tests', 'fixtures')

// Duplicadas de lib/cuentas.ts a propósito: este script es .mjs y no pasa por el
// bundler, así que no puede importar TS. Si se rotan las keys, se rotan acá también.
const CUENTAS = {
  bdi: {
    url: 'https://srqzzffmiiescffabtlc.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNycXp6ZmZtaWllc2NmZmFidGxjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNzg1NDksImV4cCI6MjA5MDk1NDU0OX0.UJGWTPCXhhxv2Q-4twUBvOivPLUk0SSQvyvtEkDmWLg',
  },
  zattia: {
    url: 'https://avmdktmyseonacxycimz.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2bWRrdG15c2VvbmFjeHljaW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0OTUzNDcsImV4cCI6MjA5MTA3MTM0N30.mqm1dhY2HUHlSUHyTfNjA7MphjicbKJqFo6jc_guTRo',
  },
}

/** Puerto de sbFetchWithCount + fetchAll (index.html:1950-1985), sin el DOM. */
async function sbFetch(cuenta, table, params, conCount = false) {
  const res = await fetch(`${cuenta.url}/rest/v1/${table}?${params}`, {
    headers: {
      apikey: cuenta.key,
      Authorization: 'Bearer ' + cuenta.key,
      ...(conCount ? { Prefer: 'count=exact' } : {}),
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Error ${res.status} en ${table}: ${text.substring(0, 150)}`)
  }
  const data = await res.json()
  if (!conCount) return data
  const range = res.headers.get('Content-Range') || ''
  return { data, total: parseInt(range.split('/')[1] || '0', 10) }
}

async function fetchAll(cuenta, table, baseParams) {
  const batchSize = 1000
  const { data: first, total } = await sbFetch(cuenta, table, `${baseParams}&limit=${batchSize}&offset=0`, true)
  if (first.length >= total || first.length < batchSize) return first

  const offsets = []
  for (let off = batchSize; off < total; off += batchSize) offsets.push(off)
  const pages = await Promise.all(
    offsets.map((off) => sbFetch(cuenta, table, `${baseParams}&limit=${batchSize}&offset=${off}`)),
  )
  return first.concat(...pages)
}

/**
 * Réplica de fetchFresh. Las diferencias por cuenta (columnas de productos,
 * fundas solo en BDI, colorManual solo en Zattia) se copian tal cual: si el
 * fixture no las respeta, el test de paridad prueba una entrada que no existe.
 *
 * El rango de ventas es el del rol normal ('2025-01-01'); el recorte a 35 días
 * del rol marketing no se usa acá porque haría el fixture más chico y más pobre.
 */
async function bajarCuenta(nombre) {
  const cuenta = CUENTAS[nombre]
  const esZattia = nombre === 'zattia'

  const [productos, inventario, vmMes, vmCat, vmFundas, colorManual, ventas] = await Promise.all([
    fetchAll(cuenta, 'productos',
      (esZattia
        ? 'select=id,name,category,sku,proveedor,retailer_price,unit_cost,created_at,active&active=eq.1'
        : 'select=id,name,category,sku,retailer_price,unit_cost,created_at,active&active=eq.1') + '&order=id'),
    fetchAll(cuenta, 'inventario', 'select=product_id,product_name,size_id,size_name,available_quantity,store_name,sku,barcode&order=product_id')
      .catch(() => fetchAll(cuenta, 'inventario', 'select=product_id,product_name,size_id,size_name,available_quantity,store_name&order=product_id')),
    fetchAll(cuenta, 'ventas_por_mes', 'select=mes,channel,cantidad_ventas,total_items,promedio_items_por_venta&order=mes'),
    fetchAll(cuenta, 'ventas_por_categoria_mes', 'select=mes,categoria,total_items&order=mes'),
    esZattia
      ? Promise.resolve([])
      : fetchAll(cuenta, 'fundas_por_modelo_mes', 'select=mes,modelo,product_id,product_name,product_created_at,total_items&order=mes'),
    esZattia
      ? sbFetch(cuenta, 'variante_color_manual', 'select=product_name,color').catch(() => [])
      : Promise.resolve([]),
    fetchAll(cuenta, 'ventas',
      (esZattia ? 'select=id,date_sale,channel' : 'select=id,date_sale,channel,channel_id') +
      '&date_sale=gte.2025-01-01&order=id'),
  ])

  const minSaleId = ventas.length ? Math.min(...ventas.map((v) => v.id)) : 0
  const detalles = await fetchAll(cuenta, 'venta_detalles',
    `select=sale_id,product_id,size_id,size,quantity&sale_id=gte.${minSaleId}&order=sale_id`)

  // colorManualMap: el legacy lo arma en fetchFresh y computarDatos lo lee del
  // global. Acá viaja en el fixture y el test se lo pasa por ContextoETL.
  const colorManualMap = {}
  ;(colorManual || []).forEach((r) => { colorManualMap[r.product_name] = r.color })

  // syncMeta entra y sale del ETL sin tocarse (no se computa), así que un valor
  // fijo alcanza y evita pegarle a la API de GitHub.
  const syncMeta = { last_run: '2026-07-16T03:00:00Z', latest_status: 'completed', latest_conclusion: 'success' }

  return {
    entrada: { productos, ventas, detalles, inventario, vmMes, vmCat, vmFundas, syncMeta },
    ctx: { colorManualMap },
  }
}

const pedidas = process.argv.slice(2).filter((a) => CUENTAS[a])
const cuentas = pedidas.length ? pedidas : Object.keys(CUENTAS)

mkdirSync(DESTINO, { recursive: true })
for (const nombre of cuentas) {
  const fixture = await bajarCuenta(nombre)
  const archivo = join(DESTINO, `etl-${nombre}.json`)
  writeFileSync(archivo, JSON.stringify(fixture))
  const { entrada } = fixture
  console.log(
    `${nombre}: productos=${entrada.productos.length} ventas=${entrada.ventas.length} ` +
    `detalles=${entrada.detalles.length} inventario=${entrada.inventario.length} ` +
    `vmMes=${entrada.vmMes.length} vmCat=${entrada.vmCat.length} vmFundas=${entrada.vmFundas.length} ` +
    `colorManual=${Object.keys(fixture.ctx.colorManualMap).length}`,
  )
}
