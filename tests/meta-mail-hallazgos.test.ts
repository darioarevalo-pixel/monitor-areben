import { describe, expect, it } from 'vitest'
// Núcleo en JS plano: lo importan el cron (`.mjs`) y estos tests, y ⛔ no la app — el mail no se
// arma en el navegador, así que no hay `.ts` que lo envuelva.
import { armarMail, asuntoDe, haceCuanto, ordenar } from '@/lib/meta-ads/mail-hallazgos.core.js'

/**
 * El mail de la mañana. Todo lo que este archivo produce es TEXTO, así que todo lo que se puede
 * romper acá se rompe en silencio: un mail que llega igual, dice otra cosa, y nadie compara.
 *
 * Lo que se ancla:
 *   - **van los ABIERTOS y no los de hoy** — la decisión que ordena el mail entero;
 *   - **con cero, ⛔ no se manda nada** — un mail diario que dice «no hay nada» enseña a no abrirlo;
 *   - el asunto lleva **cuántas** y **si alguna quema**, que es lo que se lee sin abrir el mail;
 *   - el «hace N días» se cuenta desde `desde`, ⛔ no desde `fecha`.
 */

const HOY = '2026-08-26'

const pausar = { accion: 'estado', objetoId: '1', nivel: 'conjunto', status: 'PAUSED' }
const reactivar = { accion: 'estado', objetoId: '1', nivel: 'conjunto', status: 'ACTIVE' }
const subir = { accion: 'presupuesto', objetoId: '1', nivel: 'conjunto', daily_budget: '900000', desdeCrudo: 750000 }

const h = (over: Record<string, unknown> = {}) => ({
  regla_id: 3, objeto_id: '1201', objeto_nombre: 'GIRLHOOD FRIO', linea: 'bdi',
  fecha: HOY, desde: HOY, veces: 1,
  motivo: 'Compra a $ 10.426 contra un techo de $ 6.668 —el 156%— en 5 días.',
  sugerencia: pausar, ...over,
})

describe('el mail de la mañana — cuándo NO se manda', () => {
  it('🔑 con cero hallazgos ⛔ no se manda nada: un mail diario que dice «no hay nada» enseña a no abrirlo', () => {
    expect(armarMail([], HOY)).toBeNull()
    expect(armarMail(null as unknown as unknown[], HOY)).toBeNull()
  })
})

describe('el mail de la mañana — el asunto, que es lo que se lee sin abrirlo', () => {
  it('dice cuántas son', () => {
    expect(asuntoDe([h({ sugerencia: null })])).toBe('Pauta · 1 cosa para decidir')
    expect(asuntoDe([h({ sugerencia: null }), h({ sugerencia: null })])).toBe('Pauta · 2 cosas para decidir')
  })

  it('🔴 y si alguna está QUEMANDO plata, lo dice ahí: es lo que decide si se abre ahora o después', () => {
    expect(asuntoDe([h(), h({ sugerencia: reactivar })])).toBe('Pauta · 2 cosas para decidir, 1 quemando plata')
    expect(asuntoDe([h(), h()])).toBe('Pauta · 2 cosas para decidir, 2 quemando plata')
  })

  it('⛔ pausar es lo único que quema: reactivar y subir presupuesto es plata que se deja de ganar', () => {
    expect(asuntoDe([h({ sugerencia: reactivar }), h({ sugerencia: subir })])).toBe('Pauta · 2 cosas para decidir')
  })
})

describe('el mail de la mañana — hace cuánto', () => {
  it('🔴 se cuenta desde `desde`, ⛔ no desde `fecha`: la regla reescribe `fecha` todas las mañanas', () => {
    // Mismo renglón de hoy, pero gritando desde el 22. Con `fecha` diría «hoy» todos los días.
    expect(haceCuanto(h({ fecha: HOY, desde: '2026-08-22' }), HOY)).toBe('hace 4 días')
  })

  it('hoy, ayer y los días', () => {
    expect(haceCuanto(h({ desde: HOY }), HOY)).toBe('hoy')
    expect(haceCuanto(h({ desde: '2026-08-25' }), HOY)).toBe('desde ayer')
    expect(haceCuanto(h({ desde: '2026-08-19' }), HOY)).toBe('hace 7 días')
  })

  it('sin `desde` cae en `fecha`, ⛔ no rompe: es lo que devuelve una fila vieja', () => {
    expect(haceCuanto({ fecha: '2026-08-24', desde: undefined }, HOY)).toBe('hace 2 días')
  })

  it('una fecha del futuro ⛔ no imprime «hace -2 días»', () => {
    expect(haceCuanto(h({ desde: '2026-08-28' }), HOY)).toBe('hoy')
  })
})

