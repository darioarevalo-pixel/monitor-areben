import { describe, it, expect, vi, afterEach } from 'vitest'
import { guardarConRelectura, guardarLeadsConRelectura } from '@/lib/crm/persistencia'
import { _olvidarVistas } from '@/lib/kv/cliente'
import { setTemperatura } from '@/lib/crm/seguimiento'
import type { MapaSeguimiento } from '@/lib/crm/tipos'

/**
 * La red de `crm:seg:bdi` y `crm:leads:bdi`: las dos claves se reescriben ENTERAS en cada POST,
 * así que quien guarde sobre una copia vieja no guarda su cambio — borra el de los demás.
 *
 * 🔴 **Esto no es hipotético.** El 27-ago-2026 se marcaron 327 clientes como fríos a las 14:50 y a
 * las 16:30 no quedaba ninguno: la pestaña del CRM, abierta desde antes, atendió 3 o 4 clientes y
 * cada guardado posteó su foto vieja de las 773 fichas. Cuatro guardados correctos borraron 327
 * marcas, sin un error y sin un aviso. Ver `lib/crm/persistencia.ts`.
 */

const resp = (body: unknown) => ({ ok: true, status: 200, json: async () => body })

/** El mapa que devuelve el GET, y lo que efectivamente se posteó. */
function kvFalso(enElServidor: MapaSeguimiento) {
  const posteado: { mapa: MapaSeguimiento | null } = { mapa: null }
  vi.stubGlobal('fetch', (_u: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      posteado.mapa = JSON.parse(String(init.body)).map
      return Promise.resolve(resp({ ok: true, total: Object.keys(posteado.mapa || {}).length }))
    }
    return Promise.resolve(resp({ ok: true, map: enElServidor }))
  })
  return posteado
}

describe('guardarConRelectura · el patch se aplica sobre lo que hay EN EL SERVIDOR', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    _olvidarVistas()
  })

  it('🔴 el episodio del 27-ago: guardar una nota no borra las temperaturas que llegaron después', async () => {
    // Lo que la pantalla bajó al abrirse: dos clientes, ninguno marcado.
    const copiaVieja: MapaSeguimiento = {
      1: { notas: [] },
      2: { notas: [] },
    }
    // Lo que hay en el servidor AHORA: al 2 lo marcaron frío mientras la pestaña estaba abierta.
    const enElServidor: MapaSeguimiento = {
      1: { notas: [] },
      2: { notas: [], temperatura: 'frio' },
    }
    const posteado = kvFalso(enElServidor)

    // La pantalla guarda un cambio sobre el cliente 1. El patch es puro y NO se aplica contra
    // `copiaVieja`: se lo pasa a `guardarConRelectura`, que lo corre sobre el mapa recién leído.
    const r = await guardarConRelectura((m) => setTemperatura(m, 1, 'caliente'))

    expect(r.ok).toBe(true)
    expect(posteado.mapa?.['1'].temperatura).toBe('caliente') // el cambio propio, guardado
    expect(posteado.mapa?.['2'].temperatura).toBe('frio') // 🔑 y el ajeno, INTACTO
    // Si el patch se hubiera aplicado sobre la copia vieja, el 2 saldría sin temperatura: ése es
    // exactamente el borrado de las 327.
    expect(copiaVieja['2'].temperatura).toBeUndefined() // la copia vieja no se tocó, y da igual
  })

  it('devuelve el mapa del servidor, no el de la pantalla: así se entera de lo que escribió el panel', async () => {
    const posteado = kvFalso({ 1: { notas: [] }, 9: { notas: [{ fecha: '2026-08-27', texto: 'del panel' }] } })
    const r = await guardarConRelectura((m) => setTemperatura(m, 1, 'caliente'))

    expect(r.ok).toBe(true)
    // El cliente 9 nunca estuvo en la copia de la pantalla y vuelve en el mapa resultante.
    if (r.ok) expect(r.mapa['9'].notas?.[0].texto).toBe('del panel')
    expect(posteado.mapa?.['9']).toBeTruthy()
  })

  it('🔴 si no se pudo LEER, no escribe: postear ahora deja la clave vacía', async () => {
    const post = vi.fn()
    vi.stubGlobal('fetch', (_u: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        post()
        return Promise.resolve(resp({ ok: true }))
      }
      return Promise.resolve({ ok: false, status: 500, json: async () => ({ error: 'KV caído' }) })
    })

    const r = await guardarConRelectura((m) => setTemperatura(m, 1, 'frio'))
    expect(r.ok).toBe(false)
    expect(post).not.toHaveBeenCalled()
  })

  it('el patch nunca ve la copia de la pantalla: recibe el mapa del servidor', async () => {
    kvFalso({ 7: { notas: [], temperatura: 'frio' } })
    let visto: MapaSeguimiento | null = null
    await guardarConRelectura((m) => {
      visto = m
      return m
    })
    expect(Object.keys(visto || {})).toEqual(['7'])
  })
})

