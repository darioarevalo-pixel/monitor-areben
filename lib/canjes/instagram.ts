/**
 * El @ de Instagram: normalizarlo y linkearlo.
 *
 * Es el único campo obligatorio del padrón y su `unique` en la base, así que la normalización no es
 * cosmética: es lo que hace que `Lucia.MKP`, `@lucia.mkp` e `instagram.com/lucia.mkp` sean **una**
 * persona y no tres fichas con historiales partidos.
 *
 * ✅ Ya NO hay espejo: `normalizarInstagram` vive una sola vez, en `./instagram.core.js`, y la
 * importan igual el navegador (por acá) y `api/_canjes.js`. Antes era una copia a mano vigilada
 * por un test, que es pagar interés en vez de amortizar — y acá el interés es caro, porque el
 * `unique` de la base es de la versión JS y una divergencia crea duplicados en silencio.
 */
import { normalizarInstagram as normalizarInstagramJs } from './instagram.core.js'

/**
 * La forma canónica: minúsculas, sin `@`, sin URL, sin barra final, sin query string.
 *
 * 📌 **La implementación vive en `./instagram.core.js`** desde el 13-ago-2026; acá queda el
 * re-export tipado, así que los que importan de este archivo no se enteran. El motivo está en el
 * docblock del core: era una copia a mano contra `api/_canjes.js`, y su divergencia crea fichas
 * duplicadas en el padrón sin que falle nada.
 */
export const normalizarInstagram: (v: string | null | undefined) => string = normalizarInstagramJs

/**
 * El link al perfil. Port de `leadInstaHref` (`lib/crm/leads.ts:92`): si ya viene una URL entera se
 * respeta tal cual, porque a veces lo que se guardó es un link a un perfil de otra red o con
 * parámetros que alguien puso a propósito.
 */
export function instagramHref(v: string | null | undefined): string {
  const s = String(v ?? '').trim()
  if (!s) return ''
  if (/^https?:\/\//i.test(s)) return s
  const user = normalizarInstagram(s)
  if (!user) return ''
  return 'https://instagram.com/' + user
}

/** Cómo se escribe en pantalla: siempre con `@`, respetando las mayúsculas que ella usa. */
export function instagramParaMostrar(instagram: string, raw?: string | null): string {
  const s = String(raw || instagram || '').trim()
  if (!s) return ''
  return '@' + s.replace(/^@+/, '')
}

/** El link al perfil de TikTok. Mismo criterio que el de Instagram. */
export function tiktokHref(v: string | null | undefined): string {
  const s = String(v ?? '').trim()
  if (!s) return ''
  if (/^https?:\/\//i.test(s)) return s
  return 'https://tiktok.com/@' + s.replace(/^@+/, '')
}
