/**
 * La modelo de la sesión: quién es y **qué talle usa**.
 *
 * Lo pidió Bruno el 3-sep-2026: *«dinámica sesión de fotos con talle de la modelo — para luego
 * cargar el talle que usa la modelo en la descripción del producto»*. Es el dato que la clienta
 * pregunta antes de comprar («¿cómo le queda?, ¿qué talle tiene puesto?») y que hoy ⛔ no está
 * escrito en ningún lado: se lo acuerda quien estuvo en la sesión, y para cuando alguien redacta
 * la ficha —días después, otra persona— ya no se puede preguntar.
 *
 * 🔑 **Es de la SESIÓN, no de la prenda.** La eligió así Bruno entre las tres formas posibles: una
 * sesión es una modelo, y su talle es el mismo en las 30 prendas que se prueba. Anotarlo prenda por
 * prenda sería 30 veces el mismo dato — y 30 lugares donde se puede escribir distinto. Cuando exista
 * la ficha de la modelo (Model Management, el punto 6 del mismo dictado) este campo pasa a salir de
 * ahí; hasta entonces se tipea, y por eso `nombre` es libre.
 *
 * 🔑 **La normalización del talle y de la altura ya ⛔ NO vive acá: vive en `lib/modelos/core.core.js`**
 * (3-sep-2026, cuando nació el padrón de modelos). Desde que hay DOS lugares donde se escribe el
 * talle de una modelo —su ficha y esta sesión—, la misma regla escrita dos veces se lee como un
 * descuido y el próximo que viera las dos las emparejaría mal. Acá se **re-exportan**, así que sus
 * consumidores (`SesionFotos.tsx`, `gen-desc`) no se enteraron. Es el mismo arreglo que
 * `lib/crm/telefono.core.js` con `lib/crm/core.ts`.
 *
 * ⚠️ **`talle` es lo obligatorio y `nombre` no.** Al revés de lo que parece: el talle es lo que va a
 * la descripción, y si el campo exigiera el nombre —que en el momento de la sesión no siempre se
 * sabe cómo se escribe— el dato que sirve se perdería por el que no. Un nombre sin talle no se
 * guarda: no contesta nada.
 */

import { alturaNormalizada as alturaNormalizadaJs, talleNormalizado as talleNormalizadoJs } from '@/lib/modelos/core.core.js'
import { fotografiables, respuestaFoto } from './fotografiado'
import type { Solicitud } from './tipos'

/**
 * La ficha del padrón, como la ve esta sesión. Es `ModeloElegible` de `lib/modelos/tipos`, escrito
 * acá como forma mínima para que el núcleo de la sesión ⛔ no dependa de la sección Modelos: la
 * sesión funciona igual sin padrón, que es como funcionó hasta el 3-sep-2026.
 */
export type FichaElegible = { id: string; nombre: string; talle?: string | null; altura?: string | null }

export type { ModeloSesion } from './tipos'
import type { ModeloSesion } from './tipos'

/** Lo que se puede editar de la ficha. `por` y `ts` los pone `conModelo`. */
export type ModeloEditable = { id?: string; nombre?: string; talle?: string; altura?: string }

const limpiar = (s: unknown) => String(s ?? '').trim().replace(/\s+/g, ' ')

/**
 * El talle y la altura, normalizados. **Los dos son re-exports del padrón de modelos**
 * (`lib/modelos/core.core.js`): el talle a MAYÚSCULAS y sin el prefijo «Talle», la altura siempre
 * como `1,70 m` y descartando lo que no parsea. El porqué de cada regla está allá, al lado de la
 * tabla que las guarda.
 */
export const talleNormalizado = talleNormalizadoJs as (v: unknown) => string
export const alturaNormalizada = alturaNormalizadaJs as (v: unknown) => string

/** ¿Hay algo que valga la pena guardar? El talle es lo que contesta la pregunta. */
export function hayModelo(m: ModeloSesion | undefined | null): m is ModeloSesion {
  return !!m && !!talleNormalizado(m.talle)
}

/**
 * Anota (o corrige) la modelo de la sesión. Solicitud → solicitud, como `conRespuestaFoto`.
 *
 * Sin talle **se borra la ficha entera**: no es que quede a medias, es que no contesta nada. Y así
 * el mismo gesto sirve para deshacer una carga equivocada, sin un botón «borrar» aparte.
 */
export function conModelo(s: Solicitud, edit: ModeloEditable, meta: { por: string; ts: number }): Solicitud {
  const talle = talleNormalizado(edit.talle)
  if (!talle) {
    if (!s.modelo) return s
    const { modelo: _fuera, ...resto } = s
    return resto as Solicitud
  }
  const nombre = limpiar(edit.nombre)
  const altura = alturaNormalizada(edit.altura)
  const id = limpiar(edit.id)
  return {
    ...s,
    modelo: {
      talle,
      ...(id ? { id } : {}),
      ...(nombre ? { nombre } : {}),
      ...(altura ? { altura } : {}),
      por: meta.por,
      ts: meta.ts,
    },
  }
}

