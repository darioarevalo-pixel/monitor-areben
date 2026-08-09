import { describe, it, expect } from 'vitest'
import { armarMensaje, filtrarItems, filtrarModelos, porGrupo, textoDeItem } from '@/lib/atencion/core'
import { modelosDelMenu, nombreDesdeSlug, semillaDe, SEMILLA_BDI } from '@/lib/atencion/modelos'
import { PLANTILLA_MODELO_DEFECTO, type ItemAtencion } from '@/lib/atencion/tipos'

const BASE = 'https://bdiaccesorios.com.ar'

/** Un pedazo del menú real de bdiaccesorios.com.ar, leído el 9-ago-2026. */
const MENU = `
<nav>
  <a href="https://bdiaccesorios.com.ar/fundas/">Fundas</a>
  <a href="https://bdiaccesorios.com.ar/fundas/modelo-de-iphone/">Modelo de iPhone</a>
  <a href="https://bdiaccesorios.com.ar/fundas/modelo-de-iphone/iphone-17-pro-max/">iPhone 17 Pro Max</a>
  <a href="https://bdiaccesorios.com.ar/fundas/modelo-de-iphone/iphone-17-pro/">iPhone 17 Pro</a>
  <a href="https://bdiaccesorios.com.ar/fundas/modelo-de-iphone/iphone-air/">iPhone Air</a>
  <a href="https://bdiaccesorios.com.ar/fundas/modelo-de-iphone/iphone-16-e/">iPhone 16e</a>
  <a href="https://bdiaccesorios.com.ar/cargadores/">Cargadores</a>
</nav>`

describe('modelosDelMenu', () => {
  it('saca los modelos y deja afuera la categoría madre y lo que no es modelo', () => {
    const m = modelosDelMenu(MENU, BASE)
    expect(m.map((x) => x.slug)).toEqual(['iphone-17-pro-max', 'iphone-17-pro', 'iphone-air', 'iphone-16-e'])
  })

  it('respeta el orden del menú: la tienda ya los ordena del más nuevo al más viejo', () => {
    expect(modelosDelMenu(MENU, BASE)[0].slug).toBe('iphone-17-pro-max')
  })

  it('el nombre es el que muestra la tienda, no uno derivado del slug', () => {
    const e = modelosDelMenu(MENU, BASE).find((x) => x.slug === 'iphone-16-e')
    expect(e?.nombre).toBe('iPhone 16e')
  })

  it('cae al slug sólo si el link no tiene texto propio (una imagen adentro, por ejemplo)', () => {
    const html = `<a href="${BASE}/fundas/modelo-de-iphone/iphone-15-pro/"><img src="x.jpg"></a>`
    expect(modelosDelMenu(html, BASE)[0].nombre).toBe('iPhone 15 Pro')
  })

  it('un link relativo se convierte en absoluto: pegado en WhatsApp tiene que abrir', () => {
    const html = '<a href="/fundas/modelo-de-iphone/iphone-13/">iPhone 13</a>'
    expect(modelosDelMenu(html, BASE)[0].url).toBe(`${BASE}/fundas/modelo-de-iphone/iphone-13/`)
  })

  it('no repite un modelo que aparece dos veces (menú de escritorio y de celular)', () => {
    const dup = MENU + MENU
    expect(modelosDelMenu(dup, BASE).length).toBe(4)
  })

  it('si la tienda cambia el menú devuelve vacío, no rompe', () => {
    expect(modelosDelMenu('<html><body>nada</body></html>', BASE)).toEqual([])
    expect(modelosDelMenu('', BASE)).toEqual([])
  })
})

describe('nombreDesdeSlug', () => {
  it.each([
    ['iphone-15-pro-max', 'iPhone 15 Pro Max'],
    ['iphone-13', 'iPhone 13'],
    ['iphone-air', 'iPhone Air'],
    ['iphone-12-mini', 'iPhone 12 Mini'],
    ['iphone-16-e', 'iPhone 16e'], // como lo escribe Apple, no "16 E"
  ])('%s → %s', (slug, esperado) => {
    expect(nombreDesdeSlug(slug)).toBe(esperado)
  })
})

describe('semilla de respaldo', () => {
  it('son los 27 modelos que la tienda tenía el 9-ago-2026', () => {
    expect(SEMILLA_BDI.length).toBe(27)
  })

  it('arma URLs absolutas con el mismo formato que el menú', () => {
    const s = semillaDe(BASE)
    expect(s[0].url).toBe(`${BASE}/fundas/modelo-de-iphone/iphone-17-pro-max/`)
    expect(s.every((m) => m.url.startsWith('https://'))).toBe(true)
  })

  it('no duplica la barra si la base viene con una al final', () => {
    expect(semillaDe(`${BASE}/`)[0].url).toBe(`${BASE}/fundas/modelo-de-iphone/iphone-17-pro-max/`)
  })
})

