/**
 * Los términos de la Caja que comparten la pestaña, el POS y la calculadora (Bruno, 5-oct:
 * «infinitivo en los términos, no explicar los resultados»): rótulo + valor, ⛔ una frase que narre.
 */
import { plata } from './ticket'

/** La diferencia del efectivo: «Cuadrado», «Sobran $X» o «Faltan $X». */
export const textoDiferencia = (d: number) => (Math.abs(d) < 0.005 ? 'Cuadrado' : d > 0 ? `Sobran ${plata(d)}` : `Faltan ${plata(-d)}`)

/** Un monto tipeado («20.000», «1500,50») a número; vacío o inválido ⇒ null. */
export const aNumero = (s: string) => {
  const n = Number(String(s).replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) && String(s).trim() !== '' ? n : null
}
