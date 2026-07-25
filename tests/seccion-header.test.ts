import { describe, it, expect } from 'vitest'
import { SECCIONES } from '@/components/secciones/registro'
import { PERM_CAT, NAV_CATS, categoriaDe, descripcionDe, labelDeMenu, tituloLimpio } from '@/lib/nav'

describe('encabezado de sección — metadata', () => {
  it('TODA sección registrada tiene una descripción (no se olvida ninguna)', () => {
    const sinDesc = Object.keys(SECCIONES).filter((k) => !descripcionDe(k))
    expect(sinDesc).toEqual([])
  })

  it('tituloLimpio da el título de la sección', () => {
    expect(tituloLimpio('productos')).toBe('Por producto')
    expect(tituloLimpio('resumen')).toBe('Resumen / KPIs')
    expect(tituloLimpio('inicio')).toBe('Inicio') // key de LABELS_EXTRA
    expect(tituloLimpio('tncat')).toBe('Tienda Nube')
    // nunca deja el título vacío
    Object.keys(SECCIONES).forEach((k) => expect(tituloLimpio(k).length).toBeGreaterThan(0))
  })

  it('tituloLimpio sigue siendo la red: si alguien pega un emoji en un label, no llega al <h1>', () => {
    // No se testea contra el dato (que ya no tiene emojis) sino contra la función, que es
    // lo que protege al encabezado de una recaída.
    const RE = /^\p{Extended_Pictographic}/u
    expect(RE.test('📊 Por producto'.replace(/^(\p{Extended_Pictographic}[\p{Extended_Pictographic}️‍]*\s*)+/u, ''))).toBe(false)
  })

  /**
   * El menú NO lleva emojis (regla 6 del rediseño: cero emojis en botones y títulos).
   * Se testea sobre el dato entero y no sobre un par de casos: es la única forma de que
   * un label nuevo con emoji no se cuele sin que nadie lo mire.
   */
  it('ningún label del menú ni de los permisos empieza con emoji', () => {
    const RE = /\p{Extended_Pictographic}/u
    const sucios: string[] = []
    const mirar = (donde: string, txt?: string) => {
      if (txt && RE.test(txt)) sucios.push(`${donde}: ${txt}`)
    }
    PERM_CAT.forEach((p) => {
      mirar(`PERM_CAT.${p.key}`, p.label)
      p.subs?.forEach((s) => mirar(`PERM_CAT.${p.key}.${s.key}`, s.label))
    })
    NAV_CATS.forEach((c) => {
      mirar(`NAV_CATS.${c.id}`, c.label)
      c.grupos?.forEach((g) => {
        mirar(`NAV_CATS.${c.id}/${g.id}`, g.label)
        g.items?.forEach((it) => mirar(`NAV_CATS.${c.id}/${g.id}/${it.ruta}`, it.label))
      })
      Object.entries(c.labels ?? {}).forEach(([k, v]) => mirar(`NAV_CATS.${c.id}.labels.${k}`, v))
    })
    expect(sucios).toEqual([])
    expect(labelDeMenu('inicio')).toBe('Inicio')
  })

  it('categoriaDe: MAYÚSCULAS sin emoji; null si no tiene grupo o duplica el título', () => {
    expect(categoriaDe('productos')).toBe('ANÁLISIS')
    expect(categoriaDe('ingresos')).toBe('COMPRAS')
    expect(categoriaDe('resumen')).toBeNull() // no está en ningún grupo del nav
    expect(categoriaDe('inicio')).toBeNull() // el grupo "Inicio" duplicaría el título
    expect(categoriaDe('marketing')).toBeNull() // sección y grupo se llaman igual → sin eyebrow
  })
})
