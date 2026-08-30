'use client'

/**
 * LOS AVISOS DE UNA CELDA: qué creativo hay adentro de la caja, y cuánto se llevó cada uno.
 *
 * # Por qué existe
 *
 * Lo pidió Bruno el 26-ago-2026 —*«tampoco sé qué creativo está dentro»*— con tres usos distintos:
 * identificar cuál es cuál (los nombres no alcanzan), mirar la pieza **antes de pausarla o
 * escalarla**, y ver **qué se está gastando la guita**. Y porque el docblock de `TablaCeldas`
 * prometía textual *«abriendo la fila están sus avisos»* y el detalle no mostraba ninguno: acá se
 * cumple la promesa **haciendo cierto el comentario, ⛔ no editándolo**.
 *
 * # De dónde sale cada mitad, y cómo sobrevive cada una sola
 *
 * 🔑 **Los números salen de la FOTO y no cuestan una llamada**; la CARA sale de Graph al abrir la
 * primera fila. Si Meta no contesta, los avisos igual se listan con sus números y se dice por qué no
 * hay imagen. Al revés no pasa: sin la foto no hay avisos.
 *
 * ⛔ **No se dibuja el `estado` del aviso.** La foto sólo guarda la configuración del día en que se
 * sacó ⇒ en una ventana vieja diría «pausado» para todo. El estado que se muestra es el VIVO, el que
 * viene con la pieza, y sólo cuando la pieza llegó.
 *
 * # 🔴 El video
 *
 * Se muestra el póster y un link a la publicación, ⛔ no un reproductor. El iframe de previsualización
 * de Meta lleva el access token del system user adentro del `src` (`api/meta-ads.js`), y ésa es una
 * decisión que ⛔ no se revierte por comodidad. El marco vive en `Cara.tsx`, compartido con la fila.
 */

import { entero, plata } from '@/lib/meta-ads/formato'
import type { AvisoDeCelda } from '@/lib/meta-ads/rendimiento'
import type { PiezaAviso } from '@/lib/meta-ads/biblioteca'
import { Cara } from '@/components/meta-ads/zona/Cara'
import { Notice, color, font, space, weight } from '@/components/ui'

export function AvisosDeCelda({ avisos, piezaDe, motivo, cargando, gastoDeLaCelda }: {
  avisos: AvisoDeCelda[]
  piezaDe: (adId: string) => PiezaAviso | null
  motivo: string | null
  cargando: boolean
  /** El gasto de la CAJA, para poder decir qué parte se lleva cada pieza. */
  gastoDeLaCelda: number
}) {
  if (!avisos.length) {
    return (
      <div style={{ fontSize: font.sm, color: color.mut2 }}>
        Ningún aviso de esta celda entregó en la ventana.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
      <div style={{ fontSize: font.xs, fontWeight: weight.semibold, color: color.mut }}>
        QUÉ HAY ADENTRO ({avisos.length})
      </div>

      {motivo && <Notice tone="warning">{motivo}</Notice>}

      {avisos.map((a) => {
        const p = piezaDe(a.id)
        // 🔑 El porcentaje es sobre el gasto de la CAJA, ⛔ no sobre el de la cuenta: la pregunta acá
        // es «adentro de esta celda, ¿quién se lleva la plata?».
        const parte = gastoDeLaCelda ? (a.spend / gastoDeLaCelda) * 100 : null
        return (
          <div key={a.id} style={{ display: 'flex', gap: space[2], alignItems: 'flex-start' }}>
            <Cara p={p} />
            <div style={{ minWidth: 0, flex: 1, fontSize: font.sm }}>
              <div style={{ fontWeight: weight.medium, color: color.ink, overflowWrap: 'anywhere' }}>
                {a.nombre || '(sin nombre)'}
              </div>
              <div style={{ color: color.mut, marginTop: 2 }}>
                <strong style={{ color: color.ink }}>{plata(a.spend)}</strong>
                {parte !== null && <> · {Math.round(parte)}% de la celda</>}
                {' · '}{entero(a.compras)} compra{a.compras === 1 ? '' : 's'}
                {/* ⛔ Sin compras va «sin compras», nunca `$0`: un cero en una columna de costos se
                    lee como «salieron gratis». Es la misma regla del resto del módulo. */}
                {a.cpa === null ? <> · <span style={{ color: color.mut2 }}>sin compras</span></> : <> a {plata(a.cpa)}</>}
              </div>
              <div style={{ color: color.mut2, fontSize: font.xs, marginTop: 2 }}>
                {/* `diasConGasto` y no `dias`: un aviso que existe hace 30 días y entregó 3 ⛔ no
                    lleva 30 días corriendo, y eso es lo que dice si el costo de al lado se puede creer. */}
                {a.diasConGasto} día{a.diasConGasto === 1 ? '' : 's'} con entrega · CTR {a.ctr.toFixed(2)}%
                {p?.estado && p.estado !== 'ACTIVE' && <> · <b>{p.estado.toLowerCase()}</b></>}
                {p?.permalink && (
                  <>
                    {' · '}
                    <a href={p.permalink} target="_blank" rel="noreferrer" style={{ color: color.brand }}>
                      {p.esVideo ? 'ver el video ↗' : 'ver la publicación ↗'}
                    </a>
                  </>
                )}
              </div>
            </div>
          </div>
        )
      })}

      {cargando && (
        <div style={{ fontSize: font.xs, color: color.mut2 }}>Trayendo las piezas de Meta…</div>
      )}
    </div>
  )
}
