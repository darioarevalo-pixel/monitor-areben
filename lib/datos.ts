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
import { esVentaTecnica } from './etl/helpers'
import { traerCostos } from './costos'
import type { Marca } from './nav.datos'
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
/**
 * Desde cuándo se bajan las ventas. Marketing: 35 días. Admin: **un piso FIJO que nunca avanza**.
 *
 * 🔑 **Eso significa que el payload crece con el calendario, no con el negocio.** Aunque no se
 * venda una unidad más, cada mes que pasa agrega filas y ninguna sale nunca. Es la única parte del
 * Monitor que engorda sola.
 *
 * Medido en BDI el 13-ago-2026, para que la próxima discusión no sea a ojo:
 *
 *     ventas 2025 (año entero)          12.887
 *     ventas 2026 (hasta el 13-ago)      7.164   → ritmo ~9.500/año, MÁS LENTO que 2025
 *     venta_detalles dentro de la ventana        102.692   (~9,6 MB del payload de 14,7)
 *     venta_detalles en toda la base              122.804
 *
 * O sea ~50-60k detalles nuevos por año. Proyectado: ~155k a mediados de 2027, ~210k (el doble de
 * hoy) a mediados de 2028. **No es urgente**, y conviene decirlo con el número al lado: el pico de
 * memoria, que era el modo de falla agudo, ya lo sacó el techo de páginas en vuelo de
 * `lib/supabase/rest.ts`.
 *
 * ⚠️ Mover este piso **no es una decisión técnica**: es qué historia ve la gerencia. Resumen y
 * Ventas mensuales comparan contra el año anterior, así que una ventana móvil de 12 meses les
 * corta la comparación. Si algún día hay que moverlo, la salida buena no es recortar sino que los
 * agregados viejos los calcule el servidor —las vistas materializadas ya hacen eso para los
 * totales por mes— y que el navegador baje sólo el detalle reciente. Eso es un proyecto, no un
 * cambio de constante.
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
  /**
   * Cuánto tardó cada fase, en ms. Es lo único que dice si los ~20 segundos de la carga
   * fría son la bajada o el cómputo posterior — el repo no tenía ninguna medición. Los
   * tests no lo pasan, así que para ellos no cambia nada.
   *
   * `tablas` y `detalles` ahora **se solapan**: corren en paralelo. Por eso está `total`,
   * que es el tiempo de pared de la bajada — el único que se puede comparar contra las
   * mediciones viejas, donde `total` era la suma.
   */
  onTiempos?: (t: { tablas: number; detalles: number; total: number }) => void
}

