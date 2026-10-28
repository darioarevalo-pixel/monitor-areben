import { describe, it, expect, vi } from 'vitest'
import { encargadasErp, pinesErp, ponerPinErp, quitarPinErp, verificarPinErp, autorizarConPin } from '../api/_erp-pin.js'
import { puedeErp, permisoErpDe } from '../lib/permisos.core.js'
import { entradaInvalida } from '../lib/erp/entrada.core.js'
import { encargadasDeMarca } from '../lib/erp/encargadas.core.js'

// El motor de verdad (`motor/stock/pin.mjs`) con un `db` falso: se mira qué se le pide y qué se contesta.
type Db = { query: (sql: string, args?: unknown[]) => Promise<{ rows: unknown[] }> }
const conMotor = (db: Db) => async (_m: string, _q: string, fn: (db: Db) => unknown) => fn(db)
const hash = 'a'.repeat(64)
// PIN 1234 con sal fija: se calcula con el mismo scrypt que el motor.
import { scryptSync } from 'node:crypto'
const sal = 'b'.repeat(32)
const bueno = scryptSync('1234', Buffer.from(sal, 'hex'), 32).toString('hex')
const dbPin = (): Db => ({
  query: vi.fn(async (sql: string) => {
    if (sql.startsWith('select bloqueado_hasta')) return { rows: [{ bloqueado_hasta: null }] }
    if (sql.startsWith('update erp_pin set\n')) return { rows: [{ hash: bueno, sal, intentos: 1 }] }
    return { rows: [] }
  }),
})

