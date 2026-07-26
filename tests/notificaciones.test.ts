import { describe, expect, it } from 'vitest'
import {
  avisosDeAprobacion,
  avisosDeFallas,
  avisosDeNoDevueltos,
  avisosDeSolicitud,
  contarNuevos,
  ordenarAvisos,
} from '@/lib/notificaciones/derivar'
import type { ResumenSolicitud } from '@/lib/solicitudes/overview'
import type { FallaRow } from '@/lib/postventa/fallas/tipos'
import type { Solicitud } from '@/lib/sesionfotos/tipos'
import type { Perfil } from '@/lib/permisos'

/**
 * Los avisos se DERIVAN de datos que ya existen, no se registran: por eso todo esto se testea
 * con funciones puras y sin mocks de red. Lo que se ancla acá es a QUIÉN le corresponde cada
 * aviso — que es donde un error se paga caro: un aviso de más y el contador se vuelve ruido que
 * la gente aprende a ignorar; uno de menos y el trabajo se queda esperando.
 */

const perfil = (over: Partial<Perfil> = {}): Perfil =>
  ({ name: 'ana', admin: false, cuenta: null, acceso: {}, funcion: [], ...over }) as Perfil

const resumen = (over: Partial<ResumenSolicitud> = {}): ResumenSolicitud =>
  ({
    id: 's1', marca: 'bdi', tipo: 'foto', titulo: 'Sesión', subtitulo: '', estadoLabel: 'Pendiente',
    color: '', bg: '', grupo: 'pendiente', creadoPor: 'ana', creado: 1000, fecha: '2026-07-26',
    unidades: 3, uLocal: 3, uDeposito: 0, seccion: 'sesion-fotos', ...over,
  }) as ResumenSolicitud

const item = (over = {}) => ({ vid: 'v1', pid: '1', sid: '10', nombre: 'Remera', variante: 'M', sku: 'R-M', qty: 2, origen: 'local', ...over })
const sol = (over: Partial<Solicitud> = {}): Solicitud =>
  ({ id: 's1', fecha: '2026-07-20', creado: 500, creadoPor: 'ana', descripcion: 'Sesión', estado: 'cargada', items: [item()], ...over }) as Solicitud

const falla = (over: Partial<FallaRow> = {}): FallaRow =>
  ({ id: 1, store: 'bdi', producto: 'Remera', cantidad: 1, estado: 'cargada', ubicacion: 'local', ...over }) as FallaRow

describe('avisos de aprobación', () => {
  const pendiente = resumen({ estadoLabel: 'Pendiente de aprobar' })

  it('le llegan a quien puede aprobar', () => {
    expect(avisosDeAprobacion([pendiente], perfil({ admin: true }), 'bdi')).toHaveLength(1)
  })

  it('no le llegan a quien no aprueba', () => {
    expect(avisosDeAprobacion([pendiente], perfil({ funcion: ['local'] }), 'bdi')).toEqual([])
  })

  it('solo cuentan las que esperan aprobación', () => {
    expect(avisosDeAprobacion([resumen()], perfil({ admin: true }), 'bdi')).toEqual([])
  })
})

describe('avisos de solicitud del sector', () => {
  it('Local recibe lo que tiene que preparar', () => {
    const a = avisosDeSolicitud([resumen()], perfil({ funcion: ['local'] }))
    expect(a).toHaveLength(1)
    expect(a[0].tipo).toBe('solicitud')
  })

  it('quien ve todo NO los recibe: le llenaría el contador con las solicitudes de toda la empresa', () => {
    expect(avisosDeSolicitud([resumen()], perfil({ admin: true }))).toEqual([])
    expect(avisosDeSolicitud([resumen()], perfil({ funcion: ['marketing'] }))).toEqual([])
  })

  it('una solicitud ya devuelta no espera trabajo de nadie', () => {
    expect(avisosDeSolicitud([resumen({ grupo: 'devuelta' })], perfil({ funcion: ['local'] }))).toEqual([])
  })
})

describe('avisos de productos no devueltos', () => {
  // Salió con venta, se prepararon 2, volvió 1 → falta 1.
  const conFalta = sol({ ventas: { local: { id: 1, number: 9 } }, verif: { v1: 2 }, devuelto: { v1: 1 } })

  it('los ve quien coordina', () => {
    const a = avisosDeNoDevueltos([conFalta], 'bdi', perfil({ funcion: ['marketing'] }))
    expect(a).toHaveLength(1)
    expect(a[0].detalle).toContain('1 unidad sin devolver')
  })

  it('NO los ve el sector que prepara: no es quien persigue la devolución', () => {
    expect(avisosDeNoDevueltos([conFalta], 'bdi', perfil({ funcion: ['local'] }))).toEqual([])
  })

  it('lo que no salió no falta (los no encontrados no se persiguen)', () => {
    const sinPreparar = sol({ ventas: { local: { id: 1, number: 9 } }, verif: {}, devuelto: {} })
    expect(avisosDeNoDevueltos([sinPreparar], 'bdi', perfil({ admin: true }))).toEqual([])
  })

  it('una solicitud cerrada ya no molesta', () => {
    expect(avisosDeNoDevueltos([{ ...conFalta, estado: 'cerrada' }], 'bdi', perfil({ admin: true }))).toEqual([])
  })
})

describe('avisos de fallas por llevar al depósito', () => {
  it('agrupa todas en UN aviso: son el mismo montón y se llevan juntas', () => {
    const a = avisosDeFallas([falla(), falla({ id: 2, cantidad: 3 })], 'bdi', perfil({ funcion: ['local'] }))
    expect(a).toHaveLength(1)
    expect(a[0].titulo).toBe('2 fallas para llevar al depósito')
    expect(a[0].detalle).toContain('4 unidades')
  })

  it('una falla ya recibida en el depósito no espera a nadie', () => {
    expect(avisosDeFallas([falla({ estado: 'recibida', ubicacion: 'deposito' })], 'bdi', perfil({ admin: true }))).toEqual([])
  })

  it('el depósito no las ve: no son suyas hasta que llegan', () => {
    expect(avisosDeFallas([falla()], 'bdi', perfil({ funcion: ['deposito'] }))).toEqual([])
  })
})

describe('orden y conteo de nuevos', () => {
  it('lo más nuevo va arriba', () => {
    const a = ordenarAvisos([
      ...avisosDeSolicitud([resumen({ id: 'vieja', creado: 100 })], perfil({ funcion: ['local'] })),
      ...avisosDeSolicitud([resumen({ id: 'nueva', creado: 900 })], perfil({ funcion: ['local'] })),
    ])
    expect(a[0].id).toContain('nueva')
  })

  it('nuevo = apareció después de la última visita', () => {
    const avisos = avisosDeSolicitud(
      [resumen({ id: 'a', creado: 100 }), resumen({ id: 'b', creado: 900 })],
      perfil({ funcion: ['local'] }),
    )
    expect(contarNuevos(avisos, 500)).toBe(1)
    expect(contarNuevos(avisos, 0)).toBe(2)
    expect(contarNuevos(avisos, 1000)).toBe(0)
  })
})
