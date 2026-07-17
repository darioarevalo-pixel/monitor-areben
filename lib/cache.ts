/**
 * Caché de datos en localStorage. Port de getCacheKey / loadCache / saveCache
 * (index.html:1987-2011).
 *
 * ⚠️ **ESTE ARCHIVO COMPARTE ESTADO CON EL LEGACY.** Shell e iframe son
 * same-origin, así que leen y escriben literalmente la misma entrada de
 * localStorage. Eso es una ventaja — el que carga primero le calienta el caché al
 * otro, y la app arranca rápido en los dos mundos — pero tiene un precio:
 *
 *   **la clave, el formato del payload y el TTL tienen que ser idénticos a los del
 *   legacy.** Si divergen, no falla nada de forma visible: simplemente conviven
 *   dos cachés y las secciones migradas muestran números distintos de las
 *   embebidas. Es el peor modo de falla posible, porque parece que funciona.
 *
 * Nada de esto se cambia hasta que no quede iframe. Ahí sí se puede repensar
 * (RSC, fetch cache, lo que sea) sin coordinar con nadie.
 */

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

/** 6 horas, igual que index.html:1998. */
export const TTL_MS = 6 * 60 * 60 * 1000

/** Tope de 8 MB sobre el string serializado (index.html:2007). */
const LIMITE_BYTES = 8 * 1024 * 1024

/**
 * Lo que se guarda son las filas CRUDAS, previas al cómputo — no la salida de
 * computarDatos. Es a propósito y conviene que siga así: `fmKeyPids` contiene
 * Sets, que JSON.stringify serializa como `{}` sin avisar.
 */
export type PayloadCache = {
  productos: FilaProducto[]
  inventario: FilaInventario[]
  vmMes: FilaVentasPorMes[]
  vmCat: FilaVentasPorCategoriaMes[]
  vmFundas: FilaFundasPorModeloMes[]
  colorManual: FilaColorManual[]
  ventas: FilaVenta[]
  detalles: FilaDetalle[]
  syncMeta: SyncMeta
}

export type EntradaCache = {
  timestamp: number
  data: PayloadCache
}

/**
 * getCacheKey (index.html:1987). El legacy compara `currentCuenta === CUENTAS.zattia`
 * y cae a 'bdi' por defecto; acá la marca es explícita y el resultado es el mismo.
 */
export function claveCache(marca: Marca): string {
  return 'monitor_v4_' + (marca === 'zattia' ? 'zattia' : 'bdi')
}

/** loadCache (index.html:1991). `ignorarVencimiento` habilita el stale-while-revalidate. */
export function leerCache(marca: Marca, ignorarVencimiento = false): EntradaCache | null {
  try {
    const raw = localStorage.getItem(claveCache(marca))
    if (!raw) return null
    const cached = JSON.parse(raw) as EntradaCache
    if (!ignorarVencimiento) {
      const age = Date.now() - cached.timestamp
      if (age > TTL_MS) return null
    }
    return cached
  } catch {
    return null
  }
}

/**
 * saveCache (index.html:2004). Si el payload pasa los 8 MB **no guarda y no
 * avisa** — el legacy hace exactamente eso. La app sigue andando, solo que sin
 * caché: cada carga baja todo de nuevo.
 */
export function guardarCache(marca: Marca, data: PayloadCache, timestamp: number): void {
  try {
    const payload = JSON.stringify({ timestamp, data })
    if (payload.length < LIMITE_BYTES) {
      localStorage.setItem(claveCache(marca), payload)
    }
  } catch {
    /* localStorage lleno, ignorar */
  }
}

/** colorManualMap (index.html:2015 y 2098): el legacy lo reconstruye igual en los dos lados. */
export function mapaColorManual(filas: FilaColorManual[] | null | undefined): Record<string, string> {
  const m: Record<string, string> = {}
  ;(filas || []).forEach((r) => {
    m[r.product_name] = r.color
  })
  return m
}
