import type { Marca } from '@/lib/nav'
import type { Tone } from '@/components/ui/tokens'

/**
 * Los avisos del monitor: lo que te está esperando a vos.
 *
 * **Se derivan, no se registran.** Una solicitud nueva para el local no es un evento que haya
 * que guardar en ningún lado — es una fila que ya existe con su fecha de creación. Así que no
 * hay tabla de notificaciones ni escrituras repartidas por los módulos: cada tipo de aviso es
 * una función pura sobre datos que la app ya trae, y lo único que se persiste en toda la
 * feature es un número por persona (hasta cuándo miró; ver `visto.ts`).
 *
 * Sumar un aviso nuevo = una función más en `derivar.ts`. Es la misma forma que los detectores
 * del panel Gerencial, y es lo que haría barata una bandeja de notificaciones si algún día hace
 * falta: sería una pantalla que lista esto mismo.
 */

export type TipoAviso =
  | 'aprobacion' | 'solicitud' | 'no-devuelto' | 'falla-por-enviar'
  | 'canje-aprobacion' | 'canje-vencido'

export type Aviso = {
  /** Estable entre refrescos: es lo que permite comparar "esto ya lo vi". */
  id: string
  tipo: TipoAviso
  marca: Marca
  titulo: string
  detalle: string
  /** Adónde lleva el clic. */
  ruta: string
  /** Cuándo apareció. Se compara contra el "visto hasta" para marcarlo como nuevo. */
  ts: number
  tono: Tone
}

export const TIPO_LABEL: Record<TipoAviso, string> = {
  aprobacion: 'Esperando tu aprobación',
  solicitud: 'Para preparar',
  'no-devuelto': 'Sin devolver',
  'falla-por-enviar': 'Fallas por llevar al depósito',
  'canje-aprobacion': 'Canjes esperando tu firma',
  'canje-vencido': 'Canjes con contenido sin publicar',
}