describe('api/_erp-pin.js', () => {
  it('🔑 sólo Admin fija y quita PINs y mira la lista; Local verifica (permiso nuevo `autorizar-pin`)', () => {
    expect(permisoErpDe({ method: 'POST', accion: 'poner-pin' })).toBe('configurar')
    expect(permisoErpDe({ method: 'POST', accion: 'quitar-pin' })).toBe('configurar')
    expect(permisoErpDe({ method: 'GET', vista: 'pines' })).toBe('configurar')
    expect(permisoErpDe({ method: 'POST', accion: 'verificar-pin' })).toBe('autorizar-pin')
    const local = { name: 'Ana', admin: false, cuenta: null, acceso: { bdi: { erp: true }, zattia: {} }, funcion: ['local'] }
    expect(puedeErp(local, 'bdi', 'autorizar-pin')).toBe(true)
    expect(puedeErp(local, 'bdi', 'configurar')).toBe(false)
    expect(puedeErp({ ...local, funcion: ['consulta'] }, 'bdi', 'autorizar-pin')).toBe(false)
  })

  it('las acciones y la vista tienen forma conocida para el handler', () => {
    expect(entradaInvalida({ method: 'POST', query: {}, body: { accion: 'poner-pin', marca: 'bdi', persona: 'ana', pin: '1234' } })).toBeNull()
    expect(entradaInvalida({ method: 'GET', query: { vista: 'pines', marca: 'bdi' } })).toBeNull()
    expect(entradaInvalida({ method: 'GET', query: { vista: 'encargadas', marca: 'zattia' } })).toBeNull()
  })

  it('verifica el PIN bueno; el malo da 403 con `quedan` y ⛔ devuelve hash', async () => {
    const db = dbPin()
    const ok = await verificarPinErp({ body: { marca: 'bdi', persona: ' Ana ', pin: '1234' } }, { conMotor: conMotor(db) })
    expect(ok).toEqual({ ok: true, marca: 'bdi', persona: 'ana' })
    const mal = await verificarPinErp({ body: { marca: 'bdi', persona: 'ana', pin: '0000' } }, { conMotor: conMotor(db) }) as Record<string, unknown>
    expect(mal.status).toBe(403)
    expect(mal.codigo).toBe('PIN_INCORRECTO')
    expect(mal.quedan).toBe(4)
    expect(JSON.stringify([ok, mal])).not.toContain(bueno)
  })

  it('sin PIN cargado, bloqueada y forma inválida: cada una con su código, ⛔ «incorrecto» para todo', async () => {
    const sinPin: Db = { query: vi.fn(async () => ({ rows: [] })) }
    expect(await verificarPinErp({ body: { marca: 'bdi', persona: 'ana', pin: '1234' } }, { conMotor: conMotor(sinPin) })).toMatchObject({ status: 400, codigo: 'SIN_PIN' })
    const bloq: Db = { query: vi.fn(async (sql: string) => (sql.startsWith('select') ? { rows: [{ bloqueado_hasta: 'x' }] } : { rows: [] })) }
    expect(await verificarPinErp({ body: { marca: 'bdi', persona: 'ana', pin: '1234' } }, { conMotor: conMotor(bloq) })).toMatchObject({ status: 403, codigo: 'BLOQUEADO' })
    expect(await verificarPinErp({ body: { marca: 'bdi', persona: 'ana', pin: '12' } }, { conMotor: conMotor(dbPin()) })).toMatchObject({ status: 400, codigo: 'PIN_INVALIDO' })
  })

  it('🔴 la base caída o sin tabla se DICE: la caída lanza (⛔ «PIN incorrecto»), sin tabla es 409', async () => {
    const caida = async () => { throw new Error('sin conexión') }
    await expect(verificarPinErp({ body: { marca: 'bdi', persona: 'ana', pin: '1234' } }, { conMotor: caida as never })).rejects.toThrow('sin conexión')
    const sinTabla = async () => { throw Object.assign(new Error('x'), { code: '42P01' }) }
    expect(await verificarPinErp({ body: { marca: 'bdi', persona: 'ana', pin: '1234' } }, { conMotor: sinTabla as never })).toMatchObject({ status: 409 })
    const sinConexion = async () => ({ status: 409, error: 'falta la conexión del motor' })
    expect(await verificarPinErp({ body: { marca: 'bdi', persona: 'ana', pin: '1234' } }, { conMotor: sinConexion as never })).toMatchObject({ status: 409 })
  })

  it('fijar y quitar: validan marca, persona y 4 dígitos; guardan quién lo hizo y ⛔ devuelven el PIN', async () => {
    const db = dbPin()
    expect(await ponerPinErp({ body: { marca: 'otra', persona: 'ana', pin: '1234' }, usuario: 'bruno' }, { conMotor: conMotor(db) })).toMatchObject({ status: 400 })
    expect(await ponerPinErp({ body: { marca: 'bdi', persona: '', pin: '1234' }, usuario: 'bruno' }, { conMotor: conMotor(db) })).toMatchObject({ status: 400 })
    expect(await ponerPinErp({ body: { marca: 'bdi', persona: 'ana', pin: '12345' }, usuario: 'bruno' }, { conMotor: conMotor(db) })).toMatchObject({ status: 400, codigo: 'PIN_INVALIDO' })
    expect(db.query).not.toHaveBeenCalled()
    const r = await ponerPinErp({ body: { marca: 'bdi', persona: 'Ana', pin: '1234' }, usuario: 'bruno' }, { conMotor: conMotor(db) })
    expect(r).toEqual({ ok: true, marca: 'bdi', persona: 'ana' })
    expect((db.query as ReturnType<typeof vi.fn>).mock.calls[0][1]).toEqual(['ana', expect.any(String), expect.any(String), '1234', 'bruno'])
    expect(await quitarPinErp({ body: { marca: 'bdi', persona: 'ana' } }, { conMotor: conMotor(db) })).toEqual({ ok: true, marca: 'bdi', persona: 'ana' })
  })

  it('la lista trae quién tiene PIN, cuál es (Bruno: visible para Admin) y ⛔ el hash', async () => {
    const db: Db = { query: vi.fn(async () => ({ rows: [{ usuario: 'ana', pin: '4821', cambiado_por: 'bruno', cambiado_en: 'ayer', bloqueado: false, bloqueado_hasta: null, hash }] })) }
    const r = await pinesErp({ marca: 'bdi' }, { conMotor: conMotor(db) }) as { pines: Record<string, unknown>[] }
    expect(r.pines[0]).toEqual({ usuario: 'ana', pin: '4821', cambiado_por: 'bruno', cambiado_en: 'ayer', bloqueado: false, bloqueado_hasta: null })
    expect(JSON.stringify(r)).not.toContain(hash)
  })

  it('`autorizarConPin` arma `autoriza` en el servidor, con el nombre normalizado, o devuelve el error', async () => {
    expect(await autorizarConPin({ marca: 'bdi', persona: 'Ana', pin: '1234' }, { conMotor: conMotor(dbPin()) })).toEqual({ autoriza: { usuario: 'ana', motivo: 'pin_encargada' } })
    expect(await autorizarConPin({ marca: 'bdi', persona: 'ana', pin: '0000' }, { conMotor: conMotor(dbPin()) })).toMatchObject({ status: 403 })
  })

  it('🔑 la lista del POS (Bruno 28-oct): quien cobra en la caja de ESA marca y tiene PIN; ⛔ Admin, ⛔ la otra marca', () => {
    const usuarios = [
      { name: 'Bruno Arevalo', admin: true, funcion: ['direccion'], cuenta: null },
      { name: 'camilaquintana', admin: false, funcion: ['local'], cuenta: 'zattia' },
      { name: 'josefinabatter', apodo: 'Jose', admin: false, funcion: ['local'], cuenta: 'zattia' },
      { name: 'karenf', admin: false, funcion: ['local'], cuenta: 'bdi' },
      { name: 'Lorena Reyes', admin: false, funcion: ['administracion', 'deposito', 'local'], cuenta: null },
      { name: 'Camila Budek', admin: false, funcion: ['marketing'], cuenta: null },
      { name: 'micaresolani', admin: false, funcion: 'local', cuenta: 'zattia' },
    ]
    const conPin = ['bruno arevalo', 'camilaquintana', 'josefinabatter', 'karenf', 'camila budek', 'lorena reyes']
    expect(encargadasDeMarca({ usuarios, conPin, marca: 'zattia' })).toEqual([
      { usuario: 'camilaquintana', nombre: 'camilaquintana' },
      { usuario: 'josefinabatter', nombre: 'Jose' },
      { usuario: 'lorena reyes', nombre: 'Lorena Reyes' },
    ])
    expect(encargadasDeMarca({ usuarios, conPin, marca: 'bdi' }).map((e) => e.usuario)).toEqual(['karenf', 'lorena reyes'])
  })

  it('la vista `encargadas` la lee quien autoriza; trae nombres, ⛔ el PIN; sin padrón ⇒ null (se escribe el usuario)', async () => {
    expect(permisoErpDe({ method: 'GET', vista: 'encargadas' })).toBe('autorizar-pin')
    const db: Db = { query: vi.fn(async () => ({ rows: [{ usuario: 'ana', pin: '4821', cambiado_por: 'bruno', cambiado_en: 'ayer', bloqueado: false, bloqueado_hasta: null, hash }] })) }
    const padron = async () => [{ name: 'Ana', admin: false, funcion: ['local'], cuenta: 'zattia' }]
    const r = await encargadasErp({ marca: 'zattia' }, { conMotor: conMotor(db), padron })
    expect(r).toEqual({ marca: 'zattia', encargadas: [{ usuario: 'ana', nombre: 'Ana' }] })
    expect(JSON.stringify(r)).not.toContain('4821')
    expect(await encargadasErp({ marca: 'zattia' }, { conMotor: conMotor(db), padron: async () => null })).toEqual({ marca: 'zattia', encargadas: null })
    expect(await encargadasErp({ marca: 'otra' }, { conMotor: conMotor(db), padron })).toMatchObject({ status: 400 })
  })
})
