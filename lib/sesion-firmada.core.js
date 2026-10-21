// La sesión firmada del Monitor: el login propio (fase Bases, paso 3, 21-oct-2026).
//
// # Para qué
//
// Hasta acá `api/_auth.js` le preguntaba a bdi-catalogo quién sos en CADA request. Si bdi-catalogo
// se caía, se caían con él la Caja, la facturación y el ERP (auditoria-2026-10-20.md, riesgo 1).
// Ahora, cuando bdi-catalogo dice que sí, el Monitor firma el perfil con un secreto propio y lo
// devuelve; el navegador lo manda de vuelta y el Monitor lo verifica SOLO, sin red.
//
// # Qué es
//
// `base64url(JSON {p, iat, exp}) + '.' + base64url(HMAC-SHA256)`. No es un JWT a propósito: un JWT
// trae `alg` en la cabecera y esa elección es la que se ataca. Acá el algoritmo no viaja.
//
// ⚠️ El perfil viaja ENTERO (permisos incluidos) y se lee sin descifrar: firmado ⛔ es secreto. Lo
// que garantiza la firma es que nadie lo pueda escribir, no que nadie lo pueda leer. Va en un
// header y no en una cookie (los permisos pasan los 4 KB de una cookie, y una cookie ⛔ viaja a
// `crear-venta`, que se llama cruzando de dominio).

import { createHmac, timingSafeEqual } from 'node:crypto'

/** Cuánto vale la firma si bdi-catalogo NO contesta: un turno largo del local. */
export const SESION_VENCE_MS = 12 * 60 * 60 * 1000

/**
 * Hasta cuándo se cree sin preguntar. Pasado esto, `api/_auth.js` vuelve a preguntarle a
 * bdi-catalogo: así una baja, un cambio de clave o de permisos se nota en 10 minutos como mucho
 * (antes, en el request siguiente). Si bdi-catalogo dice «no», se corta aunque la firma siga viva.
 */
export const SESION_FRESCA_MS = 10 * 60 * 1000

const b64url = (buf) => Buffer.from(buf).toString('base64url')

function firma(cuerpo, secreto) {
  return createHmac('sha256', secreto).update(cuerpo).digest()
}

/** Firma un perfil. Sin secreto devuelve null: el Monitor sigue como antes (sin sesión propia). */
export function firmarSesion(perfil, secreto, ahora = Date.now()) {
  if (!secreto || !perfil) return null
  const cuerpo = b64url(JSON.stringify({ p: perfil, iat: ahora, exp: ahora + SESION_VENCE_MS }))
  return `${cuerpo}.${b64url(firma(cuerpo, secreto))}`
}

/**
 * Abre una sesión firmada. Devuelve `{perfil, iat, fresca}` o null si la firma no cierra, está
 * vencida o vino rota. ⛔ tira nunca: lo que llega es lo que manda el navegador.
 */
export function abrirSesion(token, secreto, ahora = Date.now()) {
  if (!secreto || typeof token !== 'string') return null
  const [cuerpo, sello, sobra] = token.split('.')
  if (!cuerpo || !sello || sobra !== undefined) return null
  const esperado = firma(cuerpo, secreto)
  const llegado = Buffer.from(sello, 'base64url')
  if (llegado.length !== esperado.length || !timingSafeEqual(llegado, esperado)) return null
  let d
  try {
    d = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (!d || !d.p || typeof d.iat !== 'number' || typeof d.exp !== 'number') return null
  // Una firma «del futuro» sólo sale de un reloj torcido o de un secreto filtrado: ⛔ se acepta.
  if (d.iat > ahora + 60 * 1000 || ahora >= d.exp) return null
  return { perfil: d.p, iat: d.iat, fresca: ahora - d.iat < SESION_FRESCA_MS }
}
