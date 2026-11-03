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

/** Alto de cada acción y lo que suman el relleno y el borde del menú (medido: 7 acciones = 234 px). */
const ALTO_ACCION = 32
const ALTO_MARCO = 10
const MARGEN = 4

/**
 * Dónde va el menú fijo a la pantalla: abajo del «⋯»; si ⛔ entra, arriba; si ⛔ entra en ninguno de los dos, del lado con más
 * lugar y con scroll adentro. Se calcula con la CANTIDAD de acciones: el «⋯» de una venta trae 7 y un alto fijo se quedaba corto.
 */
export function lugarDelMenu(
  boton: { left: number; right: number; top: number; bottom: number },
  pantalla: { ancho: number; alto: number },
  cuantas: number,
  alinear: 'izquierda' | 'derecha',
): React.CSSProperties {
  const alto = cuantas * ALTO_ACCION + ALTO_MARCO
  const abajo = pantalla.alto - boton.bottom - MARGEN * 2
  const arriba = boton.top - MARGEN * 2
  const vaAbajo = alto <= abajo || abajo >= arriba
  return {
    position: 'fixed',
    ...(alinear === 'izquierda' ? { left: boton.left, right: 'auto' } : { right: pantalla.ancho - boton.right, left: 'auto' }),
    ...(vaAbajo ? { top: boton.bottom + MARGEN, bottom: 'auto' } : { bottom: pantalla.alto - boton.top + MARGEN, top: 'auto' }),
    ...(alto > (vaAbajo ? abajo : arriba) ? { maxHeight: vaAbajo ? abajo : arriba, overflowY: 'auto' } : null),
  }
}

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

export function MenuAcciones({ acciones, etiqueta, disabled, vertical, alinear = 'derecha', alPie, flotante = !!vertical && !alPie }: {
  acciones: AccionMenu[]
  /** Qué dice el lector de pantalla. Va con el nombre de la cosa adentro, ⛔ no «Más acciones». */
  etiqueta: string
  disabled?: boolean
  /** «⋯» vertical: el de las listas del ERP (diseño 18-oct §4). Sin la prop, el horizontal de siempre. */
  vertical?: boolean
  /** De qué lado se abre el menú. 'izquierda' para el «⋯» que va en la PRIMERA columna (listas del ERP). */
  alinear?: 'izquierda' | 'derecha'
  /** 📱 El «⋯» del pie de la ficha en el celular: botón de 44 px para el dedo, y el menú abre HACIA ARRIBA (abajo no hay lugar). */
  alPie?: boolean
  /**
   * El menú se dibuja fijo a la pantalla, ⛔ adentro de la lista: la caja que scrollea lo cortaba y en las últimas filas ⛔ se veía
   * ninguna acción (medido 3-nov: Ventas, Redondeo, Tokens). Es lo de siempre en el «⋯» vertical, el de las listas del ERP.
   * Se cierra al scrollear: fijo, quedaría lejos de su fila.
   */
  flotante?: boolean
}) {
  const [abierto, setAbierto] = useState(false)
  const [lugar, setLugar] = useState<React.CSSProperties | null>(null)
  const caja = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false)
    document.addEventListener('mousedown', fuera)
    const cerrar = () => setAbierto(false)
    // El scroll del propio menú ⛔ lo cierra: si ⛔ entra en la pantalla, scrollea adentro.
    const alScrollear = (e: Event) => { if (!(e.target instanceof Node && caja.current?.contains(e.target))) setAbierto(false) }
    document.addEventListener('keydown', esc)
    if (flotante) { window.addEventListener('scroll', alScrollear, true); window.addEventListener('resize', cerrar) }
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', esc)
      window.removeEventListener('scroll', alScrollear, true)
      window.removeEventListener('resize', cerrar)
    }
  }, [abierto, flotante])

  const alternar = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (flotante && !abierto) {
      setLugar(lugarDelMenu(e.currentTarget.getBoundingClientRect(), { ancho: window.innerWidth, alto: window.innerHeight }, acciones.length, alinear))
    }
    setAbierto((o) => !o)
  }

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
        onClick={alternar}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          // 🔴 `height` y `width` explícitas: `.shell-content button` del bloque legacy le fija a
          // TODO `<button>` crudo la altura de un control y un padding lateral de 14px, así que sin
          // esto el «⋯» sale con forma de botón de texto. Ver `tests/boton-crudo-altura.test.ts`.
          height: alPie ? 44 : 28, width: alPie ? 44 : 28, flex: alPie ? '0 0 44px' : undefined, padding: 0,
          border: `1px solid ${abierto || alPie ? color.line2 : 'transparent'}`,
          borderRadius: radius.md,
          background: abierto ? color.bg2 : 'transparent',
          color: color.mut,
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Icono nombre={vertical ? 'puntos-v' : 'puntos'} size={18} />
      </button>

      {abierto && (
        <div
          id={id}
          role="menu"
          style={{
            position: 'absolute', zIndex: 40, ...(alPie ? { bottom: 'calc(100% + 6px)' } : { top: 'calc(100% + 4px)' }), ...(alinear === 'izquierda' ? { left: 0 } : { right: 0 }), minWidth: 210,
            ...(flotante && lugar ? lugar : null),
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
                height: 'auto', minHeight: alPie ? 44 : 32, padding: '6px 8px', textAlign: 'left',
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
