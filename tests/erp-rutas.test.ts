import { describe, expect, it } from 'vitest'
import { avisoDeRuta, descuentosDelMedio, filasDeRutas, leerRutaDePantalla, nombreDeCuenta, CANALES_DE_RUTA, MEDIOS_DE_RUTA } from '@/lib/erp/rutas.core.js'

const ID = '0b6f6a52-6f2e-4f5b-9a1e-1d2c3b4a5f60'
const galicia = { titular: 'areben', nombre: 'Cuenta Corriente', banco: 'Galicia' }
const mpBruno = { titular: 'bruno', nombre: 'Caja de Ahorro', banco: 'Mercado Pago' }
const regla = (x: object) => ({ nombre: 'Transferencia siempre', marca: 'zattia', canal: 'local', medios: ['transferencia'], efecto: 'descuento', pct: 10, activa: true, ...x })

describe('leerRutaDePantalla', () => {
  const lineas = ['zattia', 'stunned']
  it('la línea sale de la marca de la pantalla; sin línea, la marca', () => {
    expect(leerRutaDePantalla({ canal: 'local', medio: 'transferencia', cuenta_real_id: ID, tasa: '1,5', dias_acreditacion: '2' }, { marca: 'zattia', lineas }))
      .toEqual({ ruta: { marca: 'zattia', canal: 'local', medio: 'transferencia', cuenta_real_id: ID, tasa: 1.5, dias_acreditacion: 2 } })
    expect(leerRutaDePantalla({ linea: 'stunned', canal: 'online', medio: 'mp', cuenta_real_id: '' }, { marca: 'zattia', lineas }).ruta)
      .toMatchObject({ marca: 'stunned', cuenta_real_id: null, tasa: null })
  })
  it('lo que no corresponde se dice', () => {
    const err = (b: object, marca = 'zattia') => leerRutaDePantalla(b, { marca, lineas: marca === 'zattia' ? lineas : ['bdi'] }).error
    expect(err({ linea: 'stunned', canal: 'local', medio: 'efectivo' }, 'bdi')).toBe('Línea inválida')
    expect(err({ canal: 'web', medio: 'efectivo' })).toBe('Canal inválido')
    expect(err({ canal: 'local', medio: 'saldo' })).toBe('Medio inválido')
    expect(err({ canal: 'local', medio: 'efectivo', cuenta_real_id: "1; drop" })).toBe('Cuenta inválida')
  })
  it('un `desde` viaja sólo si viene', () => {
    expect(leerRutaDePantalla({ canal: 'local', medio: 'efectivo' }, { marca: 'bdi', lineas: ['bdi'] }).ruta).not.toHaveProperty('desde')
    expect(leerRutaDePantalla({ canal: 'local', medio: 'efectivo', desde: '2026-10-20T03:00:00.000Z' }, { marca: 'bdi', lineas: ['bdi'] }).ruta?.desde).toBe('2026-10-20T03:00:00.000Z')
  })
})

