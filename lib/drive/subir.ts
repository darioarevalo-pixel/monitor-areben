'use client'

/**
 * **Mandar a Drive lo que la creadora dejó en el buzón**, sin que los bytes toquen una función de
 * Vercel. Es el camino inverso de `lib/drive/picker.ts`, que los trae.
 *
 * # Por qué el navegador y no el servidor
 *
 * Una service account **no tiene Drive propio**: los archivos que sube no viven en la unidad de
 * nadie y hay que compartirlos a mano. La alternativa era guardar un refresh token de una persona
 * en el Vercel de Darío, o sea una credencial larga adentro de un proyecto compartido. Acá los
 * bytes van del Blob al browser y del browser a Drive con **la cuenta de Google de quien apreta el
 * botón**, con el mismo permiso `drive.file` que ya se usa para traer piezas — sin credenciales
 * guardadas, sin funciones nuevas y sin verificación de Google.
 *
 * # 🔑 Lo que se midió el 21-ago-2026, contra el Drive real de Bruno
 *
 * Todo esto podía no poderse, y era el motivo de medir antes de escribir:
 *
 *  - **Un archivo de más de 5 MB obliga a la subida «por partes»** (Drive no acepta más que eso en
 *    una sola llamada), y esa subida devuelve la dirección de la sesión **en un encabezado**. El
 *    navegador **sí lo puede leer** desde `monitor.arebensrl.com`: probado con 6 MB, que entraron
 *    y se borraron. Sin eso no había tanda: los videos son justo lo que hay que archivar.
 *  - **Escribir adentro de una carpeta ajena funciona con sólo saber su id.** No hace falta que la
 *    persona la elija con el Picker: se pega el link en Ajustes una vez por marca y listo. Se midió
 *    contra una carpeta creada a mano en Drive, sin pasar por el selector.
 *  - **El buzón deja leer sus bytes desde el monitor** (y hasta de a pedazos), que es lo que permite
 *    mostrar el avance de la bajada en vez de un cartel quieto.
 *
 * # ⚠️ La subida se mide con `XMLHttpRequest`, no con `fetch`
 *
 * `fetch` no informa el avance de lo que **sube** —sólo de lo que baja—, y acá lo que tarda es
 * justo eso: un reel de 90 MB con una barra quieta se lee como colgado y alguien lo va a apretar
 * dos veces.
 */

import { motivoDeDrive, olvidarTokenDrive, pedirToken } from '@/lib/drive/picker'
import { leerConAvance } from '@/lib/drive/picker'

const CARPETA_MIME = 'application/vnd.google-apps.folder'
const ARCHIVOS = 'https://www.googleapis.com/drive/v3/files'
const SUBIDA = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable'

export { pedirToken as tokenDeDrive }

/** En qué anda un archivo. La bajada del buzón y la subida a Drive tardan las dos. */
export type FaseDrive = 'bajando' | 'subiendo'

export type AvanceDrive = {
  fase: FaseDrive
  /** `null` cuando no se sabe el tamaño: la pantalla dice la fase sin inventar un número. */
  pct: number | null
}

export type Fallo = { ok: false; motivo: string }

/**
 * Traduce el «no» de Drive, con lo que dijo Google pegado.
 *
 * 🔴 **401 y 403 no son lo mismo**, y es la lección que ya costó una vuelta entera del lado de la
 * bajada: sólo el 401 es un token vencido. Un 403 es la API apagada en la consola o una carpeta sin
 * permiso de edición, y mandar a «volver a dar el permiso» ahí no lo arregla nunca.
 */
async function noDeDrive(r: Response, que: string): Promise<Fallo> {
  const dijo = await motivoDeDrive(r)
  if (r.status === 401) {
    olvidarTokenDrive()
    return { ok: false, motivo: `Se venció el permiso de Google. Apretá de nuevo y volvé a dárselo.${dijo}` }
  }
  if (r.status === 404) {
    return { ok: false, motivo: `Drive no encuentra la carpeta. Revisá el link en Ajustes y que tengas permiso para editarla.${dijo}` }
  }
  return { ok: false, motivo: `Drive no dejó ${que} (${r.status}).${dijo}` }
}

/* ── La carpeta del canje ──────────────────────────────────────────────────── */

export type CarpetaLista = { ok: true; id: string }

/**
 * La subcarpeta de este canje adentro de la carpeta de la marca. La devuelve **sin crearla dos
 * veces**, en este orden:
 *
 *  1. La que ya quedó guardada en el canje, si la hay. Es la única que sirve cuando archiva una
 *     segunda persona: Google da el permiso **por archivo y por persona**, así que la carpeta que
 *     creó la sesión de uno **no la ve** la app de otro, y buscarla por nombre crearía una gemela.
 *  2. Una con el mismo nombre que haya creado esta misma persona antes (el caso de archivar en dos
 *     tandas, con un video que llegó después).
 *  3. Recién ahí, una nueva.
 */
