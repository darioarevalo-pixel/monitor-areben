'use client'

import { Card, KpiCard, Select, TBody, THead, TableWrap, Td, Th, Tr, color, font, space, weight } from '@/components/ui'
import type { Producto } from '@/lib/etl/tipos'
import { CANALES_DEL_RESUMEN, type VentaDeCanal } from '@/lib/mkt-ventas/core'

/**
 * Cómo viene la venta **en general** — el piso contra el que se lee todo lo demás de la pantalla.
 *
 * Lo pidió Bruno el 18-ago-2026, y también dijo dónde: **arriba de la liquidación**, *«porque la
 * liquidación siempre es excepcional»*. El orden de la sección quedó de lo permanente a lo
 * excepcional: el objetivo · el día de hoy · **cómo viene la venta** · el resultado del sale.
 *
 * ⛔ **La ventana llega hasta 30 días y no hay 90.** Quien no ve el análisis fino baja 35 días de
 * venta (`desdeVentas`), así que un «90 d» le mostraría 35 bajo un rótulo que dice 90 — sin un
 * error, que es el modo de falla que más caro sale acá.
 */
export function VentaGeneral({
  porCanal, top, dias, onDias, articulo,
}: {
  porCanal: VentaDeCanal[]
  top: Producto[]
  dias: 7 | 30
  onDias: (d: 7 | 30) => void
  articulo: { singular: string; plural: string }
}) {
  const totalUnidades = porCanal.reduce((a, c) => a + c.unidades, 0)
  const rotulo: Record<VentaDeCanal['canal'], string> = { online: 'Online', local: 'Local', mayorista: 'Mayorista' }

  return (
    <Card style={{ marginBottom: space[4] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap', marginBottom: space[4] }}>
        <span style={{ fontSize: font.xl, fontWeight: weight.bold, letterSpacing: -0.2, color: color.ink }}>
          Cómo viene la venta
        </span>
        <Select value={String(dias)} onChange={(e) => onDias(Number(e.target.value) === 7 ? 7 : 30)} style={{ maxWidth: 160 }}>
          <option value="7">Últimos 7 días</option>
          <option value="30">Últimos 30 días</option>
        </Select>
      </div>

      <div className="mo-kpis">
        {CANALES_DEL_RESUMEN.map((c) => {
          const fila = porCanal.find((x) => x.canal === c)
          const unidades = fila?.unidades ?? 0
          const compras = fila?.compras ?? 0
          // 🔑 El % va sobre UNIDADES y lo dice: por compras el mayorista desaparece (3 pedidos) y
          // por unidades es la mayor parte de lo que sale. Son dos verdades y la etiqueta elige una.
          const pct = totalUnidades > 0 ? Math.round((unidades / totalUnidades) * 100) : null
          return (
            <KpiCard
              key={c}
              label={rotulo[c]}
              value={unidades.toLocaleString('es-AR')}
              sub={`${compras.toLocaleString('es-AR')} compra${compras === 1 ? '' : 's'}${pct === null ? '' : ` · ${pct}% de las ${articulo.plural}`}`}
            />
          )
        })}
      </div>

      <p style={{ fontSize: font.sm, color: color.mut2, marginTop: space[3] }}>
        El número grande son {articulo.plural}; abajo, cuántas compras las trajeron. Sin las ventas
        técnicas (sesión de fotos, fallas), que no son venta.
      </p>

      <div style={{ fontSize: font.lg, fontWeight: weight.semibold, color: color.ink, marginTop: space[6], marginBottom: space[3] }}>
        Los que más salieron
      </div>
      {top.length === 0 ? (
        <p style={{ fontSize: font.sm, color: color.mut2 }}>No se vendió nada en la ventana.</p>
      ) : (
        <TableWrap>
          <THead>
            <Tr>
              <Th>Producto</Th>
              <Th align="right">Salieron</Th>
              <Th align="right">Stock</Th>
              <Th align="right">Vida útil</Th>
            </Tr>
          </THead>
          <TBody>
            {top.map((p) => (
              <Tr key={p.id}>
                <Td>
                  <div style={{ fontWeight: weight.medium, color: color.ink }}>{p.name}</div>
                  {p.sku && <div style={{ fontSize: font.xs, color: color.mut2 }}>{p.sku}</div>}
                </Td>
                <Td align="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {(dias === 7 ? p.sales7 : p.sales30).toLocaleString('es-AR')}
                </Td>
                <Td align="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{p.stock.toLocaleString('es-AR')}</Td>
                <Td align="right" style={{ fontVariantNumeric: 'tabular-nums', color: color.mut }}>
                  {p.lifespan > 0 ? `${Math.round(p.lifespan)} d` : '—'}
                </Td>
              </Tr>
            ))}
          </TBody>
        </TableWrap>
      )}
      {/* ⚠️ Se dice, no se insinúa: el ranking NO está partido por canal. El ETL guarda las ventanas
          por producto sin canal, y partirlas acá sería una segunda cuenta que puede contradecir a
          la de arriba. */}
      <p style={{ fontSize: font.sm, color: color.mut2, marginTop: space[3] }}>
        El ranking es de <strong>todos los canales</strong> juntos, no sólo online.
      </p>
    </Card>
  )
}
