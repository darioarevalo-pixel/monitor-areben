'use client'

import { useTiendaErp } from '@/lib/erp/linea-erp'
import { usePruebaSegunCorte } from '@/lib/erp/prueba-corte'

/**
 * Qué le pasa a la Caja y a Tienda Nube con un precio cargado en el ERP, según el CORTE de la tienda del menú (`erp_corte`).
 * Antes del corte manda GN y el precio sólo queda en el ERP; desde el corte, el motor lo sube a Tienda Nube (`tn.yml`, paso 5,
 * cada 2 h) y la Caja cobra el nuevo. 🔴 Revisión 10-nov: el cartel decía «no cambia» FIJO, también para Stunned (ya cortada).
 * Sin poder leer el corte (o mientras lee) dice lo de antes, como `usePruebaSegunCorte`.
 */
export function useAvisoPrecio(): { largo: string; corto: string } {
  const { prueba } = usePruebaSegunCorte(useTiendaErp())
  return prueba
    ? {
        largo: 'Mientras Gestión Nube funcione, no cambia lo que cobra la Caja ni lo que muestra Tienda Nube.',
        corto: 'mientras Gestión Nube funcione, no cambia la Caja ni Tienda Nube',
      }
    : {
        largo: 'Esta marca ya vive en Areben Gestión: el precio llega a Tienda Nube en las próximas 2 horas y cambia lo que cobra la Caja.',
        corto: 'llega a Tienda Nube en hasta 2 horas y cambia lo que cobra la Caja',
      }
}
