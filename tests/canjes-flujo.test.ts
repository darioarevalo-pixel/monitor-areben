/**
 * Canjes — las reglas del flujo (Fase 1).
 *
 * Lo que se testea acá es lo que decide plata y permisos:
 *  - **quién firma**, que es un gate de autorización;
 *  - **el tope**, que es lo único que impide que un canje de $80.000 salga $200.000;
 *  - **el cumplimiento**, que se deriva y no se guarda;
 *  - **el cierre**, que no tiene que dejar cerrar con cosas a medias;
 *  - y el **espejo TS↔JS** de los tres primeros, porque el servidor los replica y una divergencia
 *    ahí significa que la UI dice una cosa y el handler hace otra.
 */
import { describe, it, expect } from 'vitest'
import {
  CONFIG_DEFAULT,
  calcularBalance, controlDelTope, costoEstimado, cumplimiento,
  entregablesVencidos, faltantesParaCerrarCanje, fechaISO, itemsVivos, naceEn, pideSeguimiento,
  esPedidoUgc, puedeProponerCanje, quienApruebaCanje, resultadosDe, RESULTADOS, RESULTADOS_UGC,
  vencimientoDe,
  type CanjeConfig, type CanjeEntregable, type CanjeEvidencia, type CanjeItem, type CanjeRow,
} from '@/lib/canjes/tipos'
import {
  listaEntregables, loQueLeMandamos, mensajeAcuerdo, mensajeDespacho, mensajeIntentoEntrega,
  mensajeLinkDatos, mensajePropuesta, mensajeRecordatorio, mensajeSondeo,
} from '@/lib/canjes/mensajes'
// Lo que decide el handler y no está en el dominio: cómo lee el body y quién firma.
import { entregablesDelBody, subQueApruebe } from '../api/_canjes.js'
// La cara del tope que usa el servidor. Ya no es un espejo: es la MISMA función que `controlDelTope`
// vista desde el lado del que valida (`lib/canjes/reglas.core.js`).
import { seVaDelTope } from '@/lib/canjes/reglas.core.js'

// ── Fixtures ─────────────────────────────────────────────────────────────────────

function canje(p: Partial<CanjeRow> = {}): CanjeRow {
  return {
    id: 31, persona_id: 7, store: 'bdi', tipo: 'producto', estado: 'preparando',
    tope_tipo: 'monto', tope_pvp: 80000, pago_estado: 'no_aplica',
    compra_estado: 'hecho', stock_estado: 'no_aplica', envio_estado: 'hecho',
    aviso_estado: 'hecho', entregado_at: '2026-06-01T00:00:00.000Z', envio_costo: 5000,
    cerrado_incompleto: false, producto_no_conservado: false,
    created_at: '2026-05-01T00:00:00.000Z',
    ...p,
  } as CanjeRow
}

function item(p: Partial<CanjeItem> = {}): CanjeItem {
  return {
    id: 1, canje_id: 31, cantidad: 1, costo_unit: 10000, pvp_unit: 25000,
    origen: 'equipo', estado: 'confirmado', created_at: '2026-05-01T00:00:00.000Z',
    ...p,
  } as CanjeItem
}

function entregable(p: Partial<CanjeEntregable> = {}): CanjeEntregable {
  return {
    id: 1, canje_id: 31, tipo: 'historia_ig', cantidad_comprometida: 2,
    plazo_dias: 10, obligatorio: true, created_at: '2026-05-01T00:00:00.000Z',
    ...p,
  } as CanjeEntregable
}

function evidencia(p: Partial<CanjeEvidencia> = {}): CanjeEvidencia {
  return {
    id: 1, canje_id: 31, entregable_id: 1, subido_por: 'equipo', verificada: true,
    created_at: '2026-06-05T00:00:00.000Z',
    ...p,
  } as CanjeEvidencia
}

const cfg = (p: Partial<CanjeConfig> = {}): CanjeConfig => ({ store: 'bdi', ...CONFIG_DEFAULT, ...p })

const HOY = new Date('2026-06-20T12:00:00.000Z')

// ── Quién firma ──────────────────────────────────────────────────────────────────

