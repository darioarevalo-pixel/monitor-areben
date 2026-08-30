// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { paraElCliente } from '@/api/_reclamo.js'
import { PERFIL_MOTIVO, pideFotosAlCliente } from '@/lib/reclamos/casos.core.js'
import { pideFotos } from '@/lib/reclamos/tipos'
import type { MotivoReclamo } from '@/lib/reclamos/tipos'
import { ReclamoPublico } from '@/components/reclamos/ReclamoPublico'

/**
 * 🔴 **El portal exigía una foto SIEMPRE, y hay casos que no tienen ninguna.**
 *
 * En «todavía no me llegó», en una demora y en un `sin_stock` ⛔ no hay nada que fotografiar —el
 * paquete no está—, así que el botón de enviar ⛔ no se prendía nunca y el reclamo se quedaba en
 * `borrador` para siempre. Del lado del cliente eso se ve igual que «el link no anda», y le pasa
 * justo al caso más caro de dejar sin atender.
 *
 * 🔑 **La regla ya existía y ⛔ no llegaba hasta acá**: `pideFotos` vivía sólo en `tipos.ts`, o sea
 * en TypeScript, y `api/_reclamo.js` ⛔ no puede importar TS. La forma en que este módulo se rompe
 * es siempre la misma —la regla de un lado de la puerta y una copia del otro—, así que bajó a
 * `casos.core.js` y `tipos.ts` se quedó con la cara tipada.
 *
 * Con el alta pública esto dejó de ser hipotético: **«Todavía no me llegó» es una de las cinco
 * opciones** que puede tocar cualquiera.
 */

const BASE = {
  numero: 'R-0042', orden: '21033', estado: 'en_revision',
  productos: [{ producto: 'FUNDA X', variante: null, cantidad: 1 }],
  fotos: [] as string[], relato: '',
  puedeSubir: true,
}

async function abrirPortal(reclamo: object) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, reclamo }) })))
  document.body.innerHTML = ''
  const host = document.createElement('div')
  document.body.appendChild(host)
  await act(async () => {
    createRoot(host).render(<ReclamoPublico token={'a'.repeat(64)} />)
  })
}

const botonEnviar = () => [...document.querySelectorAll('button')]
  .find((b) => (b.textContent || '').trim() === 'Enviar') as HTMLButtonElement | undefined
const texto = () => document.body.textContent || ''

beforeAll(() => {
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
afterEach(() => { vi.unstubAllGlobals() })

describe('la pantalla: el botón de enviar sale de lo que pide el CASO', () => {
  it('hay un botón de enviar (si esto se cae, lo de abajo ⛔ no significa nada)', async () => {
    await abrirPortal({ ...BASE, pideFotos: false })
    expect(botonEnviar()).toBeTruthy()
  })

  it('🔴 en un caso sin fotos que pedir, se puede enviar SIN ninguna', async () => {
    await abrirPortal({ ...BASE, pideFotos: false })
    expect(botonEnviar()!.disabled).toBe(false)
    expect(texto()).not.toContain('Subí al menos una foto')
    expect(texto()).toContain('Para este caso no hace falta')
  })

  it('en un caso que las pide, sin fotos sigue trabado y lo dice', async () => {
    await abrirPortal({ ...BASE, pideFotos: true })
    expect(botonEnviar()!.disabled).toBe(true)
    expect(texto()).toContain('Subí al menos una foto')
  })

  it('con la foto ya subida, el que las pide se destraba', async () => {
    await abrirPortal({ ...BASE, pideFotos: true, fotos: ['https://blob/x.jpg'] })
    expect(botonEnviar()!.disabled).toBe(false)
  })

  it('🔴 si el servidor todavía ⛔ no lo manda, el default es EXIGIR', async () => {
    // Entre el deploy de la pantalla y el de la función serverless hay minutos en que el GET viejo
    // sigue contestando. Ahí `undefined` tiene que valer lo que esta pantalla hizo siempre —pedir
    // la foto—, y ⛔ no «dejá enviar cualquier cosa».
    await abrirPortal(BASE)
    expect(botonEnviar()!.disabled).toBe(true)
  })
})

describe('el servidor: qué se le manda al cliente sobre las fotos', () => {
  const fila = (motivo: string) => ({ id: 42, store: 'bdi', orden_tn: '21033', estado: 'borrador', motivo, items: [], fotos: [] })

  it('🔴 viaja la RESPUESTA (pide o no), y ⛔ nunca el motivo', async () => {
    // El cliente ⛔ no tiene por qué ver nuestra taxonomía: publicar `motivo` le diría «esto entró
    // como demora» sobre una clasificación que todavía ⛔ no miró nadie.
    const v = paraElCliente(fila('demora'))
    expect(v.pideFotos).toBe(false)
    expect(JSON.stringify(v)).not.toContain('demora')
    expect((v as Record<string, unknown>).motivo).toBeUndefined()
  })

  it('un caso con fotos contesta que sí', () => {
    expect(paraElCliente(fila('falla')).pideFotos).toBe(true)
  })

  it('lo contesta para TODOS los motivos, y coincide con el perfil', () => {
    const perfil = PERFIL_MOTIVO as Record<string, { fotos: string }>
    for (const m of Object.keys(perfil)) {
      expect(paraElCliente(fila(m)).pideFotos, m).toBe(perfil[m].fotos !== 'nunca')
    }
  })
})

describe('el cable: una sola regla, tres lectores', () => {
  it('la cara tipada de `tipos.ts` contesta lo mismo que el núcleo, motivo por motivo', () => {
    // Si `pideFotos` volviera a tener cuerpo propio, esto se pone rojo antes de que las dos copias
    // se despeguen — que es exactamente como se rompió cuatro veces la regla del portal.
    for (const m of Object.keys(PERFIL_MOTIVO)) {
      expect(pideFotos(m as MotivoReclamo), m).toBe(pideFotosAlCliente(m))
    }
  })

  it('y hay de los dos: si todos los motivos contestaran igual, lo de arriba sería vacío', () => {
    const valores = Object.keys(PERFIL_MOTIVO).map((m) => pideFotosAlCliente(m))
    expect(valores).toContain(true)
    expect(valores).toContain(false)
  })

  it('un motivo que ⛔ no está en el perfil cae del lado de PEDIR la foto', () => {
    // 🔑 El default seguro acá es **pedirla**, y ⛔ no al revés: de una fila que ⛔ no entendemos, lo
    // caro es dejar cerrar sin evidencia. Y ⛔ no traba a nadie —siempre se puede subir una foto—:
    // el bug que esto vino a arreglar es el caso en que ⛔ no hay NADA que fotografiar.
    // ⚠️ Antes esto ⛔ no contestaba: `tipos.ts` reventaba con un TypeError sobre `undefined`.
    expect(pideFotosAlCliente('__no_existe__')).toBe(true)
  })
})
