// El contrato del webhook `oc.confirmada`, ejercido sobre los bytes.
//
// 🔑 **El oráculo de la firma es el emisor, no nosotros**: acá se firma con `node:crypto` tal como
// lo hace el que manda —secreto en base64, HMAC-SHA256 sobre `{id}.{ts}.{cuerpo}`— y se verifica
// con el núcleo. Si las dos puntas usaran la misma función el test no probaría nada.
import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
import { verificarFirma, normalizarEvento, secretoEnBytes, VENTANA_SEGUNDOS } from '../lib/recepciones/webhook.core.js'

const SECRETO_B64 = Buffer.from('un-secreto-de-prueba-largo-1234567890').toString('base64')
const AHORA_MS = 1787744176000
const TS = String(Math.floor(AHORA_MS / 1000))
const ID = 'msg_tl73SrpnJ-xhgTvMED3voOJY'

/** Firma como firma el emisor: sobre los BYTES del cuerpo. */
function firmar(cuerpo: Buffer | string, { id = ID, ts = TS, secreto = SECRETO_B64 } = {}) {
  const bytes = Buffer.isBuffer(cuerpo) ? cuerpo : Buffer.from(cuerpo, 'utf8')
  const clave = Buffer.from(secreto.replace(/^whsec_/, ''), 'base64')
  const contenido = Buffer.concat([Buffer.from(`${id}.${ts}.`, 'utf8'), bytes])
  return 'v1,' + crypto.createHmac('sha256', clave).update(contenido).digest('base64')
}

const verificar = (cuerpo: Buffer | string, firma: string, extra: Record<string, unknown> = {}) =>
  verificarFirma({ id: ID, timestamp: TS, firma, cuerpo, secreto: SECRETO_B64, ahoraMs: AHORA_MS, crypto, ...extra })

const CUERPO = JSON.stringify({
  type: 'oc.confirmada',
  timestamp: '2026-08-26T14:31:58Z',
  data: {
    orden_compra: { id: 42, label: 'OC-0042', estado: 'confirmada', fecha_compra: '2026-08-20', fecha_ingreso: '2026-08-25' },
    negocio: { id: 1, nombre: 'Zattia', slug: 'zattia' },
    proveedor: { id: 7, nombre: 'Textil Sur' },
    totales: { productos: 1, lineas: 1, unidades_pedidas: 12, unidades_contadas: 10, diferencia_unidades: -2, lineas_con_diferencia: 1 },
    lineas: [
      {
        sku: 'REM-0007-NG-M', codigo_barras: 'REM0007NGM', nombre: 'Remera Oversize', talle: 'M', color: 'Negro',
        cantidad_pedida: 12, cantidad_contada: 10, diferencia: -2, observaciones: '2 con falla', es_nuevo: false,
      },
    ],
  },
})

