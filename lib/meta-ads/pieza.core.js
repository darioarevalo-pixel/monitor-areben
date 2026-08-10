/**
 * La **pieza**: cómo se lee el copy de un aviso modelo y cómo se arma un creativo NUEVO con una
 * imagen o un video que todavía no existían en Meta.
 *
 * # Qué problema resuelve
 *
 * Hasta acá el motor sabía crear avisos **reusando un `creative_id` que ya existe**
 * (`armarPlanCrear`, `armarPlanDuplicar`): la pieza y el copy venían juntos, de algo que ya estaba
 * en la cuenta. Eso alcanza para multiplicar lo que ya entrega y no alcanza para lo único que se
 * hace todas las semanas — **probar una pieza nueva con el copy que ya funciona**.
 *
 * Este archivo es la mitad pura de eso: recibe el creativo del aviso modelo tal como lo devolvió
 * Graph y devuelve el cuerpo del `POST act_<id>/adcreatives` con la pieza cambiada.
 *
 * # 🔑 Por qué se parte de un aviso modelo y no de un formulario
 *
 * Misma decisión que `receta.core.js` con la segmentación, y por el mismo motivo: un creativo tiene
 * página, cuenta de Instagram, texto, título, descripción, destino y botón. Pedirlos en una
 * pantalla es siete campos para equivocarse y una pantalla que mantener; leerlos de un aviso que
 * **hoy está entregando** es cero campos y la garantía de que la combinación ya fue aceptada por
 * Meta alguna vez. Lo único que cambia es la pieza, que es justamente lo que se está probando.
 *
 * # ⛔ Lo que este archivo NO pone, a propósito
 *
 * **`name` no sale de acá.** Lo pone el motor, porque lleva la marca del paso: sin ella la sonda no
 * puede adoptar lo que Meta ya creó y un corte a la mitad crearía un segundo creativo. Es la misma
 * frontera que documenta `recetaDeConjunto()`.
 *
 * **`degrees_of_freedom_spec` tampoco.** Meta lo devuelve al leer y lo rechaza al escribir en varias
 * de estas cuentas — es el mismo rechazo que `?recurso=mejoras` documenta y que el motor esquiva
 * hoy armando el aviso desde el `creative_id`. Un creativo nuevo nace sin ese campo y por eso no
 * puede arrastrarlo.
 *
 * # Es PURO
 *
 * No habla con Meta ni con la base. Es `.js` plano porque lo importa `api/_meta-planes.js`, que
 * corre en Node sin pasar por el compilador de Next; `pieza.ts` es el re-export tipado.
 */

/**
 * Los campos del creativo modelo que hay que leer.
 *
 * ⚠️ **La lista es corta a propósito y es la misma trampa que documenta `CAMPOS_RECETA`**: un solo
 * campo inexistente o bloqueado por un GK anula la consulta ENTERA y no vuelve nada. Acá se piden
 * sólo campos de primer nivel que ya se leen hoy en la Biblioteca (`creativos.core.js`), o sea que
 * están medidos contra las cuentas reales y no sacados de la documentación.
 */
export const CAMPOS_CREATIVO_MODELO = [
  'id', 'name', 'title', 'body', 'object_story_spec', 'effective_object_story_id',
].join(',')

/** Hasta cuántas piezas entran en una tanda. Mismo tope que los creativos de `crear`. */
export const TOPE_PIEZAS = 10

/**
 * Las extensiones que se aceptan, y de qué clase es cada una.
 *
 * 🔑 **La clase se decide por la extensión y no por el `type` que informa el browser**: un archivo
 * que llega de Drive puede venir con `application/octet-stream` y ahí el `type` no dice nada. La
 * extensión la puso quien exportó el video y es lo único que viaja igual por los dos caminos.
 */
export const CLASE_POR_EXTENSION = {
  mp4: 'video', mov: 'video', m4v: 'video', avi: 'video', webm: 'video',
  jpg: 'imagen', jpeg: 'imagen', png: 'imagen', gif: 'imagen', webp: 'imagen',
}

