'use client'

/**
 * Field + Input + Select + NumberField — controles de formulario del kit.
 *
 * La forma y el foco viven en `.mo-input` / `.mo-select` (kit.css): un `:focus` real con
 * ring índigo, en vez del `useState` que había acá para emularlo. Si una sección necesita
 * un control ad-hoc (un input dentro de una celda, por ejemplo), le pone la clase
 * `mo-input` y hereda todo — no vuelve a inventar bordes.
 */
import { forwardRef } from 'react'
import { color, font, weight } from '@/components/ui/tokens'

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
    <label
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        flex: width ? `0 1 ${typeof width === 'number' ? width + 'px' : width}` : undefined,
        minWidth: 0,
        ...style,
      }}
    >
      {label && (
        <span style={{ fontSize: font.xs, color: color.mut, fontWeight: weight.medium }}>
          {label}
          {required && <span style={{ color: color.danger }}> *</span>}
        </span>
      )}
      {children}
      {error ? (
        <span style={{ fontSize: font.xs, color: color.danger }}>{error}</span>
      ) : hint ? (
        <span style={{ fontSize: font.xs, color: color.mut2 }}>{hint}</span>
      ) : null}
    </label>
  )
}

const cls = (...xs: (string | false | undefined)[]) => xs.filter(Boolean).join(' ')

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ invalid, className, ...rest }, ref) {
  return <input ref={ref} className={cls('mo-input', invalid && 'mo-input--invalid', className)} {...rest} />
})

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean; children: React.ReactNode }

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ invalid, className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cls('mo-select', invalid && 'mo-select--invalid', className)} style={{ cursor: 'pointer' }} {...rest}>
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

/** Input numérico con prefijo (ej. "$" o "×"). Clampa a [min,max]. Sin flechitas: acá se tipea. */
export function NumberField({ value, onChange, min, max, step, prefix, width = 96, invalid, disabled, style }: NumberFieldProps) {
  const clamp = (n: number) => {
    let v = n
    if (min != null) v = Math.max(v, min)
    if (max != null) v = Math.min(v, max)
    return v
  }
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', width, ...style }}>
      {prefix != null && (
        <span style={{ position: 'absolute', left: 10, fontSize: font.sm, color: color.mut2, pointerEvents: 'none' }}>{prefix}</span>
      )}
      <input
        type="number"
        className={cls('mo-input', 'mo-input--num', invalid && 'mo-input--invalid')}
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => onChange(clamp(Number(e.target.value) || 0))}
        style={prefix != null ? { paddingLeft: 24 } : undefined}
      />
    </span>
  )
}
