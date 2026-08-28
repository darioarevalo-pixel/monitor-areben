'use client'

/**
 * El eje de Meta Ads: **cuenta publicitaria + línea de pauta + rango**, en un provider montado
 * arriba del router de la sección.
 *
 * # Por qué existe
 *
 * Hasta acá lo que se veía en Meta Ads lo decidía el switch BDI/Zattia del sidebar, que **no es
 * ninguno de los dos ejes reales**: BDI y Zattia comparten cuenta publicitaria y Stunned —que ni
 * siquiera es una marca del monitor— tiene la suya. El resultado era que `marca` viajaba adentro de
 * la lógica y se usaba para cuatro cosas distintas, de las cuales una sola necesita de verdad una
 * marca: elegir la base de Supabase donde viven las ideas y las correcciones de etapa. Esa se
 * deriva de la línea con `baseDeLinea()`.
 *
 * # Tres decisiones que hay que respetar si se toca
 *
 * 1. 🔑 **El provider va ARRIBA del router, no adentro de cada pantalla.** `useFiltroUrl` sólo mira
 *    la URL **al montar** (ya mordió en Canjes): si cada subsección leyera la URL por su cuenta,
 *    navegar entre ellas remontaría el estado y perdería lo elegido.
 * 2. 🔑 **Lo elegido se guarda CRUDO y se valida al renderizar**, no con un efecto que lo corrija.
 *    Un efecto que arregla el estado después de pintar deja un cuadro intermedio con la cuenta
 *    equivocada — es el patrón que ya mordió tres veces en esta sección (el panel colgado, la caché
 *    de avisos, el monto del modal), y el lint del repo lo prohibe.
 * 3. 🔑 **Al cambiar uno de los dos ejes, el otro se re-resuelve en la ESCRITURA.** Si se validara
 *    cada uno contra el otro al leer, elegir una línea que no está en la cuenta abierta pelearía
 *    contra elegir una cuenta que no tiene esa línea, y ganaría el orden en que están escritas las
 *    líneas de código. Acá gana lo último que tocó la persona, que es lo que espera.
 *
 * ⚠️ Las líneas visibles salen de `lineasQueVe(perfil)` —la MISMA función con la que el servidor
 * contesta 403—, no de la respuesta del endpoint: así las pestañas se dibujan sin esperar a Meta. El
 * campo `visibles` de la respuesta queda como verificación cruzada, no como fuente.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { useFiltroUrl } from '@/components/ui'
import { lineasQueVe } from '@/lib/meta-ads/acciones'
import { traerCuentas } from '@/lib/meta-ads/cliente'
import {
  cuentasDeLinea, resolverCuenta, resolverLinea, type ElegidaCuenta, type ElegidaLinea,
} from '@/lib/meta-ads/cuentas'
import { esRango, RANGO_DEFAULT, type RangoUI } from '@/lib/meta-ads/rango'
import type { CuentaMeta, LineaPauta } from '@/lib/meta-ads/tipos'

export type CargableCuentas =
  | { fase: 'cargando' }
  | { fase: 'error'; motivo: string }
  | { fase: 'ok'; data: CuentaMeta[] }

export type ContextoMeta = {
  /** Cómo viene la lista de cuentas. Mientras carga, lo elegido igual vale (viene de la URL). */
  estado: CargableCuentas
  /** Las cuentas del token, ya ordenadas. Vacío mientras carga o si falló. */
  cuentas: CuentaMeta[]
  /** Las cuentas que quedan con la línea elegida. Es lo que dibuja el `<Select>`. */
  cuentasVisibles: CuentaMeta[]
  cuenta: ElegidaCuenta
  setCuenta: (c: ElegidaCuenta) => void
  linea: ElegidaLinea
  setLinea: (l: ElegidaLinea) => void
  /** Las líneas que este perfil puede mirar. El selector no dibuja las otras. */
  visibles: LineaPauta[]
  rango: RangoUI
  setRango: (r: RangoUI) => void
  /** La cuenta abierta, si hay una sola elegida. `null` con «Todas». */
  laCuenta: CuentaMeta | null
  /** Volver a preguntar por las cuentas: cambia la asignación de líneas al asignar una campaña. */
  recargar: () => void
}

const Ctx = createContext<ContextoMeta | null>(null)