describe('quienApruebaCanje — el gate de autorización', () => {
  it('con plata de por medio siempre va a la firma alta, tenga el monto que tenga', () => {
    // $1 de plata también: lo que dispara la firma alta es que salga plata, no cuánta.
    const c = canje({ tipo: 'producto_plata', monto_plata: 1 })
    expect(quienApruebaCanje(c, [], cfg({ umbral_aprobacion_alta: 1_000_000 }))).toBe('aprobar-plata')
  })

  it('el umbral null manda TODO a la firma alta: es el default seguro', () => {
    expect(CONFIG_DEFAULT.umbral_aprobacion_alta).toBeNull()
    expect(quienApruebaCanje(canje({ tope_pvp: 100 }), [], cfg())).toBe('aprobar-plata')
  })

  it('con umbral cargado, por debajo alcanza la firma común', () => {
    // 80.000 de tope × 0,4 de factor = 32.000 estimado, contra un umbral de 50.000.
    expect(quienApruebaCanje(canje(), [], cfg({ umbral_aprobacion_alta: 50000 }))).toBe('aprobar')
  })

  it('por encima del umbral, firma alta', () => {
    expect(quienApruebaCanje(canje(), [], cfg({ umbral_aprobacion_alta: 20000 }))).toBe('aprobar-plata')
  })

  it('con items cargados manda el costo REAL, no la estimación', () => {
    // Tres items a 10.000 de costo = 30.000 real, contra la estimación de 32.000.
    const items = [item({ id: 1 }), item({ id: 2 }), item({ id: 3 })]
    expect(quienApruebaCanje(canje(), items, cfg({ umbral_aprobacion_alta: 31000 }))).toBe('aprobar')
    expect(quienApruebaCanje(canje(), items, cfg({ umbral_aprobacion_alta: 29000 }))).toBe('aprobar-plata')
  })

  it('lo que no se puede estimar va a la firma alta, no a la común', () => {
    // Tope por unidades y sin items: no hay monto todavía. Prefiero molestar a un gerente que
    // dejar pasar un canje caro por una firma baja.
    const c = canje({ tope_tipo: 'unidades', tope_pvp: null, tope_unidades: [{ cantidad: 2, descripcion: 'fundas' }] })
    expect(costoEstimado(c, [], cfg())).toBeNull()
    expect(quienApruebaCanje(c, [], cfg({ umbral_aprobacion_alta: 999999 }))).toBe('aprobar-plata')
  })

  it('un item quitado no cuenta para el costo', () => {
    const items = [item({ id: 1 }), item({ id: 2, estado: 'quitado' }), item({ id: 3, estado: 'sin_stock' })]
    expect(itemsVivos(items)).toHaveLength(1)
    expect(costoEstimado(canje(), items, cfg())).toBe(10000)
  })

  it('el espejo del handler decide EXACTAMENTE el mismo nivel', () => {
    const casos: [CanjeRow, CanjeItem[], CanjeConfig][] = [
      [canje({ tipo: 'producto_plata' }), [], cfg({ umbral_aprobacion_alta: 1_000_000 })],
      [canje(), [], cfg()],
      [canje(), [], cfg({ umbral_aprobacion_alta: 50000 })],
      [canje(), [], cfg({ umbral_aprobacion_alta: 20000 })],
      [canje(), [item(), item({ id: 2 })], cfg({ umbral_aprobacion_alta: 25000 })],
      [canje({ tope_tipo: 'unidades', tope_pvp: null }), [], cfg({ umbral_aprobacion_alta: 999999 })],
    ]
    for (const [c, items, config] of casos) {
      expect(subQueApruebe(c, items, config), JSON.stringify({ tipo: c.tipo, umbral: config.umbral_aprobacion_alta }))
        .toBe(quienApruebaCanje(c, items, config))
    }
  })

  it('el nivel de firma NO depende de la persona', () => {
    // Es lo que permite que un lote de veinticinco calcule la firma una sola vez en vez de
    // veinticinco. Si algún día el nivel pasara a mirar a la persona (su puntaje, sus vencidos),
    // este test se cae y hay que volver a calcularlo por fila en `canjes-crear-lote`.
    const config = cfg({ umbral_aprobacion_alta: 50000 })
    const base = canje({ persona_id: 7 })
    for (const personaId of [1, 99, 12345]) {
      expect(subQueApruebe(canje({ ...base, persona_id: personaId }), [], config))
        .toBe(subQueApruebe(base, [], config))
    }
  })
})

// ── El tope ──────────────────────────────────────────────────────────────────────

describe('controlDelTope — modo monto', () => {
  it('deja pasar mientras la suma de PVP no se pase', () => {
    const r = controlDelTope(canje({ tope_pvp: 80000 }), [item({ pvp_unit: 25000 }), item({ id: 2, pvp_unit: 25000 })])
    expect(r.ok).toBe(true)
    expect(r.usado).toBe(50000)
  })

  it('frena cuando se pasa, y lo dice con los dos números', () => {
    const r = controlDelTope(canje({ tope_pvp: 40000 }), [item({ pvp_unit: 25000 }), item({ id: 2, pvp_unit: 25000 })])
    expect(r.ok).toBe(false)
    expect(r.mensaje).toContain('50.000')
    expect(r.mensaje).toContain('40.000')
  })

  it('justo en el tope entra: el control es "no pasarse", no "quedar debajo"', () => {
    expect(controlDelTope(canje({ tope_pvp: 50000 }), [item({ pvp_unit: 50000 })]).ok).toBe(true)
  })

  it('la cantidad multiplica', () => {
    expect(controlDelTope(canje({ tope_pvp: 40000 }), [item({ pvp_unit: 25000, cantidad: 2 })]).ok).toBe(false)
  })

  it('sin tope cargado no frena nada, pero lo avisa', () => {
    const r = controlDelTope(canje({ tope_pvp: null }), [item({ pvp_unit: 999999 })])
    expect(r.ok).toBe(true)
    expect(r.mensaje).toContain('no tiene tope')
  })
})

