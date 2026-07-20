/**
 * Agregación: junta lo cargado de una marca (`DatosMarca`) y corre todos los
 * detectores por-marca sobre ella. Es la costura pura entre "los datos de una marca" y
 * "los accionables de esa marca"; el hook (`useGerencial`) hace la carga async, el
 * detector global de Ads y el merge multimarca. Sumar una señal por-marca = un
 * detector más acá.
 */

import type { DatosETL } from '@/lib/etl/tipos'
import type { Marca } from '@/lib/nav.generated'
import type { Solicitud } from '@/lib/sesionfotos/tipos'
import type { SolicitudInterna } from '@/lib/solicitudes-internas/tipos'
import type { Ingreso } from '@/lib/ingresos/tipos'
import type { IndiceTn } from '@/lib/tn'
import { computarFilas, OBJETIVO_DEFAULT } from '@/lib/margenes'
import { detectarComercial } from './detectores/comercial'
import { detectarPrecios } from './detectores/precios'
import { detectarCaducados } from './detectores/caducados'
import { detectarOperativo } from './detectores/operativo'
import { detectarImportaciones } from './detectores/importaciones'
import type { Accionable } from './tipos'
import type { Umbrales } from './umbrales'

/** Todo lo que necesitan los detectores por-marca. Cada extra es null si su carga falló. */
export type DatosMarca = {
  marca: Marca
  etl: DatosETL | null
  fotos: Solicitud[]
  internas: SolicitudInterna[]
  ingresos: Ingreso[]
  /** Índice de precios de TiendaNube (para el detector de precios). */
  tnPromo: IndiceTn | null
  /** Fuentes que no se pudieron leer (para avisar sin romper el panel). */
  errores: string[]
}

/** Corre todos los detectores por-marca sobre los datos de UNA marca. */
export function detectarDeMarca(d: DatosMarca, u: Umbrales, now: Date): Accionable[] {
  const out: Accionable[] = []
  if (d.etl) {
    out.push(...detectarComercial(d.marca, d.etl, u))
    out.push(...detectarCaducados(d.marca, d.etl.allProductos, u))
    if (d.tnPromo) {
      out.push(...detectarPrecios(d.marca, computarFilas(d.etl.allProductos, d.tnPromo, OBJETIVO_DEFAULT), u))
    }
  }
  out.push(...detectarOperativo(d.marca, d.fotos, d.internas, d.etl, u, now))
  out.push(...detectarImportaciones(d.marca, d.ingresos, u, now))
  return out
}
