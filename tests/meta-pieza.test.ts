import { describe, expect, it } from 'vitest'
import {
  ajustesDelAviso,
  claseDePieza,
  copyDeCreativo,
  copyDelFormulario,
  CTAS,
  cuerpoDeCreativo,
  destinoDe,
  LARGO_TEXTOS,
  puedeUsarLaPagina,
  soloAjustes,
  textosDelCopy,
  TOPE_PIEZAS,
  validarPiezas,
  validarUrlTags,
  type CopyDeAviso,
  type CreativoLeido,
} from '@/lib/meta-ads/pieza'
import { piezaDe } from '@/lib/meta-ads/creativos.core.js'

/**
 * El aviso de cero: lo que se ELIGE además del texto. El riesgo que ordena los casos es el mismo del
 * destino: **Meta acepta un destino de cualquier dominio** (medido el 15-sep-2026), así que lo que se
 * fija acá es qué no pasa el guard.
 */
describe('ajustesDelAviso — destino, botón, página y UTM, cada uno con su guard', () => {
  const base: CopyDeAviso = {
    pageId: '264601567300555', instagramId: '17841404229291199', mensaje: 'hola', titulo: null,
    descripcion: null, destino: 'https://bdiaccesorios.com.ar/fundas/girlhood-collection/', cta: 'SHOP_NOW',
  }

  it('pisa el destino del modelo con uno de la tienda de la línea', () => {
    const r = ajustesDelAviso(base, { destino: 'https://bdiaccesorios.com.ar/fundas/moods-collection' }, 'bdi')
    expect(r.ok && r.copy.destino).toBe('https://bdiaccesorios.com.ar/fundas/moods-collection/')
  })

  it('🔴 un destino de otro dominio NO pasa, aunque Meta lo acepte', () => {
    expect(ajustesDelAviso(base, { destino: 'https://example.com/' }, 'bdi')).toMatchObject({ ok: false, status: 409 })
  })

  it('🔴 el destino se valida contra la línea que PAGA: la tienda de Zattia no pasa en una tanda de BDI', () => {
    expect(ajustesDelAviso(base, { destino: 'https://zattia.com.ar/' }, 'bdi')).toMatchObject({ ok: false, status: 409 })
  })

  it('el botón sólo de la lista cerrada, y en mayúsculas', () => {
    const r = ajustesDelAviso(base, { cta: 'learn_more' }, 'bdi')
    expect(r.ok && r.copy.cta).toBe('LEARN_MORE')
    expect(ajustesDelAviso(base, { cta: 'CALL_NOW' }, 'bdi')).toMatchObject({ ok: false, status: 400 })
    expect(CTAS).toContain('SHOP_NOW')
  })

  it('la página y el Instagram sólo como ids; Instagram vacío = sale sin Instagram', () => {
    expect(ajustesDelAviso(base, { pageId: 'mi pagina' }, 'bdi')).toMatchObject({ ok: false, status: 400 })
    const r = ajustesDelAviso(base, { instagramId: '' }, 'bdi')
    expect(r.ok && r.copy.instagramId).toBeNull()
  })

  it('sin ajustes, el copy sale IDÉNTICO', () => {
    const r = ajustesDelAviso(base, null, 'bdi')
    expect(r.ok && r.copy).toEqual(base)
  })

  it('soloAjustes deja afuera las claves que no se pueden pisar', () => {
    expect(soloAjustes({ destino: 'x', mensaje: 'no', access_token: 'no', cta: 'SHOP_NOW' })).toEqual({ destino: 'x', cta: 'SHOP_NOW' })
    expect(soloAjustes({})).toBeNull()
  })
})

describe('validarUrlTags — pares clave=valor', () => {
  it('acepta UTM con macros de Meta y vacío', () => {
    expect(validarUrlTags('utm_source=meta&utm_campaign={{campaign.name}}')).toEqual({ ok: true, urlTags: 'utm_source=meta&utm_campaign={{campaign.name}}' })
    expect(validarUrlTags('')).toEqual({ ok: true, urlTags: null })
  })
  it('⛔ rechaza «?» adelante, espacios y lo que no son pares', () => {
    expect(validarUrlTags('?utm_source=meta').ok).toBe(false)
    expect(validarUrlTags('utm_source=meta ads').ok).toBe(false)
    expect(validarUrlTags('utm_source').ok).toBe(false)
  })
})