describe('controlDelTope — modo unidades', () => {
  const conUnidades = canje({
    tope_tipo: 'unidades',
    tope_pvp: null,
    tope_unidades: [{ cantidad: 2, descripcion: 'fundas' }, { cantidad: 1, descripcion: 'jean' }, { cantidad: 1, descripcion: 'remera' }],
  })

  it('el control es sobre el TOTAL de unidades, no sobre el detalle', () => {
    // Cuatro items cualesquiera entran; que sean las prendas correctas lo mira el operador. La
    // categoría de GN no da para colgar de ahí un bloqueo.
    const cuatro = [item({ id: 1 }), item({ id: 2 }), item({ id: 3 }), item({ id: 4 })]
    const r = controlDelTope(conUnidades, cuatro)
    expect(r.ok).toBe(true)
    expect(r.usado).toBe(4)
    expect(r.tope).toBe(4)
  })

  it('la quinta unidad frena', () => {
    const cinco = [1, 2, 3, 4, 5].map((id) => item({ id }))
    const r = controlDelTope(conUnidades, cinco)
    expect(r.ok).toBe(false)
    expect(r.mensaje).toContain('5')
    expect(r.mensaje).toContain('4')
  })

  it('un item de cantidad 4 llena el acuerdo igual que cuatro items', () => {
    expect(controlDelTope(conUnidades, [item({ cantidad: 4 })]).ok).toBe(true)
    expect(controlDelTope(conUnidades, [item({ cantidad: 5 })]).ok).toBe(false)
  })

  it('el PVP NO frena en modo unidades: lo acordado son piezas', () => {
    expect(controlDelTope(conUnidades, [item({ pvp_unit: 9_000_000 })]).ok).toBe(true)
  })

  it('el espejo del handler frena en los mismos casos', () => {
    const casos: [CanjeRow, CanjeItem[]][] = [
      [canje({ tope_pvp: 40000 }), [item({ pvp_unit: 25000 }), item({ id: 2, pvp_unit: 25000 })]],
      [canje({ tope_pvp: 80000 }), [item({ pvp_unit: 25000 })]],
      [canje({ tope_pvp: 50000 }), [item({ pvp_unit: 50000 })]],
      [conUnidades, [1, 2, 3, 4, 5].map((id) => item({ id }))],
      [conUnidades, [item({ cantidad: 4 })]],
      [canje({ tope_pvp: null }), [item({ pvp_unit: 999999 })]],
    ]
    for (const [c, items] of casos) {
      const ts = controlDelTope(c, items)
      const js = seVaDelTope(c, items)
      expect(js == null, `divergen: TS dice ok=${ts.ok}, JS dice ${js}`).toBe(ts.ok)
    }
  })
})

// ── El grafo de estados ──────────────────────────────────────────────────────────

/**
 * 🗑️ **Acá vivía «el espejo del grafo de estados»** — cuatro tests que comparaban `TRANSICIONES`,
 * `puedeIr`, `TERMINALES` y `MOTIVOS_NO_ACEPTO` del handler contra los de `tipos.ts`, par por par.
 *
 * Se borraron el 13-ago-2026 porque **ya no hay dos lados que comparar**: las reglas viven una sola
 * vez en `lib/canjes/reglas.core.js` y `tipos.ts` las re-exporta con sus tipos. Un test de espejo
 * es interés que se paga todos los meses; que se pueda borrar es la señal de que la deuda se
 * amortizó.
 *
 * 🔑 Y lo que el espejo **no** cubría era lo caro: `controlDelTope` —lo único que impide que un
 * canje de $80.000 salga $200.000— y `listoParaEntregar` estaban escritos dos veces, con la misma
 * plata en juego y sin un solo test comparándolos. Coincidían carácter por carácter porque alguien
 * los copió bien, no porque algo lo garantizara. Ahora son una función sola, y los tests de esta
 * misma suite (`controlDelTope`, arriba) la ejercen a través de las dos caras.
 */

// ── La firma que se saltea sola ──────────────────────────────────────────────────

