/**
 * Acciones in-place del panel Gerencial que ESCRIBEN. Reusan las funciones de dominio
 * y la disciplina de escritura de cada sección — no abren un camino nuevo.
 *
 * Aprobar/rechazar consumos internos: misma disciplina que Solicitudes internas
 * (`useSolicitudesInternas.persistir`) — releer la lista fresca del KV y re-aplicar la
 * mutación por id (merge por-solicitud), así no se pisa el resto de la lista. `cargado:true`
 * porque acabamos de leer. NO crea ventas ni descuenta stock: eso sigue siendo un paso
 * aparte en la sección (aprobar solo habilita el retiro).
 */

import { guardarLista, leerLista, type Escritura } from '@/lib/kv/cliente'
import { aprobar, rechazar } from '@/lib/solicitudes-internas/core'
import type { SolicitudInterna } from '@/lib/solicitudes-internas/tipos'
import type { Marca } from '@/lib/nav.generated'

async function mutarConsumo(
  marca: Marca,
  solId: string,
  mutar: (s: SolicitudInterna) => SolicitudInterna,
): Promise<Escritura> {
  const fresca = await leerLista<SolicitudInterna>('solicitudesinternas', marca)
  if (!fresca.ok) return { ok: false, motivo: `No se pudo re-leer la lista: ${fresca.motivo}` }
  const lista = fresca.dato.map((s) => (s.id === solId ? mutar(s) : s))
  return guardarLista({ kind: 'solicitudesinternas', store: marca, lista, cargado: true })
}

export function aprobarConsumo(marca: Marca, solId: string, por: string, fecha: string): Promise<Escritura> {
  return mutarConsumo(marca, solId, (s) => aprobar(s, por, fecha))
}

export function rechazarConsumo(
  marca: Marca,
  solId: string,
  motivo: string,
  por: string,
  fecha: string,
): Promise<Escritura> {
  return mutarConsumo(marca, solId, (s) => rechazar(s, motivo, por, fecha))
}
