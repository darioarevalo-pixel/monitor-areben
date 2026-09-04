/**
 * Modelos — las formas. Lo que valida y normaliza vive en `core.core.js` (JS plano, lo importa el
 * handler); lo derivado y tipado, en `core.ts`.
 */

/** `activa` = está en la lista de a quién llamar. `archivada` = sale de esa lista y sigue existiendo. */
export type EstadoModelo = 'activa' | 'archivada'

/** En centímetros, salvo `calzado` que es número argentino. ⛔ Una medida ausente ⛔ no vale 0. */
export type MedidasModelo = {
  busto?: number
  cintura?: number
  cadera?: number
  calzado?: number
}

/**
 * La ficha de una modelo, como viaja del handler a la pantalla.
 *
 * 🔑 **`talle` y `altura` ya vienen normalizados** (`M`, `1,70 m`): los normaliza el handler antes
 * de escribir, con el mismo núcleo que usa la sesión de fotos. La pantalla ⛔ no vuelve a
 * normalizar, sólo muestra.
 *
 * ⚠️ **`marcas` vacío quiere decir LAS DOS**, ⛔ no «ninguna». Mismo criterio que `insumo.marcas`.
 */
export type Modelo = {
  id: string
  nombre: string
  /** El usuario, sin `@`. */
  instagram: string | null
  /** Como se tipeó. Para el `wa.me` se normaliza con `normalizeArgPhone`, ⛔ no se guarda normalizado. */
  telefono: string | null
  mail: string | null
  /** Los tres en `null` = **directa**. Ver `esDirecta`. */
  agencia: string | null
  booker: string | null
  bookerContacto: string | null
  /** El talle que USA la modelo. ⛔ No es el talle de la prenda. `null` = todavía no se sabe. */
  talle: string | null
  altura: string | null
  medidas: MedidasModelo
  estado: EstadoModelo
  /** Vacío = las dos marcas. */
  marcas: string[]
  nota: string | null
  autor: string | null
  creado: string
  actualizado: string
}

/** Lo que la pantalla manda a guardar. Todo opcional salvo el nombre. */
export type ModeloEditable = Partial<Omit<Modelo, 'creado' | 'actualizado' | 'autor'>> & { nombre: string }

/**
 * La ficha **como la ve la sesión de fotos** para elegir a quién fotografió: cuatro campos y ⛔ nada
 * más.
 *
 * 🔴 **Es un tipo aparte y ⛔ no un `Modelo` con campos en `null`.** Quien carga una sesión puede no
 * tener la sección Modelos tildada, y devolverle la ficha entera con el teléfono, el mail y la
 * agencia en `null` **afirmaría que no los hay**: un `null` acá se leería «no tiene Instagram», no
 * «no te lo muestro». Es la misma trampa del cero que afirma. Lo que sale por `modo=elegibles` es la
 * respuesta a otra pregunta —«¿a quién puedo elegir?»— y por eso tiene su propia forma.
 */
export type ModeloElegible = Pick<Modelo, 'id' | 'nombre' | 'talle' | 'altura'>
