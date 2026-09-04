/**
 * Modelos — lo derivado, puro. La cara tipada del núcleo compartido está abajo de todo.
 *
 * ⛔ **Nada de lo que valida o normaliza vive acá**: eso es `core.core.js`, que es JS plano porque
 * lo importa `api/_modelos.js`. Acá va sólo lo que mira la pantalla.
 */

import {
  alturaNormalizada as alturaNormalizadaJs,
  claveDeNombre as claveDeNombreJs,
  CLAVES_ESTADO as CLAVES_ESTADO_JS,
  CLAVES_MEDIDA as CLAVES_MEDIDA_JS,
  esDeLaMarca as esDeLaMarcaJs,
  esDirecta as esDirectaJs,
  esElegible as esElegibleJs,
  ESTADOS as ESTADOS_JS,
  fichaQueChoca as fichaQueChocaJs,
  instagramNormalizado as instagramNormalizadoJs,
  medidasNormalizadas as medidasNormalizadasJs,
  motivoModeloInvalido as motivoModeloInvalidoJs,
  talleNormalizado as talleNormalizadoJs,
} from './core.core.js'
import type { EstadoModelo, MedidasModelo, Modelo } from './tipos'

export const ESTADOS = ESTADOS_JS as ReadonlyArray<{ key: EstadoModelo; label: string }>
export const CLAVES_ESTADO = CLAVES_ESTADO_JS as ReadonlyArray<EstadoModelo>
export const CLAVES_MEDIDA = CLAVES_MEDIDA_JS as ReadonlyArray<keyof MedidasModelo>

export const talleNormalizado = talleNormalizadoJs as (v: unknown) => string
export const alturaNormalizada = alturaNormalizadaJs as (v: unknown) => string
export const instagramNormalizado = instagramNormalizadoJs as (v: unknown) => string
export const medidasNormalizadas = medidasNormalizadasJs as (m: unknown) => MedidasModelo
export const claveDeNombre = claveDeNombreJs as (nombre: unknown) => string
export const esDirecta = esDirectaJs as (m: Partial<Modelo> | null | undefined) => boolean
export const motivoModeloInvalido = motivoModeloInvalidoJs as (m: unknown) => string | null
export const fichaQueChoca = fichaQueChocaJs as (
  nueva: Partial<Modelo>,
  existentes: readonly Modelo[],
) => Modelo | null

export const etiquetaEstado = (e: EstadoModelo) => ESTADOS.find((x) => x.key === e)?.label ?? e

/**
 * ¿Esta ficha es de la marca que está mirando quien abrió la sección? Y ¿se le puede ofrecer a
 * quien está cargando una sesión de fotos?
 *
 * 🔑 **Las dos se MUDARON a `core.core.js`** el 3-sep-2026, cuando la sesión de fotos empezó a
 * elegir la modelo de una lista que arma el handler —que ⛔ no puede importar TypeScript—. Acá se
 * re-exportan: sus consumidores (`Modelos.tsx`) ⛔ no se enteraron. El porqué de cada regla está
 * allá, al lado de la tabla que las guarda. Es el mismo arreglo que `talleNormalizado`.
 */
export const esDeLaMarca = esDeLaMarcaJs as (m: Pick<Modelo, 'marcas'>, marca: string) => boolean
export const esElegible = esElegibleJs as (
  m: Pick<Modelo, 'marcas' | 'estado'>,
  marca: string,
) => boolean

/**
 * El texto sobre el que busca la pantalla. Va acá y ⛔ no en el componente porque la búsqueda
 * también tiene que encontrar por Instagram y por agencia, y eso ⛔ no se adivina mirando la lista.
 */
export function textoBuscable(m: Modelo): string {
  return claveDeNombre(
    [m.nombre, m.instagram, m.agencia, m.booker, m.talle, m.nota].filter(Boolean).join(' '),
  )
}

export function filtrarModelos(modelos: readonly Modelo[], busca: string): Modelo[] {
  const q = claveDeNombre(busca)
  if (!q) return [...modelos]
  return modelos.filter((m) => textoBuscable(m).includes(q))
}

/**
 * El orden de la lista: **las activas primero y por nombre**.
 *
 * ⛔ No se ordena por «última sesión»: hoy ninguna ficha tiene sesiones —el padrón nace vacío— y
 * ordenar por un dato que no existe deja la lista en un orden que parece elegido y es azaroso.
 */
export function ordenarModelos(modelos: readonly Modelo[]): Modelo[] {
  return [...modelos].sort((a, b) => {
    if (a.estado !== b.estado) return a.estado === 'activa' ? -1 : 1
    return a.nombre.localeCompare(b.nombre, 'es')
  })
}
