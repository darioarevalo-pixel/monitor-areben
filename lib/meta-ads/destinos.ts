/**
 * Los destinos de un aviso, del lado tipado.
 *
 * ⚠️ La lógica —qué URL pasa el guard, qué links del menú son colecciones— **no vive acá**: vive en
 * `lib/meta-ads/destinos.core.js`, en JS plano, porque `api/*.js` la necesita y no puede importar
 * TypeScript. Este archivo aporta los tipos, y es de donde comen los tests y la pantalla.
 */

import {
  destinosDelMenu as destinosDelMenuJs,
  hostDeTienda as hostDeTiendaJs,
  productosEnPagina as productosEnPaginaJs,
  validarDestino as validarDestinoJs,
} from './destinos.core.js'

/** Una página de la tienda que sirve de destino. */
export interface DestinoTienda {
  url: string
  ruta: string
  nombre: string
}

/** Una página de Facebook que el token maneja, con su Instagram si Meta lo da. */
export interface PaginaDelToken {
  id: string
  nombre: string
  instagram: { id: string; usuario: string | null } | null
}

/** `GET ?recurso=destinos&linea=…` */
export interface RespuestaDestinos {
  ok: true
  linea: string
  destinos: DestinoTienda[]
  /** Por qué no hay destinos del menú (la tienda no contestó). `null` = se leyó. */
  sinDestinos: string | null
  paginas: PaginaDelToken[]
  sinPaginas?: string | null
  sinInstagram?: string | null
}

/** `GET ?recurso=destinos&linea=…&url=…` */
export interface RespuestaDestino {
  ok: true
  destino: string
  responde: boolean
  /** Productos distintos en la primera página. `null` = la página no contestó. */
  productos: number | null
  motivo: string | null
}

export type DestinoValidado =
  | { ok: true; destino: string }
  | { ok: false; status: number; error: string }

export const validarDestino = validarDestinoJs as (url: string, linea: string) => DestinoValidado
export const destinosDelMenu = destinosDelMenuJs as (html: string, linea: string) => DestinoTienda[]
export const productosEnPagina = productosEnPaginaJs as (html: string, linea: string) => { cantidad: number; handles: string[] }
export const hostDeTienda = hostDeTiendaJs as (linea: string) => string | null
