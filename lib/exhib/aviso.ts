/**
 * **Qué se oye en cada escaneo**: el pitido y la palabra que le toca a cada final del recorrido.
 *
 * 🔑 **Está separado de lo que suena** (`lib/sonido.ts`) porque son dos cosas distintas: cómo suena
 * un aviso es del aparato, y **cuál aviso le toca a cada caso es la regla del recorrido** — y ésa
 * hay que poder ejercerla en un test, sin parlante. Los dos modos la comparten: el mismo escaneo
 * ⛔ no puede sonar distinto según por qué pantalla se entró.
 *
 * 🔴 **La regla de fondo: lo que EXIGE mirar tiene que sonar distinto de lo que anduvo.** Todo esto
 * existe para caminar sin mirar el teléfono; si «anduvo» y «elegí cuál es» suenan parecido, la
 * persona sigue caminando y **deja atrás la prenda sin resolver**, que es peor que no tener sonido.
 * Por eso el único caso que pide la vista —los candidatos— se lleva el tono que sube, que ⛔ no se
 * parece a ningún otro.
 */

import type { Aviso } from '../sonido'

/** Lo poco que mira la regla: el final del escaneo y, si contó, cuántas van. */
export type FinDeEscaneo = { tipo: string; veces?: number }

export type AvisoEscaneo = { aviso: Aviso; voz: string }

/**
 * Los números cantados, ⛔ no leídos.
 *
 * 🔑 La voz del navegador lee «2» distinto según la voz instalada —y en inglés si la de español ⛔
 * no está—; la palabra suena igual siempre. Arriba de diez ⛔ no vale la pena: el perchero más
 * cargado del Local tenía **9**.
 */
const NUMEROS = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez']

export function enPalabras(n: number): string {
  const i = Math.trunc(n)
  return NUMEROS[i] ?? String(i)
}

/**
 * 🔑 **Las palabras son de una o dos sílabas, y eso es a propósito.** El lector dispara cada segundo
 * y medio (medido: el intervalo humano más corto fue 997 ms) y la voz siempre se corta con el
 * escaneo siguiente: una frase ⛔ no llega a terminar, así que lo que se oye tiene que estar al
 * principio. «No figura», ⛔ no «ese código no está en la lista del local».
 */
export function avisoDe(fin: FinDeEscaneo): AvisoEscaneo {
  switch (fin.tipo) {
    // Lo normal, y es el que más se repite: pitido corto y el número, que es todo lo que hace falta
    // saber sin mirar.
    case 'ok':
      return { aviso: 'ok', voz: enPalabras(fin.veces ?? 1) }
    case 'sumado':
      return { aviso: 'suma', voz: enPalabras(fin.veces ?? 2) }
    // ⚠️ El rebote del aparato ⛔ no contó nada, y callarlo se leería como «no anduvo»: suena
    // distinto y lo dice, así quien pasó dos prendas de verdad la vuelve a pasar.
    case 'doble-lectura':
      return { aviso: 'ojo', voz: 'repetido' }
    // Está colgada y el sistema la tiene en cero: se guarda igual, pero no es un escaneo normal.
    case 'stock-cero':
      return { aviso: 'ojo', voz: 'en cero' }
    case 'no-cruzo':
    case 'no-encontrado':
      return { aviso: 'no', voz: 'no figura' }
    // 🔴 Los dos que PIDEN LA VISTA, y por eso comparten el tono que sube.
    case 'candidatos':
      return { aviso: 'mira', voz: 'elegí cuál' }
    case 'cruce':
      return { aviso: 'mira', voz: 'otra categoría' }
    // El recorrido se cerró en otro lado: no hay dónde guardar y hay que volver a empezar.
    case 'sin-recorrido':
      return { aviso: 'no', voz: 'sin recorrido' }
    default:
      return { aviso: 'ok', voz: '' }
  }
}