describe('naceEn — dónde arranca el canje', () => {
  const cfgSinUmbral = { umbral_aprobacion_alta: null, factor_costo_estimado: 0.4 }
  const cfgConUmbral = { umbral_aprobacion_alta: 50000, factor_costo_estimado: 0.4 }

  it('quien ya podía firmarlo no se lo manda a sí mismo a la firma', () => {
    const c = canje({ tipo: 'producto', tope_tipo: 'monto', tope_pvp: 10000 })
    expect(naceEn(c, [], cfgConUmbral, ['aprobar']).estado).toBe('enviada')
  })

  it('quien no firma lo deja esperando la firma', () => {
    const c = canje({ tipo: 'producto', tope_tipo: 'monto', tope_pvp: 10000 })
    expect(naceEn(c, [], cfgConUmbral, []).estado).toBe('propuesta')
  })

  it('con plata de por medio, la firma común NO alcanza', () => {
    // El caso que importa: alguien con `aprobar` armando un canje con plata no puede saltearse la
    // firma alta armándolo él mismo.
    const c = canje({ tipo: 'producto_plata', monto_plata: 30000 })
    expect(naceEn(c, [], cfgConUmbral, ['aprobar']).estado).toBe('propuesta')
    expect(naceEn(c, [], cfgConUmbral, ['aprobar-plata']).estado).toBe('enviada')
  })

  it('sin umbral cargado todo va a la firma alta, también para saltearla', () => {
    const c = canje({ tipo: 'producto', tope_tipo: 'monto', tope_pvp: 1000 })
    expect(naceEn(c, [], cfgSinUmbral, ['aprobar']).estado).toBe('propuesta')
    expect(naceEn(c, [], cfgSinUmbral, ['aprobar-plata']).estado).toBe('enviada')
  })

  it('el nivel que devuelve es el mismo que decide el servidor', () => {
    const casos: CanjeRow[] = [
      canje({ tipo: 'producto', tope_tipo: 'monto', tope_pvp: 10000 }),
      canje({ tipo: 'producto', tope_tipo: 'monto', tope_pvp: 900000 }),
      canje({ tipo: 'producto_plata', monto_plata: 5000 }),
      canje({ tipo: 'producto', tope_tipo: 'unidades', tope_unidades: [{ cantidad: 3, descripcion: 'fundas' }] }),
    ]
    for (const c of casos) {
      const cfg = cfgConUmbral as CanjeConfig
      expect(naceEn(c, [], cfg, []).nivel, JSON.stringify({ tipo: c.tipo, tope: c.tope_tipo }))
        .toBe(subQueApruebe(c, [], cfg))
    }
  })
})

// ── Lo que se le pide publicar, tal como llega de la grilla ──────────────────────

describe('entregablesDelBody — la grilla manda los cinco tipos siempre', () => {
  const cfg = { plazo_entregable_dias_default: 10 }

  it('los que vienen en 0 se ignoran', () => {
    const r = entregablesDelBody([
      { tipo: 'historia_ig', cantidad: 3 },
      { tipo: 'reel_ig', cantidad: 0 },
      { tipo: 'post_ig', cantidad: 0 },
    ], cfg)
    expect(r).toHaveLength(1)
    expect(r[0].tipo).toBe('historia_ig')
    expect(r[0].cantidad_comprometida).toBe(3)
  })

  it('arrancan obligatorios y con el plazo de la config', () => {
    const [e] = entregablesDelBody([{ tipo: 'reel_ig', cantidad: 1 }], cfg)
    expect(e.obligatorio).toBe(true)
    expect(e.plazo_dias).toBe(10)
  })

  it('un tipo inventado no entra', () => {
    expect(entregablesDelBody([{ tipo: 'tiktok_live', cantidad: 2 }], cfg)).toEqual([])
  })

  it('nada, o basura, devuelve lista vacía y no rompe', () => {
    expect(entregablesDelBody(undefined, cfg)).toEqual([])
    expect(entregablesDelBody([null, {}, { tipo: 'post_ig' }], cfg)).toEqual([])
  })
})

// ── UGC: qué se le pidió decide qué se le pregunta al cerrar ─────────────────────

describe('esPedidoUgc — se deriva de los entregables, no se guarda', () => {
  const e = (tipo: string) => ({ tipo }) as unknown as CanjeEntregable

  it('sólo contenido es UGC', () => {
    expect(esPedidoUgc([e('contenido')])).toBe(true)
    expect(esPedidoUgc([e('contenido'), e('contenido')])).toBe(true)
  })

  it('🔴 un canje MIXTO no es UGC: publica, y a lo que publica le aplica la pregunta de la venta', () => {
    expect(esPedidoUgc([e('historia_ig'), e('contenido')])).toBe(false)
    expect(esPedidoUgc([e('contenido'), e('video_tiktok')])).toBe(false)
  })

  it('sólo publicación no es UGC', () => {
    expect(esPedidoUgc([e('historia_ig'), e('reel_ig')])).toBe(false)
  })

  it('🔴 la lista vacía es false: el cero afirma, y sin entregables no hay con qué decir que es UGC', () => {
    expect(esPedidoUgc([])).toBe(false)
    expect(esPedidoUgc(undefined as unknown as CanjeEntregable[])).toBe(false)
  })
})

