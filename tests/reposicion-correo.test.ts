// El correo de las 10:00 de la reposición (`lib/reposicion/correo.core.js`). Lo que importa: que el
// AVISO salga cuando la reposición no se cerró (Darío: a las 10:00 tiene que estar en el local), y
// que lo no encontrado se liste con las veces que ya faltó.
import { describe, it, expect } from 'vitest'
import { armarCorreo, horaAR, resumirArmado } from '@/lib/reposicion/correo.core.js'

const HOY = '2026-10-13'
const L = (vid: string, cant: number, x: Record<string, unknown> = {}) => ({ vid, pid: vid.split('_')[0], sid: vid.split('_')[1], sku: `RTO-${vid}`, barcode: '', name: 'TOP ZOE', size: 'S', cant, exhibir: false, ...x })
const arm = (x: Record<string, unknown>) => ({
  id: 'a1', linea: 'zattia', sentido: 'llevar', fecha: HOY, persona: 'Lorena', estado: 'transferido',
  pedido: [L('1_1', 2), L('2_1', 1, { name: 'BODY LIA', size: 'Variante Única' }), L('3_1', 1)],
  escaneos: { '1_1': 2 }, faltantes: { '2_1': 'no-estaba', '3_1': 'despues' },
  transfer: { tandas: [{ transfer_id: 7750 }], transfer_id: 7750 }, error: null,
  creado_en: '2026-10-13T11:30:00Z', cerrado_en: '2026-10-13T12:08:00Z', ...x,
})

describe('correo de la reposición', () => {
  it('finalizada: hora de Argentina, quién, números y sólo los renglones incompletos', () => {
    const c = armarCorreo({ hoy: HOY, armados: [arm({})], anteriores: [] })
    expect(c.asunto).toBe('Reposición 13-oct: transferida · 1 no encontrada')
    expect(c.texto).toContain('Transferida a las 09:08 · Lorena · 38 min')
    expect(c.texto).toContain('Pedidas 4 · Transferidas 2 · No encontradas 1')
    expect(c.texto).toContain('Transferencia en GN: 7750')
    expect(c.texto).not.toContain('RTO-1_1') // completa: no se lista
    // la no encontrada primero; «Variante Única» no se muestra
    expect(c.texto.indexOf('BODY LIA · faltan 1 de 1 · No encontrada')).toBeLessThan(c.texto.indexOf('Pendiente'))
  })

  it('🔴 sin iniciar: el asunto avisa', () => {
    const c = armarCorreo({ hoy: HOY, armados: [], anteriores: [] })
    expect(c.asunto).toBe('⚠️ Reposición 13-oct: sin iniciar')
    expect(c.html).toContain('No se inició.')
    // Stunned sin movimiento no aparece
    expect(c.texto).not.toContain('STUNNED')
  })

  it('🔴 sin finalizar a las 10 (y uno que quedó abierto de ayer)', () => {
    const c = armarCorreo({ hoy: HOY, armados: [arm({ estado: 'en_curso', fecha: '2026-10-12', cerrado_en: null })], anteriores: [] })
    expect(c.asunto).toBe('⚠️ Reposición 13-oct: sin transferir')
    expect(c.texto).toContain('Sin transferir: iniciada a las 08:30 (iniciada el 12-oct) · Lorena')
    expect(c.texto).toContain('Pedidas 4 · Escaneadas 2')
  })

  it('🔴 transferencia sin confirmar gana al resto', () => {
    const c = armarCorreo({ hoy: HOY, armados: [arm({ estado: 'revisar', error: 'Se cortó la conexión' })], anteriores: [] })
    expect(c.asunto).toBe('⚠️ Reposición 13-oct: transferencia a verificar')
    expect(c.html).toContain('Se cortó la conexión')
  })

  it('⛔ la devolución no va en el correo (Darío, 12-oct)', () => {
    const c = armarCorreo({ hoy: HOY, armados: [arm({}), arm({ id: 'd', sentido: 'devolver', estado: 'revisar' })], anteriores: [] })
    expect(c.asunto).toBe('Reposición 13-oct: transferida · 1 no encontrada')
    expect(c.texto).not.toContain('DEVOLUCIÓN')
  })

  it('un armado finalizado de otro día no entra; los descartados tampoco', () => {
    const c = armarCorreo({ hoy: HOY, armados: [arm({ fecha: '2026-10-12' }), arm({ id: 'x', estado: 'cancelado' })], anteriores: [] })
    expect(c.asunto).toContain('sin iniciar')
  })

  it('cuenta las veces que ya faltó en armados anteriores transferidos', () => {
    const viejo = arm({ id: 'v', fecha: '2026-10-11' })
    const r = resumirArmado(arm({}), new Map([['2_1', 2]]))
    expect(r.renglones[0]).toMatchObject({ nombre: 'BODY LIA', motivo: 'no-estaba', antes: 2 })
    const c = armarCorreo({ hoy: HOY, armados: [arm({})], anteriores: [viejo, arm({ id: 'w', fecha: '2026-10-10', estado: 'en_curso' })] })
    expect(c.texto).toContain('(ya faltó 1 vez en 14 días)')
  })

  it('varias tandas: lista todas las transferencias', () => {
    const c = armarCorreo({ hoy: HOY, armados: [arm({ transfer: { tandas: [{ transfer_id: 7751 }, { transfer_id: 7752 }] } })], anteriores: [] })
    expect(c.texto).toContain('Transferencia en GN: 7751, 7752')
  })

  it('la hora va en Argentina aunque la máquina esté en UTC', () => {
    expect(horaAR('2026-10-13T13:00:00Z')).toBe('10:00')
  })

  it('el HTML escapa los nombres', () => {
    const c = armarCorreo({ hoy: HOY, armados: [arm({ pedido: [L('9_1', 1, { name: '<b>X</b>' })], escaneos: {}, faltantes: {} })], anteriores: [] })
    expect(c.html).not.toContain('<b>X</b>')
    expect(c.html).toContain('&lt;b&gt;X&lt;/b&gt;')
  })
})
