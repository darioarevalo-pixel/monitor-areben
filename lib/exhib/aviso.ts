/**
 * **Qué se oye en cada escaneo**: el pitido y la palabra que le toca a cada final del recorrido.
 *
 * 🔑 **Está separado de lo que suena** (`lib/sonido.ts`) porque son dos cosas distintas: cómo suena
 * un aviso es del aparato, y **cuál aviso le toca a cada caso es la regla del recorrido** — y ésa
 * hay que poder ejercerla en un test, sin parlante. Los dos modos la comparten: el mismo escaneo
 * ⛔ no puede sonar distinto según por qué pantalla se entró.
 *
 * 🔴 **SON DOS, Y ESO ES TODO LO QUE HAY QUE OÍR** (20-sep-2026, decisión de Bruno: *«necesito que
 * esta chica sólo escanee: si detecta un producto que diga el número de escaneo, y si no, que le
 * diga que vuelva a escanear porque no lo detectó; lo repetido y demás entra en el balance»*):
 *
 * - **la detectó** → el pitido corto y **el número**, que crece. Si sube, entró.
 * - **⛔ no la detectó** → el pitido grave y **«de nuevo»**, que es la única acción posible con la
 *   prenda todavía en la mano.
 *
 * 🔑 **Todo lo demás se sacó del oído a propósito.** La prenda repetida, la que el sistema tiene en
 * cero, el código que engancha a dos: son hallazgos **del balance**, y quien decide los mira después
 * con la pantalla delante. Cantárselos a quien camina le pedía entender —y recordar— cuatro
 * palabras distintas para cosas sobre las que ⛔ no puede hacer nada en ese momento. ⚠️ Los carteles
 * de la pantalla **⛔ no se tocaron**: el que mira, ve; el que camina, oye dos cosas.
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
export type FinDeEscaneo = {
  tipo: string
  veces?: number
  avance?: number
  /**
   * Cuántas prendas enganchaba un código que ⛔ no identificó a una sola.
   *
   * 🔴 **Separa «ese código ⛔ no existe» de «pasala de nuevo», y son dos cosas distintas de hacer.**
   * Si enganchaba a varias, casi siempre es una **lectura cortada** y la prenda todavía está en la
   * mano: lo útil es volver a pasarla. Si ⛔ no enganchaba a ninguna, es un hallazgo de verdad
   * —stock mal cargado, prenda de otra marca— y ⛔ no hay nada que reintentar.
   */
  parecidos?: number
}

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
    // 🔑 **DETECTADA**: entra el número y nada más. Da igual si era la segunda igual o si el sistema
    // la tiene en cero — eso es del balance, ⛔ no de quien está caminando.
    case 'ok':
    case 'sumado':
    case 'stock-cero':
    // ⚠️ El rebote del aparato también **detectó** la prenda: lo único que ⛔ no pasó es que contara
    // una unidad más, así que el número se repite. Decir «repetido» acá era pedirle a quien camina
    // que entienda la diferencia entre dos prendas iguales y un Enter duplicado.
    case 'doble-lectura':
      return { aviso: 'ok', voz: fin.avance ? enPalabras(fin.avance) : '' }

    // 🔴 **⛔ NO DETECTADA**: lo único que hay para hacer es **pasarla de nuevo**, y es lo único que
    // se dice. Da lo mismo por qué falló —código cortado, SKU que comparten dos prendas, prenda que
    // ⛔ no figura—: son causas distintas con la misma acción, y el escaneo queda guardado igual.
    case 'no-cruzo':
    case 'no-encontrado':
      return { aviso: 'no', voz: 'de nuevo' }

    // ── Sólo el modo POR CATEGORÍA, que ⛔ no es el que se camina por sector. ──────────────────
    case 'cruce':
      return { aviso: 'mira', voz: 'otra categoría' }
    case 'sin-recorrido':
      return { aviso: 'no', voz: 'sin recorrido' }
    default:
      return { aviso: 'ok', voz: '' }
  }
}
