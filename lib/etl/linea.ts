/**
 * **Partir el payload del ETL por línea de negocio.** Puro, sin red y sin store.
 *
 * # Por qué existe
 *
 * Las ~20 pantallas que cuelgan de `useDatosMonitor` mezclan Zattia y Stunned y no lo dicen: son la
 * misma base, el mismo Gestión Nube y hasta el mismo depósito. Bruno lo dijo el 22-ago-2026 —*«en la
 * dinámica diaria no veo las ventas, no veo el análisis; algunas tareas operativas están bien
 * unificarlas, pero otras necesito verlas para ver cómo viene»*—. Esto es lo que deja que una
 * pantalla pida **una** línea.
 *
 * # Dónde se aplica, y por qué ahí
 *
 * Sobre el payload **crudo, antes de `computarDatos`**. Filtrar después no serviría: los agregados
 * (agotamiento, ventas por color, por talle, fases) ya vendrían calculados sobre la mezcla, y
 * separarlos a mano sería recalcularlos peor. Y como el payload crudo es lo que está en IndexedDB,
 * cambiar de línea **no baja un byte ni cambia la clave del caché**: vuelve a computar lo que ya
 * está en memoria.
 *
 * # 🔴 Lo que NO se puede partir, y por eso decide el alcance
 *
 * `vmMes`, `vmCat` y `vmFundas` salen de **vistas materializadas ya agregadas por mes**: no traen
 * producto, así que no hay con qué separarlas. Pasan intactas a propósito. La consecuencia es
 * concreta: **«Ventas mensuales» no puede llevar selector de línea** y sigue mostrando el total de
 * la marca. Una pantalla que dijera «Stunned» arriba de este número estaría afirmando algo falso.
 */

import { esStunned, type Linea } from '@/lib/lineas'
import type { PayloadCache } from '@/lib/cache'

/**
 * El payload de una sola línea.
 *
 * `linea` es de las que cuelgan de la marca del payload (`lineasDeMarca`). Para `bdi` no hay nada
 * que partir y se devuelve el mismo objeto.
 *
 * 🔑 **`ventas` NO se filtra, y no es un olvido.** Una venta mixta —una prenda de Zattia y una de
 * Stunned en el mismo ticket— pertenece a las dos líneas: el ticket es uno solo y no se puede cortar
 * al medio. Es el mismo criterio con el que Norte y el Memo dicen que la fila «Ventas» **no suma a
 * lo ancho**. Medido el 22-ago contra producción, en 30 días son **6 ventas** las que cuentan en las
 * dos; unidades y plata, en cambio, cierran exactas (908 + 19 = 927 u · $22.381.563 + $619.710 =
 * $23.001.273).
 */
export function filtrarPorLinea(payload: PayloadCache, linea: Linea): PayloadCache {
  if (linea === 'bdi') return payload

  const quiereStunned = linea === 'stunned'
  const deLaLinea = (sku: string | null | undefined) => esStunned(sku) === quiereStunned

  const idsTodos = new Set(payload.productos.map((p) => String(p.id)))
  const productos = payload.productos.filter((p) => deLaLinea(p.sku))
  const ids = new Set(productos.map((p) => String(p.id)))

  return {
    ...payload,
    productos,
    /**
     * 🔴 **El inventario TIENE que filtrarse, y por producto.** `computarDatos` llama
     * `allVariantesHuerfanas` a las filas de stock cuyo producto no está en `productos` —variantes
     * recién cargadas en GN—, así que un inventario sin filtrar convierte **todas** las variantes de
     * la otra línea en huérfanas y las muestra en las pantallas que las dibujan.
     *
     * La fila que no tiene producto conocido cae al SKU, que es el único dato que le queda: son
     * justamente las huérfanas de verdad, y se reparten por línea como cualquier otra.
     */
    inventario: payload.inventario.filter((i) => {
      const pid = String(i.product_id)
      return idsTodos.has(pid) ? ids.has(pid) : deLaLinea(i.sku)
    }),
    detalles: payload.detalles.filter((d) => ids.has(String(d.product_id))),
  }
}
