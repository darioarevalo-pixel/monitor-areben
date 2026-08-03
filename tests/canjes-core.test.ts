/**
 * Canjes — el dominio puro (Fase 0: el padrón).
 *
 * Lo que se testea acá es lo que puede romper en silencio:
 *  - la normalización del @, porque es el `unique` de la base y una divergencia crea fichas
 *    duplicadas sin que nadie vea un error;
 *  - el espejo TS↔JS de esa misma función, que es la deuda conocida de este repo;
 *  - el seguimiento cruzado de marcas, que es la única razón por la que el módulo vive en una sola
 *    base;
 *  - `resumenCiego`, que es lo que impide que la plata de una marca viaje al browser de la otra.
 */
import { describe, it, expect } from 'vitest'
import { instagramHref, instagramParaMostrar, normalizarInstagram, tiktokHref } from '@/lib/canjes/instagram'
import {
  estadoDeContacto, fechaDeAccion, ordenarPorContacto, proximoContacto, ultimaAccion, ultimaAccionPorMarca,
} from '@/lib/canjes/seguimiento'
import {
  CANJE_STORES, CONFIG_DEFAULT, ESTADOS_CANJE, camposParaTiendaNube, direccionEnUnaLinea,
  enTransito, entregableEnCriollo, esTerminal, estadoEnCriollo, baseDeCostos, nombrePersona,
  numeroCanje, puedeIr, queDatoPide, textoDeBusquedaDelItem, tieneDatosDeMarca, tieneDireccion,
  type CanjePersona, type CanjeRow, type EstadoCanje,
} from '@/lib/canjes/tipos'
// El handler es JS y no importa TS: se importan sus espejos para compararlos contra los de acá.
import { normalizarInstagram as normalizarJS, numeroCanje as numeroJS, resumenCiego } from '../api/_canjes.js'

// ── El @ ─────────────────────────────────────────────────────────────────────────

describe('normalizarInstagram — el unique del padrón', () => {
  it('las tres formas de escribir el mismo @ dan lo mismo', () => {
    // Es EL caso del módulo: tres personas dando de alta a la misma creadora, cada una copiando
    // desde un lado distinto. Si esto falla, quedan tres fichas con el historial partido.
    const esperado = 'lucia.mkp'
    expect(normalizarInstagram('Lucia.MKP')).toBe(esperado)
    expect(normalizarInstagram('@lucia.mkp')).toBe(esperado)
    expect(normalizarInstagram('instagram.com/lucia.mkp')).toBe(esperado)
    expect(normalizarInstagram('https://www.instagram.com/lucia.mkp/')).toBe(esperado)
    expect(normalizarInstagram('  @Lucia.MKP  ')).toBe(esperado)
  })

  it('saca lo que arrastra un link copiado desde el celular', () => {
    expect(normalizarInstagram('https://instagram.com/lucia.mkp?igsh=abc123')).toBe('lucia.mkp')
    expect(normalizarInstagram('instagram.com/lucia.mkp/reel/xyz')).toBe('lucia.mkp')
    expect(normalizarInstagram('https://www.instagram.com/lucia.mkp/#hola')).toBe('lucia.mkp')
    expect(normalizarInstagram('instagr.am/lucia.mkp')).toBe('lucia.mkp')
  })

  it('un punto final pegado de la oración no es parte del @', () => {
    expect(normalizarInstagram('@lucia.mkp.')).toBe('lucia.mkp')
  })

  it('respeta lo que Instagram sí permite: punto y guion bajo', () => {
    expect(normalizarInstagram('@lu_cia.mkp2')).toBe('lu_cia.mkp2')
  })

  it('devuelve vacío cuando no queda nada usable (el alta lo trata como error)', () => {
    expect(normalizarInstagram('')).toBe('')
    expect(normalizarInstagram(null)).toBe('')
    expect(normalizarInstagram(undefined)).toBe('')
    expect(normalizarInstagram('   ')).toBe('')
    expect(normalizarInstagram('@@@')).toBe('')
  })

  /**
   * ⚠️ El test que importa de verdad. `api/_canjes.js` tiene su propia copia porque los `api/*.js`
   * no importan TS, y **esa** es la que decide el unique de la base. Si divergen, la UI dice "ya
   * existe" y el servidor inserta una fila nueva, o al revés.
   */
  it('el espejo JS del handler normaliza EXACTAMENTE igual que el TS', () => {
    const casos = [
      'Lucia.MKP', '@lucia.mkp', 'instagram.com/lucia.mkp', 'https://www.instagram.com/lucia.mkp/',
      'https://instagram.com/lucia.mkp?igsh=abc123', 'instagram.com/lucia.mkp/reel/xyz',
      'instagr.am/lucia.mkp', '@lucia.mkp.', '@lu_cia.mkp2', '  @Lucia.MKP  ',
      '', '   ', '@@@', 'https://tiktok.com/@lucia', 'María.José', '@ñoño',
    ]
    for (const c of casos) {
      expect(normalizarJS(c), `divergen en ${JSON.stringify(c)}`).toBe(normalizarInstagram(c))
    }
  })
})

