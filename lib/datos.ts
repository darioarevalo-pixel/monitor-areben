/**
 * Traer los datos crudos de una marca. Port de fetchFresh (index.html:2060) y
 * fetchUltimoSync (2165), sin nada de DOM: el progreso sale por callback y los
 * errores se lanzan (el legacy los pintaba en #status desde adentro).
 *
 * Los `select=` son los mismos, campo por campo, y las asimetrías entre marcas
 * también: no son accidentes, son las columnas que cada base tiene.
 */

import { CUENTAS, GH_REPO, type Cuenta } from './cuentas'
import { fetchAll, sbFetch } from './supabase/rest'
import type { Marca } from './nav.generated'
import type {
  FilaColorManual,
  FilaDetalle,
  FilaFundasPorModeloMes,
  FilaInventario,
  FilaProducto,
  FilaVenta,
  FilaVentasPorCategoriaMes,
  FilaVentasPorMes,
  SyncMeta,
} from './etl/tipos'
import type { PayloadCache } from './cache'

type RunGitHub = {
  status: string
  conclusion: string | null
  run_started_at?: string
  created_at?: string
}

/**
 * Le pregunta a GitHub cuándo corrió por última vez el workflow de sync.
 *
 * Va sin token, así que **depende de que el repo siga siendo público**. Si algún
 * día se hace privado, esto devuelve null en silencio y el cartel de "última
 * actualización" desaparece sin que nadie se entere.
 */
export async function fetchUltimoSync(workflowFile: string | null): Promise<SyncMeta> {
  if (!workflowFile) return null
  try {
    const url = `https://api.github.com/repos/${GH_REPO}/actions/workflows/${workflowFile}/runs?per_page=10`
    const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } })
    if (!res.ok) return null
    const j = (await res.json()) as { workflow_runs?: RunGitHub[] }
    const runs = j.workflow_runs || []
    if (!runs.length) return null
    const latest = runs[0]
    const lastSuccess = runs.find((r) => r.conclusion === 'success')
    return {
      last_run: lastSuccess ? lastSuccess.run_started_at || lastSuccess.created_at || null : null,
      latest_status: latest.status,
      latest_conclusion: latest.conclusion,
    }
  } catch {
    return null
  }
}

/**
 * A marketing se le cargan solo 35 días de ventas y al resto desde 2025-01-01
 * (index.html:2084). No es cosmético: cambia el rango de TODO lo que el ETL
 * computa, así que dos usuarios ven números legítimamente distintos.
 */
function desdeVentas(rol: 'admin' | 'marketing', today: Date): string {
  return rol === 'marketing'
    ? new Date(today.getTime() - 35 * 86400000).toISOString().slice(0, 10)
    : '2025-01-01'
}

export type OpcionesFetch = {
  marca: Marca
  rol: 'admin' | 'marketing'
  today: Date
  /** Se llama con cada tabla que termina, para mover la barra de progreso. */
  onProgress?: (label: string) => void
}

/** Trae las 8 tablas crudas de una marca, listas para computarDatos o para el caché. */
export async function traerDatos({ marca, rol, today, onProgress }: OpcionesFetch): Promise<PayloadCache> {
  const cuenta: Cuenta = CUENTAS[marca]
  const esZattia = marca === 'zattia'

  // Solo Zattia tiene la tabla de colores manuales; si falla, el legacy sigue sin colores.
  const colorManualPromise: Promise<FilaColorManual[]> = esZattia
    ? sbFetch<FilaColorManual>(cuenta, 'variante_color_manual', 'select=product_name,color').catch(() => [])
    : Promise.resolve([])

  const syncMetaPromise = fetchUltimoSync(cuenta.syncWorkflow)

  const selectProductos =
    (esZattia
      ? 'select=id,name,category,sku,proveedor,retailer_price,unit_cost,created_at,active&active=eq.1'
      : 'select=id,name,category,sku,retailer_price,unit_cost,created_at,active&active=eq.1') + '&order=id'

  const [productos, inventario, vmMes, vmCat, vmFundas, colorManual, ventas, syncMeta] = await Promise.all([
    fetchAll<FilaProducto>(cuenta, 'productos', selectProductos, onProgress, 'productos'),
    // Algunas bases no tienen sku/barcode en inventario: el legacy reintenta con el select corto.
    fetchAll<FilaInventario>(
      cuenta,
      'inventario',
      'select=product_id,product_name,size_id,size_name,available_quantity,store_name,sku,barcode&order=product_id',
      onProgress,
      'inventario',
    ).catch(() =>
      fetchAll<FilaInventario>(
        cuenta,
        'inventario',
        'select=product_id,product_name,size_id,size_name,available_quantity,store_name&order=product_id',
        onProgress,
        'inventario',
      ),
    ),
    fetchAll<FilaVentasPorMes>(
      cuenta,
      'ventas_por_mes',
      'select=mes,channel,cantidad_ventas,total_items,promedio_items_por_venta&order=mes',
      onProgress,
      'vmMes',
    ),
    fetchAll<FilaVentasPorCategoriaMes>(
      cuenta,
      'ventas_por_categoria_mes',
      'select=mes,categoria,total_items&order=mes',
      onProgress,
      'vmCat',
    ),
    // Fundas por modelo es de BDI: Zattia no vende fundas.
    esZattia
      ? Promise.resolve([] as FilaFundasPorModeloMes[])
      : fetchAll<FilaFundasPorModeloMes>(
          cuenta,
          'fundas_por_modelo_mes',
          'select=mes,modelo,product_id,product_name,product_created_at,total_items&order=mes',
          onProgress,
          'vmFundas',
        ),
    colorManualPromise,
    fetchAll<FilaVenta>(
      cuenta,
      'ventas',
      (esZattia ? 'select=id,date_sale,channel' : 'select=id,date_sale,channel,channel_id') +
        '&date_sale=gte.' + desdeVentas(rol, today) + '&order=id',
      onProgress,
      'ventas',
    ),
    syncMetaPromise,
  ])

  // venta_detalles se pide recién acá porque el filtro sale del mínimo id de ventas:
  // sin esto habría que traer la tabla entera, que es la más grande de todas.
  const minSaleId = ventas.length ? Math.min(...ventas.map((v) => v.id)) : 0
  const detalles = await fetchAll<FilaDetalle>(
    cuenta,
    'venta_detalles',
    `select=sale_id,product_id,size_id,size,quantity&sale_id=gte.${minSaleId}&order=sale_id`,
    onProgress,
    'detalles',
  )

  return { productos, inventario, vmMes, vmCat, vmFundas, colorManual, ventas, detalles, syncMeta }
}
