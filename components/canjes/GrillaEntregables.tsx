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

import { Button, PasoCantidad, color, space, weight } from '@/components/ui'
import {
  ENTREGABLE_LABEL, ENTREGABLE_LABEL_PLURAL, entregableEnCriollo, TIPOS_ENTREGABLE,
  type TipoEntregable,
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

// ── Los combos: lo que se pide casi siempre, de un toque ─────────────────────────

/**
 * Un pedido armado. **No es una plantilla nueva**: es exactamente lo que la grilla de abajo deja
 * cargar a mano, puesto de una vez.
 *
 * Por qué existen: la grilla es completa pero parte de cero, y el 90% de los canjes se acuerdan con
 * dos o tres combinaciones que se repiten. Tocar seis veces el `+` para llegar siempre al mismo
 * lugar es el tipo de fricción que hace que alguien pida de menos para terminar antes.
 *
 * ⚠️ **Elegir un combo pisa lo que haya cargado**, no lo suma: es un punto de partida, y después se
 * ajusta con los `±` de abajo. Sumar dejaría "2 historias" convertidas en 4 sin que se entienda por
 * qué.
 */
export type ComboEntregables = { nombre: string; pedido: PedidoPorTipo }

/** Se arma sobre el vacío para que agregar un tipo nuevo no obligue a tocar cada combo. */
const combo = (p: Partial<PedidoPorTipo>): PedidoPorTipo => ({ ...PEDIDO_VACIO, ...p })

export const COMBOS_ENTREGABLES: ComboEntregables[] = [
  { nombre: '2 historias', pedido: combo({ historia_ig: 2 }) },
  { nombre: '2 historias + reel', pedido: combo({ historia_ig: 2, reel_ig: 1 }) },
  // El que pidió Bruno (4-ago-2026): es el acuerdo estándar cuando además se le pide material.
  { nombre: '2 historias + TikTok + contenido', pedido: combo({ historia_ig: 2, video_tiktok: 1, contenido: 1 }) },
  // UGC (Bruno, 26-ago-2026): una creadora a la que se le pide material y NO que publique. Es el
  // mismo botón que antes decía «Sólo contenido» —un canje de puro contenido ya era esto— con el
  // nombre con el que se lo nombra y una cantidad de arranque más realista. ⛔ No es un tipo de
  // canje ni una columna: `canjes.tipo` dice qué se le DA, y esto es qué se le PIDE. Que sea UGC se
  // deriva de los entregables (`esPedidoUgc`), y por eso sigue valiendo si después se edita el pedido.
  { nombre: 'UGC', pedido: combo({ contenido: 3 }) },
]

export function mismoPedido(a: PedidoPorTipo, b: PedidoPorTipo): boolean {
  return TIPOS_ENTREGABLE.every((t) => (Number(a[t]) || 0) === (Number(b[t]) || 0))
}

/**
 * Los combos como botones. Va **arriba** de la grilla: primero lo que se elige de un toque, después
 * el detalle para el caso raro.
 *
 * Se monta sólo al proponer. En la ficha de un canje ya acordado el pedido es lo que se pactó con
 * ella, y un botón que lo reemplaza entero de un click ahí es una forma de perder lo acordado.
 */
export function CombosEntregables({
  valor, onElegir,
}: {
  valor: PedidoPorTipo
  onElegir: (p: PedidoPorTipo) => void
}) {
  return (
    <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', marginBottom: space[3] }}>
      {COMBOS_ENTREGABLES.map((c) => {
        const puesto = mismoPedido(valor, c.pedido)
        return (
          <Button
            key={c.nombre}
            variant={puesto ? 'soft' : 'outline'}
            tone={puesto ? 'brand' : undefined}
            size="sm"
            onClick={() => onElegir(c.pedido)}
            title={detalleDelCombo(c)}
          >
            {c.nombre}
          </Button>
        )
      })}
    </div>
  )
}

/** "2 historias de instagram · 1 video de tiktok": lo mismo que va a quedar marcado abajo. */
function detalleDelCombo(c: ComboEntregables): string {
  return TIPOS_ENTREGABLE
    .filter((t) => Number(c.pedido[t]) > 0)
    .map((t) => entregableEnCriollo(t, Number(c.pedido[t])))
    .join(' · ')
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
                más trabajo que tocar dos veces. El control vive en el kit: es el mismo que cuenta
                los productos al proponer. */}
            <PasoCantidad
              valor={n}
              onCambio={(x) => set(t, x)}
              etiqueta={ENTREGABLE_LABEL[t]}
              etiquetaPlural={ENTREGABLE_LABEL_PLURAL[t]}
            />
          </div>
        )
      })}
    </div>
  )
}
