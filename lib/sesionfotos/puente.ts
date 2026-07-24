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

/**
 * El segundo puente: Inicio → Sesión de fotos para ABRIR una solicitud puntual.
 * Port de `sfPendVer` (index.html:9782): Inicio deja el id de la solicitud a ver
 * (tras cambiar de marca si hace falta) y navega; al montar, Sesión de fotos la abre
 * en su detalle. Mismo singleton client-side, mismo consumo de una sola vez.
 */
let verSolicitud: string | null = null

/** Inicio deja acá el id de la solicitud a abrir y navega a Sesión de fotos. */
export function ponerVerSolicitud(id: string): void {
  verSolicitud = id
}

/** Sesión de fotos toma (una sola vez) el id de la solicitud a abrir, o null. */
export function tomarVerSolicitud(): string | null {
  const p = verSolicitud
  verSolicitud = null
  return p
}

/**
 * El tercer puente: Solicitudes → la ruta que corresponda, para CREAR una nueva.
 *
 * Desde la Fase 2 el alta empieza eligiendo motivo y destino en la pantalla de
 * Solicitudes; el motivo decide en qué cajón se guarda (y por lo tanto a qué ruta hay que
 * ir), así que la elección viaja acá y el borrador se abre ya configurado. Sin esto, el
 * usuario elegiría el motivo dos veces: una para llegar y otra adentro.
 */
export type AltaSolicitud = { motivo: string; tipo: 'retornable' | 'consumo' }

let alta: AltaSolicitud | null = null

/** Solicitudes deja acá el motivo + destino elegidos y navega a la ruta del cajón. */
export function ponerAltaSolicitud(a: AltaSolicitud): void {
  alta = a
}

/** La sección toma (una sola vez) el alta pedida, o null si entraron directo por la ruta. */
export function tomarAltaSolicitud(): AltaSolicitud | null {
  const a = alta
  alta = null
  return a
}
