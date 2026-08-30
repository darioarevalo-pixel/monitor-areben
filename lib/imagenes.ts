import { apiFetch } from './api-fetch'

/**
 * Achica una imagen a miniatura y devuelve un data URL. Port de `_imgAThumb`
 * (index.html:3465). Reimplementación aislada: no toca el legacy.
 *
 * Cliente-only (usa FileReader, Image, canvas). Produce un data URL base64
 * (JPEG 0.72, lado máximo 256px). Antes se persistía ese base64 inline; hoy
 * `imgAThumbYSubir` lo sube a Vercel Blob y persiste la URL. `imgAThumb` sigue
 * siendo el paso de reducción y el fallback cuando el Blob no está disponible.
 */
export function imgAThumb(file: File | null | undefined, cb: (url: string) => void, max = 256, onError?: (msg: string) => void): void {
  if (!file) return
  const reader = new FileReader()
  /**
   * 🔴 **Sin esto, un archivo que no se puede leer no falla: CUELGA la pantalla.** El que llama
   * prende su contador antes (`setSubiendo(n => n + 1)`) y lo apaga en el `cb` o en el `onError`;
   * si el FileReader muere y no avisa, no pasa ninguna de las dos cosas y el botón queda en
   * «Subiendo 1…» para siempre, sin cartel y sin forma de reintentar.
   *
   * Se volvió alcanzable el 27-ago-2026, cuando el portal del cliente dejó de forzar la cámara: de
   * la galería sale cualquier cosa —un HEIC, un archivo en la nube que no bajó, uno sin permiso—,
   * y ahí es una persona de afuera la que se queda mirando el botón.
   */
  reader.onerror = () => onError?.('No se pudo leer la imagen.')
  reader.onload = (e) => {
    const src = e.target?.result
    // Mismo motivo que el `onerror`: salir en silencio deja el contador prendido.
    if (typeof src !== 'string') { onError?.('No se pudo leer la imagen.'); return }
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * k))
      const h = Math.max(1, Math.round(img.height * k))
      const cv = document.createElement('canvas')
      cv.width = w
      cv.height = h
      cv.getContext('2d')?.drawImage(img, 0, 0, w, h)
      let url: string
      try {
        url = cv.toDataURL('image/jpeg', 0.72)
      } catch {
        url = src
      }
      cb(url)
    }
    // Está en `lib/`, así que no puede usar el hook del toast: el aviso vuelve al
    // llamador, que sí es un componente.
    img.onerror = () => onError?.('No se pudo leer la imagen.')
    img.src = src
  }
  reader.readAsDataURL(file)
}

/**
 * Carpeta lógica del Blob según la sección que sube.
 *
 * ⚠️ Es espejo del `PREFIJOS` de `api/blob-upload.js`: lo que no está allá **se guarda igual, pero
 * en `fundas/`**, porque el handler cae al default en vez de rechazar. Un prefijo nuevo son las dos
 * líneas o ninguna.
 */
export type PrefijoBlob = 'fundas' | 'ingresos' | 'disenos' | 'manuales' | 'prm'

/**
 * Sube un data URL (thumb base64) a Vercel Blob vía `/api/blob-upload` y devuelve
 * la URL pública. Usa `apiFetch` para mandar el header `x-monitor-auth` (el
 * endpoint exige usuario logueado). Lanza si el server no confirma `ok` con una
 * `url` string — el llamador decide si cae a base64.
 */
export async function subirBlob(dataUrl: string, prefix: PrefijoBlob): Promise<string> {
  const r = await apiFetch('/api/blob-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl, prefix }),
  })
  let d: { ok?: boolean; url?: unknown; error?: unknown } | null = null
  try {
    d = await r.json()
  } catch {
    throw new Error(`respuesta no-JSON (HTTP ${r.status})`)
  }
  if (!r.ok || !d?.ok || typeof d.url !== 'string') {
    throw new Error(`HTTP ${r.status}: ${String(d?.error ?? '').slice(0, 120)}`)
  }
  return d.url
}

