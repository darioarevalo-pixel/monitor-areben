import { describe, it, expect } from 'vitest'
import { agruparAvisos, comoLeLlamamos, fechaLarga, filtrarPorOrigen, horaLabel, marcasVisibles, modoInicio, novedadesDeInicio, ordenar, origenesDe, pendientesDeMarca, pendientesDeTrabajo, tituloPendientes, unidadesDe } from '@/lib/inicio/core'
import { contarNuevos } from '@/lib/notificaciones/derivar'
import { resumenFoto, resumenInterna } from '@/lib/solicitudes/overview'
import type { Aviso } from '@/lib/notificaciones/tipos'
import type { Novedad } from '@/lib/novedades/tipos'
import type { SolicitudInterna } from '@/lib/solicitudes-internas/tipos'
import type { Perfil } from '@/lib/permisos'
import type { Solicitud } from '@/lib/sesionfotos/tipos'

const perfil = (over: Partial<Perfil>): Perfil => ({ name: 'U', admin: false, cuenta: null, acceso: {}, ...over })
const sol = (over: Partial<Solicitud>): Solicitud => ({ id: 's1', fecha: '2026-07-18', creado: 1000, creadoPor: 'Ana', descripcion: 'Sesión', estado: 'pendiente', items: [], ...over })

describe('inicio/core — marcasVisibles', () => {
  it('admin ve todas las marcas', () => {
    expect(marcasVisibles(perfil({ admin: true }), 'bdi').sort()).toEqual(['bdi', 'zattia'])
  })
  it('cuenta fija: solo esa marca (si tiene permiso)', () => {
    expect(marcasVisibles(perfil({ cuenta: 'zattia', acceso: { zattia: { 'sesion-fotos': true } } }), 'bdi')).toEqual(['zattia'])
  })
  it('sin cuenta fija: solo las marcas donde puede ver sesión de fotos', () => {
    expect(marcasVisibles(perfil({ acceso: { bdi: { 'sesion-fotos': true } } }), 'bdi')).toEqual(['bdi'])
  })
  it('sin permiso en ninguna → vacío', () => {
    expect(marcasVisibles(perfil({}), 'bdi')).toEqual([])
    expect(marcasVisibles(null, 'bdi')).toEqual([])
  })
  it('Local ve solo la marca activa; Administración, las dos', () => {
    const acc = { bdi: { 'sesion-fotos': true }, zattia: { 'sesion-fotos': true } }
    expect(marcasVisibles(perfil({ funcion: ['local'], acceso: acc }), 'zattia')).toEqual(['zattia'])
    expect(marcasVisibles(perfil({ funcion: ['administracion'], acceso: acc }), 'zattia').sort()).toEqual(['bdi', 'zattia'])
  })
})

describe('inicio/core — pendientes', () => {
  it('unidadesDe suma las qty de los ítems', () => {
    const s = sol({ items: [{ vid: 'v1', pid: '1', sid: '1', nombre: 'A', variante: 'M', sku: '', qty: 3, origen: 'deposito' }, { vid: 'v2', pid: '1', sid: '2', nombre: 'A', variante: 'L', sku: '', qty: 2, origen: 'local' }] })
    expect(unidadesDe(s)).toBe(5)
  })

  it('pendientesDeMarca: solo estado pendiente, aplanadas con la marca', () => {
    const lista = [
      sol({ id: 'a', estado: 'pendiente', creado: 10 }),
      sol({ id: 'b', estado: 'cargada', creado: 20 }),
      sol({ id: 'c', estado: 'pendiente', creado: 30 }),
    ]
    const out = pendientesDeMarca(lista, 'bdi')
    expect(out.map((p) => p.id)).toEqual(['a', 'c'])
    expect(out[0].marca).toBe('bdi')
  })

  it('ordenar: la más nueva primero', () => {
    const p = pendientesDeMarca([sol({ id: 'a', creado: 10 }), sol({ id: 'c', creado: 30 }), sol({ id: 'b', creado: 20 })], 'bdi')
    expect(ordenar(p).map((x) => x.id)).toEqual(['c', 'b', 'a'])
  })
})