describe('resultadosDe — el juego de respuestas del «¿rindió?»', () => {
  const e = (tipo: string) => ({ tipo }) as unknown as CanjeEntregable

  it('un canje que publica contesta con los de venta', () => {
    expect(resultadosDe([e('historia_ig')])).toEqual(RESULTADOS)
    expect(resultadosDe([e('historia_ig'), e('contenido')])).toEqual(RESULTADOS)
  })

  it('un canje UGC contesta con los suyos', () => {
    expect(resultadosDe([e('contenido')])).toEqual(RESULTADOS_UGC)
  })

  it('sin entregables cae en los de venta, que es el default de siempre', () => {
    expect(resultadosDe([])).toEqual(RESULTADOS)
  })

  it('🔴 los dos juegos no se pisan salvo en `no_se`: si no, la columna no dice QUÉ se contestó', () => {
    const compartidos = RESULTADOS.filter((r) => RESULTADOS_UGC.includes(r))
    expect(compartidos).toEqual(['no_se'])
  })
})

// ── El cumplimiento ──────────────────────────────────────────────────────────────

describe('cumplimiento — se deriva, no se guarda', () => {
  it('sólo cuentan las evidencias VERIFICADAS', () => {
    // Sin este control, pegar un link roto cerraría el canje.
    const e = [entregable({ cantidad_comprometida: 2 })]
    const evs = [evidencia({ id: 1, verificada: true }), evidencia({ id: 2, verificada: false })]
    const c = cumplimiento(e, evs, HOY)
    expect(c.cumplidas).toBe(1)
    expect(c.comprometidas).toBe(2)
    expect(c.completo).toBe(false)
  })

  it('una rechazada tampoco cuenta', () => {
    const evs = [evidencia({ id: 1, verificada: false, rechazada_motivo: 'el link no abre' })]
    expect(cumplimiento([entregable()], evs, HOY).cumplidas).toBe(0)
  })

  it('no se pasa del 100%: cinco historias para dos prometidas son dos', () => {
    const evs = [1, 2, 3, 4, 5].map((id) => evidencia({ id }))
    const c = cumplimiento([entregable({ cantidad_comprometida: 2 })], evs, HOY)
    expect(c.cumplidas).toBe(2)
    expect(c.fraccion).toBe(1)
  })

  it('sin nada comprometido la fracción es 1, no 0', () => {
    // Un 0 haría que un canje sin entregables se viera como un incumplimiento total.
    const c = cumplimiento([], [], HOY)
    expect(c.fraccion).toBe(1)
    expect(c.completo).toBe(true)
  })

  it('un entregable opcional sin cumplir no impide el "completo"', () => {
    const e = [entregable({ id: 1, cantidad_comprometida: 1 }), entregable({ id: 2, obligatorio: false, cantidad_comprometida: 1 })]
    const evs = [evidencia({ id: 1, entregable_id: 1 })]
    expect(cumplimiento(e, evs, HOY).completo).toBe(true)
  })

  it('una evidencia sin entregable asociado no le suma a ninguno', () => {
    const evs = [evidencia({ id: 1, entregable_id: null })]
    expect(cumplimiento([entregable()], evs, HOY).cumplidas).toBe(0)
  })
})

describe('entregablesVencidos', () => {
  it('vencido = obligatorio + fecha pasada + sin cumplir', () => {
    const e = [entregable({ vence_el: '2026-06-11' })]
    expect(entregablesVencidos(e, [], HOY)).toHaveLength(1)
  })

  it('cumplido a tiempo no vence, aunque la fecha ya haya pasado', () => {
    const e = [entregable({ cantidad_comprometida: 1, vence_el: '2026-06-11' })]
    expect(entregablesVencidos(e, [evidencia()], HOY)).toHaveLength(0)
  })

  it('el opcional nunca vence: no es una obligación', () => {
    const e = [entregable({ obligatorio: false, vence_el: '2026-06-11' })]
    expect(entregablesVencidos(e, [], HOY)).toHaveLength(0)
  })

  it('sin `vence_el` no vence: el pedido todavía no llegó y el plazo no arrancó', () => {
    expect(entregablesVencidos([entregable({ vence_el: null })], [], HOY)).toHaveLength(0)
  })

  it('el día del vencimiento todavía no está vencido', () => {
    const e = [entregable({ vence_el: fechaISO(HOY) })]
    expect(entregablesVencidos(e, [], HOY)).toHaveLength(0)
  })
})

describe('vencimientoDe — el plazo se vuelve fecha al entregar', () => {
  it('suma los días a la fecha de entrega', () => {
    expect(vencimientoDe('2026-06-01T15:00:00.000Z', 10, 30)).toMatch(/^2026-06-1[01]$/)
  })

  it('sin plazo propio usa el default de la config', () => {
    const conDefault = vencimientoDe('2026-06-01T15:00:00.000Z', null, 5)
    const explicito = vencimientoDe('2026-06-01T15:00:00.000Z', 5, 99)
    expect(conDefault).toBe(explicito)
  })
})

