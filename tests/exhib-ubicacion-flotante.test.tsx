// @vitest-environment jsdom
// La ubicación flotante del chequeo con mapa (Darío, 12-oct-2026): un toque por barra, la flecha a la
// próxima sin escanear, y lo ya escaneado ⛔ se ofrece.
import { beforeAll, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { UbicacionFlotante } from '@/components/exhib/UbicacionFlotante'
import { lugaresHechos, paradasDelMapa } from '@/lib/exhib/paradas'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

const mod = (orden: number, codigo: string, pos: string[]) => ({ orden, codigo, anchoCm: 75, niveles: pos.map((p) => ({ pos: p })) })
const PARADAS = paradasDelMapa({ modulos: [mod(1, 'ISLA', ['simple']), mod(2, 'D01', ['alta', 'baja']), mod(3, 'D02', ['alta', 'baja'])] } as never)

async function dibujar(lugar: string, escaneados: string[]) {
  const elegidos: string[] = []
  const host = document.createElement('div')
  document.body.appendChild(host)
  await act(async () => {
    createRoot(host).render(<UbicacionFlotante paradas={PARADAS} lugar={lugar} hechos={lugaresHechos(escaneados.map((l) => ({ lugar: l })))} onElegir={(l) => elegidos.push(l)} />)
  })
  const boton = (texto: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === texto || b.getAttribute('aria-label') === texto)
  return { host, elegidos, boton }
}

describe('UbicacionFlotante', () => {
  it('sin lugar arranca solo en la primera barra', async () => {
    const { elegidos } = await dibujar('', [])
    expect(elegidos).toEqual(['ISLA'])
  })

  it('la flecha pasa a la próxima barra sin escanear', async () => {
    const { elegidos, boton, host } = await dibujar('D01 arriba', ['ISLA', 'D01 arriba', 'D01 abajo'])
    expect(host.textContent).toContain('📍 D01 arriba')
    await act(async () => boton('Pasar a D02 arriba')!.click())
    expect(elegidos).toEqual(['D02 arriba'])
  })

  it('la lista ⛔ ofrece lo ya escaneado, y elegir la cierra', async () => {
    const { elegidos, boton, host } = await dibujar('D01 abajo', ['ISLA', 'D01 arriba', 'D01 abajo'])
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-expanded]')!.click())
    const textos = [...host.querySelectorAll('button')].map((b) => b.textContent?.trim())
    expect(textos).not.toContain('ISLA')
    expect(host.textContent).toContain('Ver los ya escaneados (2)')
    await act(async () => boton('Abajo')!.click())
    expect(host.querySelector('button[aria-expanded]')!.getAttribute('aria-expanded')).toBe('false')
    expect(elegidos.at(-1)).toMatch(/abajo/)
  })
})
