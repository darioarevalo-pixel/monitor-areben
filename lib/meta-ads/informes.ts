/**
 * Los informes del analista de pauta, del lado tipado.
 *
 * ⚠️ La lógica —qué se puede guardar, qué avisos tiene un HTML, cómo se mapea una fila— **no vive
 * acá**: vive en `lib/meta-ads/informes.core.js`, en JS plano, porque la necesitan
 * `api/_meta-informes.js` y `scripts/informe-meta.mjs` y ninguno de los dos puede importar
 * TypeScript. Este archivo aporta los tipos. Mismo reparto que `decisiones.ts` / `.core.js`.
 */

import type { LineaPauta } from './tipos'
import {
  avisosDelHtml as avisosDelHtmlJs,
  nombreArchivo as nombreArchivoJs,
  riesgosDelHtml as riesgosDelHtmlJs,
  validarInforme as validarInformeJs,
} from './informes.core.js'

/** Un informe en la LISTA: sin el cuerpo. Son 40 KB por fila y la lista no los usa. */
export type InformeResumen = {
  id: number
  creada: string
  actualizada: string
  quien: string
  /** El día que MIRA el informe, no el día en que se subió. */
  fecha: string
  linea: LineaPauta
  titulo: string
  resumen: string
  publicado: boolean
  publicadoAt: string | null
  pesoKb: number | null
}

/** Un informe abierto: lo mismo más el HTML autocontenido. */
export type Informe = InformeResumen & { html: string }

export type RespuestaInformes = {
  ok: true
  informes: InformeResumen[]
  /** Las líneas donde este perfil puede publicar y borrar. Dibuja los botones. */
  puedeEditar: string[]
}
export type RespuestaInforme = { ok: true; informe: Informe }

export type InformeParaGuardar = {
  fecha: string
  linea: string
  titulo: string
  resumen: string | null
  html: string
}

export type Validacion =
  | { ok: true; informe: InformeParaGuardar }
  | { ok: false; error: string }

/**
 * El `as` es el precio del reparto `.core.js` / `.ts`: TypeScript infiere `ok: boolean` sobre el JS
 * plano y ahí se pierde el narrowing de la unión. Es el mismo patrón que el resto de la carpeta.
 */
export function validarInforme(cuerpo: unknown, opts: { lineasValidas: string[] }): Validacion {
  return validarInformeJs(cuerpo, opts) as Validacion
}

/** Lo que hace que un informe NO se guarde: JavaScript en cualquiera de sus formas. Ver `RIESGOS`. */
export function riesgosDelHtml(html: string): string[] {
  return riesgosDelHtmlJs(html)
}

/** Lo que conviene saber antes de guardar y no invalida nada. Ver el `.core.js`. */
export function avisosDelHtml(html: string): string[] {
  return avisosDelHtmlJs(html)
}

/** `AAAA-MM-DD-<linea>.html`, el mismo nombre que tenía en la carpeta del analista. */
export function nombreArchivo(informe: Pick<InformeResumen, 'fecha' | 'linea'>): string {
  return nombreArchivoJs(informe)
}
