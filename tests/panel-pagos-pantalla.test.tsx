import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { hoyISO } from '@/lib/crm/seguimiento'

/**
 * ⚠️ **"Ayer" se calcula con la MISMA función de fecha que usa la pantalla.**
 *
 * Estaba con `new Date(...).toISOString()`, que da el día en **UTC**, contra un componente que
 * compara con `hoyISO()`, que da el día **local**. Las dos fechas coinciden sólo si la máquina
 * corre en UTC: el CI sí, una Mac en Argentina no. O sea que el test pasaba en el CI y se caía en
 * la máquina de acá, y el que lo veía en rojo no tenía forma de saber que no era su cambio.
 */
const AYER = hoyISO(new Date(Date.now() - 86_400_000))

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

const acreedores = vi.hoisted(() => ({
  valor: {
    acreedores: [] as unknown[],
    aviso: null as string | null,
    cargando: false,
    recargando: false,
    error: null as string | null,
    recargar: () => {},
  },
}))
const compromisos = vi.hoisted(() => ({
  valor: {
    compromisos: [] as unknown[],
    puede: { ver: true, prometer: true, confirmar: true },
    cargando: false,
    recargando: false,
    error: null as string | null,
    recargar: () => {},
  },
}))

vi.mock('@/components/acreedores/useAcreedores', () => ({ useAcreedores: () => acreedores.valor }))
vi.mock('@/components/acreedores/useCompromisos', () => ({ useCompromisos: () => compromisos.valor }))

const { Pagos } = await import('@/components/panel/Pagos')

// Cada caso arranca del mismo lugar: si no, el orden de los `it` decide el resultado.
beforeEach(() => {
  acreedores.valor = {
    acreedores: [], aviso: null, cargando: false, recargando: false, error: null, recargar: () => {},
  }
  compromisos.valor = {
    compromisos: [],
    puede: { ver: true, prometer: true, confirmar: true },
    cargando: false,
    recargando: false,
    error: null,
    recargar: () => {},
  }
})

const compromiso = (extra: Record<string, unknown>) => ({
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
  it('🔑 una sola lista de Pedidos, y un `transferido` viejo entra en ella (25-sep-2026)', () => {
    compromisos.valor = {
      ...compromisos.valor,
      compromisos: [
        compromiso({ id: 'p', estado: 'prometido', monto: 50000, cliente_nombre: 'Cliente que compromete' }),
        compromiso({ id: 't', estado: 'transferido', monto: 80000, cliente_nombre: 'Cliente que transfirió' }),
      ],
    }
    const html = renderToStaticMarkup(<Pagos cliente={null} onIrAlCliente={null} />)
    expect(html).toContain('Pedidos')
    expect(html).not.toContain('Falta confirmar')
    expect(html).toContain('Cliente que transfirió')
    // Y el total es todo lo abierto.
    expect(html).toContain('130.000')
  })

  it('sin chat abierto sigue mostrando la lista, y sólo se cae el formulario', () => {
    compromisos.valor = { ...compromisos.valor, compromisos: [compromiso({})] }
    const html = renderToStaticMarkup(<Pagos cliente={null} onIrAlCliente={null} />)
    expect(html).toContain('Abrí el chat de un cliente')
    expect(html).toContain('Nazarena Luciani')
  })

  it('un compromiso vencida lo dice con los días, no con la fecha cruda', () => {
    compromisos.valor = { ...compromisos.valor, compromisos: [compromiso({ fecha_prometida: AYER })] }
    const html = renderToStaticMarkup(<Pagos cliente={null} onIrAlCliente={null} />)
    expect(html).toContain('vencida hace 1 día')
  })
})

