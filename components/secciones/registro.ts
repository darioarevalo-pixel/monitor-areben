import type { ComponentType } from 'react'

/**
 * El interruptor del strangler: qué secciones sirve el shell y cuáles siguen
 * viniendo del legacy embebido.
 *
 * **Estar acá ES el interruptor.** Antes había dos lugares (`SECCIONES_MIGRADAS`
 * en lib/nav.ts + el componente), y eso son dos cosas para acordarse: agregar el
 * componente y olvidar el Set = la sección migrada nunca se ve, sin ningún error.
 * Una sola fuente de verdad: si la key está acá, la sirve el shell; si no, el iframe.
 *
 * **Rollback:** comentar la línea de la sección, push, y vuelve la versión legacy
 * en el iframe. Sin revertir código. Eso es lo que hace reversible arrancar por la
 * sección más grande.
 *
 * ⚠️ El interruptor restaura CÓDIGO, no datos. Si una sección migrada ya escribió
 * en el KV o en Gestión Nube, sacarla de acá no deshace nada. Por eso las
 * secciones que escriben se habilitan por partes y con la red puesta
 * (scripts/crm-kv.mjs --restore).
 *
 * Este archivo importa componentes, así que NO lo puede importar `lib/nav.ts`:
 * arrastraría React adentro de los tests del dominio. La dirección es siempre
 * página → registro → componentes → lib.
 */
export const SECCIONES: Record<string, ComponentType> = {
  // El CRM ('clientes') entra acá en el Paso 6, primero en ruta sombra.
}

/** ¿Esta sección la sirve el shell? Si no, va al iframe. */
export function componenteDe(key: string): ComponentType | null {
  return SECCIONES[key] ?? null
}
