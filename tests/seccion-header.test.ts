import { describe, it, expect } from 'vitest'
import { SECCIONES } from '@/components/secciones/registro'
import { categoriaDe, descripcionDe, labelConEmoji, tituloLimpio } from '@/lib/nav'

describe('encabezado de sección — metadata', () => {
  it('TODA sección registrada tiene una descripción (no se olvida ninguna)', () => {
    const sinDesc = Object.keys(SECCIONES).filter((k) => !descripcionDe(k))
    expect(sinDesc).toEqual([])
  })

  it('tituloLimpio saca el emoji inicial pero no toca el texto', () => {
    // productos: label "📊 Por producto" → "Por producto"
    expect(tituloLimpio('productos')).toBe('Por producto')
    // sin emoji queda igual (resumen: "📈 Resumen / KPIs" → "Resumen / KPIs")
    expect(tituloLimpio('resumen')).toBe('Resumen / KPIs')
    // key de LABELS_EXTRA (inicio: "🏠 Inicio" → "Inicio")
    expect(tituloLimpio('inicio')).toBe('Inicio')
    // el emoji con variation selector también se saca (tncat: "🛍️ Tienda Nube")
    expect(tituloLimpio('tncat')).toBe('Tienda Nube')
    // nunca deja el título vacío
    Object.keys(SECCIONES).forEach((k) => expect(tituloLimpio(k).length).toBeGreaterThan(0))
  })

  it('labelConEmoji conserva el emoji (para el sidebar)', () => {
    expect(labelConEmoji('inicio')).toBe('🏠 Inicio')
    expect(labelConEmoji('productos')).toMatch(/^📊/)
  })

  it('categoriaDe: MAYÚSCULAS sin emoji; null si no tiene grupo o duplica el título', () => {
    expect(categoriaDe('productos')).toBe('ANÁLISIS')
    expect(categoriaDe('ingresos')).toBe('COMPRAS')
    expect(categoriaDe('resumen')).toBeNull() // no está en ningún grupo del nav
    expect(categoriaDe('inicio')).toBeNull() // el grupo "Inicio" duplicaría el título
    expect(categoriaDe('marketing')).toBeNull() // sección y grupo se llaman igual → sin eyebrow
  })
})
