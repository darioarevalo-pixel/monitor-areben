'use client'

import { useEffect, useMemo } from 'react'
import { useMonitorStore } from '@/store/useMonitorStore'
import { useSesion } from '@/components/SesionProvider'
import { veVentasHistoricas } from '@/lib/permisos'
import { computarDatos } from '@/lib/etl/computar'
import { filtrarPorLinea } from '@/lib/etl/linea'
import { mapaColorManual } from '@/lib/cache'
import { lineasDeMarca, type Linea } from '@/lib/lineas'
import type { DatosETL } from '@/lib/etl/tipos'
import type { EstadoCarga, Origen } from '@/store/useMonitorStore'

/**
 * El hook que conecta una sección al store del ETL. Dispara la carga de la marca
 * de la sesión al montar y expone el estado.
 *
 * **Genérico a propósito.** Fundas es el primer consumidor del store en prod, y
 * este hook es el que van a copiar las otras 21 secciones migradas. Por eso no
 * mezcla nada de Fundas: pide `cargar(marca, rol)` y devuelve `{datos, estado}`.
 *
 * NO es como `useCRM`: ese fetchea sus propios datos y no toca el store. El CRM
 * no era consumidor del ETL; Fundas sí, y el ciclo `cargar → 'listo'` es del
 * store, no de un hook por sección.
 *
 * `datos` se devuelve solo cuando el store ya publicó la marca pedida: mientras
 * cambia de marca podría tener los datos de la anterior, y una tabla con esos
 * números sería un A/B falso.
 *
 * # El corte por línea (22-ago-2026)
 *
 * `useDatosMonitor({ porLinea: true })` devuelve los datos de **una sola línea** —Zattia sola o
 * Stunned sola— en vez de la mezcla. Lo pidió Bruno: *«en la dinámica diaria no veo las ventas, no
 * veo el análisis»*, porque Stunned vive adentro de Zattia y ninguna pantalla de plata la nombraba.
 *
 * 🔑 **Es opt-in por pantalla, y eso es la mitad del diseño.** Sin el flag, el hook devuelve
 * exactamente lo de hoy. Las pantallas **operativas** —Exhibición, Etiquetas, Liquidación,
 * Reposición, Sesión de fotos— tienen que seguir viendo la mercadería del local **entera**: partirlas
 * haría desaparecer las prendas de Stunned del trabajo del local, que es lo contrario de lo que se
 * pidió. Un filtro global no se puede.
 *
 * 🔑 **El corte es DERIVADO y sincrónico** (`useMemo` sobre el payload crudo del store), no un
 * segundo estado que se publica. Por eso no puede pasarle lo que le pasó al cambio de marca en
 * agosto —publicar tarde los datos de una línea bajo el rótulo de la otra—: entre el payload y la
 * línea no hay un solo `await` donde meterse. La misma razón hace que cambiar de línea **no baje
 * nada**: recomputa lo que ya está en memoria.
 */
/**
 * **Sólo la línea**, sin el ETL: qué línea se está mirando, entre cuáles se puede elegir y cómo
 * cambiarla. La usa `useDatosMonitor` y también las pantallas que llevan selector **sin** colgar
 * del ETL —la carga de imágenes de Tienda Nube, que habla con la tienda y no con el espejo—.
 *
 * 🔑 **Existe para que la normalización se escriba una sola vez.** La línea guardada puede no
 * existir en la marca activa (se eligió Stunned y se pasó a BDI); resolverlo en cada pantalla sería
 * la misma regla copiada, y las copias se despegan (`lib/lineas.core.js` es el archivo que existe
 * porque eso ya pasó ocho veces).
 */
export function useLinea(): { linea: Linea; setLinea: (linea: Linea) => void; lineas: Linea[] } {
  const { marca } = useSesion()
  const lineaElegida = useMonitorStore((s) => s.linea)
  const setLinea = useMonitorStore((s) => s.setLinea)
  const lineas = useMemo(() => lineasDeMarca(marca), [marca])
  // La que manda es la de la marca, no la guardada: el rótulo tiene que poder decirse siempre.
  const linea = lineas.includes(lineaElegida) ? lineaElegida : lineas[0]
  return { linea, setLinea, lineas }
}

export function useDatosMonitor(opciones?: { porLinea?: boolean }): {
  datos: DatosETL | null
  estado: EstadoCarga
  error: string | null
  progreso: string | null
  origen: Origen | null
  /** La línea que se está mirando. Con `porLinea` apagado es siempre la base de la marca. */
  linea: Linea
  setLinea: (linea: Linea) => void
  /** Las líneas entre las que se puede elegir. Una sola ⇒ la pantalla no dibuja el selector. */
  lineas: Linea[]
} {
  const { perfil, marca } = useSesion()
  const cargar = useMonitorStore((s) => s.cargar)
  const datos = useMonitorStore((s) => s.datos)
  const payload = useMonitorStore((s) => s.payload)
  const estado = useMonitorStore((s) => s.estado)
  const error = useMonitorStore((s) => s.error)
  const progreso = useMonitorStore((s) => s.progreso)
  const origen = useMonitorStore((s) => s.origen)
  const marcaCargada = useMonitorStore((s) => s.marca)
  const { linea, setLinea, lineas } = useLinea()

  useEffect(() => {
    cargar(marca, veVentasHistoricas(perfil, marca))
  }, [marca, perfil, cargar])

  const listoParaEstaMarca = estado === 'listo' && marcaCargada === marca
  const corta = !!opciones?.porLinea && lineas.length > 1

  // ⚠️ El cómputo de la línea sale del payload crudo, NO de `datos`: los agregados del ETL
  // (agotamiento, ventas por color, por talle, fases) ya vendrían calculados sobre la mezcla y
  // separarlos después sería recalcularlos peor.
  //
  // ⛔ Sin medición adentro: `performance.now()` en el render es impuro y el lint lo rechaza (bien).
  // Lo que costaba este cómputo se midió aparte, contra el payload real de producción, y el número
  // está en `docs/lineas.md` — donde se puede volver a leer sin abrir la pantalla.
  const datosDeLinea = useMemo(() => {
    if (!corta || !payload) return null
    return computarDatos(filtrarPorLinea(payload, linea), {
      today: new Date(),
      colorManualMap: mapaColorManual(payload.colorManual),
    })
  }, [corta, payload, linea])

  // `progreso` y `origen` se exponen porque el store los venía publicando y NADIE los
  // mostraba: el legacy los pintaba en #status y #progress-bar, y al migrar se perdió el
  // consumidor. En una primera carga sin caché la bajada tarda ~20s y la pantalla no
  // decía una palabra. Los consume `DatosGate`.
  return {
    datos: listoParaEstaMarca ? (corta ? datosDeLinea : datos) : null,
    estado,
    error,
    progreso,
    origen,
    linea,
    setLinea,
    lineas,
  }
}