describe('links de perfil', () => {
  it('arma el link desde el @', () => {
    expect(instagramHref('@lucia.mkp')).toBe('https://instagram.com/lucia.mkp')
    expect(instagramHref('Lucia.MKP')).toBe('https://instagram.com/lucia.mkp')
  })

  it('una URL entera se respeta tal cual (alguien la puso a propósito)', () => {
    expect(instagramHref('https://instagram.com/lucia.mkp?hl=es')).toBe('https://instagram.com/lucia.mkp?hl=es')
  })

  it('sin @ no hay link', () => {
    expect(instagramHref('')).toBe('')
    expect(instagramHref(null)).toBe('')
  })

  it('se muestra siempre con @ y con las mayúsculas que ella usa', () => {
    expect(instagramParaMostrar('lucia.mkp', 'Lucia.MKP')).toBe('@Lucia.MKP')
    expect(instagramParaMostrar('lucia.mkp', null)).toBe('@lucia.mkp')
    expect(instagramParaMostrar('lucia.mkp', '@Lucia.MKP')).toBe('@Lucia.MKP')
  })

  it('TikTok arma el link con el @ adentro', () => {
    expect(tiktokHref('lucia')).toBe('https://tiktok.com/@lucia')
    expect(tiktokHref('@lucia')).toBe('https://tiktok.com/@lucia')
  })
})

// ── El número ────────────────────────────────────────────────────────────────────

describe('numeroCanje', () => {
  it('C-0007 y no C-7', () => {
    expect(numeroCanje(7)).toBe('C-0007')
    expect(numeroCanje(31)).toBe('C-0031')
    expect(numeroCanje(1234)).toBe('C-1234')
  })

  it('un id de cinco cifras no se trunca', () => {
    expect(numeroCanje(12345)).toBe('C-12345')
  })

  /** El otro espejo TS↔JS: si difieren, el número del panel no es el del aviso. */
  it('el espejo JS da el mismo número', () => {
    for (const id of [1, 7, 31, 999, 1234, 12345]) {
      expect(numeroJS(id)).toBe(numeroCanje(id))
    }
  })
})

// ── Las marcas ───────────────────────────────────────────────────────────────────

describe('las marcas son tres', () => {
  it('Stunned es una marca elegible del módulo, aunque no lo sea del monitor', () => {
    expect(CANJE_STORES).toEqual(['bdi', 'zattia', 'stunned'])
  })

  it('los costos de Stunned salen de la base de Zattia: es una línea, no una base', () => {
    expect(baseDeCostos('stunned')).toBe('zattia')
    expect(baseDeCostos('zattia')).toBe('zattia')
    expect(baseDeCostos('bdi')).toBe('bdi')
  })

  it('BDI pide modelo de celular; Zattia y Stunned, talles', () => {
    expect(queDatoPide('bdi')).toBe('modelo_celular')
    expect(queDatoPide('zattia')).toBe('talles')
    expect(queDatoPide('stunned')).toBe('talles')
  })
})

