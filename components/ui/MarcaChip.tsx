'use client'

/**
 * La etiqueta de línea (BDI / Zattia / Stunned).
 *
 * Estaba copiada en tres archivos —Inicio, Solicitudes y Gerencial— con hex propios en
 * cada uno. Aparece siempre en el mismo contexto: listas que mezclan las dos marcas,
 * donde su única función es distinguirlas de un golpe de vista. Por eso NO usa el acento
 * de la app: si las dos fueran índigo, dejaría de servir para lo único que existe. Sus
 * tres colores viven en `app/tokens.css` como identidad, no como sistema.
 *
 * 🔑 **Toma una `Linea` y no una `Marca`** (22-ago-2026): en la lista de solicitudes conviven las
 * de Zattia y las de Stunned, y el chip es lo único que las distingue. Poner «Zattia» arriba de una
 * solicitud de Stunned sería el defecto que el selector de línea existe para no tener.
 */
import { font, radius, weight } from '@/components/ui/tokens'
import { ETIQUETA_LINEA, type Linea } from '@/lib/lineas'

export function MarcaChip({ marca }: { marca: Linea }) {
  return (
    <span
      style={{
        display: 'inline-block',
        background: `var(--mo-marca-${marca}-bg)`,
        color: `var(--mo-marca-${marca}-fg)`,
        borderRadius: radius.sm,
        padding: '1px 7px',
        fontSize: font.xs,
        fontWeight: weight.bold,
        whiteSpace: 'nowrap',
      }}
    >
      {ETIQUETA_LINEA[marca]}
    </span>
  )
}
