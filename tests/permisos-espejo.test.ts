import { describe, it, expect } from 'vitest'
import { PERM_CAT, type Marca } from '@/lib/nav.datos'
import { SECCION_AREA, marcasConAcceso, puedeVer, puedeVerPropio, seccionesDeFuncion, type Funcion, type Perfil } from '@/lib/permisos'
import { veMarcaCanjes } from '@/lib/canjes/permisos'
import { marcasVisiblesCanjes } from '@/lib/canjes/marcas'

/**
 * Los espejos de permisos, amarrados.
 *
 * Este archivo existe porque `lib/canjes/permisos.ts` afirmaba —textual— que "el test las compara"
 * sobre un test **que nunca se escribió**. Por esa grieta el cliente y el servidor se separaron: el
 * servidor decidía las marcas visibles mirando sólo `perfil.cuenta`, así que todo el que podía
 * cambiar de marca (o sea, casi todos) recibía 403 en Canjes entero, padrón incluido, por más
 * permisos que se le tildaran.
 */

const perfil = (o: Partial<Perfil>): Perfil => ({ name: 'X', admin: false, cuenta: null, acceso: {}, ...o })

const MARCAS: Marca[] = ['bdi', 'zattia']

describe('SECCION_AREA es un espejo exacto de PERM_CAT', () => {
  // El core está en JS plano y no puede importar `PERM_CAT` (TS), así que el mapa se repite. Lo que
  // hace que la repetición sea segura es este test: una sección nueva sin entrada acá rompe.
  it('mismas secciones, misma área', () => {
    const delCatalogo = Object.fromEntries(PERM_CAT.map((p) => [p.key, p.area]))
    expect(SECCION_AREA).toEqual(delCatalogo)
  })

  it('toda sección del catálogo tiene área (si no, ninguna función la hereda)', () => {
    for (const p of PERM_CAT) expect(p.area, `${p.key} sin área`).toBeTruthy()
  })
})

describe('seccionesDeFuncion sale de las áreas, no de una lista a mano', () => {
  it('marketing trae canjes, que es de su área', () => {
    expect(seccionesDeFuncion('marketing')).toContain('canjes')
  })

  it('local NO trae canjes', () => {
    expect(seccionesDeFuncion('local')).not.toContain('canjes')
  })

  // Los subs son las acciones sensibles (aprobar un canje, aplicar un ajuste de stock): se tildan a
  // mano. Si la función los diera, alta de módulo = todo el sector aprobando plata sin querer.
  it('ninguna función hereda un sub-permiso', () => {
    const funciones: Funcion[] = ['direccion', 'marketing', 'local', 'deposito', 'administracion']
    for (const f of funciones) {
      for (const k of seccionesDeFuncion(f)) expect(k, `${f} hereda ${k}`).not.toContain('.')
    }
  })
})

/**
 * La matriz que faltaba: los dos lados sobre los mismos perfiles.
 *
 * `veMarcaCanjes` es la puerta del navegador y `marcasVisiblesCanjes` la del servidor. Si dan
 * distinto, o la UI promete algo que después es un 403 (lo que pasaba), o esconde algo que la
 * persona sí podía ver.
 */
describe('cliente y servidor deciden lo mismo en Canjes', () => {
  const CASOS: { nombre: string; p: Perfil }[] = [
    { nombre: 'admin', p: perfil({ admin: true }) },
    { nombre: 'cuenta fija en bdi, con permiso', p: perfil({ cuenta: 'bdi', acceso: { bdi: { canjes: true } } }) },
    { nombre: 'cuenta fija en zattia, por función', p: perfil({ cuenta: 'zattia', funcion: ['marketing'] }) },
    // El caso que estaba roto: sin cuenta fija, el servidor devolvía vacío y daba 403 en todo.
    { nombre: 'sin cuenta fija, marketing', p: perfil({ funcion: ['marketing'] }) },
    { nombre: 'sin cuenta fija, permiso tildado en una marca', p: perfil({ acceso: { bdi: { canjes: true } } }) },
    { nombre: 'sin cuenta fija, permiso en las dos', p: perfil({ acceso: { bdi: { canjes: true }, zattia: { canjes: true } } }) },
    { nombre: 'marketing con la excepción negativa en bdi', p: perfil({ funcion: ['marketing'], acceso: { bdi: { '-canjes': true } } }) },
    { nombre: 'sin nada', p: perfil({}) },
    { nombre: 'local (otra área)', p: perfil({ funcion: ['local'] }) },
  ]

  it.each(CASOS)('$nombre', ({ p }) => {
    expect(veMarcaCanjes(p)).toEqual(marcasVisiblesCanjes(p))
  })

  // La razón de ser del arreglo: antes esto daba [] y por eso no se veía el padrón.
  it('marketing sin cuenta fija ve las dos marcas (y Stunned)', () => {
    expect(marcasVisiblesCanjes(perfil({ funcion: ['marketing'] }))).toEqual(['bdi', 'zattia', 'stunned'])
  })

  // Stunned no existe en `acceso`: es una línea de Zattia por prefijo de SKU. Quien ve Zattia
  // ve Stunned, y quien NO ve Zattia no puede colarse por ahí.
  it('Stunned viaja con Zattia, en los dos sentidos', () => {
    expect(marcasVisiblesCanjes(perfil({ acceso: { zattia: { canjes: true } } }))).toEqual(['zattia', 'stunned'])
    expect(marcasVisiblesCanjes(perfil({ acceso: { bdi: { canjes: true } } }))).toEqual(['bdi'])
  })
})

