/**
 * Cargar varias personas al padrón de una sola vez.
 *
 * La previsualización —qué entra, qué ya está, qué está repetido— **no cuesta una sola llamada**:
 * `useCanjes` ya bajó el padrón entero y lo tiene en memoria. Es una mejora sobre el molde de
 * `AsignarCard`, que para previsualizar tiene que ir a preguntarle a Tienda Nube.
 *
 * ⚠️ **Lo que dice esta pantalla es una previsión, no un resultado.** Quien decide de verdad si un @
 * ya existe es la copia JS de `normalizarInstagram` (`api/_canjes.js`) y, última palabra, el
 * `unique` de la base. En el alta de a una una divergencia entre las dos copias es invisible —el
 * server contesta `existia: true` y la UI abre esa ficha—; en un lote de cuarenta significaría que
 * la pantalla prometió 38 nuevas y entraron 35, sin que nadie sepa cuáles. Por eso **el resultado se
 * dibuja desde la respuesta del servidor, fila por fila**, y no desde esto.
 */

import { normalizarInstagram } from './instagram'

/** El tope del lote. Es el mismo número que hace cumplir el servidor. */
export const TOPE_ALTA_LOTE = 50

/** Lo que se tipea en una fila de la grilla. El @ es el único que no puede faltar. */
export type FilaAlta = {
  instagram: string
  nombre: string
  telefono: string
  ciudad: string
}

export const FILA_VACIA: FilaAlta = { instagram: '', nombre: '', telefono: '', ciudad: '' }

export type EstadoFila =
  /** Va a entrar. */
  | 'ok'
  /** Sin @: no es un error, es una fila que todavía no se llenó. */
  | 'vacia'
  /** Se escribió algo pero no queda un @ usable. */
  | 'invalida'
  /** El mismo @ ya aparece más arriba en esta grilla. */
  | 'repetida'
  /** Ya está en el padrón. */
  | 'ya-esta'

export type FilaPrevia = {
  /** El número de fila, 1-based: es como se la nombra en pantalla. */
  n: number
  fila: FilaAlta
  /** El @ ya normalizado. `''` cuando no quedó nada usable. */
  instagram: string
  estado: EstadoFila
  /** Cuando ya está en el padrón: de quién es la ficha, para poder decirlo con nombre. */
  yaEs?: { id: number; nombre: string }
}

export type ResumenAlta = {
  nuevas: number
  yaEstan: number
  repetidas: number
  invalidas: number
  /** Si se pasa del tope, cuántas sobran. */
  sobran: number
}

/** Lo mínimo que hace falta saber del padrón para previsualizar. */
export type PersonaDelPadron = { id: number; instagram: string; nombre: string }

/**
 * Marca cada fila contra el padrón y contra las filas de más arriba.
 *
 * El primero de dos @ repetidos gana: quien tipeó dos veces la misma creadora quiso cargarla una, y
 * quedarse con el último descartaría en silencio lo que escribió primero.
 */
export function previsualizarAlta(filas: FilaAlta[], padron: PersonaDelPadron[]): FilaPrevia[] {
  const enElPadron = new Map(padron.map((p) => [normalizarInstagram(p.instagram), p]))
  const vistos = new Set<string>()

  return filas.map((fila, i) => {
    const n = i + 1
    const crudo = String(fila.instagram ?? '').trim()
    const instagram = normalizarInstagram(crudo)

    if (!crudo) return { n, fila, instagram: '', estado: 'vacia' }
    if (!instagram) return { n, fila, instagram: '', estado: 'invalida' }

    const ya = enElPadron.get(instagram)
    if (ya) return { n, fila, instagram, estado: 'ya-esta', yaEs: { id: ya.id, nombre: ya.nombre } }

    if (vistos.has(instagram)) return { n, fila, instagram, estado: 'repetida' }
    vistos.add(instagram)

    return { n, fila, instagram, estado: 'ok' }
  })
}

export function resumenAlta(previas: FilaPrevia[]): ResumenAlta {
  const cuenta = (e: EstadoFila) => previas.filter((p) => p.estado === e).length
  const nuevas = cuenta('ok')
  return {
    nuevas,
    yaEstan: cuenta('ya-esta'),
    repetidas: cuenta('repetida'),
    invalidas: cuenta('invalida'),
    sobran: Math.max(0, nuevas - TOPE_ALTA_LOTE),
  }
}

/**
 * Lo que se le manda al servidor: sólo las filas nuevas, con los campos limpios.
 *
 * Se manda `instagram_raw` con lo tipeado tal cual, que es lo que después se muestra en pantalla:
 * ella se escribe `@Lucia.MKP` y verlo en minúsculas se lee como que el sistema le cambió el nombre.
 */
export function filasAEnviar(previas: FilaPrevia[]): Array<{
  instagram: string
  instagram_raw: string
  nombre?: string
  telefono?: string
  ciudad?: string
}> {
  return previas
    .filter((p) => p.estado === 'ok')
    .slice(0, TOPE_ALTA_LOTE)
    .map((p) => {
      const limpio = (v: string) => {
        const s = String(v ?? '').trim()
        return s || undefined
      }
      return {
        instagram: p.instagram,
        instagram_raw: String(p.fila.instagram ?? '').trim().replace(/^@+/, ''),
        nombre: limpio(p.fila.nombre),
        telefono: limpio(p.fila.telefono),
        ciudad: limpio(p.fila.ciudad),
      }
    })
}

/**
 * Reparte un pegado en filas. Acepta tabs (una planilla) y comas y punto y coma (una lista escrita a
 * mano); una línea sin separadores es sólo el @, que es el caso más común: alguien copia una columna
 * de arrobas y espera que caigan una por renglón.
 *
 * ⚠️ El orden de las columnas es el de la grilla: @, nombre, teléfono, ciudad. Lo que sobre se
 * ignora, porque adivinar a qué campo va la quinta columna es peor que dejarla afuera.
 */
export function filasDePegado(texto: string): FilaAlta[] {
  return String(texto ?? '')
    .split(/\r?\n/)
    .map((linea) => linea.trim())
    .filter(Boolean)
    .map((linea) => {
      const [instagram = '', nombre = '', telefono = '', ciudad = ''] = linea.split(/\t|[;,]/).map((x) => x.trim())
      return { instagram, nombre, telefono, ciudad }
    })
}
