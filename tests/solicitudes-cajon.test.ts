import { describe, it, expect } from 'vitest'
import { diffSolicitudes } from '@/lib/solicitudes/cajon'

type Sol = { id: string; estado: string; items?: { vid: string; qty: number }[] }

const sol = (id: string, estado = 'pendiente', items: Sol['items'] = []): Sol => ({ id, estado, items })

/**
 * `diffSolicitudes` es la bisagra de la mudanza al cajón único: el motor sigue mutando el
 * array entero (como cuando el KV guardaba todo junto), pero al guardar se toca SOLO lo
 * que cambió. Si el diff se equivoca, o se pierde una edición (falta un upsert) o se borra
 * una solicitud que nadie quiso borrar — así que se prueba, no se confía.
 */
describe('cajón de solicitudes — diff', () => {
  it('sin cambios, no escribe nada', () => {
    const l = [sol('a'), sol('b')]
    expect(diffSolicitudes(l, l)).toEqual({ guardar: [], borrar: [] })
  })

  it('detecta el alta', () => {
    const d = diffSolicitudes([sol('a')], [sol('a'), sol('b')])
    expect(d.guardar.map((s) => s.id)).toEqual(['b'])
    expect(d.borrar).toEqual([])
  })

  it('detecta la edición y NO reescribe las demás', () => {
    const d = diffSolicitudes([sol('a'), sol('b')], [sol('a'), sol('b', 'preparada')])
    expect(d.guardar.map((s) => s.id)).toEqual(['b'])
  })

  it('un cambio adentro de los items cuenta como edición', () => {
    const antes = [sol('a', 'pendiente', [{ vid: 'v1', qty: 1 }])]
    const despues = [sol('a', 'pendiente', [{ vid: 'v1', qty: 2 }])]
    expect(diffSolicitudes(antes, despues).guardar.map((s) => s.id)).toEqual(['a'])
  })

  it('detecta el borrado', () => {
    const d = diffSolicitudes([sol('a'), sol('b')], [sol('a')])
    expect(d.borrar).toEqual(['b'])
    expect(d.guardar).toEqual([])
  })

  it('alta y borrado en la misma tanda', () => {
    const d = diffSolicitudes([sol('a'), sol('b')], [sol('a'), sol('c')])
    expect(d.guardar.map((s) => s.id)).toEqual(['c'])
    expect(d.borrar).toEqual(['b'])
  })

  it('el orden de la lista no cuenta como cambio (no genera escrituras fantasma)', () => {
    const d = diffSolicitudes([sol('a'), sol('b')], [sol('b'), sol('a')])
    expect(d).toEqual({ guardar: [], borrar: [] })
  })
})
