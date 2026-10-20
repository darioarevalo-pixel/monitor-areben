// 📱 El celular compartido del depósito (Darío, 20-oct-2026): Agustina y Lorena usan uno solo, porque
// los suyos andan mal. El celular queda entrado como **Agustina** —la de menos accesos: lo que decide
// qué pantallas se ven es la sesión, ⛔ no la solapa— y «Hoy» muestra una solapa por persona. Lo que
// se tilda en la solapa de Lorena queda a nombre de Lorena, y los avisos de las dos suenan ahí.
// 🔑 Sólo en ese sentido: Lorena entrada en su compu ve lo suyo como siempre, sin solapas.
import { EQUIPO } from './correo-diario.core.js'

export const CELULAR_COMPARTIDO = {
  agustinapiriz: ['Lorena Reyes'],
}

/** Las otras personas que usan el celular de quien entró, con sus datos del equipo. `[]` si no comparte. */
export function companerasDe(name) {
  const nombres = CELULAR_COMPARTIDO[String(name || '')] || []
  return nombres.map((n) => EQUIPO.find((p) => p.name === n)).filter(Boolean)
}

/** El perfil con el que `esParaMi` decide si un ítem le cae a esa persona. */
export function perfilDe(persona) {
  return { name: persona.name, funcion: persona.funcion, cuenta: persona.cuenta || undefined }
}
