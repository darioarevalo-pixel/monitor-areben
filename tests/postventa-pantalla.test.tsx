// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Postventa } from '@/components/postventa/Postventa'
import { SesionProvider } from '@/components/SesionProvider'
import { avisosDeReclamo } from '@/lib/notificaciones/derivar'
import type { Perfil } from '@/lib/permisos'
import type { ReclamoRow } from '@/lib/reclamos/tipos'

/**
 * 🔴 **La otra mitad del aviso de reclamos: que la pantalla abra donde el aviso la manda.**
 *
 * `tests/postventa-tab.test.ts` fija la función pura; esto fija **el cable**. Sin este archivo, la
 * pantalla podía volver a `useState` —o ignorar la URL— con los dos lados en verde: el aviso
 * seguiría diciendo `?tab=reclamos` y la persona seguiría cayendo en el ledger de Fallas. Es
 * exactamente el agujero que este módulo ya tuvo dos veces, siempre en el medio: el permiso bien,
 * el handler bien, y nada que apretar.
 *
 * 🔑 **`renderToStaticMarkup` alcanza y es el oráculo justo**: no corre `useEffect`, así que no
 * pide nada a la API — lo único que se mira es qué pestaña queda elegida en el primer cuadro, que
 * es lo que la persona ve al llegar desde el aviso.
 *
 * ⚠️ Va en `jsdom` (el resto de la suite es `node`) porque `useFiltroUrl` lee
 * `window.location.search`: sin `window` devolvería siempre el inicial y este test no podría
 * distinguir el arreglo del defecto.
 */
const pintar = (url: string) => {
  window.history.replaceState(null, '', url)
  return renderToStaticMarkup(<SesionProvider><Postventa /></SesionProvider>)
}

/** La pestaña elegida, tal como la marca la barra de pills. */
const elegida = (html: string) =>
  [...html.matchAll(/aria-selected="(true|false)"[^>]*>([^<]+)</g)].find((m) => m[1] === 'true')?.[2] ?? null

describe('Post-venta abre en la pestaña que dice la URL', () => {
  // ⚠️ Cambiado a propósito el 27-ago-2026: la revisión con Administración pidió Reclamos primero,
  // y el aterrizaje sigue al orden. Antes de ese día abría en Fallas.
  it('sin `?tab=` abre en Reclamos, que es la primera pestaña', () => {
    expect(elegida(pintar('/postventa'))).toBe('Reclamos')
  })

  // 🔑 Fallas dejó de ser el default, ⛔ no dejó de existir: el link guardado tiene que seguir yendo.
  it('`?tab=fallas` sigue abriendo en Fallas', () => {
    expect(elegida(pintar('/postventa?tab=fallas'))).toBe('Fallas')
  })

  it('🔴 `?tab=reclamos` abre en Reclamos: antes la pestaña vivía en `useState` y esto era imposible', () => {
    expect(elegida(pintar('/postventa?tab=reclamos'))).toBe('Reclamos')
  })

  it('`?tab=cambios` abre en Cambios', () => {
    expect(elegida(pintar('/postventa?tab=cambios'))).toBe('Cambios')
  })

  it('⚠️ una pestaña inventada cae en la primera, ⛔ no en «undefined llega más adelante»', () => {
    const html = pintar('/postventa?tab=cualquiera')
    expect(elegida(html)).toBe('Reclamos')
    expect(html).not.toContain('undefined')
  })

  it('🔑 el invariante de punta a punta: la URL que pone el aviso es la que abre Reclamos', () => {
    const dormido = {
      id: 42, store: 'bdi', motivo: 'falla', estado: 'esperando_cliente',
      created_at: new Date(Date.now() - 30 * 86400000).toISOString(), historial: [],
    } as unknown as ReclamoRow
    const admin = { name: 'ana', admin: true, acceso: {}, funcion: [] } as unknown as Perfil
    const { ruta } = avisosDeReclamo([dormido], 'bdi', admin)[0]
    expect(elegida(pintar(ruta))).toBe('Reclamos')
  })
})