export type CallbacksSubida = {
  /** Preview instantáneo con el base64 local, antes de que termine la subida (opcional). */
  onPreview?: (dataUrl: string) => void
  /** La subida funcionó: persistir esta URL de Blob. */
  onUrl: (url: string) => void
  /** La subida falló: persistir el base64 como antes (degradación segura). */
  onFallback: (dataUrl: string) => void
  /** No se pudo ni leer el archivo (no llegó a subirse nada). */
  onError?: (msg: string) => void
}

/**
 * Reduce la imagen a thumb (via `imgAThumb`) y la sube a Blob. Flujo:
 *   1) `onPreview(base64)` — se ve al instante mientras sube.
 *   2) éxito → `onUrl(url)` (se persiste la URL corta, no el base64).
 *   3) error → `onFallback(base64)` + warning (sigue andando sin Blob).
 *
 * Los componentes deciden qué guardar en cada callback. Reusado por Fundas e
 * Ingresos para no duplicar la lógica de subir-y-cambiar.
 */
export function imgAThumbYSubir(
  file: File | null | undefined,
  cbs: CallbacksSubida,
  prefix: PrefijoBlob,
  max = 256,
): void {
  imgAThumb(
    file,
    (base64) => {
      cbs.onPreview?.(base64)
      subirBlob(base64, prefix)
        .then((url) => cbs.onUrl(url))
        .catch((e) => {
          console.warn('[blob] subida falló, se guarda base64:', e instanceof Error ? e.message : e)
          cbs.onFallback(base64)
        })
    },
    max,
    cbs.onError,
  )
}

/**
 * Achica una imagen y devuelve un **archivo** (no un data URL), listo para `upload()` de
 * `@vercel/blob/client`.
 *
 * # Por qué existe teniendo `imgAThumb` al lado
 *
 * `imgAThumb` produce base64 porque su destino es una función de Vercel, que recibe el archivo
 * adentro del body. Eso trae dos límites que en una galería de fotos de producto se sienten: el body
 * topea en ~4,5 MB (y `_blob.js` corta antes, en 1,5 MB) y, cuando la subida falla, el que llama
 * guarda **el base64 en el KV compartido** — una foto grande ahí adentro la paga toda la sección en
 * cada lectura.
 *
 * Por el camino de cliente los bytes van del browser al Blob directo, así que no hace falta base64
 * en ningún momento. Lo que sí hace falta es achicar igual: la foto que sale de un celular pesa 4-8
 * MB y en la galería se ve a 84 px, o a pantalla completa cuando se amplía. **1.500 px de lado
 * máximo es lo que hace que ampliar sirva** —antes se subían a 520 y la lupa mostraba una miniatura
 * estirada— sin que la grilla tenga que bajar megas por foto.
 *
 * ⚠️ **El fondo se pinta blanco antes de dibujar.** Un PNG con transparencia sobre un canvas vacío
 * sale con el fondo NEGRO al pasar a JPEG, y las fotos de producto con fondo recortado son
 * exactamente el caso donde eso pasa.
 */
export function achicarAArchivo(file: File, max = 1500, calidad = 0.82): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'))
    reader.onload = (e) => {
      const src = e.target?.result
      if (typeof src !== 'string') return reject(new Error('No se pudo leer la imagen.'))
      const img = new Image()
      img.onerror = () => reject(new Error('No se pudo leer la imagen.'))
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height))
        const cv = document.createElement('canvas')
        cv.width = Math.max(1, Math.round(img.width * k))
        cv.height = Math.max(1, Math.round(img.height * k))
        const ctx = cv.getContext('2d')
        if (!ctx) return reject(new Error('No se pudo procesar la imagen.'))
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, cv.width, cv.height)
        ctx.drawImage(img, 0, 0, cv.width, cv.height)
        cv.toBlob(
          (blob) => {
            if (!blob) return reject(new Error('No se pudo procesar la imagen.'))
            const base = (file.name || 'foto').replace(/\.[^.]+$/, '')
            resolve(new File([blob], `${base}.jpg`, { type: 'image/jpeg' }))
          },
          'image/jpeg',
          calidad,
        )
      }
      img.src = src
    }
    reader.readAsDataURL(file)
  })
}

