/**
 * La semana del Friday memo: **lunes a domingo, en hora de Buenos Aires**.
 *
 * # Por qué la aritmética es sobre strings `YYYY-MM-DD` y no sobre `Date`
 *
 * El memo se escribe en un navegador argentino y se guarda en un servidor que corre en UTC. Si el
 * lunes de la semana se calculara con `new Date()` local, el servidor y la pantalla podrían estar
 * en semanas distintas durante tres horas por día — y el síntoma sería el peor posible: el campo
 * que se escribe a las 22 h de un domingo aparecería en el memo de la semana siguiente, sin error
 * y sin aviso.
 *
 * Por eso hay una sola puerta al reloj (`hoyAr`) y todo lo demás es aritmética sobre la fecha
 * pelada, con `Date.UTC` para no arrastrar huso. Mismo criterio que ya usan `sync-ventas-hoy.js` y
 * `_liquidacion.js`, que resuelven "qué día es hoy" con `toLocaleDateString('en-CA', { timeZone })`.
 *
 * Es `.js` plano porque lo importan el handler de `api/` (Node, sin compilar TypeScript) y la
 * pantalla. Dos implementaciones de "cuál es la semana" es cómo se termina con un memo duplicado.
 */

export const ZONA = 'America/Argentina/Buenos_Aires'

/** Hoy en Buenos Aires, `YYYY-MM-DD`. La ÚNICA lectura del reloj de todo el módulo. */
export function hoyAr(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: ZONA })
}

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/

export function esFecha(iso) {
  return typeof iso === 'string' && ES_FECHA.test(iso)
}

/** `YYYY-MM-DD` + n días, sin tocar el huso. */
export function sumarDias(iso, n) {
  const [y, m, d] = iso.split('-').map(Number)
  const t = Date.UTC(y, m - 1, d) + n * 86400000
  return new Date(t).toISOString().slice(0, 10)
}

/** Día de la semana con el LUNES en 0 (0 = lunes … 6 = domingo). */
export function diaSemana(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
}

/** El lunes de la semana de esa fecha. */
export function lunesDe(iso) {
  return sumarDias(iso, -diaSemana(iso))
}

/** El id de una semana es su lunes: `w2026-08-10`. Estable, ordenable y legible. */
export function idSemana(ini) {
  return `w${ini}`
}

/** La semana (lunes→domingo) que contiene esa fecha. */
export function semanaDe(iso) {
  const ini = lunesDe(iso)
  return { id: idSemana(ini), ini, fin: sumarDias(ini, 6) }
}

export function semanaAnterior(sem) {
  return semanaDe(sumarDias(sem.ini, -7))
}

export function semanaSiguiente(sem) {
  return semanaDe(sumarDias(sem.ini, 7))
}

/**
 * ¿La semana ya terminó? Es lo que habilita congelar venta y pauta.
 *
 * ⚠️ Estrictamente mayor: el domingo la semana TODAVÍA está corriendo. Cerrarla ese mismo día
 * dejaría afuera lo que se venda el domingo, que en un local es un día entero.
 */
export function cerrada(sem, hoy) {
  return hoy > sem.fin
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** "11 al 17 de agosto de 2026" — y con el mes repetido si la semana lo cruza. */
export function etiquetaSemana(sem) {
  const [ay, am, ad] = sem.ini.split('-').map(Number)
  const [by, bm, bd] = sem.fin.split('-').map(Number)
  if (ay === by && am === bm) return `${ad} al ${bd} de ${MESES[bm - 1]} de ${by}`
  if (ay === by) return `${ad} de ${MESES[am - 1]} al ${bd} de ${MESES[bm - 1]} de ${by}`
  return `${ad} de ${MESES[am - 1]} de ${ay} al ${bd} de ${MESES[bm - 1]} de ${by}`
}

/**
 * Los siete temas del acta, en el orden en que se piensan: primero lo que pasó, después lo que se
 * entendió, y al final lo que se decidió. Es el orden que pidió Bruno el 15-ago-2026.
 */
export const TEMAS = [
  { clave: 'logros', label: 'Qué se logró esta semana' },
  { clave: 'aprendizajes', label: 'Qué aprendimos' },
  { clave: 'proxima', label: 'Qué viene la próxima semana' },
  { clave: 'insights', label: 'Insights y reflexiones' },
  { clave: 'bloqueos', label: 'Problemas y bloqueos' },
  { clave: 'decisiones', label: 'Decisiones que se tomaron' },
  { clave: 'estrategia', label: 'Cambios de estrategia' },
]

/**
 * Los ocho sistemas de Areben, para el bloque de avances.
 *
 * ⚠️ **HC Arévalo NO está y no es un olvido**: es un sistema de Bruno, no de Areben (dicho el
 * 15-ago-2026). El analista de Meta y `bdi-catalogo` van adentro de Monitor porque se están
 * mudando ahí.
 */
export const SISTEMAS = [
  { clave: 'monitor', label: 'Monitor', repos: ['monitor-areben', 'bdi-catalogo', 'analista-meta'] },
  { clave: 'mailer', label: 'Mailer', repos: ['areben-mailer'] },
  { clave: 'resorty', label: 'Resorty', repos: ['areben-popups'] },
  { clave: 'moldea', label: 'Moldea', repos: ['areben-moldea'] },
  { clave: 'creativa', label: 'Creativa', repos: ['areben-video'] },
  { clave: 'marketing', label: 'Marketing', repos: ['areben-marketing'] },
  { clave: 'produccion', label: 'Producción', repos: ['areben-produccion'] },
  { clave: 'dashboard', label: 'Dashboard', repos: ['areben-dashboard'] },
]

export const BLOQUES = ['acta', 'avance']

const CLAVES_ACTA = new Set(TEMAS.map((t) => t.clave))
const CLAVES_AVANCE = new Set(SISTEMAS.map((s) => s.clave))

/**
 * ¿Ese `(bloque, clave)` existe? Lo valida el SERVIDOR, no la pantalla.
 *
 * Sin esto, un POST con una clave inventada guarda una fila que ninguna pantalla muestra: el texto
 * se "guarda" y desaparece, que es peor que un error.
 */
export function claveValida(bloque, clave) {
  if (bloque === 'acta') return CLAVES_ACTA.has(clave)
  if (bloque === 'avance') return CLAVES_AVANCE.has(clave)
  return false
}