describe('Pagos · los permisos los decide el servidor', () => {
  it('sin permiso de confirmar no aparece el botón que mueve plata', () => {
    compromisos.valor = {
      ...compromisos.valor,
      puede: { ver: true, prometer: true, confirmar: false },
      compromisos: [compromiso({ estado: 'transferido' })],
    }
    const html = renderToStaticMarkup(<Pagos cliente={null} onIrAlCliente={null} />)
    expect(html).not.toContain('title="Confirmar"')
    // Pero lo que no mueve plata sigue estando.
    expect(html).toContain('title="Cancelar"')
  })

  it('sin permiso de ver no se dibuja nada de la lista', () => {
    compromisos.valor = {
      ...compromisos.valor,
      puede: { ver: false, prometer: false, confirmar: false },
      compromisos: [compromiso({})],
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
 * compromiso — justo en el momento en que el cobro se arregla, que es la charla.
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
      compromisos: [compromiso({ cliente_id: null, cliente_telefono: '5493624667485', monto: 90000 })],
    }
    const html = renderToStaticMarkup(<Pagos cliente={nuevo} onIrAlCliente={null} />)
    expect(html).toContain('Ya le pedimos')
    expect(html).toContain('90.000')
  })

  it('la fila avisa que ese cliente no está cargado', () => {
    compromisos.valor = {
      ...compromisos.valor,
      compromisos: [compromiso({ cliente_id: null, cliente_telefono: '5493624667485' })],
    }
    const html = renderToStaticMarkup(<Pagos cliente={null} onIrAlCliente={null} />)
    expect(html).toContain('sin cargar en el sistema')
  })
})

describe('Pagos · reenganchar cuando el cliente por fin existe', () => {
  const enErp = { tipo: 'erp' as const, id: 77, nombre: 'Leire Veron', telefono: '5493624667485' }

  it('🔑 lo ofrece al abrir la ficha de ese mismo número', () => {
    compromisos.valor = {
      ...compromisos.valor,
      compromisos: [compromiso({ cliente_id: null, cliente_telefono: '5493624667485', cliente_nombre: 'la chica de Resistencia' })],
    }
    const html = renderToStaticMarkup(<Pagos cliente={enErp} onIrAlCliente={null} />)
    expect(html).toContain('Se anotó antes de que estuviera cargado')
    expect(html).toContain('la chica de Resistencia')
    expect(html).toContain('Leire Veron')
  })

  it('no lo ofrece para un compromiso de OTRO número', () => {
    compromisos.valor = {
      ...compromisos.valor,
      compromisos: [compromiso({ cliente_id: null, cliente_telefono: '5491100000000' })],
    }
    const html = renderToStaticMarkup(<Pagos cliente={enErp} onIrAlCliente={null} />)
    expect(html).not.toContain('Se anotó antes de que estuviera cargado')
  })

  it('sin permiso de comprometer no lo ofrece', () => {
    compromisos.valor = {
      ...compromisos.valor,
      puede: { ver: true, prometer: false, confirmar: true },
      compromisos: [compromiso({ cliente_id: null, cliente_telefono: '5493624667485' })],
    }
    const html = renderToStaticMarkup(<Pagos cliente={enErp} onIrAlCliente={null} />)
    expect(html).not.toContain('Se anotó antes de que estuviera cargado')
  })
})

/**
 * `quienPaga` — de qué estado del panel sale quién va a transferir.
 *
 * ⚠️ **La trampa que cubre es cuál teléfono viaja.** Ese número es la llave con la que después se
 * reengancha el compromiso: si viajara el del chat abierto cuando la ficha se pidió POR ID (se saltó
 * desde una fila de Pagos, o se eligió entre dos candidatos), se ofrecería vincular los compromisos de
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
 * ⛔ **A nombre de quién vino la transferencia ya no se pregunta** (21-sep-2026).
 *
 * Existió del 3 al 21 de septiembre y lo mandó a sacar el mismo que lo había pedido, con la
 * medición delante: **0 de 9 confirmaciones lo llenaron**. *"No me interesa quién la manda, sino
 * qué cliente mandó, porque luego conozco bien el comprobante cuando entro al chat"* (Darío).
 *
 * 🔑 Los dos formularios de confirmar —el del panel y el de la sección— tienen que quedar pidiendo
 * lo mismo. Que el parámetro no exista en `confirmarCompromiso` es lo que lo garantiza; el
 * servidor además lo ignora si llega (`tests/compromisos-handler.test.ts`).
 */
