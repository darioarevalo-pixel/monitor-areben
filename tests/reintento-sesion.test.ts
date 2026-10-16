import { afterEach, describe, expect, it, vi } from 'vitest'

/** El 16-oct-2026 a Lorena se le cortó la sesión de Google a mitad de una devolución. */

describe('apiFetch: un 403 a una sesión de Google se reintenta con un token nuevo', () => {
  afterEach(() => {
    vi.resetModules()
    vi.doUnmock('@/lib/sesion')
    vi.doUnmock('@/lib/identidad')
    vi.unstubAllGlobals()
  })

  async function armar(via: 'google' | 'pass', renovado: string | null) {
    vi.doMock('@/lib/sesion', () => ({
      leerSesion: () => ({ user: 'Lorena', via }),
      leerAdminPass: () => 'x',
      guardarAdminPass: () => {},
      credencialActual: async () => ({ token: 't' }),
    }))
    const tokenRenovado = vi.fn(async () => renovado)
    vi.doMock('@/lib/identidad', () => ({ tokenRenovado }))
    const fetch = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 403 })).mockResolvedValueOnce(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    const { apiFetch } = await import('@/lib/api-fetch')
    return { apiFetch, fetch, tokenRenovado }
  }

  it('con token nuevo, reintenta y sale bien', async () => {
    const { apiFetch, fetch } = await armar('google', 'nuevo')
    const r = await apiFetch('/api/x', { method: 'POST', body: '{}' })
    expect(r.status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('si no se pudo renovar, devuelve el 403 sin reintentar', async () => {
    const { apiFetch, fetch } = await armar('google', null)
    expect((await apiFetch('/api/x')).status).toBe(403)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('con contraseña no hay nada que renovar', async () => {
    const { apiFetch, fetch, tokenRenovado } = await armar('pass', 'nuevo')
    expect((await apiFetch('/api/x')).status).toBe(403)
    expect(tokenRenovado).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

describe('usuarioValido: un tropiezo de bdi-catalogo se reintenta una vez', () => {
  afterEach(() => vi.unstubAllGlobals())
  const perfil = { name: 'Lorena' }

  it('si la primera falla por red, la segunda contesta', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error('red')).mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, perfil })))
    vi.stubGlobal('fetch', fetch)
    const { usuarioValido } = await import('../api/_auth.js')
    expect(await usuarioValido('', '', 'tok')).toEqual(perfil)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('un «no» claro no se reintenta', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false })))
    vi.stubGlobal('fetch', fetch)
    const { usuarioValido } = await import('../api/_auth.js')
    expect(await usuarioValido('u', 'mal', '')).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