describe('la firma', () => {
  it('acepta la que arma el emisor', () => {
    expect(verificar(CUERPO, firmar(CUERPO))).toEqual({ ok: true })
  })

  it('🔴 rechaza el cuerpo REPARSEADO — la trampa que rompe a todo el que recibe', () => {
    // `JSON.parse` + `JSON.stringify` devuelve un JSON equivalente y bytes distintos. Es el error
    // más común del receptor, y falla con "firma inválida", que no se parece a su causa.
    const reparseado = JSON.stringify(JSON.parse(CUERPO))
    const conEspacios = JSON.stringify(JSON.parse(CUERPO), null, 2)
    expect(conEspacios).not.toBe(CUERPO)
    expect(verificar(conEspacios, firmar(CUERPO)).status).toBe(401)
    // Y el caso que engaña: si el emisor serializa igual que nosotros, reparsear "funciona" — por
    // eso no se puede confiar en él ni una vez.
    expect(verificar(reparseado, firmar(CUERPO)).ok).toBe(reparseado === CUERPO)
  })

  it('🔴 firma sobre BYTES, no sobre string: un cuerpo con acentos y emoji valida', () => {
    const cuerpo = Buffer.from(JSON.stringify({ type: 'oc.confirmada', nota: 'ñandú — 12 unidades ✅' }), 'utf8')
    expect(verificar(cuerpo, firmar(cuerpo))).toEqual({ ok: true })
  })

  it('un solo byte cambiado la tira abajo', () => {
    const firma = firmar(CUERPO)
    expect(verificar(CUERPO.replace('10', '11'), firma).status).toBe(401)
  })

  it('la firma de OTRO mensaje no sirve para éste', () => {
    expect(verificar(CUERPO, firmar(CUERPO, { id: 'msg_otro' })).status).toBe(401)
  })

  it('acepta varias firmas separadas por espacio (rotación de secreto)', () => {
    const vieja = firmar(CUERPO, { secreto: Buffer.from('el-secreto-viejo-de-antes').toString('base64') })
    const nueva = firmar(CUERPO)
    expect(verificar(CUERPO, `${vieja} ${nueva}`)).toEqual({ ok: true })
    expect(verificar(CUERPO, `${nueva} ${vieja}`)).toEqual({ ok: true })
    // Y si NINGUNA es la nuestra, no pasa: el "alcanza con una" no puede ser "alcanza con que haya".
    expect(verificar(CUERPO, `${vieja} ${vieja}`).status).toBe(401)
  })

  it('una versión que no es v1 no vale, aunque el hash coincida', () => {
    expect(verificar(CUERPO, firmar(CUERPO).replace('v1,', 'v2,')).status).toBe(401)
    expect(verificar(CUERPO, firmar(CUERPO).replace('v1,', '')).status).toBe(401)
  })

  it('acepta el secreto con y sin el prefijo whsec_', () => {
    const conPrefijo = 'whsec_' + SECRETO_B64
    expect(secretoEnBytes(conPrefijo)).toEqual(secretoEnBytes(SECRETO_B64))
    expect(verificar(CUERPO, firmar(CUERPO), { secreto: conPrefijo })).toEqual({ ok: true })
  })
})

describe('la ventana de 5 minutos', () => {
  const viejo = String(Math.floor(AHORA_MS / 1000) - VENTANA_SEGUNDOS - 1)
  const futuro = String(Math.floor(AHORA_MS / 1000) + VENTANA_SEGUNDOS + 1)

  it('rechaza con 400 lo que se mandó hace más de 5 minutos', () => {
    const r = verificar(CUERPO, firmar(CUERPO, { ts: viejo }), { timestamp: viejo })
    expect(r.status).toBe(400)
  })

  it('rechaza también lo que dice venir del FUTURO', () => {
    expect(verificar(CUERPO, firmar(CUERPO, { ts: futuro }), { timestamp: futuro }).status).toBe(400)
  })

  it('acepta el borde de la ventana', () => {
    const borde = String(Math.floor(AHORA_MS / 1000) - VENTANA_SEGUNDOS)
    expect(verificar(CUERPO, firmar(CUERPO, { ts: borde }), { timestamp: borde })).toEqual({ ok: true })
  })
})

describe('las cabeceras y el secreto', () => {
  it('sin webhook-id o sin timestamp es 400', () => {
    expect(verificar(CUERPO, firmar(CUERPO), { id: '' }).status).toBe(400)
    expect(verificar(CUERPO, firmar(CUERPO), { timestamp: '' }).status).toBe(400)
  })

  it('un timestamp que no es número es 400, no 401', () => {
    expect(verificar(CUERPO, firmar(CUERPO), { timestamp: 'ayer' }).status).toBe(400)
  })

  it('🔑 sin secreto cargado es 503 y NO 401 — el reintento del emisor sí lo arregla', () => {
    const r = verificar(CUERPO, firmar(CUERPO), { secreto: '' })
    expect(r.status).toBe(503)
  })

  it('sin firma es 401', () => {
    expect(verificar(CUERPO, '').status).toBe(401)
  })
})

