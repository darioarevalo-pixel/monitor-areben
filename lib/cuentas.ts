import type { Marca } from './nav.generated'

/**
 * Solo lo que el shell necesita: el nombre visible de cada marca.
 *
 * Las URLs y anon keys de Supabase NO se replican acá a propósito — hoy viven
 * hardcodeadas en CUENTAS (index.html:1880) y son públicas, pero duplicarlas
 * sería consagrar el problema. La capa de datos llega en la Fase 4, y la Fase S
 * (RLS) define de dónde salen.
 */
export const CUENTAS: Record<Marca, { nombre: string }> = {
  bdi: { nombre: 'BDI Accesorios' },
  zattia: { nombre: 'Zattia' },
}