describe('copyDelFormulario — el aviso SIN modelo', () => {
  const ok = { pageId: '264601567300555', destino: 'https://bdiaccesorios.com.ar/new-in/', mensaje: 'New items ✨' }

  it('arma el copy con botón Comprar por defecto', () => {
    const r = copyDelFormulario(ok, 'bdi')
    expect(r.ok && r.copy).toMatchObject({ pageId: '264601567300555', destino: 'https://bdiaccesorios.com.ar/new-in/', cta: 'SHOP_NOW', mensaje: 'New items ✨', instagramId: null })
  })

  it('⛔ sin página, sin destino o sin texto no se arma', () => {
    expect(copyDelFormulario({ ...ok, pageId: '' }, 'bdi').ok).toBe(false)
    expect(copyDelFormulario({ ...ok, destino: '' }, 'bdi').ok).toBe(false)
    expect(copyDelFormulario({ ...ok, mensaje: '  ' }, 'bdi').ok).toBe(false)
  })

  it('🔴 el guard del destino corre igual sin modelo', () => {
    expect(copyDelFormulario({ ...ok, destino: 'https://example.com/' }, 'bdi')).toMatchObject({ ok: false, status: 409 })
  })

  it('el copy armado se convierte en creativo', () => {
    const r = copyDelFormulario({ ...ok, urlTags: 'utm_source=meta' }, 'bdi')
    if (!r.ok) throw new Error(r.error)
    const c = cuerpoDeCreativo(r.copy, { clase: 'video', videoId: '9', miniatura: 'https://x.ar/t.jpg' })
    expect(c.ok).toBe(true)
    if (c.ok) {
      expect(JSON.parse(c.cuerpo.object_story_spec).video_data.call_to_action).toEqual({ type: 'SHOP_NOW', value: { link: 'https://bdiaccesorios.com.ar/new-in/' } })
      expect(c.cuerpo.url_tags).toBe('utm_source=meta')
    }
  })
})

/**
 * El guard de la pieza nueva.
 *
 * El riesgo que ordena los casos: **un creativo mal armado se acepta y sale al aire con el copy
 * equivocado o sin destino**, y eso no falla ruidosamente — entrega, gasta y no vende. Por eso lo
 * que más se fija acá no es que arme bien, sino **qué modelos se rechazan antes de armar nada**.
 */

/** Un aviso de imagen de la pauta real: el copy vive en `link_data`. */
const MODELO_IMAGEN: CreativoLeido = {
  id: '120238696262910478',
  name: 'AD01 - BAJAMOS LOS PRECIOS',
  object_story_spec: {
    page_id: '102030405060708',
    instagram_user_id: '17841400000000000',
    link_data: {
      message: 'Bajamos los precios de toda la colección',
      name: 'Hasta 40% off',
      description: 'Envío gratis desde $50.000',
      link: 'https://bdi.com.ar/colecciones/frio',
      picture: 'https://scontent.example/vieja.jpg',
      call_to_action: { type: 'SHOP_NOW', value: { link: 'https://bdi.com.ar/colecciones/frio' } },
    },
  },
}

/** Un aviso de video: el mismo copy vive en otro lado, y el destino vive ADENTRO del botón. */
const MODELO_VIDEO: CreativoLeido = {
  id: '120238696262911478',
  name: 'Video Stunned Local',
  title: 'Llegó la nueva',
  body: 'Mirá la colección completa',
  object_story_spec: {
    page_id: '102030405060708',
    video_data: {
      message: 'Mirá la colección completa',
      title: 'Llegó la nueva',
      link_description: 'Tres cuotas sin interés',
      video_id: '999',
      call_to_action: { type: 'LEARN_MORE', value: { link: 'https://stunned.com.ar/nueva' } },
    },
  },
}

const spec = (r: { ok: true; cuerpo: Record<string, string> } | { ok: false }) =>
  JSON.parse(('cuerpo' in r ? r.cuerpo.object_story_spec : '{}') as string)

describe('claseDePieza — la extensión, no el mime del browser', () => {
  it('reconoce videos e imágenes sin importar mayúsculas', () => {
    expect(claseDePieza('reel FINAL.MP4')).toBe('video')
    expect(claseDePieza('foto.jpeg')).toBe('imagen')
    expect(claseDePieza('captura.PNG')).toBe('imagen')
  })

  it('devuelve null para lo que no sabe abrir, en vez de adivinar', () => {
    // 🔴 Adivinar acá sale caro: una pieza mal clasificada se sube al camino equivocado y el rechazo
    // llega en el paso 1, con el conjunto ya creado al lado.
    expect(claseDePieza('catalogo.pdf')).toBeNull()
    expect(claseDePieza('sin-extension')).toBeNull()
    expect(claseDePieza('')).toBeNull()
  })
})