describe('inicio/core — modo por función', () => {
  it('admin o Dirección → gerencial', () => {
    expect(modoInicio(perfil({ admin: true }))).toBe('gerencial')
    expect(modoInicio(perfil({ funcion: ['direccion'] }))).toBe('gerencial')
  })
  it('Marketing/Administración → completa', () => {
    expect(modoInicio(perfil({ funcion: ['marketing'] }))).toBe('completa')
    expect(modoInicio(perfil({ funcion: ['administracion'] }))).toBe('completa')
  })
  it('Local/Depósito → sector', () => {
    expect(modoInicio(perfil({ funcion: ['local'] }))).toBe('sector')
    expect(modoInicio(perfil({ funcion: ['deposito'] }))).toBe('sector')
  })
  it('sin función → completa (compatibilidad)', () => {
    expect(modoInicio(perfil({}))).toBe('completa')
  })
  it('Dirección gana sobre Local (no arranca con fotos)', () => {
    expect(modoInicio(perfil({ funcion: ['local', 'direccion'] }))).toBe('gerencial')
  })
  it('origenesDe: según las funciones Local/Depósito', () => {
    expect(origenesDe(perfil({ funcion: ['local'] }))).toEqual(['local'])
    expect(origenesDe(perfil({ funcion: ['local', 'deposito'] }))).toEqual(['local', 'deposito'])
    expect(origenesDe(perfil({ funcion: ['marketing'] }))).toEqual([])
  })
  it('filtrarPorOrigen: solo pendientes con unidades del origen', () => {
    const p = pendientesDeMarca(
      [
        sol({ id: 'a', items: [{ vid: 'v', pid: '1', sid: '1', nombre: 'A', variante: 'M', sku: '', qty: 2, origen: 'local' }] }),
        sol({ id: 'b', items: [{ vid: 'v', pid: '1', sid: '1', nombre: 'A', variante: 'M', sku: '', qty: 2, origen: 'deposito' }] }),
      ],
      'bdi',
    )
    expect(filtrarPorOrigen(p, ['local']).map((x) => x.id)).toEqual(['a'])
    expect(filtrarPorOrigen(p, ['deposito']).map((x) => x.id)).toEqual(['b'])
    expect(filtrarPorOrigen(p, []).map((x) => x.id)).toEqual([])
  })
})

describe('inicio/core — horaLabel', () => {
  const hoy = new Date('2026-07-18T15:00:00')
  it('hoy / ayer / fecha', () => {
    const creadoHoy = new Date('2026-07-18T09:30:00').getTime()
    const creadoAyer = new Date('2026-07-17T20:05:00').getTime()
    const creadoViejo = new Date('2026-07-10T11:00:00').getTime()
    expect(horaLabel(creadoHoy, '', hoy)).toBe('hoy 09:30')
    expect(horaLabel(creadoAyer, '', hoy)).toBe('ayer 20:05')
    expect(horaLabel(creadoViejo, '', hoy)).toMatch(/^10\/7\/2026 11:00$/)
  })
  it('sin creado cae a la fecha', () => {
    expect(horaLabel(0, '2026-07-18', hoy)).toBe('2026-07-18')
  })
})


/**
 * El Inicio dejó de ser "las solicitudes de fotos pendientes" y pasó a ser el trabajo del
 * día: de los DOS cajones y con lo que está separado esperando que alguien lo retire.
 */
describe('inicio/core — pendientes de trabajo', () => {
  const foto = (estado: Solicitud['estado'], over: Partial<Solicitud> = {}) => resumenFoto(sol({ estado, ...over }), 'bdi')
  const interna = (estado: SolicitudInterna['estado'], over: Partial<SolicitudInterna> = {}) =>
    resumenInterna({ id: 'i1', fecha: '2026-07-24', creado: 1, creadoPor: 'Ana', motivo: 'Video/contenido', tipo: 'consumo', descripcion: 'Reel', estado, items: [], ...over }, 'bdi')

  it('entra lo pendiente, lo en proceso y lo separado sin retirar', () => {
    const r = pendientesDeTrabajo([foto('pendiente'), foto('preparada'), foto('cargada')])
    expect(r).toHaveLength(3) // 'cargada' sin retiro completo = separado, sin retirar
  })

  it('NO entra lo devuelto ni lo cerrado (ya no es trabajo de nadie)', () => {
    expect(pendientesDeTrabajo([foto('devuelta'), foto('cerrada')])).toEqual([])
  })

  it('las internas cuentan igual que las de fotos (el agujero que tenía el home viejo)', () => {
    const r = pendientesDeTrabajo([interna('pendiente'), interna('aprobada'), interna('cerrada')])
    expect(r).toHaveLength(2)
  })

  it('el título nombra la tarea del sector, no "solicitudes"', () => {
    expect(tituloPendientes(['local'])).toContain('local')
    expect(tituloPendientes(['deposito'])).toContain('depósito')
    expect(tituloPendientes([])).toBe('📋 Solicitudes en curso')
  })
})


