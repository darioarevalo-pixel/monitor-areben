/**
 * El núcleo del PRM y de Recorridas: **funciones puras**, sin fetch y sin React.
 *
 * Lo comparten las DOS secciones (`prm` lee, `recorridas` escribe) y el handler `api/_prm.js` para
 * armar las consultas al geocoder. ⛔ Ninguna de estas reglas se vuelve a escribir en una pantalla:
 * es exactamente lo que hace `lib/crm/`, que alimenta la sección Clientes y el panel de WhatsApp.
 */
import { limpiarDireccion } from '../envios/direccion.core.js'
import {
  consultaDeLocal as consultaDeLocalJs,
  distanciaKm as distanciaKmJs,
  ordenarPorCercania as ordenarPorCercaniaJs,
} from './geo.core.js'
import { filaDeLocalSembrado as filaDeLocalSembradoJs, nuevoIdDeLocal as nuevoIdDeLocalJs } from './sembrado.core.js'
import type { Candidato, Compromiso, CompromisoConReloj, Parseo, ProveedorLocal, Visita } from './tipos'

/**
 * ⚠️ **La geografía vive en `lib/prm/geo.core.js`, en JS plano**, porque la necesita `api/_prm.js`
 * y los handlers no pueden importar TypeScript. Acá se re-exporta tipada, igual que hace
 * `lib/permisos.ts` con su core. ⛔ No se copia: una segunda implementación del orden del recorrido
 * es el bug que ya costó caro en Canjes.
 */
export type PuntoDeParada = { id: string; lat: number | null; lng: number | null }