/** `'video' | 'imagen' | null`. `null` es «no sé qué es esto», que se rechaza antes de subir nada. */
export function claseDePieza(nombre) {
  const ext = String(nombre || '').toLowerCase().split('.').pop()
  return CLASE_POR_EXTENSION[ext] || null
}

const err = (status, error) => ({ ok: false, status, error })

const texto = (v) => {
  const s = v === undefined || v === null ? '' : String(v)
  return s.trim() ? s : null
}

/**
 * A dónde manda un aviso, leído de su `object_story_spec`.
 *
 * 🔴 **En un aviso de video el destino vive ADENTRO del botón**, no al lado: `link_data.link` es de
 * los avisos de imagen, y un `video_data` lo lleva en `call_to_action.value.link`. Leyendo sólo el
 * primero —que es lo que hacía `piezaDe()`— los **5 avisos de video de BDI**, que son exactamente
 * los únicos que sirven de modelo para una pieza, salían en pantalla como «Sin destino legible»
 * mientras el servidor los aceptaba sin chistar. Medido el 9-ago-2026 contra las dos campañas: 0
 * de 18 avisos mostraban destino.
 *
 * ⚠️ Que la frase de la pantalla fuera **la misma** que la del rechazo (`copyDeCreativo`) es lo que
 * la volvía cara: quien la leía descartaba el modelo bueno creyendo que ya sabía cómo iba a
 * terminar.
 *
 * 🔑 Vive en este archivo, que es el puro y el que no importa nada, para que la lectura que
 * **valida** y la que **dibuja** sean la misma función. Misma regla que `permisos.core.js`: dos
 * implementaciones del mismo dato terminan discrepando, y la que se ve no es la que decide.
 */
export function destinoDe(spec) {
  const s = spec || {}
  const link = s.link_data || {}
  const video = s.video_data || {}
  const cta = link.call_to_action || video.call_to_action || {}
  return texto(link.link) || texto(cta.value && cta.value.link)
}

/**
 * El **copy** del aviso modelo: todo lo que hace a un creativo menos la pieza.
 *
 * La cadena de respaldos no es paranoia, es la misma de `piezaDe()`: el mismo dato vive en un lugar
 * distinto según el formato. Un aviso de imagen tiene el texto en `link_data.message`; uno de video,
 * en `video_data.message`; y el título puede estar arriba (`title`) o adentro (`link_data.name`).
 *
 * # Los tres rechazos, y por qué son rechazos y no arreglos
 *
 * ⛔ **Una publicación promocionada no sirve de modelo.** Meta no entrega ni el copy ni el destino de
 * un aviso armado desde un posteo (`effective_object_story_id` sin `object_story_spec`): lo único
 * que llega es la miniatura. Deducir el copy de ahí sería inventarlo.
 *
 * ⛔ **Un carrusel tampoco.** Su texto está repartido en las tarjetas y la pieza nueva es una sola:
 * no hay forma de trasladar N destinos a una pieza sin elegir por el otro.
 *
 * ⛔ **Sin `page_id` no hay creativo.** Es el único campo del que Meta no acepta ausencia, y además
 * es el que decide de qué página sale el aviso — o sea, algo que no se puede poner por defecto.
 */
export function copyDeCreativo(cr) {
  const c = cr || {}
  const spec = c.object_story_spec || {}
  const link = spec.link_data || {}
  const video = spec.video_data || {}
  const hijos = Array.isArray(link.child_attachments) ? link.child_attachments : []

  if (hijos.length > 1) {
    return err(409, 'Ese aviso es un carrusel: su texto y su destino están repartidos en las tarjetas, así que no se puede usar de modelo para una pieza sola. Elegí un aviso de imagen o de video.')
  }
  if (!spec.link_data && !spec.video_data && c.effective_object_story_id) {
    return err(409, 'Ese aviso está armado desde una publicación, y de esos Meta no entrega ni el texto ni el destino. Elegí uno que tenga creativo propio.')
  }

  const pageId = texto(spec.page_id)
  if (!pageId) {
    return err(409, 'Ese aviso no dice de qué página sale, así que no se puede armar uno nuevo con su copy. Elegí otro de modelo.')
  }

  const cta = (link.call_to_action || video.call_to_action || {})
  const destino = destinoDe(spec)
  if (!destino) {
    return err(409, 'Ese aviso no tiene destino legible, y un aviso sin destino no lleva a ningún lado. Elegí otro de modelo.')
  }

  return {
    ok: true,
    copy: {
      pageId,
      // Meta devolvió `instagram_actor_id` durante años y hoy manda `instagram_user_id`. Se leen los
      // dos porque en las cuentas conviven avisos viejos y nuevos, y el que falte queda en `null`:
      // sin cuenta de Instagram el aviso sale sólo por Facebook, que es degradar, no romper.
      instagramId: texto(spec.instagram_user_id) || texto(spec.instagram_actor_id),
      mensaje: texto(link.message) || texto(video.message) || texto(c.body),
      titulo: texto(c.title) || texto(link.name) || texto(video.title),
      descripcion: texto(link.description) || texto(video.link_description),
      destino,
      cta: texto(cta.type),
    },
  }
}

