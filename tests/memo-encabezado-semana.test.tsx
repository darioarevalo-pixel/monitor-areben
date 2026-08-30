import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { EncabezadoSemana } from '@/components/memo/EncabezadoSemana'
import { deLaSemana } from '@/components/memo/useMemoSemanal'

/**
 * **El encabezado del memo no puede afirmar el estado de otra semana.**
 *
 * El defecto lo reportó Bruno el 29-ago-2026, apenas después de sellar las señales de la semana
 * 24-30: *"cada vez que cambio de semana hay un bug y queda la semana anterior… el estado queda del
 * anterior por unos segundos, y luego actualiza"*.
 *
 * 🔑 **No era el número de pedido.** Ese contador ya estaba (y sigue), y lo que resuelve es que la
 * respuesta LENTA de la semana vieja no pise a la nueva. Acá el problema es el otro: mientras la
 * semana nueva viaja, la tarjeta del encabezado —que vive fuera del esqueleto de carga, porque el
 * título tiene que responder al instante— seguía dibujando el `memo` viejo. Título de una semana,
 * estado de otra, sin error y sin aviso.
 *
 * 🔴 **Lo que muerde no es el chip: es el botón.** "Cerrar la semana y congelar los números" apaga
 * el acta, los avances y el botón de señales de una sola vez. Ofrecerlo mientras el estado todavía
 * es el de otra semana es ofrecer apagar lo que no se está mirando — y ya hay un precedente de una
 * semana cerrada con el acta vacía.
 *
 * ⚠️ Es render, no interacción: defiende **qué dice y qué botones hay**, no qué pasa al apretarlos.
 */

type Props = Parameters<typeof EncabezadoSemana>[0]

const props: Props = {
  etiqueta: '24 al 30 de agosto de 2026',
  estado: null,
  semanaTerminada: false,
  puedeEscribir: true,
  cerradoPor: null as string | null,
  cerradoAt: null as string | null,
  onCerrar: () => {},
}

const pintar = (over: Partial<Props>) =>
  renderToStaticMarkup(<EncabezadoSemana {...props} {...over} />)

describe('EncabezadoSemana: mientras no se sabe, no se afirma', () => {
  it('con el estado sin leer no dice ni "Cerrado" ni "En curso" ni "Terminada"', () => {
    const html = pintar({ estado: null, semanaTerminada: true })
    expect(html).toContain('Leyendo la semana')
    expect(html).not.toContain('Cerrado')
    expect(html).not.toContain('En curso')
    expect(html).not.toContain('Terminada')
  })

  it('con el estado sin leer NO ofrece cerrar la semana, aunque la semana ya haya terminado', () => {
    const html = pintar({ estado: null, semanaTerminada: true, puedeEscribir: true })
    expect(html).not.toContain('Cerrar la semana')
  })

  it('el título es siempre el de la semana que se está mirando', () => {
    for (const estado of [null, 'abierto', 'cerrado'] as const) {
      expect(pintar({ estado })).toContain('24 al 30 de agosto de 2026')
    }
  })
})

describe('EncabezadoSemana: cuando sí se sabe', () => {
  it('una semana en curso lo dice y no ofrece cerrar', () => {
    const html = pintar({ estado: 'abierto', semanaTerminada: false })
    expect(html).toContain('En curso')
    expect(html).not.toContain('Cerrar la semana')
  })

  it('una semana terminada y sin cerrar lo dice y sí ofrece cerrar', () => {
    const html = pintar({ estado: 'abierto', semanaTerminada: true })
    expect(html).toContain('Terminada, sin cerrar')
    expect(html).toContain('Cerrar la semana y congelar los números')
  })

  it('quien no puede escribir no ve el botón de cerrar', () => {
    const html = pintar({ estado: 'abierto', semanaTerminada: true, puedeEscribir: false })
    expect(html).not.toContain('Cerrar la semana')
  })

  it('una semana cerrada muestra la firma y ya no ofrece cerrarla de nuevo', () => {
    const html = pintar({
      estado: 'cerrado', semanaTerminada: true,
      cerradoPor: 'Bruno Arevalo', cerradoAt: '2026-08-24T11:37:36.923+00:00',
    })
    expect(html).toContain('Cerrado')
    expect(html).toContain('Bruno Arevalo')
    expect(html).not.toContain('Cerrar la semana y congelar')
  })

  it('cerrada sin firma no inventa un "Cerrado por"', () => {
    const html = pintar({ estado: 'cerrado', semanaTerminada: true, cerradoPor: null })
    expect(html).not.toContain('Cerrado por')
  })
})

describe('deLaSemana: el dato viaja con su semana', () => {
  it('devuelve lo guardado sólo si es de la semana que se pide', () => {
    const caja = { id: 'w2026-08-17', dato: { estado: 'cerrado' } }
    expect(deLaSemana(caja, 'w2026-08-17')).toEqual({ estado: 'cerrado' })
    expect(deLaSemana(caja, 'w2026-08-24')).toBeNull()
  })

  it('sin nada guardado devuelve null, que es "todavía no sé"', () => {
    expect(deLaSemana(null, 'w2026-08-24')).toBeNull()
  })
})
