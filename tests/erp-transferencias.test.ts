import { describe, expect, it } from 'vitest'
import { contarVistas, deArmado, deLibro, filtrar, prendasTexto, resumen, vistaDeEntrada } from '@/lib/erp/transferencias.core.js'
import { listaDeTransferencias } from '../api/_erp-stock.js'

// Con la forma de `repo_armado` medida en prod el 20-oct (T-8138 de BDI, recortado).
const transferido = {
  id: 'ra1', store: 'bdi', linea: 'bdi', sentido: 'llevar', persona: 'Lorena Reyes', estado: 'transferido',
  pedido: [
    { vid: '1_1', sku: 'F-1', name: 'GRAFITTI CASE', size: 'iPhone 17', cant: 2 },
    { vid: '2_2', sku: 'F-2', name: 'CLEAR CASE', size: 'iPhone 16', cant: 1 },
  ],
  escaneos: { '1_1': 1, '2_2': 1 }, faltantes: {},
  transfer: { tandas: [{ hora: '2026-10-20T10:41:10.340Z', desde: 13307, hacia: 18393, prendas: { '1_1': 1, '2_2': 1 }, unidades: 2, transfer_id: 8138 }] },
  error: null, creado_en: '2026-10-20T10:40:51.716Z', cerrado_en: '2026-10-20T10:41:10.340Z',
}

describe('ERP › Stock › Transferencias', () => {
  it('un armado transferido: número de GN, depósito → local, pedidas/armadas/enviadas y lo que faltó', () => {
    const f = deArmado(transferido, 'bdi', 2)
    expect(f).toMatchObject({ numero: 'T-8138', desdeTexto: 'Depósito minorista', haciaTexto: 'Local', origenTexto: 'Reposición del monitor', pedidas: 3, armadas: 2, enviadas: 2, faltan: 1, paso: 4, fin: 'rayado', enLibro: 2 })
    expect(prendasTexto(f)).toBe('3 → 2')
    expect(f.renglones.find((r: { vid: string }) => r.vid === '1_1')).toMatchObject({ pedida: 2, armada: 1, enviada: 1 })
  })

  it('una devolución va del local al depósito; un borrador y uno armándose quedan abiertos con su paso', () => {
    expect(deArmado({ ...transferido, sentido: 'devolver' }, 'zattia', 0)).toMatchObject({ desdeTexto: 'Local', haciaTexto: 'Depósito', origenTexto: 'Devolución del monitor' })
    const borrador = deArmado({ ...transferido, estado: 'borrador', escaneos: {}, transfer: null }, 'bdi', 0)
    expect(borrador).toMatchObject({ paso: 1, estadoTexto: 'Borrador', numero: null })
    expect(prendasTexto(borrador)).toBe('3 en borrador')
    const armando = deArmado({ ...transferido, estado: 'en_curso', transfer: null }, 'bdi', 0)
    expect(armando).toMatchObject({ paso: 2, estadoTexto: 'Armándose', faltan: 0 })
    expect(prendasTexto(armando)).toBe('2 de 3 armadas')
    const cancelada = deArmado({ ...transferido, estado: 'cancelado', transfer: null }, 'bdi', 0)
    expect(cancelada).toMatchObject({ paso: 0, fin: 'gris', faltan: 0 })
    const filas = [deArmado(transferido, 'bdi', 2), borrador, armando, cancelada]
    expect(contarVistas(filas)).toEqual({ abiertas: 2, faltantes: 1, hechas: 1, canceladas: 1, todas: 4 })
    expect(vistaDeEntrada(contarVistas(filas))).toBe('abiertas')
    expect(vistaDeEntrada(contarVistas([cancelada]))).toBe('todas')
    expect(resumen(filas, '2026-10')).toEqual({ abiertas: 2, enCamino: 2, hechasMes: 1, conFaltantes: 1, movidas: 2 })
    expect(filtrar(filas, { q: 'grafitti' }).length).toBe(4)
    expect(filtrar(filas, { desde: '2026-10-21' }).length).toBe(0)
  })

  it('una hecha a mano en GN sale del libro: la pata que sale dice de dónde, la que entra adónde', () => {
    const f = deLibro('gn_foto:1', [
      { product_id: 9, size_id: 3, sku: 'Z-9', deposito: 'deposito', cantidad: -2, ocurrido_en: '2026-10-20T15:00:00Z', detalle: { foto: 'x' } },
      { product_id: 9, size_id: 3, sku: 'Z-9', deposito: 'local', cantidad: 2, ocurrido_en: '2026-10-20T15:00:00Z', detalle: { foto: 'x' } },
    ])
    expect(f).toMatchObject({ desdeTexto: 'Depósito', haciaTexto: 'Local', origenTexto: 'A mano en GN', estadoTexto: 'Hecha en GN', enviadas: 2, numero: null, paso: 4 })
  })

  it('el servidor junta los armados con lo que anotó el libro y con las hechas en GN', async () => {
    const pg = {
      query: async (sql: string) => ({
        rows: sql.includes("origen = 'repo'") ? [{ armado: 'ra1', u: 2 }]
          : sql.includes("origen = 'gn_foto'") ? [{ id: 1, grupo: 'g', product_id: 9, size_id: 3, deposito: 'deposito', cantidad: -1, ocurrido_en: '2026-10-20T15:00:00Z', detalle: {} }, { id: 2, grupo: 'g', product_id: 9, size_id: 3, deposito: 'local', cantidad: 1, ocurrido_en: '2026-10-20T15:00:00Z', detalle: {} }]
            : [{ desde: '2026-10-13T11:00:00Z' }],
      }),
    }
    const r = await listaDeTransferencias({ marca: 'bdi' }, { conMotor: (_m: string, _q: string, fn: (pg: unknown) => unknown) => fn(pg), leerArmados: async () => [transferido] })
    expect(r.filas.map((f: { id: string; enLibro: number }) => [f.id, f.enLibro])).toEqual([['repo:ra1', 2], ['libro:g', 1]])
    expect(r.libroDesde).toBe('2026-10-13T11:00:00.000Z')
    expect((await listaDeTransferencias({ marca: 'x' }, { conMotor: async () => ({}) })).status).toBe(400)
  })
})
