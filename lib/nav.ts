import { NAV_CATS, PERM_CAT, type Marca, type NavCat, type NavGrupo, type NavItem, type PermCat } from './nav.datos'

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

/** 'usuarios' es caso especial: vive en NAV_CATS (adminOnly) pero no en PERM_CAT. */
export const KEYS_SIN_PERMISO = new Set(['usuarios', 'inicio', 'resumen'])

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
  gerencial: 'gerencial',
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
  etiquetas: 'etiquetas',
  ubicaciones: 'ubicaciones',
  conteo: 'conteo',
  'conteo-deposito': 'conteo',
  'conteo-estandar-zattia': 'conteo',
  'conteo-estandar-stunned': 'conteo',
  exhib: 'exhib',
  // Marketing
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

/** ¿Esta key cuelga de más de un grupo? (define si hace falta el `?g=` en el link). */
export function estaEnVariosGrupos(key: string): boolean {
  return NAV_CATS.filter((c) => keysDeCat(c).includes(key)).length > 1
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
  marketing: 'Auditoría de fotos y descripciones cruzada con stock y ventas.',
  canjes: 'Canjes con influencers: quién es cada una, hace cuánto no le proponemos algo, qué se le mandó y si publicó lo que prometió.',
  'sesion-fotos': 'Pedí productos para la sesión de fotos y controlá su retiro y devolución.',
  tncat: 'Herramientas de la tienda online, por área: fotos, categorías, visibilidad y descripciones.',
  'gen-talles': 'Generador de tablas de talles para las descripciones de TiendaNube.',
  disenos: 'Tablero para elegir diseños con el equipo: votación, opiniones y PDF.',
  etiquetas: 'Impresión de etiquetas con código de barras: depósito, local, promo y SKU.',
  atencion: 'Links y mensajes listos para copiar y pegar en Instagram y WhatsApp.',
  cupones: 'Descuentos por cliente para el local (no toca la tienda online).',
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
  'meta-ads': 'La pauta de Meta en ocho pantallas: qué hay que decidir, las campañas con sus acciones, la biblioteca de todos los avisos con su rendimiento, las automatizaciones que avisan solas, en qué etapa del embudo está cada una, las ideas de creativos, los números por cuenta y el registro de lo accionado.',
  calendario: 'Las fechas comerciales y los hitos propios, con cuánto falta y qué etapas ya tienen ideas anotadas.',
  liquidacion: 'Campañas de sale: mandás los productos desde Por producto, les definís el precio uno por uno y queda guardado para todo el equipo.',
  gerencial: 'Lo que requiere una decisión hoy, de todas tus marcas, con la acción recomendada.',
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
