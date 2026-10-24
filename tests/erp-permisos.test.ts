import { describe, it, expect } from 'vitest'
import { ACCESO_POR_FUNCION, ERP_ROLES, type Funcion, marcaExcluir, permisoErpDe, permisosErp, puedeErp, puedeVer, type Perfil } from '@/lib/permisos'

const perfil = (over: Partial<Perfil> = {}): Perfil => ({ name: 'Ana', admin: false, cuenta: null, acceso: { bdi: {}, zattia: {} }, funcion: [], ...over })
// Con la llave abierta para una persona: le tildan `erp` (es lo mismo que sumar el área a su función).
const abierto = (funcion: Funcion[], extra: Record<string, boolean> = {}) =>
  perfil({ funcion, acceso: { bdi: { erp: true, ...extra }, zattia: { erp: true } } })

describe('ERP · permisos por rol', () => {
  it('🔑 la LLAVE: ninguna función hereda el área erp ⇒ hoy el ERP es sólo admin', () => {
    for (const f of Object.keys(ACCESO_POR_FUNCION)) expect(ACCESO_POR_FUNCION[f as keyof typeof ACCESO_POR_FUNCION].areas).not.toContain('erp')
    for (const f of ERP_ROLES) {
      const u = perfil({ funcion: [f as Funcion] })
      expect(puedeVer(u, 'bdi', 'erp')).toBe(false)
      expect(puedeErp(u, 'bdi', 'ver')).toBe(false)
      expect(puedeErp(u, 'bdi', 'cobrar')).toBe(false)
    }
    expect(puedeErp(perfil({ admin: true }), 'bdi', 'configurar')).toBe(true)
  })

  it('la tabla del 18-oct: cobro, cambio, anular, editar, ajustar', () => {
    expect(puedeErp(abierto(['local']), 'bdi', 'cobrar')).toBe(true)
    expect(puedeErp(abierto(['local']), 'bdi', 'cambiar')).toBe(true)
    expect(puedeErp(abierto(['local']), 'bdi', 'anular')).toBe(true) // aprobación apagada = directo
    expect(puedeErp(abierto(['local']), 'bdi', 'ajustar')).toBe(false)
    expect(puedeErp(abierto(['local', 'deposito']), 'bdi', 'ajustar')).toBe(true) // «Local suma lo de depósito»
    expect(puedeErp(abierto(['mayorista']), 'bdi', 'cobrar')).toBe(true)
    expect(puedeErp(abierto(['mayorista']), 'bdi', 'cambiar')).toBe(false)
    expect(puedeErp(abierto(['deposito']), 'bdi', 'aprobar-ajuste')).toBe(true)
    expect(puedeErp(abierto(['administracion']), 'bdi', 'facturacion')).toBe(true)
    expect(puedeErp(abierto(['administracion']), 'bdi', 'anular')).toBe(false)
  })

  it('Consulta ve y ⛔ toca nada; los costos y la Configuración son sólo Admin', () => {
    const c = abierto(['consulta'])
    expect(puedeErp(c, 'bdi', 'ver')).toBe(true)
    for (const p of ['editar-venta', 'cobrar', 'cambiar', 'anular', 'ajustar', 'facturacion', 'costos', 'configurar']) expect(puedeErp(c, 'bdi', p)).toBe(false)
    const todos = abierto(['local', 'mayorista', 'deposito', 'administracion'])
    expect(puedeErp(todos, 'bdi', 'costos')).toBe(false)
    expect(puedeErp(todos, 'bdi', 'configurar')).toBe(false)
  })

  it('las aprobaciones prendidas le sacan anular al Local y aprobar el ajuste a Depósito (queda el Admin)', () => {
    const apr = { anular: true, conteo: true, precio: false }
    expect(puedeErp(abierto(['local']), 'bdi', 'anular', apr)).toBe(false)
    expect(puedeErp(abierto(['deposito']), 'bdi', 'aprobar-ajuste', apr)).toBe(false)
    expect(puedeErp(abierto(['deposito']), 'bdi', 'ajustar', apr)).toBe(true)
    expect(puedeErp(perfil({ admin: true }), 'bdi', 'anular', apr)).toBe(true)
  })

  it('🔑 los interruptores por marca: prendido en una sola, la otra sigue como antes (y sin dato = apagado)', () => {
    const apr = { bdi: { anular: true, conteo: false, precio: false }, zattia: { anular: false, conteo: false, precio: false } }
    expect(puedeErp(abierto(['local']), 'bdi', 'anular', apr)).toBe(false)
    expect(puedeErp(abierto(['local']), 'zattia', 'anular', apr)).toBe(true)
    expect(puedeErp(abierto(['local']), 'bdi', 'anular', { zattia: apr.zattia })).toBe(true)
    expect(puedeErp(perfil({ admin: true }), 'bdi', 'anular', apr)).toBe(true)
  })

  it('la excepción por persona: tildar da, excluir saca (también al admin), y es por marca', () => {
    expect(puedeErp(abierto(['consulta'], { 'erp.cobrar': true }), 'bdi', 'cobrar')).toBe(true)
    expect(puedeErp(abierto(['consulta'], { 'erp.cobrar': true }), 'zattia', 'cobrar')).toBe(false)
    expect(puedeErp(abierto(['local'], { [marcaExcluir('erp.anular')]: true }), 'bdi', 'anular')).toBe(false)
    const admin = perfil({ admin: true, acceso: { bdi: { [marcaExcluir('erp.configurar')]: true }, zattia: {} } })
    expect(puedeErp(admin, 'bdi', 'configurar')).toBe(false)
    expect(puedeErp(admin, 'zattia', 'configurar')).toBe(true)
  })

  it('cada vista y acción del handler pide un permiso; lo que ⛔ está en la tabla nace sólo Admin', () => {
    expect(permisoErpDe({ method: 'GET', vista: 'ventas-lista' })).toBe('ver')
    expect(permisoErpDe({ method: 'GET', vista: 'precio' })).toBe('costos')
    expect(permisoErpDe({ method: 'GET', vista: 'rutas' })).toBe('configurar')
    expect(permisoErpDe({ method: 'GET' })).toBe('facturacion')
    expect(permisoErpDe({ method: 'POST', accion: 'cobrar-venta' })).toBe('cobrar')
    expect(permisoErpDe({ method: 'POST', accion: 'poner-ruta' })).toBe('configurar')
    expect(permisoErpDe({ method: 'POST', accion: 'una-nueva' })).toBe('configurar')
    expect(puedeErp(abierto(['local', 'mayorista', 'deposito', 'administracion', 'consulta']), 'bdi', 'configurar')).toBe(false)
  })

  it('permisosErp: el mapa que lee la pantalla', () => {
    const p = permisosErp(abierto(['local']))
    expect(p.bdi).toMatchObject({ ver: true, cobrar: true, costos: false, configurar: false })
    expect(p.zattia.ver).toBe(true)
    expect(permisosErp(perfil({ funcion: ['local'] })).bdi.ver).toBe(false)
  })
})
