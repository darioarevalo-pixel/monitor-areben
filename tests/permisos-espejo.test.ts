import { describe, it, expect } from 'vitest'
import { PERM_CAT, type Marca } from '@/lib/nav.datos'
import { SECCION_AREA, marcasConAcceso, puedeVer, seccionesDeFuncion, type Funcion, type Perfil } from '@/lib/permisos'
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
