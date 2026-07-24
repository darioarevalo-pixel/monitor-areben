/**
 * Acciones in-place del panel Gerencial que ESCRIBEN. Reusan las funciones de dominio
 * y la disciplina de escritura de cada sección — no abren un camino nuevo.
 *
 * Aprobar/rechazar consumos internos: misma disciplina que la sección — releer fresco y
 * re-aplicar la mutación por id, y guardar SOLO esa solicitud (Fase 2A: el destino es la
 * tabla `solicitudes`, no el KV). NO crea ventas ni descuenta stock: eso sigue siendo un
 * paso aparte en la sección (aprobar solo habilita el retiro).
 */

import type { Escritura } from '@/lib/kv/cliente'
import { guardarSolicitud, leerCajon } from '@/lib/solicitudes/cajon'
import { aprobar, rechazar } from '@/lib/solicitudes-internas/core'
import type { SolicitudInterna } from '@/lib/solicitudes-internas/tipos'
import type { Marca } from '@/lib/nav.datos'

async function mutarConsumo(
  marca: Marca,
  solId: string,
  mutar: (s: SolicitudInterna) => SolicitudInterna,
): Promise<Escritura> {
  const fresca = await leerCajon<SolicitudInterna>('solicitudesinternas', marca)
  if (!fresca.ok) return { ok: false, motivo: `No se pudo re-leer la lista: ${fresca.motivo}` }
  const sol = fresca.dato.find((s) => s.id === solId)
  if (!sol) return { ok: false, motivo: 'La solicitud ya no está en la lista.' }
  const r = await guardarSolicitud('solicitudesinternas', marca, mutar(sol))
  // `total` es el contrato de Escritura (venía del KV, donde se guardaba la lista entera):
  // ahora se toca una sola solicitud, así que siempre es 1.
  return r.ok ? { ok: true, total: 1 } : { ok: false, motivo: r.motivo || 'No se pudo guardar.' }
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
