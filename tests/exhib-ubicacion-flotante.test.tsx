// @vitest-environment jsdom
// La ubicación flotante del chequeo con mapa (Darío, 12-oct-2026): orden fijo I → ISLA → D, Arriba /
// Abajo / Frontal en cada perchero, la flecha al próximo, y lo ya escaneado ⛔ se ofrece.
import { beforeAll, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { UbicacionFlotante } from '@/components/exhib/UbicacionFlotante'
import { percherosDelChequeo } from '@/lib/exhib/paradas'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

const mod = (orden: number, codigo: string, pos: string[]) => ({ orden, codigo, anchoCm: 75, niveles: pos.map((p) => ({ pos: p })) })
const PERCHEROS = percherosDelChequeo({ modulos: [mod(1, 'ISLA', ['simple']), mod(2, 'D01', ['alta', 'baja']), mod(3, 'I01', ['frente', 'baja'])] } as never)

async function dibujar(lugar: string, escaneados: string[]) {
  const elegidos: string[] = []
  const host = document.createElement('div')
  document.body.appendChild(host)
  await act(async () => {
    createRoot(host).render(<UbicacionFlotante percheros={PERCHEROS} lugar={lugar} escaneos={escaneados.map((l) => ({ lugar: l }))} onElegir={(l) => elegidos.push(l)} />)
  })
  const botones = () => [...host.querySelectorAll('button')]
  const abrir = async () => act(async () => host.querySelector<HTMLButtonElement>('button[aria-expanded]')!.click())
  return { host, elegidos, botones, abrir }
}

describe('UbicacionFlotante', () => {
  it('sin lugar arranca solo en el primer perchero del recorrido (la izquierda)', async () => {
    const { elegidos } = await dibujar('', [])
    expect(elegidos).toEqual(['I01 arriba'])
  })

  it('la flecha pasa al lugar que sigue', async () => {
    const { elegidos, botones, host } = await dibujar('I01 abajo', ['I01 arriba', 'I01 abajo'])
    expect(host.textContent).toContain('📍 I01 abajo')
    await act(async () => botones().find((b) => b.getAttribute('aria-label') === 'Pasar a ISLA')!.click())
    expect(elegidos).toEqual(['ISLA'])
  })

  it('cada perchero ofrece Frontal; lo ya escaneado ⛔ se ofrece; elegir cierra la lista', async () => {
    const { elegidos, botones, host, abrir } = await dibujar('ISLA', ['I01 arriba', 'ISLA'])
    await abrir()
    expect(host.textContent).not.toContain('I01')
    expect(host.textContent).toContain('Ver los ya escaneados (1)')
    const filaD01 = [...host.querySelectorAll('div')].find((d) => d.firstElementChild?.textContent === 'D01')!
    expect([...filaD01.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Arriba', 'Abajo', 'Frontal'])
    await act(async () => [...filaD01.querySelectorAll('button')].find((b) => b.textContent === 'Frontal')!.click())
    expect(elegidos.at(-1)).toBe('D01 frontal')
    expect(botones().find((b) => b.hasAttribute('aria-expanded'))!.getAttribute('aria-expanded')).toBe('false')
  })
})