// ── Estados ──────────────────────────────────────────────────────────────────────

describe('el ciclo de vida', () => {
  it('son nueve y ni uno más', () => {
    expect(ESTADOS_CANJE).toHaveLength(9)
  })

  it('el camino feliz avanza de a un paso', () => {
    expect(puedeIr('propuesta', 'enviada')).toBe(true)
    expect(puedeIr('enviada', 'acuerdo')).toBe(true)
    expect(puedeIr('acuerdo', 'preparando')).toBe(true)
    expect(puedeIr('preparando', 'en_curso')).toBe(true)
    expect(puedeIr('en_curso', 'cerrado')).toBe(true)
  })

  it('firmar puertas adentro NO es que ella haya dicho que sí', () => {
    // Es el agujero de la primera versión: aprobar dejaba el canje en `acuerdo` sin que la
    // creadora se hubiera enterado de que existía.
    expect(puedeIr('propuesta', 'acuerdo')).toBe(false)
  })

  it('los dos "no" tienen dueños distintos y cada uno su origen', () => {
    // `rechazado` es nuestro y sale de la firma; `no_acepto` es de ella y sale de la espera.
    expect(puedeIr('propuesta', 'rechazado')).toBe(true)
    expect(puedeIr('enviada', 'no_acepto')).toBe(true)
    expect(puedeIr('propuesta', 'no_acepto')).toBe(false)
    expect(puedeIr('enviada', 'rechazado')).toBe(false)
  })

  it('no se saltean pasos', () => {
    expect(puedeIr('propuesta', 'preparando')).toBe(false)
    expect(puedeIr('propuesta', 'cerrado')).toBe(false)
    expect(puedeIr('enviada', 'preparando')).toBe(false)
    expect(puedeIr('acuerdo', 'en_curso')).toBe(false)
  })

  it('no se vuelve atrás', () => {
    expect(puedeIr('acuerdo', 'propuesta')).toBe(false)
    expect(puedeIr('cerrado', 'en_curso')).toBe(false)
  })

  it('se cancela desde cualquier estado no terminal, y desde ninguno terminal', () => {
    const noTerminales: EstadoCanje[] = ['propuesta', 'enviada', 'acuerdo', 'preparando', 'en_curso']
    for (const e of noTerminales) expect(puedeIr(e, 'cancelado'), e).toBe(true)
    for (const e of ['rechazado', 'no_acepto', 'cerrado', 'cancelado'] as EstadoCanje[]) {
      expect(puedeIr(e, 'cancelado'), e).toBe(false)
      expect(esTerminal(e), e).toBe(true)
    }
  })

  it('de un estado terminal no sale ninguna transición', () => {
    for (const e of ['rechazado', 'no_acepto', 'cerrado', 'cancelado'] as EstadoCanje[]) {
      for (const h of ESTADOS_CANJE) expect(puedeIr(e, h), `${e}→${h}`).toBe(false)
    }
  })
})

