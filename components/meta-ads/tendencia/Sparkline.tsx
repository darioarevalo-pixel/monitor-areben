'use client'

/**
 * La línea chiquita que va debajo de un número: cómo se movió día a día.
 *
 * # Por qué SVG a mano y no Recharts, que ya está instalado
 *
 * Recharts se usa en el repo para los gráficos con ejes, leyenda y tooltip (`Rendimiento.tsx`,
 * `crm/Metricas.tsx`). Acá no hay nada de eso: son 60 puntos sin ejes adentro de una tarjeta de
 * 115 px. Un `ResponsiveContainer` por tile mide el DOM y vuelve a renderizar en cada resize —cinco
 * observers para dibujar cinco polilíneas— y la geometría es una división. La regla del kit es
 * reusar antes de escribir, y lo que se reusa acá es `puntosSparkline()`, que es la parte que puede
 * estar mal y por eso tiene tests.
 *
 * # 🔑 Las dos mitades se dibujan distinto, y ahí está todo el sentido
 *
 * El tramo anterior va en gris y el actual en color, con una línea vertical en la juntura. Sin eso
 * el sparkline sería «los últimos 60 días» y el número de arriba diría «vs los 30 anteriores»: dos
 * cosas al lado que no se pueden cruzar con la vista. Con la juntura marcada, el porcentaje del
 * delta se lee en el dibujo.
 */

import { chartColor, color, space } from '@/components/ui'
import { puntosSparkline, trazo, type PuntoSerie } from '@/lib/meta-ads/tendencia'

const ANCHO = 120
const ALTO = 26

export function Sparkline({ serie, campo, tono = chartColor.brand }: {
  serie: PuntoSerie[]
  campo: 'gasto' | 'revenue' | 'compras'
  tono?: string
}) {
  if (serie.length < 2) return null

  const valores = serie.map((p) => p[campo])
  const puntos = puntosSparkline(valores, ANCHO, ALTO)
  const corte = serie.findIndex((p) => p.tramo === 'actual')

  // Sin tramo anterior es una línea sola. Cuando lo hay, el punto de la juntura entra en las DOS
  // polilíneas: si cada una tomara su mitad exacta quedaría un hueco de un día entre ambas.
  const hayCorte = corte > 0
  const antes = hayCorte ? puntos.slice(0, corte + 1) : []
  const despues = hayCorte ? puntos.slice(corte) : puntos
  const xCorte = hayCorte ? puntos[corte].x : null

  return (
    <svg
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      preserveAspectRatio="none"
      width="100%"
      height={ALTO}
      style={{ display: 'block', marginTop: space[1], overflow: 'visible' }}
      // Lo que dice el dibujo ya está escrito en números arriba y en el subtítulo de la tarjeta:
      // para un lector de pantalla esto es decoración, y leerlo dos veces es peor que no leerlo.
      aria-hidden="true"
      focusable="false"
    >
      {xCorte !== null && (
        <line x1={xCorte} y1={0} x2={xCorte} y2={ALTO} stroke={chartColor.grid} strokeWidth={1} strokeDasharray="2 2" />
      )}
      {antes.length > 1 && (
        <polyline points={trazo(antes)} fill="none" stroke={chartColor.axis} strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round" />
      )}
      <polyline points={trazo(despues)} fill="none" stroke={tono} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      {/* El último día, marcado: es el que contesta «¿y ahora?». */}
      <circle cx={puntos[puntos.length - 1].x} cy={puntos[puntos.length - 1].y} r={1.8} fill={tono} stroke={color.bg} strokeWidth={0.8} />
    </svg>
  )
}
