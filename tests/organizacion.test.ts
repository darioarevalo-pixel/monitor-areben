import { describe, it, expect } from 'vitest'
import {
  CLASE_DEL_GRIS, KEYS_CLASE, arbol, deLaPersona, delSector, filaValida, grises, sinDueno,
  type Nodo, type Responsabilidad,
} from '@/lib/organizacion/tipos'
import { FUNCIONES } from '@/lib/permisos'

/**
 * Organización — el invariante del módulo, amarrado.
 *
 * 🔑 **`persona = null` es una fila válida, y sólo en `responde`.** Todo el valor de la sección
 * cuelga de eso: un gris que no se puede guardar es un gris que no se ve, y un gris que no se ve
 * es el que se cobra. La regla ya estaba escrita en el `.sql` y en el `core.js` — **un invariante
 * escrito no frena**, así que acá se vuelve test.
 */

const SECTORES = FUNCIONES.map((f) => f.key)

const fila = (o: Partial<Responsabilidad>): Responsabilidad => ({
  id: 'r1', sector: 'marketing', persona: 'Sofia Facello', clase: 'responde',
  titulo: 'El copy de todas las piezas', orden: 0, activo: true, ...o,
})

const nodo = (o: Partial<Nodo>): Nodo => ({
  id: 'n1', label: 'Nodo', tipo: 'persona', padre_id: null, persona: null, orden: 0, activo: true, ...o,
})

describe('el gris: una fila sin dueño', () => {
  it('se puede guardar en «Responde por»', () => {
    expect(filaValida(fila({ persona: null, clase: CLASE_DEL_GRIS }), SECTORES)).toBeNull()
  })

  it('NO se puede guardar en ninguna de las otras cuatro clases', () => {
    for (const clase of KEYS_CLASE.filter((c) => c !== CLASE_DEL_GRIS)) {
      const motivo = filaValida(fila({ persona: null, clase }), SECTORES)
      expect(motivo, `«${clase}» sin persona debería explicarse`).toBeTruthy()
      // El mensaje tiene que decir qué se puede hacer, no sólo que está mal.
      expect(motivo).toContain('Responde por')
    }
  })

  it('el vacío del formulario cuenta como sin dueño, igual que el null', () => {
    expect(sinDueno(fila({ persona: '' }))).toBe(true)
    expect(sinDueno(fila({ persona: null }))).toBe(true)
    expect(sinDueno(fila({ persona: 'Sofia Facello' }))).toBe(false)
  })

  it('`grises()` los junta y NO se cuela ninguno con dueña ni apagado', () => {
    const filas = [
      fila({ id: 'a', persona: null, titulo: 'Los DM de Facebook' }),
      fila({ id: 'b', persona: null, titulo: 'Apagada', activo: false }),
      fila({ id: 'c', persona: 'Camila Budek' }),
    ]
    expect(grises(filas).map((f) => f.id)).toEqual(['a'])
  })
})

describe('el reparto', () => {
  it('`delSector` ordena por clase y trae los grises del sector', () => {
    const filas = [
      fila({ id: 'a', clase: 'no_es_suyo', titulo: 'La pauta' }),
      fila({ id: 'b', clase: 'responde', persona: null }),
      fila({ id: 'c', clase: 'responde' }),
      fila({ id: 'd', sector: 'administracion', clase: 'responde' }),
    ]
    // `no_es_suyo` es la última clase, así que las dos de `responde` van primero.
    expect(delSector(filas, 'marketing').map((f) => f.id)).toEqual(['b', 'c', 'a'])
  })

  it('`deLaPersona` usa el `name` exacto: un nombre distinto no trae nada', () => {
    const filas = [fila({ persona: 'Sofia Facello' })]
    expect(deLaPersona(filas, 'Sofia Facello')).toHaveLength(1)
    expect(deLaPersona(filas, 'Sofi')).toHaveLength(0)
  })

  it('un sector que no existe no se puede guardar', () => {
    expect(filaValida(fila({ sector: 'ventas' as never }), SECTORES)).toContain('sector inválido')
  })
})

describe('el organigrama', () => {
  it('cuelga los hijos de su padre, ordenados', () => {
    const raiz = arbol([
      nodo({ id: 'mkt', label: 'Marketing', tipo: 'sector' }),
      nodo({ id: 'cami', label: 'Cami', padre_id: 'mkt', orden: 2 }),
      nodo({ id: 'sofi', label: 'Sofi', padre_id: 'mkt', orden: 1 }),
    ])
    expect(raiz).toHaveLength(1)
    expect(raiz[0].hijos.map((h) => h.id)).toEqual(['sofi', 'cami'])
  })

  it('🔑 un nodo cuyo padre no existe SUBE a la raíz, no desaparece', () => {
    // Un organigrama al que le falta gente se lee como «esa persona no está», que es peor que un
    // nodo fuera de lugar: al segundo alguien lo ve mal y lo arregla.
    const raiz = arbol([nodo({ id: 'huerfano', label: 'Marisol', padre_id: 'taller-borrado' })])
    expect(raiz.map((n) => n.id)).toEqual(['huerfano'])
  })

  it('el padre apagado también deja al hijo a la vista', () => {
    const raiz = arbol([
      nodo({ id: 'viejo', label: 'Sector viejo', tipo: 'sector', activo: false }),
      nodo({ id: 'hijo', label: 'Alguien', padre_id: 'viejo' }),
    ])
    expect(raiz.map((n) => n.id)).toEqual(['hijo'])
  })

  it('un ciclo no cuelga la pantalla: los dos salen igual', () => {
    const raiz = arbol([
      nodo({ id: 'a', label: 'A', padre_id: 'b' }),
      nodo({ id: 'b', label: 'B', padre_id: 'a' }),
    ])
    expect(raiz.map((n) => n.id).sort()).toEqual(['a', 'b'])
  })

  it('un nodo apagado no se dibuja', () => {
    expect(arbol([nodo({ id: 'x', activo: false })])).toHaveLength(0)
  })
})
