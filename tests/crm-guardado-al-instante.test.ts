import { describe, expect, it } from 'vitest'
import { filaDeGuardado, type Cambio, type Resultado } from '@/lib/crm/guardado-al-instante'
import { adelantar, tomar, _olvidarPrecarga } from '@/lib/crm/precarga'

type M = Record<string, string>

/** Un "servidor" que guarda el mapa y deja controlar cuándo contesta cada guardado. */
function servidor(inicial: M) {
  let mapa = inicial
  const enEspera: Array<() => void> = []
  let falla = false
  let enVuelo = 0
  let maxEnVuelo = 0
  const guardar = (fn: Cambio<M>): Promise<Resultado<M>> =>
    new Promise((res) => {
      enVuelo++
      maxEnVuelo = Math.max(maxEnVuelo, enVuelo)
      // Relee al contestar, como `guardarConRelectura`.
      enEspera.push(() => {
        enVuelo--
        if (falla) return res({ ok: false, motivo: 'se cortó' })
        mapa = fn(mapa)
        res({ ok: true, mapa })
      })
    })
  const tick = () => new Promise((r) => setTimeout(r, 0))
  return {
    guardar,
    contestar: async () => {
      await tick()
      enEspera.shift()?.()
      await tick()
    },
    fallar: (v: boolean) => (falla = v),
    mapa: () => mapa,
    maxEnVuelo: () => maxEnVuelo,
  }
}

describe('filaDeGuardado', () => {
  it('se ve al instante, antes de que conteste el servidor', () => {
    const s = servidor({})
    const vistas: M[] = []
    const f = filaDeGuardado<M>({}, s.guardar, (v) => vistas.push(v))
    f.encolar((m) => ({ ...m, a: 'despacho' }))
    expect(vistas.at(-1)).toEqual({ a: 'despacho' })
    expect(s.mapa()).toEqual({})
  })

  it('guarda de a uno, en orden, sin que el segundo pise al primero', async () => {
    const s = servidor({})
    const f = filaDeGuardado<M>({}, s.guardar, () => {})
    const p1 = f.encolar((m) => ({ ...m, a: '1' }))
    const p2 = f.encolar((m) => ({ ...m, b: '2' }))
    await s.contestar()
    await s.contestar()
    await Promise.all([p1, p2])
    expect(s.mapa()).toEqual({ a: '1', b: '2' })
    expect(s.maxEnVuelo()).toBe(1)
    expect(f.pendientes()).toBe(0)
  })

  it('si falla, vuelve a lo confirmado y deja los demás pendientes encima', async () => {
    const s = servidor({ a: 'viejo' })
    const vistas: M[] = []
    const f = filaDeGuardado<M>({ a: 'viejo' }, s.guardar, (v) => vistas.push(v))
    s.fallar(true)
    const p1 = f.encolar((m) => ({ ...m, a: 'nuevo' }))
    const p2 = f.encolar((m) => ({ ...m, b: 'otro' }))
    await s.contestar()
    expect(await p1).toEqual({ ok: false, motivo: 'se cortó' })
    expect(vistas.at(-1)).toEqual({ a: 'viejo', b: 'otro' })
    s.fallar(false)
    await s.contestar()
    await p2
    expect(vistas.at(-1)).toEqual({ a: 'viejo', b: 'otro' })
  })

  it('un error tirado cuenta como falla y no traba la fila', async () => {
    let n = 0
    const f = filaDeGuardado<M>({}, async (fn) => {
      if (n++ === 0) throw new Error('sin red')
      return { ok: true, mapa: fn({}) }
    }, () => {})
    expect(await f.encolar((m) => ({ ...m, a: '1' }))).toEqual({ ok: false, motivo: 'sin red' })
    expect(await f.encolar((m) => ({ ...m, b: '2' }))).toEqual({ ok: true, mapa: { b: '2' } })
  })

  it('al releer la base, lo pendiente se vuelve a aplicar encima', () => {
    const vistas: M[] = []
    const f = filaDeGuardado<M>({}, () => new Promise(() => {}), (v) => vistas.push(v))
    f.encolar((m) => ({ ...m, a: 'mío' }))
    f.fijarBase({ z: 'de otra pantalla' })
    expect(vistas.at(-1)).toEqual({ z: 'de otra pantalla', a: 'mío' })
  })
})

describe('precarga', () => {
  it('usa la lectura adelantada una sola vez', async () => {
    _olvidarPrecarga()
    let llamadas = 0
    adelantar('k', async () => 'adelantada')
    const fn = async () => (llamadas++, 'nueva')
    expect(await tomar('k', fn, () => true)).toBe('adelantada')
    expect(await tomar('k', fn, () => true)).toBe('nueva')
    expect(llamadas).toBe(1)
  })

  it('🔴 una lectura adelantada que falló se vuelve a pedir', async () => {
    _olvidarPrecarga()
    adelantar('k', async () => ({ ok: false }))
    expect(await tomar('k', async () => ({ ok: true }), (x) => x.ok)).toEqual({ ok: true })
    adelantar('j', () => Promise.reject(new Error('sin sesión')))
    expect(await tomar('j', async () => 'nueva', () => true)).toBe('nueva')
  })

  it('una lectura adelantada vieja no se usa', async () => {
    _olvidarPrecarga()
    adelantar('k', async () => 'vieja', 0)
    expect(await tomar('k', async () => 'nueva', () => true, 60_000)).toBe('nueva')
  })
})
