import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PinUsuario } from '@/components/usuarios/PinUsuario'
import { pinAlAzar } from '@/lib/erp/cliente'

// Render, no interacción (no hay testing-library en el repo): defiende QUÉ se muestra. El click del ojo se camina en producción.
const html = (pin: string | null | undefined) => renderToStaticMarkup(<PinUsuario pin={pin} cargando={false} onAlAzar={() => {}} onQuitar={() => {}} />)

describe('PinUsuario', () => {
  it('🔑 con PIN lo muestra OCULTO (puntos) y ⛔ el número en la página', () => {
    const h = html('4821')
    expect(h).toContain('••••')
    expect(h).not.toContain('4821')
    expect(h).toContain('Ver')
    expect(h).toContain('Cambiar al azar')
    expect(h).toContain('Quitar')
  })
  it('sin PIN dice «sin PIN», ofrece ponerlo al azar y no ofrece ver ni quitar', () => {
    const h = html(null)
    expect(h).toContain('sin PIN')
    expect(h).toContain('Poner al azar')
    expect(h).not.toContain('Quitar')
    expect(h).not.toContain('>Ver<')
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
