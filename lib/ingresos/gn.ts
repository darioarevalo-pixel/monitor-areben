/**
 * El cruce entre el nombre comercial que se propone en Ingresos y el espejo de Gestión Nube.
 *
 * Es una **señal, no un candado**. El nombre comercial de un diseño es una propuesta mientras el
 * producto no exista en GN; cuando existe, manda el de allá. Quién está en cada instancia lo dice
 * el **dato**, no el estado del ingreso: un ingreso "arribado" cuyo diseño todavía no se cargó
 * sigue siendo propuesta, y uno "en tránsito" que ya tiene su producto creado, no. Por eso el ✓
 * sale de este cruce y no de `Ingreso.estado`, que además es un select libre sin transiciones
 * (cualquiera salta de "cotizando" a "arribado") y no aguanta que se le cuelgue una regla.
 *
 * **El cruce es exacto —normalizado— y sin parecidos, a propósito.** Acá un falso positivo es
 * mucho peor que un falso negativo: un ✓ de más le dice al equipo "ese ya está" de un producto que
 * nadie cargó. `buscarProd` de tncat tolera typos porque lo que se pierde es una foto sin asignar;
 * lo que se pierde acá es un producto sin dar de alta. Sin ✓ no se afirma nada: se sigue viendo el
 * nombre como hasta ahora.
 */

import { norm } from '../tncat/matching'

/** Lo mínimo que hace falta del espejo. `allProductos` del ETL lo cumple. */
export type ProductoGN = { name?: string | null; sku?: string | null }

/** Nombre normalizado → el producto que lo ocupa. */
export type IndiceGN = Map<string, ProductoGN>

/**
 * Índice de los nombres del espejo. Con dos productos de igual nombre gana el primero: el índice
 * contesta "existe", no "cuál", y para eso cualquiera de los dos sirve.
 */
export function indiceNombresGN(productos: readonly ProductoGN[] | null | undefined): IndiceGN {
  const m: IndiceGN = new Map()
  for (const p of productos || []) {
    const k = norm(p?.name)
    if (k && !m.has(k)) m.set(k, p)
  }
  return m
}

/**
 * El producto de Gestión Nube que ya se llama así, o `null`. Un diseño sin nombre escrito nunca
 * matchea: `norm('')` es `''` y el índice no guarda la clave vacía.
 */
export function productoEnGN(nombre: string | null | undefined, indice: IndiceGN): ProductoGN | null {
  const k = norm(nombre)
  return (k ? indice.get(k) : undefined) ?? null
}
