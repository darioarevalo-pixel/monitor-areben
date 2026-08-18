'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Marca } from '@/lib/nav.datos'
import { leerIngresos } from '@/lib/kv/cliente'
import { normalizar, totalU } from '@/lib/ingresos/core'
import type { Ingreso } from '@/lib/ingresos/tipos'
import { leerNorte, type MetaGuardada } from '@/lib/norte/persistencia'
import type { Condiciones, Contribucion, ImportacionProyectada } from '@/lib/norte/tipos'

/** Lo que se muestra cuando la lectura de Norte falló entera: sin dato y sin inventar. */
const SIN_CONTRIBUCION: Contribucion = { disponible: false, motivo: null, ventana: null }

/**
 * Junta las dos mitades de una importación: **cuánto y cuándo** llega (el KV de `ingresos`) con
 * **cuánto cuesta y cuándo se paga** (la tabla `compras_condiciones`).
 *
 * 🔑 Son dos almacenamientos distintos unidos por `ingresoId`, y no hay foreign key que los
 * proteja. Por eso el cruce se hace acá, en un solo lugar, y no en cada pantalla: si mañana una
 * importación desaparece del KV, su fila de condiciones queda huérfana y **se ignora en silencio**
 * en vez de romper la sección.
 *
 * ⚠️ `normalizar()` no es opcional: el KV tiene registros en formato viejo (con `modelos`/`disenos`
 * sueltos en vez de `bloques`) y `totalU()` sobre uno de ésos devuelve cero — o sea, una
 * importación de 14.000 unidades contada como vacía.
 */
export function cruzar(ingresos: Ingreso[], condiciones: Condiciones[]): ImportacionProyectada[] {
  const porId = new Map(condiciones.map((c) => [c.ingresoId, c]))
  let n = 0
  return ingresos
    .map((crudo) => {
      const g = normalizar(crudo, () => `n${n++}`)
      return {
        id: g.id,
        desc: g.desc || g.proveedor || 'Importación',
        llega: g.fecha || '',
        unidades: totalU(g),
        arribada: g.estado === 'arribado',
        condiciones: porId.get(g.id) || null,
      }
    })
    .sort((a, b) => (a.llega || '9999').localeCompare(b.llega || '9999'))
}

export type EstadoNorte = {
  importaciones: ImportacionProyectada[]
  metas: MetaGuardada[]
  /** La plata que deja cada canal. La calcula el servidor: el ETL no trae precios. */
  contribucion: Contribucion
  admin: boolean
  cargando: boolean
  error: string | null
  recargar: () => void
}

/**
 * Carga lo que Norte necesita de afuera del ETL: las importaciones proyectadas y su economía.
 *
 * Las dos lecturas van **en paralelo y con `allSettled`**: si el KV de ingresos no contesta, las
 * metas y las condiciones igual se muestran. Cortar todo porque falló una de las dos fuentes deja
 * la pantalla en blanco sin decir cuál, que es el modo de falla más caro de diagnosticar.
 */
export function useNorte(marca: Marca): EstadoNorte {
  const [tick, setTick] = useState(0)
  const clave = `${marca}:${tick}`

  /**
   * Un solo estado con **la clave de la carga que lo produjo**, y `cargando` derivado de
   * compararla contra la clave actual.
   *
   * 🔑 No es rebusque: setear `cargando` en el cuerpo del efecto dispara un render extra y
   * `react-hooks/set-state-in-effect` lo marca como error. Es el mismo patrón que ya usa
   * `useDatosMonitor` con `listoParaEstaMarca`, y de paso arregla un bug real que la otra forma
   * tenía: al cambiar de marca, los datos de la anterior seguían en pantalla un instante como si
   * fueran de la nueva.
   */
  const [cargado, setCargado] = useState<{
    clave: string
    importaciones: ImportacionProyectada[]
    metas: MetaGuardada[]
    contribucion: Contribucion
    admin: boolean
    error: string | null
  } | null>(null)

  const recargar = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    let vivo = true
    Promise.allSettled([leerIngresos<Ingreso>(marca), leerNorte(marca)]).then(([ing, nor]) => {
      if (!vivo) return
      const listaIngresos = ing.status === 'fulfilled' && ing.value.ok ? ing.value.dato : []
      const datos = nor.status === 'fulfilled' ? nor.value : null

      const fallas: string[] = []
      if (ing.status === 'rejected' || (ing.status === 'fulfilled' && !ing.value.ok)) {
        fallas.push('no se pudieron leer las importaciones proyectadas')
      }
      if (nor.status === 'rejected') fallas.push(nor.reason?.message || 'no se pudo leer Norte')

      setCargado({
        clave,
        importaciones: cruzar(listaIngresos, datos?.condiciones || []),
        metas: datos?.metas || [],
        contribucion: datos?.contribucion || SIN_CONTRIBUCION,
        admin: datos?.puede.admin || false,
        error: fallas.length ? fallas.join(' · ') : null,
      })
    })
    return () => {
      vivo = false
    }
  }, [marca, clave])

  const listo = cargado?.clave === clave
  return {
    importaciones: listo ? cargado.importaciones : [],
    metas: listo ? cargado.metas : [],
    contribucion: listo ? cargado.contribucion : SIN_CONTRIBUCION,
    admin: listo ? cargado.admin : false,
    cargando: !listo,
    error: listo ? cargado.error : null,
    recargar,
  }
}
