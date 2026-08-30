import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { EnCurso, FilaActividad } from '@/components/agenda/Eventos'
import { plantillaDe, type GrupoSembrado, type ItemAgenda } from '@/lib/agenda'

/**
 * La pantalla de **Eventos**, del lado de lo que se lee.
 *
 * 🔑 **El oráculo es el renglón de una actividad que cae ANTES del hecho.** La sesión de fotos tiene
 * dos —la modelo 48 h antes, las referencias el día anterior— y son justo los dos que el manual dice
 * que se caen. Dibujados como `-2` se leen como un error de carga.
 *
 * 🔴 El segundo oráculo es un hecho **más viejo que la ventana de tildes**: ahí el conteo de lo que
 * falta viaja en `null`, y un «0 sin tildar» diría *«está todo hecho»* sin tener con qué.
 *
 * ⚠️ Es render, no interacción: lo que ⛔ no se ejerce acá es el modal de alta con su evento puesto
 * ni el botón de disparo, que necesitan la sesión montada. Eso se camina a mano.
 */

const ingreso = plantillaDe('ingreso')!
const sesion = plantillaDe('sesion-fotos')!

const act = (i: Partial<ItemAgenda> = {}): ItemAgenda => ({
  id: 'a1',
  clase: 'pendiente',
  titulo: 'Cargar el nombre',
  cuerpo: null,
  regla: { tipo: 'unica', fecha: '2026-08-26' },
  destino: { tipo: 'roles', roles: ['administracion'] },
  marcas: [],
  manualId: null,
  activo: true,
  arrastra: true,
  plantilla: 'ingreso',
  offsetDias: 0,
  autor: null,
  creado: null,
  paraMi: true,
  ...i,
})

const pintar = (n: React.ReactElement) => renderToStaticMarkup(n)

describe('la fila de una actividad dice CUÁNDO cae y DE QUIÉN es', () => {
  it('el día del hecho, en castellano', () => {
    const html = pintar(<FilaActividad i={act()} plantilla={ingreso} onEditar={() => {}} onBorrar={() => {}} />)
    expect(html).toContain('el día del ingreso')
    expect(html).toContain('Cargar el nombre')
  })

  it('🔴 lo que va ANTES ⛔ no se dibuja con un signo menos', () => {
    const html = pintar(
      <FilaActividad
        i={act({ titulo: 'Buscar la modelo', plantilla: 'sesion-fotos', offsetDias: -2 })}
        plantilla={sesion}
        onEditar={() => {}}
        onBorrar={() => {}}
      />,
    )
    expect(html).toContain('2 días antes de la sesión')
    expect(html).not.toContain('-2')
  })

  it('el eje se nombra sólo cuando corre en ALGUNOS: «todos» es el caso normal', () => {
    const todas = pintar(<FilaActividad i={act()} plantilla={ingreso} onEditar={() => {}} onBorrar={() => {}} />)
    expect(todas).not.toContain('sólo ')
    const una = pintar(
      <FilaActividad i={act({ puertas: ['produccion'] })} plantilla={ingreso} onEditar={() => {}} onBorrar={() => {}} />,
    )
    expect(una).toContain('sólo ')
  })

  it('una actividad apagada lo dice: si no, se busca el error en la carga', () => {
    const html = pintar(<FilaActividad i={act({ activo: false })} plantilla={ingreso} onEditar={() => {}} onBorrar={() => {}} />)
    expect(html).toContain('apagada')
  })
})

describe('lo que ya se copió: el grupo por hecho', () => {
  const grupo = (g: Partial<GrupoSembrado> = {}): GrupoSembrado => ({
    clave: '2026-08-26·imp2',
    nombre: 'IMP2',
    fecha: '2026-08-26',
    items: [act({ id: 'c1' }), act({ id: 'c2' })],
    sinTildar: 1,
    ...g,
  })

  it('nombra el hecho, la fecha y cuántos renglones dejó', () => {
    const html = pintar(<EnCurso grupos={[grupo()]} plantilla={ingreso} />)
    expect(html).toContain('IMP2')
    expect(html).toContain('2 renglones')
    expect(html).toContain('faltan 1')
  })

  it('cuando no falta ninguno lo dice, que ⛔ no es lo mismo que no saber', () => {
    expect(pintar(<EnCurso grupos={[grupo({ sinTildar: 0 })]} plantilla={ingreso} />)).toContain('todos tildados')
  })

  it('🔴 `null` ⛔ no se dibuja: de ese hecho no se puede afirmar nada', () => {
    const html = pintar(<EnCurso grupos={[grupo({ sinTildar: null })]} plantilla={ingreso} />)
    expect(html).not.toContain('faltan')
    expect(html).not.toContain('todos tildados')
    // Pero el grupo sigue estando: perder el renglón sería peor que no contar lo que falta.
    expect(html).toContain('IMP2')
  })

  it('🔑 la tarjeta ⛔ no crece sola: muestra los últimos y cuenta el resto', () => {
    const muchos = ['a', 'b', 'c', 'd', 'e'].map((n) => grupo({ clave: n, nombre: `IMP${n}` }))
    const html = pintar(<EnCurso grupos={muchos} plantilla={ingreso} />)
    expect(html).toContain('IMPa')
    expect(html).not.toContain('IMPe')
    expect(html).toContain('y 2 anteriores')
  })
})
