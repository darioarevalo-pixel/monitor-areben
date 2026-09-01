import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Foto } from '@/components/recepciones/DetalleOC'
import type { LineaConCruce } from '@/lib/recepciones/cliente'

/**
 * La foto del artículo en el detalle de un ingreso, del lado de la PANTALLA.
 *
 * 🔑 **El oráculo es qué dibuja cuando NO hay foto.** Las 79 OC que entraron el 27-ago-2026 son
 * anteriores a que Ingresos empezara a mandar las imágenes: si el renglón sin foto pintara un
 * recuadro vacío, media sección se leería como "las fotos se rompieron" cuando lo que pasa es que
 * nunca vinieron. Por eso el caso sin foto no dibuja **nada**, ni un `<img>` sin `src`.
 *
 * ⚠️ Es render, no interacción: `renderToStaticMarkup` no corre efectos ni el `onError`, así que
 * esto fija el primer pintado. Que la URL abra de verdad es otra pregunta, y la contesta el
 * servidor de Ingresos.
 */

const linea = (p: Partial<LineaConCruce>): LineaConCruce => ({
  id: 'zattia:801:0', oc_ref: 'zattia:801', orden: 0, sku: 'RVE-0048-CT', codigo_barras: null,
  nombre: 'VESTIDO BELMONT', talle: null, color: 'CHOCOLATE', cantidad_pedida: 3,
  cantidad_contada: 3, diferencia: 0, observaciones: null, es_nuevo: true,
  imagen_url: null, imagen_thumb_url: null, en_gn: false, producto_id: null, en_gn_hoy: false, producto_id_hoy: null, ...p,
})

const GRANDE = 'https://ingreso2.arebensrl.com/uploads/801/2918/principal_detail.webp'
const CHICA = 'https://ingreso2.arebensrl.com/uploads/801/2918/principal_thumb.webp'

describe('Foto del renglón', () => {
  it('dibuja la CHICA en la grilla', () => {
    const html = renderToStaticMarkup(<Foto l={linea({ imagen_url: GRANDE, imagen_thumb_url: CHICA })} lado={96} />)
    expect(html).toContain(`src="${CHICA}"`)
  })

  it('🔴 sin foto no dibuja NADA — ni un recuadro vacío', () => {
    expect(renderToStaticMarkup(<Foto l={linea({})} lado={96} />)).toBe('')
  })

  it('si sólo vino la grande, la usa de miniatura en vez de quedarse sin foto', () => {
    const html = renderToStaticMarkup(<Foto l={linea({ imagen_url: GRANDE })} lado={40} />)
    expect(html).toContain(`src="${GRANDE}"`)
  })

  it('el alt describe el artículo: sin él la fila es una imagen muda para quien no la ve', () => {
    const html = renderToStaticMarkup(<Foto l={linea({ imagen_thumb_url: CHICA })} lado={40} />)
    expect(html).toContain('alt="VESTIDO BELMONT CHOCOLATE"')
  })

  it('🔴 es un BOTÓN y NO un enlace a la imagen: un `href` la DESCARGA', () => {
    // Ingresos sirve los `.webp` como `application/octet-stream`. Adentro de un `<img>` el
    // navegador los sniffea y los dibuja igual — por eso la miniatura no daba ninguna pista—, pero
    // NAVEGANDO a esa URL el mismo content-type dispara la descarga. El defecto sólo se ve
    // apretando la foto, así que lo que se fija acá es la FORMA: botón, nunca `href`.
    const html = renderToStaticMarkup(<Foto l={linea({ imagen_url: GRANDE, imagen_thumb_url: CHICA })} lado={40} />)
    expect(html).toContain('<button')
    expect(html).not.toContain('href')
    expect(html).not.toContain('download')
  })

  it('🔴 el botón lleva `height: auto`: `.shell-content button` le clava la altura de un control', () => {
    // `globals.css` le da a todo `button` de la pantalla la altura fija del kit (~36 px). Con una
    // foto de 96 adentro, la imagen desborda y se monta sobre el SKU del renglón de abajo — que es
    // exactamente lo que se vio en prod el 1-sep. El estilo en línea le gana a la clase global.
    const html = renderToStaticMarkup(<Foto l={linea({ imagen_thumb_url: CHICA })} lado={96} />)
    expect(html).toMatch(/<button[^>]*height:\s*auto/)
  })

  it('sin quien la amplíe no explota: el botón queda inerte', () => {
    // La grilla y la tabla la usan con `onAmpliar`, pero el opcional tiene que aguantar sin él.
    expect(renderToStaticMarkup(<Foto l={linea({ imagen_thumb_url: CHICA })} lado={40} />)).toContain('<img')
  })
})
