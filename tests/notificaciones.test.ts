import { describe, expect, it } from 'vitest'
import {
  avisosDeAprobacion,
  avisosDeContenidoSinRevisar,
  avisosDeFallas,
  avisosDeNoDevueltos,
  avisosDeReclamo,
  avisosDeSolicitud,
  contarNuevos,
  ordenarAvisos,
} from '@/lib/notificaciones/derivar'
import type { ResumenSolicitud } from '@/lib/solicitudes/overview'
import type { FallaRow } from '@/lib/postventa/fallas/tipos'
import type { ReclamoRow } from '@/lib/reclamos/tipos'
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

  // El fixture dice `0` y no `{}` a propósito: un 0 escrito a mano es "lo busqué y no está", que
  // es lo que este caso quiere probar. El `{}` significa otra cosa —nadie escaneó— y es el caso de
  // abajo.
  it('lo que no salió no falta (los no encontrados no se persiguen)', () => {
    const noEncontrado = sol({ ventas: { local: { id: 1, number: 9 } }, verif: { v1: 0 }, devuelto: {} })
    expect(avisosDeNoDevueltos([noEncontrado], 'bdi', perfil({ admin: true }))).toEqual([])
  })

  it('si salió sin que nadie escaneara, sí se persigue: salió lo pedido', () => {
    const sinEscanear = sol({ ventas: { local: { id: 1, number: 9 } }, verif: {}, devuelto: {} })
    expect(avisosDeNoDevueltos([sinEscanear], 'bdi', perfil({ admin: true }))).toHaveLength(1)
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

/**
 * El séptimo aviso: **material que ella ya subió y nadie miró**.
 *
 * Es el único de los siete que avisa de trabajo YA HECHO esperando del otro lado. Los otros seis
 * son cosas que esperan que alguien decida; éste es una foto que llegó a un buzón que nadie abre —
 * y hasta que existió, subir seis videos no movía un solo píxel en el monitor.
 */
describe('avisos de contenido sin revisar', () => {
  const conCanjes = perfil({ acceso: { bdi: { canjes: true } } } as Partial<Perfil>)
  const uno = { canjeId: 5, store: 'bdi' as const, persona: 'Lucía', cuantas: 2, desde: 1000 }

  it('es UN aviso agrupado, no uno por creadora', () => {
    const r = avisosDeContenidoSinRevisar(
      [uno, { canjeId: 6, store: 'bdi', persona: 'Nadia', cuantas: 3, desde: 2000 }],
      conCanjes,
      'bdi',
    )
    expect(r).toHaveLength(1)
    expect(r[0].titulo).toBe('5 archivos sin revisar')
    expect(r[0].detalle).toContain('2 creadoras')
  })

  it('🔑 el id NO lleva la cantidad: revisar uno no puede hacer que el aviso vuelva a ser nuevo', () => {
    const a = avisosDeContenidoSinRevisar([uno], conCanjes, 'bdi')[0]
    const b = avisosDeContenidoSinRevisar([{ ...uno, cuantas: 1 }], conCanjes, 'bdi')[0]
    expect(a.id).toBe(b.id)
  })

  it('ordena por el archivo más VIEJO: lo que importa es hace cuánto está esperando', () => {
    const r = avisosDeContenidoSinRevisar(
      [{ ...uno, desde: 5000 }, { canjeId: 6, store: 'bdi', persona: 'Nadia', cuantas: 1, desde: 900 }],
      conCanjes,
      'bdi',
    )
    expect(r[0].ts).toBe(900)
  })

  it('con una sola creadora la nombra', () => {
    const r = avisosDeContenidoSinRevisar([uno], conCanjes, 'bdi')
    expect(r[0].titulo).toBe('2 archivos sin revisar')
    expect(r[0].detalle).toContain('Lucía')
  })

  it('sin acceso a Canjes no hay aviso: nadie ve un aviso de algo a lo que no puede entrar', () => {
    expect(avisosDeContenidoSinRevisar([uno], perfil(), 'bdi')).toEqual([])
  })

  it('sin nada sin revisar, ningún aviso', () => {
    expect(avisosDeContenidoSinRevisar([], conCanjes, 'bdi')).toEqual([])
  })
})

/**
 * 🔴 **El aviso que le faltaba a todo el post-venta.** Las cuatro alertas ya existían y se
 * dibujaban **sólo adentro de la pantalla de Reclamos**, que es de Administración: para enterarse
 * de que un reclamo dormía había que entrar a mirarlo. Lo que se ancla acá es que el acarreo al
 * sidebar ⛔ **no inventa ninguna regla nueva** —los plazos y los relojes siguen en `alertasDe`— y
 * que no avisa de lo que ya no existe.
 */
describe('avisos de reclamos durmiendo', () => {
  const DIA = 86400000
  // ⚠️ Relativo al reloj REAL y no a una fecha fija: `alertasDe` cuenta contra `Date.now()`, así
  // que con un ancla del calendario estos plazos se corren un día por día que pasa.
  const hace = (d: number) => new Date(Date.now() - d * DIA).toISOString()
  const admin = perfil({ admin: true })
  // Administración ve `postventa` por su función, sin ningún tilde a mano.
  const administracion = perfil({ funcion: ['administracion'] })
  const local = perfil({ funcion: ['local'] })

  const reclamo = (over: Partial<ReclamoRow> = {}): ReclamoRow =>
    ({
      id: 42, store: 'bdi', motivo: 'falla', estado: 'esperando_cliente',
      created_at: hace(30), updated_at: hace(30), historial: [],
      ...over,
    }) as ReclamoRow

  it('un reclamo dormido llega al sidebar de Administración', () => {
    const [a] = avisosDeReclamo([reclamo()], 'bdi', administracion)
    expect(a.tipo).toBe('reclamo')
    expect(a.titulo).toContain('R-0042')
    expect(a.detalle).toContain('El cliente no responde')
  })

  it('lleva a la PESTAÑA de reclamos, no a Post-venta a secas: `/postventa` abre en Fallas', () => {
    expect(avisosDeReclamo([reclamo()], 'bdi', admin)[0].ruta).toBe('/postventa?tab=reclamos')
  })

  it('⛔ no lo ve quien no puede abrir esa pantalla: el local abre reclamos, no los resuelve', () => {
    expect(avisosDeReclamo([reclamo()], 'bdi', local)).toEqual([])
    expect(avisosDeReclamo([reclamo()], 'bdi', null)).toEqual([])
  })

  it('un reclamo despierto no avisa: el plazo lo sigue poniendo `alertasDe`', () => {
    expect(avisosDeReclamo([reclamo({ created_at: hace(2), updated_at: hace(2) })], 'bdi', admin)).toEqual([])
  })

  it('🔴 un ANULADO con un pendiente viejo NO avisa, y sin el filtro avisaría para siempre', () => {
    const muerto = { estado: 'anulado' as const, reintegro_estado: 'pendiente' as const, compensacion: 'plata_total' as const }
    // El control: la misma fila viva sí avisa ⇒ lo que la apaga es el estado, no que le falte un dato.
    expect(avisosDeReclamo([reclamo({ ...muerto, estado: 'resuelto' })], 'bdi', admin)).toHaveLength(1)
    expect(avisosDeReclamo([reclamo(muerto)], 'bdi', admin)).toEqual([])
    expect(avisosDeReclamo([reclamo({ ...muerto, estado: 'cerrado' })], 'bdi', admin)).toEqual([])
  })

  it('UNO por reclamo: dos que duermen son dos clientes esperando, no un montón', () => {
    expect(avisosDeReclamo([reclamo(), reclamo({ id: 43 })], 'bdi', admin)).toHaveLength(2)
  })

  it('una alerta por reclamo: la primera, la misma que muestra la pantalla', () => {
    const dosAlertas = reclamo({ estado: 'en_revision', reintegro_estado: 'pendiente', compensacion: 'plata_total' })
    const [a] = avisosDeReclamo([dosAlertas], 'bdi', admin)
    expect(avisosDeReclamo([dosAlertas], 'bdi', admin)).toHaveLength(1)
    // La plata va primero en `alertasDe` porque es la que el cliente reclama.
    expect(a.detalle).toContain('la plata no sale')
    expect(a.tono).toBe('danger')
  })

  it('🔑 el `ts` es cuándo la alerta EMPEZÓ, no cuándo se abrió el reclamo', () => {
    // Abierto hace 30 días, el plazo del cliente son 10 ⇒ duerme desde hace 20, no desde hace 30.
    const [a] = avisosDeReclamo([reclamo()], 'bdi', admin)
    expect(Math.round((Date.now() - a.ts) / DIA)).toBe(20)
  })

  it('🔴 y con eso el badge se prende: un reclamo VIEJO que se durmió recién cuenta como nuevo', () => {
    // Se abrió hace 11 días —antes de la última visita, hace 3— y recién ayer cruzó los 10.
    const reciendormido = reclamo({ created_at: hace(11), updated_at: hace(11) })
    const avisos = avisosDeReclamo([reciendormido], 'bdi', admin)
    expect(contarNuevos(avisos, Date.now() - 3 * DIA)).toBe(1)
    // El control: con la fecha de creación como `ts` habría nacido ya marcado como visto.
    expect(Date.parse(reciendormido.created_at!)).toBeLessThan(Date.now() - 3 * DIA)
  })

  it('el id es estable entre refrescos: si cambiara, el aviso volvería a contarse como nuevo', () => {
    expect(avisosDeReclamo([reclamo()], 'bdi', admin)[0].id).toBe('reclamo:bdi:42')
  })

  it('el aviso es de la marca que se le pasa: un reclamo es de la tienda, no de una línea', () => {
    const [a] = avisosDeReclamo([reclamo({ store: 'zattia' })], 'zattia', admin)
    expect(a.marca).toBe('zattia')
    expect(a.linea).toBe('zattia')
  })

  it('sin reclamos no cuesta nada: la sección arranca vacía y así va a seguir un tiempo', () => {
    expect(avisosDeReclamo([], 'bdi', admin)).toEqual([])
  })
})
