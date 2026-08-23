'use client'

/**
 * «Imagen» — el botón del editor de manuales que sube una captura y la deja escrita en el texto.
 *
 * # Por qué el camino del body y no el de cliente
 *
 * `api/blob-upload.js` tiene dos: el del body —una data URL chica que sube la función— y el de
 * cliente, que **firma un permiso de subida** y por eso tiene su propia tabla de carpetas, topes y
 * una rama sin sesión (la creadora de un canje). Una captura de pantalla achicada entra de sobra en
 * el primero, así que el segundo no se toca: ver `docs/secciones/ingresos.md`.
 *
 * # Lo que hay que saber antes de subir una captura
 *
 * 🔴 **La URL del Blob es pública**: quien la tenga ve el archivo, sin sesión del monitor. Una
 * captura de una pantalla de producción lleva **nombre, dirección y teléfono de clientas reales**,
 * así que lo que se sube es la parte que se está explicando, no la pantalla entera. Está dicho en el
 * cartel del editor, que es donde se lee antes de elegir el archivo.
 *
 * ⚠️ **Borrar el renglón del texto NO borra el archivo del Blob.** Queda huérfano, y es la decisión
 * correcta: la alternativa es que sacar una foto de un manual la borre de otro que la use.
 */

import { useRef, useState } from 'react'
import { achicarADataUrl, subirBlob } from '@/lib/imagenes'
import { Button, useToast } from '@/components/ui'

export function BotonImagen({ onSubida }: { onSubida: (url: string) => void }) {
  const toast = useToast()
  const campo = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)

  const elegir = async (file: File | undefined) => {
    if (!file) return
    setSubiendo(true)
    try {
      onSubida(await subirBlob(await achicarADataUrl(file), 'manuales'))
    } catch (e) {
      // El mensaje del servidor viaja adentro (`imagen demasiado grande`, `Blob no configurado`) y
      // es lo que dice qué hacer. Un «no se pudo» pelado dejaría a la persona probando de nuevo con
      // el mismo archivo.
      toast.error(e instanceof Error ? e.message : 'No se pudo subir la imagen.')
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <>
      {/* El input va escondido y no `display:none`: un input oculto así sigue siendo clickeable por
          código, y el botón de al lado es el que se ve. */}
      <input
        ref={campo}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          // Se limpia el valor SIEMPRE: sin esto, elegir dos veces el mismo archivo no dispara el
          // `change` la segunda vez y el botón parece muerto.
          e.target.value = ''
          void elegir(file)
        }}
      />
      <Button variant="ghost" size="sm" type="button" loading={subiendo} disabled={subiendo} title="Subir una imagen y meterla acá" onClick={() => campo.current?.click()}>
        {subiendo ? 'Subiendo…' : '🖼 Imagen'}
      </Button>
    </>
  )
}
