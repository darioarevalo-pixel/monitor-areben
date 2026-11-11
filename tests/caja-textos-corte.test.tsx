// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CobrosGN, Pendientes } from '@/components/caja/partes'
import type { ResumenTurno, Venta } from '@/lib/caja/cliente'

/**
 * 🔑 **Los textos de la Caja desde el corte de BDI** (revisión del 10-nov, ERP general 24ª): BDI es la primera Caja con TODAS
 * sus líneas en el ERP ⇒ la venta rechazada que iba al ERP ⛔ ofrece «Cargada a mano en GN» (quedaría `en_gn` y el ERP ⛔ la
 * tendría) y los pedidos web del ERP ⛔ son «de Stunned».
 */
let root: Root | null = null
let host: HTMLDivElement
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove(); document.body.innerHTML = '' })

async function dibujar(el: React.ReactElement) {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  await act(async () => { root!.render(el) })
}
const texto = () => (document.body.textContent ?? '').replace(/\s+/g, ' ')
const boton = (t: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === t) ?? null

const rechazada = (destino: 'erp' | null, id = 'aaaaaaaa-0000-4000-8000-000000000001') =>
  ({ id, estado: 'error', reintentable: false, total: 15000, creada_en: '2026-11-15T13:00:00Z', ultimo_error: 'Sin stock', destino, gn_number: null }) as unknown as Venta

describe('venta rechazada (Pendientes)', () => {
  it('la que iba a GN: «Cobradas sin llegar a Gestión Nube» y se puede cargar a mano en GN', async () => {
    await dibujar(<Pendientes ventas={[rechazada(null)]} onCambio={() => {}} admin />)
    expect(texto()).toContain('Cobradas sin llegar a Gestión Nube: 1')
    expect(boton('Cargada a mano en GN')).not.toBeNull()
  })

  it('🔴 la que iba al ERP: «sin llegar al ERP» y ⛔ «Cargada a mano en GN»; descartar sigue', async () => {
    await dibujar(<Pendientes ventas={[rechazada('erp')]} onCambio={() => {}} admin />)
    expect(texto()).toContain('Cobradas sin llegar al ERP: 1')
    expect(boton('Cargada a mano en GN')).toBeNull()
    expect(boton('Descartar')).not.toBeNull()
  })

  it('mezcladas: nombra a los dos', async () => {
    await dibujar(<Pendientes ventas={[rechazada(null), rechazada('erp', 'aaaaaaaa-0000-4000-8000-000000000002')]} onCambio={() => {}} admin />)
    expect(texto()).toContain('Cobradas sin llegar a Gestión Nube o al ERP: 2')
  })
})

describe('cobros que ⛔ pasaron por la Caja (CobrosGN)', () => {
  it('los pedidos web del ERP ⛔ son «de Stunned» (en BDI también salen del ERP)', async () => {
    const r = { cobrosGN: [], cobrosERP: [{ id: 'erp-12', en: '2026-11-15T14:00:00Z', venta: 12, tn: 9001, cliente: 'Ana', monto: 20000, pos: false }], soloErp: true } as unknown as ResumenTurno
    await dibujar(<CobrosGN r={r} />)
    expect(texto()).toContain('Pedidos web cobrados en efectivo (en el ERP): 1')
    expect(texto()).not.toContain('Stunned')
  })
})
