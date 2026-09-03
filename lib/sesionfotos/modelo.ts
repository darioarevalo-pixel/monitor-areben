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
 * ⚠️ **`talle` es lo obligatorio y `nombre` no.** Al revés de lo que parece: el talle es lo que va a
 * la descripción, y si el campo exigiera el nombre —que en el momento de la sesión no siempre se
 * sabe cómo se escribe— el dato que sirve se perdería por el que no. Un nombre sin talle no se
 * guarda: no contesta nada.
 */

import { fotografiables, respuestaFoto } from './fotografiado'
import type { Solicitud } from './tipos'

export type { ModeloSesion } from './tipos'
import type { ModeloSesion } from './tipos'

/** Lo que se puede editar de la ficha. `por` y `ts` los pone `conModelo`. */
export type ModeloEditable = { nombre?: string; talle?: string; altura?: string }

const limpiar = (s: unknown) => String(s ?? '').trim().replace(/\s+/g, ' ')

/**
 * El talle, normalizado a MAYÚSCULAS.
 *
 * ⛔ No es cosmético y ⛔ no es una lista cerrada. Los talles de Zattia conviven en dos alfabetos
 * —`S`/`M`/`L` y `38`/`40`/`42`— y encima aparecen como `Talle M` o `m` según quién escriba. Sin
 * normalizar, «m» y «M» son dos talles distintos para cualquier cosa que después quiera agrupar.
 * Cerrar la lista sería peor: el día que entre un `XXL` o un `Único` el campo lo rechazaría y la
 * sesión quedaría sin el dato, que es el único fracaso que este módulo no puede permitirse.
 */
export function talleNormalizado(v: unknown): string {
  return limpiar(v).replace(/^talles?\s+/i, '').toUpperCase()
}

/**
 * La altura, siempre en metros y con coma: `1,70 m`.
 *
 * Se escribe de cuatro maneras (`170`, `1.70`, `1,70`, `1,70 m`) y las cuatro quieren decir lo
 * mismo. La que se guarda es una sola, porque este texto sale tal cual a la ficha del producto.
 * ⛔ Lo que no parsea se descarta en vez de guardarse crudo: una altura que no es una altura
 * escrita en la descripción de una prenda es peor que no tenerla.
 */
export function alturaNormalizada(v: unknown): string {
  const t = limpiar(v).replace(/\s*m\.?$/i, '').replace(',', '.')
  if (!t) return ''
  const n = Number(t)
  if (!Number.isFinite(n) || n <= 0) return ''
  // 170 y 1,70 son la misma persona: arriba de 3 se lee como centímetros.
  const metros = n > 3 ? n / 100 : n
  if (metros < 1.2 || metros > 2.2) return ''
  return `${metros.toFixed(2).replace('.', ',')} m`
}

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
  return {
    ...s,
    modelo: { talle, ...(nombre ? { nombre } : {}), ...(altura ? { altura } : {}), por: meta.por, ts: meta.ts },
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
