/**
 * Baja un fixture real de Supabase para el test de paridad del ETL (Fase 4).
 *
 * Es SOLO LECTURA: replica los mismos queries que fetchFresh (index.html:2060),
 * nada más. Quien escribe en Supabase pegándole a Gestión Nube es el sync de
 * `scripts/sync-diario.js` (límite 100/min), que es otra cosa.
 *
 * 🔴 **Va con la clave de SERVICIO, y por eso el "solo lectura" de arriba es una regla y no una
 * descripción**: esa clave se saltea el RLS entero, así que acá dentro sólo puede haber `fetch` de
 * lectura. Antes iba con la anon key y desde la Fase S (14-ago-2026) eso **ya no alcanza**: el
 * fixture pide `productos.unit_cost`, `inventario` y las tres vistas materializadas, que son justo
 * lo que se le revocó a `anon`. PostgREST contestaba 401 y eso dejó el job `paridad` del CI **rojo
 * para siempre**, que es peor que no tener CI: tapa al rojo de verdad. Ver la Fase S en AGENTS.md.
 *
 * El fixture queda en tests/fixtures/ y NO se commitea: son ventas reales.
 *
 *   npm run fixture-etl            # las dos cuentas
 *   npm run fixture-etl -- zattia  # una sola
 *
 * Las claves salen del `.env` (local) o del entorno (los secrets del repo, los mismos que ya usan
 * los workflows de sync: no hay secret nuevo que crear). ⚠️ El `.env` de Bruno tiene la de BDI y
 * **no** la de Zattia: en local `-- bdi` anda y `zattia` corta diciendo qué le falta.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const DESTINO = join(RAIZ, 'tests', 'fixtures')

/** Mismo lector de `.env` que `apply-rls.mjs`: sin dotenv, y tolerando que no exista (el CI). */
function leerDotEnv() {
  const archivo = join(RAIZ, '.env')
  if (!existsSync(archivo)) return {}
  return Object.fromEntries(
    readFileSync(archivo, 'utf8')
      .split('\n')
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=')
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
      }),
  )
}

// Las URL están duplicadas de lib/cuentas.ts a propósito: este script es .mjs y no pasa por el
// bundler, así que no puede importar TS. Los nombres de las variables son los que ya usan los
// workflows de sync, así que no hay ningún secret nuevo que crear.
export const CUENTAS = {
  bdi: {
    url: 'https://srqzzffmiiescffabtlc.supabase.co',
    varClave: 'SUPABASE_SERVICE_KEY',
  },
  zattia: {
    url: 'https://avmdktmyseonacxycimz.supabase.co',
    varClave: 'ZATTIA_SUPABASE_SERVICE_KEY',
  },
}

/**
 * 🔑 **La clave tiene que ser de servicio Y del proyecto que dice la URL.**
 * Las dos claves de las marcas estuvieron anotadas **al revés** (BDI ↔ Zattia), así que cruzar los
 * secrets es un error que ya pasó. Sin este chequeo los tres casos malos —falta, es anon, está
 * cruzada— terminan en el MISMO 401 pelado de PostgREST, que es exactamente el síntoma que este
 * cambio vino a sacar del CI. Corta con el nombre de la variable adentro del mensaje.
 */
export function verificarClave(marca, url, clave) {
  const nombre = CUENTAS[marca].varClave
  if (!clave) {
    throw new Error(
      `Falta ${nombre}. Desde la Fase S el fixture NO se baja con la anon key: pide ` +
      `productos.unit_cost, inventario y las vistas materializadas, que le fueron revocadas a anon. ` +
      `Va en el .env local o como secret del repo (el secret ya existe: lo usan los syncs).`,
    )
  }
  let payload
  try {
    payload = JSON.parse(Buffer.from(clave.split('.')[1] || '', 'base64').toString('utf8'))
  } catch {
    throw new Error(`${nombre} no es un JWT de Supabase.`)
  }
  if (payload.role !== 'service_role') {
    throw new Error(
      `${nombre} tiene role="${payload.role}" y hace falta "service_role": con cualquier otro rol ` +
      `el RLS deja afuera media entrada del ETL y PostgREST contesta 401.`,
    )
  }
  const refUrl = new URL(url).hostname.split('.')[0]
  if (payload.ref !== refUrl) {
    throw new Error(
      `${nombre} es del proyecto "${payload.ref}" y ${marca} vive en "${refUrl}": las claves de las ` +
      `dos marcas están cruzadas.`,
    )
  }
  return true
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
  const { url, varClave } = CUENTAS[nombre]
  // El entorno gana sobre el `.env`: en el CI no hay archivo y los secrets llegan por ahí.
  const clave = process.env[varClave] || leerDotEnv()[varClave] || ''
  verificarClave(nombre, url, clave)
  const cuenta = { url, key: clave }
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

// ⛔ La descarga corre SÓLO si el script se ejecuta directo. `tests/fixture-etl-claves.test.ts`
// importa `verificarClave` de acá, y sin este guard importarlo se bajaría 20 MB de ventas reales
// en cada corrida de la suite.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
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
}
