import { describe, it, expect } from 'vitest'
import { ACCESO_POR_FUNCION, estaExcluido, funcionQueDa, marcaExcluir, puedeSub, puedeVer, seccionesDeFuncion, veVentasHistoricas, type Perfil } from '@/lib/permisos'
import { categoriasDe, keysDeCat, NAV_CATS, PERM_CAT, sectorVisible } from '@/lib/nav'

const perfil = (over: Partial<Perfil> = {}): Perfil => ({
  name: 'Ana',
  admin: false,
  cuenta: null,
  acceso: { bdi: {}, zattia: {} },
  funcion: [],
  ...over,
})

/**
 * La precedencia de `puedeVer` es la garantía de que activar las funciones no le sacó
 * el acceso a nadie: el permiso tildado sigue mandando sobre la ausencia de función, y
 * lo único que le gana a una función es la excepción explícita.
 */
describe('permisos — precedencia de puedeVer', () => {
  it('el admin ve todo, aun con excepción puesta', () => {
    const u = perfil({ admin: true, acceso: { bdi: { [marcaExcluir('reposicion')]: true }, zattia: {} } })
    expect(puedeVer(u, 'bdi', 'reposicion')).toBe(true)
  })

  it('el permiso tildado sigue valiendo (compatibilidad: nadie pierde acceso)', () => {
    const u = perfil({ acceso: { bdi: { reposicion: true }, zattia: {} } })
    expect(puedeVer(u, 'bdi', 'reposicion')).toBe(true)
    expect(puedeVer(u, 'zattia', 'reposicion')).toBe(false) // el permiso es por marca
  })

  it('la función alcanza sin tildar nada', () => {
    const u = perfil({ funcion: ['local'] })
    expect(puedeVer(u, 'bdi', 'cupones')).toBe(true) // área local
    expect(puedeVer(u, 'bdi', 'postventa')).toBe(false) // área administración
  })

  it('la excepción le gana a la función, y solo en su marca', () => {
    const u = perfil({ funcion: ['local'], acceso: { bdi: { [marcaExcluir('cupones')]: true }, zattia: {} } })
    expect(puedeVer(u, 'bdi', 'cupones')).toBe(false)
    expect(puedeVer(u, 'zattia', 'cupones')).toBe(true)
    expect(estaExcluido(u, 'bdi', 'cupones')).toBe(true)
  })

  it('quien tenía Sesión de fotos entra a Solicitudes (la sección que la absorbió)', () => {
    const u = perfil({ acceso: { bdi: { 'sesion-fotos': true }, zattia: {} } })
    expect(puedeVer(u, 'bdi', 'solicitudes')).toBe(true)
    expect(puedeVer(u, 'zattia', 'solicitudes')).toBe(false) // sigue siendo por marca
    const i = perfil({ acceso: { bdi: {}, zattia: { 'solicitudes-internas': true } } })
    expect(puedeVer(i, 'zattia', 'solicitudes')).toBe(true)
  })

  it('sin función ni permiso, no ve nada', () => {
    expect(puedeVer(perfil(), 'bdi', 'cupones')).toBe(false)
    expect(puedeVer(null, 'bdi', 'cupones')).toBe(false)
  })

  /**
   * 🔴 **El agujero que estuvo abierto de agosto a agosto: la afirmación estaba escrita, no
   * ejecutada.** `KEYS_SIN_PERMISO` (en `lib/nav.ts`) dice en su nombre que lo de adentro lo ve todo
   * el mundo, y cuatro comentarios del repo lo repetían — pero `puedeVer` nunca lo consultaba, así
   * que **Novedades, Manuales y la Agenda no las veía nadie que no fuera admin**. El puesto Local
   * recibía una novedad importante, la leía UNA vez en el cartel, apretaba «Entendido» y no tenía
   * ninguna forma de volver a leerla.
   *
   * Estos tests van contra el EFECTO —quién entra— y no contra la estructura del set, que es
   * exactamente lo que no lo cazaba.
   */
  it('🔴 el puesto Local ve Agenda, Novedades y Manuales sin tener nada tildado', () => {
    const u = perfil({ name: 'Local', funcion: ['local'] })
    for (const k of ['agenda', 'novedades', 'manuales']) {
      expect(puedeVer(u, 'bdi', k), `${k} en bdi`).toBe(true)
      expect(puedeVer(u, 'zattia', k), `${k} en zattia`).toBe(true)
    }
    // Y alguien sin ninguna función tampoco queda afuera: la puerta no cuelga del rol.
    expect(puedeVer(perfil(), 'bdi', 'agenda')).toBe(true)
  })

  it('⛔ la puerta abierta NO se lleva puesto el resumen ni el padrón', () => {
    // `resumen` son los KPIs del negocio y `usuarios` es de admin. Los dos están en
    // KEYS_SIN_PERMISO, y que eso fuera inofensivo es lo que escondía que el set no hacía nada.
    const u = perfil({ funcion: ['local'] })
    expect(puedeVer(u, 'bdi', 'resumen')).toBe(false)
    expect(puedeVer(u, 'bdi', 'usuarios')).toBe(false)
  })

  it('leer es de todos, pero escribir sigue pidiendo el sub', () => {
    const u = perfil({ funcion: ['local'] })
    expect(puedeVer(u, 'bdi', 'agenda')).toBe(true)
    expect(puedeSub(u, 'bdi', 'agenda', 'cargar')).toBe(false)
    expect(puedeSub(u, 'bdi', 'novedades', 'publicar')).toBe(false)
  })

  it('la excepción de Config puede recortarle la puerta abierta a alguien puntual', () => {
    // El paso "para todos" va DESPUÉS de la excepción a propósito: es un default, no un candado.
    const u = perfil({ acceso: { bdi: { [marcaExcluir('novedades')]: true }, zattia: {} } })
    expect(puedeVer(u, 'bdi', 'novedades')).toBe(false)
    expect(puedeVer(u, 'zattia', 'novedades')).toBe(true)
  })

  /**
   * 🔴 Meta salió de adentro de Marketing y pasó a ser área propia (`meta`) el 9-ago-2026.
   *
   * Mover el área es quitar el acceso: `seccionesDeFuncion()` expande por área, así que si la
   * función `marketing` no lista también `'meta'`, todo el equipo de marketing pierde Meta de un
   * deploy para el otro. No se leería como un permiso faltante sino como «Meta desapareció», que
   * es la clase de bug que nadie reporta bien.
   *
   * 🔑 Y **el espejo `PERM_CAT.area` ↔ `SECCION_AREA` no lo caza**: las dos dirían `'meta'`
   * felizmente. Por eso el test va acá, contra el efecto —quién la ve— y no contra la estructura.
   */
  it('quien tiene la función marketing sigue viendo Meta después de sacarla de Marketing', () => {
    const u = perfil({ funcion: ['marketing'] })
    expect(puedeVer(u, 'bdi', 'meta-ads')).toBe(true)
    expect(puedeVer(u, 'zattia', 'meta-ads')).toBe(true)
    // Y no perdió nada de lo que ya tenía en su área vieja.
    expect(puedeVer(u, 'bdi', 'canjes')).toBe(true)
    expect(puedeVer(u, 'bdi', 'calendario')).toBe(true)
  })
})

