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
 * 🔑 **Una venta es de la línea si TIENE UN RENGLÓN de la línea** — no se corta al medio.
 *
 * Una venta mixta (una prenda de Zattia y una de Stunned en el mismo ticket) queda en **las dos**,
 * que es el mismo criterio con el que Norte y el Memo dicen que la fila «Ventas» **no suma a lo
 * ancho**. Medido el 22-ago contra producción: de 634 ventas en 30 días, 620 tienen renglón de
 * Zattia y 19 de Stunned — **5 cuentan en las dos**.
 *
 * 🔴 **La primera versión de esto NO filtraba `ventas` y estaba mal.** El razonamiento era «una
 * venta mixta es de las dos, así que no se filtra», y confundía dos cosas: dejarlas **todas** no es
 * dejar las mixtas en las dos, es dejar también las que no tienen nada de la línea. Se vio
 * caminando la pantalla, con los 4.246 tests en verde: «Cómo viene la venta» de Stunned mostraba
 * **1 prenda online con 140 compras** y 17 en el local con 463, porque `serieDiaria`
 * (`lib/mkt-ventas/core.ts`) cuenta las compras recorriendo `ventas` y las unidades desde
 * `detalles`. Una cifra de la marca entera al lado de una de la línea, sin rótulo — exactamente lo
 * que el selector existe para que no pase.
 *
 * ⚠️ **Lo que queda afuera de las dos líneas**: la venta sin **ningún** renglón de producto activo.
 * Medido: **1 de 634** (0,16 %). No es de ninguna línea y por eso no se le regala a ninguna.
 */
export function filtrarPorLinea(payload: PayloadCache, linea: Linea): PayloadCache {
  if (linea === 'bdi') return payload

  const quiereStunned = linea === 'stunned'
  const deLaLinea = (sku: string | null | undefined) => esStunned(sku) === quiereStunned

  const idsTodos = new Set(payload.productos.map((p) => String(p.id)))
  const productos = payload.productos.filter((p) => deLaLinea(p.sku))
  const ids = new Set(productos.map((p) => String(p.id)))

  const detalles = payload.detalles.filter((d) => ids.has(String(d.product_id)))
  const conRenglon = new Set(detalles.map((d) => String(d.sale_id)))

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
    detalles,
    /**
     * Las ventas que tienen al menos un renglón de la línea. Las mixtas sobreviven en las dos —es el
     * punto—; la que no tiene nada de esta línea se va, y con ella el número de compras deja de ser
     * el de la marca entera.
     */
    ventas: payload.ventas.filter((v) => conRenglon.has(String(v.id))),
  }
}