describe('estadoEnCriollo — el matiz que el label solo no da', () => {
  const base = {
    estado: 'preparando' as EstadoCanje,
    compra_estado: 'pendiente' as const,
    envio_estado: 'pendiente' as const,
    contacto_estado: 'pendiente' as const,
  }

  it('en preparando dice QUÉ falta, no "preparando"', () => {
    expect(estadoEnCriollo(base)).toBe('Falta comprar')
    expect(estadoEnCriollo({ ...base, compra_estado: 'hecho' })).toBe('Falta despachar')
    // "En tránsito" es la misma palabra que el chip de la cola en la lista: si acá dijera "En
    // camino", la encargada tendría que traducir entre las dos pantallas que usa todos los días.
    expect(estadoEnCriollo({ ...base, compra_estado: 'hecho', envio_estado: 'hecho' })).toBe('En tránsito')
  })

  it('en enviada distingue mi tarea de la espera de ella', () => {
    // Decir "esperando su respuesta" cuando todavía no se le escribió es echarle la culpa al de
    // enfrente de algo que falta hacer acá.
    expect(estadoEnCriollo({ ...base, estado: 'enviada' })).toBe('Falta escribirle')
    expect(estadoEnCriollo({ ...base, estado: 'enviada', contacto_estado: 'hecho' })).toBe('Esperando su respuesta')
  })

  it('en el resto de los estados es el label de siempre', () => {
    expect(estadoEnCriollo({ ...base, estado: 'cerrado' })).toBe('Cerrado')
    expect(estadoEnCriollo({ ...base, estado: 'propuesta' })).toBe('Esperando la firma interna')
  })
})

describe('entregableEnCriollo — concordancia singular/plural', () => {
  it('1 va en singular y 2 en plural', () => {
    expect(entregableEnCriollo('historia_ig', 1)).toBe('1 historia de instagram')
    expect(entregableEnCriollo('historia_ig', 2)).toBe('2 historias de instagram')
    expect(entregableEnCriollo('reel_ig', 1)).toBe('1 reel de instagram')
    expect(entregableEnCriollo('reel_ig', 3)).toBe('3 reels de instagram')
  })
})

// ── El seguimiento cruzado: la razón del padrón único ────────────────────────────

/** Un canje mínimo, con lo que mira el seguimiento. */
function canje(p: Partial<CanjeRow> & { store: CanjeRow['store']; estado: EstadoCanje }): CanjeRow {
  return {
    id: 1, persona_id: 1, tipo: 'producto', tope_tipo: 'monto', pago_estado: 'no_aplica',
    compra_estado: 'pendiente', stock_estado: 'no_aplica', envio_estado: 'pendiente',
    aviso_estado: 'pendiente', contacto_estado: 'pendiente',
    cerrado_incompleto: false, producto_no_conservado: false,
    created_at: '2026-01-01T00:00:00.000Z',
    ...p,
  } as CanjeRow
}

describe('fechaDeAccion — qué cuenta como "hicimos algo con ella"', () => {
  it('una propuesta que ella nunca contestó NO cuenta', () => {
    // Es el bug que se arregló con los estados nuevos: si contara, una propuesta sin respuesta le
    // taparía la cadencia 90 días y la persona no volvería a aparecer en "hace rato".
    expect(fechaDeAccion(canje({ store: 'bdi', estado: 'propuesta', acordado_at: '2026-05-01T00:00:00.000Z' }))).toBeNull()
    expect(fechaDeAccion(canje({ store: 'bdi', estado: 'enviada', acordado_at: '2026-05-01T00:00:00.000Z' }))).toBeNull()
  })

  it('los dos "no", el cancelado incluido, tampoco', () => {
    expect(fechaDeAccion(canje({ store: 'bdi', estado: 'rechazado', acordado_at: '2026-05-01T00:00:00.000Z' }))).toBeNull()
    expect(fechaDeAccion(canje({ store: 'bdi', estado: 'no_acepto', acordado_at: '2026-05-01T00:00:00.000Z' }))).toBeNull()
    expect(fechaDeAccion(canje({ store: 'bdi', estado: 'cancelado', acordado_at: '2026-05-01T00:00:00.000Z' }))).toBeNull()
  })

  it('cuenta desde que se acordó', () => {
    expect(fechaDeAccion(canje({ store: 'bdi', estado: 'cerrado', acordado_at: '2026-05-01T00:00:00.000Z' })))
      .toBe('2026-05-01T00:00:00.000Z')
  })

  it('si no hay acordado_at cae a la entrega, antes que a nada', () => {
    expect(fechaDeAccion(canje({ store: 'bdi', estado: 'en_curso', entregado_at: '2026-05-10T00:00:00.000Z' })))
      .toBe('2026-05-10T00:00:00.000Z')
  })
})

