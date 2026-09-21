/**
 * **A dónde va la plata de un compromiso**, sea un acreedor del dashboard o una cuenta manual.
 *
 * # 🔑 Por qué existe este tipo
 *
 * Las dos clases de destino se usan exactamente igual: se elige uno, se ve cuánto se le puede
 * pedir, se copia el alias y se anota el compromiso. Lo único que cambia es de dónde sale el techo
 * —la deuda que calcula el dashboard, o el monto que alguien cargó a mano— y qué pasa al confirmar.
 *
 * Sin un tipo común, esa diferencia se filtra a cada pantalla: el formulario de la sección, el del
 * panel de WhatsApp y la lista tendrían cada uno un `if` para saber con qué número comparar. Es
 * justo la forma que ya fabricó dos bugs de plata en este circuito (dos formularios de confirmar,
 * uno arreglado y el otro no). Acá la diferencia se traduce **una vez**, en la frontera, y de ahí
 * para adentro hay un solo camino.
 *
 * ⛔ No decide nada: sólo traduce. El control de "no pedir más de lo que falta" lo aplica el
 * servidor, con los números frescos.
 */

import type { Acreedor, CuentaBancaria } from '@/lib/acreedores/cliente'
import type { CuentaManual } from '@/lib/cuentas/cliente'

export type DestinoCompromiso = {
  /** El id que va en `acreedor_id`: el del proveedor en el dashboard, o el de la cuenta manual. */
  id: string
  nombre: string
  /**
   * Cuánto se le puede imputar en total, ANTES de descontar lo ya comprometido acá. Es el número
   * que entra en `sePuedeComprometer`, y por eso los dos mundos tienen que traducirlo a lo mismo:
   * del acreedor es `disponible` (su deuda menos los cheques en la calle), de una cuenta manual es
   * lo que falta juntar.
   */
  disponible: number
  cuentas: CuentaBancaria[]
  origen: 'dashboard' | 'manual'
  /** Sólo en las manuales: contra qué vuelta se controla. */
  objetivoId: string | null
  /** Para qué es, cuando la cuenta lo dice. Se muestra abajo del nombre. */
  detalle: string | null
}

export function destinoDeAcreedor(a: Acreedor): DestinoCompromiso {
  return {
    id: a.id,
    nombre: a.nombre,
    disponible: a.disponible,
    cuentas: a.cuentas,
    origen: 'dashboard',
    objetivoId: null,
    detalle: null,
  }
}

/**
 * La cuenta manual como destino. `null` cuando **no se le puede pedir plata a nadie**: está
 * archivada, o está dormida (nadie cargó un monto).
 *
 * ⚠️ Una cuenta dormida no es un error ni una cuenta vacía: es el estado normal de algo que se usa
 * dos veces al año. Por eso desaparece de las listas de "a quién pedirle" en vez de aparecer en
 * cero, que se leería como un problema.
 */
export function destinoDeCuenta(c: CuentaManual): DestinoCompromiso | null {
  if (c.archivada || !c.objetivo || c.objetivo.estado !== 'juntando') return null
  return {
    id: c.id,
    nombre: c.nombre,
    disponible: c.objetivo.falta,
    // Una sola cuenta bancaria y siempre la sugerida: acá no hay varias a dónde elegir, como pasa
    // con un acreedor. Si no tiene alias ni CBU cargado, no se ofrece ninguna en vez de una vacía.
    cuentas: c.cuenta_alias || c.cuenta_cbu
      ? [{
          id: c.id,
          alias: c.cuenta_alias,
          cbu: c.cuenta_cbu,
          banco: c.cuenta_banco,
          titular: c.cuenta_titular,
          sugerida: true,
        }]
      : [],
    origen: 'manual',
    objetivoId: c.objetivo.id,
    detalle: c.objetivo.nota || c.para_que,
  }
}

/**
 * Los datos de la cuenta escritos para **pegar en el chat del cliente**: tres renglones, en el
 * orden en que se leen —a quién, con qué alias, en qué banco— (lo pidió así Bruno, 21-sep-2026,
 * mirándolo con una clienta esperando del otro lado).
 *
 *     Mutual de Socios de la Asociación Médica
 *     Alias: 18855350.5.mutual
 *     Banco: Agil Pagos
 *
 * 🔑 Es un solo texto y no tres campos porque el gesto real es uno: el cliente pregunta a dónde
 * transfiere y hay que pasarle todo junto. Copiar el alias y después el banco son dos viajes al
 * panel en medio de una conversación.
 *
 * ⚠️ **El CBU va sólo si no hay alias.** Si fuera siempre serían cuatro renglones de los cuales el
 * cliente usa uno; pero un mensaje sin alias Y sin CBU no dice a dónde transferir, que es lo único
 * que el mensaje tiene que lograr.
 *
 * ⚠️ Sin cabecera ni saludo a propósito: lo que se le dice al cliente lo escribe quien está
 * hablando, y el mismo texto sirve para pegar en el home banking.
 */
export function datosParaMandar(
  cuenta: { alias: string | null; cbu: string | null; banco: string | null; titular: string | null },
  /** A quién se le paga: el nombre del acreedor o el de la cuenta. Va en el primer renglón. */
  nombre?: string | null,
): string {
  return [
    // El titular manda cuando está cargado: es el nombre que el cliente va a ver en el banco, y si
    // no coincide con el que le pasamos, la transferencia se frena por desconfianza.
    cuenta.titular || nombre,
    cuenta.alias ? `Alias: ${cuenta.alias}` : cuenta.cbu && `CBU: ${cuenta.cbu}`,
    cuenta.banco && `Banco: ${cuenta.banco}`,
  ].filter(Boolean).join('\n')
}

/** Los destinos de una lista de cuentas manuales, sin las dormidas. */
export function destinosDeCuentas(cuentas: CuentaManual[]): DestinoCompromiso[] {
  return cuentas.map(destinoDeCuenta).filter((d): d is DestinoCompromiso => d !== null)
}
