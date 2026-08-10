'use client'

/**
 * Las piezas elegidas y su subida al Blob.
 *
 * # 🔑 Los bytes NO pasan por una función de Vercel
 *
 * `upload()` de `@vercel/blob/client` le pide a `/api/blob-upload` un permiso firmado de un minuto y
 * después manda el archivo **del browser al Blob directo**. Por eso un video de 80 MB no choca con
 * el tope de ~4,5 MB del body de una función ni con los 10 s del plan Hobby: lo único que viaja por
 * nuestra función es la petición del permiso, que pesa nada.
 *
 * De ahí sale toda la forma de este hook: **cada archivo sube por su cuenta y falla por su cuenta**.
 * Una tanda de seis donde el cuarto se cae deja los otros cinco subidos y listos para armar el plan,
 * en vez de obligar a volver a empezar.
 *
 * ⚠️ **El `contentType` se manda a mano, deducido de la extensión.** Un archivo que sale de Drive
 * suele llegar con `application/octet-stream`, que el servidor rechaza a propósito — la lista de
 * tipos permitidos de `api/blob-upload.js` es lo que impide que una sesión del Monitor sirva para
 * subir cualquier cosa al Blob. Sin esta línea, Drive no funcionaría nunca y el motivo sería
 * invisible.
 */

import { useCallback, useState } from 'react'
import { upload } from '@vercel/blob/client'
import { sobreDeAuth } from '@/lib/api-fetch'
import { claseDePieza, TOPE_PIEZAS, type ClasePieza } from '@/lib/meta-ads/pieza'

/** El tipo MIME con el que se sube cada extensión. Es lo que la función del Blob deja pasar. */
const MIME: Record<string, string> = {
  mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v', webm: 'video/webm', avi: 'video/x-msvideo',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
}

export type PiezaEnCurso = {
  /** Identifica la fila en la lista. No es el nombre: dos archivos pueden llamarse igual. */
  key: string
  nombre: string
  clase: ClasePieza | null
  tamanio: number
  estado: 'esperando' | 'subiendo' | 'lista' | 'fallada'
  /** La URL pública del Blob. Es lo que se le manda al plan; Meta la va a ir a buscar. */
  url: string | null
  motivo: string | null
}

export type SubidaPiezas = {
  piezas: PiezaEnCurso[]
  /** Las que ya están arriba, en la forma que espera el plan. */
  listas: { nombre: string; url: string }[]
  subiendo: boolean
  /** Se pasó del tope: no se sube nada hasta que saquen alguna. */
  demasiadas: boolean
  agregar: (files: FileList | File[]) => void
  sacar: (key: string) => void
  limpiar: () => void
}

export function useSubirPiezas(): SubidaPiezas {
  const [piezas, setPiezas] = useState<PiezaEnCurso[]>([])

  const marcar = useCallback((key: string, campos: Partial<PiezaEnCurso>) => {
    setPiezas((ps) => ps.map((p) => (p.key === key ? { ...p, ...campos } : p)))
  }, [])

  const agregar = useCallback((files: FileList | File[]) => {
    const lista = Array.from(files)
    setPiezas((antes) => {
      const nuevas: PiezaEnCurso[] = lista.map((f, i) => ({
        key: `${Date.now()}-${i}-${f.name}`,
        nombre: f.name,
        clase: claseDePieza(f.name),
        tamanio: f.size,
        estado: 'esperando',
        url: null,
        motivo: null,
      }))
      // La subida arranca sola: una fila que dice «esperando» y no hace nada obliga a un botón más
      // para algo que nadie va a querer distinto.
      nuevas.forEach((p, i) => { void subir(lista[i], p) })
      return [...antes, ...nuevas]
    })

    async function subir(file: File, p: PiezaEnCurso) {
      if (!p.clase) {
        marcar(p.key, { estado: 'fallada', motivo: 'No reconozco esa extensión: se aceptan videos (mp4, mov…) e imágenes (jpg, png…).' })
        return
      }
      marcar(p.key, { estado: 'subiendo' })
      try {
        const ext = p.nombre.toLowerCase().split('.').pop() || ''
        // 🔴 **La sesión hay que pasársela a mano.** `upload()` no usa `apiFetch`: hace su propia
        // llamada a `/api/blob-upload` para pedir el permiso, y ahí el header no viaja solo. Sin
        // esto el servidor contesta 403 a un usuario perfectamente logueado y el SDK lo traduce a
        // «Failed to retrieve the client token», un cartel que no menciona la sesión por ningún
        // lado. Pasó en prod el 9-ago-2026 y dejó la subida de piezas muerta entera.
        const sobre = await sobreDeAuth()
        if (!sobre) {
          marcar(p.key, { estado: 'fallada', motivo: 'No encuentro tu sesión del Monitor. Entrá de nuevo y volvé a probar.' })
          return
        }
        const blob = await upload(`piezas/${p.nombre}`, file, {
          access: 'public',
          handleUploadUrl: '/api/blob-upload',
          headers: { 'x-monitor-auth': sobre },
          contentType: MIME[ext],
          // ⚠️ Sin esto, un archivo grande sube en un solo PUT y una red que se corta a los 300 MB
          // vuelve a empezar de cero. Con multipart, el SDK lo parte y reintenta sólo el pedazo.
          multipart: file.size > 8 * 1024 * 1024,
        })
        marcar(p.key, { estado: 'lista', url: blob.url, motivo: null })
      } catch (e) {
        marcar(p.key, { estado: 'fallada', motivo: (e as Error)?.message || 'No se pudo subir.' })
      }
    }
  }, [marcar])

  const sacar = useCallback((key: string) => setPiezas((ps) => ps.filter((p) => p.key !== key)), [])
  const limpiar = useCallback(() => setPiezas([]), [])

  const listas = piezas
    .filter((p) => p.estado === 'lista' && p.url)
    .map((p) => ({ nombre: p.nombre, url: p.url as string }))

  return {
    piezas,
    listas,
    subiendo: piezas.some((p) => p.estado === 'subiendo'),
    demasiadas: piezas.length > TOPE_PIEZAS,
    agregar,
    sacar,
    limpiar,
  }
}
