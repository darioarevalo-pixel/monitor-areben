'use client'

import { useEffect, useRef } from 'react'
import { estiloDeOrigen } from './casilla'

/**
 * Un checkbox de tres estados, para el encabezado de un área: dar o sacar el sector entero.
 *
 * El indeterminado no se puede poner por atributo —es una propiedad del nodo—, así que va por
 * ref. Y hace falta de verdad: con el área plegada este tilde es lo único que dice qué hay
 * adentro, y sin el tercer estado "ninguna sección" y "la mitad" se ven igual.
 */
export function CheckTri({
  checked,
  indeterminado,
  ...rest
}: { checked: boolean; indeterminado?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminado && !checked
  }, [indeterminado, checked])
  // Mismo estilo que un permiso tildado a mano: es la casilla de "dárselo yo", en grande.
  return <input ref={ref} type="checkbox" checked={checked} style={estiloDeOrigen('explicito')} {...rest} />
}
