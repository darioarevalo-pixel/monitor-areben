import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { ACCESO_POR_FUNCION, ERP_ROLES, type Funcion, marcaExcluir, PERMISOS_EDITABLES, permisoErpDe, permisosErp, puedeErp, puedeVer, type Perfil } from '@/lib/permisos'

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

  it('Consulta ve y ⛔ toca nada; los costos son de Admin y Administración (que los carga, Bruno 30-oct); la Configuración, sólo Admin', () => {
    const c = abierto(['consulta'])
    expect(puedeErp(c, 'bdi', 'ver')).toBe(true)
    for (const p of ['editar-venta', 'cobrar', 'cambiar', 'anular', 'ajustar', 'facturacion', 'costos', 'configurar']) expect(puedeErp(c, 'bdi', p)).toBe(false)
    for (const r of ['local', 'mayorista', 'deposito', 'consulta'] as const) for (const m of ['bdi', 'zattia']) expect(puedeErp(abierto([r]), m, 'costos')).toBe(false)
    for (const m of ['bdi', 'zattia']) expect(puedeErp(abierto(['administracion']), m, 'costos')).toBe(true)
    const todos = abierto(['local', 'mayorista', 'deposito', 'administracion'])
    expect(puedeErp(todos, 'bdi', 'configurar')).toBe(false)
  })

  it('las aprobaciones prendidas le sacan anular al Local y aprobar el ajuste a Depósito (queda el Admin)', () => {
    const apr = { anular: true, conteo: true, precio: false }
    expect(puedeErp(abierto(['local']), 'bdi', 'anular', apr)).toBe(false)
    expect(puedeErp(abierto(['deposito']), 'bdi', 'aprobar-ajuste', apr)).toBe(false)
    expect(puedeErp(abierto(['deposito']), 'bdi', 'ajustar', apr)).toBe(true)
    expect(puedeErp(perfil({ admin: true }), 'bdi', 'anular', apr)).toBe(true)
  })

  it('corregir precio: la oficina lo hace; con el interruptor `precio` de ESA marca prendido, sólo el Admin', () => {
    expect(puedeErp(abierto(['administracion']), 'bdi', 'corregir-precio')).toBe(true)
    expect(puedeErp(abierto(['local']), 'bdi', 'corregir-precio')).toBe(false)
    const apr = { bdi: { anular: false, conteo: false, precio: true }, zattia: { anular: false, conteo: false, precio: false } }
    expect(puedeErp(abierto(['administracion']), 'bdi', 'corregir-precio', apr)).toBe(false)
    expect(puedeErp(abierto(['administracion']), 'zattia', 'corregir-precio', apr)).toBe(true)
    expect(puedeErp(perfil({ admin: true }), 'bdi', 'corregir-precio', apr)).toBe(true)
  })

  it('corregir el medio de un cobro: la oficina y el local (Bruno 30-oct: «suele pasar»), y ⛔ lo frena el interruptor de precio (no es un precio)', () => {
    expect(puedeErp(abierto(['administracion']), 'bdi', 'corregir-medio')).toBe(true)
    expect(puedeErp(abierto(['local']), 'bdi', 'corregir-medio')).toBe(true)
    expect(puedeErp(abierto(['mayorista']), 'bdi', 'corregir-medio')).toBe(false)
    expect(puedeErp(abierto(['deposito']), 'zattia', 'corregir-medio')).toBe(false)
    const apr = { bdi: { anular: true, conteo: true, precio: true }, zattia: { anular: false, conteo: false, precio: false } }
    expect(puedeErp(abierto(['administracion']), 'bdi', 'corregir-medio', apr)).toBe(true)
    expect(puedeErp(perfil({ admin: true }), 'bdi', 'corregir-medio', apr)).toBe(true)
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
    // La ficha del producto es de todos: el costo lo saca el SERVIDOR (`sinCostos`). La facturación del mes, de quien factura.
    expect(permisoErpDe({ method: 'GET', vista: 'precio' })).toBe('ver')
    expect(permisoErpDe({ method: 'GET', vista: 'facturacion' })).toBe('facturacion')
    expect(permisoErpDe({ method: 'GET', vista: 'inicio-resultado' })).toBe('costos')
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

  it('toda vista y acción que sirve el handler está NOMBRADA en la tabla (si no, cae en «configurar» y la cajera ve un 403)', () => {
    const fuente = readFileSync('api/_erp.js', 'utf8')
    const vistas = [...new Set([...fuente.matchAll(/vista === '([a-z-]+)'/g)].map((m) => m[1]))]
    const acciones = [...new Set([...fuente.matchAll(/accion === '([a-z-]+)'/g)].map((m) => m[1]))]
    expect(vistas.length).toBeGreaterThan(30)
    expect(acciones.length).toBeGreaterThan(25)
    // El permiso por omisión es «configurar»: una vista que lo pide a propósito lo dice con todas las letras.
    const sinNombrar = (tipo: 'vista' | 'accion', claves: string[]) => claves.filter((k) => {
      const src = readFileSync('lib/permisos.core.js', 'utf8')
      const bloque = src.slice(src.indexOf(tipo === 'vista' ? 'const PERMISO_DE_VISTA' : 'const PERMISO_DE_ACCION'), src.indexOf(tipo === 'vista' ? 'const PERMISO_DE_ACCION' : 'export function permisoErpDe'))
      return !new RegExp(`(^|[\\s,{'"])'?${k}'?:`).test(bloque)
    })
    expect(sinNombrar('vista', vistas)).toEqual([])
    expect(sinNombrar('accion', acciones)).toEqual([])
  })

  it('el Local lee clientes, productos y cobros; el resultado del Inicio y la Configuración siguen siendo del Admin', () => {
    for (const vista of ['clientes-lista', 'cliente-ficha', 'productos-lista', 'cobros', 'transferencias']) expect(permisoErpDe({ method: 'GET', vista })).toBe('ver')
    expect(permisoErpDe({ method: 'GET', vista: 'inicio-resultado' })).toBe('costos')
    for (const vista of ['configuracion', 'reglas', 'rutas', 'interruptores']) expect(permisoErpDe({ method: 'GET', vista })).toBe('configurar')
    expect(puedeErp(abierto(['local']), 'bdi', permisoErpDe({ method: 'GET', vista: 'inicio-resultado' }))).toBe(false)
    expect(puedeErp(abierto(['local']), 'bdi', permisoErpDe({ method: 'GET', vista: 'clientes-lista' }))).toBe(true)
  })

  it('cuentas corrientes: en BDI Administración (y Mayorista); en Zattia todos; el estado de cobro de la venta lo ve cualquiera', () => {
    const p = (vista: string) => permisoErpDe({ method: 'GET', vista })
    expect(p('cuentas-corrientes')).toBe('cuentas')
    expect(p('cuenta-cliente')).toBe('cuentas')
    for (const f of ['administracion', 'mayorista'] as Funcion[]) expect(puedeErp(abierto([f]), 'bdi', 'cuentas')).toBe(true)
    for (const f of ['local', 'deposito', 'consulta'] as Funcion[]) {
      expect(puedeErp(abierto([f]), 'bdi', 'cuentas')).toBe(false)
      expect(puedeErp(abierto([f]), 'zattia', 'cuentas')).toBe(true)
    }
    expect(puedeErp(perfil({ admin: true }), 'bdi', 'cuentas')).toBe(true)
    expect(puedeErp(abierto(['local']), 'bdi', p('ventas-lista'))).toBe(true)
  })

  it('roles GUARDADOS (sql/048): pisan la tabla en ESA marca y permiso; sin fila, la tabla; costos/ver/roles inventados no se tocan', () => {
    const g = { bdi: { cuentas: ['consulta'], cobrar: [], costos: ['local'], ver: [], anular: ['jefe'] } }
    expect(puedeErp(abierto(['administracion']), 'bdi', 'cuentas', undefined, g)).toBe(false) // la tabla decía que sí
    expect(puedeErp(abierto(['consulta']), 'bdi', 'cuentas', undefined, g)).toBe(true)
    expect(puedeErp(abierto(['local']), 'zattia', 'cuentas', undefined, g)).toBe(true) // otra marca: sigue la tabla
    expect(puedeErp(abierto(['local']), 'bdi', 'cobrar', undefined, g)).toBe(false) // lista vacía = nadie salvo Admin
    expect(puedeErp(perfil({ admin: true }), 'bdi', 'cobrar', undefined, g)).toBe(true)
    expect(puedeErp(abierto(['local']), 'bdi', 'costos', undefined, g)).toBe(false) // costos no se reparte
    expect(puedeErp(abierto(['consulta']), 'bdi', 'ver', undefined, g)).toBe(true)
    expect(puedeErp(abierto(['local']), 'bdi', 'anular', undefined, g)).toBe(false) // rol inventado se descarta
    expect(permisosErp(abierto(['consulta']), undefined, g).bdi.cuentas).toBe(true)
    expect(PERMISOS_EDITABLES).not.toContain('costos')
    expect(PERMISOS_EDITABLES).not.toContain('ver')
  })
})
