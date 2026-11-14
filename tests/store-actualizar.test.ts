import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 🔑 «Actualizar productos» de la Caja (Bruno, 14-nov-2026): el SHORT INNA dado de alta en GN a las 12:03
 * ⛔ tenía precio en el POS porque la lista venía del caché de 6 h. Lo que se prueba: **mientras baja lo
 * nuevo, la pantalla sigue viendo lo de antes** (`cargar(…, true)` la dejaba ~20 s sin productos), y si la
 * bajada falla, lo de antes queda.
 */
const leerCache = vi.fn()
vi.mock('@/lib/cache', () => ({
  leerCache: (...a: unknown[]) => leerCache(...a),
  guardarCache: async () => ({ ok: true }),
  mapaColorManual: () => ({}),
}))
const traerDatos = vi.fn()
vi.mock('@/lib/datos', () => ({
  desdeVentas: () => '2025-01-01',
  traerDatos: (...a: unknown[]) => traerDatos(...a),
}))
vi.mock('@/lib/etl/computar', () => ({
  computarDatos: (p: { v: string }) => ({ v: p.v }),
}))

const { useMonitorStore } = await import('@/store/useMonitorStore')

const st = () => useMonitorStore.getState() as unknown as { marca: string | null; estado: string; datos: { v: string } | null; origen: { tipo: string; refrescando?: boolean } | null }
const pantalla = () => (st().estado === 'listo' && st().marca === 'zattia' ? st().datos : null)

beforeEach(async () => {
  leerCache.mockReset()
  traerDatos.mockReset()
  useMonitorStore.getState().limpiar()
  leerCache.mockResolvedValue({ timestamp: Date.now(), data: { v: 'viejo', colorManual: [] }, marca: 'zattia' })
  await useMonitorStore.getState().cargar('zattia', true)
})

describe('actualizar sin sacar lo que se ve', () => {
  it('mientras baja, la pantalla sigue con lo de antes; al llegar, lo nuevo', async () => {
    let soltar: () => void = () => {}
    traerDatos.mockImplementation(() => new Promise((r) => { soltar = () => r({ v: 'nuevo', colorManual: [] }) }))
    const enCurso = useMonitorStore.getState().actualizar('zattia' as never, true)
    await Promise.resolve()
    expect(pantalla()).toEqual({ v: 'viejo' })
    expect(st().origen).toMatchObject({ refrescando: true })
    soltar()
    await enCurso
    expect(pantalla()).toEqual({ v: 'nuevo' })
    expect(st().origen).toMatchObject({ tipo: 'red' })
  })

  it('si la bajada falla, queda lo de antes y avisa', async () => {
    traerDatos.mockRejectedValue(new Error('sin red'))
    await expect(useMonitorStore.getState().actualizar('zattia' as never, true)).rejects.toThrow('sin red')
    expect(pantalla()).toEqual({ v: 'viejo' })
    expect(st().origen).toMatchObject({ tipo: 'cache', refrescando: false })
  })
})