describe('guardarLeadsConRelectura · la misma disciplina sobre crm:leads', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    _olvidarVistas()
  })

  it('no pisa el lead que cargó la otra pantalla', async () => {
    const posteado: { mapa: Record<string, unknown> | null } = { mapa: null }
    vi.stubGlobal('fetch', (_u: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posteado.mapa = JSON.parse(String(init.body)).map
        return Promise.resolve(resp({ ok: true, total: 2 }))
      }
      return Promise.resolve(resp({ ok: true, map: { a: { id: 'a', nombre: 'Ana' }, b: { id: 'b', nombre: 'Beto' } } }))
    })

    const r = await guardarLeadsConRelectura((m) => ({ ...m, a: { ...m.a, nombre: 'Ana María' } }))
    expect(r.ok).toBe(true)
    expect(posteado.mapa?.a).toMatchObject({ nombre: 'Ana María' })
    expect(posteado.mapa?.b).toMatchObject({ nombre: 'Beto' })
  })

  it('🔴 lectura fallida, cero escritura', async () => {
    const post = vi.fn()
    vi.stubGlobal('fetch', (_u: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        post()
        return Promise.resolve(resp({ ok: true }))
      }
      return Promise.resolve({ ok: false, status: 500, json: async () => ({ error: 'KV caído' }) })
    })

    expect((await guardarLeadsConRelectura((m) => m)).ok).toBe(false)
    expect(post).not.toHaveBeenCalled()
  })
})

describe('ninguna pantalla del CRM escribe el seguimiento por su cuenta', () => {
  /**
   * El agujero del 27-ago no fue un cálculo mal hecho: fue una pantalla posteando el mapa por su
   * cuenta con `guardarMapa`. El tipo de `useCRM.guardarSeg` ya impide pasar un mapa ya armado
   * —recibe el patch—, pero nada impide que mañana alguien vuelva a llamar `guardarMapa` derecho.
   * Esto lo cierra: sobre `crm:seg` y `crm:leads` escribe `lib/crm/persistencia.ts`, y nadie más.
   */
  it('sólo persistencia.ts postea crmseg y crmleads', async () => {
    const { readFileSync, readdirSync } = await import('node:fs')
    const { join } = await import('node:path')

    const archivos: string[] = []
    const recorrer = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name)
        if (e.isDirectory()) recorrer(p)
        else if (/\.tsx?$/.test(e.name)) archivos.push(p)
      }
    }
    recorrer('components/crm')
    recorrer('components/panel')

    const culpables = archivos.filter((f) => {
      const src = readFileSync(f, 'utf8')
      return /guardarMapa\s*\(\s*\{[\s\S]*?kind:\s*'(crmseg|crmleads)'/.test(src)
    })
    expect(culpables).toEqual([])
  })
})
