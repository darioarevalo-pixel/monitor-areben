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
const MktVentas = dynamic(() => import('@/components/mkt-ventas/MktVentas').then((m) => m.MktVentas), { loading: Cargando })
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
const Solicitudes = dynamic(() => import('@/components/solicitudes/Solicitudes').then((m) => m.Solicitudes), { loading: Cargando })
const GenTalles = dynamic(() => import('@/components/gen-talles/GenTalles').then((m) => m.GenTalles), { loading: Cargando })
const GenDesc = dynamic(() => import('@/components/gen-desc/GenDesc').then((m) => m.GenDesc), { loading: Cargando })
const Atencion = dynamic(() => import('@/components/atencion/Atencion').then((m) => m.Atencion), { loading: Cargando })
const Agenda = dynamic(() => import('@/components/agenda/Agenda').then((m) => m.Agenda), { loading: Cargando })
const Novedades = dynamic(() => import('@/components/novedades/Novedades').then((m) => m.Novedades), { loading: Cargando })
const Manuales = dynamic(() => import('@/components/manuales/Manuales').then((m) => m.Manuales), { loading: Cargando })
const Organizacion = dynamic(() => import('@/components/organizacion/Organizacion').then((m) => m.Organizacion), { loading: Cargando })
const Cupones = dynamic(() => import('@/components/cupones/Cupones').then((m) => m.Cupones), { loading: Cargando })
const Etiquetas = dynamic(() => import('@/components/etiquetas/Etiquetas').then((m) => m.Etiquetas), { loading: Cargando })
const Envios = dynamic(() => import('@/components/envios/Envios').then((m) => m.Envios), { loading: Cargando })
const Buzon = dynamic(() => import('@/components/buzon/Buzon').then((m) => m.Buzon), { loading: Cargando })
const PedidosClientes = dynamic(() => import('@/components/pedidos-clientes/PedidosClientes').then((m) => m.PedidosClientes), { loading: Cargando })
const Recepciones = dynamic(() => import('@/components/recepciones/Recepciones').then((m) => m.Recepciones), { loading: Cargando })
const Recorridas = dynamic(() => import('@/components/recorridas/Recorridas').then((m) => m.Recorridas), { loading: Cargando })
const PRM = dynamic(() => import('@/components/prm/PRM').then((m) => m.PRM), { loading: Cargando })
const Insumos = dynamic(() => import('@/components/insumos/Insumos').then((m) => m.Insumos), { loading: Cargando })
const Comisiones = dynamic(() => import('@/components/comisiones/Comisiones').then((m) => m.Comisiones), { loading: Cargando })
const ConteoDeposito = dynamic(() => import('@/components/conteo-deposito/ConteoDeposito').then((m) => m.ConteoDeposito), { loading: Cargando })
const ConteoEstandar = dynamic(() => import('@/components/conteo-estandar/ConteoEstandar').then((m) => m.ConteoEstandar), { loading: Cargando })
const ConteoLocalBdi = dynamic(() => import('@/components/conteo-local-bdi/ConteoLocalBdi').then((m) => m.ConteoLocalBdi), { loading: Cargando })
const Reposicion = dynamic(() => import('@/components/reposicion/Reposicion').then((m) => m.Reposicion), { loading: Cargando })
const VerifVentas = dynamic(() => import('@/components/verif-ventas/VerifVentas').then((m) => m.VerifVentas), { loading: Cargando })
const Disenos = dynamic(() => import('@/components/disenos/Disenos').then((m) => m.Disenos), { loading: Cargando })
const Exhib = dynamic(() => import('@/components/exhib/Exhib').then((m) => m.Exhib), { loading: Cargando })
const Usuarios = dynamic(() => import('@/components/usuarios/Usuarios').then((m) => m.Usuarios), { loading: Cargando })
const MetaAds = dynamic(() => import('@/components/meta-ads/MetaAds').then((m) => m.MetaAds), { loading: Cargando })
const Gerencial = dynamic(() => import('@/components/gerencial/Gerencial').then((m) => m.Gerencial), { loading: Cargando })
// `MemoSemanal` y no `Memo`: `Memo` a secas se confunde con `React.memo` de un vistazo, y este
// archivo es una lista de nombres leídos en diagonal.
const MemoSemanal = dynamic(() => import('@/components/memo/Memo').then((m) => m.Memo), { loading: Cargando })
const Norte = dynamic(() => import('@/components/norte/Norte').then((m) => m.Norte), { loading: Cargando })
const Integraciones = dynamic(() => import('@/components/integraciones/Integraciones').then((m) => m.Integraciones), { loading: Cargando })
const Postventa = dynamic(() => import('@/components/postventa/Postventa').then((m) => m.Postventa), { loading: Cargando })
const PostventaLocal = dynamic(() => import('@/components/postventa/Postventa').then((m) => m.PostventaLocal), { loading: Cargando })
const PostventaDeposito = dynamic(() => import('@/components/postventa/Postventa').then((m) => m.PostventaDeposito), { loading: Cargando })
const CambiosLocal = dynamic(() => import('@/components/reclamos/ArmarCambio').then((m) => m.ArmarCambioLocal), { loading: Cargando })
const ReclamosLocal = dynamic(() => import('@/components/reclamos/Reclamos').then((m) => m.ReclamosLocal), { loading: Cargando })
const Retornos = dynamic(() => import('@/components/retornos/Retornos').then((m) => m.Retornos), { loading: Cargando })
const Canjes = dynamic(() => import('@/components/canjes/Canjes').then((m) => m.Canjes), { loading: Cargando })
const Calendario = dynamic(() => import('@/components/calendario/Calendario').then((m) => m.Calendario), { loading: Cargando })
const Liquidacion = dynamic(() => import('@/components/liquidacion/Liquidacion').then((m) => m.Liquidacion), { loading: Cargando })

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
  // El objetivo del sector y el contador diario de ventas online. Es sección propia y no un
  // bloque arriba de `marketing` porque aquélla es la auditoría de fichas de TiendaNube y sus
  // cinco KPI son filtros de su tabla: un objetivo de venta ahí sería un sexto número que no filtra.
  'mkt-ventas': MktVentas,
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
  // TODAS sus variantes (endpoint `/api/deposito?recurso=observaciones`, byte-fiel, vía apiFetch). Es
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
  conteo: ConteoLocalBdi,
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
  // Recorridas y PRM (30-ago-2026): las dos caras del proveedor, y son DOS secciones porque son dos
  // preguntas. `recorridas` (área Compras) es el HACER —el padrón de locales, el viaje y lo que se
  // anota parado en la galería, desde el celular—; `prm` (área Proveedores, al lado de la de arriba)
  // es el SABER —la ficha, los compromisos abiertos, si entrega lo que le pedimos y cómo vendió—.
  // ⛔ Comparten `lib/prm/` y el handler `api/_prm.js`: ninguna regla vive dos veces.
  recorridas: Recorridas,
  prm: PRM,
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
  // Solicitudes (21-jul-2026, sección NUEVA Next-only): vista unificada READ-ONLY del
  // estado de Sesión de fotos + Solicitudes internas (lee los dos KV, no migra),
  // filtrada por la función del usuario. El detalle/gestión sigue en cada sección.
  solicitudes: Solicitudes,
  // El flip de Tabla de talles (18-jul-2026, Tanda B #2): `/gen-talles` lo sirve el
  // shell. Generador de tablas (HTML byte-idéntico al legacy, paridad ejecutable) +
  // vincular a un producto de TN + guardar en el KV (kind `talles`, misma clave del
  // iframe → sin migración de datos, merge por-clave con `cargado`) + cargar en la
  // descripción de TN (payload byte-idéntico, endpoint intacto) + lista de pendientes
  // (Zattia). Rollback: mover esta línea de vuelta a SOMBRAS.
  'gen-talles': GenTalles,
  'gen-desc': GenDesc,
  // El flip de Cupones (18-jul-2026, Tanda B #3): `/cupones` lo sirve el shell.
  // CRUD de descuentos por cliente para el local (KV kind `cupones`, misma clave del
  // iframe → sin migración de datos; merge por-cupón con `cargado`). Gate de creación
  // por `cupones.crear`; borrar solo admin. No toca la tienda online. Rollback: mover
  // esta línea de vuelta a SOMBRAS.
  atencion: Atencion,
  // Novedades del sistema. La ve todo el equipo (KEYS_SIN_PERMISO); publicar es un sub-permiso.
  // No tiene marca: lee y escribe siempre en la base de BDI, vía `?recurso=sistema`.
  novedades: Novedades,
  // Los manuales. Mismo endpoint que las novedades (`?recurso=sistema`), misma base, sin marca.
  manuales: Manuales,
  // "Organización": de quién es cada cosa, sin fecha. Misma forma que Manuales y la Agenda —sin
  // marca, base de BDI, la ve todo el equipo, `editar` es un sub-permiso— pero por su propia
  // puerta, `?recurso=organizacion`. Es la contracara de la Agenda: aquélla contesta "¿qué me toca
  // hoy?" y ésta "¿de quién es esto?".
  organizacion: Organizacion,
  // La agenda operativa: qué corre HOY. Misma forma que las dos de arriba —la ve todo el equipo,
  // cargar es un sub-permiso, sin marca, base de BDI— pero por su propia puerta, `?recurso=agenda`.
  agenda: Agenda,
  cupones: Cupones,
  // El flip de Etiquetas (18-jul-2026, Tanda B #4): `/etiquetas` lo sirve el shell.
  // Impresión de etiquetas con código de barras (Code 128): depósito/local/promo/SKU
  // + etiqueta libre + formas de pago. Solo escribe localStorage (cantidades/config
  // por cuenta, MISMAS claves del iframe → sin migración); imprime PDFs locales (no
  // toca datos). PDF ported byte-fiel; JsBarcode como dep npm. Precios de TN (Zattia
  // mergea zattia+stunned). Rollback: mover esta línea de vuelta a SOMBRAS.
  etiquetas: Etiquetas,
  // Envíos del día (13-ago-2026, sección NUEVA — no existe en el legacy): la hoja del cadete, que
  // hasta hoy era una planilla de Google escrita a mano donde 3 de cada 10 filas no eran un envío.
  // Es la única sección del Local **sin selector de marca**: el cadete sale con paquetes de las dos
  // en la misma mochila. Cada envío sí guarda la suya, y para los de TN sale sola.
  envios: Envios,
  buzon: Buzon,
  // Faltantes. Es de **Compras** —ahí se decide qué traer— aunque lo que la llena salga del
  // mostrador: el alta vive adentro de `atencion`, ver `api/_pedidos-clientes.js`.
  'pedidos-clientes': PedidosClientes,
  // "Lo que entró": las OC que el sistema de Ingresos confirma como recibidas. ⛔ No es `ingresos`,
  // que es la importación que VIENE (proyectada, sólo BDI, en el KV de bdi-catalogo). Ésta es la
  // que LLEGÓ, para las dos marcas, y la escribe un webhook — la pantalla sólo lee.
  recepciones: Recepciones,
  // Insumos: lo que la empresa consume y no vende —bolsas, rollos, yerba—, con su stock por lugar y
  // el aviso del anteúltimo. ⛔ No es stock de mercadería: un insumo no existe en Gestión Nube, así
  // que ni el espejo ni el motor de conteos (que exige `inventory_id`) sirven acá.
  insumos: Insumos,
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
  // Meta Ads (19-jul-2026, sección NUEVA — no existe en el legacy): `/meta-ads` lo sirve
  // el shell. Read-only sobre la API de Marketing de Meta vía `/api/meta-ads` (token de
  // system user en env, scope ads_read). Descubre las cuentas con /me/adaccounts y muestra
  // gasto/rendimiento por cuenta. No toca stock, GN ni localStorage. Gateada por permiso
  // `meta-ads` (ambas marcas).
  'meta-ads': MetaAds,
  // Gerencial (20-jul-2026, sección NUEVA — no existe en el legacy): `/gerencial` lo sirve
  // el shell. Panel de decisiones: agrega de todas las marcas visibles las señales que otras
  // secciones ya calculan (capital parado y declive del ETL, fotos/aprobaciones/sync del KV,
  // importaciones por llegar) como accionables priorizados por severidad, cada uno con su
  // recomendación y un link a la sección donde se ejecuta. Read-only (fase 1): NO escribe
  // stock, GN, Meta ni KV; el ETL por marca sale del MISMO caché del store (o la red si no hay).
  // Gateada por permiso `gerencial` (ambas marcas). Rollback: comentar esta línea.
  gerencial: Gerencial,
  // Memo semanal (15-ago-2026, sección NUEVA — no existe en el legacy): `/memo` lo sirve el shell.
  // La otra mitad de Gerencial: aquél dice qué decidir ahora, éste dice qué pasó esta semana. Lee
  // la venta por rango de las DOS bases (`venta_detalles`, que es la única con plata) y la pauta de
  // `meta_ads_snapshot_dia`; escribe SOLO sus dos tablas propias (`memo_semana`, `memo_campo`) en la
  // base de BDI. No toca stock, GN ni Meta. Gateada por permiso `memo` (ambas marcas) para leer y
  // por admin para escribir. Rollback: comentar esta línea.
  memo: MemoSemanal,
  // Norte (17-ago-2026, sección NUEVA): el tercer tiempo de Dirección — Gerencial dice qué decidir
  // hoy, el memo qué pasó, Norte si llegamos. LEE el payload del ETL (ventas y detalles, para el
  // ritmo de salida) y el KV de `ingresos` de bdi-catalogo (las importaciones que vienen).
  // ESCRIBE sólo sus dos tablas propias, `compras_condiciones` y `norte_metas`, por
  // `api/datos?recurso=norte`. ⛔ NO toca `ingresos`: las unidades, los modelos y la fecha de
  // llegada siguen siendo de esa sección y duplicarlas daría dos verdades. Gateada por el permiso
  // `norte` (ambas marcas) para leer; escribir es de admin, como el techo de rentabilidad.
  // Rollback: sacar la key de acá y del nav — las tablas quedan y no las lee nadie más.
  norte: Norte,
  // Integraciones (22-jul-2026, sección NUEVA — no existe en el legacy): `/integraciones` lo sirve
  // el shell. Fase 0 del sync de Stunned: mapeo de SKU GN↔TN (tabla sku_map en la base de Zattia).
  // Escribe SOLO sku_map (correspondencias), NO stock ni ventas. Gateada por permiso `integraciones`
  // (solo Zattia por ahora). Rollback: comentar esta línea.
  integraciones: Integraciones,
  // Post-venta (22-jul-2026, sección NUEVA — no existe en el legacy): `/postventa` lo sirve el shell.
  // Fase 4 v1: depósito de FALLAS (tabla fallas_deposito, ledger valorizado por marca). NO toca stock
  // oficial ni GN/TN. Gateada por permiso `postventa` (ambas marcas). Rollback: comentar esta línea.
  postventa: Postventa,
  // Post-venta (carga Local): mismo componente motor en modo 'local' (solo carga + vista). El motor
  // completo es la key `postventa` (Administración). Gateada por permiso `postventa-local`.
  'postventa-local': PostventaLocal,
  // Post-venta (carga Depósito): mismo motor en modo 'deposito' (descuenta de depósito). Gateada por `postventa-deposito`.
  'postventa-deposito': PostventaDeposito,
  // Cambios: el POS de mostrador. **No hay un "motor de Administración" detrás** — un cambio no es
  // una decisión que alguien tenga que autorizar, así que el Local lo resuelve de punta a punta,
  // incluida la venta en GN. Escribe sobre `devoluciones`: un cambio ES un reclamo, con el mismo
  // número `R-00XX` y la misma lista. Gateada por el permiso `cambios-local`.
  'cambios-local': CambiosLocal,
  // Reclamos (inicio Local): abre el reclamo por cualquier motivo y copia el link para que el
  // cliente suba las fotos. Decidir y devolver la plata es de Administración (pestaña Reclamos).
  'reclamos-local': ReclamosLocal,
  // Retornos (25-ago-2026, sección NUEVA): la bandeja de lo que estamos esperando que vuelva. Lee
  // `devoluciones` por la puerta angosta `vista=retornos` (columnas mínimas) y sólo puede hacer los
  // dos gestos físicos: recibir y reingresar. La ven Depósito y Local. ⛔ No confundir con Envíos,
  // que es lo que SALE. Rollback: comentar esta línea y sacar la key del nav.
  retornos: Retornos,
  // Canjes con influencers (Marketing). ⚠️ Es la única sección que lee y escribe SIEMPRE en la base
  // de BDI, para las tres marcas: el padrón de personas es único y compartido, porque "¿hace cuánto
  // no hacemos una acción con ella?" tiene que tener UNA respuesta. Ver `sql/migrate-canjes.sql`.
  canjes: Canjes,
  // Calendario editorial (Marketing). Es la mitad "cuándo lo necesitás" del problema que
  // `/meta-ads/etapas` mira por el otro lado ("qué falta"): cada fecha muestra qué etapas tienen
  // ideas anotadas y cuáles no, que es lo que convierte una fecha en un pedido concreto.
  calendario: Calendario,
  // Liquidación (Análisis). El cajón donde vive una campaña de sale de punta a punta: los productos
  // entran desde "Por producto", el precio se decide adentro con el simulador de margen al lado, y
  // queda guardado en la base. Hasta ahora la selección vivía en un `useState` que se perdía al
  // recargar y la lista de precios, en el `localStorage` de una sola persona.
  liquidacion: Liquidacion,
}

/**
 * ¿Qué componente sirve esta sección? `null` si la key no está registrada.
 *
 * Hasta jul-2026 un `null` significaba "esta sección todavía la sirve el iframe
 * legacy", y existía además un registro `SOMBRAS` con la ruta `/<key>/next` para
 * abrir la versión Next al lado de la vieja y compararlas. Las dos cosas murieron
 * con el legacy (Fase 0 de la reestructura): ya no hay contra qué comparar, y un
 * `null` hoy solo puede ser una key mal escrita.
 */
export function componenteDe(key: string): ComponentType | null {
  return SECCIONES[key] ?? null
}
