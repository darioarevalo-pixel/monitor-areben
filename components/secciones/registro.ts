import dynamic from 'next/dynamic'
import type { ComponentType } from 'react'
import { Cargando } from './Cargando'

/**
 * Cada sección se carga con `next/dynamic` (code-splitting): su JS es un chunk
 * aparte que se descarga SOLO al entrar a esa sección, no en el bundle inicial.
 *
 * Antes las 28 secciones se importaban estáticas, así que el bundle inicial de
 * CUALQUIER ruta —incluido `inicio`, que ni usa secciones— traía la app entera
 * (~2,8 MB de JS: recharts, xlsx, jspdf, jsbarcode, todas las tablas). Eso hacía
 * lento el primer load de todo. Con lazy, entrar a `inicio` solo baja el shell.
 *
 * `componenteDe(key)` sigue devolviendo un ComponentType (el wrapper de dynamic es
 * truthy), así que el interruptor del strangler y los tests no cambian.
 */
// ⚠️ El 2º arg de dynamic() DEBE ser un objeto literal inline (`{ loading: … }`), no
// una variable: Turbopack lo exige en build ("options must be an object literal") aunque
// `next dev` sea permisivo. Por eso se repite el literal en cada línea.
const Inicio = dynamic(() => import('@/components/inicio/Inicio').then((m) => m.Inicio), { loading: Cargando })
const CRM = dynamic(() => import('@/components/crm/CRM').then((m) => m.CRM), { loading: Cargando })
const Ingresos = dynamic(() => import('@/components/ingresos/Ingresos').then((m) => m.Ingresos), { loading: Cargando })
const Marketing = dynamic(() => import('@/components/marketing/Marketing').then((m) => m.Marketing), { loading: Cargando })
const Tncat = dynamic(() => import('@/components/tncat/Tncat').then((m) => m.Tncat), { loading: Cargando })
const Ubicaciones = dynamic(() => import('@/components/ubicaciones/Ubicaciones').then((m) => m.Ubicaciones), { loading: Cargando })
const FundasModelo = dynamic(() => import('@/components/fundas/FundasModelo').then((m) => m.FundasModelo), { loading: Cargando })
const SesionFotos = dynamic(() => import('@/components/sesionfotos/SesionFotos').then((m) => m.SesionFotos), { loading: Cargando })
const Resumen = dynamic(() => import('@/components/resumen/Resumen').then((m) => m.Resumen), { loading: Cargando })
const VentasMensuales = dynamic(() => import('@/components/ventas-mensuales/VentasMensuales').then((m) => m.VentasMensuales), { loading: Cargando })
const ProductosTable = dynamic(() => import('@/components/productos/ProductosTable').then((m) => m.ProductosTable), { loading: Cargando })
const VariantesTable = dynamic(() => import('@/components/variantes/VariantesTable').then((m) => m.VariantesTable), { loading: Cargando })
const Proveedores = dynamic(() => import('@/components/proveedores/Proveedores').then((m) => m.Proveedores), { loading: Cargando })
const Caducados = dynamic(() => import('@/components/caducados/Caducados').then((m) => m.Caducados), { loading: Cargando })
const Margenes = dynamic(() => import('@/components/margenes/Margenes').then((m) => m.Margenes), { loading: Cargando })
const Talles = dynamic(() => import('@/components/talles/Talles').then((m) => m.Talles), { loading: Cargando })
const Colores = dynamic(() => import('@/components/colores/Colores').then((m) => m.Colores), { loading: Cargando })
const SolicitudesInternas = dynamic(() => import('@/components/solicitudes-internas/SolicitudesInternas').then((m) => m.SolicitudesInternas), { loading: Cargando })
const GenTalles = dynamic(() => import('@/components/gen-talles/GenTalles').then((m) => m.GenTalles), { loading: Cargando })
const Cupones = dynamic(() => import('@/components/cupones/Cupones').then((m) => m.Cupones), { loading: Cargando })
const Etiquetas = dynamic(() => import('@/components/etiquetas/Etiquetas').then((m) => m.Etiquetas), { loading: Cargando })
const Comisiones = dynamic(() => import('@/components/comisiones/Comisiones').then((m) => m.Comisiones), { loading: Cargando })
const ConteoDeposito = dynamic(() => import('@/components/conteo-deposito/ConteoDeposito').then((m) => m.ConteoDeposito), { loading: Cargando })
const ConteoEstandar = dynamic(() => import('@/components/conteo-estandar/ConteoEstandar').then((m) => m.ConteoEstandar), { loading: Cargando })
const Conteo = dynamic(() => import('@/components/conteo/Conteo').then((m) => m.Conteo), { loading: Cargando })
const Reposicion = dynamic(() => import('@/components/reposicion/Reposicion').then((m) => m.Reposicion), { loading: Cargando })
const VerifVentas = dynamic(() => import('@/components/verif-ventas/VerifVentas').then((m) => m.VerifVentas), { loading: Cargando })
const Disenos = dynamic(() => import('@/components/disenos/Disenos').then((m) => m.Disenos), { loading: Cargando })
const Exhib = dynamic(() => import('@/components/exhib/Exhib').then((m) => m.Exhib), { loading: Cargando })
const Usuarios = dynamic(() => import('@/components/usuarios/Usuarios').then((m) => m.Usuarios), { loading: Cargando })

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
  // El flip de Inicio (18-jul-2026): `/inicio` lo sirve el shell (era de las últimas
  // en el iframe). Novedades: solicitudes de Sesión de fotos pendientes de armar,
  // multimarca (lee `sesionfotos:<marca>` de las marcas visibles y filtra 'pendiente');
  // cada una abre esa solicitud vía el 2º puente (ponerVerSolicitud) cambiando de marca
  // si hace falta. Aviso al aprobador de solicitudes internas. Read-only (no escribe).
  // Sacarlo del iframe cierra el último legacy pesado del uso diario. Rollback: a SOMBRAS.
  inicio: Inicio,
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
  // El flip de Marketing (18-jul-2026, con puente): `/marketing` lo sirve el shell.
  // Catálogo cruzado GN⨯TN (auditoría de fotos/descripciones/tabla de talles + stock
  // y ventas por canal). READ-ONLY sobre el store + `tiendanube-audit` (matcheo de
  // lib/tn, el mismo que Productos/Márgenes); el botón "Actualizar fotos" solo bustea
  // el caché del endpoint (no escribe TN). El PUENTE "Productos para sesión de fotos"
  // tilda productos, los deja en lib/sesionfotos/puente y navega a `/sesion-fotos`,
  // que abre un borrador pre-cargado (expandirProductos) — NO crea ventas ni toca
  // stock: eso sigue siendo un paso humano en Sesión de fotos. El reporte de fotos y
  // las etiquetas Zebra del legacy eran código muerto (sin botón) → no se portaron.
  // Rollback: mover esta línea a SOMBRAS → vuelve el iframe legacy, sin tocar datos.
  marketing: Marketing,
  // El flip de Ingresos proyectados (18-jul-2026, Tanda C, solo BDI): `/ingresos` lo
  // sirve el shell. Editor de importaciones de fundas por llegar: bloques (por material)
  // × grilla modelos·diseños con fotos inline (data URL) + galería de fotos/videos +
  // proveedor/fecha/estado/nota. 3 vistas (lector/resumen/editar). Persiste en el KV
  // (`api/ingresos`, forma default `{ingresos}`, config COMPARTIDA que SOLO los admins
  // escriben —el server valida adminUser/adminPass). Se sumó `leerIngresos`/`guardarIngresos`
  // al seam con la MISMA disciplina de `cargado` (sin lectura previa no se guarda:
  // borraría todas las importaciones); un 403 olvida la pass cacheada. Guardado del array
  // entero (LWW, como el legacy) con debounce 600ms. NO toca stock ni GN. Rollback: mover
  // esta línea a SOMBRAS.
  ingresos: Ingresos,
  // El flip de Tienda Nube (tncat, 18-jul-2026): `/tncat` lo sirve el shell. 4 herramientas
  // que ESCRIBEN en la tienda online EN VIVO — Categorías por modelo (BDI), Carga de
  // imágenes + Revisar fotos (ambas), Asignar categoría por Excel (Zattia). Bruno autorizó
  // el flip aceptando el port byte-fiel de los endpoints (tn-categorias/tn-subir-imagen), sin
  // operación de prueba previa (es su tienda). El flip NO escribe nada por sí mismo: los
  // writes siguen ocurriendo solo al apretar cada botón, igual que el legacy. La lógica pura
  // (matcheo por nombre de archivo, filtros de fotos, cruce del Excel) está testeada
  // (tests/tncat). Rollback: mover esta línea a SOMBRAS → vuelve el iframe legacy.
  tncat: Tncat,
  // El flip de Usuarios (19-jul-2026, admin): `/usuarios` lo sirve el shell — la ÚLTIMA
  // sección que quedaba en el iframe legacy (con esto el index.html ya no se usa en el
  // día a día). Gestión de usuarios/permisos: pide la config COMPLETA admin-gated
  // (`api/usuarios` action:config), la edita en copia local (toggle padre/sub en
  // lib/usuarios/core) y la guarda validada (≥1 admin, nombre+pass, sin repetidos) con
  // payload byte-fiel al legacy. Escribe `cfg:usuarios` (la config de AUTH de toda la
  // app). Rollback: mover esta línea a SOMBRAS. Pendiente admin: editar 1 permiso y
  // confirmar que el usuario ve el cambio.
  usuarios: Usuarios,
  // El flip de Ubicaciones (18-jul-2026, solo BDI): `/ubicaciones` lo sirve el shell.
  // Carga masiva de la ubicación física (NN-N) por producto → observación de GN en
  // TODAS sus variantes (endpoint `/api/observaciones`, byte-fiel, vía apiFetch). Es
  // metadata INTERNA de depósito (no stock/plata, reversible re-editando) → flip
  // directo como gen-talles. Lo tipeado se persiste en localStorage
  // (`monitor_ubi_pend_<marca>`, MISMA clave del iframe → sin migración). "Reparar"
  // empareja las variantes desparejas con su NN-N dominante; "Traer de GN" dispara el
  // sync. Rollback: mover esta línea a SOMBRAS. Pendiente Bruno: 1 escritura real.
  ubicaciones: Ubicaciones,
  // El flip de los 4 conteos (18-jul-2026, cierre Tanda D): `/conteo-deposito`,
  // `/conteo-estandar-zattia`, `/conteo-estandar-stunned` y `/conteo` los sirve el
  // shell. Generan un Excel de ajuste que el operador sube a mano a GN (NO escriben
  // stock por API). Se flipearon tras la PARIDAD DE FLUJO COMPLETO (tests/conteo-flujo):
  // el flujo Next entero (agrupar→abrir→contar/escanear→terminar→ajuste→Excel) da un
  // Excel byte-idéntico al del legacy extraído en vivo de index.html — el riesgo era
  // la fidelidad del Excel y quedó cubierto sin conteo físico. Rollback: mover estas
  // líneas de vuelta a SOMBRAS.
  'conteo-deposito': ConteoDeposito,
  'conteo-estandar-zattia': ConteoEstandar,
  'conteo-estandar-stunned': ConteoEstandar,
  conteo: Conteo,
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
  // El flip de Chequeo de exhibición (18-jul-2026, Tanda C, bajo riesgo): `/exhib` lo
  // sirve el shell. Recorrer el Local con el lector físico confirmando que cada variante
  // con stock está colgada; triage de faltantes + PDF + registro de "categorías a
  // corregir en TN" (se corrigen a mano, con link al admin). Read-only sobre Supabase/TN;
  // solo escribe localStorage (MISMAS claves del iframe → sin migración). NO toca stock
  // ni GN. La cámara ZXing del legacy era código muerto (sin <video> ni llamador) → se
  // portó el flujo de lector físico. Lógica pura con paridad (buscar/limpiarCats/agrupar).
  // Rollback: mover esta línea a SOMBRAS.
  exhib: Exhib,
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
// Vacío: todas las secciones migradas ya están flipeadas. La ruta sombra `/<key>/next`
// sigue disponible para la próxima migración (inicio/usuarios, si se hacen algún día).
export const SOMBRAS: Record<string, ComponentType> = {}

/** ¿Esta sección la sirve el shell? Si no, va al iframe. */
export function componenteDe(key: string): ComponentType | null {
  return SECCIONES[key] ?? null
}

/** El componente de la ruta sombra `/<key>/next`, si existe. */
export function componenteSombraDe(key: string): ComponentType | null {
  return SOMBRAS[key] ?? null
}
