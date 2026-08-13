'use client'

/**
 * CopyButton — copia un texto al portapapeles con feedback, fallback y (opcional) Web Share en mobile.
 * Consolida el patrón repetido en components/sesionfotos/SesionFotos.tsx.
 */
import { useCallback, useRef, useState } from 'react'
import { Button, type ButtonProps } from '@/components/ui/Button'

export type CopyButtonProps = {
  /**
   * El texto a copiar. Puede ser asincrónico: hay mensajes que necesitan pedirle algo al servidor
   * antes de armarse (el link del cliente de un reclamo, que no viaja en el listado).
   */
  getText: () => string | Promise<string>
  label?: string
  copiedLabel?: string
  /** Si true y existe navigator.share (mobile) → hoja de compartir; si no, cae a clipboard. */
  share?: boolean
  /** Qué hacer si `getText` falla. Sin esto el error se traga y el botón no copia nada, en silencio. */
  onError?: (e: Error) => void
  // Se omite el `onError` nativo del <button> (evento de carga de recursos): acá significa
  // "no se pudo armar el texto", que es lo único que le importa a quien usa este botón.
} & Omit<ButtonProps, 'onClick' | 'children' | 'onError'>

export function CopyButton({ getText, label = 'Copiar', copiedLabel = '✓ Copiado', share, onError, variant = 'soft', tone = 'success', size = 'sm', iconLeft = '📋', ...rest }: CopyButtonProps) {
  const [done, setDone] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flash = useCallback(() => {
    setDone(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setDone(false), 1200)
  }, [])

  const onClick = useCallback(async () => {
    let text: string
    setOcupado(true)
    try {
      text = await getText()
    } catch (e) {
      onError?.(e as Error)
      return
    } finally {
      setOcupado(false)
    }
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
  }, [getText, share, flash, onError])

  return (
    <Button variant={variant} tone={done ? 'success' : tone} size={size} iconLeft={done ? '✓' : iconLeft} onClick={() => void onClick()} {...rest} disabled={ocupado || rest.disabled}>
      {done ? copiedLabel : label}
    </Button>
  )
}
