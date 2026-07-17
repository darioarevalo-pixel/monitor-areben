/**
 * Achica una imagen a miniatura y devuelve un data URL. Port de `_imgAThumb`
 * (index.html:3465). Reimplementación aislada: no toca el legacy.
 *
 * Cliente-only (usa FileReader, Image, canvas). La foto se guarda inline como
 * data URL base64 (JPEG 0.72, lado máximo 256px), igual que el legacy. Mover a
 * Blob/IndexedDB cambiaría la forma persistida y obligaría a migrar lo guardado:
 * deuda anotada para después del flip.
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
