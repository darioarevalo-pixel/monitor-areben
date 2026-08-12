'use client'

/**
 * Modal — diálogo del kit. Es la base de `Confirm` y el reemplazo de los modales ad-hoc
 * que cada sección se armaba con `position:fixed` a mano (los había en disenos, exhib,
 * sesionfotos, fundas, crm, ingresos, solicitudes…).
 *
 * Se ocupa de lo que esos modales a mano casi nunca hacían: cerrar con Escape, no dejar
 * scrollear el fondo, devolver el foco a donde estaba, y en el teléfono apoyarse abajo
 * para que llegue el pulgar.
 */
import { useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export type ModalProps = {
  abierto: boolean
  onCerrar: () => void
  titulo?: React.ReactNode
  /** Botones del pie. Van a la derecha; la acción principal, última. */
  pie?: React.ReactNode
  /**
   * `xl` es para el diálogo que se parte en dos columnas y no puede pedir scroll — hoy, definir el
   * precio de una liquidación: son cuarenta productos seguidos y bajar en cada uno se paga cuarenta
   * veces. No es "un poco más ancho": es lo que permite que el contenido deje de ser una sola tira.
   */
  ancho?: 'normal' | 'ancho' | 'xl'
  /** Clic en el fondo cierra. Se apaga en diálogos donde perder lo tipeado dolería. */
  cerrarConFondo?: boolean
  /**
   * Escape cierra. Se apaga en los diálogos que tienen que **bloquear** de verdad — el cartel de
   * una novedad importante, que existe justamente para que no se pueda esquivar sin leerlo.
   *
   * Vino después que `cerrarConFondo` y con default `true` para que las ~15 pantallas que ya usan
   * el kit, y `Confirm`, no cambien en nada. Sin esto, apagar el fondo no alcanzaba: el Escape
   * seguía siendo una salida y el cartel no bloqueaba nada.
   */
  cerrarConEscape?: boolean
  children: React.ReactNode
}

export function Modal({
  abierto, onCerrar, titulo, pie, ancho = 'normal',
  cerrarConFondo = true, cerrarConEscape = true, children,
}: ModalProps) {
  const caja = useRef<HTMLDivElement>(null)
  const foco = useRef<Element | null>(null)

  const cerrar = useCallback(() => onCerrar(), [onCerrar])

  // 🔴 **Lo que el efecto de abajo necesita, va por ref, y el efecto depende SÓLO de `abierto`.**
  // Casi todos los llamadores pasan `onCerrar={() => …}` inline, así que `cerrar` cambia de
  // identidad en cada render del padre; con `cerrar` en las dependencias, el efecto —y con él el
  // `focus()` de más abajo— corría **en cada tecla**. Se veía escribiendo el % de descuento en
  // Liquidación: entraba un dígito y el foco se iba solo, así que no se podía tipear "30".
  const vivo = useRef({ cerrar, cerrarConEscape })
  useEffect(() => {
    vivo.current = { cerrar, cerrarConEscape }
  })

  useEffect(() => {
    if (!abierto) return
    foco.current = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && vivo.current.cerrarConEscape) {
        e.stopPropagation()
        vivo.current.cerrar()
      }
    }
    document.addEventListener('keydown', onKey)

    // El foco entra al diálogo: si no, un Enter seguiría disparando el botón de atrás.
    // ⚠️ `data-foco` va en su **propio** `querySelector`: con la lista separada por comas se
    // devuelve el primero en orden del DOM, no el primero de la lista, y cualquier botón que
    // esté más arriba en el diálogo se lleva el foco que un campo pidió explícitamente.
    const primero =
      caja.current?.querySelector<HTMLElement>('[data-foco]') ??
      caja.current?.querySelector<HTMLElement>('button, input, select, textarea, a[href]')
    primero?.focus()

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      ;(foco.current as HTMLElement | null)?.focus?.()
    }
  }, [abierto])

  if (!abierto) return null

  return createPortal(
    <div className="mo-backdrop" onMouseDown={(e) => cerrarConFondo && e.target === e.currentTarget && cerrar()}>
      <div
        ref={caja}
        className={`mo-modal${ancho === 'ancho' ? ' mo-modal--wide' : ancho === 'xl' ? ' mo-modal--xl' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={typeof titulo === 'string' ? titulo : undefined}
      >
        {titulo != null && (
          <div className="mo-modal-head">
            <div className="mo-modal-title">{titulo}</div>
          </div>
        )}
        <div className="mo-modal-body">{children}</div>
        {pie != null && <div className="mo-modal-foot">{pie}</div>}
      </div>
    </div>,
    document.body,
  )
}