// ── §2 bis: el bloqueo ───────────────────────────────────────────────────────────

describe('puedeProponerCanje — §2 bis', () => {
  const vencido = {
    canje: { id: 31, estado: 'en_curso' as const },
    entregables: [entregable({ vence_el: '2026-06-01' })],
    evidencias: [],
  }

  it('⚠️ arranca APAGADO: con la config de fábrica no frena a nadie', () => {
    // Es la decisión de §8: si nadie carga evidencias, todo el mundo figura como incumplidor y el
    // sistema empieza a frenar canjes con gente que sí cumplió.
    expect(CONFIG_DEFAULT.bloquear_por_vencidos).toBe(false)
    expect(puedeProponerCanje({ vetada: false }, [vencido], cfg(), HOY)).toEqual({ ok: true })
  })

  it('prendido, frena y explica en criollo con el número del canje', () => {
    const r = puedeProponerCanje({ vetada: false }, [vencido], cfg({ bloquear_por_vencidos: true }), HOY)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.motivo).toContain('C-0031')
      expect(r.motivo).toContain('historias')
    }
  })

  it('un canje ya cerrado no bloquea, aunque tuviera vencidos', () => {
    const cerrado = { ...vencido, canje: { id: 31, estado: 'cerrado' as const } }
    expect(puedeProponerCanje({ vetada: false }, [cerrado], cfg({ bloquear_por_vencidos: true }), HOY)).toEqual({ ok: true })
  })

  it('el veto manual frena SIEMPRE, esté como esté la config', () => {
    // Alguien lo decidió a mano: no lo revierte un flag.
    const r = puedeProponerCanje({ vetada: true, vetada_motivo: 'no cumplió nunca' }, [], cfg(), HOY)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toContain('no cumplió nunca')
  })
})

// ── El cierre ────────────────────────────────────────────────────────────────────

describe('faltantesParaCerrarCanje', () => {
  const listo = canje({ estado: 'en_curso' })
  const ents = [entregable({ cantidad_comprometida: 1, vence_el: '2026-06-11' })]
  const evs = [evidencia()]

  it('con todo hecho no falta nada', () => {
    expect(faltantesParaCerrarCanje(listo, ents, evs, HOY)).toEqual([])
  })

  it('sin el costo del envío no cierra: sin eso el balance miente', () => {
    const f = faltantesParaCerrarCanje(canje({ estado: 'en_curso', envio_costo: null }), ents, evs, HOY)
    expect(f.join(' ')).toContain('costo del envío')
  })

  it('con un entregable obligatorio sin verificar, lo dice con la cantidad y el tipo', () => {
    const f = faltantesParaCerrarCanje(listo, [entregable({ cantidad_comprometida: 2 })], [evidencia()], HOY)
    expect(f.join(' ')).toContain('verificar 1 historia de instagram')
  })

  it('una evidencia cargada y sin mirar traba: o se verifica o se rechaza', () => {
    const f = faltantesParaCerrarCanje(listo, ents, [evidencia({ id: 1 }), evidencia({ id: 2, verificada: false })], HOY)
    expect(f.join(' ')).toContain('1 evidencia sin verificar')
  })

  it('la plata sin pagar traba, y con el monto adentro', () => {
    const c = canje({ estado: 'en_curso', tipo: 'producto_plata', monto_plata: 30000, pago_estado: 'pendiente' })
    expect(faltantesParaCerrarCanje(c, ents, evs, HOY).join(' ')).toContain('30.000')
  })

  it('sin marcar la entrega no cierra', () => {
    const c = canje({ estado: 'en_curso', entregado_at: null })
    expect(faltantesParaCerrarCanje(c, ents, evs, HOY).join(' ')).toContain('le llegó')
  })
})

describe('calcularBalance', () => {
  it('suma productos, envío y plata', () => {
    const c = canje({ tipo: 'producto_plata', monto_plata: 30000, envio_costo: 5000 })
    const b = calcularBalance(c, [item({ costo_unit: 10000, cantidad: 2 })])
    expect(b.costo_productos).toBe(20000)
    expect(b.costo_envio).toBe(5000)
    expect(b.costo_plata).toBe(30000)
    expect(b.costo_total).toBe(55000)
  })

  it('en un canje sin plata, la plata no suma aunque el campo tenga algo', () => {
    // Pasa al cambiar el tipo después de haber cargado un monto.
    const c = canje({ tipo: 'producto', monto_plata: 30000 })
    expect(calcularBalance(c, []).costo_plata).toBe(0)
  })

  it('los items quitados no entran al costo', () => {
    const b = calcularBalance(canje(), [item({ id: 1 }), item({ id: 2, estado: 'quitado' })])
    expect(b.costo_productos).toBe(10000)
  })

  it('sin alcance no hay CPM: un 0 se leería como "gratis"', () => {
    expect(calcularBalance(canje({ balance_alcance: null }), [item()]).cpm).toBeNull()
    expect(calcularBalance(canje({ balance_alcance: 0 }), [item()]).cpm).toBeNull()
  })

  it('con alcance, el CPM es costo por cada mil', () => {
    const b = calcularBalance(canje({ envio_costo: 5000, balance_alcance: 10000 }), [item({ costo_unit: 5000 })])
    // (5000 + 5000) / 10000 × 1000 = 1000
    expect(b.cpm).toBe(1000)
  })
})

