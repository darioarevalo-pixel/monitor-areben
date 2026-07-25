'use client'

/**
 * La etiqueta de marca (BDI / Zattia).
 *
 * Estaba copiada en tres archivos —Inicio, Solicitudes y Gerencial— con hex propios en
 * cada uno. Aparece siempre en el mismo contexto: listas que mezclan las dos marcas,
 * donde su única función es distinguirlas de un golpe de vista. Por eso NO usa el acento
 * de la app: si las dos fueran índigo, dejaría de servir para lo único que existe. Sus
 * dos colores viven en `app/tokens.css` como identidad, no como sistema.
 */
import { font, radius, weight } from '@/components/ui/tokens'
import type { Marca } from '@/lib/nav.datos'

export function MarcaChip({ marca }: { marca: Marca }) {
  const zattia = marca === 'zattia'
  return (
    <span
      style={{
        display: 'inline-block',
        background: zattia ? 'var(--mo-marca-zattia-bg)' : 'var(--mo-marca-bdi-bg)',
        color: zattia ? 'var(--mo-marca-zattia-fg)' : 'var(--mo-marca-bdi-fg)',
        borderRadius: radius.sm,
        padding: '1px 7px',
        fontSize: font.xs,
        fontWeight: weight.bold,
        whiteSpace: 'nowrap',
      }}
    >
      {zattia ? 'Zattia' : 'BDI'}
    </span>
  )
}
