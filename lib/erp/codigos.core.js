/**
 * El CÓDIGO del pedido mayorista (Bruno, 13-nov-2026; pedido de Ger del 12-nov): `M-` y el número con 4 cifras (`M-0075`), el
 * mismo que publica la API del ERP (`code`, `lib/ext/contrato.mjs` del motor) y que Logística imprime en la comanda y lee al
 * escanear. El `#75` pelado chocaba con el pedido #75 de Tienda Nube. El número es el mismo: sólo cambia cómo se escribe.
 * Sin número (todavía ⛔ entró) ⇒ «—».
 * @param {number|string|null|undefined} numero
 * @returns {string}
 */
export function codigoPedido(numero) {
  const n = Number(numero)
  if (numero == null || numero === '' || !Number.isSafeInteger(n) || n <= 0) return '—'
  return 'M-' + String(n).padStart(4, '0')
}
