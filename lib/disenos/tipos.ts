/**
 * Tipos del tablero de Diseños: las fotos que se cargan, se puntúan y se eligen para producir.
 *
 * El tablero es **compartido** y vive en Postgres (tabla `disenos`, columna `datos jsonb`, dual
 * base). Hasta ago-2026 vivía en el `localStorage` de cada navegador; de esa época quedan dos
 * cosas que este archivo ya NO modela: los contadores `up`/`down` del voto de la mesa y la `nota`
 * de "Pros / contras". Se sacaron el 24-ago-2026 con el número delante: sobre los 37 diseños de
 * BDI había **0 pulgares arriba, 0 abajo y 0 notas**. Lo que sí se usa es la votación por link,
 * de 1 a 5 con nombre (`lib/disenos/votacion.core.js`), que tuvo 10 boletas en su primera ronda.
 *
 * ⛔ El resultado de esa votación **no vive acá**: es derivado, se calcula al leer desde
 * `disenos_votos` y **nunca se escribe en el documento del diseño**. Ver `docs/secciones/disenos.md`.
 */

export type EstadoDiseno = 'revisar' | 'confirmado' | 'duda' | 'rechazado'

/**
 * Un diseño del tablero. Cuatro campos y ninguno más: lo que se guarda es exactamente esto, y
 * `normalizarDiseno` (`./core`) lo hace cumplir al leer de la base. No es purismo — el efecto de
 * persistencia manda a la base **lo que cambió**, comparando el JSON contra lo último guardado,
 * así que un campo zombi que sobreviva a la lectura hace que el tablero entero, con las fotos
 * adentro, vuelva a la base en cada entrada a la sección. Ya pasó una vez.
 */
export type Diseno = {
  id: string
  /**
   * El nombre. ⚠️ Nace del **nombre del archivo** que se soltó (`Disenos.tsx`), así que hasta que
   * alguien lo escriba a mano NO es un nombre comercial: los 37 de BDI se llamaban `NUEVA (12)`.
   * Del otro lado de la cadena, Norte cruza este texto contra `productos.name` de Gestión Nube
   * para saber qué se vendió de cada importación — por eso el puente a Ingresos lo pide editado.
   */
  name: string
  /** URL pública del Blob. Los diseños viejos pueden traer una data URL (base64) embebida. */
  url: string
  estado: EstadoDiseno
  /**
   * A qué importaciones de Ingresos proyectados se mandó este diseño. Es un **array** porque
   * mandarlo a dos compras distintas es legítimo (una repetición de pedido) y un escalar perdería
   * la primera. Es comodidad de UI: la garantía de no duplicar la da el dedupe por `disenoId`
   * contra el KV, no esta marca (`lib/ingresos/puente.ts`).
   */
  enviados?: EnvioAIngreso[]
}

/** Un envío de este diseño a una importación, como hecho histórico. */
export type EnvioAIngreso = {
  ingresoId: string
  /**
   * El `desc` de la importación al momento de mandar. Denormalizado a propósito: lo que esto dice
   * es "se mandó a X el 24-ago", no cómo se llama X hoy.
   */
  ingresoDesc: string
  bloqueId: string
  columnaId: string
  /** ISO. */
  fecha: string
  por: string
}

/**
 * El orden de la grilla. `puntaje` es el default: con una ronda votada, el orden que importa es el
 * que salió de votar. Los tres órdenes viejos (`tildes`/`cruces`/`saldo`) se fueron con los 👍/👎.
 */
export type OrdenDiseno = 'puntaje' | 'carga' | 'nombre'

/** Los cuatro estados, en el orden en que se leen, con sus colores. */
export const DB_ESTADOS: { k: EstadoDiseno; lbl: string; ico: string; color: string; bg: string; rgb: [number, number, number] }[] = [
  { k: 'revisar', lbl: 'Por revisar', ico: '🕓', color: '#6B7280', bg: '#F9FAFB', rgb: [107, 114, 128] },
  { k: 'confirmado', lbl: 'Confirmados', ico: '✅', color: '#16A34A', bg: '#F0FDF4', rgb: [22, 163, 74] },
  { k: 'duda', lbl: 'En duda', ico: '🤔', color: '#D97706', bg: '#FFFBEB', rgb: [217, 119, 6] },
  { k: 'rechazado', lbl: 'Rechazados', ico: '❌', color: '#DC2626', bg: '#FEF2F2', rgb: [220, 38, 38] },
]

/** Los cuatro estados como lista de claves, para validar lo que vuelve de la base. */
export const ESTADOS_VALIDOS: EstadoDiseno[] = DB_ESTADOS.map((e) => e.k)
