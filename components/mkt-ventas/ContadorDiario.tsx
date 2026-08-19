'use client'

import { Button, Card, KpiCard, color, font, space, weight } from '@/components/ui'
import { rotuloFecha } from '@/lib/fechas/semana'
import type { DiaDeVenta } from '@/lib/mkt-ventas/core'

/**
 * El contador del día, con las flechitas para caminar los días anteriores.
 *
 * 🔑 **La flecha que se acaba dice POR QUÉ se acabó.** Hacia atrás el piso no es una decisión de
 * diseño: es hasta dónde llegan las ventas que bajó el navegador (35 días para quien no es admin,
 * `lib/datos.ts`). Una flecha gris sin explicación se lee como que la pantalla se rompió.
 *
 * 🔑 **Se muestran compras Y unidades juntas.** Online son 1,9 unidades por compra: quien mira el
 * contador para decidir una campaña necesita las dos, y tenerlas al lado es lo que impide leer un
 * número con la unidad del otro.
 *
 * 🔴 **El rótulo de las unidades sale de la MARCA** (`articuloDe`). Decía «Fundas online» a secas y
 * en Zattia eso habla del negocio de al lado: Zattia vende ropa. Lo cazó Bruno mirando la pantalla.
 */
export function ContadorDiario({
  dia, fecha, hoy, puedeAtras, puedeAdelante, onMover, tope, articulo,
}: {
  dia: DiaDeVenta | null
  fecha: string
  hoy: string
  /** Cómo se llama lo que vende esta marca: «fundas» en BDI, «prendas» en Zattia. */
  articulo: { singular: string; plural: string }
  puedeAtras: boolean
  puedeAdelante: boolean
  onMover: (n: number) => void
  tope: number
}) {
  const esHoy = fecha === hoy

  return (
    <Card style={{ marginBottom: space[4] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[3] }}>
        <Button size="sm" variant="outline" onClick={() => onMover(-1)} disabled={!puedeAtras} title={puedeAtras ? 'El día anterior' : `El navegador bajó ${tope} días de ventas: más atrás no hay dato`} aria-label="El día anterior">
          ‹
        </Button>
        <div style={{ minWidth: 0, textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: font.lg, fontWeight: weight.semibold, color: color.ink }}>
            {esHoy ? 'Hoy' : rotuloFecha(fecha)}
          </div>
          <div style={{ fontSize: font.sm, color: color.mut }}>{esHoy ? rotuloFecha(fecha) : 'ventas de ese día'}</div>
        </div>
        <Button size="sm" variant="outline" onClick={() => onMover(1)} disabled={!puedeAdelante} title={puedeAdelante ? 'El día siguiente' : 'Ya estás en el último día'} aria-label="El día siguiente">
          ›
        </Button>
      </div>

      <div className="mo-kpis" style={{ marginTop: space[4] }}>
        <KpiCard label="Compras online" value={(dia?.compras ?? 0).toLocaleString('es-AR')} sub="Pedidos de Tienda Nube" />
        <KpiCard
          label={`${articulo.plural.charAt(0).toUpperCase()}${articulo.plural.slice(1)} online`}
          value={(dia?.unidades ?? 0).toLocaleString('es-AR')}
          sub="Unidades de esos pedidos"
        />
      </div>

      {!puedeAtras && (
        <p style={{ fontSize: font.sm, color: color.mut2, marginTop: space[3] }}>
          Más atrás no hay dato: el navegador baja {tope} días de ventas.
        </p>
      )}
    </Card>
  )
}