// ── El saludo ────────────────────────────────────────────────────────────────────

describe('inicio/core — cómo le decimos', () => {
  it('el apodo gana', () => {
    expect(comoLeLlamamos(perfil({ name: 'mariana.local', apodo: 'Mari' }))).toBe('Mari')
  })

  it('sin apodo cae al usuario — es el caso de los puestos compartidos', () => {
    expect(comoLeLlamamos(perfil({ name: 'bdilocal' }))).toBe('bdilocal')
    expect(comoLeLlamamos(perfil({ name: 'bdilocal', apodo: '' }))).toBe('bdilocal')
    expect(comoLeLlamamos(perfil({ name: 'bdilocal', apodo: null }))).toBe('bdilocal')
  })

  it('un apodo de puros espacios no deja el saludo colgado en "Hola, !"', () => {
    expect(comoLeLlamamos(perfil({ name: 'dario', apodo: '   ' }))).toBe('dario')
  })

  it('sin perfil no rompe', () => {
    expect(comoLeLlamamos(null)).toBe('')
  })
})

describe('inicio/core — fechaLarga', () => {
  it('dice el día en castellano, sin depender del idioma del runtime', () => {
    expect(fechaLarga(new Date(2026, 7, 12))).toBe('miércoles 12 de agosto')
    expect(fechaLarga(new Date(2026, 0, 1))).toBe('jueves 1 de enero')
    expect(fechaLarga(new Date(2026, 11, 25))).toBe('viernes 25 de diciembre')
  })
})

// ── Los avisos agrupados ─────────────────────────────────────────────────────────

const aviso = (over: Partial<Aviso>): Aviso => ({
  id: 'a1',
  tipo: 'solicitud',
  marca: 'bdi',
  titulo: 'Algo',
  detalle: '',
  ruta: '/solicitudes',
  ts: 1000,
  tono: 'brand',
  ...over,
})