/**
 * Achica una imagen y devuelve un **data URL**, para el camino del body (`subirBlob`).
 *
 * # Por qué reusa `achicarAArchivo` en vez de `imgAThumb`
 *
 * Las dos achican, pero `imgAThumb` nació para una miniatura de 256 px: dibuja sobre un canvas sin
 * fondo, así que **un PNG con transparencia sale con el fondo NEGRO al pasar a JPEG**. La captura de
 * una pantalla del monitor es exactamente eso. `achicarAArchivo` ya pinta el fondo blanco y ya está
 * probado en la galería de Ingresos; lo único que falta es volver el archivo a base64, porque el
 * body de la función recibe texto.
 *
 * ⚠️ **El techo del body es 1,5 MB** (`api/_blob.js`), y a 1.500 px con calidad 0,82 una captura
 * pesa bastante menos. Si aun así se pasa, el servidor contesta 413 con un mensaje que se lee, y
 * eso es mejor que abrirle a los manuales el camino de cliente —que es el que firma permisos de
 * subida y hoy tiene una rama sin sesión (ver `docs/secciones/ingresos.md`)—.
 */
export async function achicarADataUrl(file: File, max = 1500, calidad = 0.82): Promise<string> {
  const chico = await achicarAArchivo(file, max, calidad)
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'))
    reader.onload = (e) => {
      const url = e.target?.result
      if (typeof url !== 'string') return reject(new Error('No se pudo leer la imagen.'))
      resolve(url)
    }
    reader.readAsDataURL(chico)
  })
}

/**
 * ¿Esta URL es un archivo de NUESTRO Blob? Es la misma pregunta que se hace el servidor antes de
 * borrar (`pathnameDeBlob`, `api/_blob.js`); acá evita el viaje de ida.
 */
export function esUrlDeBlob(url: string): boolean {
  try {
    const u = new URL(String(url || ''))
    return u.protocol === 'https:' && /\.blob\.vercel-storage\.com$/i.test(u.hostname)
  } catch {
    return false
  }
}

/**
 * Saca del Blob un archivo ya subido. `true` si se borró (o si ya no estaba).
 *
 * 🔑 **Se llama al sacar el ítem de la pantalla, no antes ni después.** Hasta acá nada borraba
 * nunca: quitar una foto de la galería la sacaba del KV y dejaba el archivo arriba para siempre.
 * Con miniaturas de 30 KB daba igual; con los videos de la proveedora, no.
 *
 * ⚠️ **No lanza y el que llama no lo espera para seguir.** Lo que la persona pidió es que el ítem
 * desaparezca de la galería, y eso ya pasó; que el archivo no se haya podido borrar es un problema
 * de espacio, no de ella. Un error acá se anota en la consola y no frena nada.
 */
export async function borrarDeBlob(url: string): Promise<boolean> {
  // Un base64 viejo, un link de YouTube o uno de Drive no son archivos nuestros: no hay nada que
  // borrar y preguntárselo al servidor sería un 400 por cada ítem que se saca.
  if (!esUrlDeBlob(url)) return false
  try {
    const r = await apiFetch('/api/blob-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'eliminar', url }),
    })
    if (!r.ok) {
      console.warn('[blob] no se pudo eliminar:', r.status)
      return false
    }
    return true
  } catch (e) {
    console.warn('[blob] no se pudo eliminar:', e instanceof Error ? e.message : e)
    return false
  }
}
