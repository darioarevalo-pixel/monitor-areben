'use client'

/**
 * LA TIRA DE DÍAS: los últimos catorce, y un clic para anclar la tabla a uno.
 *
 * # Por qué existe
 *
 * Bruno, 26-ago-2026: *«perdí las vistas de hoy, ayer, y hace 3 días»*, y los tres usos que dio son
 * el mismo gesto — **comparar día contra día** y **chequear el efecto de un cambio que hizo hace dos
 * o tres días**. Una barra de ventanas (7/14/30) no contesta eso: promedia justo lo que se quiere
 * separar.
 *
 * ⚠️ *«Hace 3 días»* ⛔ nunca existió en el monitor como preset, y esto es más que aquello: se elige
 * **cualquier** día, no tres fijos.
 *
 * # 🔑 No cuesta una sola llamada
 *
 * Sale de `zona.caja`, que ya viaja en la respuesta y ya trae ~40 días con gasto, pedidos REALES de
 * Tienda Nube y costo por pedido. La tira es **UI sobre datos que ya estaban**.
 *
 * # ⚠️ La tira nunca puede ofrecer HOY, y eso es estructural
 *
 * `caja` viene cortada en `ultimoDiaCerrado()`. ⛔ No hace falta un chequeo acá: el día en curso no
 * está en la lista porque el servidor no lo puso. Para hoy está la banda de arriba, que sale de
 * Meta.
 *
 * # 🔴 Cada botón lleva `height: auto`, y no es cosmética
 *
 * `.shell-content button` del bloque legacy fija `height: var(--mo-ctl-h)` para TODOS los `<button>`
 * crudos. Un botón de cuatro renglones —día, pedidos, la barrita, el costo— se desborda y los
 * números salen **cortados por la mitad, afuera de su caja**. Ya pasó acá el 26-ago-2026, en la
 * primera pasada. Está escrito como invariante en `AGENTS.md`.
 */

import { entero, plata } from '@/lib/meta-ads/formato'
import type { DiaCaja } from '@/lib/meta-ads/rendimiento'
import { color, font, radius, space, weight } from '@/components/ui'

/** `dd/mm` + la inicial del día. La fecha se parte a mano: `new Date('2026-08-24')` es UTC y en
 *  Argentina se dibuja el día anterior — ya mordió en este repo. */
function rotulo(fecha: string) {
  const [a, m, d] = fecha.split('-').map(Number)
  const dia = new Date(Date.UTC(a, m - 1, d)).getUTCDay()
  return { corto: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`, letra: 'DLMMJVS'[dia] }
}

export function TiraDeDias({ caja, techo, anclado, onElegir }: {
  caja: DiaCaja[]
  /** El techo por pedido de la línea. `0` ⇒ no se colorea nada: ⛔ no se inventa un default. */
  techo: number
  anclado: string | null
  onElegir: (fecha: string | null) => void
}) {
  const dias = caja.slice(-14)
  if (!dias.length) return null
  const maxGasto = Math.max(...dias.map((d) => d.gasto), 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[1] }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2] }}>
        <span style={{ fontSize: font.xs, fontWeight: weight.semibold, color: color.mut }}>
          DÍA POR DÍA · pedidos de la tienda (todos los canales)
        </span>
        {anclado && (
          <button
            type="button"
            onClick={() => onElegir(null)}
            style={{
              // `height: auto` ⇒ ver el docblock: el legacy le fija la altura a todo `<button>`.
              border: 'none', background: 'none', padding: 0, height: 'auto', cursor: 'pointer',
              fontSize: font.xs, color: color.brandSolid, fontWeight: weight.semibold,
            }}
          >
            Ver el período entero ✕
          </button>
        )}
      </div>

      {/* Scrollea adentro suyo: la página ⛔ nunca scrollea horizontal por culpa de esto. */}
      <div style={{ display: 'flex', gap: space[1], overflowX: 'auto', paddingBottom: 2 }}>
        {dias.map((d) => {
          const esta = anclado === d.fecha
          const r = rotulo(d.fecha)
          // ⛔ Sin pedidos ese día NO se colorea: `costoPedidoReal` sería una división por cero, y un
          // día sin pedidos no es un día caro — es un día que no se puede juzgar por costo.
          const caro = techo > 0 && d.pedidos > 0 && d.costoPedidoReal > techo
          return (
            <button
              key={d.fecha}
              type="button"
              onClick={() => onElegir(esta ? null : d.fecha)}
              title={`${d.fecha} · ${plata(d.gasto)} · ${entero(d.pedidos)} pedidos${d.pedidos ? ` · ${plata(d.costoPedidoReal)} c/u` : ''}`}
              style={{
                flex: '0 0 auto', width: 62, cursor: 'pointer', textAlign: 'center',
                // 🔴 `height: auto` obligatorio: sin esto el legacy lo deja de un renglón y los
                // cuatro que lleva adentro se dibujan cortados. Ver el docblock.
                height: 'auto', lineHeight: 1.2, fontWeight: weight.normal,
                padding: `${space[1]} 0`, borderRadius: radius.md,
                border: `1px solid ${esta ? color.brandSolid : color.line}`,
                background: esta ? color.brandBg : color.surface,
                color: color.ink,
              }}
            >
              <div style={{ fontSize: 10, color: color.mut2 }}>{r.letra} {r.corto}</div>
              <div style={{ fontSize: font.base, fontWeight: weight.bold, color: caro ? color.dangerInk : color.ink }}>
                {entero(d.pedidos)}
              </div>
              {/* La barrita es el GASTO, relativo al día que más gastó de la tira: es lo que deja ver
                  de un saque «gasté parecido y vendí la mitad», que es la pregunta de verdad. */}
              <div style={{ height: 3, background: color.bg2, borderRadius: 2, margin: `2px ${space[1]} 0` }}>
                <div style={{ height: 3, width: `${Math.round((d.gasto / maxGasto) * 100)}%`, background: color.mut2, borderRadius: 2 }} />
              </div>
              <div style={{ fontSize: 10, color: color.mut2, marginTop: 2 }}>
                {d.pedidos ? plata(d.costoPedidoReal) : '—'}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