describe('inicio/core — agruparAvisos', () => {
  it('parte por tipo y usa el rótulo del catálogo', () => {
    const g = agruparAvisos([
      aviso({ id: '1', tipo: 'solicitud' }),
      aviso({ id: '2', tipo: 'solicitud' }),
      aviso({ id: '3', tipo: 'canje-vencido', tono: 'warning' }),
    ])
    expect(g).toHaveLength(2)
    expect(g.find((x) => x.tipo === 'solicitud')?.avisos).toHaveLength(2)
    expect(g.find((x) => x.tipo === 'canje-vencido')?.label).toBe('Canjes con contenido sin publicar')
  })

  it('lo rojo se lee antes que lo ámbar, y lo ámbar antes que lo normal', () => {
    const g = agruparAvisos([
      aviso({ id: '1', tipo: 'solicitud', tono: 'brand' }),
      aviso({ id: '2', tipo: 'no-devuelto', tono: 'danger' }),
      aviso({ id: '3', tipo: 'aprobacion', tono: 'warning' }),
    ])
    expect(g.map((x) => x.tipo)).toEqual(['no-devuelto', 'aprobacion', 'solicitud'])
  })

  it('el bloque toma el PEOR tono de sus filas, no el de la primera', () => {
    const g = agruparAvisos([
      aviso({ id: '1', tipo: 'solicitud', tono: 'brand' }),
      aviso({ id: '2', tipo: 'solicitud', tono: 'danger' }),
    ])
    expect(g[0].tono).toBe('danger')
  })

  it('adentro de un bloque, lo más nuevo arriba', () => {
    const g = agruparAvisos([
      aviso({ id: 'viejo', ts: 10 }),
      aviso({ id: 'nuevo', ts: 90 }),
      aviso({ id: 'medio', ts: 50 }),
    ])
    expect(g[0].avisos.map((a) => a.id)).toEqual(['nuevo', 'medio', 'viejo'])
  })

  it('sin avisos, sin bloques (el vacío lo dibuja la pantalla)', () => {
    expect(agruparAvisos([])).toEqual([])
  })

  /**
   * 🔑 **El amarre que arregla el bug de fondo.** El badge del sidebar cuenta `avisos`; la pantalla
   * mostraba `resumenes`. Con eso el contador decía "6", se entraba a Inicio y se veían tres: los
   * canjes por firmar, las fallas por llevar al depósito y lo que salió sin volver no se dibujaban
   * en NINGUNA pantalla. Este test falla si alguien vuelve a filtrar de un lado y no del otro.
   */
  it('lo que cuenta el badge y lo que se pinta son el MISMO conjunto', () => {
    const todos = [
      aviso({ id: '1', tipo: 'aprobacion', tono: 'warning', ts: 100 }),
      aviso({ id: '2', tipo: 'solicitud', ts: 200 }),
      aviso({ id: '3', tipo: 'no-devuelto', tono: 'danger', ts: 300 }),
      aviso({ id: '4', tipo: 'falla-por-enviar', tono: 'warning', ts: 400 }),
      aviso({ id: '5', tipo: 'canje-aprobacion', tono: 'warning', ts: 500 }),
      aviso({ id: '6', tipo: 'canje-vencido', tono: 'warning', ts: 600 }),
    ]
    const pintados = agruparAvisos(todos).flatMap((g) => g.avisos)
    expect(pintados).toHaveLength(todos.length)
    // Y con el "visto" en cero, el número del badge es exactamente lo que hay para mirar.
    expect(contarNuevos(todos, 0)).toBe(pintados.length)
    expect(new Set(pintados.map((a) => a.id))).toEqual(new Set(todos.map((a) => a.id)))
  })
})

// ── Las novedades del pie ────────────────────────────────────────────────────────

const nov = (over: Partial<Novedad>): Novedad => ({
  id: 'n1',
  estado: 'publicada',
  importante: false,
  titulo: 'Novedad',
  cuerpo: '',
  version: 1,
  publicada_at: '2026-08-01T10:00:00Z',
  ...over,
})

describe('inicio/core — novedadesDeInicio', () => {
  it('sólo las publicadas: el borrador de quien publica no va al pie de nadie', () => {
    const r = novedadesDeInicio([nov({ id: 'a' }), nov({ id: 'b', estado: 'borrador' }), nov({ id: 'c', estado: 'archivada' })], [])
    expect(r.map((x) => x.novedad.id)).toEqual(['a'])
  })

  it('respeta el `paraMi` que ya calculó el servidor', () => {
    const r = novedadesDeInicio([nov({ id: 'a', paraMi: true }), nov({ id: 'b', paraMi: false })], [])
    expect(r.map((x) => x.novedad.id)).toEqual(['a'])
  })

  it('la más nueva primero, y como mucho tres', () => {
    const r = novedadesDeInicio(
      [
        nov({ id: 'vieja', publicada_at: '2026-01-01T10:00:00Z' }),
        nov({ id: 'nueva', publicada_at: '2026-08-10T10:00:00Z' }),
        nov({ id: 'media', publicada_at: '2026-05-05T10:00:00Z' }),
        nov({ id: 'antigua', publicada_at: '2025-01-01T10:00:00Z' }),
      ],
      [],
    )
    expect(r.map((x) => x.novedad.id)).toEqual(['nueva', 'media', 'vieja'])
  })

  it('`nueva` se compara por VERSIÓN: una reeditada vuelve a contar', () => {
    const leidas = [{ novedad_id: 'a', version: 1 }]
    expect(novedadesDeInicio([nov({ id: 'a', version: 1 })], leidas)[0].nueva).toBe(false)
    expect(novedadesDeInicio([nov({ id: 'a', version: 2 })], leidas)[0].nueva).toBe(true)
  })

  it('sin novedades, lista vacía (la sección no se dibuja)', () => {
    expect(novedadesDeInicio([], [])).toEqual([])
  })
})
