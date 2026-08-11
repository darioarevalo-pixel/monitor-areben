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
 *
 * # Los dos orígenes, una sola cañería
 *
 * Un archivo arrastrado ya es un `File`; uno de Drive hay que **bajarlo primero** (ver
 * `lib/drive/picker.ts`). Esa es toda la diferencia: `agregarDeDrive` le pone a la fila un paso más
 * adelante —«bajando», con su porcentaje— y después entra por el **mismo** `subir()`. Nada de la
 * subida sabe de dónde salió el archivo.
 */

import { useCallback, useState } from 'react'
import { upload } from '@vercel/blob/client'
import { sobreDeAuth } from '@/lib/api-fetch'
import { bajarDeDrive } from '@/lib/drive/picker'
import type { DocDrive } from '@/lib/drive/archivos'
import { nombreDeDrive } from '@/lib/drive/archivos'
import { claseDePieza, mimeDePieza, TOPE_PIEZAS, type ClasePieza } from '@/lib/meta-ads/pieza'

export type PiezaEnCurso = {
  /** Identifica la fila en la lista. No es el nombre: dos archivos pueden llamarse igual. */
  key: string
  nombre: string
  clase: ClasePieza | null
  tamanio: number
  estado: 'esperando' | 'bajando' | 'subiendo' | 'lista' | 'fallada'
  /** 0-100 mientras baja de Drive. `null` cuando el tamaño no se sabe o no corresponde. */
  avance: number | null
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
  /** Lo que devolvió el Picker. Baja los bytes y sigue por la misma subida. */
  agregarDeDrive: (docs: DocDrive[], token: string) => void
  sacar: (key: string) => void
  limpiar: () => void
}

/** Una fila nueva, del origen que sea. `nombre` ya viene resuelto (Drive puede no traer extensión). */
function filaNueva(nombre: string, tamanio: number, i: number): PiezaEnCurso {
  return {
    // Dos archivos pueden llamarse igual y dos tandas pueden empezar el mismo milisegundo.
    key: `${Date.now()}-${i}-${nombre}`,
    nombre,
    clase: claseDePieza(nombre),
    tamanio,
    estado: 'esperando',
    avance: null,
    url: null,
    motivo: null,
  }
}

export function useSubirPiezas(): SubidaPiezas {
  const [piezas, setPiezas] = useState<PiezaEnCurso[]>([])

  const marcar = useCallback((key: string, campos: Partial<PiezaEnCurso>) => {
    setPiezas((ps) => ps.map((p) => (p.key === key ? { ...p, ...campos } : p)))
  }, [])

  /**
   * El único camino a la nube. Lo comparten el archivo arrastrado y el bajado de Drive.
   *
   * ⚠️ Vive fuera del updater de `setPiezas` **a propósito**: React vuelve a correr los updaters en
   * desarrollo, y una subida disparada ahí adentro salía dos veces por archivo.
   */
  const subir = useCallback(async (file: File, p: PiezaEnCurso) => {
    if (!p.clase) {
      marcar(p.key, { estado: 'fallada', motivo: 'No reconozco esa extensión: se aceptan videos (mp4, mov…) e imágenes (jpg, png…).' })
      return
    }
    marcar(p.key, { estado: 'subiendo', avance: null })
    try {
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
        contentType: mimeDePieza(p.nombre) || undefined,
        // ⚠️ Sin esto, un archivo grande sube en un solo PUT y una red que se corta a los 300 MB
        // vuelve a empezar de cero. Con multipart, el SDK lo parte y reintenta sólo el pedazo.
        multipart: file.size > 8 * 1024 * 1024,
      })
      marcar(p.key, { estado: 'lista', url: blob.url, motivo: null })
    } catch (e) {
      marcar(p.key, { estado: 'fallada', motivo: (e as Error)?.message || 'No se pudo subir.' })
    }
  }, [marcar])

  const agregar = useCallback((files: FileList | File[]) => {
    const lista = Array.from(files)
    const nuevas = lista.map((f, i) => filaNueva(f.name, f.size, i))
    setPiezas((antes) => [...antes, ...nuevas])
    // La subida arranca sola: una fila que dice «esperando» y no hace nada obliga a un botón más
    // para algo que nadie va a querer distinto.
    nuevas.forEach((p, i) => { void subir(lista[i], p) })
  }, [subir])

  /**
   * Lo elegido en Drive. **De a uno por vez, y es a propósito**: seis videos de 90 MB bajando en
   * paralelo son medio giga en la memoria del browser. Cada uno igual falla por su cuenta — que se
   * caiga el cuarto deja los otros cinco arriba y listos para armar el plan.
   */
  const agregarDeDrive = useCallback((docs: DocDrive[], token: string) => {
    // El nombre se resuelve ANTES de crear la fila: un archivo de Drive puede no traer extensión y
    // la fila tiene que nacer diciendo «Reel agosto.mp4», que es como se va a llamar el conjunto.
    const resueltos = docs.map((d, i) => ({ doc: d, nom: nombreDeDrive(d.name, d.mimeType), i }))
    const nuevas = resueltos.map((r) =>
      filaNueva(r.nom.ok ? r.nom.nombre : r.doc.name, Number(r.doc.sizeBytes || 0), r.i))
    setPiezas((antes) => [...antes, ...nuevas])

    void (async () => {
      for (let i = 0; i < resueltos.length; i++) {
        const { doc, nom } = resueltos[i]
        const p = nuevas[i]
        if (!nom.ok) { marcar(p.key, { estado: 'fallada', motivo: nom.motivo }); continue }
        marcar(p.key, { estado: 'bajando', avance: null })
        const r = await bajarDeDrive(doc, token, (pct) => marcar(p.key, { avance: pct }))
        if (!r.ok) { marcar(p.key, { estado: 'fallada', avance: null, motivo: r.motivo }); continue }
        // El tamaño de verdad recién se sabe con los bytes en la mano: Drive no siempre lo manda.
        marcar(p.key, { tamanio: r.file.size })
        await subir(r.file, { ...p, tamanio: r.file.size })
      }
    })()
  }, [marcar, subir])

  const sacar = useCallback((key: string) => setPiezas((ps) => ps.filter((p) => p.key !== key)), [])
  const limpiar = useCallback(() => setPiezas([]), [])

  const listas = piezas
    .filter((p) => p.estado === 'lista' && p.url)
    .map((p) => ({ nombre: p.nombre, url: p.url as string }))

  return {
    piezas,
    listas,
    // «Bajando» cuenta como en curso: armar el plan con una pieza a mitad de camino la dejaría afuera.
    subiendo: piezas.some((p) => p.estado === 'subiendo' || p.estado === 'bajando'),
    demasiadas: piezas.length > TOPE_PIEZAS,
    agregar,
    agregarDeDrive,
    sacar,
    limpiar,
  }
}
