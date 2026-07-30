/**
 * Auditoría de fotos por color: lo que `fchk.ts` no puede ver.
 *
 * `fchk` se pregunta "¿este color tiene alguna foto?". Eso deja pasar el error más caro, que es
 * **la misma foto vinculada a dos colores distintos**: el producto figura como "4 de 4 colores
 * con foto ✓" y el filtro de problemas lo esconde, mientras dos de esos cuatro colores están
 * mostrando la funda equivocada. BORDER CASE —el caso que originó esta auditoría— es
 * exactamente eso, y hoy es invisible en la pantalla que debería encontrarlo.
 *
 * Al probarlo sobre las tiendas reales: 5 productos en BDI y 6 en Zattia.
 *
 * Además de detectar, este módulo hace tres cosas que cambian cómo se prioriza el trabajo:
 *
 * 1. **Parte "pendiente" en dos colas.** Si la foto de ese color ya existe en el producto es
 *    trabajo de escritorio (cinco segundos); si no existe ninguna, es trabajo de fotografía y
 *    no hay nada que hacer en la pantalla. Hoy los dos aparecen igual y el que revisa pierde
 *    tiempo buscando una foto que no existe.
 *
 * 2. **Cuenta publicaciones, no productos.** BORDER CASE tiene 3 variantes afectadas;
 *    PROTECTOR DE CÁMARA METALIZADO tiene 63. Veintiuna veces más. Contar productos los pone a
 *    los dos en la misma fila y hace que se les dedique el mismo esfuerzo.
 *
 * 3. **Firma el estado revisado** para que el "Verificado" caduque solo cuando alguien toca las
 *    fotos. Sin eso, un verificado viejo tapa un error nuevo, que es peor que no auditar: da
 *    confianza falsa.
 *
 * Puro y testeable: no toca red ni estado.
 */

import type { ImagenFchk, ProductoFchk, VarianteFchk } from './tipos'

/** Un choque: una misma foto vinculada a dos o más colores. */
export type Choque = {
  /** La URL compartida (es el mismo archivo: por eso el choque es un hecho, no una sospecha). */
  foto: string
  /** Los colores que se la están repartiendo, ordenados. */
  colores: string[]
  /** Cuántas variantes salen mal por este choque. Es la unidad que importa: son publicaciones. */
  variantes: number
}

/** En qué cola de trabajo cae el producto. */
export type Cola =
  /** La foto ya existe en el producto: se resuelve en la pantalla, en segundos. */
  | 'escritorio'
  /** No hay ninguna foto para ese color: hay que fotografiar. La pantalla solo lo avisa. */
  | 'fotografia'
  /** Parte se resuelve acá y parte necesita fotos nuevas. */
  | 'mixto'
  /** No hay nada que hacer. */
  | 'sin-trabajo'

export type EstadoFotos = {
  /** Colores distintos que tiene el producto en sus variantes. */
  colores: string[]
  /** La misma foto en dos o más colores. Vacío = no hay error de este tipo. */
  choques: Choque[]
  /** Colores sin ninguna foto vinculada. */
  sinFoto: string[]
  /** Fotos del producto que no está usando ningún color (material disponible para vincular). */
  fotosLibres: ImagenFchk[]
  /** Variantes que hoy salen con la foto equivocada. */
  variantesCruzadas: number
  /** Variantes de un color sin foto. */
  variantesSinFoto: number
  cola: Cola
  /** `true` si hay algo que la auditoría considera roto. */
  hayProblema: boolean
}

/** Solo las variantes que aportan a la auditoría: las que declaran un color. */
function variantesConColor(p: ProductoFchk): VarianteFchk[] {
  return (p.variantes || []).filter((v) => !!v.color)
}

/**
 * El producto tiene el color **adentro de la variante** (más de un color distinto).
 *
 * Es el único caso donde una foto puede terminar en el color equivocado: cuando el color está
 * en el nombre del producto (`WEAVE CASE BLACK`), el producto entero es de un solo color y
 * todas sus fotos son de ese color. Medido: 37 productos en BDI, 288 en Zattia.
 */
