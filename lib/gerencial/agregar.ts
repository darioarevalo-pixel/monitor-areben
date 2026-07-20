/**
 * Agregación: junta lo cargado de una marca (`DatosMarca`) y corre todos los
 * detectores sobre ella. Es la costura pura entre "los datos de una marca" y "los
 * accionables de esa marca"; el hook (`useGerencial`) hace la carga async y el
 * merge multimarca. Sumar una señal nueva = un detector más acá.
 */

import type { DatosETL } from '@/lib/etl/tipos'
import type { Marca } from '@/lib/nav.generated'
import type { Solicitud } from '@/lib/sesionfotos/tipos'
import type { SolicitudInterna } from '@/lib/solicitudes-internas/tipos'
import type { Ingreso } from '@/lib/ingresos/tipos'
import { detectarComercial } from './detectores/comercial'
import { detectarOperativo } from './detectores/operativo'
import { detectarImportaciones } from './detectores/importaciones'
import type { Accionable } from './tipos'
import type { Umbrales } from './umbrales'

/** Todo lo que necesitan los detectores de una marca. `etl` es null si su carga falló. */
export type DatosMarca = {
  marca: Marca
  etl: DatosETL | null
  fotos: Solicitud[]
  internas: SolicitudInterna[]
  ingresos: Ingreso[]
  /** Fuentes que no se pudieron leer (para avisar sin romper el panel). */
  errores: string[]
}

/** Corre todos los detectores sobre los datos de UNA marca. */
export function detectarDeMarca(d: DatosMarca, u: Umbrales, now: Date): Accionable[] {
  const out: Accionable[] = []
  if (d.etl) out.push(...detectarComercial(d.marca, d.etl, u))
  out.push(...detectarOperativo(d.marca, d.fotos, d.internas, d.etl, u, now))
  out.push(...detectarImportaciones(d.marca, d.ingresos, u, now))
  return out
}
