import { NAV_CATS, PERM_CAT, type Marca, type NavCat, type NavGrupo, type NavItem, type PermCat } from './nav.datos'
import { esAdmin, tieneFuncion, type Funcion, type Perfil } from './permisos'

export { NAV_CATS, PERM_CAT }
export type { Marca, NavCat, NavGrupo, NavItem, PermCat }

/**
 * Todas las keys de un grupo del menú: las sueltas, las de sus entradas directas y las de sus
 * subgrupos. Usarla siempre en vez de `cat.keys` a secas — si no, una sección que vive en un
 * subgrupo (ej. `Local > Actividades`) o que es un módulo de entradas sin keys sueltas (Meta)
 * queda invisible para el sidebar, el eyebrow y los tests.
 */
export function keysDeCat(cat: NavCat): string[] {
  const propias = (cat.items ?? []).map((it) => it.key)
  if (!cat.grupos?.length) return propias.length ? [...new Set([...cat.keys, ...propias])] : cat.keys
  const deGrupos = cat.grupos.flatMap((g) => [...g.keys, ...(g.items ?? []).map((it) => it.key)])
  return [...new Set([...cat.keys, ...propias, ...deGrupos])]
}

/**
 * Todas las entradas de subárea de una categoría: las suyas y las de sus subgrupos.
 *
 * Existe para que los tests y el sidebar no tengan que acordarse de mirar los dos niveles. Cuando
 * `NavCat.items` apareció, las dos redes que recorren entradas (que el destino sea una sección
 * real, que cada una tenga ícono) miraban sólo `grupos[].items` y **habrían dejado a Meta sin
 * cubrir en silencio**, que es exactamente lo que esos tests existen para impedir.
 */
export function itemsDeCat(cat: NavCat): NavItem[] {
  return [...(cat.items ?? []), ...(cat.grupos ?? []).flatMap((g) => g.items ?? [])]
}

/**
 * El interruptor del strangler NO vive acá: vive en components/secciones/registro.ts,
 * donde estar en el registro ES estar migrada.
 *
 * Antes había un `SECCIONES_MIGRADAS` en este archivo, aparte del componente. Eran
 * dos lugares para acordarse, y la falla era muda: agregás el componente, te
 * olvidás del Set, y la sección migrada no se ve nunca sin un solo error. Una sola
 * fuente de verdad.
 *
 * Este archivo se queda con datos puros (nav, permisos, keys) y sin React, así lo
 * pueden importar los tests del dominio.
 */

/**
 * Keys que el nav y el router aceptan **sin que PERM_CAT tenga que listarlas**.
 *
 * 🔴 **Esto NO es "lo ve todo el mundo", aunque el nombre lo sugiera y aunque este comentario lo
 * afirmó durante meses.** Lo consumen `esDeMarca`, `esKeyValida` y `todasLasKeys`, que contestan
 * *"¿esta ruta existe y vale para esta marca?"*. Quién entra lo decide `puedeVer`, que **nunca miró
 * este set**: por eso Novedades, Manuales y la Agenda estuvieron invisibles para todo el que no
 * fuera admin, con el comentario diciendo lo contrario. La puerta abierta de verdad es
 * **`KEYS_PARA_TODOS`, en `lib/permisos.core.js`**, que sí la lee la decisión.
 *
 * 'usuarios' es el único que necesita estar acá de verdad: vive en NAV_CATS (adminOnly) y no en
 * PERM_CAT. Los otros cinco están también en PERM_CAT, así que su presencia acá casi no cambia nada
 * — y eso es justamente lo que escondió que el set no gobernaba ningún acceso.
 *
 * `tests/nav-estructura.test.ts` exige que el set tenga exactamente estas keys: sumar una más
 * rompe, y eso es lo que obliga a pensarla.
 */
export const KEYS_SIN_PERMISO = new Set(['usuarios', 'inicio', 'resumen', 'novedades', 'manuales', 'agenda'])

/**
 * Secciones cuyo eje **no es la marca del sidebar**.
 *
 * Meta Ads es la primera: BDI y Zattia se pautean desde la misma cuenta publicitaria y Stunned —que
 * ni siquiera es una `Marca` del monitor— tiene la suya, así que adentro de la sección la marca de
 * arriba no decide nada; el eje propio es cuenta × línea de pauta.
 *
 * 🔑 **Sin esto, quien tiene Meta Ads en una sola marca rebota a Inicio por estar parado en la
 * otra** — y adentro no había nada que dependiera de esa marca, así que el rebote era puro daño
 * colateral del eje viejo. Acá se pregunta si tiene la sección en ALGUNA marca; el corte fino lo
 * sigue haciendo el servidor, línea por línea (`marcasConAcceso` en `api/meta-ads.js`).
 *
 * ⚠️ No es una puerta de atrás: una key acá adentro igual tiene que estar en `PERM_CAT` y tener más
 * de una marca, y `tests/nav-cross-marca.test.ts` lo amarra.
 */
