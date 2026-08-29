'use client'

/**
 * **Qué se le dijo al cliente, con su texto y su fecha.**
 *
 * La contracara de `BotonMensaje`: uno apila, esto lee. Vive en el detalle de la fila porque es
 * ahí donde alguien va a preguntarse *«¿qué le prometimos?»* — típicamente cuando el cliente vuelve
 * a escribir diciendo que le dijeron otra cosa.
 *
 * 🔑 **Se pide aparte y ⛔ no viaja en el listado.** Medido sobre los 31 mensajes que arma hoy el
 * módulo: 283 bytes de promedio y 436 el más largo, o sea ~1,4 KB por reclamo con sus cinco
 * momentos, contra los 1,925 KB que pesa hoy la fila entera. Meterlo en `COLS` **duplica** un
 * listado de 200 filas para dibujar una columna que ⛔ no lo usa. Mismo molde que el token.
 *
 * 🔴 🔑 **Y lo que más importa de esta pantalla es lo que dice cuando está VACÍA.** El registro
 * empezó el 29-ago-2026: todo lo anterior —los tres mensajes de R-0022, el primer reclamo real de
 * BDI— ⛔ no está. Una lista vacía leída como *«no se le dijo nada»* es exactamente el «el cero
 * afirma» que este módulo viene tapando en `retencion_respuesta`, en «A devolver» y en el destino
 * de las unidades. Así que lo dice la pantalla, y ⛔ no se deduce.
 */

import { useEffect, useState } from 'react'
import { color, font, space, weight } from '@/components/ui'
import { leerMensajes } from '@/lib/reclamos/cliente'
import { MOMENTO_MENSAJE_LABEL, type MensajeRegistrado } from '@/lib/reclamos/tipos'
import type { Marca } from '@/lib/nav.datos'

/**
 * El día que la columna `mensajes` empezó a escribirse. Antes de esto la lista está vacía **para
 * todos los reclamos**, y eso ⛔ no dice nada sobre lo que se les dijo.
 */
const DESDE_CUANDO_SE_REGISTRA = '29-ago-2026'

type Traido = { clave: string; lista: MensajeRegistrado[] | null; error: string | null }

export function QueSeLeDijo({ marca, id }: { marca: Marca; id: number }) {
  /**
   * ⚠️ **La respuesta viaja con la CLAVE de a quién pertenece**, y ⛔ no se limpia el estado al
   * entrar al efecto. Las dos cosas: limpiar adentro del efecto es un render en cascada (lo marca
   * el lint), y sin la clave la lista del reclamo anterior queda dibujada abajo del encabezado del
   * nuevo — o sea *«esto es lo que le dijimos»* sobre otro cliente. Mientras la clave no coincide,
   * lo que corresponde decir es que se está leyendo.
   */
  const [traido, setTraido] = useState<Traido>({ clave: '', lista: null, error: null })
  const clave = `${marca}:${id}`

  useEffect(() => {
    let vivo = true
    leerMensajes(marca, id)
      .then((m) => { if (vivo) setTraido({ clave: `${marca}:${id}`, lista: m, error: null }) })
      .catch((e) => { if (vivo) setTraido({ clave: `${marca}:${id}`, lista: null, error: (e as Error).message }) })
    return () => { vivo = false }
  }, [marca, id])

  const { lista, error } = traido.clave === clave ? traido : { lista: null, error: null }

  return (
    <div style={{ minWidth: 280, flex: '1 1 280px' }}>
      <div style={{ fontSize: font.xs, fontWeight: weight.semibold, color: color.mut, marginBottom: 4 }}>Qué se le dijo</div>
      {error && <div style={{ fontSize: font.xs, color: color.danger }}>{error}</div>}
      {!error && lista === null && <div style={{ fontSize: font.xs, color: color.mut2 }}>Leyendo…</div>}
      {!error && lista?.length === 0 && (
        <div style={{ fontSize: font.xs, color: color.mut2 }}>
          Nada registrado. ⚠️ Eso ⛔ no quiere decir que no se le dijo nada: los mensajes se
          registran desde el {DESDE_CUANDO_SE_REGISTRA}, y los anteriores no están.
        </div>
      )}
      {!error && lista?.map((m, i) => (
        <details key={i} style={{ fontSize: font.xs, color: color.ink2, padding: '1px 0' }}>
          <summary style={{ cursor: 'pointer', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ color: color.mut2, fontVariantNumeric: 'tabular-nums' }}>{new Date(m.at).toLocaleString('es-AR')}</span>
            <span style={{ fontWeight: weight.semibold }}>{MOMENTO_MENSAJE_LABEL[m.tipo] || m.tipo}</span>
            {m.por && <span style={{ color: color.mut }}>· {m.por}</span>}
          </summary>
          {/* El texto tal cual salió: los saltos de línea son parte del mensaje que se pegó. */}
          <div style={{ whiteSpace: 'pre-wrap', color: color.mut, margin: `${space[1]}px 0 ${space[2]}px 0`, paddingLeft: space[3], borderLeft: `2px solid ${color.line}` }}>
            {m.texto}
          </div>
        </details>
      ))}
    </div>
  )
}
