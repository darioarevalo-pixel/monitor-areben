'use client'

/**
 * **El selector de línea de negocio**: en Zattia, mirar Zattia sola o Stunned sola.
 *
 * Stunned no es una marca del monitor —vive adentro del Gestión Nube de Zattia y lo único que la
 * separa es el prefijo de SKU (`lib/lineas.core.js`)—, así que no tiene entrada propia en el menú.
 * El eje es una pestaña adentro de la pantalla, el mismo patrón que Meta Ads
 * (`components/meta-ads/SelectorMeta.tsx`): así el equipo no aprende un lugar nuevo y el menú no
 * crece por cada sección que se abre.
 *
 * 🔑 **Dos posiciones y ninguna dice «las dos» — lo decidió Bruno el 22-ago-2026.** Todo número que
 * salga de una pantalla con este selector es de **una** línea, siempre: nunca una cifra mezclada sin
 * rótulo. El precio de esa decisión es que el día que se estrena, Zattia baja ~3 % en estas
 * pantallas (28 productos, 195 unidades, $619.710 en 30 días) — y por eso va con novedad.
 *
 * ⛔ **No se dibuja solo**: la pantalla que lo monta es la que pidió `porLinea` a `useDatosMonitor`,
 * y con una sola línea visible (BDI) no se dibuja nada.
 */

import { ETIQUETA_LINEA, type Linea } from '@/lib/lineas'
import { space, Tabs, type TabItem } from '@/components/ui'

export type SelectorLineaProps = {
  linea: Linea
  lineas: Linea[]
  onChange: (linea: Linea) => void
}

export function SelectorLinea({ linea, lineas, onChange }: SelectorLineaProps) {
  if (lineas.length < 2) return null
  const items: TabItem[] = lineas.map((l) => ({ key: l, label: ETIQUETA_LINEA[l], guia: `linea-${l}` }))
  return (
    <Tabs
      items={items}
      value={linea}
      onChange={(k) => onChange(k as Linea)}
      style={{ marginBottom: space[4] }}
    />
  )
}