export async function carpetaDelCanje(
  padreId: string,
  nombre: string,
  guardada: string | null | undefined,
  token: string,
): Promise<CarpetaLista | Fallo> {
  if (guardada) return { ok: true, id: guardada }

  // Las comillas simples cierran la consulta de Drive: un nombre que las tenga la rompe. El @ de
  // Instagram y el punto medio no molestan, pero el apellido de alguien sí podría.
  const q = `'${padreId}' in parents and name = '${nombre.replace(/'/g, "\\'")}' and mimeType = '${CARPETA_MIME}' and trashed = false`
  const busca = await fetch(`${ARCHIVOS}?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`, {
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => null)
  if (busca?.ok) {
    const j = (await busca.json().catch(() => null)) as { files?: { id: string }[] } | null
    const ya = j?.files?.[0]?.id
    if (ya) return { ok: true, id: ya }
  } else if (busca && busca.status === 401) {
    return noDeDrive(busca, 'buscar la carpeta')
  }

  const r = await fetch(`${ARCHIVOS}?fields=id`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nombre, mimeType: CARPETA_MIME, parents: [padreId] }),
  }).catch(() => null)
  if (!r) return { ok: false, motivo: 'Se cortó la conexión con Drive.' }
  if (!r.ok) return noDeDrive(r, 'crear la carpeta del canje')
  const j = (await r.json()) as { id: string }
  return { ok: true, id: j.id }
}

/* ── Un archivo ────────────────────────────────────────────────────────────── */

export type Archivado = { ok: true; link: string; id: string }

/**
 * Baja un archivo del buzón y lo sube a la carpeta de Drive. Devuelve el link para abrirlo, que es
 * lo que después queda guardado en la evidencia — el archivo del Blob se borra, así que ese link
 * pasa a ser **la única forma de llegar al material**.
 */
export async function mandarADrive(
  origen: string,
  nombre: string,
  carpetaId: string,
  token: string,
  onAvance?: (a: AvanceDrive) => void,
): Promise<Archivado | Fallo> {
  let bytes: Blob
  try {
    const r = await fetch(origen)
    if (!r.ok) return { ok: false, motivo: `El archivo no está en el buzón (${r.status}).` }
    const total = Number(r.headers.get('content-length')) || 0
    bytes = r.body
      ? await leerConAvance(r.body, total, (pct) => onAvance?.({ fase: 'bajando', pct }))
      : await r.blob()
  } catch {
    return { ok: false, motivo: 'Se cortó la bajada del archivo.' }
  }

  onAvance?.({ fase: 'subiendo', pct: 0 })

  const ini = await fetch(SUBIDA, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': bytes.type || 'application/octet-stream',
      'X-Upload-Content-Length': String(bytes.size),
    },
    body: JSON.stringify({ name: nombre, parents: [carpetaId] }),
  }).catch(() => null)
  if (!ini) return { ok: false, motivo: 'Se cortó la conexión con Drive.' }
  if (!ini.ok) return noDeDrive(ini, `subir «${nombre}»`)

  const sesion = ini.headers.get('location')
  // Medido: el navegador puede leerlo. Si algún día deja de poder, esto es lo que lo va a decir con
  // todas las letras en vez de fallar en el paso siguiente con un error que no se entiende.
  if (!sesion) return { ok: false, motivo: 'Google no devolvió a dónde subir el archivo. Probá de nuevo.' }

  return await subirBytes(sesion, bytes, nombre, (pct) => onAvance?.({ fase: 'subiendo', pct }))
}

/** El PUT con avance. Va en XHR porque `fetch` no informa lo que sube (ver el encabezado). */
function subirBytes(
  sesion: string,
  bytes: Blob,
  nombre: string,
  onPct: (pct: number | null) => void,
): Promise<Archivado | Fallo> {
  return new Promise((listo) => {
    const x = new XMLHttpRequest()
    x.open('PUT', sesion, true)
    x.upload.onprogress = (e) => onPct(e.lengthComputable ? Math.min(99, Math.round((e.loaded / e.total) * 100)) : null)
    x.onload = () => {
      if (x.status < 200 || x.status >= 300) {
        listo({ ok: false, motivo: `Drive no aceptó «${nombre}» (${x.status}). ${String(x.responseText || '').slice(0, 200)}` })
        return
      }
      let j: { id?: string; webViewLink?: string } = {}
      try { j = JSON.parse(x.responseText) } catch { /* la respuesta no es JSON: se resuelve abajo */ }
      if (!j.id) { listo({ ok: false, motivo: `Drive no dijo dónde quedó «${nombre}».` }); return }
      onPct(100)
      // El link de la respuesta cuando está, y si no el armado a mano: `webViewLink` sólo viene si
      // se pide en `fields`, y la dirección de la sesión ya la fijó el paso anterior.
      listo({ ok: true, id: j.id, link: j.webViewLink || `https://drive.google.com/file/d/${j.id}/view` })
    }
    x.onerror = () => listo({ ok: false, motivo: `Se cortó la subida de «${nombre}».` })
    x.send(bytes)
  })
}
