// Los tokens de la API externa: el núcleo, y la puerta con el motor de verdad (`motor/ext/tokens.mjs`) contra un `db` falso.
import { describe, it, expect, vi } from 'vitest'
import { API_DIRECCION, ejemploDeConexion, errorDeAlta, errorDeEdicion, estadoToken, resultadoDePrueba, resumenDePermisos, textoDeEntrega, vencePorDefecto, vistaDeToken } from '@/lib/erp/tokens.core.js'
import { actividadTokenErp, crearTokenErp, editarTokenErp, probarTokenErp, regenerarTokenErp, revocarTokenErp, tokensErp } from '../api/_erp-tokens.js'
import { puedeErp, permisoErpDe } from '../lib/permisos.core.js'
import { entradaInvalida } from '../lib/erp/entrada.core.js'

const AHORA = new Date('2026-11-02T12:00:00Z')
const dias = (n: number) => new Date(AHORA.getTime() + n * 864e5).toISOString()
const catalogo = { 'a:read': { explica: 'Leer A', datos: 'Datos de A' } }
const negocios = { bdi: {} }
const alta = { negocio: 'bdi', app: 'Logística', dueno: 'Admin', permisos: ['a:read'], vence: '2027-01-31' }

describe('estadoToken', () => {
  it('cada estado, y revocado le gana a todo', () => {
    expect(estadoToken({ vence_en: dias(60) }, AHORA)).toBe('activo')
    expect(estadoToken({ vence_en: null }, AHORA)).toBe('activo')
    expect(estadoToken({ vence_en: dias(14) }, AHORA)).toBe('por_vencer')
    expect(estadoToken({ vence_en: dias(-1) }, AHORA)).toBe('vencido')
    expect(estadoToken({ vence_en: dias(60), dueno_activo: false }, AHORA)).toBe('sin_dueno')
    expect(estadoToken({ vence_en: dias(-1), revocado_en: dias(-2), dueno_activo: false }, AHORA)).toBe('revocado')
  })
})

describe('cómo conectarse', () => {
  it('la entrega lleva todo lo que necesita quien recibe el token', () => {
    const t = textoDeEntrega('erk_X')
    expect(t).toContain(API_DIRECCION)
    expect(t).toContain(`${API_DIRECCION}/docs`)
    expect(t).toContain('Authorization: Bearer erk_X')
    expect(t).toContain(`${API_DIRECCION}/me`)
  })
  it('el ejemplo sin token ⛔ inventa uno', () => {
    expect(ejemploDeConexion()).toBe(`curl -H "Authorization: Bearer TU_TOKEN" ${API_DIRECCION}/me`)
  })
  it('un vencido sigue en activos: se puede regenerar; un revocado, ⛔', () => {
    expect(vistaDeToken({ vence_en: dias(-1) })).toBe('activos')
    expect(vistaDeToken({ revocado_en: dias(-1) })).toBe('revocados')
  })
})