describe('permisos — qué da cada función', () => {
  it('cada función apunta a áreas que existen en el nav', () => {
    const areas = new Set(PERM_CAT.map((p) => p.area))
    for (const [f, cfg] of Object.entries(ACCESO_POR_FUNCION)) {
      for (const a of cfg.areas) expect(areas.has(a), `la función '${f}' apunta al área inexistente '${a}'`).toBe(true)
      for (const k of cfg.keys ?? []) expect(PERM_CAT.some((p) => p.key === k), `la función '${f}' apunta a la sección inexistente '${k}'`).toBe(true)
    }
  })

  it('Local trae lo del local y Administración lo suyo (incluida Reposición, que se mudó)', () => {
    expect(seccionesDeFuncion('local')).toContain('etiquetas')
    expect(seccionesDeFuncion('administracion')).toContain('reposicion')
    expect(seccionesDeFuncion('administracion')).toContain('caducados')
    expect(seccionesDeFuncion('local')).not.toContain('reposicion')
  })

  it('las tres funciones que ejecutan solicitudes las ven', () => {
    for (const f of ['marketing', 'deposito', 'administracion'] as const) {
      expect(seccionesDeFuncion(f)).toContain('solicitudes')
    }
  })

  it('funcionQueDa dice por qué función llega (para explicarlo en Config)', () => {
    expect(funcionQueDa(perfil({ funcion: ['local'] }), 'cupones')).toBe('local')
    expect(funcionQueDa(perfil({ funcion: ['local'] }), 'postventa')).toBeNull()
  })

  it('los sub-permisos NUNCA vienen por función (son las acciones sensibles)', () => {
    const u = perfil({ funcion: ['local'] })
    expect(puedeVer(u, 'bdi', 'conteo')).toBe(true)
    expect(puedeSub(u, 'bdi', 'conteo', 'aplicar')).toBe(false) // aplicar el ajuste de stock, no
    expect(puedeSub(u, 'bdi', 'cupones', 'crear')).toBe(false)
  })
})

