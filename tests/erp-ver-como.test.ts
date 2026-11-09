// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ERP_ROLES, perfilVistoComo, puedeErp } from '../lib/permisos.core.js'
import { elegirRolVisto, viendoComoEnErp } from '../lib/erp/ver-como'

/**
 * **«Ver como» real (Bruno, 9-nov).** Oráculo: los permisos del perfil visto son los de `ERP_PERMISOS` para ese rol, sólo un Admin
 * baja de rol, y mientras está activo nada se escribe desde el ERP.
 */
const admin = { name: 'bruno', admin: true, funcion: ['local'], acceso: {} }

describe('perfilVistoComo', () => {
  it('Depósito ajusta, ⛔ cobra y ⛔ ve costos', () => {
    const p = perfilVistoComo(admin, 'deposito')
    expect(puedeErp(p, 'zattia', 'ver')).toBe(true)
    expect(puedeErp(p, 'zattia', 'ajustar')).toBe(true)
    expect(puedeErp(p, 'zattia', 'cobrar')).toBe(false)
    expect(puedeErp(p, 'zattia', 'costos')).toBe(false)
    expect(puedeErp(p, 'zattia', 'configurar')).toBe(false)
  })
  it('Administración ve costos y BDI respeta quién ve las cuentas', () => {
    expect(puedeErp(perfilVistoComo(admin, 'administracion'), 'bdi', 'costos')).toBe(true)
    expect(puedeErp(perfilVistoComo(admin, 'administracion'), 'bdi', 'cuentas')).toBe(true)
    expect(puedeErp(perfilVistoComo(admin, 'local'), 'bdi', 'cuentas')).toBe(false)
  })
  it('todo rol de ERP puede entrar', () => {
    for (const r of ERP_ROLES) expect(puedeErp(perfilVistoComo(admin, r), 'bdi', 'ver')).toBe(true)
  })
  it('🔴 quien no es Admin ⛔ cambia de rol con el encabezado', () => {
    const local = { name: 'x', funcion: ['local'], acceso: {} }
    expect(perfilVistoComo(local, 'administracion')).toBe(local)
  })
  it('un rol que no existe ⛔ cambia nada', () => {
    expect(perfilVistoComo(admin, 'dueño')).toBe(admin)
    expect(perfilVistoComo(admin, '')).toBe(admin)
  })
})

describe('apiFetch con «Ver como»', () => {
  afterEach(() => { elegirRolVisto(null); window.history.pushState({}, '', '/'); vi.unstubAllGlobals() })
  const fetchFalso = () => { const f = vi.fn(async () => new Response('{}', { status: 200 })); vi.stubGlobal('fetch', f); return f }

  it('en el ERP ⛔ manda nada que escriba', async () => {
    const { apiFetch } = await import('../lib/api-fetch')
    const f = fetchFalso()
    window.history.pushState({}, '', '/erp/ventas')
    elegirRolVisto('deposito')
    const r = await apiFetch('/api/datos?recurso=erp', { method: 'POST', body: '{}' })
    expect(r.status).toBe(403)
    expect(f).not.toHaveBeenCalled()
  })
  it('las lecturas del ERP van con el rol', async () => {
    const { apiFetch } = await import('../lib/api-fetch')
    const f = fetchFalso()
    window.history.pushState({}, '', '/erp/ventas')
    elegirRolVisto('deposito')
    await apiFetch('/api/datos?recurso=erp&vista=permisos')
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(new Headers(init.headers).get('x-erp-ver-como')).toBe('deposito')
  })
  it('afuera del ERP ⛔ cambia nada', () => {
    window.history.pushState({}, '', '/ventas-mensuales')
    elegirRolVisto('deposito')
    expect(viendoComoEnErp()).toBe(false)
  })
  it('«Admin» es volver', () => {
    window.history.pushState({}, '', '/erp')
    elegirRolVisto('local')
    elegirRolVisto('admin')
    expect(viendoComoEnErp()).toBe(false)
  })
})
