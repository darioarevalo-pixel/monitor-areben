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
export function imgAThumb(file: File | null | undefined, cb: (url: string) => void, max = 256): void {
  if (!file) return
  const reader = new FileReader()
  reader.onload = (e) => {
    const src = e.target?.result
    if (typeof src !== 'string') return
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
    img.onerror = () => alert('No se pudo leer la imagen.')
    img.src = src
  }
  reader.readAsDataURL(file)
}

/** Carpeta lógica del Blob según la sección que sube. */
export type PrefijoBlob = 'fundas' | 'ingresos'

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
  )
}
