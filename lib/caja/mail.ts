/**
 * El mail del ticket (Caja): cuándo sirve y los atajos de dominio (Bruno, 13-oct).
 */

/** Los dominios con botón: casi todas las clientas usan uno de estos dos. */
export const DOMINIOS_MAIL = ['gmail.com', 'hotmail.com'] as const

/** Vacío vale (el mail es opcional); escrito, tiene que ser un mail. */
export function mailOk(texto: string): boolean {
  const t = texto.trim()
  return !t || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)
}

/**
 * Le pone `@dominio` a lo escrito: lo de antes de la arroba queda y lo de después se reemplaza
 * («maria@gm» + gmail.com ⇒ «maria@gmail.com»). Sin nada escrito antes de la arroba, ⛔ cambia.
 */
export function completarMail(texto: string, dominio: string): string {
  const usuario = texto.trim().split('@')[0].replace(/\s+/g, '')
  return usuario ? `${usuario}@${dominio}` : texto
}
