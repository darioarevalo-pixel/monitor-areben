'use client'

/**
 * La subida de archivos a la galería de una importación: fotos del proveedor y **el video que manda
 * la proveedora mostrando el producto**.
 *
 * # 🔑 Los bytes NO pasan por una función de Vercel
 *
 * Es el mismo camino que las piezas de Meta Ads (`components/meta-ads/piezas/useSubirPiezas.ts`):
 * `upload()` de `@vercel/blob/client` le pide a `/api/blob-upload` un permiso firmado de un minuto y
 * después manda el archivo **del browser al Blob directo**. Por eso un video de 80 MB no choca con
 * el tope de ~4,5 MB del body de una función ni con los 10 s del plan Hobby.
 *
 * Hasta acá la galería tenía media solución: la foto subía achicada a 520 px por el camino del body
 * y el video no subía —había que pegar un link de Drive o de YouTube—. El "+ link" sigue estando,
 * que para lo que ya vive en Drive es lo correcto; lo que cambia es que ya no es la única forma.
 *
 * # Por qué la foto igual se achica, si el tope no aplica
 *
 * Porque la que sale de un celular pesa 4-8 MB y en la grilla se ve a 84 px. Se sube a 1.500 px
 * (`achicarAArchivo`), que es lo que hace que **ampliar sirva** sin que abrir una importación con
 * veinte fotos baje cien megas. El video va tal cual: recomprimirlo en el browser sería perder
 * justamente lo que se quiere mirar.
 *
 * ⚠️ **El `contentType` se manda a mano, deducido de la extensión.** Un archivo que sale de un chat
 * puede llegar como `application/octet-stream`, y la lista de tipos permitidos del servidor es lo
 * que impide que una sesión del Monitor sirva para subir cualquier cosa al Blob.
 *
 * # Cada archivo sube y falla por su cuenta
 *
 * Una tanda de seis donde el cuarto se cae deja los otros cinco en la galería, en vez de obligar a
 * volver a empezar. El que sale bien se agrega a la galería **en el momento**, no al final: así lo
 * que se ve en pantalla es lo que ya está guardado.
 */

import { useCallback, useState } from 'react'
import { upload } from '@vercel/blob/client'
import { sobreDeAuth } from '@/lib/api-fetch'
import { achicarAArchivo } from '@/lib/imagenes'
import { claseDeArchivo, EXTENSIONES_MEDIA, mimeDeArchivo, type ClaseMedia } from '@/lib/media'

/** La carpeta del Blob de esta sección. El servidor no firma nada fuera de las que conoce. */
const CARPETA = 'ingresos'

/** Arriba de esto el SDK parte el archivo y reintenta sólo el pedazo que se cortó. */
const MULTIPART_DESDE = 8 * 1024 * 1024

/** Un archivo en curso. Vive mientras sube; al terminar bien, el ítem ya está en la galería. */
export type ArchivoEnCurso = {
  /** Identifica la fila. No es el nombre: dos archivos pueden llamarse igual. */
  key: string
  nombre: string
  clase: ClaseMedia | null
  estado: 'subiendo' | 'fallada'
  motivo: string | null
}

export type SubidaGaleria = {
  enCurso: ArchivoEnCurso[]
  subiendo: boolean
  /** Sube los archivos elegidos. Cada uno llama a `alSubir` apenas está arriba. */
  agregar: (files: FileList | File[] | null) => void
  /** Saca una fila fallada del cartel. */
  descartar: (key: string) => void
}

let contador = 0

/**
 * @param alSubir se llama una vez por archivo que llegó al Blob, con la URL pública y su clase.
 */
export function useSubirGaleria(alSubir: (item: { url: string; clase: ClaseMedia; nombre: string }) => void): SubidaGaleria {
  const [enCurso, setEnCurso] = useState<ArchivoEnCurso[]>([])

  const marcar = useCallback((key: string, campos: Partial<ArchivoEnCurso>) => {
    setEnCurso((fs) => fs.map((f) => (f.key === key ? { ...f, ...campos } : f)))
  }, [])

  const sacar = useCallback((key: string) => setEnCurso((fs) => fs.filter((f) => f.key !== key)), [])

  const subir = useCallback(
    async (file: File, fila: ArchivoEnCurso) => {
      const clase = fila.clase
      if (!clase) {
        marcar(fila.key, { estado: 'fallada', motivo: `No reconozco «${fila.nombre}». Se aceptan ${EXTENSIONES_MEDIA.join(', ')}.` })
        return
      }
      try {
        // 🔴 **La sesión hay que pasársela a mano.** `upload()` no usa `apiFetch`: hace su propia
        // llamada a `/api/blob-upload` para pedir el permiso, y ahí el header no viaja solo. Sin
        // esto el servidor contesta 403 a un usuario perfectamente logueado y el SDK lo traduce a
        // «Failed to retrieve the client token», un cartel que no menciona la sesión por ningún
        // lado. Le pasó a las piezas de Meta en prod el 9-ago-2026.
        const sobre = await sobreDeAuth()
        if (!sobre) {
          marcar(fila.key, { estado: 'fallada', motivo: 'No encuentro tu sesión del Monitor. Entrá de nuevo y volvé a probar.' })
          return
        }

        // Un GIF no pasa por el canvas: saldría convertido en una sola imagen quieta.
        const achicable = clase === 'imagen' && !/\.gif$/i.test(fila.nombre)
        // Si achicar falla (un archivo raro que el browser no dibuja), se sube el original: es peor
        // perder la foto que subirla pesada.
        const aSubir = achicable ? await achicarAArchivo(file).catch(() => file) : file
        const nombre = aSubir.name || fila.nombre

        const blob = await upload(`${CARPETA}/${nombre}`, aSubir, {
          access: 'public',
          handleUploadUrl: '/api/blob-upload',
          headers: { 'x-monitor-auth': sobre },
          contentType: mimeDeArchivo(nombre) || undefined,
          // ⚠️ Sin esto, un archivo grande sube en un solo PUT y una red que se corta a los 300 MB
          // vuelve a empezar de cero.
          multipart: aSubir.size > MULTIPART_DESDE,
        })
        alSubir({ url: blob.url, clase, nombre: fila.nombre })
        sacar(fila.key)
      } catch (e) {
        marcar(fila.key, { estado: 'fallada', motivo: (e as Error)?.message || 'No se pudo subir.' })
      }
    },
    [alSubir, marcar, sacar],
  )

  const agregar = useCallback(
    (files: FileList | File[] | null) => {
      const lista = Array.from(files || [])
      if (!lista.length) return
      const filas: ArchivoEnCurso[] = lista.map((f) => ({
        // El contador (y no sólo el nombre) porque dos archivos pueden llamarse igual, y no
        // `Date.now()` porque una tanda entera nace en el mismo milisegundo.
        key: `a${++contador}`,
        nombre: f.name || 'archivo',
        clase: claseDeArchivo(f.name || ''),
        estado: 'subiendo',
        motivo: null,
      }))
      setEnCurso((antes) => [...antes, ...filas])
      filas.forEach((fila, i) => {
        void subir(lista[i], fila)
      })
    },
    [subir],
  )

  return {
    enCurso,
    subiendo: enCurso.some((f) => f.estado === 'subiendo'),
    agregar,
    descartar: sacar,
  }
}
