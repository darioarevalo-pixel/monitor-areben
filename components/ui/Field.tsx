'use client'

/** Field + Input + Select + NumberField — controles de formulario del kit (foco ámbar accesible). */
import { forwardRef, useState } from 'react'
import { color, radius, font, weight, focusRing, space } from '@/components/ui/tokens'

const controlBase: React.CSSProperties = {
  fontSize: font.base,
  padding: '9px 12px',
  borderRadius: radius.lg,
  border: `1px solid ${color.line2}`,
  background: color.surface,
  color: color.ink,
  outline: 'none',
  width: '100%',
  transition: 'border-color .12s ease, box-shadow .12s ease',
  fontFamily: 'inherit',
}

export type FieldProps = {
  label?: React.ReactNode
  hint?: React.ReactNode
  error?: string
  required?: boolean
  width?: number | string
  children: React.ReactNode
  style?: React.CSSProperties
}

export function Field({ label, hint, error, required, width, children, style }: FieldProps) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: width ? `0 1 ${typeof width === 'number' ? width + 'px' : width}` : undefined, minWidth: 0, ...style }}>
      {label && (
        <span style={{ fontSize: font.xs, color: color.mut, fontWeight: weight.medium }}>
          {label}
          {required && <span style={{ color: color.danger }}> *</span>}
        </span>
      )}
      {children}
      {error ? <span style={{ fontSize: font.xs, color: color.danger }}>{error}</span> : hint ? <span style={{ fontSize: font.xs, color: color.mut2 }}>{hint}</span> : null}
    </label>
  )
}

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ invalid, style, onFocus, onBlur, ...rest }, ref) {
  const [focus, setFocus] = useState(false)
  return (
    <input
      ref={ref}
      style={{ ...controlBase, borderColor: invalid ? color.danger : focus ? color.brandBorder : color.line2, boxShadow: focus ? focusRing : undefined, ...style }}
      onFocus={(e) => { setFocus(true); onFocus?.(e) }}
      onBlur={(e) => { setFocus(false); onBlur?.(e) }}
      {...rest}
    />
  )
})

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean; children: React.ReactNode }

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ invalid, style, onFocus, onBlur, children, ...rest }, ref) {
  const [focus, setFocus] = useState(false)
  return (
    <select
      ref={ref}
      style={{ ...controlBase, cursor: 'pointer', borderColor: invalid ? color.danger : focus ? color.brandBorder : color.line2, boxShadow: focus ? focusRing : undefined, ...style }}
      onFocus={(e) => { setFocus(true); onFocus?.(e) }}
      onBlur={(e) => { setFocus(false); onBlur?.(e) }}
      {...rest}
    >
      {children}
    </select>
  )
})

export type NumberFieldProps = {
  value: number | ''
  onChange: (n: number) => void
  min?: number
  max?: number
  step?: number
  prefix?: React.ReactNode
  width?: number
  invalid?: boolean
  disabled?: boolean
  style?: React.CSSProperties
}

/** Input numérico con prefijo (ej. "$" o "×"). Clampa a [min,max]. */
export function NumberField({ value, onChange, min, max, step, prefix, width = 96, invalid, disabled, style }: NumberFieldProps) {
  const [focus, setFocus] = useState(false)
  const clamp = (n: number) => {
    let v = n
    if (min != null) v = Math.max(v, min)
    if (max != null) v = Math.min(v, max)
    return v
  }
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        border: `1px solid ${invalid ? color.danger : focus ? color.brandBorder : color.line2}`,
        borderRadius: radius.lg, background: disabled ? color.bg2 : color.surface,
        padding: '0 8px', width, boxShadow: focus ? focusRing : undefined,
        transition: 'border-color .12s ease, box-shadow .12s ease', ...style,
      }}
    >
      {prefix != null && <span style={{ fontSize: font.sm, color: color.mut2 }}>{prefix}</span>}
      <input
        type="number" value={value} min={min} max={max} step={step} disabled={disabled}
        onChange={(e) => onChange(clamp(Number(e.target.value) || 0))}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: font.base, padding: '9px 0', color: color.ink, fontFamily: 'inherit', MozAppearance: 'textfield' as React.CSSProperties['MozAppearance'] }}
      />
    </span>
  )
}

/** Escape hatch: los estilos base del control, por si una sección arma un control ad-hoc. */
export const fieldControlStyle = controlBase
export const fieldRowGap = space[3]
