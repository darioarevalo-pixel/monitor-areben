/**
 * Escrituras del seguimiento del CRM (`crm:seg:<marca>`), como transformaciones
 * PURAS e inmutables del mapa. Port de las funciones `crmSet…`, `crmAgregarNota`,
 * `crmBorrarNota` y `crmSugerirCadencias` (index.html:13452-13580) sin el DOM ni
 * el POST — cada una devuelve un mapa nuevo y el que persiste es la capa de arriba.
 *
 * **El dato más delicado de todo el monitor**: 305 clientes, 274 ★, 39 notas a
 * mano, sin backup. Cada op toca UN cliente; el POST del mapa entero (con el flag
 * `cargado`) es lo que evita el borrado en masa. La verificación en prod es que
 * el diff contra el dump sea exactamente el cliente tocado.
 */

import { addDiasISO, diaHabil } from './core'
import type { Contacto, MapaSeguimiento, ResultadoContacto, Seguimiento, Temperatura } from './tipos'

/** Fecha local YYYY-MM-DD. Port de hoyISO (13279): usa el día REAL, no el TODAY
 *  congelado, para que "Hablé hoy" y las notas no queden con fecha vieja. */
export function hoyISO(today: Date = new Date()): string {
  return (
    today.getFullYear() +
    '-' +
    String(today.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(today.getDate()).padStart(2, '0')
  )
}

/**
 * Garantiza la entrada del cliente en una COPIA del mapa. Port de crmSegRef
 * (13445): entrada nueva → defaults completos; entrada existente → se respeta tal
 * cual, solo se asegura que `notas` sea array. Así el diff contra el dump no suma
 * claves de más en clientes que no se tocaron.
 */
function conEntrada(crmSeg: MapaSeguimiento, id: number | string): { mapa: MapaSeguimiento; k: string } {
  const k = String(id)
  const existe = !!crmSeg[k]
  const base: Seguimiento = existe
    ? crmSeg[k]
    : { cadencia: '', ultimo_contacto: null, proximo_manual: null, notas: [] }
  const notas = Array.isArray(base.notas) ? base.notas : []
  return { mapa: { ...crmSeg, [k]: { ...base, notas } }, k }
}

/** Aplica un patch a la entrada del cliente, devolviendo un mapa nuevo. */
function conPatch(crmSeg: MapaSeguimiento, id: number | string, patch: Partial<Seguimiento>): MapaSeguimiento {
  const { mapa, k } = conEntrada(crmSeg, id)
  return { ...mapa, [k]: { ...mapa[k], ...patch } }
}

export const setMayorista = (crmSeg: MapaSeguimiento, id: number | string, value: boolean) =>
  conPatch(crmSeg, id, { es_mayorista: !!value })

export const setPagina = (crmSeg: MapaSeguimiento, id: number | string, value: string) =>
  conPatch(crmSeg, id, { pagina: (value || '').trim() })

export const setDescartado = (crmSeg: MapaSeguimiento, id: number | string, value: boolean) =>
  conPatch(crmSeg, id, { descartado: !!value })

export const setDifusion = (crmSeg: MapaSeguimiento, id: number | string, value: boolean) =>
  conPatch(crmSeg, id, { en_difusion: !!value })

/**
 * Marca qué tan viva está la relación. Es lo que ordena la lista del día (ver
 * `prioridadContacto` en core.ts).
 *
 * No lleva ninguna protección propia contra el borrado en masa y no hace falta: como toda
 * escritura del CRM, sale por `guardarSeg` → `guardarMapa`, que exige el flag `cargado`.
 * Acá abajo es una transformación pura de un mapa y nada más.
 */
export const setTemperatura = (crmSeg: MapaSeguimiento, id: number | string, value: Temperatura) =>
  conPatch(crmSeg, id, { temperatura: value })

/**
 * "Le escribí hoy": fija el próximo a hoy + `dias`, **corrido al lunes si cae fin de semana**
 * (ver `diaHabil`).
 */
export const escribiHoy = (crmSeg: MapaSeguimiento, id: number | string, dias: number, today?: Date) => {
  const hoy = hoyISO(today)
  return conPatch(crmSeg, id, { ultimo_contacto: hoy, proximo_manual: diaHabil(addDiasISO(hoy, dias)) })
}

/**
 * La fecha elegida en el calendario. También pasa por `diaHabil`: la regla es del dato, no del
 * botón — un sábado agendado a mano se pierde igual que uno calculado.
 *
 * ⚠️ Vacío sigue significando "sin fecha" y no se toca.
 */
export const setProximoManual = (crmSeg: MapaSeguimiento, id: number | string, value: string) =>
  conPatch(crmSeg, id, { proximo_manual: value ? diaHabil(value) : null })

/**
 * Campo de texto libre del seguimiento (`despacho`, `tener_en_cuenta`, `pendiente`).
 *
 * ⚠️ **Vacío BORRA la clave**, no la deja en `''`. No es prolijidad: `crm:seg:bdi` pesa 133 KB y
 * el POST reescribe el mapa ENTERO en cada guardado, así que tres claves vacías por cada uno de
 * los 744 clientes se pagan en cada clic del panel. Y además mantiene la verificación de siempre
 * legible: el diff contra el dump tiene que ser exactamente el cliente tocado, sin claves nuevas
 * apareciendo en gente que nadie tocó.
 */
function conTexto(
  crmSeg: MapaSeguimiento,
  id: number | string,
  campo: 'despacho' | 'tener_en_cuenta' | 'pendiente',
  valor: string,
): MapaSeguimiento {
  const { mapa, k } = conEntrada(crmSeg, id)
  const txt = (valor || '').trim()
  const entrada: Seguimiento = { ...mapa[k] }
  if (txt) entrada[campo] = txt
  else delete entrada[campo]
  return { ...mapa, [k]: entrada }
}

/** 📦 Cómo se le manda. El dato que hoy vive sólo en el chat. */
export const setDespacho = (crmSeg: MapaSeguimiento, id: number | string, value: string) =>
  conTexto(crmSeg, id, 'despacho', value)

/** 📌 Cómo es el cliente. No vence. */
export const setTenerEnCuenta = (crmSeg: MapaSeguimiento, id: number | string, value: string) =>
  conTexto(crmSeg, id, 'tener_en_cuenta', value)

/** ⏳ Lo que quedó para la próxima. */
export const setPendiente = (crmSeg: MapaSeguimiento, id: number | string, value: string) =>
  conTexto(crmSeg, id, 'pendiente', value)

/**
 * Tachar el pendiente: lo borra y **deja la constancia como nota**.
 *
 * Borrarlo a secas perdería lo único que el sistema no puede reconstruir solo (que eso se hizo, y
 * cuándo). La bitácora es justamente el lugar de "lo que hice", así que la constancia va ahí y el
 * renglón de arriba queda limpio para lo próximo.
 *
 * Sin pendiente cargado devuelve el mismo mapa **por identidad**: la capa de arriba puede
 * comparar y ahorrarse un POST de 133 KB.
 */
export function cumplirPendiente(crmSeg: MapaSeguimiento, id: number | string, fecha: string): MapaSeguimiento {
  const txt = (crmSeg[String(id)]?.pendiente || '').trim()
  if (!txt) return crmSeg
  return conTexto(agregarNota(crmSeg, id, '✅ ' + txt, fecha), id, 'pendiente', '')
}

/**
 * Los seis textos que Bruno escribe de verdad, sacados de contar las 375 notas cargadas: mandar la
 * comunidad (98), avisar de los ingresos (58), preguntar por reposición (23), controlar recepción
 * (11), consultar si llegó bien y el cierre. **Cubren más de la mitad de lo que se escribe.**
 *
 * 🔑 **Escriben en el cuadro, NO guardan solas.** Casi siempre hay algo que agregarle al texto base
 * antes de dejarlo asentado, y una nota que se guarda de un toque equivocado hay que ir a borrarla
 * a la sección. Un toque + Enter ya es rápido.
 *
 * Viven acá y no en cada pantalla porque son las mismas en la ficha del CRM y en el panel de
 * WhatsApp: dos listas separadas se despegan en la primera que alguien edite.
 */
export const NOTAS_RAPIDAS = [
  '👥 Le mandé la comunidad',
  '🆕 Le avisé de los ingresos',
  '🔄 Preguntar por reposición',
  '✅ Consultar si llegó bien',
  '📥 Controlar recepción',
  '🔥 En cierre / cotizando',
]

/** Agrega una nota y reordena por fecha desc (sort estable: conserva el orden de
 *  carga entre notas del mismo día). Port de crmAgregarNota (13537). */
export function agregarNota(crmSeg: MapaSeguimiento, id: number | string, texto: string, fecha: string): MapaSeguimiento {
  const { mapa, k } = conEntrada(crmSeg, id)
  const notas = [{ fecha, texto }, ...(mapa[k].notas || [])].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
  return { ...mapa, [k]: { ...mapa[k], notas } }
}

/**
 * Cuántos intentos de contacto se guardan por cliente.
 *
 * Los 305 clientes viven en **una sola clave del KV** que se reescribe entera en cada guardado, así
 * que una lista sin techo se paga en cada POST y para siempre. Cincuenta son más de dos años al
 * ritmo real (dos contactos por mes al que más se le habla), y el embudo de la Parte 9 se mide por
 * mes: nadie va a preguntar por el intento número 51.
 */
export const TOPE_CONTACTOS = 50

/**
 * Registra cómo salió el contacto de hoy: el "¿CÓMO TE FUE?" del panel de WhatsApp.
 *
 * Hace **dos** cosas y las dos importan:
 *
 *  1. Anota el resultado en `contactos`. Es el dato que hoy no existe en ningún lado y del que
 *     salen las métricas del embudo (contactados → respondieron → compraron).
 *  2. Pisa `ultimo_contacto` con la fecha. Contestar la pregunta ES haber hablado, y si no se
 *     tocara, la cadencia seguiría contando desde la última vez y el cliente volvería a aparecer
 *     mañana en la lista del día como si nadie le hubiera escrito.
 *
 * Lo que **no** hace: tocar la temperatura. Un "no le interesa" parece un cliente frío y muchas
 * veces lo es, pero decidirlo solo es cambiar a mano un dato que el panel muestra al lado — la
 * temperatura se marca clickeándola, y que la máquina la mueva sola es cómo se pierde la confianza
 * en lo que dice la pantalla.
 */
export function registrarContacto(
  crmSeg: MapaSeguimiento,
  id: number | string,
  resultado: ResultadoContacto,
  fecha: string,
): MapaSeguimiento {
  const { mapa, k } = conEntrada(crmSeg, id)
  const nuevo: Contacto = { fecha, resultado }
  const contactos = [nuevo, ...(mapa[k].contactos || [])].slice(0, TOPE_CONTACTOS)
  return { ...mapa, [k]: { ...mapa[k], contactos, ultimo_contacto: fecha } }
}

/** Borra la nota en el índice `idx`. Port de crmBorrarNota (13553). */
export function borrarNota(crmSeg: MapaSeguimiento, id: number | string, idx: number): MapaSeguimiento {
  const { mapa, k } = conEntrada(crmSeg, id)
  const notas = (mapa[k].notas || []).filter((_, i) => i !== idx)
  return { ...mapa, [k]: { ...mapa[k], notas } }
}
