/**
 * Los cuatro derivadores de avisos. Cada uno es puro: recibe datos y el perfil, y devuelve los
 * avisos que le corresponden a esa persona. Ver `tipos.ts` para por qué se derivan y no se
 * registran.
 *
 * Todos respetan la misma regla de visibilidad que ya usa el resto de Solicitudes: nadie ve un
 * aviso de algo que no vería entrando a la sección.
 */

import { esAdmin, puedeSub, puedeVer, tieneFuncion, type Perfil } from '@/lib/permisos'
import { baseDeLinea } from '@/lib/lineas'
import { numeroCanje, type CanjeStore } from '@/lib/canjes/tipos'
import { faltantes, salio } from '@/lib/sesionfotos/core'
import { veTodo, type ResumenSolicitud } from '@/lib/solicitudes/overview'
import { pendientesDeTrabajo } from '@/lib/inicio/core'
import type { FallaRow } from '@/lib/postventa/fallas/tipos'
import type { Solicitud } from '@/lib/sesionfotos/tipos'
import type { Marca } from '@/lib/nav'
import type { Aviso } from './tipos'

/** ¿Puede aprobar consumos internos en alguna de las dos marcas? */
export function esAprobador(perfil: Perfil | null, marca: Marca): boolean {
  return esAdmin(perfil) || puedeSub(perfil, marca, 'solicitudes-internas', 'aprobar') || puedeSub(perfil, marca, 'solicitudes', 'aprobar')
}

const rutaDe = (r: ResumenSolicitud) => (r.seccion === 'sesion-fotos' ? '/sesion-fotos' : '/solicitudes-internas')

/** Consumos internos esperando el OK de un gerente. Es lo que más traba el flujo: sin aprobar, no se retira. */
export function avisosDeAprobacion(resumenes: ResumenSolicitud[], perfil: Perfil | null, marca: Marca): Aviso[] {
  if (!esAprobador(perfil, marca)) return []
  return resumenes
    .filter((r) => r.estadoLabel === 'Pendiente de aprobar')
    .map((r) => ({
      id: `aprobacion:${r.marca}:${r.id}`,
      tipo: 'aprobacion' as const,
      marca: r.marca,
      titulo: r.titulo || 'Consumo interno',
      detalle: `${r.unidades} u. · ${r.creadoPor || 'sin responsable'}`,
      ruta: '/solicitudes',
      ts: r.creado || 0,
      tono: 'warning' as const,
    }))
}

/**
 * Solicitudes que esperan trabajo de TU sector. Solo para Local y Depósito: quien ve todo no
 * necesita un aviso por cada solicitud abierta de la empresa, le llenaría el contador de ruido.
 */
export function avisosDeSolicitud(resumenes: ResumenSolicitud[], perfil: Perfil | null): Aviso[] {
  if (veTodo(perfil)) return []
  if (!tieneFuncion(perfil, 'local') && !tieneFuncion(perfil, 'deposito')) return []
  return pendientesDeTrabajo(resumenes).map((r) => ({
    id: `solicitud:${r.marca}:${r.id}`,
    tipo: 'solicitud' as const,
    marca: r.marca,
    titulo: r.titulo || 'Solicitud',
    detalle: `${r.unidades} u. · ${r.estadoLabel}`,
    ruta: rutaDe(r),
    ts: r.creado || 0,
    tono: 'brand' as const,
  }))
}

/**
 * Mercadería que salió y no volvió. El reporte ya existía adentro del detalle de cada solicitud,
 * pero había que entrar a mirarlo una por una — o sea que nadie lo perseguía. Es plata parada,
 * así que sube a aviso.
 *
 * Lo ve quien coordina (marketing, administración, dirección), no el sector que prepara.
 */
export function avisosDeNoDevueltos(sols: Solicitud[], marca: Marca, perfil: Perfil | null): Aviso[] {
  if (!veTodo(perfil)) return []
  return sols
    .filter((s) => salio(s) && s.estado !== 'cerrada' && s.estado !== 'devuelta')
    .map((s) => ({ s, falta: faltantes(s).reduce((a, f) => a + f.falta, 0) }))
    .filter((x) => x.falta > 0)
    .map(({ s, falta }) => ({
      id: `no-devuelto:${marca}:${s.id}`,
      tipo: 'no-devuelto' as const,
      marca,
      titulo: s.descripcion || 'Solicitud',
      detalle: `${falta} ${falta === 1 ? 'unidad sin devolver' : 'unidades sin devolver'}`,
      ruta: '/solicitudes',
      // La antigüedad es del pedido: cuanto más viejo, peor.
      ts: s.creado || 0,
      tono: 'danger' as const,
    }))
}

/**
 * Fallas cargadas en el local que todavía no se llevaron al depósito (estado `cargada` con
 * ubicación `local` — la etiqueta ya las llama "Pendiente de envío"). Las ve el local, que las
 * tiene que mandar, y administración, que las espera para recibirlas.
 */
export function avisosDeFallas(fallas: FallaRow[], marca: Marca, perfil: Perfil | null): Aviso[] {
  const leInteresa = esAdmin(perfil) || tieneFuncion(perfil, 'local') || tieneFuncion(perfil, 'administracion') || tieneFuncion(perfil, 'direccion')
  if (!leInteresa) return []
  const pendientes = fallas.filter((f) => f.estado === 'cargada' && (f.ubicacion || 'local') === 'local')
  if (!pendientes.length) return []
  // Una sola línea para todas: son del mismo montón físico y se llevan juntas, así que N avisos
  // separados serían N veces el mismo recordatorio.
  const u = pendientes.reduce((a, f) => a + (Number(f.cantidad) || 1), 0)
  const masVieja = Math.min(...pendientes.map((f) => (f.created_at ? Date.parse(f.created_at) || 0 : 0)).filter(Boolean))
  return [
    {
      id: `falla-por-enviar:${marca}`,
      tipo: 'falla-por-enviar' as const,
      marca,
      titulo: pendientes.length === 1 ? '1 falla para llevar al depósito' : `${pendientes.length} fallas para llevar al depósito`,
      detalle: `${u} ${u === 1 ? 'unidad' : 'unidades'} esperando en el local`,
      ruta: '/postventa-local',
      ts: Number.isFinite(masVieja) ? masVieja : 0,
      tono: 'warning' as const,
    },
  ]
}