describe('pideSeguimiento', () => {
  it('sólo Correo y Andreani tienen código que seguir', () => {
    expect(pideSeguimiento('correo')).toBe(true)
    expect(pideSeguimiento('andreani')).toBe(true)
    // Pedirle un código a un cadete es pedir un dato que no existe.
    expect(pideSeguimiento('cadete')).toBe(false)
    expect(pideSeguimiento('presencial')).toBe(false)
    expect(pideSeguimiento(null)).toBe(false)
  })
})

// ── Los mensajes ─────────────────────────────────────────────────────────────────

const lucia = { nombre: 'Lucía', apellido: 'Pérez', instagram: 'lucia.mkp', instagram_raw: 'Lucia.MKP' }

describe('mensajeSondeo — el PRIMER contacto', () => {
  it('pregunta si le interesa sin decir ni un número: el trato es el segundo mensaje', () => {
    const m = mensajeSondeo(lucia, 'bdi', { titulo: 'Girlhood Collection' })
    expect(m).toContain('Lucía')
    expect(m).toContain('Girlhood Collection')
    expect(m).toContain('Si te interesa sumarte')
    // Esta es LA barrera: si el sondeo empieza a decir el trato, dejan de ser dos pasos.
    expect(m).not.toMatch(/\d/)
  })

  it('el nombre cambia con la persona, y sin nombre saluda por el @', () => {
    expect(mensajeSondeo({ ...lucia, nombre: 'Mía' }, 'bdi')).toContain('¡Hola Mía!')
    expect(mensajeSondeo({ instagram: 'lucia.mkp', instagram_raw: 'Lucia.MKP' }, 'bdi'))
      .toContain('@Lucia.MKP')
  })

  it('sin título nombra la marca: si no, no dice de dónde le escriben', () => {
    const m = mensajeSondeo(lucia, 'zattia')
    expect(m).toContain('Zattia')
    expect(m).not.toContain('lanzamiento')
  })

  it('el adelanto sólo aparece si se lo pide: prometerlo de algo publicado se nota', () => {
    expect(mensajeSondeo(lucia, 'bdi', { titulo: 'Girlhood Collection' }))
      .not.toContain('avance exclusivo')
    expect(mensajeSondeo(lucia, 'bdi', { titulo: 'Girlhood Collection', adelanto: true }))
      .toContain('avance exclusivo')
  })
})

describe('mensajePropuesta — el segundo mensaje', () => {
  const pide = [
    { tipo: 'historia_ig' as const, cantidad_comprometida: 3 },
    { tipo: 'reel_ig' as const, cantidad_comprometida: 1 },
  ]

  it('dice la marca, qué se le manda y qué esperamos, en un solo mensaje', () => {
    const c = canje({
      store: 'bdi', tope_tipo: 'unidades',
      tope_unidades: [{ cantidad: 3, descripcion: 'fundas' }],
    })
    const m = mensajePropuesta(lucia, c, pide)
    expect(m).toContain('Lucía')
    expect(m).toContain('BDI')
    expect(m).toContain('3 fundas')
    expect(m).toContain('3 historias de instagram y 1 reel de instagram')
    expect(m).toContain('Avisanos si te interesa')
  })

  it('en modo monto habla en plata', () => {
    const c = canje({ store: 'zattia', tope_tipo: 'monto', tope_pvp: 80000 })
    expect(mensajePropuesta(lucia, c, pide)).toContain('80.000')
  })

  it('con plata de por medio la nombra: es parte del trato', () => {
    const c = canje({ tipo: 'producto_plata', monto_plata: 30000 })
    expect(mensajePropuesta(lucia, c, pide)).toContain('30.000')
  })

  it('sin entregables todavía no promete nada a cambio', () => {
    const m = mensajePropuesta(lucia, canje(), [])
    expect(m).not.toContain('a cambio de')
  })

  it('sin nombre cargado la saluda por el @, no con un hueco', () => {
    const m = mensajePropuesta({ instagram: 'lucia.mkp', instagram_raw: 'Lucia.MKP' }, canje(), pide)
    expect(m).toContain('@Lucia.MKP')
  })
})