describe('textosDelCopy — escribir el texto sin tocar adónde lleva el aviso', () => {
  const COPY: CopyDeAviso = {
    pageId: '102030405060708', instagramId: '17841400000000000',
    mensaje: 'Bajamos los precios', titulo: 'Hasta 40% off', descripcion: 'Envío gratis',
    destino: 'https://bdi.com.ar/frio', cta: 'SHOP_NOW',
  }

  it('🔴 la página, Instagram, el destino y el botón NO se pisan aunque vengan en el cuerpo', () => {
    // Si un campo libre pudiera cambiar esto, un editor de texto sería un editor de a dónde lleva
    // el aviso — y `pageId` es lo que se validó contra `puedeUsarLaPagina()`.
    const colado = {
      mensaje: 'Nuevo', pageId: '999', instagramId: '888', destino: 'https://otro.com', cta: 'LEARN_MORE',
    } as unknown as Parameters<typeof textosDelCopy>[1]
    const r = textosDelCopy(COPY, colado)
    if (!r.ok) throw new Error(r.error)
    expect(r.copy).toEqual({ ...COPY, mensaje: 'Nuevo' })
  })

  it('sin textos, el copy sale IDÉNTICO al del modelo', () => {
    for (const nada of [undefined, null, {}]) {
      const r = textosDelCopy(COPY, nada)
      if (!r.ok) throw new Error(r.error)
      expect(r.copy).toEqual(COPY)
    }
  })

  it('pisa sólo lo que vino, recortado', () => {
    const r = textosDelCopy(COPY, { titulo: '  Llegó la nueva  ' })
    if (!r.ok) throw new Error(r.error)
    expect(r.copy.titulo).toBe('Llegó la nueva')
    expect(r.copy.mensaje).toBe('Bajamos los precios')
    expect(r.copy.descripcion).toBe('Envío gratis')
  })

  it('⛔ un texto vacío NO hereda el del modelo: frena, y dice de qué pieza', () => {
    const r = textosDelCopy(COPY, { mensaje: '   ' }, 'de «reel.mp4»')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(400)
      expect(r.error).toContain('reel.mp4')
    }
  })

  it('un título o una descripción vacíos SÍ pasan: el aviso sale sin eso', () => {
    const r = textosDelCopy(COPY, { titulo: '', descripcion: '' })
    if (!r.ok) throw new Error(r.error)
    expect(r.copy.titulo).toBeNull()
    expect(r.copy.descripcion).toBeNull()
  })

  it('frena el texto que pasa del tope', () => {
    expect(textosDelCopy(COPY, { mensaje: 'x'.repeat(LARGO_TEXTOS.mensaje) }).ok).toBe(true)
    expect(textosDelCopy(COPY, { mensaje: 'x'.repeat(LARGO_TEXTOS.mensaje + 1) }).ok).toBe(false)
    expect(textosDelCopy(COPY, { titulo: 'x'.repeat(LARGO_TEXTOS.titulo + 1) }).ok).toBe(false)
  })
})

describe('validarPiezas — el texto propio de cada pieza', () => {
  it('lo conserva, reducido a las tres claves que se pueden pisar', () => {
    const r = validarPiezas([
      { nombre: 'a.mp4', url: 'https://blob.vercel-storage.com/a.mp4', textos: { mensaje: 'Hola', pageId: '999' } },
      { nombre: 'b.jpg', url: 'https://blob.vercel-storage.com/b.jpg' },
    ])
    if (!r.ok) throw new Error(r.error)
    expect(r.piezas[0].textos).toEqual({ mensaje: 'Hola' })
    expect('textos' in r.piezas[1]).toBe(false)
  })
})

