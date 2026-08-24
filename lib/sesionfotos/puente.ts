import type { Disparador } from '../solicitudes/disparador'

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

/**
 * Lo que una pantalla deja para que el borrador se abra cargado.
 *
 * Empezó siendo `string[]` (los pids que tildaba Marketing) y creció cuando la cola de fotos
 * necesitó mandar **qué variantes** hay que fotografiar, no sólo qué productos: la cola sabe que
 * al negro le falta la foto y al blanco no, y perder eso obligaba a volver a tildar a mano lo que
 * la pantalla anterior ya había decidido.
 *
 * `vids` vacío es legítimo y es lo que manda Marketing: «este producto, elegí vos los talles».
 */
export type SeleccionFotos = {
  /** Ids de producto de Gestión Nube a expandir en el borrador. */
  pids: string[]
  /** Variantes a dejar TILDADAS. Vacío = ninguna (el borrador abre todo sin tildar). */
  vids: string[]
  /** De dónde viene la sesión, cuando la puerta lo sabe. Ver `lib/solicitudes/disparador.ts`. */
  disparador: Disparador | null
}

let pendiente: SeleccionFotos | null = null

/** Una pantalla deja acá lo elegido y navega a Sesión de fotos. */
export function ponerPuenteFotos(sel: SeleccionFotos): void {
  pendiente = { pids: sel.pids.map(String), vids: sel.vids.map(String), disparador: sel.disparador }
}

/** Sesión de fotos toma (una sola vez) lo pendiente, o null si entraron por su cuenta. */
export function tomarPuenteFotos(): SeleccionFotos | null {
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
export type AltaSolicitud = {
  motivo: string
  tipo: 'retornable' | 'consumo'
  /**
   * De qué proceso viene, cuando la puerta lo sabe (`disparadorPorPuerta`). `null`/ausente
   * = la puerta no lo sabe y lo pregunta el borrador. Ver `lib/solicitudes/disparador.ts`.
   */
  disparador?: Disparador | null
}

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
