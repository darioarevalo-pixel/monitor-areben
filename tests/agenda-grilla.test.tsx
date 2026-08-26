import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CeldaDia, DetalleDia } from '@/components/agenda/GrillaAgenda'
import type { EntradaMes, Hecho, ItemAgenda } from '@/lib/agenda'

/**
 * La grilla de la Agenda, del lado de la pantalla.
 *
 * 🔑 **El oráculo es la celda de un día con cinco rutinas.** Hasta el 26-ago-2026 esa celda pintaba
 * tres renglones iguales y un «+2», treinta y un días seguidos: es el *«cargado y monótono»* que
 * Bruno describió. Ahora el mes las **cuenta** en un renglón y la semana las **nombra** — y las dos
 * salen del mismo mapa, así que no pueden discrepar.
 *
 * 🔴 El segundo oráculo es un día **futuro**: contar «sin hacer» ahí es inventar una alarma que
 * nadie puede apagar, porque todavía no tocaba.
 *
 * ⚠️ Es render, no interacción: `renderToStaticMarkup` no corre efectos ni hooks de navegación, así
 * que lo que se mira es el primer pintado de las piezas puras. Lo que estos tests **no** ejercen es
 * el selector Mes/Semana ni el reseteo del `offset` al cambiar de vista: eso se camina a mano.
 */

const item = (i: Partial<ItemAgenda> = {}): ItemAgenda => ({
  id: 'i1',
  clase: 'pendiente',
  titulo: 'Reponer la vidriera',
  cuerpo: null,
  regla: { tipo: 'diaria' },
  destino: { tipo: 'todos' },
  marcas: [],
  manualId: null,
  activo: true,
  arrastra: false,
  autor: null,
  creado: '2026-06-01T10:00:00.000Z',
  paraMi: true,
  ...i,
})

const hecho = (h: Partial<Hecho> = {}): Hecho => ({
  itemId: 'i1',
  fecha: '2026-08-11',
  usuario: 'Local',
  nota: null,
  hechoAt: '2026-08-11T13:00:00.000Z',
  ...h,
})

/** Cinco rutinas distintas que caen todas el mismo día: el caso que hacía ilegible la celda. */
const CINCO_RUTINAS: EntradaMes[] = ['Reponer la vidriera', 'Contar la caja', 'Barrer el local', 'Pasar el parte', 'Cargar el stock'].map(
  (titulo, n): EntradaMes => ({
    key: `i-r${n}`,
    tipo: 'pendiente',
    item: item({ id: `r${n}`, titulo, regla: { tipo: 'diaria' } }),
    hecho: null,
  }),
)

const HOY = '2026-08-11' // martes

describe('la celda del mes — el mes cuenta', () => {
  it('🔴 cinco rutinas rinden UN SOLO renglón, y no cinco ni «+2»', () => {
    const html = renderToStaticMarkup(
      <CeldaDia fecha={HOY} rotulo="11" entradas={CINCO_RUTINAS} hoy={HOY} resumir abierto={false} onClick={() => {}} />,
    )
    expect(html).toContain('5 rutinas')
    // Ninguno de los cinco títulos se nombra: si se nombrara uno, el contador no estaría contando.
    for (const e of CINCO_RUTINAS) {
      if (e.tipo === 'pendiente') expect(html).not.toContain(e.item.titulo)
    }
    expect(html).not.toContain('+2')
  })

  it('🔴 un día FUTURO no dice «sin hacer» ni cuenta tildadas: todavía no tocaba', () => {
    const html = renderToStaticMarkup(
      <CeldaDia fecha="2026-08-25" rotulo="25" entradas={CINCO_RUTINAS} hoy={HOY} resumir abierto={false} onClick={() => {}} />,
    )
    expect(html).toContain('5 rutinas')
    expect(html).not.toContain('sin hacer')
    expect(html).not.toContain('✓')
  })

  it('un día que YA PASÓ suma las tildadas, y sin tono de alarma', () => {
    const conDos = CINCO_RUTINAS.map((e, n): EntradaMes =>
      e.tipo === 'pendiente' && n < 2 ? { ...e, hecho: hecho({ itemId: e.item.id, fecha: '2026-08-04' }) } : e,
    )
    const html = renderToStaticMarkup(
      <CeldaDia fecha="2026-08-04" rotulo="4" entradas={conDos} hoy={HOY} resumir abierto={false} onClick={() => {}} />,
    )
    expect(html).toContain('5 rutinas')
    expect(html).toContain('2 ✓')
    expect(html).not.toContain('--mo-danger')
  })

  it('una rutina sola se NOMBRA: el contador escondería el título sin ahorrar un renglón', () => {
    const html = renderToStaticMarkup(
      <CeldaDia fecha={HOY} rotulo="11" entradas={[CINCO_RUTINAS[0]]} hoy={HOY} resumir abierto={false} onClick={() => {}} />,
    )
    expect(html).toContain('Reponer la vidriera')
    expect(html).not.toContain('1 rutina')
  })

  it('🔴 lo excepcional del día sigue nombrado aunque haya cinco rutinas tapándolo', () => {
    const conAviso: EntradaMes[] = [
      { key: 'a-x', tipo: 'aviso', item: item({ id: 'x', clase: 'aviso', titulo: 'Cierra a las 18' }) },
      ...CINCO_RUTINAS,
    ]
    const html = renderToStaticMarkup(
      <CeldaDia fecha={HOY} rotulo="11" entradas={conAviso} hoy={HOY} resumir abierto={false} onClick={() => {}} />,
    )
    expect(html).toContain('Cierra a las 18')
    expect(html).toContain('5 rutinas')
  })
})

describe('la celda de la semana — la semana nombra', () => {
  it('🔴 las cinco rutinas salen NOMBRADAS y no contadas: la celda es alta y entra todo', () => {
    const html = renderToStaticMarkup(
      <CeldaDia fecha={HOY} rotulo="mar 11-ago" entradas={CINCO_RUTINAS} hoy={HOY} resumir={false} abierto={false} onClick={() => {}} />,
    )
    for (const e of CINCO_RUTINAS) {
      if (e.tipo === 'pendiente') expect(html).toContain(e.item.titulo)
    }
    expect(html).not.toContain('5 rutinas')
  })
})

describe('el detalle del día — lista todo', () => {
  it('🔴 lista las CINCO, que es lo que el contador del mes escondió', () => {
    const html = renderToStaticMarkup(<DetalleDia fecha={HOY} entradas={CINCO_RUTINAS} hoy={HOY} />)
    for (const e of CINCO_RUTINAS) {
      if (e.tipo === 'pendiente') expect(html).toContain(e.item.titulo)
    }
  })

  it('dice de quién es lo que no es de todos, y NO repite «todo el equipo» en cada renglón', () => {
    const deSofi: EntradaMes = {
      key: 'i-s',
      tipo: 'pendiente',
      item: item({ id: 's', titulo: 'Subir las historias', destino: { tipo: 'personas', personas: ['sofi'] } }),
      hecho: null,
    }
    const html = renderToStaticMarkup(<DetalleDia fecha={HOY} entradas={[deSofi, CINCO_RUTINAS[0]]} hoy={HOY} />)
    expect(html).toContain('sofi')
    expect(html).not.toContain('Todo el equipo')
    expect(html).not.toContain('todo el equipo')
  })

  it('un día sin nada lo dice, en vez de quedar en blanco', () => {
    const html = renderToStaticMarkup(<DetalleDia fecha={HOY} entradas={[]} hoy={HOY} />)
    expect(html).toContain('Ese día no hay nada cargado')
  })
})