describe('mensajeLinkDatos — las dos versiones', () => {
  it('la primera vez le pide los datos', () => {
    const m = mensajeLinkDatos(lucia, 'bdi', 'https://x/canje/abc', true)
    expect(m).toContain('necesitamos algunos datos')
    expect(m).toContain('el modelo de tu celular')
    expect(m).toContain('https://x/canje/abc')
  })

  it('si ya la conocemos, le pide que VERIFIQUE — no que complete de cero', () => {
    // Es la diferencia que evita que suene a que perdimos lo que ya nos dio.
    const m = mensajeLinkDatos(lucia, 'zattia', 'https://x/canje/abc', false)
    expect(m).toContain('Tenemos tus datos de la acción anterior')
    expect(m).toContain('verifiques')
    expect(m).not.toContain('necesitamos algunos datos')
  })

  it('pide talles en Zattia y modelo de celular en BDI', () => {
    expect(mensajeLinkDatos(lucia, 'zattia', 'x', true)).toContain('tus talles')
    expect(mensajeLinkDatos(lucia, 'stunned', 'x', true)).toContain('tus talles')
    expect(mensajeLinkDatos(lucia, 'bdi', 'x', true)).toContain('modelo de tu celular')
  })

  it('sin nombre cargado la saluda por el @, no con un hueco', () => {
    const m = mensajeLinkDatos({ instagram: 'lucia.mkp', instagram_raw: 'Lucia.MKP' }, 'bdi', 'x', true)
    expect(m).toContain('@Lucia.MKP')
  })
})

describe('mensajeDespacho', () => {
  it('con seguimiento manda el código y el link', () => {
    const c = canje({ envio_via: 'correo', envio_seguimiento: '1234' })
    const m = mensajeDespacho(lucia, c, 'https://correo/1234')
    expect(m).toContain('1234')
    expect(m).toContain('https://correo/1234')
  })

  it('presencial no habla de envío: la invita a pasar a buscarlo', () => {
    const m = mensajeDespacho(lucia, canje({ envio_via: 'presencial' }), null)
    expect(m).toContain('pases a buscar')
    expect(m).not.toContain('seguir')
  })

  it('sin código no promete un seguimiento que no existe', () => {
    const m = mensajeDespacho(lucia, canje({ envio_via: 'cadete', envio_seguimiento: null }), null)
    expect(m).not.toContain('código')
  })
})

describe('mensajeIntentoEntrega', () => {
  it('cuenta qué pasó y pide lo que destraba la entrega', () => {
    const c = canje({ envio_via: 'correo', envio_seguimiento: '1234' })
    const m = mensajeIntentoEntrega(lucia, c, 'https://correo/1234')
    expect(m).toContain('no te encontraron')
    expect(m).toContain('horario')
    expect(m).toContain('1234')
    expect(m).toContain('https://correo/1234')
  })

  it('NO promete un segundo intento', () => {
    // El correo suele hacerlo, pero prometerlo desde acá es comprometer algo que no manejamos.
    const m = mensajeIntentoEntrega(lucia, canje({ envio_via: 'cadete', envio_seguimiento: null }), null)
    expect(m).not.toContain('vuelven a pasar mañana')
    expect(m).not.toContain('van a volver')
    expect(m).not.toContain('código')
  })
})

describe('los textos que arman las listas', () => {
  it('listaEntregables concuerda singular y plural, y usa "y" al final', () => {
    expect(listaEntregables([{ tipo: 'historia_ig', cantidad_comprometida: 1 }])).toBe('1 historia de instagram')
    expect(listaEntregables([
      { tipo: 'historia_ig', cantidad_comprometida: 2 },
      { tipo: 'reel_ig', cantidad_comprometida: 1 },
    ])).toBe('2 historias de instagram y 1 reel de instagram')
  })

  it('loQueLeMandamos habla en plata o en unidades según el modo', () => {
    expect(loQueLeMandamos(canje({ tope_tipo: 'monto', tope_pvp: 80000 }))).toContain('80.000')
    expect(loQueLeMandamos(canje({
      tope_tipo: 'unidades',
      tope_unidades: [{ cantidad: 2, descripcion: 'fundas' }, { cantidad: 1, descripcion: 'jean' }],
    }))).toBe('2 fundas y 1 jean')
  })

  it('mensajeAcuerdo deja el plazo atado a la ENTREGA, no a hoy', () => {
    // Al acordar todavía no sabemos cuándo llega el pedido: prometer una fecha sería prometer algo
    // que no controlamos.
    const m = mensajeAcuerdo(lucia, canje(), [{ tipo: 'historia_ig', cantidad_comprometida: 2, plazo_dias: 10 }])
    expect(m).toContain('desde que te llega el pedido')
  })

  it('mensajeRecordatorio no reclama: ofrece más tiempo', () => {
    const m = mensajeRecordatorio(lucia, [{ tipo: 'historia_ig', cuantas: 2 }])
    expect(m).toContain('2 historias de instagram')
    expect(m).toContain('necesitás más tiempo')
  })
})