export function colorEnVariante(p: ProductoFchk): boolean {
  return coloresDe(p).length > 1
}

/** Los colores distintos del producto, ordenados. */
export function coloresDe(p: ProductoFchk): string[] {
  const set = new Set<string>()
  for (const v of variantesConColor(p)) set.add(v.color as string)
  return [...set].sort((a, b) => a.localeCompare(b, 'es'))
}

/**
 * Los choques del producto: fotos compartidas por dos o más colores.
 *
 * Se agrupa por `image_url` y no por id de imagen porque es lo que el audit trae a nivel
 * variante, y es el mismo archivo servido por TiendaNube: dos colores con la misma URL están
 * mostrando literalmente la misma foto.
 */
export function choquesDe(p: ProductoFchk): Choque[] {
  const porFoto = new Map<string, { colores: Set<string>; variantes: number }>()
  for (const v of variantesConColor(p)) {
    if (!v.image_url) continue
    const e = porFoto.get(v.image_url) ?? { colores: new Set<string>(), variantes: 0 }
    e.colores.add(v.color as string)
    e.variantes += 1
    porFoto.set(v.image_url, e)
  }
  const out: Choque[] = []
  for (const [foto, e] of porFoto) {
    if (e.colores.size < 2) continue
    out.push({ foto, colores: [...e.colores].sort((a, b) => a.localeCompare(b, 'es')), variantes: e.variantes })
  }
  // Primero el choque que ensucia más publicaciones.
  return out.sort((a, b) => b.variantes - a.variantes || b.colores.length - a.colores.length)
}

/** Colores sin ninguna foto vinculada, ordenados. Ignora variantes sin color (usan la principal). */
export function coloresSinFoto(p: ProductoFchk): string[] {
  const con = new Set<string>()
  const todos = new Set<string>()
  for (const v of variantesConColor(p)) {
    todos.add(v.color as string)
    if (v.image_url) con.add(v.color as string)
  }
  return [...todos].filter((c) => !con.has(c)).sort((a, b) => a.localeCompare(b, 'es'))
}

/**
 * Fotos del producto que ningún color está usando. Es lo que decide la cola de trabajo: si
 * sobran fotos, el arreglo se hace acá; si no sobra ninguna, hay que fotografiar.
 *
 * El cruce va por `src` porque las variantes traen la URL, no el id de la imagen.
 */
export function fotosLibresDe(p: ProductoFchk): ImagenFchk[] {
  const usadas = new Set<string>()
  for (const v of variantesConColor(p)) if (v.image_url) usadas.add(v.image_url)
  return (p.imagenes || []).filter((im) => im.src && !usadas.has(im.src))
}

/** El estado completo de fotos del producto, que es lo que consume la pantalla. */
export function estadoDe(p: ProductoFchk): EstadoFotos {
  const colores = coloresDe(p)
  const choques = choquesDe(p)
  const sinFoto = coloresSinFoto(p)
  const fotosLibres = fotosLibresDe(p)

  // Un choque de N colores ensucia todas sus variantes menos las de UN color, que es el que
  // legítimamente le corresponde a esa foto. No se sabe cuál de los N es el bueno, pero sí que
  // uno lo es: contar las N sería inflar el problema.
  const variantesCruzadas = choques.reduce((acc, c) => acc + Math.round((c.variantes * (c.colores.length - 1)) / c.colores.length), 0)
  const variantesSinFoto = variantesConColor(p).filter((v) => !v.image_url).length

  const porResolver = choques.length + sinFoto.length
  const cola: Cola = !porResolver
    ? 'sin-trabajo'
    : fotosLibres.length === 0
      ? 'fotografia'
      : fotosLibres.length >= porResolver
        ? 'escritorio'
        : 'mixto'

  return { colores, choques, sinFoto, fotosLibres, variantesCruzadas, variantesSinFoto, cola, hayProblema: porResolver > 0 }
}

