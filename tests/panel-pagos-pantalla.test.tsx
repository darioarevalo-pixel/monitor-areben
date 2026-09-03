import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

/**
 * La pestaña "Pagos" del panel de WhatsApp, del lado de la pantalla.
 *
 * 🔑 **El oráculo es qué dice cuando todavía no sabe nada.** Es el mismo defecto que ya se pagó en
 * la lista del día (`crm-panel-agenda.test.tsx`): una pantalla que anuncia "no hay nada" mientras
 * en realidad no terminó de leer se lee como una buena noticia, y nadie la reporta.
 *
 * ⚠️ Es render, no interacción: `renderToStaticMarkup` no corre efectos, así que lo que se ve acá
 * es el primer pintado. Para los casos con datos se reemplazan los dos hooks, que son la única
 * puerta por la que esta pantalla habla con el servidor.
 */

const acreedores = vi.hoisted(() => ({ valor: { acreedores: [] as unknown[], aviso: null, cargando: false, error: null, recargar: () => {} } }))
const compromisos = vi.hoisted(() => ({
  valor: {
    compromisos: [] as unknown[],
    puede: { ver: true, prometer: true, confirmar: true },
    cargando: false,
    error: null,
    recargar: () => {},
  },
}))

vi.mock('@/components/acreedores/useAcreedores', () => ({ useAcreedores: () => acreedores.valor }))
vi.mock('@/components/acreedores/useCompromisos', () => ({ useCompromisos: () => compromisos.valor }))

const { Pagos } = await import('@/components/panel/Pagos')

// Cada caso arranca del mismo lugar: si no, el orden de los `it` decide el resultado.
beforeEach(() => {
  acreedores.valor = { acreedores: [], aviso: null, cargando: false, error: null, recargar: () => {} }
  compromisos.valor = {
    compromisos: [],
    puede: { ver: true, prometer: true, confirmar: true },
    cargando: false,
    error: null,
    recargar: () => {},
  }
})

const promesa = (extra: Record<string, unknown>) => ({
  id: 'x', acreedor_id: 'a1', acreedor_nombre: 'El contador',
  cuenta_alias: 'contador.mp', cuenta_cbu: null, cuenta_banco: null, cuenta_titular: null,
  cliente_id: '77', cliente_store: 'bdi', cliente_nombre: 'Nazarena Luciani', cliente_telefono: null,
  titular_real: null, monto: 120000, monto_confirmado: null, estado: 'prometido',
  fecha_prometida: null, notas: null, operacion_id: 'op', pagos_dashboard: null, viene_de: null,
  creado_en: '2026-09-01T10:00:00Z', creado_por: null, confirmado_en: null, confirmado_por: null,
  ...extra,
})

describe('Pagos · antes de tener los datos', () => {
  it('dice que está buscando, NO que no hay ninguna transferencia esperando', () => {
    compromisos.valor = { ...compromisos.valor, cargando: true }
    const html = renderToStaticMarkup(<Pagos cliente={null} onIrAlCliente={null} />)
    expect(html).toContain('Buscando')
    expect(html).not.toContain('No hay ninguna transferencia')
  })
})

describe('Pagos · la lista de trabajo', () => {
  it('🔑 pone arriba lo que falta confirmar, que es lo que depende de nosotros', () => {
    compromisos.valor = {
      ...compromisos.valor,
      compromisos: [
        promesa({ id: 'p', estado: 'prometido', monto: 50000, cliente_nombre: 'Cliente que promete' }),
        promesa({ id: 't', estado: 'transferido', monto: 80000, cliente_nombre: 'Cliente que transfirió' }),
      ],
    }
    const html = renderToStaticMarkup(<Pagos cliente={null} onIrAlCliente={null} />)
    expect(html.indexOf('Falta confirmar')).toBeGreaterThan(-1)
    expect(html.indexOf('Falta confirmar')).toBeLessThan(html.indexOf('Esperando que transfieran'))
    // Y el total es lo abierto de las dos listas juntas.
    expect(html).toContain('130.000')
  })

  it('sin chat abierto sigue mostrando la lista, y sólo se cae el formulario', () => {
    compromisos.valor = { ...compromisos.valor, compromisos: [promesa({})] }
    const html = renderToStaticMarkup(<Pagos cliente={null} onIrAlCliente={null} />)
    expect(html).toContain('Abrí el chat de un cliente')
    expect(html).toContain('Nazarena Luciani')
  })

  it('una promesa vencida lo dice con los días, no con la fecha cruda', () => {
    const ayer = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
    compromisos.valor = { ...compromisos.valor, compromisos: [promesa({ fecha_prometida: ayer })] }
    const html = renderToStaticMarkup(<Pagos cliente={null} onIrAlCliente={null} />)
    expect(html).toContain('vencida hace 1 día')
  })
})