/**
 * El cuerpo del `POST act_<id>/adcreatives` para una pieza nueva con el copy del modelo.
 *
 * `pieza` es `{ clase: 'video', videoId, miniatura }` o `{ clase: 'imagen', url }`.
 *
 * 🔑 **Un video exige miniatura y una imagen no.** `video_data` sin `image_url` ni `image_hash` es un
 * rechazo de Meta, y la miniatura sale de las que Meta genera solo al procesar el video — o sea que
 * el paso que espera a que el video esté listo no es opcional ni es prolijidad: es de dónde sale
 * este campo.
 *
 * ⚠️ El botón se copia **sólo si el modelo tenía uno**. Poner `LEARN_MORE` por defecto sería cambiar
 * el aviso en la única dimensión que nadie pidió cambiar.
 */
export function cuerpoDeCreativo(copy, pieza) {
  const c = copy || {}
  const p = pieza || {}
  if (!c.pageId) return err(500, 'Falta la página del copy: no se puede armar el creativo.')

  const boton = c.cta ? { call_to_action: { type: c.cta, value: { link: c.destino } } } : {}
  let contenido

  if (p.clase === 'video') {
    if (!p.videoId) return err(500, 'Falta el id del video en Meta: no se puede armar el creativo.')
    if (!p.miniatura) {
      return err(409, 'Meta todavía no generó ninguna miniatura para ese video, y un creativo de video sin miniatura lo rechaza. Volvé a intentarlo en un rato.')
    }
    contenido = {
      video_data: {
        video_id: String(p.videoId),
        image_url: String(p.miniatura),
        ...(c.mensaje ? { message: c.mensaje } : {}),
        ...(c.titulo ? { title: c.titulo } : {}),
        ...(c.descripcion ? { link_description: c.descripcion } : {}),
        // ⛔ Un `video_data` sin `call_to_action` no tiene dónde llevar el `link`: en este formato el
        // destino vive ADENTRO del botón, no al lado. Sin botón, el aviso no lleva a ningún lado, así
        // que acá el botón deja de ser opcional y se cae al de Meta por defecto.
        call_to_action: boton.call_to_action || { type: 'LEARN_MORE', value: { link: c.destino } },
      },
    }
  } else if (p.clase === 'imagen') {
    if (!p.url) return err(500, 'Falta la URL de la imagen: no se puede armar el creativo.')
    contenido = {
      link_data: {
        // 🔑 Una imagen NO se sube a Meta: `picture` toma una URL pública y Meta se la baja sola. Por
        // eso el camino de la imagen no tiene ni paso de subida ni paso de espera.
        picture: String(p.url),
        link: c.destino,
        ...(c.mensaje ? { message: c.mensaje } : {}),
        ...(c.titulo ? { name: c.titulo } : {}),
        ...(c.descripcion ? { description: c.descripcion } : {}),
        ...boton,
      },
    }
  } else {
    return err(400, `No sé qué clase de pieza es «${p.clase || 'sin clase'}».`)
  }

  return {
    ok: true,
    cuerpo: {
      object_story_spec: JSON.stringify({
        page_id: c.pageId,
        ...(c.instagramId ? { instagram_user_id: c.instagramId } : {}),
        ...contenido,
      }),
    },
  }
}