/**
 * Lo que queda en el borrador cuando se **elige una ficha del padrón** (3-sep-2026).
 *
 * 🔑 **La ficha pisa lo tipeado, pero un dato que la ficha ⛔ NO tiene no pisa nada.** Elegir a
 * Sofi tiene que traer el talle de Sofi —para eso se elige—, y si su ficha todavía ⛔ no dice qué
 * talle usa, lo que ya estaba escrito en la sesión es lo único que hay: borrarlo sería cambiar un
 * dato por un vacío. Es la misma regla con la que `conModelo` ⛔ no guarda medidas en 0.
 *
 * ⚠️ **`null` es «se saca la ficha»**: el nombre y el talle quedan como están —la sesión los sigue
 * necesitando— y lo único que se va es el `id`, que es lo que dice «esto es del padrón».
 */
export function desdeFicha(f: FichaElegible | null, actual: ModeloEditable): ModeloEditable {
  if (!f) {
    const { id: _fuera, ...resto } = actual
    return resto
  }
  return {
    id: f.id,
    nombre: limpiar(f.nombre) || actual.nombre,
    talle: talleNormalizado(f.talle) || actual.talle,
    altura: alturaNormalizada(f.altura) || actual.altura,
  }
}

/**
 * La frase que va a la descripción del producto.
 *
 * ⛔ **No nombra a la modelo.** Es texto que lee una clienta y el nombre no le dice nada; adentro
 * del monitor sí se muestra, porque ahí la pregunta es a quién volver a llamar. Es el mismo corte
 * que separa `docs/secciones/novedades.md` de un commit.
 */
export function fraseDeModelo(m: ModeloSesion | undefined | null): string {
  if (!hayModelo(m)) return ''
  const talle = talleNormalizado(m.talle)
  const altura = alturaNormalizada(m.altura)
  return altura ? `La modelo mide ${altura} y usa talle ${talle}.` : `La modelo usa talle ${talle}.`
}

/** Cómo se lee la ficha adentro del monitor: ahí el nombre sí importa. */
export function resumenDeModelo(m: ModeloSesion | undefined | null): string {
  if (!hayModelo(m)) return ''
  const altura = alturaNormalizada(m.altura)
  return [m.nombre || 'Sin nombre', `talle ${talleNormalizado(m.talle)}`, altura].filter(Boolean).join(' · ')
}

/** Lo que la descripción de un producto puede decir, con de dónde salió. */
export type TalleDeModelo = {
  modelo: ModeloSesion
  /** La solicitud de la que salió, para poder ir a mirarla. */
  solicitudId: string
  /** YYYY-MM-DD de la sesión. */
  fecha: string
}

/**
 * Índice **por SKU** de qué modelo fotografió cada prenda. Es el puente con «Descripción y medidas».
 *
 * 🔑 **El puente es el SKU y ⛔ no el id del producto**: la sesión arma sus ítems con el catálogo de
 * Gestión Nube y la ficha se escribe sobre el de TiendaNube — son dos sistemas con dos numeraciones.
 * 📌 **Medido el 3-sep-2026 antes de escribir esto**: de los 79 SKU distintos que aparecen en las
 * sesiones de BDI, **79 cruzan** con un SKU de variante de TiendaNube. ⚠️ En Zattia —que es la única
 * marca donde corre `gen-desc`— no se pudo medir desde afuera: su tabla `solicitudes` tiene RLS y la
 * clave pública no entra.
 *
 * 🔴 **Una prenda contestada «no se fotografió» ⛔ NO entra.** Ahí la respuesta explícita dice que la
 * modelo no se la puso —«no entró en el look», «producto fallado»—, así que su descripción no puede
 * afirmar que la usó. Las que nadie contestó sí entran: salieron con la sesión, y `sin-contestar`
 * significa «nadie lo anotó», ⛔ no «no pasó» (ver `fotografiado.ts`).
 *
 * Gana **la sesión más nueva**: si una prenda se fotografió dos veces, la que vale es la última.
 */
export function talleDeModeloPorSku(sols: Solicitud[]): Map<string, TalleDeModelo> {
  const out = new Map<string, TalleDeModelo>()
  const ordenadas = [...sols].filter((s) => hayModelo(s.modelo)).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
  for (const s of ordenadas) {
    for (const i of fotografiables(s)) {
      if (respuestaFoto(s, i.vid) === 'no') continue
      const sku = limpiar(i.sku)
      if (!sku) continue
      // Las más nuevas se recorren al final: pisar es quedarse con la última.
      out.set(sku, { modelo: s.modelo as ModeloSesion, solicitudId: s.id, fecha: s.fecha })
    }
  }
  return out
}

/**
 * La modelo de un producto de TiendaNube, buscando por **cualquiera** de sus SKU.
 *
 * ⚠️ Un producto tiene varias variantes y la sesión se llevó **algunas**: alcanza con que una haya
 * salido para saber qué talle usa la modelo, porque el dato es de la SESIÓN y no de la prenda. Si
 * dos sesiones distintas tocaron dos variantes del mismo producto, gana la más nueva — que es la
 * misma regla que ya aplicó `talleDeModeloPorSku` al armar el índice.
 */
export function modeloDeProducto(skus: readonly string[], idx: Map<string, TalleDeModelo>): TalleDeModelo | null {
  let mejor: TalleDeModelo | null = null
  for (const sku of skus) {
    const t = idx.get(String(sku || '').trim())
    if (t && (!mejor || String(t.fecha) > String(mejor.fecha))) mejor = t
  }
  return mejor
}
