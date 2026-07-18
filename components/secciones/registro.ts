import type { ComponentType } from 'react'
import { CRM } from '@/components/crm/CRM'
import { FundasModelo } from '@/components/fundas/FundasModelo'
import { SesionFotos } from '@/components/sesionfotos/SesionFotos'
import { Resumen } from '@/components/resumen/Resumen'
import { VentasMensuales } from '@/components/ventas-mensuales/VentasMensuales'
import { ProductosTable } from '@/components/productos/ProductosTable'
import { VariantesTable } from '@/components/variantes/VariantesTable'
import { Proveedores } from '@/components/proveedores/Proveedores'
import { Caducados } from '@/components/caducados/Caducados'

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
  // El flip de Resumen (18-jul-2026, 1er de la Tanda A): `/resumen` lo sirve el
  // shell. Read-only sobre el store del ETL (5 KPIs + estado de sync); KPIs con
  // paridad contra el fixture ETL real. Rollback: mover esta línea a SOMBRAS.
  resumen: Resumen,
  // El flip de Ventas mensuales (18-jul-2026, Tanda A #2): `/ventas-mensuales` lo
  // sirve el shell. Read-only sobre `allMonthlyStats` del store (chart + tabla por
  // categoría + tabla por canal); filas con paridad contra el fixture ETL. Chart
  // en recharts (como Fundas), no Chart.js. Rollback: mover esta línea a SOMBRAS.
  'ventas-mensuales': VentasMensuales,
  // El flip de Productos (18-jul-2026, Tanda A #3): `/productos` lo sirve el shell.
  // La analítica más pesada de la tanda, hecha en 4 pasos (tabla read-only → fotos
  // TN + detalle → sale/PDF → flip). Read-only sobre el store salvo el botón
  // "Actualizar inventario", que sólo DISPARA el sync de GN (no escribe stock). La
  // selección de sale es local + PDF (no escribe a GN, confirmado por Bruno).
  // Rollback: mover esta línea a SOMBRAS → vuelve el iframe legacy, sin tocar datos.
  productos: ProductosTable,
  // El flip de Variantes (18-jul-2026, Tanda A #4): `/variantes` lo sirve el shell.
  // Read-only sobre `allVariantes` del store (buscar + estado + orden + paginación);
  // reusa el molde de productos (lib/tabla, formatLifespan, colorStock, CSS). Flip
  // directo (bajo riesgo). Rollback: mover esta línea a SOMBRAS.
  variantes: VariantesTable,
  // El flip de Proveedores (18-jul-2026, Tanda A #7): `/proveedores` lo sirve el shell.
  // Read-only sobre `allProveedoresData` del store: comparativa (2 charts) + detalle
  // (selector + rango de 1ª venta + 4 KPIs + chart mensual + ranking). Charts en
  // recharts. Flip directo (bajo riesgo). Rollback: mover esta línea a SOMBRAS.
  proveedores: Proveedores,
  // El flip de Caducados (18-jul-2026, Tanda A #10): `/caducados` lo sirve el shell.
  // Candidatos a depurar (sin stock + última venta > N días) con fetches propios a
  // Supabase (stock por depósito + ventas ~2 años). Read-only: no borra nada (la baja
  // es a mano en TN/GN); el botón "Traer stock de GN" sólo dispara el sync. PDF
  // exportable. Flip directo. Rollback: mover esta línea a SOMBRAS.
  caducados: Caducados,
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
  // (vacío: CRM, Fundas, Sesión de fotos, Resumen, Ventas mensuales y Productos flipeados)
}

/** ¿Esta sección la sirve el shell? Si no, va al iframe. */
export function componenteDe(key: string): ComponentType | null {
  return SECCIONES[key] ?? null
}

/** El componente de la ruta sombra `/<key>/next`, si existe. */
export function componenteSombraDe(key: string): ComponentType | null {
  return SOMBRAS[key] ?? null
}