describe('Pagos · confirmar pide el monto y el día, y nada más', () => {
  it('el formulario de confirmar no pregunta a nombre de quién vino', () => {
    compromisos.valor = { ...compromisos.valor, compromisos: [compromiso({ estado: 'transferido' })] }
    const html = renderToStaticMarkup(<Pagos cliente={null} onIrAlCliente={null} />)
    // El formulario está plegado hasta que se toca "Confirmar": lo que se ve es el botón.
    expect(html).toContain('title="Confirmar"')
    expect(html).not.toContain('a nombre de otro')
    expect(html).not.toContain('vino a nombre')
  })

  it('el formulario de anotar tampoco', () => {
    const html = renderToStaticMarkup(
      <Pagos cliente={{ tipo: 'erp', id: 77, nombre: 'Nazarena', telefono: null }} onIrAlCliente={null} />,
    )
    expect(html).not.toContain('a nombre de otro')
  })

  /**
   * ⚠️ Se le pasa un `titular_real` cargado **a propósito**, que es lo que hay en las filas viejas
   * del que lo haya llenado alguna vez: la fila no lo dibuja igual. Sin esto, el test pasaría sólo
   * porque el dato no está en los datos de prueba.
   */
  it('⛔ y una fila con titular viejo no lo dibuja', () => {
    compromisos.valor = {
      ...compromisos.valor,
      compromisos: [compromiso({ titular_real: 'Gabriel Sosa' })],
    }
    const html = renderToStaticMarkup(<Pagos cliente={null} onIrAlCliente={null} />)
    expect(html).not.toContain('Gabriel Sosa')
    // Lo que sí dice la fila es a qué cuenta va, que es lo que no repite ningún título.
    expect(html).toContain('le transfiere a El contador')
  })
})

/**
 * Las cerradas: de qué cliente era, y poder saltar a su chat.
 *
 * 🔑 **El oráculo es para qué se mira una cerrada**: *"me interesa qué cliente mandó, porque luego
 * conozco bien el comprobante cuando entro al chat"* (Darío, 21-sep-2026). O sea que el nombre no
 * es un dato de contexto, es el punto de partida — y hasta acá era texto muerto.
 *
 * ⚠️ La lista vive detrás de "Ver cerrados (N)" y `renderToStaticMarkup` no hace clic,
 * así que lo que se puede fijar desde acá es el disparador y su cuenta.
 */
describe('Pagos · las cerradas', () => {
  it('no se muestran solas: ocupan lugar y no son trabajo de hoy', () => {
    compromisos.valor = {
      ...compromisos.valor,
      compromisos: [compromiso({ id: 'a', estado: 'confirmado' }), compromiso({ id: 'b', estado: 'cancelado' })],
    }
    const html = renderToStaticMarkup(<Pagos cliente={null} onIrAlCliente={null} />)
    expect(html).toContain('Ver cerrados (2)')
    // Y el vacío de arriba sigue diciendo lo suyo: cerradas no son plata esperando.
    expect(html).toContain('No hay pedidos abiertos')
  })

  it('sin ninguna cerrada, no hay disparador', () => {
    compromisos.valor = { ...compromisos.valor, compromisos: [compromiso({})] }
    const html = renderToStaticMarkup(<Pagos cliente={null} onIrAlCliente={null} />)
    expect(html).not.toContain('Ver cerrados')
  })
})

/**
 * Las decisiones de la pasada de diseño del 3-sep-2026, que son de jerarquía y no de gusto.
 * Darío: *"la vista está demasiado plana"* — y lo estaba porque todo pesaba lo mismo.
 */