describe('normalizarEvento', () => {
  const ev = JSON.parse(CUERPO)

  /**
   * El núcleo es `.js`: TypeScript unifica sus dos formas de retorno en un solo objeto con todo
   * opcional y no puede discriminar por `ok`. Acá se afirma la rama buena una vez, en lugar de
   * salpicar `!` por cada expectativa.
   */
  function normalizado(entrada: unknown) {
    const r = normalizarEvento(entrada)
    expect(r.ok).toBe(true)
    return r as typeof r & { oc: NonNullable<typeof r.oc>; lineas: NonNullable<typeof r.lineas> }
  }

  it('pasa el evento a la fila de la OC', () => {
    const r = normalizado(ev)
    expect(r.oc.id).toBe('zattia:42')
    expect(r.oc.oc_label).toBe('OC-0042')
    expect(r.oc.proveedor_nombre).toBe('Textil Sur')
    expect(r.oc.unidades_pedidas).toBe(12)
    expect(r.lineas).toHaveLength(1)
    expect(r.lineas[0].id).toBe('zattia:42:0')
    expect(r.lineas[0].oc_ref).toBe('zattia:42')
  })

  it('🔑 un tipo desconocido NO es un error: es "no es para nosotros"', () => {
    const r = normalizarEvento({ ...ev, type: 'oc.anulada' })
    expect(r.ok).toBe(false)
    expect(r.motivo).toBe('tipo')
  })

  it('un negocio que no es ninguna de las dos marcas no entra', () => {
    const r = normalizarEvento({ ...ev, data: { ...ev.data, negocio: { slug: 'otra' } } })
    expect(r).toMatchObject({ ok: false, motivo: 'store' })
  })

  it('sin id de orden no hay clave: no entra', () => {
    const r = normalizarEvento({ ...ev, data: { ...ev.data, orden_compra: { label: 'OC-?' } } })
    expect(r).toMatchObject({ ok: false, motivo: 'oc' })
  })

  it('🔴 recalcula la diferencia del renglón en vez de copiarla', () => {
    const roto = { ...ev, data: { ...ev.data, lineas: [{ ...ev.data.lineas[0], diferencia: 99 }] } }
    expect(normalizado(roto).lineas[0].diferencia).toBe(-2)
  })

  it('🔴 separa faltantes de sobrantes: un neto en cero puede esconder dos problemas', () => {
    const dos = {
      ...ev,
      data: {
        ...ev.data,
        totales: { ...ev.data.totales, lineas: 2, unidades_pedidas: 20, unidades_contadas: 20, diferencia_unidades: 0 },
        lineas: [
          { sku: 'A-M', cantidad_pedida: 10, cantidad_contada: 8 },
          { sku: 'A-L', cantidad_pedida: 10, cantidad_contada: 12 },
        ],
      },
    }
    const r = normalizado(dos)
    expect(r.oc.diferencia_unidades).toBe(0)
    expect(r.oc.unidades_faltantes).toBe(2)
    expect(r.oc.unidades_sobrantes).toBe(2)
    expect(r.oc.cumplimiento).toBe(1)
  })

  it('⛔ sin nada pedido el cumplimiento es null, no 0 ni 100%', () => {
    const vacio = {
      ...ev,
      data: { ...ev.data, totales: { lineas: 1 }, lineas: [{ sku: 'A', cantidad_pedida: 0, cantidad_contada: 0 }] },
    }
    expect(normalizado(vacio).oc.cumplimiento).toBeNull()
  })

  it('marca la OC cuyos totales no cierran contra sus propios renglones', () => {
    const mentiroso = { ...ev, data: { ...ev.data, totales: { ...ev.data.totales, unidades_contadas: 99 } } }
    expect(normalizado(mentiroso).oc.totales_coinciden).toBe(false)
  })

  it('⚠️ pero NO la marca si vinieron menos renglones de los que dice la cabecera', () => {
    // El emisor puede recortar los renglones; eso no lo vuelve inconsistente. Sí queda anotado
    // cuántos llegaron de verdad.
    const recortado = { ...ev, data: { ...ev.data, totales: { ...ev.data.totales, lineas: 12, unidades_pedidas: 240, unidades_contadas: 236 } } }
    const r = normalizado(recortado)
    expect(r.oc.totales_coinciden).toBe(true)
    expect(r.oc.lineas_recibidas).toBe(1)
    expect(r.oc.lineas).toBe(12)
  })

  it('una fecha que no es fecha se guarda como null, no como basura', () => {
    const raro = { ...ev, data: { ...ev.data, orden_compra: { ...ev.data.orden_compra, fecha_compra: 'ayer' } } }
    expect(normalizado(raro).oc.fecha_compra).toBeNull()
  })

  it('el cruce con el espejo nace en null: todavía no se preguntó', () => {
    const r = normalizado(ev)
    expect(r.lineas[0].en_gn).toBeNull()
    expect(r.oc.espejo_consultado).toBe(false)
    expect(r.oc.skus_sin_espejo).toBeNull()
  })
})