export const KEYS_CROSS_MARCA = new Set(['meta-ads'])

const PERM_POR_KEY = new Map<string, PermCat>(PERM_CAT.map((p) => [p.key, p]))

export function permDe(key: string): PermCat | undefined {
  return PERM_POR_KEY.get(key)
}

export function labelDe(key: string): string {
  return PERM_POR_KEY.get(key)?.label ?? key
}

/** Una sección existe para una marca si PERM_CAT la lista en `brands`. */
export function esDeMarca(key: string, marca: Marca): boolean {
  if (KEYS_SIN_PERMISO.has(key)) return true
  const p = PERM_POR_KEY.get(key)
  return !p ? false : p.brands.includes(marca)
}

/**
 * Conteo estándar: `conteo-estandar-zattia` y `conteo-estandar-stunned` son DOS
 * entradas de nav que apuntan a UNA sola sección del legacy (switchTab, index.html:6540).
 * La línea viaja como parte de la key y el legacy la resuelve con ceInit(linea).
 */
export const KEYS_CONTEO_ESTANDAR = ['conteo-estandar-zattia', 'conteo-estandar-stunned'] as const

export function esKeyValida(key: string): boolean {
  return PERM_POR_KEY.has(key) || KEYS_SIN_PERMISO.has(key)
}

/** Todas las keys que el router debe aceptar. */
export function todasLasKeys(): string[] {
  return [...PERM_CAT.map((p) => p.key), ...KEYS_SIN_PERMISO]
}

// ── Metadata para el encabezado de sección (SeccionHeader) ──────────────────────

/**
 * Labels de las keys que NO están en PERM_CAT (`inicio`, `usuarios`).
 * Fuente única: antes vivían inline en Sidebar.tsx.
 */
export const LABELS_EXTRA: Record<string, string> = {
  inicio: 'Inicio',
  usuarios: 'Usuarios',
}

/** El label del menú: LABELS_EXTRA o el de PERM_CAT, o la key. */
export function labelDeMenu(key: string): string {
  return LABELS_EXTRA[key] ?? labelDe(key)
}

/**
 * El ícono de cada sección del menú (`components/ui/Icono.tsx`).
 *
 * Vive acá y no en `PERM_CAT` porque **no es un dato del permiso**: `PERM_CAT` define qué
 * puede ver cada uno, y meterle una decisión de presentación mezclaba dos cosas que se
 * tocan por motivos distintos. El grupo sí lo lleva en `NAV_CATS.icono`, que es la
 * estructura del menú y ahí sí corresponde.
 *
 * Varias keys comparten ícono a propósito: los cuatro conteos son el mismo trabajo en
 * distinto lugar, y las dos post-ventas y los dos cambios también. Repetirlo dice
 * "esto es lo mismo, en otro lado".
 */
const ICONO_POR_KEY: Record<string, string> = {
  inicio: 'inicio',
  agenda: 'agenda',
  novedades: 'novedades',
  manuales: 'manuales',
  gerencial: 'gerencial',
  // El memo lleva `historial` y no un ícono propio a propósito: lo que lo distingue de Gerencial
  // es justamente que tiene pasado. Gerencial es hoy; el memo es la serie de semanas.
  memo: 'historial',
  norte: 'norte',
  // Análisis
  productos: 'productos',
  variantes: 'variantes',
  'ventas-mensuales': 'ventas-mensuales',
  'verif-ventas': 'verif-ventas',
  margenes: 'margenes',
  comisiones: 'comisiones',
  liquidacion: 'liquidacion',
  colores: 'colores',
  talles: 'talles',
  // Local / Depósito
  solicitudes: 'solicitudes',
  atencion: 'clientes',
  cupones: 'cupones',
  'postventa-local': 'postventa',
  'postventa-deposito': 'postventa',
  postventa: 'postventa',
  'cambios-local': 'cambios',
  'reclamos-local': 'cambios',
  envios: 'envios',
  etiquetas: 'etiquetas',
  ubicaciones: 'ubicaciones',
  conteo: 'conteo',
  'conteo-deposito': 'conteo',
  'conteo-estandar-zattia': 'conteo',
  'conteo-estandar-stunned': 'conteo',
  exhib: 'exhib',
  // Marketing
  // La brújula, la misma de Norte: es la sección de «hacia dónde vamos» de Marketing. No se
  // pisan en ningún menú — quien ve Norte es de Dirección y no ve ésta, y al revés.
  'mkt-ventas': 'norte',
  marketing: 'marketing',
  calendario: 'calendario',
  canjes: 'canjes',
  'meta-ads': 'meta-ads',
  tncat: 'tienda-nube',
  'gen-talles': 'talles',
  integraciones: 'integraciones',
  // Administración / Compras
  reposicion: 'reposicion',
  caducados: 'caducados',
  'fundas-modelo': 'fundas-modelo',
  ingresos: 'ingresos',
  proveedores: 'proveedores',
  disenos: 'disenos',
  // Clientes / Config
  clientes: 'clientes',
  usuarios: 'usuarios',
}

