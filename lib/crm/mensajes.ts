/**
 * El banco de mensajes del CRM: los textos que se mandan por WhatsApp, agrupados por situación.
 *
 * POR QUÉ ES EDITABLE Y NO UNA CONSTANTE
 * --------------------------------------
 * Los 25 mensajes que hay hoy en el KV salieron de la guía de ventas y **nadie los tocó desde
 * entonces**: son los de fábrica. Un texto de venta que no se puede corregir en el momento en que
 * se nota que no funciona termina sin usarse — se escribe a mano cada vez y el banco queda de
 * adorno. Por eso los grupos también los arma el que vende: la división de fábrica (dormido /
 * objeciones / canal) no es la de nadie en particular.
 *
 * Todo esto son transformaciones PURAS del banco, igual que `seguimiento.ts` con el mapa: cada
 * una devuelve un banco nuevo y el que persiste es la capa de arriba.
 *
 * 🔴 **El banco vive en UNA clave del KV (`mensajes:bdi`) que se reescribe entera en cada
 * guardado**, como el seguimiento. La guarda del servidor es `!Array.isArray(bank)` → **`[]`
 * pasa** (bdi-catalogo/api/ingresos.js:118), o sea que un guardado con el banco sin leer lo
 * borra. De ahí el flag `cargado` obligatorio de `guardarBanco`.
 */

/** Un grupo del banco. La forma es la que ya está guardada en el KV; no se cambia. */
export type GrupoMensajes = {
  grupo: string
  mensajes: string[]
}

export type Banco = GrupoMensajes[]

/**
 * Lo que viene del KV, puesto en forma. Es JSON escrito por una pantalla vieja: puede tener
 * grupos sin nombre, `mensajes` que no es array o mensajes que no son texto.
 *
 * ⚠️ No descarta los grupos vacíos: un grupo recién creado no tiene mensajes todavía y
 * borrárselo al recargar sería una desaparición silenciosa.
 */
export function normalizarBanco(raw: unknown): Banco {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((g): g is Record<string, unknown> => !!g && typeof g === 'object')
    .map((g) => ({
      grupo: String(g.grupo ?? '').trim(),
      mensajes: Array.isArray(g.mensajes) ? g.mensajes.map((m) => String(m ?? '')).filter((m) => m.trim() !== '') : [],
    }))
}

// ── Grupos ───────────────────────────────────────────────────────────────────

/** Agrega un grupo al final. Un nombre vacío no crea nada: sería un grupo imposible de nombrar. */
export function agregarGrupo(banco: Banco, nombre: string): Banco {
  const n = (nombre || '').trim()
  if (!n) return banco
  return [...banco, { grupo: n, mensajes: [] }]
}

/** Renombra un grupo. Un nombre vacío se ignora (borrar es otra operación, con su confirmación). */
export function renombrarGrupo(banco: Banco, gi: number, nombre: string): Banco {
  const n = (nombre || '').trim()
  if (!n || !banco[gi]) return banco
  return banco.map((g, i) => (i === gi ? { ...g, grupo: n } : g))
}

/** Borra un grupo ENTERO, con sus mensajes. La confirmación la pide la pantalla. */
export function borrarGrupo(banco: Banco, gi: number): Banco {
  if (!banco[gi]) return banco
  return banco.filter((_, i) => i !== gi)
}

/**
 * Mueve un grupo `delta` lugares. El orden importa: el panel de WhatsApp muestra los grupos en
 * este orden, así que arriba va lo que más se usa.
 */
export function moverGrupo(banco: Banco, gi: number, delta: number): Banco {
  const destino = gi + delta
  if (!banco[gi] || destino < 0 || destino >= banco.length) return banco
  const copia = [...banco]
  const [g] = copia.splice(gi, 1)
  copia.splice(destino, 0, g)
  return copia
}

// ── Mensajes ─────────────────────────────────────────────────────────────────

/** Agrega un mensaje al final de un grupo. Vacío no agrega nada. */
export function agregarMensaje(banco: Banco, gi: number, texto: string): Banco {
  const t = (texto || '').trim()
  if (!t || !banco[gi]) return banco
  return banco.map((g, i) => (i === gi ? { ...g, mensajes: [...g.mensajes, t] } : g))
}

/**
 * Cambia el texto de un mensaje.
 *
 * ⚠️ Guardar un mensaje vacío lo BORRA, que es lo que espera el que borró todo el texto y apretó
 * guardar. Es el mismo criterio del banco viejo (`bancoGuardarEdit`, index.html:14340).
 */
export function editarMensaje(banco: Banco, gi: number, mi: number, texto: string): Banco {
  if (!banco[gi] || banco[gi].mensajes[mi] === undefined) return banco
  const t = (texto || '').trim()
  if (!t) return borrarMensaje(banco, gi, mi)
  return banco.map((g, i) => (i === gi ? { ...g, mensajes: g.mensajes.map((m, j) => (j === mi ? t : m)) } : g))
}

export function borrarMensaje(banco: Banco, gi: number, mi: number): Banco {
  if (!banco[gi] || banco[gi].mensajes[mi] === undefined) return banco
  return banco.map((g, i) => (i === gi ? { ...g, mensajes: g.mensajes.filter((_, j) => j !== mi) } : g))
}

/** Mueve un mensaje dentro de su grupo. Mismo motivo que `moverGrupo`. */
export function moverMensaje(banco: Banco, gi: number, mi: number, delta: number): Banco {
  const g = banco[gi]
  if (!g || g.mensajes[mi] === undefined) return banco
  const destino = mi + delta
  if (destino < 0 || destino >= g.mensajes.length) return banco
  const msgs = [...g.mensajes]
  const [m] = msgs.splice(mi, 1)
  msgs.splice(destino, 0, m)
  return banco.map((x, i) => (i === gi ? { ...x, mensajes: msgs } : x))
}

// ── Los huecos ───────────────────────────────────────────────────────────────

/**
 * Los huecos que el mensaje puede traer escritos. Se muestran en la pantalla de edición para que
 * no haya que adivinarlos.
 *
 * 🔑 **Sólo `[Nombre]` se completa solo.** `[producto]` parece igual de automático y NO lo es: en
 * un mensaje de postventa es lo que compró el cliente, pero en uno de novedad es lo que acaba de
 * llegar —igual para todos ese día— y eso el sistema no lo sabe. Rellenarlo con la última compra
 * manda "¿cómo te fue con la funda?" a alguien que compró eso hace ocho meses. Queda a la vista
 * para completarlo a mano.
 */
export const HUECOS = [
  { hueco: '[Nombre]', que: 'el nombre del cliente', automatico: true },
  { hueco: '[producto]', que: 'lo escribís vos al mandarlo', automatico: false },
  { hueco: '[categoría]', que: 'lo escribís vos al mandarlo', automatico: false },
  { hueco: '[fecha]', que: 'lo escribís vos al mandarlo', automatico: false },
] as const

/**
 * Reemplaza los huecos que se pueden completar solos. Hoy es uno: el nombre.
 *
 * Sin nombre el texto queda con `[Nombre]` a la vista, que es preferible a un "Hola ," — el hueco
 * se ve y se completa; el saludo roto se manda sin que nadie lo note.
 */
export function completar(texto: string, datos: { nombre?: string | null }): string {
  const nombre = (datos.nombre || '').trim()
  if (!nombre) return texto
  return texto.replace(/\[Nombre\]/gi, nombre)
}

/** Cuántos mensajes tiene el banco entero. Para el resumen de la pantalla. */
export function totalMensajes(banco: Banco): number {
  return banco.reduce((s, g) => s + g.mensajes.length, 0)
}