/**
 * El eje, para cualquier pantalla de Meta Ads.
 *
 * Tira si se usa afuera del provider a propósito: una pantalla de la sección sin eje es un bug de
 * montaje, y devolver un default silencioso la dejaría mostrando otra cosa que lo elegido.
 */
export function useMeta(): ContextoMeta {
  const c = useContext(Ctx)
  if (!c) throw new Error('useMeta() fuera de <ProveedorMeta>: el provider va arriba del router de Meta Ads.')
  return c
}

export function ProveedorMeta({ children }: { children: React.ReactNode }) {
  const { perfil } = useSesion()
  const visibles = useMemo(() => lineasQueVe(perfil), [perfil])

  // Lo elegido vive en la URL: un link reproduce la pantalla exacta. Se guarda crudo.
  const [cuentaCruda, setCuentaCruda] = useFiltroUrl<ElegidaCuenta>('cuenta', 'todas')
  const [lineaCruda, setLineaCruda] = useFiltroUrl<ElegidaLinea>('linea', 'todas')
  const [rangoCrudo, setRangoCrudo] = useFiltroUrl<RangoUI>('rango', RANGO_DEFAULT)

  // `pedido` es lo que hace recargable a la lista: pedir de nuevo tiene que ser un cambio de
  // DEPENDENCIA del efecto, no un eliminado del resultado. Vaciar el estado pinta «cargando» sin que
  // salga ningún fetch — eso es lo que dejaba el panel de Etapas colgado para siempre.
  const [pedido, setPedido] = useState(0)
  const [r, setR] = useState<{ key: number; e: CargableCuentas } | null>(null)
  useEffect(() => {
    let vivo = true
    traerCuentas().then((res) => {
      if (!vivo) return
      setR({ key: pedido, e: res.ok ? { fase: 'ok', data: res.dato.cuentas } : { fase: 'error', motivo: res.motivo } })
    })
    return () => { vivo = false }
  }, [pedido])

  // El `useMemo` no es de rendimiento: sin él, el objeto `{ fase: 'cargando' }` es nuevo en cada
  // render y arrastra a todo lo que cuelga del contexto a recalcularse siempre.
  const estado: CargableCuentas = useMemo(
    () => (!r || r.key !== pedido ? { fase: 'cargando' } : r.e),
    [r, pedido],
  )
  const cuentas = useMemo(() => (estado.fase === 'ok' ? estado.data : []), [estado])

  // Validación al renderizar, no en un efecto (ver la nota 2 de arriba). Mientras la lista no llegó
  // no se puede saber si la cuenta del link existe, así que se respeta: recortarla ahí sería tirar
  // lo que la persona pidió por no haber terminado de cargar.
  const linea: ElegidaLinea = lineaCruda !== 'todas' && visibles.includes(lineaCruda) ? lineaCruda : 'todas'
  const cuenta: ElegidaCuenta = estado.fase === 'ok' ? resolverCuenta(cuentas, linea, cuentaCruda) : cuentaCruda
  const rango: RangoUI = esRango(rangoCrudo) ? rangoCrudo : RANGO_DEFAULT

  const setLinea = useCallback((l: ElegidaLinea) => {
    setLineaCruda(l)
    // Si la cuenta abierta no tiene esa línea, se abre «Todas»: mostrar una cuenta vacía por un
    // cruce imposible parece un problema de Meta y es un filtro.
    if (resolverCuenta(cuentas, l, cuentaCruda) !== cuentaCruda) setCuentaCruda('todas')
  }, [cuentas, cuentaCruda, setCuentaCruda, setLineaCruda])

  const setCuenta = useCallback((c: ElegidaCuenta) => {
    setCuentaCruda(c)
    if (resolverLinea(visibles, cuentas, c, lineaCruda) !== lineaCruda) setLineaCruda('todas')
  }, [cuentas, lineaCruda, setCuentaCruda, setLineaCruda, visibles])

  const valor = useMemo<ContextoMeta>(() => ({
    estado,
    cuentas,
    cuentasVisibles: cuentasDeLinea(cuentas, linea),
    cuenta,
    setCuenta,
    linea,
    setLinea,
    visibles,
    rango,
    setRango: setRangoCrudo,
    laCuenta: cuenta === 'todas' ? null : cuentas.find((c) => c.id === cuenta) ?? null,
    recargar: () => setPedido((n) => n + 1),
  }), [estado, cuentas, cuenta, setCuenta, linea, setLinea, visibles, rango, setRangoCrudo])

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}