describe('Pagos · la jerarquía de la pantalla', () => {
  it('sin chat abierto, anotar NO se lleva el lugar de honor', () => {
    // Una tarjeta grande con título en versalitas, para avisar que no se puede hacer nada, era el
    // peor uso posible de la primera pantalla. Sin cliente se encoge a un renglón.
    compromisos.valor = { ...compromisos.valor, compromisos: [compromiso({})] }
    const html = renderToStaticMarkup(<Pagos cliente={null} onIrAlCliente={null} />)
    expect(html).not.toContain('Que le pague a un acreedor')
    expect(html).toContain('Abrí el chat de un cliente')
  })

  it('con chat abierto sí, porque ahí hay algo que hacer', () => {
    const html = renderToStaticMarkup(
      <Pagos cliente={{ tipo: 'erp', id: 77, nombre: 'Nazarena', telefono: null }} onIrAlCliente={null} />,
    )
    expect(html).toContain('Que transfiera a una cuenta nuestra')
  })

  it('🔑 el tilde es el único lleno: es el que lleva a escribir plata en otro sistema', () => {
    compromisos.valor = { ...compromisos.valor, compromisos: [compromiso({})] }
    const html = renderToStaticMarkup(<Pagos cliente={null} onIrAlCliente={null} />)
    // El kit pinta el relleno con --_fg:#fff; la cruz es un outline sobre la superficie.
    const hastaElTilde = html.slice(0, html.indexOf('title="Confirmar"'))
    expect(hastaElTilde).toContain('--_fg:#fff')
    expect(html).toContain('title="Cancelar"')
  })

  /**
   * ⛔ El escalón del medio lo sacó Darío el 3-sep-2026: *"lo del dice que transfirió no sirve, lo
   * sacaría"*. Era un clic que no cambiaba nada — si te dice que transfirió, vas al banco y
   * confirmás. El ESTADO sigue existiendo (la sección grande lo usa); lo que no está es el botón.
   */
  it('la fila no ofrece el escalón del medio: sólo tilde y cruz', () => {
    compromisos.valor = { ...compromisos.valor, compromisos: [compromiso({})] }
    const html = renderToStaticMarkup(<Pagos cliente={null} onIrAlCliente={null} />)
    expect(html).not.toContain('Dice que transfirió')
    expect(html).not.toContain('No era')
    expect(html).toContain('title="Confirmar"')
    expect(html).toContain('title="Cancelar"')
  })

  /**
   * 🔑 **Y el rótulo NOMBRA de quién es la fila** (VOCABULARIO §3.3, 21-sep-2026). El `title` —el
   * globito del mouse— lleva la frase sola, que es lo que hacía falta cuando se sacó la etiqueta.
   * El `aria-label` no alcanza con eso: el que no ve la pantalla recorre ocho filas y escucha ocho
   * veces "Confirmar", sin ninguna manera de saber cuál está tocando.
   */
  it('⚠️ los íconos llevan la frase entera, y el rótulo dice de quién es la fila', () => {
    compromisos.valor = { ...compromisos.valor, compromisos: [compromiso({})] }
    const html = renderToStaticMarkup(<Pagos cliente={null} onIrAlCliente={null} />)
    expect(html).toContain('title="Confirmar"')
    expect(html).toContain('title="Cancelar"')
    expect(html).toContain('aria-label="Confirmar lo de «Nazarena Luciani»"')
    expect(html).toContain('aria-label="Cancelar lo de «Nazarena Luciani»"')
  })

  it('un compromiso marcada desde la sección igual se puede confirmar acá', () => {
    // Sacar el botón no puede dejar huérfano al estado que la otra pantalla sí produce.
    compromisos.valor = { ...compromisos.valor, compromisos: [compromiso({ estado: 'transferido' })] }
    const html = renderToStaticMarkup(<Pagos cliente={null} onIrAlCliente={null} />)
    expect(html).toContain('Pedidos')
    expect(html).toContain('title="Confirmar"')
  })

  it('sin nada esperando muestra un vacío que ocupa lugar, no un renglón gris', () => {
    const html = renderToStaticMarkup(<Pagos cliente={null} onIrAlCliente={null} />)
    expect(html).toContain('No hay pedidos abiertos')
  })
})

/**
 * La segunda vista de la pestaña (pedida por Darío el 3-sep-2026). Son dos preguntas distintas:
 * *"¿quién me tiene que pagar?"* y *"¿a quién le debemos y a qué alias?"*.
 */
describe('Pagos · la vista de acreedores', () => {
  it('el selector está, y arranca en compromisos', () => {
    const html = renderToStaticMarkup(<Pagos cliente={null} onIrAlCliente={null} />)
    expect(html).toContain('A quién le debemos')
    expect(html).toContain('No hay pedidos abiertos')  // el vacío de compromisos, no el de acreedores
  })
})

/**
 * Lo que se podó el 3-sep-2026, y por qué cada cosa: *"veo aclaraciones vacías o con poca
 * información que hacen que la vista sea más larga"*.
 */
describe('Pagos · lo que ya no se dibuja', () => {
  it('⛔ la chapa de estado no repite el título de la sección', () => {
    compromisos.valor = { ...compromisos.valor, compromisos: [compromiso({})] }
    const html = renderToStaticMarkup(<Pagos cliente={null} onIrAlCliente={null} />)
    expect(html).toContain('Pedidos')
    expect(html).not.toContain('>Pedido<')
  })

  it('⛔ "sin fecha" no se dibuja: una ausencia no es un dato', () => {
    compromisos.valor = { ...compromisos.valor, compromisos: [compromiso({ fecha_prometida: null })] }
    const html = renderToStaticMarkup(<Pagos cliente={null} onIrAlCliente={null} />)
    expect(html).not.toContain('sin fecha')
  })

  it('⛔ el alias no va en la fila: vive en la vista de acreedores, que es donde se usa', () => {
    compromisos.valor = { ...compromisos.valor, compromisos: [compromiso({ cuenta_alias: 'contador.arbn' })] }
    const html = renderToStaticMarkup(<Pagos cliente={null} onIrAlCliente={null} />)
    expect(html).not.toContain('contador.arbn')
  })

  it('✅ pero lo vencido SÍ se dice: eso no lo cuenta ningún título y cambia todos los días', () => {
    compromisos.valor = { ...compromisos.valor, compromisos: [compromiso({ fecha_prometida: AYER })] }
    const html = renderToStaticMarkup(<Pagos cliente={null} onIrAlCliente={null} />)
    expect(html).toContain('vencida hace 1 día')
  })
})

