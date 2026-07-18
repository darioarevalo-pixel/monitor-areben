import type { ComponentType } from 'react'
import { CRM } from '@/components/crm/CRM'
import { FundasModelo } from '@/components/fundas/FundasModelo'
import { SesionFotos } from '@/components/sesionfotos/SesionFotos'
import { Resumen } from '@/components/resumen/Resumen'

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
  // El flip de Fundas (17-jul-2026): `/fundas-modelo` lo sirve el shell para todo
  // el equipo, con las claves de localStorage REALES (las mismas del iframe).
  // Rollback: mover esta línea de vuelta a SOMBRAS → `/fundas-modelo` vuelve al
  // iframe legacy y `/fundas-modelo/next` a la sombra, sin tocar datos.
  'fundas-modelo': FundasModelo,
  // El flip del CRM (17-jul-2026): `/clientes` lo sirve el shell para el equipo.
  // Ya usaba las claves REALES del KV (`crm:seg:bdi`) en sombra, con forma
  // idéntica al legacy → sin migración de datos. El camino de escritura se
  // verificó end-to-end contra el KV real (round-trip con clave sintética, diff
  // aislado). Rollback: mover esta línea de vuelta a SOMBRAS.
  clientes: CRM,
  // El flip de Sesión de fotos (18-jul-2026): `/sesion-fotos` lo sirve el shell.
  // Nunca namespaceó el KV (siempre leyó/escribió `sesionfotos:<marca>`, la misma
  // clave del iframe) → sin migración de datos. Todas las escrituras se
  // verificaron E2E reversibles contra el KV real (estado/desc/escaneo/borrar/
  // armar) y la creación de ventas GN con paridad de payload OFFLINE byte-idéntica
  // (cero venta de prueba). Rollback: mover esta línea de vuelta a SOMBRAS → vuelve
  // el iframe legacy, sin tocar datos.
  'sesion-fotos': SesionFotos,
}

/**
 * Las secciones que ya existen en Next pero **todavía no son el default**.
 *
 * Se ven solo en `/<seccion>/next`; `/<seccion>` sigue sirviendo el legacy
 * embebido para todo el equipo. Es lo que permite abrir las dos y compararlas con
 * los mismos datos antes de flipear.
 *
 * El flip es mover la key de SOMBRAS a SECCIONES: una línea.
 */
export const SOMBRAS: Record<string, ComponentType> = {
  // Tanda A (analítica ETL). Resumen: los 5 KPIs + la línea de sync, read-only
  // sobre el store, en `/resumen/next`. Flip a SECCIONES cuando se valide el render.
  resumen: Resumen,
}

/** ¿Esta sección la sirve el shell? Si no, va al iframe. */
export function componenteDe(key: string): ComponentType | null {
  return SECCIONES[key] ?? null
}

/** El componente de la ruta sombra `/<key>/next`, si existe. */
export function componenteSombraDe(key: string): ComponentType | null {
  return SOMBRAS[key] ?? null
}