/**
 * Solicitudes cuelga de cuatro sectores y el permiso es UNO: el sidebar preguntaba lo mismo cuatro
 * veces y se las mostraba todas. `sectorVisible` recorta el MENÚ (no el permiso: el guard de ruta y
 * el servidor siguen intactos, la URL a mano entra igual) a quien tiene función de sector.
 *
 * No hay ningún test que renderice el Sidebar, y por eso la lógica salió a `lib/nav.ts` como
 * función pura: acá es donde se sostiene.
 */
describe('nav — la puerta del sector propio (Solicitudes)', () => {
  const PUERTAS = ['local', 'deposito', 'marketing', 'administracion']
  const ve = (u: Perfil | null) => PUERTAS.filter((c) => sectorVisible(u, 'solicitudes', c))

  it('con función de sector queda UNA sola puerta: la suya', () => {
    expect(ve(perfil({ funcion: ['marketing'] }))).toEqual(['marketing']) // el caso de Stefania
  })

  it('con dos funciones, las dos', () => {
    expect(ve(perfil({ funcion: ['local', 'deposito'] }))).toEqual(['local', 'deposito'])
  })

  it('Dirección ve las cuatro: no es ninguno de esos sectores y navega por intención', () => {
    expect(ve(perfil({ funcion: ['direccion'] }))).toEqual(PUERTAS)
  })

  it('el admin ve las cuatro AUNQUE tenga una función de sector tildada', () => {
    // `tieneFuncion` no es implícita para los admins: sin el `esAdmin` de adelante, éste quedaría
    // recortado a Local.
    expect(ve(perfil({ admin: true, funcion: ['local'] }))).toEqual(PUERTAS)
  })

  it('sin ninguna función, las cuatro (compatibilidad: nadie pierde acceso)', () => {
    expect(ve(perfil())).toEqual(PUERTAS)
    expect(ve(null)).toEqual(PUERTAS)
  })

  it('una sección que vive en un solo grupo no se recorta nunca', () => {
    const u = perfil({ funcion: ['marketing'] })
    expect(sectorVisible(u, 'cupones', 'local')).toBe(true)
    expect(sectorVisible(u, 'postventa', 'administracion')).toBe(true)
  })

  it('solicitudes es la ÚNICA key que cruza categorías: si aparece otra, este cambio la alcanza', () => {
    const cruzan = [...new Set(NAV_CATS.flatMap((c) => keysDeCat(c)))].filter((k) => categoriasDe(k).length > 1)
    expect(cruzan).toEqual(['solicitudes'])
  })
})


