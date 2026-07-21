import { NAV_CATS, PERM_CAT, type Marca, type NavCat, type PermCat } from './nav.generated'

export { NAV_CATS, PERM_CAT }
export type { Marca, NavCat, PermCat }

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
 * Labels de las keys que NO están en PERM_CAT (`inicio`, `usuarios`) — CON emoji,
 * para el sidebar. Fuente única: antes vivían inline en Sidebar.tsx.
 */
export const LABELS_EXTRA: Record<string, string> = {
  inicio: '🏠 Inicio',
  usuarios: '👤 Usuarios',
}

/** El label CON emoji (para el sidebar): LABELS_EXTRA o el de PERM_CAT, o la key. */
export function labelConEmoji(key: string): string {
  return LABELS_EXTRA[key] ?? labelDe(key)
}

// Emoji(s) inicial(es) + espacio. `Extended_Pictographic` NO incluye dígitos ASCII,
// así que no toca títulos que empiecen con número/letra. Cubre variation selector
// (️), ZWJ (‍) y modificadores de tono de piel.
const RE_EMOJI_INICIAL = /^(\p{Extended_Pictographic}[\p{Extended_Pictographic}️‍\u{1F3FB}-\u{1F3FF}]*\s*)+/u

/** El título SIN el emoji inicial (para el `<h1>` del encabezado). */
export function tituloLimpio(key: string): string {
  const raw = labelConEmoji(key)
  return raw.replace(RE_EMOJI_INICIAL, '').trim() || raw
}

const CAT_POR_KEY = new Map<string, NavCat>()
NAV_CATS.forEach((c) => c.keys.forEach((k) => CAT_POR_KEY.set(k, c)))

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
  'sesion-fotos': 'Pedí productos para la sesión de fotos y controlá su retiro y devolución.',
  tncat: 'Herramientas de TiendaNube: categorías por stock, carga de imágenes y más.',
  'gen-talles': 'Generador de tablas de talles para las descripciones de TiendaNube.',
  disenos: 'Tablero para elegir diseños con el equipo: votación, opiniones y PDF.',
  etiquetas: 'Impresión de etiquetas con código de barras: depósito, local, promo y SKU.',
  cupones: 'Descuentos por cliente para el local (no toca la tienda online).',
  'solicitudes-internas': 'Retiros de uso interno (muestras, video, consumo) con aprobación.',
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
  'meta-ads': 'Gasto y rendimiento de Meta Ads (Facebook/Instagram) por cuenta publicitaria.',
  gerencial: 'Lo que requiere una decisión hoy, de todas tus marcas, con la acción recomendada.',
}

export function descripcionDe(key: string): string | undefined {
  return DESCRIPCIONES[key]
}
