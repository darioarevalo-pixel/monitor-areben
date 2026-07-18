/**
 * El puente Marketing → Sesión de fotos. Port del global `sfPendMkt`
 * (index.html:9656): Marketing tilda productos, los deja acá y navega a
 * `/sesion-fotos`; al montar, Sesión de fotos los toma y abre un borrador nuevo
 * pre-cargado con esas variantes.
 *
 * Un singleton a nivel de módulo, no sessionStorage, porque la navegación del shell
 * es client-side (<Link>/router.push): la app no se desmonta, así que la variable
 * sobrevive el cambio de ruta. Igual que el legacy, NO sobrevive un reload — y no
 * debe: pre-cargar un borrador con una selección vieja al recargar sería peor que
 * empezar de cero.
 *
 * `tomar` CONSUME (devuelve y limpia) para que abrir Sesión de fotos por su cuenta,
 * sin venir de Marketing, no arrastre una selección anterior.
 */

let pendiente: string[] | null = null

/** Marketing deja acá los ids de producto elegidos y navega a Sesión de fotos. */
export function ponerPuenteFotos(pids: string[]): void {
  pendiente = pids.map(String)
}

/** Sesión de fotos toma (una sola vez) los ids pendientes, o null si no vino de Marketing. */
export function tomarPuenteFotos(): string[] | null {
  const p = pendiente
  pendiente = null
  return p
}
