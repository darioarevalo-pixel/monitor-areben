'use client'

/**
 * Button — primitiva de acción del kit. variant (forma) + tone (color) + size (densidad).
 *
 * La forma y los estados viven en `.mo-btn` (kit.css); acá solo se resuelven los colores
 * del tono y se pasan en custom properties. Antes el `:hover` se emulaba con `useState`
 * —un re-render de React por pasar el mouse— porque el kit estaba obligado a usar
 * estilos inline para vencerle al CSS del legacy. Muerto el legacy, el hover es CSS.
 *
 * Jerarquía de acciones (la regla del rediseño, para que no vuelva el "un botón, un
 * color inventado"):
 *   solid + brand    → la acción principal de la pantalla. UNA por pantalla.
 *   outline neutral  → secundarias (el default).
 *   ghost            → terciarias, dentro de una fila o celda.
 *   solid/soft danger→ destructivas, y siempre con confirmación.
 *   warning          → ámbar: solo advertencia (operación que pisa datos).
 */
import { forwardRef } from 'react'
import { color, toneTokens, toneSolid, toneSolidHover, type Tone } from '@/components/ui/tokens'

export type ButtonVariant = 'solid' | 'soft' | 'outline' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg'

export type ButtonProps = {
  variant?: ButtonVariant
  tone?: Tone
  size?: ButtonSize
  loading?: boolean
  iconLeft?: React.ReactNode
  fullWidth?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>

/** Los colores del tono como custom properties que consume `.mo-btn`. */
function vars(variant: ButtonVariant, tone: Tone): React.CSSProperties {
  const t = toneTokens[tone]
  const solid = toneSolid[tone]
  const neutral = tone === 'neutral'

  if (variant === 'solid') {
    return { '--_bg': solid, '--_fg': '#fff', '--_bd': solid, '--_bg-hover': toneSolidHover[tone] } as React.CSSProperties
  }
  if (variant === 'soft') {
    return { '--_bg': t.bg, '--_fg': t.fg, '--_bd': t.border, '--_bg-hover': t.bg } as React.CSSProperties
  }
  if (variant === 'outline') {
    return {
      '--_bg': color.surface,
      '--_fg': neutral ? color.ink2 : t.fg,
      '--_bd': neutral ? color.line2 : t.border,
      '--_bg-hover': neutral ? color.bg2 : t.bg,
    } as React.CSSProperties
  }
  return {
    '--_bg': 'transparent',
    '--_fg': neutral ? color.ink2 : t.fg,
    '--_bd': 'transparent',
    '--_bg-hover': neutral ? color.bg2 : t.bg,
  } as React.CSSProperties
}

/**
 * **El mismo botón, pero que NAVEGA AFUERA.** Un `<a>` de verdad, con la forma del kit.
 *
 * 🔴 **Existe porque la clase sola NO alcanza.** `.mo-btn` toma sus colores de las custom
 * properties `--_bg` / `--_fg` / `--_bd`, y quien las pone es `vars()`, **inline**. Un `<a>` con
 * `className="mo-btn"` y nada más se dibuja **sin fondo y sin borde**: al lado de los botones de
 * verdad se lee como un texto suelto. Pasó con «Cargar horas extras» en Inicio, y lo cazó Bruno
 * mirando la pantalla — *«que sea un botón mejor, porque está raro»* (30-ago-2026).
 *
 * ⚠️ **Y va un `<a>`, ⛔ no un `<Button onClick={window.open}>`**: es un link que se copia, se abre
 * en otra pestaña y se manda por WhatsApp, que es exactamente cómo se usa el de horas extras.
 */
export type ButtonLinkProps = {
  variant?: ButtonVariant
  tone?: Tone
  size?: ButtonSize
  iconLeft?: React.ReactNode
  fullWidth?: boolean
} & React.AnchorHTMLAttributes<HTMLAnchorElement>

export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(function ButtonLink(
  { variant = 'outline', tone = 'neutral', size = 'md', iconLeft, fullWidth, className, style, children, ...rest },
  ref,
) {
  return (
    <a
      ref={ref}
      className={['mo-btn', `mo-btn--${size}`, fullWidth ? 'mo-btn--full' : '', className ?? ''].filter(Boolean).join(' ')}
      style={{ ...vars(variant, tone), whiteSpace: 'nowrap', ...style }}
      {...rest}
    >
      {iconLeft}
      {children}
    </a>
  )
})

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'outline', tone = 'neutral', size = 'md', loading, iconLeft, fullWidth, disabled, className, style, children, ...rest },
  ref,
) {
  const off = !!disabled || !!loading
  return (
    <button
      ref={ref}
      disabled={off}
      className={['mo-btn', `mo-btn--${size}`, fullWidth ? 'mo-btn--full' : '', className ?? ''].filter(Boolean).join(' ')}
      style={{ ...vars(variant, tone), ...style }}
      {...rest}
    >
      {loading ? (
        <span aria-hidden style={{ opacity: 0.8 }}>
          …
        </span>
      ) : (
        iconLeft
      )}
      {children}
    </button>
  )
})