describe('avisoDeRuta (Bruno, 18-oct)', () => {
  const reglas = [regla({}), regla({ nombre: 'Efectivo siempre', medios: ['efectivo'], pct: 15 })]
  it('🔑 a una cuenta que FACTURA con un medio con descuento ⇒ avisa, con el % y la regla', () => {
    expect(avisoDeRuta({ linea: 'zattia', canal: 'local', medio: 'transferencia', cuenta: galicia, reglas }))
      .toBe('Transferencia de Zattia en local tiene −10 % («Transferencia siempre») y ahora va a Galicia · Cuenta Corriente (Areben), que factura. ¿Revisás la regla?')
  })
  it('a una cuenta que ⛔ factura (Bruno, Darío, tercero) ⇒ nada', () => {
    expect(avisoDeRuta({ linea: 'zattia', canal: 'local', medio: 'transferencia', cuenta: mpBruno, reglas })).toBeNull()
  })
  it('el efectivo ⛔ factura aunque caiga en Areben ⇒ nada', () => {
    expect(avisoDeRuta({ linea: 'zattia', canal: 'local', medio: 'efectivo', cuenta: { titular: 'areben', nombre: 'Efectivo', banco: 'Areben' }, reglas })).toBeNull()
  })
  it('sin descuento en ese medio, apagada, de otro canal o «precio final» ⇒ nada', () => {
    expect(avisoDeRuta({ linea: 'zattia', canal: 'local', medio: 'debito', cuenta: galicia, reglas })).toBeNull()
    expect(avisoDeRuta({ linea: 'zattia', canal: 'local', medio: 'transferencia', cuenta: galicia, reglas: [regla({ activa: false })] })).toBeNull()
    expect(avisoDeRuta({ linea: 'zattia', canal: 'online', medio: 'transferencia', cuenta: galicia, reglas })).toBeNull()
    expect(avisoDeRuta({ linea: 'zattia', canal: 'local', medio: 'transferencia', cuenta: galicia, reglas: [regla({ efecto: 'final', pct: null })] })).toBeNull()
  })
  it('«se elige en cada cobro» (sin cuenta) ⇒ nada: ⛔ se sabe adónde va', () => {
    expect(avisoDeRuta({ linea: 'zattia', canal: 'local', medio: 'transferencia', cuenta: null, reglas })).toBeNull()
  })
  it('🔑 Stunned mira las SUYAS si tiene; si ⛔, las de Zattia (como cobra la Caja)', () => {
    expect(descuentosDelMedio(reglas, { linea: 'stunned', canal: 'local', medio: 'transferencia' }).map((r) => r.nombre)).toEqual(['Transferencia siempre'])
    const conPropias = [...reglas, regla({ marca: 'stunned', nombre: 'Stunned transferencia', pct: 5 })]
    expect(descuentosDelMedio(conPropias, { linea: 'stunned', canal: 'local', medio: 'transferencia' }).map((r) => r.nombre)).toEqual(['Stunned transferencia'])
    const stunnedSinTransferencia = [...reglas, regla({ marca: 'stunned', nombre: 'Stunned efectivo', medios: ['efectivo'] })]
    expect(avisoDeRuta({ linea: 'stunned', canal: 'local', medio: 'transferencia', cuenta: galicia, reglas: stunnedSinTransferencia })).toBeNull()
  })
})

describe('filasDeRutas', () => {
  it('una fila por canal × medio, con la vigente, si factura y su aviso', () => {
    const vigentes = [{
      canal: 'local', medio: 'transferencia', proxima: null,
      vigente: { id: '1', cuenta_real_id: ID, cuenta_titular: 'areben', cuenta_nombre: 'Cuenta Corriente', cuenta_banco: 'Galicia', cuenta_activa: true, desde: '2026-10-18T15:00:00Z' },
    }, { canal: 'mayorista', medio: 'transferencia', proxima: null, vigente: { id: '2', cuenta_real_id: null, desde: '2026-10-18T15:00:00Z' } }]
    const filas = filasDeRutas(vigentes, { linea: 'zattia', reglas: [regla({})] })
    expect(filas).toHaveLength(CANALES_DE_RUTA.length * MEDIOS_DE_RUTA.length)
    const t = filas.find((f) => f.canal === 'local' && f.medio === 'transferencia')
    expect([t?.factura, t?.aviso?.startsWith('Transferencia de Zattia en local tiene −10 %'), nombreDeCuenta(t?.cuenta)]).toEqual([true, true, 'Galicia · Cuenta Corriente (Areben)'])
    const may = filas.find((f) => f.canal === 'mayorista' && f.medio === 'transferencia')
    expect([may?.factura, may?.aviso, nombreDeCuenta(may?.cuenta)]).toEqual([null, null, 'Se elige en cada cobro'])
    const sin = filas.find((f) => f.canal === 'local' && f.medio === 'efectivo')
    expect([sin?.vigente, sin?.factura, sin?.aviso]).toEqual([null, null, null])
  })
})