export function iconoDe(key: string): string | undefined {
  return ICONO_POR_KEY[key]
}

/**
 * Emoji(s) inicial(es) + espacio.
 *
 * Los labels de `nav.datos.ts` llevaban un emoji adelante ("📊 Por producto") y esta
 * regex existía para que el `<h1>` no lo mostrara. En la tanda 11 los emojis salieron del
 * dato: el sidebar y el encabezado leen lo mismo. **La red se queda igual**: es una línea,
 * y evita que un emoji pegado sin querer en un label vuelva a aparecer en un título.
 * `Extended_Pictographic` NO incluye dígitos ASCII, así que no toca títulos que empiecen
 * con número/letra. Cubre variation selector (️), ZWJ (‍) y modificadores de tono de piel.
 */
const RE_EMOJI_INICIAL = /^(\p{Extended_Pictographic}[\p{Extended_Pictographic}️‍\u{1F3FB}-\u{1F3FF}]*\s*)+/u

/** El título de la sección para el `<h1>` del encabezado. */
export function tituloLimpio(key: string): string {
  const raw = labelDeMenu(key)
  return raw.replace(RE_EMOJI_INICIAL, '').trim() || raw
}

const CAT_POR_KEY = new Map<string, NavCat>()
NAV_CATS.forEach((c) => keysDeCat(c).forEach((k) => CAT_POR_KEY.set(k, c)))

/**
 * La categoría (grupo del nav) de una key, en MAYÚSCULAS y sin emoji, para el eyebrow.
 * `null` si la key no está en ningún grupo (ej. `resumen`) o si el eyebrow duplicaría
 * el título (ej. `inicio`, cuyo grupo también se llama "Inicio").
 */
export function categoriaDe(key: string): string | null {
  const c = CAT_POR_KEY.get(key)
  if (!c) return null
  const cat = c.label.replace(RE_EMOJI_INICIAL, '').trim().toUpperCase()
  if (!cat || cat.toLowerCase() === tituloLimpio(key).toLowerCase()) return null
  return cat
}

/**
 * ── Secciones que cuelgan de varios grupos ──
 *
 * `solicitudes` está en Local, Depósito, Marketing y Administración a propósito: cada
 * sector la llama a su manera ("Solicitudes a preparar", "Solicitudes de productos"…).
 * Pero `CAT_POR_KEY` es un Map que se llena recorriendo los grupos, así que la key se
 * queda con **el último** que la registró: entrabas desde Depósito y el encabezado decía
 * Administración, con el título canónico en vez del que habías tocado.
 *
 * Estas dos funciones toman el grupo de origen (viaja en la URL como `?g=`), y caen al
 * comportamiento de siempre si no viene o si la key no está en ese grupo.
 */
const CAT_POR_ID = new Map(NAV_CATS.map((c) => [c.id, c]))

/** Los ids de los grupos del menú donde vive una key. Vacío si no está en ninguno. */
export function categoriasDe(key: string): string[] {
  return NAV_CATS.filter((c) => keysDeCat(c).includes(key)).map((c) => c.id)
}

/** ¿Esta key cuelga de más de un grupo? (define si hace falta el `?g=` en el link). */
export function estaEnVariosGrupos(key: string): boolean {
  return categoriasDe(key).length > 1
}

