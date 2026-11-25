import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PinUsuario } from '@/components/usuarios/PinUsuario'
import { pinAlAzar } from '@/lib/erp/cliente'

// Render, no interacción (no hay testing-library en el repo): defiende QUÉ se muestra.
// 🔑 Bruno 23-nov: «arreglalo, que no se vean» ⇒ la pantalla sabe SI tiene PIN, ⛔ cuál; el recién puesto se ve una vez.
const html = (tiene: boolean | undefined, nuevo?: string | null) =>
  renderToStaticMarkup(<PinUsuario tiene={tiene} nuevo={nuevo} cargando={false} onAlAzar={() => {}} onSacar={() => {}} />)

describe('PinUsuario', () => {
  it('🔑 con PIN muestra puntos y ⛔ ofrece verlo', () => {
    const h = html(true)
    expect(h).toContain('••••')
    expect(h).not.toContain('>Ver<')
    expect(h).toContain('Cambiar al azar')
    expect(h).toContain('Sacar')
  })
  it('el recién puesto se ve UNA vez, con el aviso', () => {
    const h = html(true, '4821')
    expect(h).toContain('4821')
    expect(h).toContain('No se vuelve a ver.')
  })
  it('sin PIN dice «sin PIN», ofrece ponerlo al azar y no ofrece quitar', () => {
    const h = html(false)
    expect(h).toContain('sin PIN')
    expect(h).toContain('Poner al azar')
    expect(h).not.toContain('Sacar')
  })
  it('sin leer todavía no ofrece nada que se pueda apretar', () => {
    expect(html(undefined)).toContain('disabled')
  })
})

describe('pinAlAzar', () => {
  it('siempre son 4 dígitos, también con ceros adelante, y no es siempre el mismo', () => {
    const v = Array.from({ length: 300 }, pinAlAzar)
    expect(v.every((p) => /^\d{4}$/.test(p))).toBe(true)
    expect(new Set(v).size).toBeGreaterThan(200)
    expect(v.some((p) => p.startsWith('0'))).toBe(true)
  })
})