describe('ultimaAccion — cruzando marcas', () => {
  it('el canje de BDI cuenta para la pregunta que hace Zattia: es TODO el punto del módulo', () => {
    const canjes = [
      canje({ store: 'zattia', estado: 'cerrado', acordado_at: '2026-02-01T00:00:00.000Z' }),
      canje({ store: 'bdi', estado: 'cerrado', acordado_at: '2026-06-01T00:00:00.000Z' }),
    ]
    expect(ultimaAccion(canjes)).toBe('2026-06-01T00:00:00.000Z')
  })

  it('sin ninguna acción da null, no una fecha inventada', () => {
    expect(ultimaAccion([])).toBeNull()
    expect(ultimaAccion([canje({ store: 'bdi', estado: 'enviada' })])).toBeNull()
  })

  it('por marca separa lo que ultimaAccion junta', () => {
    const canjes = [
      canje({ store: 'zattia', estado: 'cerrado', acordado_at: '2026-02-01T00:00:00.000Z' }),
      canje({ store: 'bdi', estado: 'cerrado', acordado_at: '2026-06-01T00:00:00.000Z' }),
      canje({ store: 'bdi', estado: 'cerrado', acordado_at: '2026-03-01T00:00:00.000Z' }),
    ]
    expect(ultimaAccionPorMarca(canjes)).toEqual({
      bdi: '2026-06-01T00:00:00.000Z',
      zattia: '2026-02-01T00:00:00.000Z',
      stunned: null,
    })
  })
})

describe('estadoDeContacto — a quién llamar esta semana', () => {
  const persona = { cadencia_dias: 90 }
  const hoy = new Date('2026-07-27T12:00:00.000Z')

  it('sin canjes es "nunca", no "vencido": una persona nueva no es una abandonada', () => {
    const s = estadoDeContacto(persona, [], hoy)
    expect(s.estado).toBe('nunca')
    expect(s.dias).toBeNull()
    expect(s.proximo).toBeNull()
  })

  it('pasada la cadencia, vencido', () => {
    const s = estadoDeContacto(persona, [canje({ store: 'bdi', estado: 'cerrado', acordado_at: '2026-01-01T00:00:00.000Z' })], hoy)
    expect(s.estado).toBe('vencido')
    expect(s.dias).toBeGreaterThan(90)
  })

  it('adentro del último 20% de la cadencia, avisa antes de que se pase', () => {
    // 75 días de 90: entra en el tramo de aviso (≥72) pero todavía no venció.
    const s = estadoDeContacto(persona, [canje({ store: 'bdi', estado: 'cerrado', acordado_at: '2026-05-13T12:00:00.000Z' })], hoy)
    expect(s.dias).toBe(75)
    expect(s.estado).toBe('proximo')
  })

  it('recién llamada, al día', () => {
    const s = estadoDeContacto(persona, [canje({ store: 'bdi', estado: 'cerrado', acordado_at: '2026-07-20T12:00:00.000Z' })], hoy)
    expect(s.estado).toBe('aldia')
    expect(s.dias).toBe(7)
  })

  it('la cadencia es POR PERSONA: la misma fecha da vencido con 30 días y al día con 180', () => {
    const canjes = [canje({ store: 'bdi', estado: 'cerrado', acordado_at: '2026-06-01T00:00:00.000Z' })]
    expect(estadoDeContacto({ cadencia_dias: 30 }, canjes, hoy).estado).toBe('vencido')
    expect(estadoDeContacto({ cadencia_dias: 180 }, canjes, hoy).estado).toBe('aldia')
  })
})

describe('proximoContacto', () => {
  it('suma la cadencia a la última acción', () => {
    const canjes = [canje({ store: 'bdi', estado: 'cerrado', acordado_at: '2026-05-01T00:00:00.000Z' })]
    expect(proximoContacto({ cadencia_dias: 90 }, canjes)).toBe('2026-07-30')
  })

  it('sin acción previa no hay desde dónde contar', () => {
    expect(proximoContacto({ cadencia_dias: 90 }, [])).toBeNull()
  })
})

