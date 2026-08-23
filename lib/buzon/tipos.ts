/**
 * "Mensajes de clientes" — lo que la clienta escribió y todavía no se resolvió.
 *
 * # Por qué existe esta tabla y no una pestaña de Reclamos
 *
 * Reclamos y Cambios está frenado (`AGENTS.md`) y además contesta otra pregunta: ahí vive el
 * proceso de una devolución ya aceptada. Esto es el escalón de antes, y el problema es de
 * **tiempo**, no de proceso: entra un mail el domingo pidiendo cambiar un talle, el lunes a las 9
 * se arma el paquete y sale. Cuando alguien lee el mail, el paquete ya está en la moto.
 *
 * Por eso el dato importante de una fila no es su contenido sino **a qué orden pertenece** y **si
 * ya se resolvió**: es lo único que Envíos necesita para poder frenar el despacho.
 */

import type { Marca } from '@/lib/nav.datos'

/** De dónde salió la fila. `mail` es lo que trae la casilla sola (Fase B); `a_mano` lo carga alguien. */
export type OrigenMensaje = 'mail' | 'a_mano'

/**
 * Un mensaje de una clienta.
 *
 * 🔑 **`orden_numero` puede ser `null` y no es un error de carga.** La clienta escribe antes de
 * comprar, o escribe sin decir el número. Un mensaje sin orden no frena ningún despacho —no hay a
 * cuál atarlo— pero sigue estando a la vista, que es la mitad del problema que esto viene a
 * arreglar. Esconderlo hasta que alguien le ponga el número lo devuelve al lugar donde está hoy.
 */
export type MensajeBuzon = {
  id: string
  store: Marca
  /** El número de orden de Tienda Nube, ya normalizado (sin `#`, sin espacios). */
  orden_numero: string | null
  /** Quién escribió: el mail o el nombre. Texto libre. */
  remitente: string | null
  asunto: string | null
  cuerpo: string
  /** Cuándo lo escribió la clienta — **no** cuándo se cargó acá. ISO. */
  recibido_en: string
  origen: OrigenMensaje
  /**
   * El id del mensaje en la casilla. Es la llave anti-duplicado de la Fase B: traer la casilla dos
   * veces no puede dejar el mismo mail dos veces en la bandeja. `null` en los cargados a mano.
   */
  mensaje_ext_id: string | null
  resuelto: boolean
  resuelto_por: string | null
  resuelto_en: string | null
  /** Qué se hizo. Se pide al resolver: sin esto, "resuelto" es un tilde que no dice nada. */
  accion: string | null
  created_at?: string
  autor?: string | null
}

/** Lo que se manda a guardar. El servidor pone `id`, `autor` y las fechas de sistema. */
export type MensajeNuevo = {
  id?: string
  store: Marca
  orden_numero?: string | null
  remitente?: string | null
  asunto?: string | null
  cuerpo: string
  recibido_en?: string | null
  origen?: OrigenMensaje
  mensaje_ext_id?: string | null
}

/** El índice que Envíos consulta: `store|orden` → los mensajes SIN resolver de esa orden. */
export type IndiceAbiertos = Map<string, MensajeBuzon[]>

/** Lo mínimo que hace falta de un envío para preguntarle al índice. */
export type EnvioConOrden = { store: string; orden_numero: string | null }
