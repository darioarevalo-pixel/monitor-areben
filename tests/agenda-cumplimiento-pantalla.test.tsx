import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Cumplimiento } from '@/components/agenda/Cumplimiento'
import type { Hecho, ItemAgenda } from '@/lib/agenda'

/**
 * Cumplimiento, del lado de la pantalla.
 *
 * 🔑 **El oráculo es el renglón que NO se tildó.** Hasta el 26-ago-2026 ese renglón decía qué rutina
 * era y qué días caía, y **no decía de quién era**: para saber a quién reclamarle había que salir a
 * «Cargar» y buscarla. El que sí está tildado dice `lo marcó Local`, que es **quién lo hizo** y no
 * quién lo debía — son dos datos distintos y la pantalla no los puede mezclar.
 *
 * ⚠️ Es render, no interacción: `renderToStaticMarkup` no corre efectos, así que lo que se mira es
 * el primer pintado.
 *
 * 🔴 **Lo que estos tests NO pueden ejercer es el filtro puesto.** `useFiltroUrl` lee
 * `window.location.search` al montar y el entorno de vitest es `node`, así que acá el filtro siempre
 * vale «todos». Consecuencia concreta: el mutante que cambia el vacío de `todas.length === 0` a
 * `filas.length === 0` **sobrevive**, y no es equivalente — con un responsable elegido que no tiene
 * ocurrencias, diría «todavía no hay ninguna ocurrencia» en una pantalla que sí las tiene. Se camina
 * a mano: entrar a Cumplimiento y elegir a alguien sin rutinas en la ventana.
 */

// La ventana de Cumplimiento son los últimos 30 días contados desde hoy, así que las fechas se
// arman relativas: un fixture con fechas fijas deja de mostrar nada cuando pasa el mes.
const diasAtras = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

const item = (i: Partial<ItemAgenda> = {}): ItemAgenda => ({
  id: 'i1',
  clase: 'pendiente',
  titulo: 'Reponer la vidriera',
  cuerpo: null,
  regla: { tipo: 'diaria' },
  destino: { tipo: 'personas', personas: ['sofi'] },
  marcas: [],
  manualId: null,
  activo: true,
  arrastra: false,
  autor: null,
  creado: `${diasAtras(60)}T10:00:00.000Z`,
  paraMi: true,
  ...i,
})

const hecho = (h: Partial<Hecho> = {}): Hecho => ({
  itemId: 'i1',
  fecha: diasAtras(1),
  usuario: 'Local',
  nota: null,
  hechoAt: `${diasAtras(1)}T13:00:00.000Z`,
  ...h,
})

describe('Cumplimiento · de quién era lo que no se hizo', () => {
  it('🔴 el renglón sin tildar dice el responsable', () => {
    const html = renderToStaticMarkup(<Cumplimiento items={[item()]} hechos={[]} />)
    expect(html).toContain('sin tildar')
    expect(html).toContain('sofi')
  })

  it('el tildado sigue diciendo quién lo marcó, que NO es lo mismo', () => {
    const html = renderToStaticMarkup(<Cumplimiento items={[item()]} hechos={[hecho()]} />)
    expect(html).toContain('lo marcó Local')
  })

  it('un pendiente de todo el equipo no queda sin dueño en el renglón', () => {
    const html = renderToStaticMarkup(
      <Cumplimiento items={[item({ destino: { tipo: 'todos' } })]} hechos={[]} />,
    )
    expect(html).toContain('todo el equipo')
  })

  it('con más de un responsable aparece el reparto, y avisa que puede sumar de más', () => {
    const html = renderToStaticMarkup(
      <Cumplimiento
        items={[item(), item({ id: 'i2', titulo: 'Pasar el parte', destino: { tipo: 'roles', roles: ['local'] } })]}
        hechos={[]}
      />,
    )
    expect(html).toContain('por responsable')
    expect(html).toContain('cuenta en las dos')
  })

  it('⛔ con un solo responsable no dibuja el reparto: un filtro de una opción es ruido', () => {
    const html = renderToStaticMarkup(<Cumplimiento items={[item()]} hechos={[]} />)
    expect(html).not.toContain('por responsable')
  })

  it('sin ninguna ocurrencia lo dice y no muestra una tabla vacía', () => {
    const html = renderToStaticMarkup(<Cumplimiento items={[]} hechos={[]} />)
    expect(html).toContain('Todavía no hay ninguna ocurrencia')
  })
})