describe('ordenarPorContacto — el orden de la lista', () => {
  const mk = (nombre: string, estado: 'vencido' | 'proximo' | 'nunca' | 'aldia', dias: number | null, vetada = false) => ({
    _seg: { estado, dias, ultima: null, proximo: null } as const,
    _nombre: nombre,
    vetada,
  })

  it('primero las que hace más que no llamamos; las vetadas siempre al fondo', () => {
    const orden = ordenarPorContacto([
      mk('Ana', 'aldia', 5),
      mk('Zoe', 'vencido', 200, true),   // vetada: al fondo aunque sea la más vencida
      mk('Bea', 'nunca', null),
      mk('Cami', 'vencido', 100),
      mk('Dani', 'vencido', 150),
      mk('Eva', 'proximo', 75),
    ]).map((p) => p._nombre)

    expect(orden).toEqual(['Dani', 'Cami', 'Eva', 'Bea', 'Ana', 'Zoe'])
  })

  it('desempata por nombre respetando el castellano', () => {
    const orden = ordenarPorContacto([
      mk('Ñoña', 'aldia', 1),
      mk('Ana', 'aldia', 1),
      mk('Zoe', 'aldia', 1),
    ]).map((p) => p._nombre)
    expect(orden).toEqual(['Ana', 'Ñoña', 'Zoe'])
  })
})

// ── La ficha ─────────────────────────────────────────────────────────────────────

function persona(p: Partial<CanjePersona>): CanjePersona {
  return {
    id: 1, instagram: 'lucia.mkp', destacada: false, vetada: false, cadencia_dias: 90,
    created_at: '2026-01-01T00:00:00.000Z',
    ...p,
  } as CanjePersona
}

describe('nombrePersona', () => {
  it('el @ es el fallback: una persona recién dada de alta sólo tiene eso', () => {
    expect(nombrePersona(persona({}))).toBe('@lucia.mkp')
    expect(nombrePersona(persona({ instagram_raw: 'Lucia.MKP' }))).toBe('@Lucia.MKP')
  })

  it('con nombre gana el nombre', () => {
    expect(nombrePersona(persona({ nombre: 'Lucía', apellido: 'Pérez' }))).toBe('Lucía Pérez')
    expect(nombrePersona(persona({ nombre: 'Lucía' }))).toBe('Lucía')
  })
})

describe('lo que hace falta para despachar', () => {
  it('sin los cuatro campos de dirección no se puede cotizar el envío', () => {
    expect(tieneDireccion(persona({ calle: 'Corrientes', numero: '1234', cp: '1043', localidad: 'CABA' }))).toBe(true)
    expect(tieneDireccion(persona({ calle: 'Corrientes', numero: '1234', cp: '1043' }))).toBe(false)
    expect(tieneDireccion(persona({}))).toBe(false)
  })

  it('BDI se conforma con el modelo de celular y Zattia con un talle', () => {
    const conModelo = persona({ modelo_celular: 'iPhone 15' })
    const conTalle = persona({ talles: { remera: 'M' } })

    expect(tieneDatosDeMarca(conModelo, 'bdi')).toBe(true)
    expect(tieneDatosDeMarca(conModelo, 'zattia')).toBe(false)
    expect(tieneDatosDeMarca(conTalle, 'zattia')).toBe(true)
    expect(tieneDatosDeMarca(conTalle, 'stunned')).toBe(true)
    expect(tieneDatosDeMarca(conTalle, 'bdi')).toBe(false)
  })

  it('los dos datos conviven en la misma ficha', () => {
    // La misma creadora con talle cargado por un canje de Zattia y modelo por uno de BDI.
    const ambos = persona({ modelo_celular: 'iPhone 15', talles: { remera: 'M' } })
    expect(tieneDatosDeMarca(ambos, 'bdi')).toBe(true)
    expect(tieneDatosDeMarca(ambos, 'zattia')).toBe(true)
  })
})