/**
 * Las piezas que llegaron de la pantalla, validadas ANTES de armar un solo paso.
 *
 * ⚠️ Se valida acá y no en el handler porque es lo que decide **cuántos pasos tiene el plan**: una
 * pieza de clase desconocida no se puede subir ni convertir en creativo, y descubrirlo en el paso 1
 * dejaría un plan atascado con un conjunto ya creado al lado.
 */
export function validarPiezas(piezas) {
  const ps = Array.isArray(piezas) ? piezas : []
  if (!ps.length) return err(400, 'No hay ninguna pieza: elegí al menos un archivo.')
  if (ps.length > TOPE_PIEZAS) {
    return err(409, `Son ${ps.length} piezas y se cargan hasta ${TOPE_PIEZAS} por tanda.`)
  }

  const salida = []
  for (const p of ps) {
    const nombre = texto(p && p.nombre)
    const url = texto(p && p.url)
    if (!nombre || !url) return err(400, 'Hay una pieza sin nombre o sin archivo subido.')
    // ⛔ La URL tiene que ser pública y nuestra: es la que Meta va a ir a buscar. Una `blob:` o una
    // `data:` del browser no la puede bajar nadie desde afuera, y el rechazo llegaría recién en el
    // paso de subida, con el conjunto ya creado.
    if (!/^https:\/\//i.test(url)) {
      return err(400, `La pieza «${nombre}» no tiene una URL pública: Meta la tiene que poder bajar.`)
    }
    const clase = claseDePieza(nombre)
    if (!clase) {
      return err(400, `No reconozco «${nombre}» como imagen ni como video. Se aceptan ${Object.keys(CLASE_POR_EXTENSION).join(', ')}.`)
    }
    salida.push({ nombre, url, clase })
  }
  return { ok: true, piezas: salida }
}

/**
 * ¿El token puede publicar desde esta página?
 *
 * 🔴 **Preguntárselo al nodo Página es preguntar por la puerta equivocada.** `GET /<page_id>` lee la
 * ficha y exige `pages_read_engagement`; el token del monitor tiene `pages_show_list`, que sólo
 * habilita **listarlas** por `/me/accounts`. El 9-ago-2026 eso costó una hora: armar una pieza de BDI
 * fallaba con «(#100) missing permission» sobre la página `264601567300555`, en el Business Manager
 * esa página decía **«Ya se asignó»**, y las dos cosas eran ciertas. El chequeo era más exigente que
 * la operación que protegía — crear un creativo va con `ads_management` y el activo asignado, sin
 * leer nada.
 *
 * ⚠️ **`null` no es «no la tiene»: es «no se pudo preguntar»**, y ahí NO se frena. Un guardarraíl
 * existe para ahorrar una subida al pedo, no para inventar un bloqueo con la información que le
 * falta; el costo de dejar pasar es un video subido y un rechazo de Meta, y el de frenar de más es
 * exactamente la hora que se perdió. Mismo criterio que «sin foto no se apaga», al revés: acá la
 * dirección barata es dejar seguir.
 */
export function puedeUsarLaPagina(pageId, paginas) {
  if (!Array.isArray(paginas)) return { ok: true, verificado: false, nombre: null }
  const id = texto(pageId)
  // El nombre sale de ACÁ y no de una lectura aparte: es el dato que la misma respuesta ya trajo, y
  // pedirlo de nuevo sería volver a la puerta que este token no puede abrir.
  const suya = paginas.find((p) => texto(p && p.id) === id)
  if (suya) return { ok: true, verificado: true, nombre: texto(suya.nombre) }
  const lista = paginas.map((p) => `${(p && p.nombre) || 's/n'} (${(p && p.id) || '?'})`).join(', ')
  return {
    ok: false,
    verificado: true,
    error: `El aviso modelo publica desde la página ${id}, que el usuario del sistema no maneja. ${
      paginas.length ? `Las que sí maneja son: ${lista}.` : 'Hoy no maneja ninguna.'
    } Se agrega en el Business Manager, como activo del usuario del sistema.`,
  }
}
