/**
 * Accionar sobre la pauta de Meta. Importá desde acá:
 *   import { BotonesAccion, ModalesDeAccion, useAccionMeta } from '@/components/meta-ads/acciones'
 *
 * Salió de partir `ConfirmAccion.tsx` (903 líneas), donde convivían la plomería que escribe, los
 * botones de cada fila y los tres modales. Lo que se ganó no es prolijidad: el estado de los modales
 * vivía en `Etapas.tsx`, así que **ninguna otra pantalla podía accionar** — ver `useAccionMeta`.
 */

export { BotonesAccion } from '@/components/meta-ads/acciones/BotonesAccion'
export { ModalDuplicar } from '@/components/meta-ads/acciones/ModalDuplicar'
export { ModalNombre } from '@/components/meta-ads/acciones/ModalNombre'
export { ModalPresupuesto } from '@/components/meta-ads/acciones/ModalPresupuesto'
export { ModalesDeAccion } from '@/components/meta-ads/acciones/ModalesDeAccion'
export { useAccionMeta, type AccionMeta, type ModalesAccion } from '@/components/meta-ads/acciones/useAccionMeta'
export {
  GENERO_NIVEL, ROTULO_NIVEL, type Acciones, type AjustesCopia, type ObjetoMeta,
} from '@/components/meta-ads/acciones/tipos'