// ── El modo ciego: la plata de una marca no viaja al browser de la otra ──────────

describe('resumenCiego — lo que ve quien no tiene esa marca', () => {
  const fila = {
    id: 31, persona_id: 7, store: 'bdi', estado: 'cerrado',
    acordado_at: '2026-05-01T00:00:00.000Z', entregado_at: '2026-05-10T00:00:00.000Z',
    cerrado_at: '2026-06-01T00:00:00.000Z', created_at: '2026-04-20T00:00:00.000Z',
    // Lo que NO tiene que salir, por si alguien amplía el select y se olvida de esto:
    tope_pvp: 80000, monto_plata: 30000, balance_costo_total: 51234, balance_cpm: 12.5,
    token: 'a'.repeat(64), envio_direccion: { calle: 'Corrientes' }, balance_nota: 'anduvo bárbaro',
    historial: [{ at: '2026-05-01', nota: 'aprobado' }],
  }

  it('deja pasar marca, fecha y estado — la existencia SÍ se ve', () => {
    const r = resumenCiego(fila)
    expect(r.store).toBe('bdi')
    expect(r.estado).toBe('cerrado')
    expect(r.acordado_at).toBe('2026-05-01T00:00:00.000Z')
    expect(r.numero).toBe('C-0031')
    expect(r.ciego).toBe(true)
  })

  /**
   * El test que protege la decisión: es una **whitelist**, así que agregar una columna de plata a
   * `canjes` no la filtra sola. Si mañana alguien mete `balance_costo_x` y este test sigue
   * pasando, es porque el diseño funciona.
   */
  it('no deja pasar NADA de plata, ni el token, ni la dirección, ni el historial', () => {
    const r = resumenCiego(fila) as Record<string, unknown>
    const prohibidos = [
      'tope_pvp', 'monto_plata', 'balance_costo_total', 'balance_cpm', 'balance_nota',
      'token', 'envio_direccion', 'historial',
    ]
    for (const k of prohibidos) expect(r, `se filtró ${k}`).not.toHaveProperty(k)
  })

  it('las claves que devuelve son exactamente las esperadas, ni una más', () => {
    expect(Object.keys(resumenCiego(fila)).sort()).toEqual([
      'acordado_at', 'cerrado_at', 'ciego', 'created_at', 'entregado_at', 'estado', 'id', 'numero',
      'persona_id', 'store',
    ])
  })
})

// ── La config ────────────────────────────────────────────────────────────────────

describe('los defaults de la config', () => {
  it('el umbral arranca en null = TODO va a la firma alta (el default seguro)', () => {
    expect(CONFIG_DEFAULT.umbral_aprobacion_alta).toBeNull()
  })

  it('el bloqueo por vencidos arranca APAGADO', () => {
    // Si arrancara prendido y nadie carga evidencias, el sistema frena canjes con gente que sí
    // cumplió. Se prende recién cuando la carga se haya sostenido un mes (§8 del plan).
    expect(CONFIG_DEFAULT.bloquear_por_vencidos).toBe(false)
  })

  it('la cadencia default es 90 días', () => {
    expect(CONFIG_DEFAULT.cadencia_dias_default).toBe(90)
  })
})

// ── La carga a mano en Tienda Nube ───────────────────────────────────────────────

