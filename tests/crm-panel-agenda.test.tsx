import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AgendaDelDia, estable } from '@/components/panel/AgendaDelDia'

/**
 * La lista del día del panel, del lado de la pantalla.
 *
 * 🔑 **El oráculo es qué dice cuando todavía no sabe nada.** El defecto que motiva este test:
 * el panel leía el seguimiento sólo si había un chat abierto, así que al abrirse sin chat la lista
 * se armaba con el mapa vacío y anunciaba **"No hay nadie para contactar hoy"** con ~300 clientes
 * vencidos adentro. Nadie iba a reportar eso como un error: se lee como una buena noticia.
 *
 * ⚠️ Es render, no interacción: `renderToStaticMarkup` no corre efectos, así que lo que se ve acá
 * es exactamente el primer pintado — que es donde estaba el problema.
 */

const HOY = new Date('2026-08-23T12:00:00')
const nada = () => {}

describe('AgendaDelDia · antes de tener los datos', () => {
  it('dice que está cargando, NO que no hay nadie', () => {
    const html = renderToStaticMarkup(
      <AgendaDelDia crmSeg={{}} crmLeads={{}} today={HOY} onAbrirChat={nada} onVerFicha={nada} puedeAbrirChat />,
    )
    expect(html).toContain('Cargando')
    expect(html).not.toContain('No hay nadie')
  })

  it('tampoco anuncia una lista vacía cuando el mapa llegó vacío', () => {
    // Un mapa vacío puede ser "no hay nadie" o "no se pudo leer": desde acá no se distingue, y por
    // eso el panel espera a tener el KV antes de montar este componente (`kvListo`).
    const html = renderToStaticMarkup(
      <AgendaDelDia crmSeg={{}} crmLeads={{}} today={HOY} onAbrirChat={nada} onVerFicha={nada} puedeAbrirChat />,
    )
    expect(html).not.toContain('Para contactar')
  })
})

describe('AgendaDelDia · el aviso de estar fuera de la extensión', () => {
  it('no molesta con el cartel mientras está cargando', () => {
    const html = renderToStaticMarkup(
      <AgendaDelDia crmSeg={{}} crmLeads={{}} today={HOY} onAbrirChat={nada} onVerFicha={nada} puedeAbrirChat={false} />,
    )
    expect(html).not.toContain('fuera de WhatsApp')
  })
})

/**
 * La lista quieta (Darío, 15-oct-2026: *"tiene que ser estático salvo movimiento"*). Antes, registrarle
 * algo a uno rearmaba el orden y los renglones saltaban mientras se los miraba.
 */
describe('estable · la lista no se mueve sola', () => {
  type X = { k: string; dias: number }
  const porAtraso = (a: X, b: X) => a.dias - b.dias
  const clave = (x: X) => `t-estable:${x.k}`

  it('la primera vez ordena: el más atrasado arriba', () => {
    const r = estable([{ k: 'a', dias: -6 }, { k: 'b', dias: -50 }, { k: 'c', dias: -19 }], clave, porAtraso)
    expect(r.map((x) => x.k)).toEqual(['b', 'c', 'a'])
  })

  it('al salir uno, los demás no se corren; el que entra va al final aunque esté más atrasado', () => {
    // Mismo módulo que el test anterior: `b` ya salió (se le registró algo) y entra `d`.
    const r = estable([{ k: 'a', dias: -6 }, { k: 'c', dias: -19 }, { k: 'd', dias: -90 }], clave, porAtraso)
    expect(r.map((x) => x.k)).toEqual(['c', 'a', 'd'])
  })

  it('un cambio de días no reordena a quien ya tenía lugar', () => {
    const r = estable([{ k: 'a', dias: -100 }, { k: 'c', dias: -1 }], clave, porAtraso)
    expect(r.map((x) => x.k)).toEqual(['c', 'a'])
  })
})
