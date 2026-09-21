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

/**
 * Lo poco que mira la regla: el final del escaneo y **cuántas prendas van en el recorrido**.
 *
 * 🔴 **`avance` es el número que se canta, y es el AVANCE DEL RECORRIDO ENTERO** — ⛔ no cuántas
 * unidades van de esa prenda. Lo pidió Bruno así el 20-sep-2026: *«me interesa para saber que se
 * escaneó correctamente sin necesidad de ver el celular: cuando sabés que te dijo un número
 * creciente, significa que escaneó bien»*. ⇒ **el número que sube ES la confirmación**, y por eso
 * tiene que subir SIEMPRE, también cuando la prenda ya estaba: el repetido es una unidad más que
 * pasó por el lector.
 *
 * ⚠️ Antes se cantaba «uno» en cada prenda nueva. Con 400 prendas eso son **400 veces «uno»**: la
 * palabra dejaba de significar nada, y la voz perdía la atención justo cuando tenía algo que decir.
 */
export type FinDeEscaneo = { tipo: string; veces?: number; avance?: number }

export type AvisoEscaneo = { aviso: Aviso; voz: string }

/**
 * Los números **cantados**, ⛔ no leídos.
 *
 * 🔑 La voz del navegador lee «47» según la voz instalada —y en inglés si la de español ⛔ no
 * está—; la palabra suena igual siempre.
 *
 * 🔴 **Llega hasta 999 porque el número es el AVANCE del recorrido**, y un sector entero son
 * cientos de prendas: el de Tops del Local son **400 variantes**. Arriba de eso se dicen los
 * dígitos, que es mejor que callarse.
 */
const UNIDADES = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve']
const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa']
const CENTENAS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos']

export function enPalabras(n: number): string {
  const i = Math.trunc(n)
  if (!Number.isFinite(i) || i < 0 || i > 999) return String(i)
  if (i < 30) return UNIDADES[i]
  if (i < 100) {
    const d = DECENAS[Math.floor(i / 10)]
    const u = i % 10
    return u ? `${d} y ${UNIDADES[u]}` : d
  }
  // «cien» pelado sólo cuando es exacto: «cien uno» ⛔ no existe, es «ciento uno».
  if (i === 100) return 'cien'
  const c = CENTENAS[Math.floor(i / 100)]
  const resto = i % 100
  return resto ? `${c} ${enPalabras(resto)}` : c
}

/**
 * 🔑 **Las palabras son de una o dos sílabas, y eso es a propósito.** El lector dispara cada segundo
 * y medio (medido: el intervalo humano más corto fue 997 ms) y la voz siempre se corta con el
 * escaneo siguiente: una frase ⛔ no llega a terminar, así que lo que se oye tiene que estar al
 * principio. «No figura», ⛔ no «ese código no está en la lista del local».
 */
export function avisoDe(fin: FinDeEscaneo): AvisoEscaneo {
  switch (fin.tipo) {
    // Lo normal, y es el que más se repite: pitido corto y **el número del recorrido**, que es todo
    // lo que hace falta saber sin mirar. Sin avance ⛔ no se inventa un número: mejor sólo el pitido.
    case 'ok':
      return { aviso: 'ok', voz: fin.avance ? enPalabras(fin.avance) : '' }
    // 🔑 El repetido **también suma al avance** —es otra unidad colgada— y lo que lo distingue es el
    // pitido doble, ⛔ no la palabra: así el número nunca deja de crecer.
    case 'sumado':
      return { aviso: 'suma', voz: fin.avance ? enPalabras(fin.avance) : '' }
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
