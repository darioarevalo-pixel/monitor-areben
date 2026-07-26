/**
 * Caché del payload del ETL, en IndexedDB.
 *
 * **Por qué se movió (26-jul-2026).** Vivía en localStorage y solo guardaba si el payload
 * serializado medía menos de 8 MB; si no, no guardaba **y no avisaba**. El payload de BDI
 * pesa ~14,7 MB (solo `detalles` son ~9,6 MB en más de 100.000 filas), así que el caché de
 * BDI no se escribía nunca: en vez de pagar la carga fría cada 6 horas se pagaba en CADA
 * entrada, ~20 segundos, para todo el equipo. Zattia mide ~5 MB y entraba raspando, contra
 * un techo real de localStorage que ronda los 5 MB de caracteres.
 *
 * IndexedDB no tiene ese techo y guarda con structured clone, así que además desaparecen el
 * `JSON.stringify` y el `JSON.parse` de 15 MB que corrían en el hilo principal.
 *
 * **La cabecera anterior decía que este archivo no se tocara "hasta que no quede iframe",
 * porque compartía la entrada de localStorage con el legacy. Ya no queda iframe** — la
 * migración cerró en julio e `index.html` sobrevive solo para los tests de paridad. Esa
 * restricción está vencida y por eso se borró: fue lo que mantuvo el bug congelado. Hoy
 * este caché no comparte estado con nada.
 *
 * **No hay tope de tamaño.** Chequearlo obligaría a serializar el payload entero, que es
 * justo el costo que vinimos a sacar. La salvaguarda ya no es un número sino el manejo de
 * error: si IndexedDB rechaza (cuota, modo privado), `guardarCache` devuelve
 * `{ ok: false, motivo }` y se ve — en consola y en pantalla. La regla es "guarda, y si no
 * puede lo dice", nunca más "no guarda callado".
 */

import { almacenActivo, degradarAMemoria } from './almacen'
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

/** 6 horas, igual que el legacy (index.html:1998). */
export const TTL_MS = 6 * 60 * 60 * 1000

/**
 * Lo que se guarda son las filas CRUDAS, previas al cómputo — no la salida de
 * `computarDatos`. Con localStorage era obligatorio: `fmKeyPids` contiene `Set`s y
 * `JSON.stringify` los aplasta a `{}` sin avisar. Con IndexedDB **ya no lo es** (el
 * structured clone serializa `Set` y `Map` bien), así que cachear la salida del ETL pasó a
 * ser una opción real — pero es otro cambio, y hay que medir antes si el cómputo pesa.
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
  /**
   * Marca a la que pertenece este payload. Se estampa al guardar y se valida al leer: si no
   * coincide con la pedida (o falta, en entradas viejas sin sello), la entrada se descarta.
   * Cierra un bug real —una entrada de BDI servida bajo la clave de Zattia mostraba el
   * catálogo y el stock equivocados— sin depender de que el refresco de fondo la pise.
   */
  marca?: Marca
}

export type ResultadoGuardado = { ok: true } | { ok: false; motivo: string }

/** `v5` porque `v4` es lo que quedó en localStorage y `limpiarCacheLegacy` borra. */
export function claveCache(marca: Marca): string {
  return 'monitor_v5_' + (marca === 'zattia' ? 'zattia' : 'bdi')
}

/** Las claves de la etapa localStorage. Ocupaban ~5 MB del cupo del origen sin servir a nadie. */
export const CLAVES_LS_LEGACY = ['monitor_v4_bdi', 'monitor_v4_zattia'] as const

/**
 * Borra el caché viejo de localStorage. No se migra su contenido a propósito: BDI no tiene
 * nada que migrar (nunca guardó, ese era el bug) y leer el de Zattia costaría un `JSON.parse`
 * de 5 MB para ahorrar una sola carga fría, una sola vez, por navegador.
 *
 * Se llama desde `leerCache` sin flag de "ya lo hice": un `removeItem` sobre una clave
 * ausente cuesta microsegundos y evita un estado global que le ensucie el orden a los tests.
 */
export function limpiarCacheLegacy(): void {
  try {
    if (typeof localStorage === 'undefined') return
    for (const k of CLAVES_LS_LEGACY) localStorage.removeItem(k)
  } catch {
    /* localStorage deshabilitado: no hay nada que limpiar */
  }
}

/** `ignorarVencimiento` habilita el stale-while-revalidate del store (camino 2). */
export async function leerCache(marca: Marca, ignorarVencimiento = false): Promise<EntradaCache | null> {
  try {
    limpiarCacheLegacy()
    const cached = await almacenActivo().leer<EntradaCache>(claveCache(marca))
    if (!cached) return null
    // Sello de marca: una entrada de otra marca (o sin sello, de una versión vieja) no es
    // válida para esta marca, sin importar la edad.
    if (cached.marca !== marca) return null
    if (!ignorarVencimiento && Date.now() - cached.timestamp > TTL_MS) return null
    return cached
  } catch {
    degradarAMemoria()
    return null
  }
}

/**
 * Guarda el payload. **Nunca lanza**: devuelve el resultado para que el llamador lo muestre.
 * Que un caché no se guarde tiene que ser visible — invisible ya nos costó una vez.
 */
export async function guardarCache(marca: Marca, data: PayloadCache, timestamp: number): Promise<ResultadoGuardado> {
  try {
    await almacenActivo().guardar(claveCache(marca), { timestamp, data, marca })
    return { ok: true }
  } catch (e) {
    const motivo = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
    console.warn(`[cache] no se pudo guardar el caché de ${marca} — ${motivo}. La próxima carga baja todo de nuevo (~20 s).`)
    degradarAMemoria()
    return { ok: false, motivo }
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