/**
 * ── Quién ve CUÁL de las puertas repetidas ──
 *
 * `solicitudes` es la única de las 45 que cuelga de cuatro sectores, y el sidebar filtraba las
 * cuatro con la misma pregunta (`puedeVer(perfil, marca, 'solicitudes')`): no hay cuatro permisos,
 * hay **uno listado cuatro veces**, así que a alguien de Marketing le aparecían también Local,
 * Depósito y Administración. Las cuatro entradas no son copias: son cuatro **intenciones** (pedir /
 * preparar / ver todo), por eso no se colapsan a una sola para todos — se recorta sólo a quien
 * tiene una función de ese sector.
 *
 * Esto es **puro menú**: el permiso, el guard de ruta y el servidor no se tocan. Escribir
 * `/solicitudes?g=deposito` a mano sigue entrando igual, y nadie pierde acceso.
 *
 * Dos cosas que la hacen andar y no son obvias:
 * - **El mapa categoría → función es la identidad**: los `cat.id` de las cuatro (`local`,
 *   `deposito`, `marketing`, `administracion`) son textualmente los ids del tipo `Funcion`.
 * - **`mias` se filtra contra las categorías donde vive ESA key**, no contra todas las funciones
 *   del perfil: Dirección no tiene ninguna de las cuatro, así que cae en la rama de compatibilidad
 *   y ve las cuatro. Filtrando contra las funciones sueltas se quedaría sin ninguna.
 *
 * El `esAdmin` va antes y no es redundante: `tieneFuncion` no es implícita para los admins (es un
 * rol de flujo, ortogonal), así que un admin con la función `local` tildada quedaría recortado.
 */
export function sectorVisible(perfil: Perfil | null, key: string, catId: string): boolean {
  const donde = categoriasDe(key)
  if (donde.length < 2) return true // 44 de 45: no-op
  if (esAdmin(perfil)) return true // admin y Dirección navegan por intención
  const mias = donde.filter((c) => tieneFuncion(perfil, c as Funcion))
  if (!mias.length) return true // ninguna función aplica acá → ve todas (compatibilidad)
  return mias.includes(catId)
}

/**
 * El eyebrow, respetando de qué grupo se entró.
 *
 * A diferencia de `categoriaDe`, devuelve el nombre **en su caja natural** ("Marketing",
 * no "MARKETING"). El encabezado tenía tres capas de mayúsculas encimadas —el eyebrow,
 * los mini-títulos de las cards y las cabeceras de tabla— y la pantalla gritaba. Quedan
 * en versalitas solo las cabeceras de tabla, donde ayudan a la densidad.
 */
export function categoriaDesde(key: string, grupoId?: string | null): string | null {
  const porGrupo = (grupoId && CAT_POR_ID.get(grupoId)) || null
  const c = porGrupo && keysDeCat(porGrupo).includes(key) ? porGrupo : CAT_POR_KEY.get(key)
  if (!c) return null
  const cat = c.label.replace(RE_EMOJI_INICIAL, '').trim()
  if (!cat || cat.toLowerCase() === tituloDesde(key, grupoId).toLowerCase()) return null
  return cat
}

/** El título, con el nombre que le da ESE grupo si tiene uno propio. */
export function tituloDesde(key: string, grupoId?: string | null): string {
  const c = (grupoId && CAT_POR_ID.get(grupoId)) || null
  const propio = c && keysDeCat(c).includes(key) ? c.labels?.[key] : undefined
  if (!propio) return tituloLimpio(key)
  return propio.replace(RE_EMOJI_INICIAL, '').trim() || propio
}

/**
 * Descripción curada (1 línea) por sección, para el encabezado. Condensada del `info`
 * del nav. El test `seccion-header` obliga a que TODA sección registrada tenga una.
 */
