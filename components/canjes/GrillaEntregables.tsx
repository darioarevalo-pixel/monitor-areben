'use client'

/**
 * Qué se le pide publicar: **los cinco tipos en una sola pantalla, con la cantidad al lado**.
 *
 * Antes esto era un modal que se abría una vez por entregable, así que "2 historias y 1 reel" eran
 * dos idas y vueltas — y como el modal vivía en la ficha del canje, la propuesta se armaba en dos
 * pantallas distintas. Acá se ve todo lo que se puede pedir de una, y lo que no se pide queda en 0.
 *
 * Los tipos son una **lista cerrada en código** a propósito (ver `TipoEntregable`): sumar uno es
 * una línea más un deploy, y una lista abierta se llena de `Reel` / `reel ig` / `REEL`.
 */

import { color, font, space, weight } from '@/components/ui'
import {
  ENTREGABLE_LABEL, ENTREGABLE_LABEL_PLURAL, TIPOS_ENTREGABLE, type TipoEntregable,
} from '@/lib/canjes/tipos'
import type { EntregablePedido } from '@/lib/canjes/cliente'

/** El pedido como mapa, que es como lo maneja el formulario. `0` = no se pide. */
export type PedidoPorTipo = Record<TipoEntregable, number>

export const PEDIDO_VACIO: PedidoPorTipo = {
  historia_ig: 0,
  reel_ig: 0,
  post_ig: 0,
  video_tiktok: 0,
  contenido: 0,
}

/** Lo que viaja al servidor: sólo los que tienen cantidad. */
export function pedidoALista(p: PedidoPorTipo): EntregablePedido[] {
  return TIPOS_ENTREGABLE
    .filter((t) => Number(p[t]) > 0)
    .map((t) => ({ tipo: t, cantidad: Number(p[t]) }))
}

export function listaAPedido(lista: { tipo: TipoEntregable; cantidad_comprometida: number }[]): PedidoPorTipo {
  const p = { ...PEDIDO_VACIO }
  for (const e of lista) {
    if (e.tipo in p) p[e.tipo] += Number(e.cantidad_comprometida) || 0
  }
  return p
}

export function totalPedido(p: PedidoPorTipo): number {
  return TIPOS_ENTREGABLE.reduce((a, t) => a + (Number(p[t]) || 0), 0)
}

export function GrillaEntregables({
  valor,
  onCambio,
}: {
  valor: PedidoPorTipo
  onCambio: (p: PedidoPorTipo) => void
}) {
  const set = (tipo: TipoEntregable, n: number) => onCambio({ ...valor, [tipo]: Math.max(0, n) })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
      {TIPOS_ENTREGABLE.map((t) => {
        const n = Number(valor[t]) || 0
        const pedido = n > 0
        return (
          <div
            key={t}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: space[3],
              padding: `${space[2]}px ${space[3]}px`,
              border: `1px solid ${pedido ? color.brandBorder : color.line}`,
              borderRadius: 8,
              background: pedido ? color.brandBg : 'transparent',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: pedido ? weight.medium : weight.normal }}>
                {n === 1 ? ENTREGABLE_LABEL[t] : ENTREGABLE_LABEL_PLURAL[t]}
              </div>
            </div>
            {/* Los ± son para el teclado del celular, donde tipear un número en un input chico es
                más trabajo que tocar dos veces. */}
            <button
              type="button"
              aria-label={`Menos ${ENTREGABLE_LABEL[t]}`}
              onClick={() => set(t, n - 1)}
              disabled={n === 0}
              style={botonPaso(n === 0)}
            >
              −
            </button>
            <input
              type="number"
              min={0}
              value={String(n)}
              onChange={(e) => set(t, parseInt(e.target.value, 10) || 0)}
              aria-label={`Cuántas ${ENTREGABLE_LABEL_PLURAL[t]}`}
              style={{
                width: 56,
                textAlign: 'center',
                fontSize: font.md,
                padding: space[1],
                border: `1px solid ${color.line2}`,
                borderRadius: 6,
                background: color.surface,
                color: color.ink,
              }}
            />
            <button
              type="button"
              aria-label={`Más ${ENTREGABLE_LABEL[t]}`}
              onClick={() => set(t, n + 1)}
              style={botonPaso(false)}
            >
              +
            </button>
          </div>
        )
      })}
    </div>
  )
}

function botonPaso(deshabilitado: boolean): React.CSSProperties {
  return {
    width: 30,
    height: 30,
    borderRadius: 6,
    border: `1px solid ${color.line2}`,
    background: color.surface,
    color: deshabilitado ? color.mut2 : color.ink,
    fontSize: font.md,
    lineHeight: 1,
    cursor: deshabilitado ? 'default' : 'pointer',
  }
}