describe('las entradas', () => {
  it('el alta pide todo', () => {
    const o = { catalogo, negocios, ahora: AHORA }
    expect(errorDeAlta(alta, o)).toBeNull()
    expect(errorDeAlta({ ...alta, negocio: 'stunned' }, o)).toMatch(/negocio/)
    expect(errorDeAlta({ ...alta, app: ' ' }, o)).toMatch(/app/)
    expect(errorDeAlta({ ...alta, dueno: '' }, o)).toMatch(/quién/)
    expect(errorDeAlta({ ...alta, permisos: [] }, o)).toMatch(/permiso/)
    expect(errorDeAlta({ ...alta, permisos: ['x:write'] }, o)).toMatch(/no existe/)
    expect(errorDeAlta({ ...alta, vence: '' }, o)).toMatch(/fecha/)
    expect(errorDeAlta({ ...alta, vence: '2026-11-01' }, o)).toMatch(/pasó/)
  })
  it('editar pide permisos y fecha', () => {
    expect(errorDeEdicion({ permisos: ['a:read'], vence: '2027-01-31' }, { catalogo, ahora: AHORA })).toBeNull()
    expect(errorDeEdicion({ permisos: [], vence: '2027-01-31' }, { catalogo, ahora: AHORA })).toMatch(/permiso/)
  })
  it('la fecha sugerida es a 90 días', () => expect(vencePorDefecto(AHORA)).toBe('2027-01-31'))
  it('el resumen dice qué puede, qué sale y qué nunca', () => {
    expect(resumenDePermisos(['a:read'], catalogo, ['Ver costos'])).toEqual({ puede: [{ permiso: 'a:read', explica: 'Leer A', datos: 'Datos de A' }], nunca: ['Ver costos'] })
  })
  it('🔴 la prueba ⛔ saca el hash', () => {
    const r = resultadoDePrueba({ ok: true, token: { id: '7', app: 'L', negocio: 'bdi', key_prefix: 'erk_x', key_hash: 'SECRETO', permisos: [], vence_en: null, dueno_nombre: 'A', dueno_email: 'a@b' } })
    expect(JSON.stringify(r)).not.toContain('SECRETO')
    expect(JSON.stringify(r)).not.toContain('a@b')
    expect(r.token?.id).toBe(7)
  })
})

type Db = { query: ReturnType<typeof vi.fn> }
const armar = (responde: (sql: string, a?: unknown[]) => unknown[] = () => []) => {
  const db: Db = { query: vi.fn(async (sql: string, a?: unknown[]) => ({ rows: responde(sql, a) })) }
  const conMotor = vi.fn(async (_m: string, _q: string, fn: (d: Db) => unknown) => fn(db))
  return { db, conMotor }
}

