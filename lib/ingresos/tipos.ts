/**
 * Tipos de "Ingresos proyectados" (importaciones de fundas por llegar, solo BDI).
 * Port del modelo de datos del legacy (index.html:3989): una importación tiene
 * bloques (cada uno = un material con su grilla), cada grilla es modelos (filas) ×
 * diseños (columnas) con celdas de cantidad, más una galería de fotos/videos.
 */

/** La clave de estado de una importación (con su color, en ESTADOS). */
export type EstadoIngreso = 'cotizando' | 'pedido' | 'produccion' | 'transito' | 'aduana' | 'arribado'

/** Una fila de la grilla (un modelo de celular). */
export type ModeloFila = { id: string; model: string }

/** Una columna de la grilla (un diseño de funda), con su foto inline opcional (data URL). */
export type DisenoColumna = { id: string; nombre: string; img: string }

/** Cantidades: `celdas[modeloId][disenoId] = cantidad` (solo las > 0 se guardan). */
export type Celdas = Record<string, Record<string, number>>

/** Un bloque = un material (IMD, Formas…) con su propia grilla. */
export type Bloque = {
  id: string
  nombre: string
  modelos: ModeloFila[]
  disenos: DisenoColumna[]
  celdas: Celdas
}

/** Un ítem de la galería del pedido: foto subida (data URL) o link de video. */
export type GalleryItem = { id: string; tipo: 'img' | 'video'; url: string; nombre: string }

/** El total por modelo derivado (se mantiene por compatibilidad con el formato viejo). */
export type ItemDerivado = { id: string; model: string; cantidad: number }

/** Una importación proyectada. */
export type Ingreso = {
  id: string
  desc: string
  proveedor: string
  /** Fecha estimada de llegada, ISO `YYYY-MM-DD` o ''. */
  fecha: string
  estado: EstadoIngreso
  nota: string
  bloques: Bloque[]
  gallery: GalleryItem[]
  /** Derivado (total por modelo). No se edita; lo recomputa derivarItems al guardar. */
  items?: ItemDerivado[]
  // Campos del formato viejo que ingNormalizar migra a `bloques` (pueden venir del KV).
  modelos?: ModeloFila[]
  disenos?: DisenoColumna[]
  celdas?: Celdas
}

/** La vista de la sección: lector (default) / resumen / editar (solo admins). */
export type VistaIngresos = 'lector' | 'resumen' | 'editar'