describe('armarMensaje', () => {
  const m = { nombre: 'iPhone 15 Pro', url: `${BASE}/fundas/modelo-de-iphone/iphone-15-pro/` }

  it('reemplaza los dos marcadores de la plantilla por defecto', () => {
    const texto = armarMensaje(PLANTILLA_MODELO_DEFECTO, m)
    expect(texto).toContain('iPhone 15 Pro')
    expect(texto).toContain(m.url)
    expect(texto).not.toContain('{')
  })

  it('reemplaza todas las apariciones, no sólo la primera', () => {
    expect(armarMensaje('{modelo} — {modelo}', m)).toBe('iPhone 15 Pro — iPhone 15 Pro')
  })

  it('un marcador mal escrito queda a la vista en vez de dejar un hueco', () => {
    expect(armarMensaje('Fundas para {Modelo}', m)).toBe('Fundas para {Modelo}')
  })
})

describe('textoDeItem', () => {
  const base: ItemAtencion = { id: '1', tipo: 'link', titulo: 'Envíos' }

  it('un link con texto copia las dos cosas, el mensaje arriba', () => {
    const t = textoDeItem({ ...base, url: 'https://x.com/envios', texto: 'Mirá los costos acá:' })
    expect(t).toBe('Mirá los costos acá:\nhttps://x.com/envios')
  })

  it('un link sin texto copia el link pelado', () => {
    expect(textoDeItem({ ...base, url: 'https://x.com/envios' })).toBe('https://x.com/envios')
  })

  it('un mensaje copia su texto y nunca una URL', () => {
    expect(textoDeItem({ id: '2', tipo: 'mensaje', titulo: 'Saludo', texto: '¡Hola!' })).toBe('¡Hola!')
  })
})

describe('filtrarModelos', () => {
  const modelos = semillaDe(BASE)

  it('"15 pro" trae el Pro y el Pro Max, y no el 15 pelado', () => {
    const r = filtrarModelos(modelos, '15 pro').map((m) => m.slug)
    expect(r).toEqual(['iphone-15-pro-max', 'iphone-15-pro'])
  })

  it('el orden de las palabras no importa: se atiende escribiendo rápido', () => {
    expect(filtrarModelos(modelos, 'pro 15')).toEqual(filtrarModelos(modelos, '15 pro'))
  })

  it('"13" trae los tres 13 y ningún 13 de otro lado', () => {
    expect(filtrarModelos(modelos, '13').map((m) => m.slug)).toEqual([
      'iphone-13-pro-max', 'iphone-13-pro', 'iphone-13',
    ])
  })

  it('sin búsqueda están todos', () => {
    expect(filtrarModelos(modelos, '').length).toBe(27)
    expect(filtrarModelos(modelos, '   ').length).toBe(27)
  })

  it('sin resultados devuelve vacío, no todo', () => {
    expect(filtrarModelos(modelos, 'samsung')).toEqual([])
  })
})

describe('filtrarItems / porGrupo', () => {
  const items: ItemAtencion[] = [
    { id: '1', tipo: 'link', titulo: 'Costos de envío', url: 'https://x/envios', grupo: 'Envíos' },
    { id: '2', tipo: 'link', titulo: 'Seguimiento', url: 'https://x/track', grupo: 'Envíos' },
    { id: '3', tipo: 'mensaje', titulo: 'Cómo cambiar', texto: 'Tenés 30 días', grupo: 'Cambios' },
    { id: '4', tipo: 'link', titulo: 'Suelto', url: 'https://x/z' },
  ]

  it('busca en el título, el grupo y el texto', () => {
    expect(filtrarItems(items, 'envio').map((i) => i.id)).toEqual(['1', '2'])
    expect(filtrarItems(items, '30 días').map((i) => i.id)).toEqual(['3'])
  })

  it('ignora tildes en las dos direcciones', () => {
    expect(filtrarItems(items, 'envío').map((i) => i.id)).toEqual(['1', '2'])
    expect(filtrarItems(items, 'dias').map((i) => i.id)).toEqual(['3'])
  })

  it('agrupa alfabéticamente y manda "Sin grupo" al final', () => {
    expect(porGrupo(items).map((g) => g.grupo)).toEqual(['Cambios', 'Envíos', 'Sin grupo'])
  })

  it('dentro del grupo respeta el orden de carga', () => {
    expect(porGrupo(items)[1].items.map((i) => i.id)).toEqual(['1', '2'])
  })
})
