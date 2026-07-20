/**
 * Tipos del panel Gerencial: el modelo `Accionable` que producen los detectores y
 * consume el componente. La idea del módulo es convertir las señales que el monitor
 * YA calcula (ventas, stock, pendientes, importaciones) en una lista priorizada de
 * "qué requiere una decisión y qué conviene hacer", agregada de todas las marcas.
 *
 * Un `Accionable` no es un dato más: es un dato + una recomendación + a dónde ir a
 * ejecutarla. En fase 1 la acción es un `link` (llevar a la sección donde se hace);
 * fase 2 sumará acciones que se ejecutan en el panel.
 */

import type { Marca } from '@/lib/nav.generated'

export type Severidad = 'critico' | 'atencion' | 'oportunidad'
export type Area = 'stock' | 'comercial' | 'operativo' | 'ads' | 'importaciones'

/** Navegar a la sección donde se ejecuta la decisión. */
export type Accion = { tipo: 'link'; seccion: string; label: string }

/**
 * Un consumo interno pendiente de aprobación, colgado del accionable para aprobar/
 * rechazar in-place (fase 2). El detector lo llena; la tarjeta lo renderiza expandible.
 */
export type ConsumoPendiente = { marca: Marca; id: string; texto: string; sub: string }

export type Accionable = {
  /** Estable (area+marca+entidad) para deduplicar y silenciar (snooze). */
  id: string
  area: Area
  severidad: Severidad
  marca: Marca
  /** Qué pasa (una línea). */
  titulo: string
  /** El dato concreto que respalda el título. */
  detalle: string
  /** Qué conviene hacer. */
  recomendacion: string
  /** Magnitud (unidades, $, días) para ordenar dentro de una misma severidad. */
  valor?: number
  acciones: Accion[]
  /** Solo la tarjeta de aprobaciones: los consumos que se pueden accionar in-place. */
  consumos?: ConsumoPendiente[]
}

export const SEVERIDADES: Severidad[] = ['critico', 'atencion', 'oportunidad']

export const ETIQUETA_SEVERIDAD: Record<Severidad, string> = {
  critico: 'Crítico',
  atencion: 'Atención',
  oportunidad: 'Oportunidad',
}

export const ETIQUETA_AREA: Record<Area, string> = {
  stock: 'Stock',
  comercial: 'Comercial',
  operativo: 'Operativo',
  ads: 'Ads',
  importaciones: 'Importaciones',
}

const PESO_SEVERIDAD: Record<Severidad, number> = { critico: 0, atencion: 1, oportunidad: 2 }

/** Ordena por severidad (crítico primero) y, dentro de una severidad, por `valor` desc. */
export function ordenar(as: Accionable[]): Accionable[] {
  return [...as].sort(
    (a, b) =>
      PESO_SEVERIDAD[a.severidad] - PESO_SEVERIDAD[b.severidad] ||
      (b.valor ?? 0) - (a.valor ?? 0) ||
      a.titulo.localeCompare(b.titulo, 'es'),
  )
}