/**
 * La puerta pintada: Depósito veía la solicitud de fotos en la lista unificada y al abrirla el
 * guard lo mandaba a Inicio, porque `sesion-fotos` es del área de Marketing y su función solo le
 * da `solicitudes`. Como a esas dos pantallas Depósito llega por el botón "Ver" y no por el menú,
 * el permiso de la madre alcanza.
 */
describe('el detalle de Solicitudes se abre con el permiso de Solicitudes', () => {
  const DETALLES = ['sesion-fotos', 'solicitudes-internas']

  it.each(DETALLES)('depósito (función) entra a %s', (k) => {
    expect(puedeVer(perfil({ funcion: ['deposito'] }), 'bdi', k)).toBe(true)
  })

  it.each(DETALLES)('con solicitudes tildado a mano también entra a %s', (k) => {
    expect(puedeVer(perfil({ acceso: { bdi: { solicitudes: true } } }), 'bdi', k)).toBe(true)
  })

  it('sin Solicitudes no entra a ninguna de las dos', () => {
    for (const k of DETALLES) expect(puedeVer(perfil({ funcion: ['direccion'] }), 'bdi', k)).toBe(false)
  })

  // La excepción negativa se sigue evaluando primero: sirve para dejar entrar a la lista pero no
  // a una de las dos pantallas.
  it('la excepción sobre el detalle gana aunque vea Solicitudes', () => {
    const p = perfil({ funcion: ['deposito'], acceso: { bdi: { '-sesion-fotos': true } } })
    expect(puedeVer(p, 'bdi', 'solicitudes')).toBe(true)
    expect(puedeVer(p, 'bdi', 'sesion-fotos')).toBe(false)
    expect(puedeVer(p, 'bdi', 'solicitudes-internas')).toBe(true)
  })

  // Editar/aprobar siguen siendo tilde a mano: la madre abre la pantalla, no las acciones.
  it('no arrastra los sub-permisos', () => {
    const p = perfil({ funcion: ['deposito'] })
    expect(puedeVer(p, 'bdi', 'sesion-fotos.editar')).toBe(false)
    expect(puedeVer(p, 'bdi', 'solicitudes-internas.aprobar')).toBe(false)
  })

  // Cada marca por su lado: ver Solicitudes en BDI no abre el detalle de Zattia.
  it('no cruza de marca', () => {
    const p = perfil({ acceso: { bdi: { solicitudes: true } } })
    expect(puedeVer(p, 'zattia', 'sesion-fotos')).toBe(false)
  })

  /**
   * 🔑 **La otra mitad de la regla, y vive acá a propósito.** Desde el 5-sep-2026 `sesion-fotos` es
   * otra vez una entrada del menú —la puerta de Marketing—, así que la herencia habilita la
   * PANTALLA pero ⛔ no el renglón: si el sidebar preguntara con `puedeVer`, a Depósito, Local y
   * Administración les aparecería un grupo «Marketing» entero que hoy no ven. El menú pregunta con
   * `puedeVerPropio`. Quien lea una mitad tiene que encontrar la otra al lado.
   */
  it.each(DETALLES)('…pero el MENÚ ⛔ no lo hereda: %s', (k) => {
    const p = perfil({ funcion: ['deposito'] })
    expect(puedeVer(p, 'bdi', k)).toBe(true)
    expect(puedeVerPropio(p, 'bdi', k)).toBe(false)
  })
})

describe('marcasConAcceso', () => {
  it('la cuenta fija acota aunque tenga permiso en la otra', () => {
    const p = perfil({ cuenta: 'bdi', acceso: { bdi: { canjes: true }, zattia: { canjes: true } } })
    expect(marcasConAcceso(p, 'canjes', MARCAS)).toEqual(['bdi'])
  })

  // Es el cambio de criterio respecto del servidor viejo, que hacía `if (admin) return todas`
  // antes de mirar la cuenta. Se alineó con el cliente: `puedeCambiarMarca` es `!perfil.cuenta`,
  // así que un admin con cuenta fija tampoco cambia de marca en el header.
  it('la cuenta fija le gana al admin, igual que en el resto del monitor', () => {
    expect(marcasConAcceso(perfil({ admin: true, cuenta: 'zattia' }), 'canjes', MARCAS)).toEqual(['zattia'])
    expect(marcasConAcceso(perfil({ admin: true }), 'canjes', MARCAS)).toEqual(['bdi', 'zattia'])
  })

  it('sin permiso en ninguna, ninguna', () => {
    expect(marcasConAcceso(perfil({}), 'canjes', MARCAS)).toEqual([])
    expect(marcasConAcceso(null, 'canjes', MARCAS)).toEqual([])
  })

  it('la excepción negativa saca la marca', () => {
    const p = perfil({ funcion: ['marketing'], acceso: { zattia: { '-canjes': true } } })
    expect(marcasConAcceso(p, 'canjes', MARCAS)).toEqual(['bdi'])
    expect(puedeVer(p, 'zattia', 'canjes')).toBe(false)
  })
})
