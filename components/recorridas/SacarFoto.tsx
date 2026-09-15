'use client'

/**
 * Los dos botones de foto de la calle: **«Sacar foto»** abre la cámara y **«De la galería»** el
 * selector.
 *
 * 🔴 **El input se abre con `ref.click()`, ⛔ no envuelto en un `<label>`.** Así estaba hasta el
 * 15-sep-2026 y el botón no abría nada: lo que se toca es un `<button>`, y tocar un botón adentro de
 * un label ⛔ no le llega al input.
 *
 * 🔑 **Dos inputs y no uno**: `capture="environment"` es una orden de abrir la cámara y saltear el
 * selector, y en Android deja sin galería (la lección de `ReclamoPublico.tsx`, 27-ago-2026).
 *
 * 🔴 **La foto se achica ANTES de subir.** La del celular pesa 4-8 MB y el body de `blob-upload`
 * corta en 1,5 MB: cruda, cada foto era un 413.
 */
import { useRef, useState } from 'react'
import { Button } from '@/components/ui'
import { achicarADataUrl, subirBlob } from '@/lib/imagenes'

export function SacarFoto({
  onFoto,
  onError,
  etiqueta = 'Sacar foto',
}: {
  onFoto: (url: string) => void
  onError: (msg: string) => void
  etiqueta?: string
}) {
  const camara = useRef<HTMLInputElement>(null)
  const galeria = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)

  async function subir(input: HTMLInputElement) {
    const archivo = input.files?.[0]
    // Se limpia ya: sin esto, elegir dos veces la misma foto ⛔ dispara el onChange.
    input.value = ''
    if (!archivo) return
    setSubiendo(true)
    try {
      const dataUrl = await achicarADataUrl(archivo)
      onFoto(await subirBlob(dataUrl, 'prm'))
    } catch (e) {
      onError(e instanceof Error ? `No se pudo subir la foto: ${e.message}` : 'No se pudo subir la foto.')
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Button variant="outline" disabled={subiendo} onClick={() => camara.current?.click()}>
        {subiendo ? 'Subiendo…' : `📷 ${etiqueta}`}
      </Button>
      <Button variant="ghost" disabled={subiendo} onClick={() => galeria.current?.click()}>
        De la galería
      </Button>
      <input
        ref={camara}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => void subir(e.currentTarget)}
      />
      <input
        ref={galeria}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => void subir(e.currentTarget)}
      />
    </div>
  )
}
