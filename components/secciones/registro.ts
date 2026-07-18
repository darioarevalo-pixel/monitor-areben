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
import { Margenes } from '@/components/margenes/Margenes'
import { Talles } from '@/components/talles/Talles'
import { Colores } from '@/components/colores/Colores'
import { SolicitudesInternas } from '@/components/solicitudes-internas/SolicitudesInternas'
import { GenTalles } from '@/components/gen-talles/GenTalles'
import { Cupones } from '@/components/cupones/Cupones'
import { Etiquetas } from '@/components/etiquetas/Etiquetas'
import { Comisiones } from '@/components/comisiones/Comisiones'
import { ConteoDeposito } from '@/components/conteo-deposito/ConteoDeposito'
import { ConteoEstandar } from '@/components/conteo-estandar/ConteoEstandar'
import { Conteo } from '@/components/conteo/Conteo'
import { Reposicion } from '@/components/reposicion/Reposicion'
import { VerifVentas } from '@/components/verif-ventas/VerifVentas'
import { Disenos } from '@/components/disenos/Disenos'

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
  // El flip de Márgenes (18-jul-2026, Tanda A #5): `/margenes` lo sirve el shell.
  // Grilla de tarjetas con foto (TN) + markup/margen + desfase vs objetivo editable
  // (default 130%), sobre disponibles. Read-only; usa el índice promo de TN
  // (useTnPromo). Flip directo. Rollback: mover esta línea a SOMBRAS.
  margenes: Margenes,
  // El flip de Talles (18-jul-2026, Tanda A #9, Zattia): `/talles` lo sirve el shell.
  // Read-only sobre `allTallesData`: categoría + rango de meses → chart + tabla por
  // talle. recharts. Flip directo. Rollback: mover esta línea a SOMBRAS.
  talles: Talles,
  // El flip de Colores (18-jul-2026, Tanda A #8, Zattia): `/colores` lo sirve el shell.
  // Dos sub-pestañas: Ventas por color (selección + chart + tabla) y Análisis de
  // agotamiento (ratio por color congelado al primer sellout). Read-only sobre
  // allColoresSales/allAgotamientoData. Flip directo. Rollback: mover a SOMBRAS.
  colores: Colores,
  // El flip de Reposición (18-jul-2026, Tanda D, cierre): `/reposicion` lo sirve el
  // shell. READ-ONLY: reporte "bajo mínimo en Local + stock en Depósito" + hoja de
  // trabajo PDF + config compartida (mins/topes/apagados/catsOff a REPO_API). NO
  // ajusta stock (a diferencia de los conteos). El reporte (minimo/objetivo/sugerido)
  // va con paridad ejecutable. Reusa lib/reposicion (cfg+grupos ya usados por conteo).
  // Rollback: mover esta línea a SOMBRAS.
  reposicion: Reposicion,
  // El flip de Verificación de ventas (18-jul-2026, Tanda C #1): `/verif-ventas` lo
  // sirve el shell. Read-only: el cruce TN↔GN lo hace server-side `tiendanube-audit
  // ?verificar_ventas=1`; el cliente solo muestra + tilda el checklist de "ya anuladas
  // a mano en GN" (KV kind `verifventas`, forma `{resueltas}`, con `cargado`). No
  // escribe stock ni anula en GN (GN no lo permite por API). Rollback: mover a SOMBRAS.
  'verif-ventas': VerifVentas,
  // El flip de Solicitudes internas (18-jul-2026, Tanda B #1): `/solicitudes-internas`
  // lo sirve el shell. Gemela de Sesión de fotos —KV `list` (kind
  // `solicitudesinternas`, misma clave del iframe → sin migración de datos),
  // escaneo, venta GN— con capa propia de motivo/tipo/aprobación. Escrituras al KV
  // con la misma disciplina (merge por-solicitud + `cargado`); venta GN con paridad
  // de payload OFFLINE byte-idéntica (cero venta de prueba) y contramedida
  // anti-duplicado. Rollback: mover esta línea de vuelta a SOMBRAS.
  'solicitudes-internas': SolicitudesInternas,
  // El flip de Tabla de talles (18-jul-2026, Tanda B #2): `/gen-talles` lo sirve el
  // shell. Generador de tablas (HTML byte-idéntico al legacy, paridad ejecutable) +
  // vincular a un producto de TN + guardar en el KV (kind `talles`, misma clave del
  // iframe → sin migración de datos, merge por-clave con `cargado`) + cargar en la
  // descripción de TN (payload byte-idéntico, endpoint intacto) + lista de pendientes
  // (Zattia). Rollback: mover esta línea de vuelta a SOMBRAS.
  'gen-talles': GenTalles,
  // El flip de Cupones (18-jul-2026, Tanda B #3): `/cupones` lo sirve el shell.
  // CRUD de descuentos por cliente para el local (KV kind `cupones`, misma clave del
  // iframe → sin migración de datos; merge por-cupón con `cargado`). Gate de creación
  // por `cupones.crear`; borrar solo admin. No toca la tienda online. Rollback: mover
  // esta línea de vuelta a SOMBRAS.
  cupones: Cupones,
  // El flip de Etiquetas (18-jul-2026, Tanda B #4): `/etiquetas` lo sirve el shell.
  // Impresión de etiquetas con código de barras (Code 128): depósito/local/promo/SKU
  // + etiqueta libre + formas de pago. Solo escribe localStorage (cantidades/config
  // por cuenta, MISMAS claves del iframe → sin migración); imprime PDFs locales (no
  // toca datos). PDF ported byte-fiel; JsBarcode como dep npm. Precios de TN (Zattia
  // mergea zattia+stunned). Rollback: mover esta línea de vuelta a SOMBRAS.
  etiquetas: Etiquetas,
  // El flip de Comisiones (18-jul-2026): `/comisiones` lo sirve el shell. Margen neto
  // real por forma de pago × canal (comisiones/financiación/IIBB/DREI/Ganancias/IVA) +
  // simulador por producto + break-even + piso + lista de precios de sale (XLSX/PDF).
  // La MATH es byte-fiel (parity ejecutable). Config COMPARTIDA en KV (COM_API,
  // endpoint propio, POST byte-idéntico) que solo los admins persisten; todos la ven.
  // localStorage con las MISMAS claves del legacy. DIFERIDO: el botón "Asignar
  // categoría en TN" (necesita tncat, Tanda C). Rollback: mover esta línea a SOMBRAS.
  comisiones: Comisiones,
  // El flip de Selección de diseños (18-jul-2026, Tanda C, bajo riesgo): `/disenos` lo
  // sirve el shell. Tablero local (kanban/galería) para cargar opciones de diseño,
  // opinar (👍/👎 + notas), clasificar (confirmado/duda/rechazado) y exportar PDFs.
  // Solo escribe localStorage (MISMAS claves del iframe → sin migración) + endpoint
  // `votacion` (Vercel, no TN/GN) para juntar votos del equipo. NO toca stock ni GN.
  // Lógica pura con paridad (orden/tally/import). Rollback: mover esta línea a SOMBRAS.
  disenos: Disenos,
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
  // Conteo de Depósito (Tanda D #1): conteo físico a mano vs stock vivo de GN
  // (`/api/inventario-vivo`); ajuste `nuevo=vivo+dif` → Excel para subir a mano. En
  // sombra para comparar `/conteo-deposito/next` contra el legacy antes de flipear.
  'conteo-deposito': ConteoDeposito,
  // Conteo estándar del Local (Tanda D #2): dos entradas de nav (zattia/stunned) que
  // comparten el componente; la línea sale de la ruta (useParams). Exhibido (escáner)
  // + depósito (a mano) vs stock vivo del Local; ajuste → Excel. En sombra.
  'conteo-estandar-zattia': ConteoEstandar,
  'conteo-estandar-stunned': ConteoEstandar,
  // Conteo de local (Tanda D #3, BDI): conteo por escáner vs espejo Supabase; COMPLETA
  // el Excel de GN (rellena nuevo_stock, solo Local de grupos marcados). En sombra.
  conteo: Conteo,
}

/** ¿Esta sección la sirve el shell? Si no, va al iframe. */
export function componenteDe(key: string): ComponentType | null {
  return SECCIONES[key] ?? null
}

/** El componente de la ruta sombra `/<key>/next`, si existe. */
export function componenteSombraDe(key: string): ComponentType | null {
  return SOMBRAS[key] ?? null
}