export const distanciaKm: (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => number =
  distanciaKmJs

export const ordenarPorCercania: (
  paradas: PuntoDeParada[],
  desde?: { lat: number; lng: number } | null,
) => { orden: string[]; sinPunto: string[] } = ordenarPorCercaniaJs

export const consultaDeLocal: (
  local: Pick<ProveedorLocal, 'id' | 'direccion' | 'localidad' | 'provincia'>,
) => { clave: string; intentos: string[]; localidad: string; provincia: string } | { motivo: string } =
  consultaDeLocalJs

/**
 * ⚠️ **La ficha que nace de una OC vive en `lib/prm/sembrado.core.js`, también en JS plano**: la
 * arman `api/_oc-webhook.js` y `scripts/sembrar-prm.mjs`, y ninguno de los dos pasa por el
 * compilador de Next. Acá se re-exporta tipada. ⛔ No se copia.
 */
export const nuevoIdDeLocal: (args: { ahora: number; azar: string }) => string = nuevoIdDeLocalJs

export const filaDeLocalSembrado: (args: {
  id: string
  proveedorId: number
  nombre: string | null | undefined
  origen: string
}) => {
  id: string
  nombre: string
  estado: string
  proveedor_id_ingresos: number
  creado_por: string
  nota: string
} = filaDeLocalSembradoJs

export function nuevoId(prefijo: string): string {
  return `${prefijo}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/** Para comparar nombres tipeados dos veces: sin tildes, sin puntuación, sin mayúsculas. */
export function normalizarNombre(s: string | null | undefined): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * **El nombre de Gestión Nube que probablemente sea este proveedor.** Devuelve una SUGERENCIA, y
 * quien la acepta es una persona con un click.
 *
 * 🔴 **Sugerir ⛔ NO es adivinar, y la diferencia es que acá nada se escribe solo.** La regla del
 * módulo sigue en pie —*«los dos enganches se tildan A MANO y ⛔ no se adivinan por nombre»*,
 * porque un enganche mal puesto es peor que ninguno: una ficha que ya muestra cumplimiento y margen
 * no la vuelve a revisar nadie—. Lo que cambia es que el que tilda no tiene que ir a buscar el
 * nombre en una lista de 33.
 *
 * Dos reglas, y la segunda dice que es una corazonada:
 *
 * 1. **`exacta`** — el mismo nombre, sin tildes ni puntuación ni mayúsculas. Y **también sin
 *    ESPACIOS**: `PLAYURBAN` de un lado y `PLAY URBAN` del otro son el mismo proveedor escrito por
 *    dos personas distintas, y la primera versión de esta función lo dejaba afuera. Al 2-sep-2026
 *    son **22 de los 28** proveedores de Zattia.
 * 2. **`probable`** — uno de los dos nombres es el **PRINCIPIO** del otro, palabra por palabra:
 *    `Contamina` contra `CONTAMINA BY LATTE CHIC`. Es como crecen estos nombres —la marca primero—
 *    y por eso se compara por prefijo y ⛔ no por «contiene»: con «contiene», `LATTE` suelto
 *    matchearía, y `NOX` entraría adentro de cualquier cosa que lo lleve en el medio.
 *
 * 🔴 **Con DOS candidatos ⛔ no se sugiere nada.** Una sugerencia entre dos parecidos es la que se
 * acepta sin mirar, y es justo el caso en que hay que mirar.
 * 🔴 **El prefijo pide una palabra de 4+ letras.** Sin eso, un nombre de dos letras sugiere medio
 * catálogo.
 */
export type SugerenciaGn = { nombre: string; seguridad: 'exacta' | 'probable' }

export function sugerirProveedorGn(nombreLocal: string, opciones: string[]): SugerenciaGn | null {
  const clave = normalizarNombre(nombreLocal)
  if (!clave) return null

  const exacta = opciones.find((o) => normalizarNombre(o) === clave)
  if (exacta) return { nombre: exacta, seguridad: 'exacta' }

  // Sin espacios: sigue siendo el MISMO nombre carácter por carácter, así que no baja a «probable».
  // ⚠️ Se pide que sea único igual: dos opciones que sólo difieran en un espacio son la misma marca
  // escrita dos veces, y elegir una de las dos a ciegas es elegir mal la mitad de las veces.
  const pegado = clave.replace(/ /g, '')
  const pegadas = opciones.filter((o) => normalizarNombre(o).replace(/ /g, '') === pegado)
  if (pegadas.length === 1) return { nombre: pegadas[0], seguridad: 'exacta' }

  const tokens = clave.split(' ').filter(Boolean)
  const esPrefijo = (corto: string[], largo: string[]) =>
    corto.length < largo.length && corto.every((t, i) => t === largo[i]) && corto.some((t) => t.length >= 4)

  const candidatos = opciones.filter((o) => {
    const otros = normalizarNombre(o).split(' ').filter(Boolean)
    if (!otros.length) return false
    return esPrefijo(otros, tokens) || esPrefijo(tokens, otros)
  })
  return candidatos.length === 1 ? { nombre: candidatos[0], seguridad: 'probable' } : null
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Pegar la nota
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Los separadores fuertes que una persona usa entre campos, y la coma, que también los separa. */
const SEPARADORES = /\s+[—–|·]\s+|\s+-\s+|\t+|,/

/** "gal. Flores Center", "Galería Punto Once", "local 23", "loc 5". */
const ES_GALERIA = /\bgal(er[ií]as?)?\b\.?|\blocal(es)?\b|\bloc\.?\s*\d+/i

/** Viñetas y numeración con las que arranca una línea copiada de cualquier lado. */
const VINETA = /^\s*(?:[-*•·—–]+|\d{1,3}[.)])\s+/

function pinta(parte: string): 'galeria' | 'direccion' | 'texto' {
  if (ES_GALERIA.test(parte)) return 'galeria'
  const limpia = limpiarDireccion(parte)
  // 🔑 **Sin altura no es una dirección, es un texto que empieza con una calle.** `limpiarDireccion`
  // devuelve algo igual para "jeans importados" (calle = la frase entera, altura = null), así que
  // preguntar sólo si devolvió no-null clasificaría el rubro como dirección.
  return limpia && limpia.altura != null ? 'direccion' : 'texto'
}

/**
 * **Parte una nota pegada en candidatos a local.**
 *
 * 🔴 **La invariante: toda línea no vacía sale en `candidatos` o en `sinEntender`, nunca en
 * ninguna de las dos.** Una nota de 60 renglones de la que entran 51 y nadie avisa de los 9 se
 * descubre en la calle, parado en una galería que no está en la lista. Está atada por test.
 *
 * 🔑 **El nombre es la PRIMERA parte, salvo que la primera parte sea la dirección o la galería.**
 * La gente escribe "Nombre - dirección - qué vende", pero también escribe direcciones sueltas sin
 * nombre. En ese caso el nombre pasa a ser la galería —que es como se lo busca— y si no hay, la
 * dirección. ⛔ Lo que NO se hace es tomar el primer texto suelto que aparezca: sería el rubro del
 * final ("blusas"), y un local llamado "blusas" es peor que uno llamado por su dirección.
 *
 * ⚠️ **No adivina más que eso, a propósito.** Lo que se entendió se muestra al lado de la línea
 * cruda para corregirlo a mano: un parser que acierta el 90% y no muestra el original hace que
 * nadie revise el 10%.
 */
export function parsearNota(texto: string): Parseo {
  const candidatos: Candidato[] = []
  const sinEntender: { linea: string; motivo: string }[] = []

  for (const cruda of String(texto ?? '').split(/\r?\n/)) {
    const linea = cruda.trim()
    if (!linea) continue

    const sinVineta = linea.replace(VINETA, '').trim()
    if (!/[a-záéíóúñ]/i.test(sinVineta)) {
      sinEntender.push({ linea, motivo: 'no tiene ni una letra' })
      continue
    }

    const partes = sinVineta
      .split(SEPARADORES)
      .map((p) => p.trim())
      .filter(Boolean)
    if (!partes.length) {
      sinEntender.push({ linea, motivo: 'quedó vacía al separarla' })
      continue
    }

    const pintadas = partes.map((p) => ({ txt: p, tipo: pinta(p) }))
    const galeria = pintadas.find((p) => p.tipo === 'galeria')?.txt ?? null
    const direccion = pintadas.find((p) => p.tipo === 'direccion')?.txt ?? null

    let nombre: string
    let usadaComoNombre: string | null = null
    if (pintadas[0].tipo === 'texto') {
      nombre = pintadas[0].txt
      usadaComoNombre = pintadas[0].txt
    } else {
      nombre = galeria ?? direccion ?? pintadas[0].txt
      usadaComoNombre = null
    }

    const nota =
      pintadas
        .filter((p) => p.tipo === 'texto' && p.txt !== usadaComoNombre)
        .map((p) => p.txt)
        .join(', ') || null

    candidatos.push({ nombre, galeria, direccion, nota, lat: null, lng: null, linea })
  }

  return { candidatos, sinEntender }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Los lugares guardados de Google Maps
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Parte una fila de CSV respetando las comillas: un título con coma adentro es lo normal acá. */
function partirCsv(fila: string): string[] {
  const campos: string[] = []
  let actual = ''
  let entreComillas = false
  for (let i = 0; i < fila.length; i++) {
    const c = fila[i]
    if (c === '"') {
      if (entreComillas && fila[i + 1] === '"') {
        actual += '"'
        i++
      } else entreComillas = !entreComillas
    } else if (c === ',' && !entreComillas) {
      campos.push(actual)
      actual = ''
    } else actual += c
  }
  campos.push(actual)
  return campos.map((c) => c.trim())
}

/**
 * Las coordenadas escondidas en una URL de Google Maps.
 *
 * Vienen de dos formas y hay que probar las dos: `.../@-34.6295,-58.4635,17z` (la que arma el mapa
 * al centrarse) y `?q=-34.6295,-58.4635` (la del lugar). ⚠️ **`!3d…!4d…` NO se usa**: es la del
 * marcador y en los lugares guardados a veces apunta al centro del barrio.
 */
export function puntoDeUrlMaps(url: string): { lat: number; lng: number } | null {
  const s = String(url ?? '')
  const m = s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || s.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (!m) return null
  const lat = Number(m[1])
  const lng = Number(m[2])
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
}

/**
 * **El CSV de lugares guardados de Google Maps (Takeout).** Trae `Title, Note, URL`.
 *
 * 🔑 **Misma invariante que `parsearNota`: toda fila con contenido sale en uno de los dos lados.**
 * Un export de Takeout con 40 lugares del que entran 33 es indistinguible de uno de 33.
 *
 * ⚠️ **La URL puede no traer el punto** y eso ⛔ no descarta la fila: entra sin coordenadas y la
 * geocodifica el servidor por la dirección, como cualquier otra. Lo que sí se pierde —y por eso se
 * intenta— es que Maps ya sabe exactamente dónde queda.
 */
export function parsearCsvMaps(texto: string): Parseo {
  const filas = String(texto ?? '')
    .split(/\r?\n/)
    .filter((f) => f.trim())
  if (!filas.length) return { candidatos: [], sinEntender: [] }

  const cabecera = partirCsv(filas[0]).map((c) => c.toLowerCase())
  const iTitulo = cabecera.findIndex((c) => c === 'title' || c === 'título' || c === 'titulo' || c === 'nombre')
  const iNota = cabecera.findIndex((c) => c === 'note' || c === 'nota' || c === 'comment')
  const iUrl = cabecera.findIndex((c) => c === 'url' || c === 'link' || c === 'enlace')
  // Sin columna de título no es el CSV de Maps: se dice, ⛔ no se intenta adivinar el orden.
  if (iTitulo < 0) {
    return { candidatos: [], sinEntender: [{ linea: filas[0], motivo: 'el archivo no tiene una columna «Title»' }] }
  }

  const candidatos: Candidato[] = []
  const sinEntender: { linea: string; motivo: string }[] = []
  for (const fila of filas.slice(1)) {
    const campos = partirCsv(fila)
    const nombre = (campos[iTitulo] || '').trim()
    if (!nombre) {
      sinEntender.push({ linea: fila, motivo: 'la fila no trae título' })
      continue
    }
    // 🔴 **El punto se busca en la fila ENTERA si la columna no lo tiene, y no es paranoia.** La
    // URL de Maps lleva comas adentro (`@-34.6295,-58.4635,17z`), así que un CSV que la exporte
    // **sin comillas** —uno abierto y vuelto a guardar en una planilla, o editado a mano— la parte
    // en tres columnas y el punto se pierde **callado**. Y en este archivo el punto es el único
    // dato de ubicación que hay: no viene la dirección, así que perderlo es que ese local no pueda
    // entrar nunca a un recorrido ordenado. Medido con las dos formas en el test.
    const punto = (iUrl >= 0 ? puntoDeUrlMaps(campos[iUrl] || '') : null) || puntoDeUrlMaps(fila)
    candidatos.push({
      nombre,
      galeria: null,
      direccion: null,
      nota: (iNota >= 0 ? campos[iNota] : '')?.trim() || null,
      lat: punto ? punto.lat : null,
      lng: punto ? punto.lng : null,
      linea: fila,
    })
  }
  return { candidatos, sinEntender }
}

/**
 * Cuáles de los candidatos ya están en el padrón, por nombre normalizado.
 *
 * ⚠️ **Marca, ⛔ no filtra.** Dos locales pueden llamarse igual de verdad (dos sucursales), así que
 * la decisión de no cargarlo la toma quien está mirando la pantalla — acá sólo se le avisa.
 */
export function marcarRepetidos(
  candidatos: Candidato[],
  existentes: Pick<ProveedorLocal, 'id' | 'nombre'>[],
): (Candidato & { yaExiste: string | null })[] {
  const porNombre = new Map(existentes.map((e) => [normalizarNombre(e.nombre), e.id]))
  return candidatos.map((c) => ({ ...c, yaExiste: porNombre.get(normalizarNombre(c.nombre)) ?? null }))
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Los compromisos
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const DIA_MS = 24 * 60 * 60 * 1000

/** Días enteros entre dos fechas `YYYY-MM-DD`, contando de la primera a la segunda. */
function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde.slice(0, 10)}T00:00:00Z`)
  const b = Date.parse(`${hasta.slice(0, 10)}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.round((b - a) / DIA_MS)
}

/**
 * **En qué anda cada compromiso hoy.**
 *
 * 🔴 **`diasEsperando` sale de `creado_en` y ⛔ NUNCA de un `actualizado_en`.** Un campo que se mueve
 * cada vez que alguien toca la fila no mide la espera: mide la última edición. Corregirle una falta
 * de ortografía al texto reiniciaría el atraso a cero, y el compromiso más viejo —el que hay que
 * reclamar— se vería como el más nuevo. En este repo ese error ya se cometió cuatro veces.
 *
 * 🔑 **`sin_fecha` no es un error ni un dato faltante**: hay promesas sin plazo ("cuando le entre
 * te aviso") y meterlas en `vencido` las volvería ruido que se aprende a ignorar, que es como muere
 * una lista de pendientes.
 */
export function conReloj(compromisos: Compromiso[], hoy: string): CompromisoConReloj[] {
  return (compromisos || []).map((c) => {
    const diasEsperando = diasEntre(c.creado_en, hoy)
    if (c.cumplido_en) return { ...c, situacion: 'cumplido' as const, diasEsperando, dias: null }
    if (!c.para_cuando) return { ...c, situacion: 'sin_fecha' as const, diasEsperando, dias: null }
    const d = diasEntre(c.para_cuando, hoy)
    if (d > 0) return { ...c, situacion: 'vencido' as const, diasEsperando, dias: d }
    if (d === 0) return { ...c, situacion: 'hoy' as const, diasEsperando, dias: 0 }
    return { ...c, situacion: 'por_venir' as const, diasEsperando, dias: -d }
  })
}

/** El orden de "¿qué le debo y qué me deben?": lo vencido primero, lo sin fecha al final. */
const PESO: Record<CompromisoConReloj['situacion'], number> = {
  vencido: 0,
  hoy: 1,
  por_venir: 2,
  sin_fecha: 3,
  cumplido: 4,
}

/**
 * Los compromisos que siguen abiertos, ordenados por urgencia.
 *
 * ⚠️ Los cumplidos se sacan acá y ⛔ no en la consulta: la ficha del proveedor los muestra igual, en
 * su historia. Lo que no cumplió la última vez es exactamente lo que hay que saber antes de creerle
 * la próxima promesa.
 */
export function abiertosOrdenados(compromisos: Compromiso[], hoy: string): CompromisoConReloj[] {
  return conReloj(compromisos, hoy)
    .filter((c) => c.situacion !== 'cumplido')
    .sort((a, b) => PESO[a.situacion] - PESO[b.situacion] || b.diasEsperando - a.diasEsperando || a.id.localeCompare(b.id))
}

/** La visita más reciente por fecha. `null` si nunca fui — que es distinto de "fui y no anoté". */
export function ultimaVisita(visitas: Visita[]): Visita | null {
  let mejor: Visita | null = null
  for (const v of visitas || []) {
    if (!mejor || v.fecha > mejor.fecha || (v.fecha === mejor.fecha && v.creado_en > mejor.creado_en)) mejor = v
  }
  return mejor
}