describe('los datos para tipear la orden en Tienda Nube', () => {
  const P = {
    id: 1, instagram: 'lu', created_at: '2026-01-01', destacada: false, vetada: false, cadencia_dias: 90,
    nombre: 'Lucía', apellido: 'Méndez', email: 'lu@mail.com', telefono: '1155550000', dni: '38111222',
    calle: 'Av. Siempreviva', numero: '742', piso: '3', depto: 'B',
    cp: '1425', localidad: 'Palermo', provincia: 'CABA', direccion_nota: 'portero eléctrico',
  } as CanjePersona

  const CFG = { email_pedido: 'canjes@bdi.com' }

  it('los trece campos salen en el orden en que el admin los pide', () => {
    expect(camposParaTiendaNube(P, CFG).map((c) => c.key)).toEqual([
      'nombre', 'apellido', 'email', 'telefono', 'dni',
      'calle', 'numero', 'piso', 'depto', 'cp', 'localidad', 'provincia', 'direccion_nota',
    ])
  })

  // Lo que se tipea en la orden es el mail DE LA MARCA. El de ella es una herramienta de contacto
  // que vive en el padrón: si entrara a la tienda, TN le mandaría los avisos de una compra que no
  // hizo, y su casilla quedaría atada a un cliente de Tienda Nube que no le pertenece.
  it('el mail es el de la marca, nunca el de la creadora', () => {
    const mail = camposParaTiendaNube(P, CFG).find((c) => c.key === 'email')
    expect(mail?.valor).toBe('canjes@bdi.com')
    expect(mail?.valor).not.toBe(P.email)
  })

  // Sin config cargada sale vacío como cualquier otro campo que falte, que es lo que hace visible
  // que hay algo pendiente en Ajustes. Nunca cae al de ella por las dudas.
  it.each([undefined, null, { email_pedido: null }])('sin mail configurado (%s) no cae al de ella', (cfg) => {
    expect(camposParaTiendaNube(P, cfg).find((c) => c.key === 'email')?.valor).toBe('')
  })

  it('lo que falta se devuelve igual, vacío', () => {
    // Esconder los vacíos haría la lista más corta y la pregunta que importa más difícil: qué le
    // falta a esta persona para poder despacharle.
    const campos = camposParaTiendaNube({ ...P, piso: null, dni: '' } as CanjePersona, CFG)
    expect(campos).toHaveLength(13)
    expect(campos.find((c) => c.key === 'piso')?.valor).toBe('')
    expect(campos.find((c) => c.key === 'dni')?.valor).toBe('')
  })

  it('la dirección en un renglón nombra el piso y el depto, y se saltea lo que no hay', () => {
    expect(direccionEnUnaLinea(P)).toBe('Av. Siempreviva 742, piso 3, depto B, Palermo, CABA, CP 1425')
    expect(direccionEnUnaLinea({ ...P, piso: null, depto: null } as CanjePersona))
      .toBe('Av. Siempreviva 742, Palermo, CABA, CP 1425')
  })
})

describe('qué se busca en el admin para encontrar cada producto', () => {
  it('con SKU, el SKU', () => {
    expect(textoDeBusquedaDelItem({ sku: 'BDI-123', nombre: 'Funda', variante: 'iPhone 12' })).toBe('BDI-123')
  })

  it('SIN SKU cae al nombre con la variante', () => {
    // Lo que elige ella por el link se congela por id de variante de TN, no por SKU: en BDI falta
    // en 4 de cada 10 variantes. Sin esto, la fila de la orden saldría vacía.
    expect(textoDeBusquedaDelItem({ sku: null, nombre: 'Funda', variante: 'iPhone 12' }))
      .toBe('Funda · iPhone 12')
    expect(textoDeBusquedaDelItem({ sku: '  ', nombre: 'Funda', variante: null })).toBe('Funda')
  })
})

// ── La cola de tránsito ──────────────────────────────────────────────────────────

describe('enTransito — la cola que la encargada revisa todos los días', () => {
  it('es despachado y todavía sin llegar', () => {
    expect(enTransito({ envio_estado: 'hecho', entregado_at: null })).toBe(true)
    expect(enTransito({ envio_estado: 'pendiente', entregado_at: null })).toBe(false)
  })

  it('llegar es lo único que lo saca de la cola', () => {
    expect(enTransito({ envio_estado: 'hecho', entregado_at: '2026-08-01T00:00:00Z' })).toBe(false)
  })
})
