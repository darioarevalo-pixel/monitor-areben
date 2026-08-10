import { describe, expect, it } from 'vitest'
import {
  claseDePieza,
  copyDeCreativo,
  cuerpoDeCreativo,
  destinoDe,
  TOPE_PIEZAS,
  validarPiezas,
  type CreativoLeido,
} from '@/lib/meta-ads/pieza'
import { piezaDe } from '@/lib/meta-ads/creativos.core.js'

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

  it('⛔ nunca arrastra `degrees_of_freedom_spec`, que es lo que hace rechazar las copias', () => {
    const r = cuerpoDeCreativo(copy(MODELO_IMAGEN), { clase: 'imagen', url: 'https://x.ar/a.jpg' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(Object.keys(r.cuerpo)).toEqual(['object_story_spec'])
    expect(spec(r).degrees_of_freedom_spec).toBeUndefined()
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