describe('Pagos · los permisos los decide el servidor', () => {
  it('sin permiso de confirmar no aparece el botón que mueve plata', () => {
    compromisos.valor = {
      ...compromisos.valor,
      puede: { ver: true, prometer: true, confirmar: false },
      compromisos: [promesa({ estado: 'transferido' })],
    }
    const html = renderToStaticMarkup(<Pagos cliente={null} onIrAlCliente={null} />)
    expect(html).not.toContain('Ya entró')
    // Pero lo que no mueve plata sigue estando.
    expect(html).toContain('Se cayó')
  })

  it('sin permiso de ver no se dibuja nada de la lista', () => {
    compromisos.valor = {
      ...compromisos.valor,
      puede: { ver: false, prometer: false, confirmar: false },
      compromisos: [promesa({})],
    }
    const html = renderToStaticMarkup(<Pagos cliente={null} onIrAlCliente={null} />)
    expect(html).not.toContain('Nazarena Luciani')
    expect(html).toContain('Se activa en Usuarios')
  })
})

/**
 * El mayorista nuevo que compró y todavía no se cargó en Gestión Nube (Darío, 3-sep-2026).
 *
 * 🔑 Es el caso que antes no tenía camino: sin ficha no había cliente, y sin cliente no había
 * promesa — justo en el momento en que el cobro se arregla, que es la charla.
 */
describe('Pagos · el que todavía no está en el sistema', () => {
  const nuevo = { tipo: 'sin-cargar' as const, nombre: '', telefono: '5493624667485' }

  it('deja anotarle igual, pidiendo el nombre', () => {
    const html = renderToStaticMarkup(<Pagos cliente={nuevo} onIrAlCliente={null} />)
    expect(html).toContain('todavía no está en el sistema')
    expect(html).toContain('¿Cómo se llama?')
    expect(html).not.toContain('Abrí el chat de un cliente')
  })

  it('cuenta lo ya pedido por teléfono, que es la única llave que tiene', () => {
    compromisos.valor = {
      ...compromisos.valor,
      compromisos: [promesa({ cliente_id: null, cliente_telefono: '5493624667485', monto: 90000 })],
    }
    const html = renderToStaticMarkup(<Pagos cliente={nuevo} onIrAlCliente={null} />)
    expect(html).toContain('Ya le pedimos')
    expect(html).toContain('90.000')
  })

  it('la fila avisa que ese cliente no está cargado', () => {
    compromisos.valor = {
      ...compromisos.valor,
      compromisos: [promesa({ cliente_id: null, cliente_telefono: '5493624667485' })],
    }
    const html = renderToStaticMarkup(<Pagos cliente={null} onIrAlCliente={null} />)
    expect(html).toContain('todavía no está cargado en el sistema')
  })
})

describe('Pagos · reenganchar cuando el cliente por fin existe', () => {
  const enErp = { tipo: 'erp' as const, id: 77, nombre: 'Leire Veron', telefono: '5493624667485' }

  it('🔑 lo ofrece al abrir la ficha de ese mismo número', () => {
    compromisos.valor = {
      ...compromisos.valor,
      compromisos: [promesa({ cliente_id: null, cliente_telefono: '5493624667485', cliente_nombre: 'la chica de Resistencia' })],
    }
    const html = renderToStaticMarkup(<Pagos cliente={enErp} onIrAlCliente={null} />)
    expect(html).toContain('Se anotó antes de que estuviera cargado')
    expect(html).toContain('la chica de Resistencia')
    expect(html).toContain('Leire Veron')
  })

  it('no lo ofrece para una promesa de OTRO número', () => {
    compromisos.valor = {
      ...compromisos.valor,
      compromisos: [promesa({ cliente_id: null, cliente_telefono: '5491100000000' })],
    }
    const html = renderToStaticMarkup(<Pagos cliente={enErp} onIrAlCliente={null} />)
    expect(html).not.toContain('Se anotó antes de que estuviera cargado')
  })

  it('sin permiso de prometer no lo ofrece', () => {
    compromisos.valor = {
      ...compromisos.valor,
      puede: { ver: true, prometer: false, confirmar: true },
      compromisos: [promesa({ cliente_id: null, cliente_telefono: '5493624667485' })],
    }
    const html = renderToStaticMarkup(<Pagos cliente={enErp} onIrAlCliente={null} />)
    expect(html).not.toContain('Se anotó antes de que estuviera cargado')
  })
})

