/**
 * Qué llega de Google Drive y con qué nombre entra a la cañería de piezas. **Es puro**: acá no se
 * habla ni con Google ni con el browser — eso vive en `lib/drive/picker.ts`.
 *
 * # Por qué hace falta traducir el nombre
 *
 * Toda la cañería de piezas decide por la **extensión** (`claseDePieza`, el `contentType` que se le
 * manda al Blob, la lista que el servidor deja pasar). Drive no garantiza que el nombre tenga una:
 * un archivo puede llamarse «Reel agosto final» a secas y ser un `video/mp4` perfecto. Si eso
 * entrara tal cual, la fila diría *«No reconozco esa extensión»* sobre un video que está bien, y
 * quien lo lea va a ir a mirar el archivo en vez de mirar el nombre.
 *
 * Lo que Drive **sí** da siempre es el `mimeType`, así que acá se usa **sólo para completar lo que
 * falta**: si el nombre ya trae una extensión conocida, esa manda. La extensión la puso quien
 * exportó el video y sabe más que el tipo que adivinó Drive.
 */

import { extensionDe, CLASE_POR_EXTENSION, MIME_POR_EXTENSION } from '@/lib/meta-ads/pieza'

/** Lo que devuelve el Picker por cada archivo elegido. */
export interface DocDrive {
  id: string
  name: string
  mimeType: string
  /** Drive lo manda como string. No siempre viene. */
  sizeBytes?: number | string
}

/**
 * La extensión que le corresponde a cada MIME. Se **invierte** la tabla única de `pieza.core.js`,
 * no se escribe otra: un formato nuevo entra allá y acá aparece solo.
 *
 * ⚠️ Gana la **primera** extensión de cada MIME, no la última: `image/jpeg` sale de `jpg` y de
 * `jpeg`, y el archivo se quiere llamar `.jpg`.
 */
export const EXT_POR_MIME: Record<string, string> = Object.entries(MIME_POR_EXTENSION).reduce(
  (acc, [ext, mime]) => (mime in acc ? acc : { ...acc, [mime]: ext }),
  {} as Record<string, string>,
)

/** Los archivos nativos de Google (Documentos, Hojas, Presentaciones, accesos directos, carpetas). */
const PREFIJO_NATIVO = 'application/vnd.google-apps'

export type NombreDeDrive =
  | { ok: true; nombre: string }
  | { ok: false; motivo: string }

/**
 * El nombre con el que un archivo de Drive entra a la cañería, o el motivo por el que no entra.
 *
 * 🔑 **El motivo nombra el archivo y dice qué es lo que tiene de malo.** Un «no se puede» sin el
 * tipo manda a revisar el archivo equivocado cuando se eligieron seis de una.
 */
export function nombreDeDrive(nombre: string, mimeType: string): NombreDeDrive {
  const limpio = String(nombre || '').trim()
  const mime = String(mimeType || '').trim().toLowerCase()
  if (!limpio) return { ok: false, motivo: 'Ese archivo de Drive no tiene nombre.' }

  // Un Documento o una Presentación no tienen bytes que bajar: `alt=media` los rechaza y habría que
  // exportarlos. Tampoco son una pieza, así que se cortan acá con el motivo escrito.
  if (mime.startsWith(PREFIJO_NATIVO)) {
    return {
      ok: false,
      motivo: `«${limpio}» es un archivo propio de Google, no un video ni una foto. Subí el archivo exportado.`,
    }
  }

  // La extensión que ya trae el nombre manda: la puso quien exportó el archivo.
  if (CLASE_POR_EXTENSION[extensionDe(limpio)]) return { ok: true, nombre: limpio }

  const ext = EXT_POR_MIME[mime]
  if (ext) return { ok: true, nombre: `${limpio}.${ext}` }

  return {
    ok: false,
    motivo: `«${limpio}» no es un formato que Meta acepte (${mime || 'tipo desconocido'}). Van ${Object.keys(CLASE_POR_EXTENSION).join(', ')}.`,
  }
}

/** El tamaño que informó Drive, en bytes. `0` cuando no lo mandó (no todos los archivos lo traen). */
export function tamanioDeDrive(doc: Pick<DocDrive, 'sizeBytes'>): number {
  const n = Number(doc?.sizeBytes ?? 0)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * El id de una carpeta de Drive a partir del link que se pega en Ajustes.
 *
 * Google reparte el mismo link en tres formas —la de la barra de direcciones, la de «Compartir» y
 * la vieja de `?id=`— y todas llegan pegadas de un WhatsApp. Se aceptan las tres, y también el id
 * pelado: alguien va a pegar sólo eso alguna vez.
 *
 * ⛔ **No acepta el link de un ARCHIVO** (`/file/d/<id>`): subir adentro de un archivo no existe, y
 * Drive contestaría un error que no se parece en nada al problema real.
 */
export function idDeCarpetaDrive(url: string | null | undefined): string | null {
  const t = String(url || '').trim()
  if (!t) return null
  // El id pelado: 25 caracteres o más del alfabeto de Drive, sin nada alrededor.
  if (/^[A-Za-z0-9_-]{25,}$/.test(t)) return t
  const enCamino = t.match(/\/folders\/([A-Za-z0-9_-]{10,})/)
  if (enCamino) return enCamino[1]
  const enQuery = t.match(/[?&]id=([A-Za-z0-9_-]{10,})/)
  if (enQuery && /drive\.google\.com/.test(t)) return enQuery[1]
  return null
}
