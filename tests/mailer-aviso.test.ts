/**
 * `lib/mailer/aviso.core.js`: el Monitor pide un aviso interno a Mailer (Darío, 12-oct-2026).
 * 🔑 Las tres respuestas ⛔ se confunden: sin conexión ⛔ es lo mismo que «Mailer dijo que no».
 */
import { describe, expect, it, vi } from 'vitest'
import { pedirAvisoInterno } from '../lib/mailer/aviso.core.js'

const AVISO = { para: ['darioarevalo@arebensrl.com'], asunto: 'A', html: '<p>h</p>', texto: 'h' }
const responde = (status: number, cuerpo: unknown) => vi.fn(async () => ({ status, json: async () => cuerpo }) as unknown as Response)

describe('pedirAvisoInterno', () => {
  it('sin URL o sin llave: ⛔ configurado, y ⛔ pide nada', async () => {
    const f = responde(200, {})
    expect(await pedirAvisoInterno({ url: '', key: 'k', fetch: f }, AVISO)).toEqual({ ok: false, configurado: false })
    expect(f).not.toHaveBeenCalled()
  })
  it('pega a /api/externo/aviso con la llave en el header, ⛔ en la URL', async () => {
    const f = responde(200, { ok: true, enviados: [{ para: 'darioarevalo@arebensrl.com', id: 'm' }], fallas: [] })
    const r = await pedirAvisoInterno({ url: 'https://mailer.x/', key: 'secreta', fetch: f }, AVISO)
    expect(r).toEqual({ ok: true, enviados: ['darioarevalo@arebensrl.com'], fallas: [] })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://mailer.x/api/externo/aviso')
    expect((init.headers as Record<string, string>)['x-ticket-key']).toBe('secreta')
    expect(JSON.parse(init.body as string)).toEqual(AVISO)
  })
  it('llave rechazada y fallas de Mailer: configurado, con el motivo y sin la llave', async () => {
    const r401 = await pedirAvisoInterno({ url: 'https://m', key: 'secreta', fetch: responde(401, null) }, AVISO)
    expect(r401).toEqual({ ok: false, configurado: true, motivo: 'Mailer rechazó la llave del Monitor' })
    const r502 = await pedirAvisoInterno({ url: 'https://m', key: 'secreta', fetch: responde(502, { ok: false, enviados: [], fallas: [{ para: 'd@arebensrl.com', motivo: 'bloqueado' }] }) }, AVISO)
    expect(r502).toEqual({ ok: false, configurado: true, motivo: 'd@arebensrl.com: bloqueado' })
    expect(JSON.stringify(r502)).not.toContain('secreta')
  })
})