export const DESCRIPCIONES: Record<string, string> = {
  inicio: 'Novedades del día: solicitudes de fotos pendientes de armar.',
  agenda: 'Qué corre hoy: las promociones bancarias vigentes, con sus condiciones y cómo se cobran.',
  novedades: 'Qué cambió en los sistemas, de lo más nuevo a lo más viejo.',
  manuales: 'Cómo se hace cada cosa: los procedimientos de trabajo, escritos.',
  usuarios: 'Usuarios del equipo y qué ve cada uno, por marca y por sección.',
  resumen: 'Panel principal con los KPIs del negocio.',
  productos: 'Ventas, vida útil y stock de cada producto, con selección de outlet.',
  variantes: 'Ventas y stock por variante (talle, modelo o color).',
  'ventas-mensuales': 'Evolución de ventas mes a mes, por categoría y canal.',
  margenes: 'Markup y margen de cada producto disponible, contra el objetivo.',
  comisiones: 'Margen neto real por forma de pago y canal, con simulador por producto.',
  colores: 'Ventas por color y análisis de agotamiento por variante.',
  talles: 'Análisis de ventas por talle y categoría.',
  proveedores: 'Comparativa de ventas y stock por proveedor.',
  caducados: 'Candidatos a depurar: sin stock y sin ventas hace más de N días.',
  'verif-ventas': 'Cruce de ventas anuladas en TiendaNube contra Gestión Nube.',
  'mkt-ventas': 'El objetivo de venta del sector y cuánto se vendió online cada día.',
  marketing: 'Auditoría de fotos y descripciones cruzada con stock y ventas.',
  canjes: 'Canjes con influencers: quién es cada una, hace cuánto no le proponemos algo, qué se le mandó y si publicó lo que prometió.',
  'sesion-fotos': 'Pedí productos para la sesión de fotos y controlá su retiro y devolución.',
  tncat: 'Herramientas de la tienda online, por área: fotos, categorías, visibilidad y descripciones.',
  'gen-talles': 'Generador de tablas de talles para las descripciones de TiendaNube.',
  disenos: 'Tablero para elegir diseños con el equipo: votación, opiniones y PDF.',
  envios: 'La hoja del cadete: los envíos que salen hoy, con la dirección, lo que hay que cobrar y la etiqueta para pegar.',
  etiquetas: 'Etiquetas de 5 × 2,5 cm con código de barras, y la cola de lo que hay que reetiquetar porque le cambió el precio.',
  atencion: 'Links y mensajes listos para copiar y pegar en Instagram y WhatsApp.',
  cupones: 'Descuentos por cliente y los canjes que se retiran en el local.',
  'solicitudes-internas': 'Retiros de uso interno (muestras, video, consumo) con aprobación.',
  solicitudes: 'Estado unificado de todas las solicitudes (fotos + internas), filtrado por tu función.',
  clientes: 'Clientes mayoristas: ranking, seguimiento y banco de mensajes.',
  'fundas-modelo': 'Ranking y demanda de fundas por modelo de iPhone, con simulador de pedido.',
  ingresos: 'Importaciones de fundas por llegar: diseños, cantidades, proveedor y estado.',
  ubicaciones: 'Ubicación física (NN-N) de cada producto en el Depósito Minorista.',
  reposicion: 'Reposición diaria del local: variantes bajo mínimo con stock en depósito.',
  exhib: 'Recorrido con lector para verificar qué está colgado en el local.',
  conteo: 'Conteo de fundas por escaneo, agrupado por modelo de celular. Cerrás un modelo y ajusta contra el stock vivo de GN.',
  'conteo-deposito': 'Conteo físico del depósito a mano, con ajuste de stock por diferencia.',
  'conteo-estandar-zattia': 'Conteo del local de Zattia: exhibido por escáner + depósito a mano.',
  'conteo-estandar-stunned': 'Conteo del local de Stunned (SKU STU): exhibido por escáner + depósito a mano.',
  'meta-ads': 'La pauta de Meta en once pantallas: qué hay que decidir, las campañas con sus acciones, la biblioteca de todos los avisos con su rendimiento, la carga de piezas nuevas, las automatizaciones que avisan solas, en qué etapa del embudo está cada una, las ideas de creativos, los números por cuenta, el registro de lo accionado junto con las decisiones tomadas a mano y su motivo, los informes —el análisis en prosa de cada fecha— y la rentabilidad: hasta cuánto se puede pagar por una compra, que es el umbral con el que se lee todo lo demás.',
  calendario: 'Las fechas comerciales y los hitos propios, con cuánto falta y qué etapas ya tienen ideas anotadas.',
  liquidacion: 'Campañas de sale: mandás los productos desde Por producto, les definís el precio uno por uno y queda guardado para todo el equipo.',
  gerencial: 'Lo que requiere una decisión hoy, de todas tus marcas, con la acción recomendada.',
  memo: 'Qué pasó esta semana: los números de lunes a domingo, el avance de cada sistema y el acta.',
  norte: 'Hacia dónde vamos: el stock que entra contra el que sale, los pagos que vienen y las metas.',
  integraciones: 'Mapeo de SKU entre Gestión Nube y Tienda Nube: la base del sync de stock y ventas.',
  postventa: 'Post-venta (motor): recibe y confirma fallas, descuenta stock en GN, etiqueta. Valorizado.',
  'postventa-local': 'Cargá las prendas con falla que recibís del cliente. El motor está en Administración.',
  'postventa-deposito': 'Cargá las fallas de la mercadería de depósito (descuenta del stock de depósito). El motor está en Administración.',
  'cambios-local': 'Armá un cambio de punta a punta: la diferencia, el cobro y la venta en GN. No hace falta que lo apruebe nadie.',
  'reclamos-local': 'Abrí un reclamo por cualquier motivo y pasale el link al cliente para que suba las fotos. La plata la devuelve Administración.',
}

export function descripcionDe(key: string): string | undefined {
  return DESCRIPCIONES[key]
}
