import { describe, expect, it } from 'vitest'
import {
  DIAS_TRABADO,
  armarSolapas,
  esDelCorreo,
  instanteCorreo,
  leerHistoriaCorreo,
  situacionDe,
  tramosDeFechas,
} from '@/lib/seguimiento-envios/core.core.js'

const AHORA = Date.parse('2026-11-05T12:00:00-03:00')

/** Como lo manda el Correo: sin cerrar los `<tr>`, la más nueva primero. */
function html(...filas: [string, string, string, string][]) {
  return (
    '<p>Resultados</p><table><thead><tr><th>Fecha</th></tr></thead><tbody>' +
    filas
      .map(([f, p, h, e]) => `<tr><td data-title="Fecha:">${f}</td><td data-title="Planta:">${p}</td><td data-title="Historia:">${h}</td><td data-title="Estado:">${e}</td>`)
      .join('') +
    '</tbody></table>'
  )
}

const hist = (...f: [string, string, string, string][]) => leerHistoriaCorreo(html(...f))

describe('leerHistoriaCorreo', () => {
  it('lee las filas sin `</tr>` y ordena la más nueva primero', () => {
    const f = hist(
      ['01-11-2026 10:00', 'A', 'INGRESO AL CORREO', ''],
      ['03-11-2026 10:00', 'B', 'INTENTO DE ENTREGA', 'EN ESPERA EN SUCURSAL'],
    )
    expect(f.map((x) => x.planta)).toEqual(['B', 'A'])
    expect(f[0]).toMatchObject({ historia: 'INTENTO DE ENTREGA', estado: 'EN ESPERA EN SUCURSAL' })
  })

  it('una página sin filas o con otro formato de fecha da vacío: es lo que dispara el aviso', () => {
    expect(leerHistoriaCorreo('<p>Sin resultados</p>')).toEqual([])
    expect(leerHistoriaCorreo(html(['2026/11/03', 'A', 'B', '']))).toEqual([])
    expect(instanteCorreo('cualquier cosa')).toBeNull()
  })
})

describe('situacionDe', () => {
  it('en sucursal sin haber retornado: lo retira el cliente', () => {
    const f = hist(['02-11-2026 10:00', 'FUNES', 'INTENTO DE ENTREGA', 'EN ESPERA EN SUCURSAL'])
    expect(situacionDe(f, AHORA)).toMatchObject({ situacion: 'retiro', dias: 3, volvio: false })
  })

  it('🔴 en sucursal DESPUÉS de retornar: lo buscamos nosotros, ⛔ se le avisa al cliente (BDI #21804)', () => {
    const f = hist(
      ['30-10-2026 10:00', 'OAM-ROSARIO SUCURSAL', 'INTENTO DE ENTREGA', 'EN ESPERA EN SUCURSAL'],
      ['23-10-2026 10:00', 'X', 'INTENTO DE ENTREGA', 'RETORNAND0'],
      ['23-10-2026 09:00', 'X', 'INTENTO DE ENTREGA', 'PLAZO VENCIDO NO RECLAMO'],
      ['15-10-2026 10:00', 'X', 'INTENTO DE ENTREGA', 'EN ESPERA EN SUCURSAL'],
    )
    expect(situacionDe(f, AHORA)).toMatchObject({ situacion: 'retiro', volvio: true })
  })

  it('🔴 ENTREGADO después de RETORNAND0 con cero: volvió, ⛔ lo recibió el cliente (BDI #21698)', () => {
    const f = hist(
      ['23-10-2026 10:00', 'CDD 01 ROSARIO', 'INTENTO DE ENTREGA', 'ENTREGADO'],
      ['19-10-2026 10:00', 'X', 'INTENTO DE ENTREGA', 'RETORNAND0'],
    )
    expect(situacionDe(f, AHORA)).toMatchObject({ situacion: 'volvio', volvio: true })
  })

  it('ENTREGADO sin retorno y ENTREGA EN SUCURSAL son entregas', () => {
    expect(situacionDe(hist(['04-11-2026 10:00', 'X', 'INTENTO DE ENTREGA', 'ENTREGADO']), AHORA).situacion).toBe('entregado')
    expect(situacionDe(hist(['04-11-2026 10:00', 'X', 'INTENTO DE ENTREGA', 'ENTREGA EN SUCURSAL']), AHORA).situacion).toBe('entregado')
  })

  it('RESCATADA ⇒ el retorno se frenó y la entrega es real (BDI #20981)', () => {
    const f = hist(
      ['01-09-2026 10:00', 'AGEN.CASANOVA', 'INTENTO DE ENTREGA', 'ENTREGA EN SUCURSAL'],
      ['26-08-2026 10:00', 'X', 'INTENTO DE ENTREGA', 'RETORNAND0'],
      ['26-08-2026 09:00', 'X', 'INTENTO DE ENTREGA', 'RESCATADA'],
    )
    expect(situacionDe(f, AHORA).situacion).toBe('entregado')
  })

  it('robado va a Trabados sin esperar el umbral', () => {
    const f = hist(['05-11-2026 09:00', '#CONTROL', 'INTENTO DE ENTREGA', 'Lamentamos comunicarle que su envío fue sustraído en un asalto'])
    expect(situacionDe(f, AHORA)).toMatchObject({ situacion: 'trabado', motivo: 'robado', dias: 0 })
  })

  it('el umbral de Trabados corta justo en DIAS_TRABADO', () => {
    const haceDias = (n: number) => {
      const d = new Date(AHORA - n * 86_400_000)
      const p = (x: number) => String(x).padStart(2, '0')
      return `${p(d.getUTCDate())}-${p(d.getUTCMonth() + 1)}-${d.getUTCFullYear()} 10:00`
    }
    const con = (n: number) => situacionDe(hist([haceDias(n), 'X', 'EN PROCESO DE CLASIFICACIÓN', '']), AHORA).situacion
    expect(con(DIAS_TRABADO - 1)).toBe('en-camino')
    expect(con(DIAS_TRABADO)).toBe('trabado')
  })

  it('sin historia ⛔ es «en camino»', () => {
    expect(situacionDe([], AHORA).situacion).toBe('sin-datos')
  })
})

