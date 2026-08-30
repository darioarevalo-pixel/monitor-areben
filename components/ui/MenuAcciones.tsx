'use client'

/**
 * MenuAcciones — el «⋯» de una fila: lo que no entra al lado, entra acá adentro.
 *
 * # Por qué existe
 *
 * 🔴 Medido caminando Meta el 30-ago-2026: cada fila de la tabla de celdas dibujaba **hasta seis
 * botones idénticos** —Pausar · Presupuesto · Escalar · Duplicar · Nueva campaña · Renombrar—, todos
 * `ghost`, todos del mismo tamaño y todos del mismo color. Dos consecuencias, y la segunda es peor
 * que la primera:
 *
 *  1. **La fila crece con la cantidad de botones.** En pantallas angostas envuelven, y una tabla
 *     donde cada renglón mide dos o tres alturas deja de ser una tabla. Bruno: *«una celda tiene el
 *     tamaño de la cantidad de botones que tenga la acción, es una locura»*.
 *  2. 🔑 **Seis botones iguales no tienen jerarquía.** El que se aprieta todos los días —pausar— pesa
 *     lo mismo que el que se aprieta una vez por mes, así que hay que LEER los seis cada vez. La
 *     jerarquía no es decoración: es lo que hace que la mano vaya sola.
 *
 * ⇒ afuera queda **el gesto de todos los días, con ícono y color**; acá adentro, el resto **con su
 * nombre escrito**. ⛔ Lo de adentro ⛔ no va sólo con ícono: seis íconos sin texto en un menú son
 * seis adivinanzas, y la regla del ícono solo (`VOCABULARIO.md` §3.3) es para el gesto que se repite
 * **una vez por fila**, ⛔ no para una lista.
 *
 * ⚠️ **El rótulo del disparador NOMBRA la cosa.** Diez «⋯» apilados son diez botones idénticos para
 * quien no ve la pantalla; por eso `etiqueta` es obligatoria y va entero: «Más acciones de «X»».
 */

import { useEffect, useId, useRef, useState } from 'react'
import { Icono, type NombreIcono } from '@/components/ui/Icono'
import { color, font, radius, shadow, space, weight } from '@/components/ui/tokens'
import type { Tone } from '@/components/ui/tokens'

export type AccionMenu = {
  key: string
  label: string
  icono?: NombreIcono
  onClick: () => void
  /** El tono del texto. `danger` para lo que cuesta plata o no se deshace. */
  tone?: Tone
  /** Qué hace, en una frase. Es el mismo texto que antes vivía en el `title` del botón suelto. */
  hint?: string
  disabled?: boolean
}

export function MenuAcciones({ acciones, etiqueta, disabled }: {
  acciones: AccionMenu[]
  /** Qué dice el lector de pantalla. Va con el nombre de la cosa adentro, ⛔ no «Más acciones». */
  etiqueta: string
  disabled?: boolean
}) {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false)
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', esc)
    }
  }, [abierto])

  // ⛔ Sin acciones NO se dibuja el disparador: un «⋯» que abre un menú vacío es peor que no tenerlo,
  // porque enseña que apretarlo no sirve y después no se aprieta el que sí tiene algo.
  if (!acciones.length) return null

  return (
    <div ref={caja} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        aria-label={etiqueta}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={abierto ? id : undefined}
        disabled={disabled}
        onClick={() => setAbierto((o) => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          // 🔴 `height` y `width` explícitas: `.shell-content button` del bloque legacy le fija a
          // TODO `<button>` crudo la altura de un control y un padding lateral de 14px, así que sin
          // esto el «⋯» sale con forma de botón de texto. Ver `tests/boton-crudo-altura.test.ts`.
          height: 28, width: 28, padding: 0,
          border: `1px solid ${abierto ? color.line2 : 'transparent'}`,
          borderRadius: radius.md,
          background: abierto ? color.bg2 : 'transparent',
          color: color.mut,
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Icono nombre="puntos" size={18} />
      </button>

      {abierto && (
        <div
          id={id}
          role="menu"
          style={{
            position: 'absolute', zIndex: 40, top: 'calc(100% + 4px)', right: 0, minWidth: 210,
            background: color.surface, border: `1px solid ${color.line}`, borderRadius: radius.lg,
            boxShadow: shadow.pop, padding: space[1],
          }}
        >
          {acciones.map((a) => (
            <button
              key={a.key}
              type="button"
              role="menuitem"
              disabled={a.disabled}
              title={a.hint}
              onClick={() => { setAbierto(false); a.onClick() }}
              style={{
                display: 'flex', alignItems: 'center', gap: space[2], width: '100%',
                // `auto` porque el rótulo puede envolver: es la misma trampa de la altura fija.
                height: 'auto', minHeight: 32, padding: '6px 8px', textAlign: 'left',
                background: 'transparent', border: 0, borderRadius: radius.sm,
                fontFamily: 'inherit', fontSize: font.base, fontWeight: weight.medium,
                color: a.disabled ? color.mut2 : a.tone === 'danger' ? color.dangerInk : color.ink2,
                cursor: a.disabled ? 'default' : 'pointer',
              }}
            >
              {a.icono && <Icono nombre={a.icono} size={16} />}
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
