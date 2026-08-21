'use client'

/**
 * La subida del contenido que entrega la creadora, **desde su propio link y desde su celular**.
 *
 * # Por qué existe
 *
 * Hasta el 21-ago-2026 el contenido se le pedía en una carpeta de Drive. No funcionaba: por
 * permisos de Google, por no tener cuenta, o directamente por no saber usarlo. Terminaba llegando
 * por WhatsApp —comprimido— y alguien lo bajaba a mano. Acá sube desde el mismo link que ya tiene.
 *
 * # Es gemelo de `components/ingresos/useSubirGaleria.ts`, con TRES diferencias
 *
 *  1. 🔴 **Se identifica con el token del canje, no con la sesión del Monitor.** Va en
 *     `clientPayload`, que es el único canal que el SDK garantiza hasta `onBeforeGenerateToken`.
 *     (Aquél le pasa `x-monitor-auth` por `headers` porque `upload()` no usa `apiFetch` — el mismo
 *     motivo por el que acá tampoco sirve un header nuestro: no hay sesión que mandar.)
 *  2. ⛔ **El archivo NO se achica.** La galería de Ingresos baja las fotos a 1.500 px y ahí tiene
 *     razón: se ven a 84 px en una grilla. Acá el archivo **es** el entregable —puede terminar en
 *     una pauta de Meta—, así que sube el original, foto y video. Vercel Blob guarda los bytes tal
 *     cual: no recomprime ni recodifica, y la única pérdida posible sería nuestra.
 *  3. 🔑 **La carpeta llega armada del servidor** (`carpetaContenido`). El permiso se firma sobre
 *     el `pathname` que manda el browser, así que el browser tiene que decir uno — pero no lo
 *     calcula: lo repite. El que decide es `permisoDeLaCreadora` (`api/blob-upload.js`), que la
 *     deriva del canje que abrió el token y rechaza cualquier otra.
 *
 * # Cada archivo sube y falla por su cuenta
 *
 * Una tanda de seis donde el cuarto se cae deja los otros cinco arriba, en vez de obligarla a
 * volver a empezar. El que sale bien se registra **en el momento**: si cierra la pestaña a la
 * mitad, lo que ya subió está guardado.
 */

import { useCallback, useState } from 'react'
import { upload } from '@vercel/blob/client'
import { claseDeArchivo, EXTENSIONES_MEDIA, mimeDeArchivo, type ClaseMedia } from '@/lib/media'

/** Arriba de esto el SDK parte el archivo y reintenta sólo el pedazo que se cortó. */
const MULTIPART_DESDE = 8 * 1024 * 1024

/** Espejo de `PREFIJO_CANJE` en `api/blob-upload.js`. Es lo que hace que la rama pública se elija. */
const SOBRE = 'canje:'

/** Un archivo en curso. Vive mientras sube; al terminar bien, ya está en la lista de arriba. */
export type ArchivoEnCurso = {
  /** Identifica la fila. No es el nombre: dos archivos pueden llamarse igual. */
  key: string
  nombre: string
  estado: 'subiendo' | 'fallada'
  motivo: string | null
}

export type SubidaContenido = {
  enCurso: ArchivoEnCurso[]
  subiendo: boolean
  agregar: (files: FileList | File[] | null) => void
  /** Saca una fila fallada del cartel. */
  descartar: (key: string) => void
}

let contador = 0

/**
 * @param token el del link. Sin él no se firma nada.
 * @param carpeta la que mandó el servidor (`carpetaContenido`). ⛔ No se arma acá.
 * @param alSubir se llama una vez por archivo que llegó al Blob, con la URL pública y su clase.
 */
export function useSubirContenido(
  token: string | null,
  carpeta: string | null,
  alSubir: (item: { url: string; clase: ClaseMedia }) => Promise<void> | void,
): SubidaContenido {
  const [enCurso, setEnCurso] = useState<ArchivoEnCurso[]>([])

  const marcar = useCallback((key: string, campos: Partial<ArchivoEnCurso>) => {
    setEnCurso((fs) => fs.map((f) => (f.key === key ? { ...f, ...campos } : f)))
  }, [])

  const sacar = useCallback((key: string) => setEnCurso((fs) => fs.filter((f) => f.key !== key)), [])

  const subir = useCallback(
    async (file: File, fila: ArchivoEnCurso) => {
      const clase = claseDeArchivo(fila.nombre)
      if (!clase) {
        marcar(fila.key, { estado: 'fallada', motivo: `No reconozco «${fila.nombre}». Se aceptan ${EXTENSIONES_MEDIA.join(', ')}.` })
        return
      }
      if (!token || !carpeta) {
        marcar(fila.key, { estado: 'fallada', motivo: 'Volvé a abrir el link y probá de nuevo.' })
        return
      }
      try {
        const blob = await upload(`${carpeta}/${fila.nombre}`, file, {
          access: 'public',
          handleUploadUrl: '/api/blob-upload',
          clientPayload: SOBRE + token,
          // ⚠️ Deducido de la extensión y mandado a mano: un archivo que sale de un chat puede
          // llegar como `application/octet-stream`, y la lista del servidor no lo dejaría pasar.
          contentType: mimeDeArchivo(fila.nombre) || undefined,
          // Sin esto, un video grande sube en un solo PUT y una red de celular que se corta a los
          // 300 MB vuelve a empezar de cero.
          multipart: file.size > MULTIPART_DESDE,
        })
        // Registrar va DESPUÉS de subir y es lo que hace que el archivo exista para nosotros: no
        // hay `onUploadCompleted` (ver el encabezado de `api/blob-upload.js`), así que si esto falla
        // el archivo queda arriba y sin fila. La fila se marca fallada para que ella reintente.
        await alSubir({ url: blob.url, clase })
        sacar(fila.key)
      } catch (e) {
        marcar(fila.key, { estado: 'fallada', motivo: (e as Error)?.message || 'No se pudo subir.' })
      }
    },
    [alSubir, carpeta, marcar, sacar, token],
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

  return { enCurso, subiendo: enCurso.some((f) => f.estado === 'subiendo'), agregar, descartar: sacar }
}