/**
 * 🔴 **Qué ve Marketing de Análisis, y qué NO** (18-ago-2026, decisión de Bruno).
 *
 * Las campañas se arman sobre el dato fino de venta, así que la función `marketing` sumó cinco
 * secciones **por `keys`** y no el área `analisis` entera. Este bloque es la lista, ejercida: es la
 * diferencia entre abrirle el dato de venta y abrirle el costo.
 */
describe('permisos — Marketing y el dato fino de venta', () => {
  const mkt = perfil({ funcion: ['marketing'] })

  it('ve las cinco de venta, sin tildar nada', () => {
    for (const k of ['productos', 'variantes', 'ventas-mensuales', 'colores', 'talles']) {
      expect(puedeVer(mkt, 'bdi', k), k).toBe(true)
    }
  })

  it('⛔ y NO ve el costo ni el control de administración', () => {
    for (const k of ['margenes', 'comisiones', 'verif-ventas', 'liquidacion', 'resumen']) {
      expect(puedeVer(mkt, 'bdi', k), k).toBe(false)
    }
  })

  it('lo suyo sigue estando (no se rompió nada al sumar las keys)', () => {
    for (const k of ['mkt-ventas', 'marketing', 'canjes', 'calendario', 'meta-ads', 'solicitudes']) {
      expect(puedeVer(mkt, 'bdi', k), k).toBe(true)
    }
  })

  it('las cinco valen en las DOS marcas: la función no es por marca', () => {
    expect(puedeVer(mkt, 'zattia', 'productos')).toBe(true)
    expect(puedeVer(mkt, 'zattia', 'margenes')).toBe(false)
  })
})

/**
 * 🔴 **La ventana de ventas cuelga del permiso, no del flag de admin.**
 *
 * Antes era `esAdmin ? toda la historia : 35 días`. Con «Por producto» y «Ventas mensuales»
 * abiertas a Marketing eso habría mostrado **35 días de ventas bajo una columna que dice 90**, y la
 * comparación contra el año anterior vacía — las dos **sin un error**.
 */
describe('permisos — veVentasHistoricas', () => {
  it('el admin la tiene siempre, aunque no tenga ninguna sección tildada', () => {
    expect(veVentasHistoricas(perfil({ admin: true }), 'bdi')).toBe(true)
  })

  it('la función marketing la tiene, porque tiene las tres del análisis fino', () => {
    expect(veVentasHistoricas(perfil({ funcion: ['marketing'] }), 'bdi')).toBe(true)
  })

  it('⛔ el resto del equipo NO: es lo que evita bajar 14,7 MB a quien no los mira', () => {
    expect(veVentasHistoricas(perfil({ funcion: ['local'] }), 'bdi')).toBe(false)
    expect(veVentasHistoricas(perfil({ funcion: ['deposito'] }), 'bdi')).toBe(false)
    expect(veVentasHistoricas(perfil(), 'bdi')).toBe(false)
  })

  it('alcanza con UNA de las tres tildada a mano, sin función', () => {
    expect(veVentasHistoricas(perfil({ acceso: { bdi: { 'ventas-mensuales': true }, zattia: {} } }), 'bdi')).toBe(true)
  })

  // 🔑 Es POR MARCA, como el permiso del que cuelga: alguien con «Por producto» sólo en BDI baja
  // la historia de BDI y los 35 días de Zattia. Un booleano global le daría de más en la otra.
  it('es por marca', () => {
    const u = perfil({ acceso: { bdi: { productos: true }, zattia: {} } })
    expect(veVentasHistoricas(u, 'bdi')).toBe(true)
    expect(veVentasHistoricas(u, 'zattia')).toBe(false)
  })

  // ⚠️ Colores y Talles salen del mismo payload pero NO son las que justifican la ventana larga:
  // si alguna vez la necesitan, esta línea se cae y hay que decidirlo, no descubrirlo.
  it('Colores y Talles solas no dan historia completa', () => {
    const u = perfil({ acceso: { bdi: { colores: true, talles: true }, zattia: {} } })
    expect(veVentasHistoricas(u, 'bdi')).toBe(false)
  })
})