describe('copyDeCreativo — los tres modelos que NO sirven', () => {
  it('⛔ rechaza el carrusel: su texto está repartido en las tarjetas', () => {
    const carrusel: CreativoLeido = {
      object_story_spec: {
        page_id: '1',
        link_data: { link: 'https://x.ar', child_attachments: [{}, {}, {}] },
      },
    }
    const r = copyDeCreativo(carrusel)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('carrusel')
  })

  it('⛔ rechaza la publicación promocionada: Meta no entrega su copy', () => {
    const r = copyDeCreativo({ id: '1', effective_object_story_id: '123_456' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('publicación')
  })

  it('⛔ rechaza el que no dice de qué página sale', () => {
    const r = copyDeCreativo({ object_story_spec: { link_data: { link: 'https://x.ar' } } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(409)
  })

  it('⛔ rechaza el que no tiene destino: un aviso sin destino no lleva a ningún lado', () => {
    const r = copyDeCreativo({ object_story_spec: { page_id: '1', link_data: { message: 'hola' } } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('destino')
  })
})

describe('copyDeCreativo — el mismo dato vive en lugares distintos según el formato', () => {
  it('lee el copy de un aviso de imagen', () => {
    const r = copyDeCreativo(MODELO_IMAGEN)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.copy).toMatchObject({
      pageId: '102030405060708',
      instagramId: '17841400000000000',
      mensaje: 'Bajamos los precios de toda la colección',
      titulo: 'Hasta 40% off',
      descripcion: 'Envío gratis desde $50.000',
      destino: 'https://bdi.com.ar/colecciones/frio',
      cta: 'SHOP_NOW',
    })
  })

  it('lee el MISMO copy de un aviso de video, donde el destino está adentro del botón', () => {
    const r = copyDeCreativo(MODELO_VIDEO)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.copy.destino).toBe('https://stunned.com.ar/nueva')
    expect(r.copy.mensaje).toBe('Mirá la colección completa')
    expect(r.copy.descripcion).toBe('Tres cuotas sin interés')
  })

  it('acepta el `instagram_actor_id` viejo, que es como Meta lo devolvía antes', () => {
    const r = copyDeCreativo({
      object_story_spec: { page_id: '1', instagram_actor_id: '77', link_data: { link: 'https://x.ar' } },
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.copy.instagramId).toBe('77')
  })

  it('sin Instagram el aviso sale sólo por Facebook: se degrada, no se rompe', () => {
    const r = copyDeCreativo(MODELO_VIDEO)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.copy.instagramId).toBeNull()
  })
})

describe('cuerpoDeCreativo — la pieza cambia, el copy no', () => {
  const copy = (m: CreativoLeido) => {
    const r = copyDeCreativo(m)
    if (!r.ok) throw new Error(r.error)
    return r.copy
  }

  it('una imagen no se sube a Meta: va la URL del Blob en `picture`', () => {
    const r = cuerpoDeCreativo(copy(MODELO_IMAGEN), {
      clase: 'imagen',
      url: 'https://blob.vercel-storage.com/piezas/nueva.jpg',
    })
    expect(r.ok).toBe(true)
    const s = spec(r)
    expect(s.link_data.picture).toBe('https://blob.vercel-storage.com/piezas/nueva.jpg')
    expect(s.link_data.message).toBe('Bajamos los precios de toda la colección')
    expect(s.link_data.link).toBe('https://bdi.com.ar/colecciones/frio')
    expect(s.page_id).toBe('102030405060708')
  })

  it('🔴 un video SIN miniatura no se arma: Meta lo rechaza y el mensaje dice qué esperar', () => {
    // De acá sale que el paso que espera el procesamiento del video no es prolijidad: la miniatura
    // la genera Meta al terminar de procesar, y sin ella este cuerpo no existe.
    const r = cuerpoDeCreativo(copy(MODELO_VIDEO), { clase: 'video', videoId: '123', miniatura: null })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('miniatura')
  })

  it('un video con miniatura arma `video_data` con el destino adentro del botón', () => {
    const r = cuerpoDeCreativo(copy(MODELO_VIDEO), {
      clase: 'video', videoId: '123', miniatura: 'https://scontent.example/thumb.jpg',
    })
    expect(r.ok).toBe(true)
    const s = spec(r)
    expect(s.video_data.video_id).toBe('123')
    expect(s.video_data.image_url).toBe('https://scontent.example/thumb.jpg')
    expect(s.video_data.call_to_action.value.link).toBe('https://stunned.com.ar/nueva')
  })

  it('🔑 apaga el catálogo y el texto EXPLÍCITO, con funciones individuales (medido el 15-sep)', () => {
    const r = cuerpoDeCreativo(copy(MODELO_IMAGEN), { clase: 'imagen', url: 'https://x.ar/a.jpg' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const dof = JSON.parse(r.cuerpo.degrees_of_freedom_spec)
    expect(dof.creative_features_spec.product_extensions).toEqual({ enroll_status: 'OPT_OUT' })
    expect(dof.creative_features_spec.text_optimizations).toEqual({ enroll_status: 'OPT_OUT' })
    // Nada adentro puede estar prendido: una tanda de test con el catálogo prendido no mide la pieza.
    expect(Object.values(dof.creative_features_spec).every((v) => (v as { enroll_status: string }).enroll_status === 'OPT_OUT')).toBe(true)
  })

  it('⛔ nunca manda `standard_enhancements`: Meta lo rechaza (code 100 · subcode 3858504)', () => {
    const r = cuerpoDeCreativo(copy(MODELO_IMAGEN), { clase: 'imagen', url: 'https://x.ar/a.jpg' })
    if (r.ok) expect(r.cuerpo.degrees_of_freedom_spec).not.toContain('standard_enhancements')
    // Y el spec de la historia sigue sin arrastrarlo: va aparte, arriba del creativo.
    expect(spec(r).degrees_of_freedom_spec).toBeUndefined()
  })

  it('manda los UTM sólo si hay', () => {
    const conUtm = { ...copy(MODELO_IMAGEN), urlTags: 'utm_source=meta&utm_medium=paid' }
    const r1 = cuerpoDeCreativo(conUtm, { clase: 'imagen', url: 'https://x.ar/a.jpg' })
    if (r1.ok) expect(r1.cuerpo.url_tags).toBe('utm_source=meta&utm_medium=paid')
    const r2 = cuerpoDeCreativo(copy(MODELO_IMAGEN), { clase: 'imagen', url: 'https://x.ar/a.jpg' })
    if (r2.ok) expect(r2.cuerpo.url_tags).toBeUndefined()
  })

  it('⛔ el `name` NO sale de acá: lo pone el motor porque lleva la marca del paso', () => {
    const r = cuerpoDeCreativo(copy(MODELO_IMAGEN), { clase: 'imagen', url: 'https://x.ar/a.jpg' })
    if (r.ok) expect(r.cuerpo.name).toBeUndefined()
  })

  it('sin botón en el modelo, la imagen tampoco lleva botón: no se inventa uno', () => {
    const sinBoton = copy({
      object_story_spec: { page_id: '1', link_data: { link: 'https://x.ar', message: 'hola' } },
    })
    const r = cuerpoDeCreativo(sinBoton, { clase: 'imagen', url: 'https://x.ar/a.jpg' })
    expect(spec(r).link_data.call_to_action).toBeUndefined()
  })

  it('un video sin botón en el modelo SÍ lleva uno: ahí adentro vive el destino', () => {
    const sinBoton = copy({
      object_story_spec: { page_id: '1', video_data: { message: 'hola' }, link_data: { link: 'https://x.ar' } },
    })
    const r = cuerpoDeCreativo(sinBoton, { clase: 'video', videoId: '9', miniatura: 'https://x.ar/t.jpg' })
    expect(spec(r).video_data.call_to_action.value.link).toBe('https://x.ar')
  })
})

describe('validarPiezas — se valida antes de armar un solo paso', () => {
  const ok = { nombre: 'reel.mp4', url: 'https://blob.vercel-storage.com/a.mp4' }

  it('acepta una tanda buena y le pega la clase a cada una', () => {
    const r = validarPiezas([ok, { nombre: 'foto.jpg', url: 'https://blob.vercel-storage.com/b.jpg' }])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.piezas.map((p) => p.clase)).toEqual(['video', 'imagen'])
  })

  it('rechaza la lista vacía', () => {
    expect(validarPiezas([]).ok).toBe(false)
  })

  it(`rechaza más de ${TOPE_PIEZAS} piezas`, () => {
    expect(validarPiezas(Array.from({ length: TOPE_PIEZAS + 1 }, () => ok)).ok).toBe(false)
  })

  it('🔴 rechaza una URL que Meta no puede bajar', () => {
    // Una `blob:` del browser existe sólo en esa pestaña. El rechazo llegaría recién en el paso de
    // subida, con el conjunto ya creado al lado.
    const r = validarPiezas([{ nombre: 'reel.mp4', url: 'blob:https://monitor.areben/abc' }])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('URL pública')
  })

  it('rechaza la extensión que no reconoce y dice cuáles acepta', () => {
    const r = validarPiezas([{ nombre: 'catalogo.pdf', url: 'https://blob.vercel-storage.com/c.pdf' }])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('mp4')
  })
})

/**
 * El espejo entre lo que la pantalla DIBUJA y lo que el servidor VALIDA.
 *
 * 🔴 Nació de un defecto medido en prod el 9-ago-2026: `piezaDe()` leía el destino sólo de
 * `link_data.link`, así que los **5 avisos de video de BDI** —los únicos que sirven de modelo—
 * salían con «Sin destino legible» mientras `copyDeCreativo()` los aceptaba. 0 de 18 avisos
 * mostraban destino en las dos campañas.
 *
 * Lo que amarra este bloque no es el valor de un campo: es que **las dos lecturas sean la misma
 * función**. Si vuelven a separarse, la pantalla va a desaconsejar modelos que sirven.
 */
describe('destinoDe — una sola lectura para la vista previa y para el guard', () => {
  it('🔴 en un aviso de video, el destino está ADENTRO del botón', () => {
    expect(destinoDe(MODELO_VIDEO.object_story_spec)).toBe('https://stunned.com.ar/nueva')
  })

  it('en uno de imagen sigue saliendo de `link_data.link`', () => {
    expect(destinoDe(MODELO_IMAGEN.object_story_spec)).toBe('https://bdi.com.ar/colecciones/frio')
  })

  it('sin destino en ningún lado devuelve null, que es lo que dispara el rechazo', () => {
    expect(destinoDe({ page_id: '1', video_data: { video_id: '9' } })).toBeNull()
    expect(destinoDe(undefined)).toBeNull()
  })

  it('🔑 lo que dibuja `piezaDe` y lo que valida `copyDeCreativo` coinciden', () => {
    for (const modelo of [MODELO_IMAGEN, MODELO_VIDEO]) {
      const dibujado = piezaDe(modelo).destino
      const validado = copyDeCreativo(modelo)
      expect(validado.ok).toBe(true)
      if (validado.ok) expect(dibujado).toBe(validado.copy.destino)
    }
  })
})

/**
 * 🔴 El guardarraíl de la página, que el 9-ago-2026 frenó lo que estaba bien.
 *
 * Armar una pieza de BDI fallaba con «(#100) missing permission» sobre la página `264601567300555`,
 * y en el Business Manager esa página decía **«Ya se asignó»** al usuario del sistema. Las dos cosas
 * eran ciertas: el chequeo hacía `GET /<page_id>`, que lee el NODO y exige `pages_read_engagement`,
 * cuando el token sólo tiene `pages_show_list` — o sea, **preguntaba por una puerta que ese token
 * nunca iba a poder abrir**, y su «missing permission» no decía nada sobre si la página estaba.
 *
 * Lo que este bloque amarra es la lección: la lista manda, y **«no se pudo preguntar» no frena**.
 */
describe('puedeUsarLaPagina — la lista de /me/accounts, no el nodo Página', () => {
  const PAGINAS = [
    { id: '992484813957797', nombre: 'Stunned co' },
    { id: '470118182844894', nombre: 'Zattia' },
    { id: '264601567300555', nombre: 'BDI Accesorios' },
  ]

  it('deja pasar la página que el token maneja', () => {
    const r = puedeUsarLaPagina('264601567300555', PAGINAS)
    expect(r.ok).toBe(true)
    expect(r.verificado).toBe(true)
  })

  it('frena la que no maneja, y dice cuáles sí', () => {
    const r = puedeUsarLaPagina('111111111111111', PAGINAS)
    expect(r.ok).toBe(false)
    // El listado ES el valor: sin él, el cartel manda a adivinar en el Business Manager.
    if (!r.ok) expect(r.error).toContain('BDI Accesorios')
  })

  it('🔴 si no se pudo preguntar, NO frena', () => {
    // `null` es «no sé», y un guardarraíl que convierte «no sé» en «no» es el que costó la hora.
    const r = puedeUsarLaPagina('264601567300555', null)
    expect(r.ok).toBe(true)
    expect(r.verificado).toBe(false)
  })

  it('sin ninguna página asignada, frena y lo dice', () => {
    const r = puedeUsarLaPagina('264601567300555', [])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('ninguna')
  })
})