describe('esDelCorreo', () => {
  const o = { envio_estado: 'shipped', estado_orden: 'open', envio_tracking: 'C1', envio: 'Punto de retiro' }
  it('sólo despachado, con código, sin cancelar y que no sea Andreani', () => {
    expect(esDelCorreo(o)).toBe(true)
    expect(esDelCorreo({ ...o, envio_estado: 'unpacked' })).toBe(false)
    expect(esDelCorreo({ ...o, estado_orden: 'cancelled' })).toBe(false)
    expect(esDelCorreo({ ...o, envio_tracking: null })).toBe(false)
    expect(esDelCorreo({ ...o, envio: 'Andreani a domicilio' })).toBe(false)
  })
})

describe('tramosDeFechas', () => {
  it('cubre los días pedidos sin huecos', () => {
    const t = tramosDeFechas(new Date('2026-11-05T12:00:00Z'), 40, 15)
    expect(t).toHaveLength(3)
    expect(t[0].hasta.toISOString().slice(0, 10)).toBe('2026-11-05')
    expect(t[2].desde.toISOString().slice(0, 10)).toBe('2026-09-27')
    for (let i = 1; i < t.length; i++) {
      expect(t[i - 1].desde.getTime() - t[i].hasta.getTime()).toBe(86_400_000)
    }
  })
})

describe('armarSolapas', () => {
  const orden = (n: number) => ({ id: n, number: n, cliente: `C${n}`, envio_tipo: 'pickup', envio_tracking: `T${n}`, fecha: '2026-10-01' })
  it('reparte, ordena el más viejo primero y ⛔ pierde lo que no se pudo leer', () => {
    const r = armarSolapas(
      [
        { tienda: 'bdi', orden: orden(1), filas: hist(['04-11-2026 10:00', 'A', 'I', 'EN ESPERA EN SUCURSAL']) },
        { tienda: 'bdi', orden: orden(2), filas: hist(['25-10-2026 10:00', 'B', 'I', 'EN ESPERA EN SUCURSAL']) },
        { tienda: 'bdi', orden: orden(3), filas: hist(['01-10-2026 10:00', 'C', 'EN PROCESO DE CLASIFICACIÓN', '']) },
        { tienda: 'bdi', orden: orden(4), filas: null },
        { tienda: 'bdi', orden: orden(5), filas: hist(['04-11-2026 10:00', 'D', 'EN PROCESO', '']) },
        { tienda: 'bdi', orden: orden(6), filas: hist(['04-11-2026 10:00', 'E', 'I', 'ENTREGADO']) },
        { tienda: 'bdi', orden: orden(7), filas: hist(['04-11-2026 10:00', 'CDD', 'I', 'ENTREGADO'], ['01-11-2026 10:00', 'E', 'I', 'RETORNAND0']) },
      ],
      AHORA,
    )
    expect(r.retiro.map((f: { numero: number }) => f.numero)).toEqual([2, 1])
    expect(r.trabados.map((f: { numero: number }) => f.numero)).toEqual([3])
    expect(r.resumen.sinLeer.map((x: { numero: number }) => x.numero)).toEqual([4])
    expect(r.volvieron.map((f: { numero: number; planta: string }) => [f.numero, f.planta])).toEqual([[7, 'CDD']])
    expect(r.resumen).toMatchObject({ consultados: 7, enCamino: 1, entregados: 1 })
  })
})