describe('la puerta', () => {
  it('sólo Admin: toda vista y acción pide configurar', () => {
    for (const vista of ['tokens', 'token-actividad']) expect(permisoErpDe({ method: 'GET', vista })).toBe('configurar')
    for (const accion of ['token-crear', 'token-editar', 'token-regenerar', 'token-revocar', 'token-probar']) expect(permisoErpDe({ method: 'POST', accion })).toBe('configurar')
    const local = { funcion: ['local', 'administracion'], acceso: { bdi: { erp: true } } }
    expect(puedeErp(local, 'bdi', 'configurar')).toBe(false)
  })
  it('todo va a la base de BDI, también lo de Zattia', async () => {
    const { conMotor } = armar()
    await tokensErp({}, { conMotor })
    expect(conMotor.mock.calls[0][0]).toBe('bdi')
  })
  it('la lista lleva el catálogo real y ⛔ pide el hash', async () => {
    const { db, conMotor } = armar()
    const r = await tokensErp({}, { conMotor })
    expect(Object.keys(r.permisos)).toContain('locations:read')
    expect(r.negocios).toEqual({ bdi: 'BDI Accesorios', zattia: 'Zattia' })
    expect(r.nunca.length).toBeGreaterThan(0)
    expect(String(db.query.mock.calls[0][0])).not.toContain('key_hash')
  })
  it('crear devuelve el token UNA vez y en la base va sólo el hash', async () => {
    const { db, conMotor } = armar((sql) => (sql.includes('ext_dueno') ? [{ id: 1 }] : sql.includes('ext_token') ? [{ id: '9', key_prefix: 'erk_abc' }] : []))
    const r = await crearTokenErp({ body: { ...alta, app: 'Logistica', permisos: ['locations:read'] }, usuario: 'bruno' }, { conMotor })
    expect(r.token).toMatch(/^erk_/)
    expect(r.id).toBe(9)
    expect(JSON.stringify(db.query.mock.calls)).not.toContain(r.token)
  })
  it('crear con algo mal ⛔ llega a la base', async () => {
    const { db, conMotor } = armar()
    const r = await crearTokenErp({ body: { ...alta, permisos: ['inventado'] }, usuario: 'bruno' }, { conMotor })
    expect(r.status).toBe(400)
    expect(db.query).not.toHaveBeenCalled()
  })
  it('editar un revocado frena, y uno vivo se guarda sin cambiar el secreto', async () => {
    const rev = armar(() => [{ revocado_en: '2026-11-01' }])
    expect((await editarTokenErp({ body: { id: 1, permisos: ['locations:read'], vence: '2030-01-01' } }, { conMotor: rev.conMotor })).status).toBe(409)
    const vivo = armar((sql) => (sql.startsWith('select') ? [{ revocado_en: null }] : [{ id: 1 }]))
    expect(await editarTokenErp({ body: { id: 1, permisos: ['locations:read'], vence: '2030-01-01' } }, { conMotor: vivo.conMotor })).toEqual({ ok: true })
    expect(JSON.stringify(vivo.db.query.mock.calls)).not.toContain('key_hash')
  })
  it('regenerar y revocar', async () => {
    const a = armar(() => [{ id: '1', key_prefix: 'erk_n' }])
    expect((await regenerarTokenErp({ body: { id: 1 } }, { conMotor: a.conMotor })).token).toMatch(/^erk_/)
    const nada = armar()
    expect((await regenerarTokenErp({ body: { id: 1 } }, { conMotor: nada.conMotor })).status).toBe(409)
    expect((await revocarTokenErp({ body: { id: 1 } }, { conMotor: a.conMotor }))).toEqual({ ok: true })
    expect((await revocarTokenErp({ body: { id: 1 } }, { conMotor: nada.conMotor })).status).toBe(404)
    expect((await revocarTokenErp({ body: {} }, { conMotor: nada.conMotor })).status).toBe(400)
  })
  it('probar: uno inventado da inválido, con la regla de la API', async () => {
    const { conMotor } = armar()
    const r = await probarTokenErp({ body: { token: 'erk_' + 'a'.repeat(43) } }, { conMotor })
    expect(r).toMatchObject({ ok: false, code: 'invalid_token' })
    expect((await probarTokenErp({ body: {} }, { conMotor })).status).toBe(400)
  })
  it('la actividad ⛔ pide los parámetros', async () => {
    const { db, conMotor } = armar(() => [{ en: 'x' }])
    expect(await actividadTokenErp({ id: '7' }, { conMotor })).toEqual({ consultas: [{ en: 'x' }] })
    expect(String(db.query.mock.calls[0][0])).not.toContain('parametros')
    expect((await actividadTokenErp({ id: 'x' }, { conMotor })).status).toBe(400)
  })
  it('sin la tabla, lo dice', async () => {
    const conMotor = vi.fn(async () => { throw Object.assign(new Error('x'), { code: '42P01' }) })
    expect((await tokensErp({}, { conMotor })).status).toBe(409)
  })
})

describe('la puerta de entrada', () => {
  it('🔴 deja pasar las vistas y acciones de los tokens (si no, rebota antes de llegar)', () => {
    expect(entradaInvalida({ method: 'GET', query: { vista: 'tokens' }, body: {} })).toBeNull()
    expect(entradaInvalida({ method: 'GET', query: { vista: 'token-actividad', id: '7' }, body: {} })).toBeNull()
    expect(entradaInvalida({ method: 'POST', query: {}, body: { accion: 'token-crear', negocio: 'bdi', app: 'Logística', dueno: 'Admin', permisos: ['locations:read'], vence: '2027-01-31' } })).toBeNull()
    expect(entradaInvalida({ method: 'POST', query: {}, body: { accion: 'token-editar', id: 7, permisos: ['locations:read'], vence: '2027-01-31' } })).toBeNull()
    for (const accion of ['token-regenerar', 'token-revocar']) expect(entradaInvalida({ method: 'POST', query: {}, body: { accion, id: 7 } })).toBeNull()
    expect(entradaInvalida({ method: 'POST', query: {}, body: { accion: 'token-probar', token: 'erk_x' } })).toBeNull()
  })
})