// ── Canjes ───────────────────────────────────────────────────────────────────────
//
// ⚠️ Los canjes salen de la **base maestra de BDI**, para las tres marcas. En `store/useAvisos.ts`
// eso significa que su lectura va FUERA del `Promise.all` por marca: meterla adentro pediría lo
// mismo dos o tres veces y devolvería los mismos canjes cada vez, duplicando cada aviso.
//
// Stunned no es una `Marca` del monitor, así que sus avisos se cuelgan de `zattia`, que es de
// donde cuelgan también sus permisos.

/**
 * De qué marca del monitor cuelga un canje.
 *
 * 📌 Era una copia a mano de `marcaDePermisos` («espejo de `api/_canjes.js`»), o sea la quinta de la
 * misma regla. Ahora la contesta `baseDeLinea` (`lib/lineas.core.js`) como todas las demás. El `??
 * 'zattia'` no es un default por descarte: `CanjeStore` son las tres líneas y las tres tienen base,
 * así que el `null` es inalcanzable — está para que el tipo cierre sin apagar el aviso del helper.
 */
function marcaDelCanje(store: CanjeStore): Marca {
  return baseDeLinea(store) ?? 'zattia'
}

/**
 * Canjes esperando la firma de gerencia. Es lo que más traba el flujo: sin aprobar no se genera el
 * link, y sin link ella no manda la dirección.
 *
 * Uno por canje y no agrupados, a diferencia de los vencidos: cada firma es una decisión distinta
 * sobre un monto distinto, y agruparlas escondería justamente lo que hay que mirar.
 */
export function avisosDeCanjeAprobacion(
  canjes: { id: number; store: CanjeStore; estado: string; titulo?: string | null; created_at: string; persona?: string | null }[],
  perfil: Perfil | null,
): Aviso[] {
  return canjes
    .filter((c) => c.estado === 'propuesta')
    // Se filtra por permiso REAL: quien no puede firmar no tiene por qué ver el pendiente. Ojo que
    // los subs no se heredan de la función — si nadie los tiene, esta lista sale vacía y ese es el
    // síntoma de que faltó tildarlos en Config.
    .filter((c) => {
      const m = marcaDelCanje(c.store)
      return esAdmin(perfil) || puedeSub(perfil, m, 'canjes', 'aprobar') || puedeSub(perfil, m, 'canjes', 'aprobar-plata')
    })
    .map((c) => ({
      // Estable entre refrescos: es lo que permite comparar "esto ya lo vi".
      id: `canje-aprobacion:${c.id}`,
      tipo: 'canje-aprobacion' as const,
      marca: marcaDelCanje(c.store),
      titulo: c.titulo || `Canje ${numeroCanje(c.id)}`,
      detalle: c.persona ? `${c.persona} · esperando tu firma` : 'Esperando tu firma',
      ruta: '/canjes',
      ts: Date.parse(c.created_at) || 0,
      tono: 'warning' as const,
    }))
}

/**
 * Contenido prometido que ya venció.
 *
 * **Agrupados en un solo aviso**, como las fallas: si una creadora debe cuatro historias no son
 * cuatro recordatorios, es un tema. Llenar el contador es la forma más rápida de que la gente
 * empiece a ignorar el badge.
 *
 * El `id` no lleva la cantidad a propósito: si la llevara, verificar una sola evidencia cambiaría
 * el id y el aviso volvería a contarse como nuevo.
 */
export function avisosDeCanjeVencido(
  vencidos: { canjeId: number; store: CanjeStore; persona: string; cuantas: number; desde: number }[],
  perfil: Perfil | null,
  marcaActiva: Marca,
): Aviso[] {
  // Sin acceso a la sección no hay aviso: nadie ve un aviso de algo a lo que no puede entrar.
  const visibles = vencidos.filter((v) => puedeVer(perfil, marcaDelCanje(v.store), 'canjes'))
  if (!visibles.length) return []

  const personas = new Set(visibles.map((v) => v.persona))
  const total = visibles.reduce((a, v) => a + v.cuantas, 0)
  const masViejo = Math.min(...visibles.map((v) => v.desde).filter(Boolean))

  return [
    {
      id: 'canje-vencido',
      tipo: 'canje-vencido' as const,
      marca: marcaActiva,
      titulo: total === 1 ? '1 entregable vencido' : `${total} entregables vencidos`,
      detalle: personas.size === 1
        ? `${[...personas][0]} no publicó lo que acordó`
        : `${personas.size} personas no publicaron lo que acordaron`,
      ruta: '/canjes',
      ts: Number.isFinite(masViejo) ? masViejo : 0,
      tono: 'warning' as const,
    },
  ]
}

/** Orden de lectura: lo más nuevo arriba. */
export function ordenarAvisos(avisos: Aviso[]): Aviso[] {
  return avisos.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0))
}

/** Cuántos de estos avisos aparecieron después de la última vez que la persona miró. */
export function contarNuevos(avisos: Aviso[], vistoHasta: number): number {
  return avisos.filter((a) => (a.ts || 0) > vistoHasta).length
}
