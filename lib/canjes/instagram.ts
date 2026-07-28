/**
 * El @ de Instagram: normalizarlo y linkearlo.
 *
 * Es el único campo obligatorio del padrón y su `unique` en la base, así que la normalización no es
 * cosmética: es lo que hace que `Lucia.MKP`, `@lucia.mkp` e `instagram.com/lucia.mkp` sean **una**
 * persona y no tres fichas con historiales partidos.
 *
 * ⚠️ Espejo en `api/_canjes.js` (`normalizarInstagram`), porque los `api/*.js` no importan TS. Si
 * cambia la normalización acá, cambia allá — el unique de la base es de la versión JS, y una
 * divergencia crea duplicados silenciosos. `tests/canjes-core.test.ts` compara las dos.
 */

/**
 * La forma canónica: minúsculas, sin `@`, sin URL, sin barra final, sin query string.
 *
 * Devuelve `''` si no queda nada usable — el llamador decide si eso es un error (en el alta lo es:
 * el @ es obligatorio).
 */
export function normalizarInstagram(v: string | null | undefined): string {
  let s = String(v ?? '').trim()
  if (!s) return ''

  // Formato URL, con o sin protocolo, con o sin www. Se queda con el primer segmento del path:
  // `instagram.com/lucia.mkp/reel/xyz` es igual de válido como entrada y la persona es `lucia.mkp`.
  s = s.replace(/^https?:\/\//i, '').replace(/^www\./i, '')
  if (/^(instagram\.com|instagr\.am)\//i.test(s)) {
    s = s.replace(/^(instagram\.com|instagr\.am)\//i, '')
  }

  // Query y hash fuera: pegar un link desde el celular arrastra `?igsh=...`.
  s = s.split('?')[0].split('#')[0]
  // Sólo el primer segmento del path.
  s = s.split('/')[0]
  s = s.replace(/^@+/, '').trim().toLowerCase()

  // Instagram permite letras, números, punto y guion bajo. Lo que no entra, no es parte del @.
  s = s.replace(/[^a-z0-9._]/g, '')
  // Un punto al final no es parte del nombre: casi siempre es el punto de la oración pegada.
  s = s.replace(/\.+$/, '')

  return s
}

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
