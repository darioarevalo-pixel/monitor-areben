/**
 * Adelantos de sueldo — las cuentas de la pantalla. Puro.
 *
 * Un adelanto es un compromiso con `origen = 'empleado'`: un cliente mayorista le transfiere directo
 * a un empleado antes de que se liquide su sueldo. Se anota y se confirma como cualquier otro
 * compromiso; lo distinto es que **nadie en el Monitor sabe si ya entró en un sueldo**. Eso lo sabe
 * el dashboard (los pagos de nómina con `adelanto_id`), y lo manda en `aplicados`.
 *
 * 🔑 Por eso esto CRUZA y no guarda: lo aplicado se lee cada vez. Si se borra una liquidación, el
 * adelanto vuelve a figurar pendiente sin que nadie toque el Monitor.
 */

import type { Compromiso } from '@/lib/compromisos/core'

export type EmpleadoAdelanto = {
  id: string
  nombre: string
  /** Lo que se le pasa al cliente casi siempre (Darío: el CBU es secundario). */
  alias: string | null
  cbu: string | null
  banco: string | null
}

/** Cuánto de un adelanto entró en la nómina de qué mes. Un adelanto puede partirse en dos meses. */
export type Aplicado = { adelanto_id: string; monto: number; mes: string | null }

export type LineaAdelanto = {
  compromiso: Compromiso
  monto: number
  aplicado: number
  /** Lo que todavía no entró en ningún sueldo: espera la próxima liquidación. */
  pendiente: number
  /** Los meses de sueldo en los que entró, en orden. */
  meses: string[]
}

export type AdelantosDeEmpleado = {
  empleadoId: string
  nombre: string
  lineas: LineaAdelanto[]
  /** Confirmados que todavía no entraron en un sueldo. Es el número que se mira. */
  pendiente: number
  /** Pedidos a clientes que todavía no se acreditaron. */
  pedido: number
}

const centavos = (n: number) => Math.round(n * 100) / 100

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre']

/** '2026-09' → 'septiembre'. Con el año sólo si no es el de `hoy` (AAAA-MM-DD). */
export function nombreDelMes(mes: string, hoy?: string): string {
  const [a, m] = mes.split('-')
  const nombre = MESES[Number(m) - 1] ?? mes
  return hoy && hoy.slice(0, 4) !== a ? `${nombre} ${a}` : nombre
}

/**
 * Los meses que se ofrecen al anotar: el anterior, el actual y el siguiente, a partir de HOY en
 * hora local (`hoy` = AAAA-MM-DD, de `hoyISO()`; ⛔ nunca `toISOString`, que después de las 21 ya es
 * mañana). El anterior existe porque se liquida el 1: lo que se adelanta los primeros días del mes
 * suele ser del sueldo del mes que terminó.
 */
export function mesesParaElegir(hoy: string): { anterior: string; actual: string; siguiente: string } {
  const a = Number(hoy.slice(0, 4))
  const m = Number(hoy.slice(5, 7))
  const mes = (ai: number, mi: number) => {
    const d = new Date(ai, mi - 1, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  return { anterior: mes(a, m - 1), actual: mes(a, m), siguiente: mes(a, m + 1) }
}

/**
 * Los adelantos, agrupados por empleado. Entran los pedidos (para saber qué se espera) y los
 * confirmados (con cuánto entró en un sueldo); los cancelados no.
 *
 * `aplicados` es `null` cuando el dashboard no contestó: ahí no se sabe nada de lo aplicado y la
 * pantalla lo tiene que decir, en vez de mostrar todo como pendiente.
 */
export function adelantosPorEmpleado(
  compromisos: Compromiso[],
  aplicados: Aplicado[] | null,
): AdelantosDeEmpleado[] {
  const porAdelanto = new Map<string, { monto: number; meses: Set<string> }>()
  for (const a of aplicados ?? []) {
    const x = porAdelanto.get(a.adelanto_id) ?? { monto: 0, meses: new Set<string>() }
    x.monto += Number(a.monto)
    if (a.mes) x.meses.add(a.mes)
    porAdelanto.set(a.adelanto_id, x)
  }

  const grupos = new Map<string, AdelantosDeEmpleado>()
  for (const c of compromisos) {
    if (c.origen !== 'empleado' || c.estado === 'cancelado') continue
    const g = grupos.get(c.acreedor_id) ?? {
      empleadoId: c.acreedor_id, nombre: c.acreedor_nombre, lineas: [], pendiente: 0, pedido: 0,
    }
    if (c.estado === 'confirmado') {
      const monto = Number(c.monto_confirmado ?? c.monto)
      const ap = c.operacion_id ? porAdelanto.get(c.operacion_id) : undefined
      const aplicado = centavos(Math.min(monto, ap?.monto ?? 0))
      const pendiente = centavos(monto - aplicado)
      g.lineas.push({ compromiso: c, monto, aplicado, pendiente, meses: [...(ap?.meses ?? [])].sort() })
      g.pendiente = centavos(g.pendiente + pendiente)
    } else {
      g.pedido = centavos(g.pedido + Number(c.monto))
    }
    grupos.set(c.acreedor_id, g)
  }

  for (const g of grupos.values()) {
    // El más reciente arriba: es el que se está buscando cuando se abre la ficha.
    g.lineas.sort((a, b) => String(b.compromiso.fecha_acreditado ?? '').localeCompare(String(a.compromiso.fecha_acreditado ?? '')))
  }
  return [...grupos.values()].sort((a, b) => b.pendiente - a.pendiente || a.nombre.localeCompare(b.nombre))
}