/**
 * Un color tal como se muestra en la ficha: su foto, con quién la comparte, cuántos modelos
 * cubre y si el nombre del archivo desentona.
 *
 * Es la vista que hace posible el repaso a ojo, que es la mitad del trabajo que ninguna
 * automatización puede hacer: nadie puede mirar una foto y decir de qué color es.
 */
export type ColorEnFicha = {
  color: string
  foto: string | null
  /** Otros colores que están usando la MISMA foto. Vacío = la foto es solo suya. */
  comparteCon: string[]
  /** Cuántas variantes (modelos) tiene este color. */
  variantes: number
  /** Cuántas de esas variantes están sin foto. */
  variantesSinFoto: number
  sospecha: Sospecha | null
}

/** La ficha del producto: un renglón por color, en orden alfabético. */
export function fichaDe(p: ProductoFchk): ColorEnFicha[] {
  const porColor = new Map<string, { foto: string | null; variantes: number; sinFoto: number }>()
  for (const v of variantesConColor(p)) {
    const c = v.color as string
    const e = porColor.get(c) ?? { foto: null, variantes: 0, sinFoto: 0 }
    e.variantes += 1
    if (v.image_url) {
      if (!e.foto) e.foto = v.image_url
    } else {
      e.sinFoto += 1
    }
    porColor.set(c, e)
  }
  const sospechas = new Map(sospechasDe(p).map((s) => [s.color, s]))
  const choques = choquesDe(p)
  return [...porColor.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'es'))
    .map(([color, e]) => ({
      color,
      foto: e.foto,
      comparteCon: e.foto ? (choques.find((c) => c.foto === e.foto)?.colores || []).filter((c) => c !== color) : [],
      variantes: e.variantes,
      variantesSinFoto: e.sinFoto,
      sospecha: sospechas.get(color) ?? null,
    }))
}

// ── Nombre de archivo vs color ──────────────────────────────────────────────────
/**
 * Sospecha de foto cruzada por el nombre del archivo (`mag-case-shadow-black-…` en el color
 * `AZUL`). Es una **pista, no un hecho**: los nombres pueden ser viejos porque se renombraron
 * los colores y quedaron los archivos originales, que es lo que se concluyó con MAG CASE en
 * junio de 2026.
 *
 * Los sinónimos evitan el ruido: el mismo color en el otro idioma no es un error. Sin esta
 * tabla, el chequeo marca `PINK`/`rosa` y `BLACK`/`negro` en media tienda y se vuelve inservible.
 */
const SINONIMOS: Record<string, string[]> = {
  negro: ['black', 'negra', 'negro'],
  /**
   * Blanco, crema, beige, natural y off-white van juntos a propósito. En ropa son casi el
   * mismo color y las fotos se nombran sueltas: separarlos marcaba `OFF WHITE`~beige y
   * `CREMA`~blanco en media Zattia. Un chequeo que marca de más no lo mira nadie.
   */
  claro: ['white', 'blanca', 'blanco', 'off-white', 'offwhite', 'beige', 'crema', 'cream', 'natural', 'nude', 'marfil'],
  rosa: ['pink', 'rose', 'rosa', 'rosado'],
  rojo: ['red', 'roja', 'rojo'],
  plata: ['silver', 'plateado', 'plateada', 'plata', 'gris', 'gray', 'grey'],
  dorado: ['gold', 'golden', 'dorada', 'dorado'],
  azul: ['blue', 'azul', 'celeste'],
  verde: ['green', 'verde'],
  violeta: ['purple', 'violet', 'lavender', 'lila', 'violeta'],
  marron: ['brown', 'chocolate', 'marron', 'marrón', 'cafe', 'café', 'vizon', 'vizón'],
  amarillo: ['yellow', 'amarillo', 'amarilla'],
  naranja: ['orange', 'naranja'],
  bordo: ['bordo', 'bordó', 'vino', 'wine', 'burgundy'],
}

