import { describe, expect, it } from 'vitest'
import { tabDeLaUrl } from '@/components/postventa/Postventa'
import { avisosDeReclamo } from '@/lib/notificaciones/derivar'
import type { Perfil } from '@/lib/permisos'
import type { ReclamoRow } from '@/lib/reclamos/tipos'

/**
 * 🔴 **La pestaña de Post-venta vivía en `useState`**, así que `/postventa` abría siempre en
 * Fallas y no había forma de mandar a nadie a Reclamos. Importa acá y no sólo en la pantalla
 * porque es lo que hace que el aviso del sidebar **llegue a algún lado**: un aviso que deja a la
 * persona parada en otra pestaña se lee igual que uno que nadie miró.
 */
describe('la pestaña de Post-venta viene de la URL', () => {
  it('la pestaña que el aviso pide es una pestaña de verdad', () => {
    const dormido = {
      id: 42, store: 'bdi', motivo: 'falla', estado: 'esperando_cliente',
      created_at: new Date(Date.now() - 30 * 86400000).toISOString(), historial: [],
    } as unknown as ReclamoRow
    const admin = { name: 'ana', admin: true, acceso: {}, funcion: [] } as unknown as Perfil
    const { ruta } = avisosDeReclamo([dormido], 'bdi', admin)[0]
    // 🔑 El invariante: lo que el aviso pone en la URL es lo que la pantalla abre. Sin esto los dos
    // lados pueden cambiar por separado y el aviso cae en Fallas sin que nada falle.
    expect(tabDeLaUrl(new URL(ruta, 'https://x').searchParams.get('tab'))).toBe('reclamos')
  })

  it('sin `?tab=` abre en Fallas, que es donde abría siempre', () => {
    expect(tabDeLaUrl(null)).toBe('fallas')
    expect(tabDeLaUrl(undefined)).toBe('fallas')
    expect(tabDeLaUrl('')).toBe('fallas')
  })

  it('⚠️ una pestaña inventada vuelve a Fallas: antes titulaba «undefined llega más adelante»', () => {
    expect(tabDeLaUrl('cualquiera')).toBe('fallas')
  })

  it('`canjes` SÍ es una pestaña —todavía no lista— y sigue mostrando su cartel', () => {
    expect(tabDeLaUrl('canjes')).toBe('canjes')
  })

  it('cambios también se puede pedir por la URL', () => {
    expect(tabDeLaUrl('cambios')).toBe('cambios')
  })
})