/** Trae las 8 tablas crudas de una marca, listas para computarDatos o para el caché. */
export async function traerDatos({ marca, rol, today, onProgress, onTiempos }: OpcionesFetch): Promise<PayloadCache> {
  const cuenta: Cuenta = CUENTAS[marca]
  const esZattia = marca === 'zattia'

  // Solo Zattia tiene la tabla de colores manuales; si falla, el legacy sigue sin colores.
  const colorManualPromise: Promise<FilaColorManual[]> = esZattia
    ? sbFetch<FilaColorManual>(cuenta, 'variante_color_manual', 'select=product_name,color').catch(() => [])
    : Promise.resolve([])

  const syncMetaPromise = fetchUltimoSync(cuenta.syncWorkflow)

  // 🔑 **Sin `unit_cost`**: el costo ya no sale de Supabase con la anon key (pieza B del escalón 3
  // de la Fase S). Lo sirve `api/_costos.js`, gateado por permiso, y se mergea más abajo sobre
  // estas mismas filas — así `computarDatos` no se entera de nada.
  const selectProductos =
    (esZattia
      ? 'select=id,name,category,sku,proveedor,retailer_price,created_at,active&active=eq.1'
      : 'select=id,name,category,sku,retailer_price,created_at,active&active=eq.1') + '&order=id'

  // Va en paralelo con las tablas: es un viaje chico (450 filas en BDI, 2.676 en Zattia) y no tiene
  // por qué sumarle su tiempo a la bajada. `traerCostos` **no lanza** — sin permiso, o si la puerta
  // se cae, vuelve `{}` y cada producto queda `sinCosto`, que es lo que hay que mostrar.
  const costosPromise = traerCostos(marca)

  const desde = desdeVentas(rol, today)
  const t0 = performance.now()

  // `venta_detalles` es la tabla más grande y su filtro sale del mínimo id de `ventas`. Esperar a
  // que baje `ventas` entera para recién pedirla ponía la más pesada al final, sola, sumando su
  // tiempo al de las otras ocho. Ese mínimo se puede saber con una consulta de UNA fila (mismo
  // filtro, `order=id&limit=1`), así que la sonda va primero y `venta_detalles` arranca junto con
  // las demás. Si la sonda falla, se cae al camino viejo — el mínimo calculado sobre `ventas` — y
  // lo único que se pierde es el paralelismo.
  let msDetalles = 0
  const pedirDetalles = async (minSaleId: number): Promise<FilaDetalle[]> => {
    const t = performance.now()
    const filas = await fetchAll<FilaDetalle>(
      cuenta,
      'venta_detalles',
      `select=sale_id,product_id,size_id,size,quantity&sale_id=gte.${minSaleId}&order=sale_id`,
      onProgress,
      'detalles',
    )
    msDetalles = performance.now() - t
    return filas
  }

  // El error se guarda en vez de propagarse solo: mientras el Promise.all de abajo corre nadie
  // está esperando esta promesa, y un rechazo sin dueño es un unhandled rejection en el browser.
  let errDetalles: unknown = null
  const detallesPromise = sbFetch<Pick<FilaVenta, 'id'>>(
    cuenta,
    'ventas',
    `select=id&date_sale=gte.${desde}&order=id&limit=1`,
  ).then(
    (filas) => pedirDetalles(filas.length ? filas[0].id : 0),
    () => null, // sonda caída: se resuelve después, con el mínimo de `ventas`
  ).catch((e: unknown) => {
    errDetalles = e
    return null
  })

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
        '&date_sale=gte.' + desde + '&order=id',
      onProgress,
      'ventas',
    ),
    syncMetaPromise,
  ])

  const msTablas = performance.now() - t0

  // El costo vuelve a su lugar en la fila cruda, que es lo que hace que nada más abajo cambie:
  // `computarDatos` sigue leyendo `p.unit_cost` y su `sinCosto` sigue siendo `== null`, así que
  // quien no tiene permiso ve exactamente lo mismo que cuando GN no manda el costo.
  const costos = await costosPromise
  for (const p of productos) {
    const c = costos[String(p.id)]
    p.unit_cost = c === undefined ? null : c
  }

  let detalles = await detallesPromise
  if (errDetalles) throw errDetalles
  if (detalles === null) {
    // La sonda no contestó: el mínimo sale de las ventas que ya bajaron, como antes.
    detalles = await pedirDetalles(ventas.length ? Math.min(...ventas.map((v) => v.id)) : 0)
  }
  onTiempos?.({ tablas: msTablas, detalles: msDetalles, total: performance.now() - t0 })

  // Excluir las ventas TÉCNICAS del Monitor (Sesión de Fotos y Fallas): no son ventas reales, sólo
  // descuentan stock, así que inflaban la analítica de rotación y los KPIs. Se descartan la venta y
  // sus detalles antes de pasar al ETL. El criterio vive en `esVentaTecnica` — es el mismo que usan
  // Caducados y el CRM, y ahí está explicado por qué se identifican en positivo.
  const idsTecnicas = new Set(ventas.filter(esVentaTecnica).map((v) => String(v.id)))
  const ventasReales = idsTecnicas.size ? ventas.filter((v) => !idsTecnicas.has(String(v.id))) : ventas
  const detallesReales = idsTecnicas.size ? detalles.filter((d) => !idsTecnicas.has(String(d.sale_id))) : detalles

  return { productos, inventario, vmMes, vmCat, vmFundas, colorManual, ventas: ventasReales, detalles: detallesReales, syncMeta }
}
