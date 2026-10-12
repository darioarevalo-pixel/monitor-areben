/**
 * Config compartida de Reposición (REPO_API). La usan Reposición, Conteo (para
 * `catsOff` al agrupar) y Sesión de fotos / Solicitudes internas (prioridadRetiro).
 * Port de `repoCfg` (index.html:11205) y `repoCfgLoad` (11310).
 */

import type { CfgVentas } from './porVentas'

export type RepoCfg = {
  /** clave (subcat/modelo/cat) → mínimo. */
  mins: Record<string, number>
  /** pids apagados (no se reponen). */
  apagados: string[]
  defaultMin: number
  reservaDeposito: number
  reservaTodos: boolean
  /** pid → tope por producto. */
  topes: Record<string, number>
  /** categorías a ignorar al agrupar. */
  catsOff: string[]
  prioridadRetiro: 'deposito' | 'local'
  /**
   * Reposición según ventas (sólo Zattia, `porVentas.ts`). Opcional: lo guardado antes no lo trae
   * y `cfgVentas()` rellena los defaults. ⚠️ Tiene que viajar en `leerRepoConfig`: la pantalla
   * guarda la config ENTERA, y un campo que no se lee se pierde en el próximo guardado.
   */
  ventas?: Partial<CfgVentas>
  /**
   * Lo mismo para la línea Stunned (SKU `STU…`), que vive adentro de Zattia pero tiene sus propias
   * condiciones (Darío, 11-oct-2026: «lo que precisa Stunned es diferente»). Ver `docs/lineas.md`.
   */
  ventasStunned?: Partial<CfgVentas>
  /**
   * La campaña cuyas prendas «para exhibir» salen con la ETIQUETA DE FERIA (el precio de la campaña)
   * en vez de la de precio + formas de pago (Darío, 12-oct-2026). Es el id de una liquidación viva;
   * se elige en Configurar. ⚠️ Tiene que viajar en `leerRepoConfig`, igual que `ventas`.
   */
  campaniaEtiqueta?: string | null
}

export function repoCfgDefault(): RepoCfg {
  return { mins: {}, apagados: [], defaultMin: 4, reservaDeposito: 1, reservaTodos: true, topes: {}, catsOff: [], prioridadRetiro: 'deposito' }
}

/** Una variante agregada del reporte de reposición. Port de la forma de `repoInv` (index.html:11206). */
export type RepoItem = {
  vid: string
  pid: string
  sid: string
  name: string
  size: string
  sku: string
  /** Código de barras de la variante (lo lee el armado con el lector). */
  barcode?: string
  local: number
  deposito: number
  /** Categorías candidatas (GN + TN, ya filtradas). */
  cats: string[]
  /** Categoría de respaldo (la de GN). */
  catFallback: string
  /** Categoría efectiva (subcat elegida o catFallback). */
  cat: string
  /** Subcategoría = primera candidata no ignorada (catsOff). */
  subcat: string | null
  /** Modelo de iPhone si el talle lo incluye. */
  modelo: string | null
  /** Ventas que descuentan del local, últimos 7d. */
  s7: number
  /** Ubicación física (observación de GN). */
  ubic: string
  /**
   * El producto tiene stock en `inventario` pero todavía no está en el catálogo
   * (`productos`) que bajó el ETL. Antes estas variantes se descartaban en silencio y el
   * stock desaparecía del reporte; ahora entran igual, con la categoría y el precio
   * pendientes hasta el próximo sync.
   */
  sinProducto: boolean
  /** Ventas que descuentan del local en la ventana de `porVentas` (Zattia: local + Tienda Nube). */
  vv?: number
  /** Días que el producto lleva vivo (alta en GN). `null`/ausente = no se sabe. */
  diasVivo?: number | null
}
