import { describe, expect, it } from 'vitest'
import {
  avisosDeAprobacion,
  avisosDeContenidoSinRevisar,
  avisosDeFallas,
  avisosDeHallazgo,
  avisosDeInsumo,
  avisosDeNoDevueltos,
  avisosDeReclamo,
  avisosDeSolicitud,
  contarNuevos,
  ordenarAvisos,
} from '@/lib/notificaciones/derivar'
import type { ResumenSolicitud } from '@/lib/solicitudes/overview'
import type { FallaRow } from '@/lib/postventa/fallas/tipos'
import type { ReclamoRow } from '@/lib/reclamos/tipos'
import type { Hallazgo } from '@/lib/meta-ads/reglas'
import type { Solicitud } from '@/lib/sesionfotos/tipos'
import type { Perfil } from '@/lib/permisos'
import { mirarInsumo } from '@/lib/insumos/core'
import type { Insumo, Movimiento } from '@/lib/insumos/tipos'

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

  /**
   * 🔴 **El que más duele, y era el único estado abierto que no llegaba nunca.** `borrador` quiere
   * decir *"ni lo miré"*: la fila pasa a `esperando_cliente` recién cuando alguien copia el mensaje
   * para escribirle. Un reclamo cargado y nunca enviado era invisible en la pantalla **y** en el
   * sidebar.
   */
  it('🔴 el reclamo abierto y nunca enviado también llega: `borrador` es un estado ABIERTO', () => {
    const sinMandar = reclamo({ estado: 'borrador', compensacion: null, created_at: hace(4), updated_at: hace(4) })
    const [a] = avisosDeReclamo([sinMandar], 'bdi', administracion)
    expect(a.detalle).toContain('todavía no se le escribió')
    expect(a.tono).toBe('danger')
    // ⛔ No inventa reglas: el plazo sigue estando en `alertasDe`, y el de ayer no llega.
    expect(avisosDeReclamo([reclamo({ estado: 'borrador', compensacion: null, created_at: hace(1), updated_at: hace(1) })], 'bdi', administracion)).toEqual([])
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

/**
 * 🔴 **El agujero que este aviso cierra está MEDIDO.** El 26-ago-2026 el motor de reglas escribió
 * sus primeros cuatro hallazgos a las 07:50 —uno, un conjunto comprando al 156% del techo— y a
 * media tarde los cuatro seguían en `nuevo`: nadie abrió la sección. Con un solo operador, lo que
 * no le llega no existe.
 *
 * Lo que se ancla acá es lo mismo que en los otros ocho: **a quién le corresponde** y **qué NO
 * inventa**. Más dos cosas propias, que son las que se rompen solas:
 *   - el `id` ⛔ no lleva la fecha, o el badge se prende de nuevo cada mañana por el mismo problema;
 *   - el `ts` es `desde` y ⛔ no `fecha`, o «apareció hoy» todos los días.
 */
describe('avisos de la pauta (hallazgos)', () => {
  const conPauta = perfil({ acceso: { bdi: { 'meta-ads': true } } } as Partial<Perfil>)
  const conZattia = perfil({ acceso: { zattia: { 'meta-ads': true } } } as Partial<Perfil>)

  const hallazgo = (over: Partial<Hallazgo> = {}): Hallazgo =>
    ({
      id: 1, reglaId: 7, preset: 'costo-alto', fecha: '2026-08-26', nivel: 'conjunto',
      objetoId: '1201', objetoNombre: 'GIRLHOOD FRIO - INTERESES 1', linea: 'bdi',
      cuentaId: '1145878766790149',
      motivo: 'Compra a $ 10.426 contra un techo de $ 6.668 —el 156%— en 5 días.',
      evidencia: {}, sugerencia: { accion: 'estado', objetoId: '1201', nivel: 'conjunto', status: 'PAUSED' },
      estado: 'nuevo', resueltoPor: null, planId: null, veces: 1, desde: '2026-08-26',
      ...over,
    }) as Hallazgo

  it('le llega a quien ve la pauta de esa marca, con la frase que ya venía redactada', () => {
    const [a] = avisosDeHallazgo([hallazgo()], conPauta)
    expect(a.tipo).toBe('hallazgo')
    expect(a.titulo).toBe('GIRLHOOD FRIO - INTERESES 1')
    // ⛔ No se reescribe el diagnóstico: es la misma frase que muestra la pantalla.
    expect(a.detalle).toContain('156%')
  })

  it('⛔ no lo ve quien no puede abrir Meta Ads en esa marca', () => {
    expect(avisosDeHallazgo([hallazgo()], conZattia)).toEqual([])
    expect(avisosDeHallazgo([hallazgo()], perfil({ funcion: ['local'] }))).toEqual([])
    expect(avisosDeHallazgo([hallazgo()], null)).toEqual([])
  })

  it('🔑 Stunned NO es una marca: el aviso salta a Zattia y el chip igual dice Stunned', () => {
    const [a] = avisosDeHallazgo([hallazgo({ linea: 'stunned' })], conZattia)
    expect(a.marca).toBe('zattia')
    expect(a.linea).toBe('stunned')
  })

  it('lleva a la zona CON la línea puesta: `/meta-ads` a secas abre en «Todas»', () => {
    expect(avisosDeHallazgo([hallazgo()], conPauta)[0].ruta).toBe('/meta-ads?linea=bdi')
  })

  it('🔑 el `id` ⛔ no lleva la fecha: si la llevara, el badge se prendería de nuevo cada mañana', () => {
    const hoy = avisosDeHallazgo([hallazgo({ fecha: '2026-08-26', veces: 1, desde: '2026-08-26' })], conPauta)[0]
    const manana = avisosDeHallazgo([hallazgo({ fecha: '2026-08-27', veces: 2, desde: '2026-08-26' })], conPauta)[0]
    expect(manana.id).toBe(hoy.id)
  })

  it('🔴 el `ts` es DESDE CUÁNDO grita, ⛔ no la fecha del último renglón', () => {
    const [a] = avisosDeHallazgo([hallazgo({ fecha: '2026-08-26', veces: 5, desde: '2026-08-22' })], conPauta)
    expect(a.ts).toBe(new Date('2026-08-22T00:00:00').getTime())
    // Y es medianoche LOCAL: con `Date.parse(iso)` —medianoche UTC— el día se corre uno en Argentina.
    expect(new Date(a.ts).getDate()).toBe(22)
  })

  it('el tono sale de lo que PROPONE: pausar sangra, escalar espera, sin sugerencia hay que mirar', () => {
    const tono = (s: Hallazgo['sugerencia']) => avisosDeHallazgo([hallazgo({ sugerencia: s })], conPauta)[0].tono
    expect(tono({ accion: 'estado', objetoId: '1201', nivel: 'conjunto', status: 'PAUSED' })).toBe('danger')
    expect(tono({ accion: 'estado', objetoId: '1201', nivel: 'conjunto', status: 'ACTIVE' })).toBe('brand')
    expect(tono({ accion: 'presupuesto', objetoId: '1201', nivel: 'conjunto', daily_budget: '900000', desdeCrudo: 750000 })).toBe('brand')
    expect(tono(null)).toBe('warning')
  })

  it('uno por hallazgo y ⛔ no agrupados: cada uno es una plata distinta', () => {
    const a = avisosDeHallazgo([hallazgo(), hallazgo({ id: 2, reglaId: 9, objetoId: '1202' })], conPauta)
    expect(a).toHaveLength(2)
    expect(new Set(a.map((x) => x.id)).size).toBe(2)
  })

  it('una fecha ilegible ⛔ no tira el aviso: se pierde el orden, no el renglón', () => {
    const [a] = avisosDeHallazgo([hallazgo({ desde: 'nunca' })], conPauta)
    expect(a.ts).toBe(0)
    expect(a.titulo).toBe('GIRLHOOD FRIO - INTERESES 1')
  })
})

describe('avisosDeInsumo', () => {
  const conInsumos = { name: 'Lorena', admin: false, cuenta: null, acceso: { bdi: { insumos: true } }, funcion: [] } as unknown as Perfil
  const sinNada = { name: 'Depósito', admin: false, cuenta: null, acceso: {}, funcion: [] } as unknown as Perfil

  const insumo = (p: Partial<Insumo> = {}): Insumo => ({
    id: 'in1', nombre: 'Bolsas chicas', tipo: 'comercial', unidad: 'unidad', bulto: null, porBulto: null,
    marcas: [], minimo: 2, diasReposicion: null, consumo: {}, activo: true, nota: null, autor: null,
    creado: '2026-08-01T00:00:00Z', actualizado: '2026-08-01T00:00:00Z', ...p,
  })

  let n = 0
  const mov = (p: Partial<Movimiento> = {}): Movimiento => {
    n += 1
    return {
      id: `mv${n}`, insumoId: 'in1', tipo: 'compra', ubicacion: 'deposito', cantidad: 10,
      fecha: '2026-08-01', precioTotal: null, proveedor: null, comprobante: null, grupo: null,
      pata: null, usuario: null, nota: null, creado: `2026-08-01T00:00:0${n % 10}Z`, ...p,
    }
  }

  /** Un insumo al que le queda el anteúltimo desde el 9. */
  const enElAnteultimo = () =>
    mirarInsumo(insumo(), [mov({ cantidad: 5 }), mov({ tipo: 'consumo', cantidad: 3, fecha: '2026-08-09' })], [], {}, '2026-08-28')

  it('no le llega a quien no puede abrir la sección', () => {
    expect(avisosDeInsumo([enElAnteultimo()], sinNada, 'bdi')).toEqual([])
  })

  it('los que hay que pedir van en UN aviso: armar el pedido es un solo acto', () => {
    const dos = [
      enElAnteultimo(),
      mirarInsumo(insumo({ id: 'in2', nombre: 'Ribbon' }), [mov({ insumoId: 'in2', cantidad: 1 })], [], {}, '2026-08-28'),
    ]
    const a = avisosDeInsumo(dos, conInsumos, 'bdi')
    expect(a.filter((x) => x.tipo === 'insumo-comprar')).toHaveLength(1)
    expect(a[0].titulo).toBe('2 insumos para pedir')
    expect(a[0].detalle).toContain('Bolsas chicas')
  })

  it('🔴 el ts es la fecha en que cruzó el umbral, ⛔ no hoy', () => {
    const [a] = avisosDeInsumo([enElAnteultimo()], conInsumos, 'bdi')
    expect(a.ts).toBe(new Date('2026-08-09T00:00:00').getTime())
  })

  it('lo que falta en un local va aparte y por LUGAR: se sube, no se compra', () => {
    const v = mirarInsumo(
      insumo(),
      [
        mov({ ubicacion: 'deposito', cantidad: 500 }),
        mov({ ubicacion: 'local-bdi', cantidad: 10, fecha: '2026-08-02' }),
        mov({ tipo: 'consumo', ubicacion: 'local-bdi', cantidad: 10, fecha: '2026-08-12' }),
      ],
      [],
      {},
      '2026-08-28',
    )
    const a = avisosDeInsumo([v], conInsumos, 'bdi')
    expect(a).toHaveLength(1)
    expect(a[0].id).toBe('insumo-subir:local-bdi')
    expect(a[0].detalle).toContain('sólo hay que subirlo')
    expect(a[0].ts).toBe(new Date('2026-08-12T00:00:00').getTime())
  })

  it('sin nada contado no avisa: nadie miró', () => {
    expect(avisosDeInsumo([mirarInsumo(insumo(), [], [], {}, '2026-08-28')], conInsumos, 'bdi')).toEqual([])
  })

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // El pedido: qué se calla y qué pasa a ser aviso del PROVEEDOR
  // ───────────────────────────────────────────────────────────────────────────────────────────

  const pedidoDe = (p: Record<string, unknown> = {}) => ({
    id: 'pd1', insumoId: 'in1', cantidad: 1000, pedidoAt: '2026-08-10', proveedor: 'CDE',
    promesaAt: null, canceladoAt: null, usuario: 'Lorena', nota: null,
    creado: '2026-08-10T00:00:00Z', ...p,
  }) as never

  it('🔴 con el pedido anotado el aviso de PEDIR se calla: la pelota es del proveedor', () => {
    const v = mirarInsumo(
      insumo(),
      [mov({ cantidad: 5 }), mov({ tipo: 'consumo', cantidad: 3, fecha: '2026-08-09' })],
      [pedidoDe({ promesaAt: '2026-09-30' })],
      {},
      '2026-08-28',
    )
    expect(avisosDeInsumo([v], conInsumos, 'bdi').filter((a) => a.tipo === 'insumo-comprar')).toEqual([])
  })

  it('🔴 el pedido vencido es OTRO aviso, y su ts es CUÁNDO SE LO ESPERABA', () => {
    const v = mirarInsumo(
      insumo(),
      [mov({ cantidad: 5 }), mov({ tipo: 'consumo', cantidad: 3, fecha: '2026-08-09' })],
      [pedidoDe({ promesaAt: '2026-08-20' })],
      {},
      '2026-08-28',
    )
    const a = avisosDeInsumo([v], conInsumos, 'bdi').find((x) => x.tipo === 'insumo-demorado')
    expect(a).toBeTruthy()
    expect(a?.titulo).toBe('1 pedido demorado')
    // ⛔ Ni la fecha del pedido ni hoy: la espera empieza el día que se pasó de fecha.
    expect(a?.ts).toBe(new Date('2026-08-20T00:00:00').getTime())
    expect(a?.ruta).toBe('/insumos?ver=demorados')
  })

  it('un pedido sin fecha esperada ⛔ no genera aviso de demorado: acusaría a quien puede estar en fecha', () => {
    const v = mirarInsumo(
      insumo({ diasReposicion: null }),
      [mov({ cantidad: 5 }), mov({ tipo: 'consumo', cantidad: 3, fecha: '2026-08-09' })],
      [pedidoDe({ pedidoAt: '2026-01-01' })],
      {},
      '2026-08-28',
    )
    expect(avisosDeInsumo([v], conInsumos, 'bdi').filter((a) => a.tipo === 'insumo-demorado')).toEqual([])
  })

  it('el id no lleva fecha ni cantidad: el badge no se prende de nuevo cada mañana', () => {
    const hoy = avisosDeInsumo([enElAnteultimo()], conInsumos, 'bdi')[0]
    expect(hoy.id).toBe('insumo-comprar')
  })
})
