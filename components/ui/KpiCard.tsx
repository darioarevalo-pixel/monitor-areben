'use client'

/**
 * KpiCard — tarjeta de métrica (reemplaza .stat y las KPI inline).
 *
 * Con `onClick` la tarjeta **es un filtro**, no un número decorativo (Marketing y
 * CRM › Clientes). Eso pide dos cosas que antes no estaban:
 *
 * 1. **Afordancia en reposo.** Solo cambiaba la sombra al pasar el mouse, así que en
 *    reposo era indistinguible de una métrica; y con el dedo no hay hover. Ahora lleva un
 *    pie con el verbo ("Filtrar →").
 * 2. **Estado activo.** Se tocaba "Sin foto en TN", la tabla se filtraba y nada en la
 *    pantalla decía que estaba filtrada. Con `activo` la tarjeta queda con anillo y el pie
 *    pasa a decir que ese filtro está puesto.
 *
 * Cuando es clickeable se renderiza como <button> y no como <div onClick>: así entra por
 * teclado y `aria-pressed` dice en voz alta si el filtro está aplicado. No usa <Card>
 * porque Card es un <div>; comparte la clase `.mo-card`, que es la que tiene la forma.
 */
import { Card } from '@/components/ui/Card'
import { color, font, space, weight, toneTokens, type Tone } from '@/components/ui/tokens'

export type KpiCardProps = {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  tone?: Tone
  info?: React.ReactNode
  /** Cuando la tarjeta ES un filtro (ej. los segmentos del CRM), no solo un número. */
  onClick?: () => void
  /** Solo con `onClick`: el filtro de esta tarjeta es el que está aplicado. */
  activo?: boolean
  /** Pie en reposo. Por defecto "Filtrar →". */
  accion?: string
  /** Pie cuando `activo`. Por defecto "Filtrando ✓"; si el click apaga el filtro, "Quitar filtro ✕". */
  accionActiva?: string
  style?: React.CSSProperties
}

export function KpiCard({
  label,
  value,
  sub,
  tone = 'neutral',
  info,
  onClick,
  activo,
  accion = 'Filtrar →',
  accionActiva = 'Filtrando ✓',
  style,
}: KpiCardProps) {
  const t = toneTokens[tone]
  const acento = tone !== 'neutral'
  const fg = acento ? t.fg : color.ink
  const anillo = acento ? t.border : color.brandBorder

  const cuerpo = (
    <>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: font.xs, fontWeight: weight.medium, color: acento ? t.fg : color.mut, letterSpacing: 0 }}>
        {label}
        {info}
      </div>
      <div style={{ fontSize: font.xl, fontWeight: weight.bold, color: fg, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: font.xs, color: color.mut, marginTop: 2 }}>{sub}</div>}
      {onClick && (
        <div
          style={{
            fontSize: font.xs,
            fontWeight: weight.semibold,
            color: activo ? (acento ? t.fg : color.brand) : acento ? t.fg : color.mut2,
            opacity: activo ? 1 : 0.7,
            marginTop: 6,
          }}
        >
          {activo ? accionActiva : accion}
        </div>
      )}
    </>
  )

  const base: React.CSSProperties = {
    flex: '1 1 200px',
    minWidth: 160,
    borderColor: activo ? (acento ? t.fg : color.brand) : acento ? t.border : color.line,
    background: acento ? t.bg : color.surface,
  }

  if (!onClick) {
    return (
      <Card padding={4} style={{ ...base, ...style }}>
        {cuerpo}
      </Card>
    )
  }

  return (
    <button
      type="button"
      className="mo-card mo-card--interactive"
      onClick={onClick}
      aria-pressed={!!activo}
      style={{
        ...base,
        // Reset del <button>: `.shell-content button` (legacy) le impone alto y padding
        // de control, y el navegador le pone su propia tipografía.
        display: 'block',
        width: '100%',
        height: 'auto',
        textAlign: 'left',
        font: 'inherit',
        padding: space[4],
        cursor: 'pointer',
        // El anillo es lo que distingue "filtrado" de "no filtrado" de un vistazo, y no
        // mueve el layout: va por box-shadow, no por ancho de borde.
        boxShadow: activo ? `0 0 0 3px ${anillo}` : undefined,
        ...style,
      }}
    >
      {cuerpo}
    </button>
  )
}