describe('el mail de la mañana — el orden de lectura', () => {
  it('🔴 primero lo que cuesta plata AHORA, y lo que no propone nada antes que la oportunidad', () => {
    const orden = ordenar([
      h({ objeto_id: 'op', sugerencia: reactivar }),
      h({ objeto_id: 'mirar', sugerencia: null }),
      h({ objeto_id: 'quema', sugerencia: pausar }),
    ], HOY)
    expect(orden.map((x: { objeto_id: string }) => x.objeto_id)).toEqual(['quema', 'mirar', 'op'])
  })

  it('a igual gravedad, el que lleva MÁS tiempo esperando va arriba', () => {
    const orden = ordenar([
      h({ objeto_id: 'nuevo', desde: HOY }),
      h({ objeto_id: 'viejo', desde: '2026-08-20' }),
    ], HOY)
    expect(orden.map((x: { objeto_id: string }) => x.objeto_id)).toEqual(['viejo', 'nuevo'])
  })
})

describe('el mail de la mañana — el cuerpo', () => {
  it('lleva la frase ya redactada, la línea, hace cuánto, qué propone y el link CON la línea', () => {
    const m = armarMail([h({ desde: '2026-08-22' })], HOY)!
    expect(m.texto).toContain('GIRLHOOD FRIO')
    expect(m.texto).toContain('BDI')
    expect(m.texto).toContain('hace 4 días')
    expect(m.texto).toContain('156%')
    expect(m.texto).toContain('→ pausarlo')
    expect(m.texto).toContain('/meta-ads?linea=bdi')
  })

  it('🔴 dice la acción REAL, ⛔ no siempre «pausalo»: el error caro es apagar lo que hay que reactivar', () => {
    expect(armarMail([h({ sugerencia: reactivar })], HOY)!.texto).toContain('→ reactivarlo')
    expect(armarMail([h({ sugerencia: reactivar })], HOY)!.texto).not.toContain('pausarlo')
    expect(armarMail([h({ sugerencia: subir })], HOY)!.texto).toContain('→ subirle el presupuesto')
  })

  it('el que no propone nada lo DICE: si no, se lee como un renglón al que le falta el botón', () => {
    expect(armarMail([h({ sugerencia: null })], HOY)!.texto).toContain('no propone nada')
  })

  it('🔑 Stunned manda a su propia línea, ⛔ no a la de Zattia, aunque los permisos cuelguen de ahí', () => {
    const m = armarMail([h({ linea: 'stunned' })], HOY)!
    expect(m.texto).toContain('/meta-ads?linea=stunned')
    expect(m.texto).toContain('Stunned')
  })

  it('sin nombre cae en el id: ⛔ un renglón sin título es uno que no se puede buscar en Meta', () => {
    expect(armarMail([h({ objeto_nombre: null })], HOY)!.texto).toContain('1201')
  })

  it('el HTML escapa lo que viene de Meta: un nombre de conjunto con `<` ⛔ no arma etiqueta', () => {
    const m = armarMail([h({ objeto_nombre: 'PROMO <b>50%</b> & MÁS' })], HOY)!
    expect(m.html).toContain('PROMO &lt;b&gt;50%&lt;/b&gt; &amp; MÁS')
    expect(m.html).not.toContain('<b>50%')
  })

  it('el pie dice de dónde salió y cómo se vacía', () => {
    const m = armarMail([h()], HOY)!
    expect(m.texto).toContain('07:50')
    expect(m.texto).toContain('accionando')
  })
})
