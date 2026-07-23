'use client'

/**
 * CopyButton — copia un texto al portapapeles con feedback, fallback y (opcional) Web Share en mobile.
 * Consolida el patrón repetido en components/crm/BancoMensajes.tsx y components/sesionfotos/SesionFotos.tsx.
 */
import { useCallback, useRef, useState } from 'react'
import { Button, type ButtonProps } from '@/components/ui/Button'

export type CopyButtonProps = {
  getText: () => string
  label?: string
  copiedLabel?: string
  /** Si true y existe navigator.share (mobile) → hoja de compartir; si no, cae a clipboard. */
  share?: boolean
} & Omit<ButtonProps, 'onClick' | 'children'>

export function CopyButton({ getText, label = 'Copiar', copiedLabel = '✓ Copiado', share, variant = 'soft', tone = 'success', size = 'sm', iconLeft = '📋', ...rest }: CopyButtonProps) {
  const [done, setDone] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flash = useCallback(() => {
    setDone(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setDone(false), 1200)
  }, [])

  const onClick = useCallback(async () => {
    const text = getText()
    // Mobile: hoja de compartir (WhatsApp/mail). Cancelar (AbortError) no es error.
    if (share && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try { await navigator.share({ text }); return } catch (e) { if ((e as Error)?.name === 'AbortError') return }
    }
    try {
      await navigator.clipboard.writeText(text)
      flash()
    } catch {
      if (typeof window !== 'undefined') window.prompt('Copiá el detalle:', text)
    }
  }, [getText, share, flash])

  return (
    <Button variant={variant} tone={done ? 'success' : tone} size={size} iconLeft={done ? '✓' : iconLeft} onClick={() => void onClick()} {...rest}>
      {done ? copiedLabel : label}
    </Button>
  )
}