/** Normaliza para comparar: minúsculas, sin acentos, sin signos. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // los acentos, ya separados por NFD
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** La familia de color a la que pertenece una palabra, o null si no se reconoce. */
function familiaDe(palabra: string): string | null {
  const w = norm(palabra)
  if (!w) return null
  for (const [familia, alias] of Object.entries(SINONIMOS)) {
    if (alias.some((a) => norm(a) === w)) return familia
  }
  return null
}

/** Las familias de color que se leen en un texto libre (nombre de color o de archivo). */
export function familiasEn(texto: string): Set<string> {
  const out = new Set<string>()
  for (const palabra of norm(texto).split(' ')) {
    const f = familiaDe(palabra)
    if (f) out.add(f)
  }
  return out
}

/** El nombre de archivo de una URL de TiendaNube, sin extensión ni el hash que le agrega TN. */
export function nombreArchivo(url: string): string {
  const sinQuery = url.split('?')[0]
  const base = sinQuery.substring(sinQuery.lastIndexOf('/') + 1)
  return base.replace(/\.[a-z0-9]+$/i, '').replace(/-[0-9a-f]{6,}$/i, '')
}

export type Sospecha = { color: string; archivo: string; familiaColor: string; familiaArchivo: string }

/**
 * Colores cuya foto tiene un nombre de archivo que apunta a OTRA familia de color.
 *
 * Solo se reporta cuando las dos partes se reconocen y **no coinciden**: si el archivo no dice
 * ningún color (o dice el mismo en otro idioma), no hay nada que mirar. Es lo que hace que
 * `PINK`→`rosa.jpg` no aparezca.
 */
export function sospechasDe(p: ProductoFchk): Sospecha[] {
  const vistos = new Set<string>()
  const out: Sospecha[] = []
  for (const v of variantesConColor(p)) {
    if (!v.image_url) continue
    const color = v.color as string
    if (vistos.has(color)) continue
    vistos.add(color)
    const fc = familiasEn(color)
    if (!fc.size) continue
    const archivo = nombreArchivo(v.image_url)
    const fa = familiasEn(archivo)
    if (!fa.size) continue
    // Si comparten alguna familia, están de acuerdo: no es sospecha.
    if ([...fc].some((f) => fa.has(f))) continue
    out.push({ color, archivo, familiaColor: [...fc][0], familiaArchivo: [...fa][0] })
  }
  return out
}

// ── Firma del estado revisado ───────────────────────────────────────────────────
/**
 * Firma corta del estado de fotos del producto. Es lo que hace que el "Verificado" caduque
 * solo: se guarda junto con la marca de revisado y, al abrir la pantalla, se compara. Si
 * alguien cargó o revinculó una foto, la firma cambia y el producto **vuelve solo a la lista**.
 *
 * Entra el mapa color → foto (ordenado, para que no dependa del orden en que TN devuelva las
 * variantes) **y los ids de las fotos del producto**. Lo segundo importa: subir una foto nueva
 * sin vincularla no cambia el mapa, pero sí cambia lo que hay para revisar.
 */
export function huellaDe(p: ProductoFchk): string {
  const porColor = new Map<string, string>()
  for (const v of variantesConColor(p)) {
    const c = v.color as string
    if (!porColor.has(c) && v.image_url) porColor.set(c, v.image_url)
  }
  const colores = [...porColor.keys()].sort((a, b) => a.localeCompare(b, 'es'))
  const mapa = colores.map((c) => `${c}=${porColor.get(c) ?? ''}`).join('|')
  const fotos = (p.imagenes || [])
    .map((im) => String(im.id))
    .sort()
    .join(',')
  return hash(`${mapa}#${fotos}`)
}

/**
 * FNV-1a de 32 bits en hexa. Alcanza y sobra: la firma no es un secreto, solo tiene que cambiar
 * cuando cambia el contenido. Se usa esto y no `crypto.subtle` porque ese es asíncrono y esto
 * se calcula mientras se dibuja la lista.
 */
function hash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