/**
 * 🔴 **Los tres estados de "no hay nada", que no son el mismo.**
 *
 * Es el oráculo declarado al principio de este archivo, ejercido sobre la otra mitad de la pestaña:
 * **una pantalla que anuncia "no hay nada" cuando en realidad no pudo leer es una buena noticia
 * falsa, y nadie la reporta.** Faltaba mirar el tercer estado: cuando el dashboard no contesta,
 * `leerAcreedores` NO tira — devuelve la lista vacía y el motivo en `aviso`, así que `error` viene
 * en `null` y el vacío se leía como "no le debemos nada a nadie".
 */
const { VistaAcreedores } = await import('@/components/panel/Pagos')

describe('Pagos · el dashboard caído no se cuenta como "no hay deudas"', () => {
  // ⚠️ Se monta la vista directo: la pestaña arranca en "Compromisos" y al chip de "A quién le
  // debemos" no se le puede hacer clic desde un render estático. De paso queda cubierta, que hasta
  // hoy no lo estaba — y era justo donde vivía el cartel equivocado.
  const vista = (props: { acreedores?: unknown[]; manuales?: unknown[]; error?: string | null; aviso?: string | null }) =>
    renderToStaticMarkup(
      <VistaAcreedores
        acreedores={(props.acreedores ?? []) as never}
        manuales={(props.manuales ?? []) as never}
        compromisos={[]}
        cargando={false}
        error={props.error ?? null}
        aviso={props.aviso ?? null}
      />,
    )

  it('🔑 con aviso del dashboard dice que no se pudo leer, NO que no hay deudas', () => {
    const html = vista({ aviso: 'El dashboard no respondió.' })
    expect(html).toContain('No se pudo leer a quién le debemos')
    expect(html).not.toContain('No hay ninguna deuda con acreedores ahora')
  })

  it('sin deudas de verdad —sin aviso ni error— sí dice que no hay', () => {
    const html = vista({})
    expect(html).toContain('No hay ninguna deuda con acreedores ahora')
    expect(html).not.toContain('No se pudo leer a quién le debemos')
  })

  it('el aviso también frena el formulario de anotar, con el chat abierto', () => {
    acreedores.valor = { ...acreedores.valor, acreedores: [], aviso: 'El dashboard no respondió.' }
    const html = renderToStaticMarkup(
      <Pagos cliente={{ tipo: 'erp', id: 77, nombre: 'Nazarena', telefono: null }} onIrAlCliente={null} />,
    )
    expect(html).toContain('no se puede anotar un compromiso nuevo')
  })
})

/**
 * ⚠️ **Un refresco no borra la pantalla.**
 *
 * `cargando` quería decir "estoy pidiendo" y se prendía en cada recarga — y como cada confirmar,
 * cancelar o anotar dispara una, la pestaña entera se reemplazaba por "Buscando…", incluido el
 * cartel de "Listo" que acababa de aparecer. Ahora quiere decir "todavía no tengo nada que
 * mostrar", que es lo único que justifica tapar lo que ya está en pantalla.
 */
describe('Pagos · un refresco no borra lo que ya se está mostrando', () => {
  it('🔑 con datos en pantalla, una recarga deja la lista donde estaba', () => {
    compromisos.valor = { ...compromisos.valor, compromisos: [compromiso({})], cargando: true }
    const html = renderToStaticMarkup(<Pagos cliente={null} onIrAlCliente={null} />)
    expect(html).toContain('Nazarena Luciani')
    expect(html).not.toContain('Buscando los compromisos')
  })

  it('pero la primera vez, sin nada que mostrar, sí avisa que está buscando', () => {
    compromisos.valor = { ...compromisos.valor, compromisos: [], cargando: true }
    const html = renderToStaticMarkup(<Pagos cliente={null} onIrAlCliente={null} />)
    expect(html).toContain('Buscando los compromisos')
  })
})
