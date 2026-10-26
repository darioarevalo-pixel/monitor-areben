import { describe, it, expect, vi } from 'vitest'
import { ponerRolesErp, restablecerRolesErp, rolesGuardadosDeMarcas, vistaRoles } from '../api/_erp-permisos-rol.js'

// El motor de verdad (`motor/stock/permisos-rol.mjs`) con un `db` falso: se mira qué le llega y qué se contesta.
type Db = { query: (sql: string, args?: unknown[]) => Promise<{ rows: unknown[] }> }
const dbCon = (rows: unknown[] = [], hay = true): Db => ({
  query: vi.fn(async (sql: string) => (sql.includes('to_regclass') ? { rows: [{ hay }] } : { rows })),
})
const conMotor = (db: Db) => async (_marca: string, _que: string, fn: (db: Db) => unknown) => fn(db)

describe('api/_erp-permisos-rol.js', () => {
  it('lee lo guardado por marca; una marca que falla queda CERRADA (`__error`), no en el valor por defecto', async () => {
    const r = (await rolesGuardadosDeMarcas(['bdi', 'zattia'], {
      conMotor: async (marca: string, _q: string, fn: (db: Db) => unknown) => {
        if (marca === 'zattia') throw new Error('sin conexión')
        return fn(dbCon([{ permiso: 'cuentas', roles: ['consulta'] }]))
      },
    })) as Record<string, unknown>
    expect(r.bdi).toEqual({ cuentas: ['consulta'] })
    expect(r.zattia).toEqual({ __error: true })
  })

  it('la pantalla trae el defecto de cada marca (BDI y Zattia difieren en cuentas) y ⛔ ofrece costos ni ver', async () => {
    const v = await vistaRoles({ conMotor: conMotor(dbCon()) })
    expect(v.defecto.bdi.cuentas).toEqual(['administracion', 'mayorista'])
    expect(v.defecto.zattia.cuentas).toEqual(v.roles)
    expect(v.editables).not.toContain('costos')
    expect(v.editables).not.toContain('ver')
  })

  it('poner: valida marca, permiso y roles ANTES de tocar la base; guarda con quién lo cambió', async () => {
    const db = dbCon([{ permiso: 'cuentas', roles: ['local'] }])
    const c = { conMotor: conMotor(db) }
    for (const body of [
      { marca: 'otra', permiso: 'cuentas', roles: [] }, { marca: 'bdi', permiso: 'costos', roles: ['local'] },
      { marca: 'bdi', permiso: 'inventado', roles: [] }, { marca: 'bdi', permiso: 'cuentas', roles: ['jefe'] }, { marca: 'bdi', permiso: 'cuentas', roles: 'local' },
    ]) {
      const r = await ponerRolesErp({ body, usuario: 'bruno' }, c)
      expect(r.status).toBe(400)
    }
    expect(db.query).not.toHaveBeenCalledWith(expect.stringContaining('insert'), expect.anything())
    const ok = await ponerRolesErp({ body: { marca: 'bdi', permiso: 'cuentas', roles: ['local'] }, usuario: 'bruno' }, c)
    expect(ok).toEqual({ ok: true, marca: 'bdi', guardados: { cuentas: ['local'] } })
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('insert into erp_permisos_rol'), ['bdi', 'cuentas', ['local'], 'bruno'])
  })

  it('sin la migración (42P01) contesta 409 con el número, y restablecer borra la fila', async () => {
    const sinTabla = { conMotor: async () => { throw Object.assign(new Error('no existe'), { code: '42P01' }) } }
    const r = await ponerRolesErp({ body: { marca: 'bdi', permiso: 'cuentas', roles: [] }, usuario: 'x' }, sinTabla)
    expect(r.status).toBe(409)
    expect(r.error).toMatch(/049/)
    const db = dbCon()
    const ok = await restablecerRolesErp({ body: { marca: 'zattia', permiso: 'cobrar' } }, { conMotor: conMotor(db) })
    expect(ok.ok).toBe(true)
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('delete from erp_permisos_rol'), ['zattia', 'cobrar'])
  })
})
