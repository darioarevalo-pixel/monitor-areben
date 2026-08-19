/**
 * La guía de una pantalla: los pasos que el tour recorre parándose sobre los controles REALES.
 *
 * Es la respuesta a "¿dónde se aprieta?", que es una pregunta distinta de la que contesta el
 * manual ("¿qué hago y qué pasa si sale mal?", `lib/manuales/tipos.ts`). Separarlas es lo que
 * evita que se contradigan: dos textos que cuentan lo mismo derivan; dos que contestan cosas
 * distintas, no.
 *
 * # Por qué la lógica está acá y no adentro del componente
 *
 * Porque es lo único de la pieza que puede estar mal **en silencio**: un globo que apunta a un
 * elemento que no existe queda flotando en una esquina y parece un problema de CSS. Acá se puede
 * mutar y los tests corren en Node sin DOM — el componente sólo pinta lo que estas funciones
 * deciden.
 *
 * # 🔑 La decisión que hace que el tour no envejezca: DOS anclas
 *
 * Media pantalla de un módulo sólo existe en algún estado. En Envíos, "Sugerir precios (N)" no
 * está si no hay filas sin cotizar, y el botón de WhatsApp de una fila no está si no hay filas.
 * Por eso cada paso declara:
 *
 *   · `ancla`     — algo que está SIEMPRE: un botón del header, un encabezado de columna, el
 *                   título de una card. Una tabla vacía sigue teniendo sus `<th>`.
 *   · `anclaFina` — el control puntual, que se usa **sólo si está en pantalla**.
 *
 * 🔴 **Y cuando el control fino no está, el paso NO se saltea.** Se muestra sobre el ancla estable
 * y el texto dice cuándo aparece. Un tour que se saltea pasos en silencio le enseña a la persona
 * una pantalla que no es la suya, y le esconde justo el botón que vino a buscar: el que no está
 * hoy es el que mañana no va a saber usar. Por eso acá NO existe ninguna función que filtre pasos
 * — no se puede regresar a lo que no está escrito.
 */

/** Una pestaña de la sección, si el paso vive en una. La sección la resuelve; acá es opaca. */
export type PasoBase = {
  /** El `data-guia` de algo que está SIEMPRE en esa pestaña. */
  ancla: string
  /** Una línea en criollo. Dice DÓNDE se aprieta, no la regla de negocio: ésa va en el manual. */
  texto: string
  /** La pestaña que hay que abrir antes de mostrarlo. Ausente = la que esté. */
  pestania?: string
}

/**
 * `anclaFina` y `siNoEsta` van juntas o no van: el tipo lo obliga.
 *
 * Es a propósito y es la mitad de la garantía. Si `siNoEsta` fuera opcional, un paso nuevo que
 * apunta a un control de fila se escribiría sin ella y, el día que la tabla esté vacía, el globo
 * diría una cosa señalando otra —sin fallar nada—. Con la unión, el typechecker señala a quien lo
 * escribe, en el momento en que lo escribe.
 */
export type PasoGuia = PasoBase &
  (
    | { anclaFina?: undefined; siNoEsta?: undefined }
    | {
        /** El `data-guia` del control puntual (el botón de una fila, una card condicional). */
        anclaFina: string
        /** Qué se dice cuando ese control no está en pantalla. Se agrega al final del texto. */
        siNoEsta: string
      }
  )

export type PasoResuelto = {
  /** El `data-guia` sobre el que hay que pararse AHORA. */
  ancla: string
  /** El texto que se muestra AHORA, con el aviso puesto si el control fino no está. */
  texto: string
  /** `true` cuando el paso declaraba un control fino y ese control no está en pantalla. */
  faltaElControl: boolean
}

/**
 * Qué mostrar de un paso, dado qué anclas existen en este momento.
 *
 * `existe` la provee quien tenga el DOM (el componente pregunta por `[data-guia="…"]`), así esta
 * función es pura y el test la ejerce con un `Set`.
 */
export function resolverPaso(paso: PasoGuia, existe: (ancla: string) => boolean): PasoResuelto {
  // Sin `anclaFina` no hay nada que resolver: el paso siempre se para en su ancla estable.
  if (!paso.anclaFina) return { ancla: paso.ancla, texto: paso.texto, faltaElControl: false }

  if (existe(paso.anclaFina)) return { ancla: paso.anclaFina, texto: paso.texto, faltaElControl: false }

  // 🔴 Acá está el caso que importa: se cae al ancla estable Y se lo dice. Devolver `paso.anclaFina`
  // igual dejaría el globo flotando en la esquina, que es un error de CSS a los ojos de cualquiera.
  return { ancla: paso.ancla, texto: `${paso.texto} ${paso.siNoEsta}`, faltaElControl: true }
}

/** El siguiente índice, o `null` cuando el tour terminó (el botón pasa a decir "Listo"). */
export function siguiente(i: number, total: number): number | null {
  return i + 1 < total ? i + 1 : null
}

/** El anterior, o `null` en el primero (donde "Atrás" no se dibuja). */
export function anterior(i: number): number | null {
  return i > 0 ? i - 1 : null
}

/**
 * Todas las anclas que una guía nombra, sin repetir.
 *
 * Existe para el test de deriva: lo que hay que afirmar contra el JSX son las anclas, y contarlas
 * a mano en el test sería la copia que después no se actualiza.
 */
export function anclasDeLaGuia(pasos: readonly PasoGuia[]): string[] {
  const todas = pasos.flatMap((p) => (p.anclaFina ? [p.ancla, p.anclaFina] : [p.ancla]))
  return [...new Set(todas)]
}