/**
 * `quienPaga` — de qué estado del panel sale quién va a transferir.
 *
 * ⚠️ **La trampa que cubre es cuál teléfono viaja.** Ese número es la llave con la que después se
 * reengancha la promesa: si viajara el del chat abierto cuando la ficha se pidió POR ID (se saltó
 * desde una fila de Pagos, o se eligió entre dos candidatos), se ofrecería vincular las promesas de
 * una persona a la ficha de otra.
 */
const { quienPaga } = await import('@/components/panel/PanelWhatsApp')

const ficha = (via: string, phone: string) =>
  ({ t: 'ficha', ficha: { cliente: { id: 77, name: 'Leire Veron', phone }, via } }) as never

describe('quienPaga', () => {
  it('un número desconocido es cobrable: sale como "sin cargar", con el teléfono del chat', () => {
    expect(quienPaga({ t: 'desconocido' } as never, '5493624667485')).toEqual({
      tipo: 'sin-cargar', nombre: '', telefono: '5493624667485',
    })
  })

  it('un prospecto ya cargado es el mismo caso, con su nombre puesto', () => {
    const lead = { t: 'lead', lead: { nombre: 'Leire', telefono: '3624667485' } } as never
    expect(quienPaga(lead, '5493624667485')).toMatchObject({ tipo: 'sin-cargar', nombre: 'Leire' })
  })

  it('un cliente de Gestión Nube viaja con su id y con el teléfono del chat', () => {
    expect(quienPaga(ficha('exacto', '3624667485'), '5493624667485')).toEqual({
      tipo: 'erp', id: 77, nombre: 'Leire Veron', telefono: '5493624667485',
    })
  })

  it('🔑 si la ficha se pidió POR ID manda el teléfono de la ficha, no el del chat abierto', () => {
    // Es el salto desde una fila de Pagos: el chat que quedó abierto puede ser el de otra persona.
    const r = quienPaga(ficha('id', '3624667485'), '5491100000000')
    expect(r).toMatchObject({ tipo: 'erp', id: 77 })
    expect(r?.telefono).not.toBe('5491100000000')
  })

  it('sin chat ni ficha no hay a quién pedirle', () => {
    expect(quienPaga({ t: 'cargando' } as never, '')).toBeNull()
    expect(quienPaga({ t: 'desconocido' } as never, '')).toBeNull()
  })
})

/**
 * A nombre de quién vino la transferencia, en el formulario de confirmar.
 *
 * 🔑 Se pregunta acá y no al prometer (Darío, 3-sep-2026): la promesa es del cliente, pero la plata
 * la manda muy seguido otro. Al confirmar se está mirando el extracto — el nombre se lee, no se
 * adivina. Y el caso normal tiene que salir apretando un botón: el default es el cliente.
 */
describe('Pagos · quién transfirió se pregunta al confirmar', () => {
  it('el default dice que transfirió el cliente, sin ningún campo que completar', () => {
    compromisos.valor = { ...compromisos.valor, compromisos: [promesa({ estado: 'transferido' })] }
    const html = renderToStaticMarkup(<Pagos cliente={null} onIrAlCliente={null} />)
    // El formulario está plegado hasta que se toca "Ya entró": lo que se ve es el botón.
    expect(html).toContain('Ya entró')
  })

  it('el formulario de anotar ya NO pregunta a nombre de quién', () => {
    const html = renderToStaticMarkup(
      <Pagos cliente={{ tipo: 'erp', id: 77, nombre: 'Nazarena', telefono: null }} onIrAlCliente={null} />,
    )
    expect(html).not.toContain('a nombre de otro')
  })
})
