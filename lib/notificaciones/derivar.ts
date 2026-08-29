/**
 * Los derivadores de avisos. Cada uno es puro: recibe datos y el perfil, y devuelve los
 * avisos que le corresponden a esa persona. Ver `tipos.ts` para por qué se derivan y no se
 * registran.
 *
 * Todos respetan la misma regla de visibilidad que ya usa el resto de Solicitudes: nadie ve un
 * aviso de algo que no vería entrando a la sección.
 */

import { esAdmin, puedeSub, puedeVer, tieneFuncion, type Perfil } from '@/lib/permisos'
import { numeroCanje, type CanjeStore } from '@/lib/canjes/tipos'
import { faltantes, salio } from '@/lib/sesionfotos/core'
import { veTodo, type ResumenSolicitud } from '@/lib/solicitudes/overview'
import { pendientesDeTrabajo } from '@/lib/inicio/core'
import type { FallaRow } from '@/lib/postventa/fallas/tipos'
import { alertasDe, estaAbierto, MOTIVO_LABEL, numeroReclamo, type AlertaReclamo, type ReclamoRow } from '@/lib/reclamos/tipos'
import { lineasQueVe } from '@/lib/meta-ads/acciones'
import { gravedadDeHallazgo, type Hallazgo } from '@/lib/meta-ads/reglas'
import type { Solicitud } from '@/lib/sesionfotos/tipos'
import { baseDeLinea, type Linea } from '@/lib/lineas'
import type { Marca } from '@/lib/nav'
import { paraComprar, paraSubir, pedidosDemorados, rotuloUbicacion, type VistaInsumo } from '@/lib/insumos/core'
import type { PedidoAbierto } from '@/lib/insumos/tipos'
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
      id: `aprobacion:${r.linea}:${r.id}`,
      tipo: 'aprobacion' as const,
      marca: r.marca,
      linea: r.linea,
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
    id: `solicitud:${r.linea}:${r.id}`,
    tipo: 'solicitud' as const,
    marca: r.marca,
    linea: r.linea,
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
export function avisosDeNoDevueltos(sols: Solicitud[], linea: Linea, perfil: Perfil | null): Aviso[] {
  if (!veTodo(perfil)) return []
  return sols
    .filter((s) => salio(s) && s.estado !== 'cerrada' && s.estado !== 'devuelta')
    .map((s) => ({ s, falta: faltantes(s).reduce((a, f) => a + f.falta, 0) }))
    .filter((x) => x.falta > 0)
    .map(({ s, falta }) => ({
      id: `no-devuelto:${linea}:${s.id}`,
      tipo: 'no-devuelto' as const,
      marca: baseDeLinea(linea),
      linea,
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
      linea: marca,
      titulo: pendientes.length === 1 ? '1 falla para llevar al depósito' : `${pendientes.length} fallas para llevar al depósito`,
      detalle: `${u} ${u === 1 ? 'unidad' : 'unidades'} esperando en el local`,
      ruta: '/postventa-local',
      ts: Number.isFinite(masVieja) ? masVieja : 0,
      tono: 'warning' as const,
    },
  ]
}

/**
 * Reclamos que están durmiendo: la plata que no sale, el cliente que no responde, el paquete que
 * no llega, la decisión que nadie toma.
 *
 * 🔴 **Es el aviso que le faltaba a todo el post-venta.** El módulo ya derivaba estas cuatro
 * alertas —`alertasDe`, con sus plazos y sus relojes— pero se dibujaban **sólo adentro de la
 * pantalla de Reclamos, que es de Administración**. O sea: para enterarse de que un reclamo está
 * durmiendo había que entrar a mirarlo, que es exactamente lo que no pasa. Es la tercera vuelta
 * del mismo agujero del módulo (el pendiente sin gesto, y el botón del lado equivocado de la
 * puerta): **una regla que nadie ve se lee igual que una que nadie escribió.**
 *
 * ⛔ **No hay reglas nuevas acá.** Los plazos, los relojes y el orden salen enteros de `alertasDe`;
 * esto es sólo el acarreo al sidebar. Un plazo se cambia en `DIAS_ALERTA` y se mueve en los dos
 * lados de una.
 *
 * **Uno por reclamo, ⛔ no agrupados** —como las firmas de canje y a diferencia de las fallas—:
 * cada uno es otro cliente esperando otra plata, y el montón escondería justo lo que hay que
 * mirar. Y **una alerta por reclamo**: la primera, que es la que la pantalla muestra cuando hay
 * lugar para una sola (`conAlerta` ya cuenta reclamos y no alertas).
 *
 * 🔑 El `ts` es **cuándo la alerta empezó a existir**, no cuándo se abrió el reclamo: ver
 * `AlertaReclamo`. Sin eso el aviso de un reclamo viejo nace ya marcado como visto.
 */
export function avisosDeReclamo(filas: ReclamoRow[], marca: Marca, perfil: Perfil | null): Aviso[] {
  // La pantalla de Reclamos es una pestaña de Post-venta (key `postventa`, Administración). Sin
  // acceso a esa sección no hay aviso: mandar a alguien a una pantalla que no puede abrir es el
  // defecto que este módulo ya tuvo con el botón de despachar.
  if (!puedeVer(perfil, marca, 'postventa')) return []
  return filas
    // ⛔ Sólo los vivos: un `anulado` con un pendiente viejo sin tildar sigue cumpliendo la
    // condición de la alerta de plata, y avisaría para siempre de algo que ya no existe.
    .filter(estaAbierto)
    .map((d) => ({ d, a: alertasDe(d)[0] }))
    .filter((x): x is { d: ReclamoRow; a: AlertaReclamo } => !!x.a)
    .map(({ d, a }) => ({
      id: `reclamo:${marca}:${d.id}`,
      tipo: 'reclamo' as const,
      marca,
      // Un reclamo es de la tienda, no de la línea: `store` son las dos marcas y nada más.
      linea: marca,
      titulo: `${numeroReclamo(d.id)} · ${MOTIVO_LABEL[d.motivo] ?? d.motivo}`,
      detalle: a.texto,
      // La pestaña va en la URL: `/postventa` solo abre en Fallas.
      ruta: '/postventa?tab=reclamos',
      ts: a.ts,
      tono: a.tono,
    }))
}

/**
 * Lo que las automatizaciones de la pauta detectaron y **nadie miró todavía**.
 *
 * # 🔴 Por qué esto es un aviso y no otra pantalla
 *
 * `docs/secciones/meta-ads.md` dice, y sigue valiendo: *«no hay pantalla nueva de alertas: un
 * segundo lugar al que hay que acordarse de entrar es uno al que no se entra»*. Esto ⛔ no es esa
 * pantalla — es el badge que ya está arriba a la izquierda en todas las pantallas del monitor. El
 * hallazgo sigue viviendo y accionándose en un solo lado (`/meta-ads`), y lo único que cambia es
 * que **deja de hacer falta acordarse de entrar**.
 *
 * 🔴 **Y es el agujero medido, ⛔ no una hipótesis.** El 26-ago-2026 el motor escribió sus primeros
 * cuatro hallazgos a las 07:50 —uno de ellos, un conjunto comprando al 156% del techo— y a media
 * tarde los cuatro seguían en `nuevo`: nadie abrió la sección. Es el P4 del `PENDIENTES.md`, y con
 * un solo operador *lo que no le llega no existe*.
 *
 * # Uno por hallazgo, ⛔ no agrupados
 *
 * Como los reclamos y las firmas de canjes, y a diferencia de los entregables vencidos: cada
 * renglón es una decisión distinta sobre un objeto distinto y una plata distinta. Agruparlos en
 * «4 cosas para decidir» escondería justo lo que hace abrir la pantalla —que uno de los cuatro está
 * quemando plata al 156% del techo—, y son ~4 por mañana entre las tres marcas: una lista que se
 * lee.
 *
 * 🔑 **El `id` no lleva la fecha ni las veces.** Con la fecha adentro, el renglón que la regla
 * vuelve a escribir mañana sería otro `id` y **el badge se prendería de nuevo cada mañana por el
 * mismo problema** — que es exactamente la forma en que un contador enseña a ignorarlo (la misma
 * razón por la que `canje-vencido` no lleva la cantidad).
 *
 * 🔑 **El `ts` es `desde`, el primer día de la racha, ⛔ no la fecha del último renglón.** Con el
 * último, un conjunto que viene gritando hace cinco días se leería «apareció hoy» todas las
 * mañanas: el «NUEVO» no se apagaría nunca y el «trabado hace N días» de Inicio no saldría jamás.
 * Es la trampa de `updated_at` para medir una espera — se cuenta desde el EVENTO.
 */
export function avisosDeHallazgo(hallazgos: Hallazgo[], perfil: Perfil | null): Aviso[] {
  // 🔑 La MISMA función con la que el servidor contesta 403, ⛔ no una copia de la regla. `stunned`
  // no es una `Marca`: sus permisos cuelgan de Zattia y por eso esto se pregunta por LÍNEA.
  const ve = new Set(lineasQueVe(perfil))
  return hallazgos
    .filter((h) => ve.has(h.linea))
    .map((h) => ({
      id: `hallazgo:${h.reglaId}:${h.objetoId}`,
      tipo: 'hallazgo' as const,
      marca: baseDeLinea(h.linea),
      // El chip dice la línea —«Stunned»—, aunque la marca a la que salta sea Zattia, que es su base.
      linea: h.linea,
      titulo: h.objetoNombre || h.objetoId,
      // La frase ya viene redactada con los números adentro, y se guardó armada justamente para que
      // sobreviva a que cambien los umbrales. Reescribirla acá sería una segunda versión del mismo
      // diagnóstico, que es como empiezan a discrepar dos pantallas.
      detalle: h.motivo,
      // La línea va en la URL: `/meta-ads` abre en «Todas» y el hallazgo puede quedar a dos filtros
      // de distancia. `ContextoMeta` lee `?linea=` al montar.
      ruta: `/meta-ads?linea=${h.linea}`,
      ts: inicioDelDia(h.desde),
      tono: TONO_POR_GRAVEDAD[gravedadDeHallazgo(h.sugerencia)] ?? 'warning',
    }))
}

/**
 * Cómo se pinta un hallazgo. La GRAVEDAD ⛔ no se decide acá: sale de `gravedadDeHallazgo()`, que
 * también lee el mail de la mañana. Acá sólo se traduce a un tono de la paleta — si la regla
 * viviera en los dos lados, agregar una acción nueva enteraría a uno solo.
 */
const TONO_POR_GRAVEDAD: Record<string, Aviso['tono']> = {
  // Plata saliendo ahora.
  quema: 'danger',
  // Plata que se deja de ganar: importa, no sangra.
  oportunidad: 'brand',
  // No propone nada: hay que mirarlo, y es lo que más fácil se queda quieto.
  mirar: 'warning',
}

/**
 * Un día `YYYY-MM-DD` como medianoche **local**, que es la zona de quien mira.
 *
 * ⛔ No `Date.parse(iso)`, que la interpreta como medianoche UTC: en Argentina eso corre el aviso
 * una jornada y el «trabado hace N días» de Inicio contaría un día de más. Es el mismo criterio de
 * `lib/fechas/dia.core.js`.
 */
function inicioDelDia(iso: string): number {
  const t = new Date(`${iso}T00:00:00`).getTime()
  // Una fecha ilegible ⛔ no puede tirar el aviso: sin `ts` no se ordena arriba ni se marca nuevo,
  // pero el renglón sigue existiendo, que es lo único que no se puede perder.
  return Number.isFinite(t) ? t : 0
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
  // Sin `?? 'zattia'`: `CanjeStore` es una línea, y para una línea `baseDeLinea` es total. El
  // default estaba de más y era el mismo "por descarte" que el helper existe para no tener.
  return baseDeLinea(store)
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
      // El canje SÍ sabe de qué línea es: `CanjeStore` ya incluye `stunned`.
      linea: c.store,
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
      linea: marcaActiva,
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

/**
 * Material que ella ya subió por su link y **nadie miró todavía**.
 *
 * 🔴 Es el aviso que faltaba y el que más se paga: los otros seis son cosas que esperan que alguien
 * decida, y éste es trabajo **ya hecho** —por ella, del otro lado— que se queda quieto. El canje se
 * hunde en el tramo `contenido`, que es el de "esperando que publique", así que el que mira la lista
 * ve exactamente lo mismo cuando ella no mandó nada y cuando mandó seis videos.
 *
 * **Agrupado en un solo aviso**, como los vencidos: cuatro creadoras que subieron no son cuatro
 * recordatorios, es una tarde de trabajo. Y el `id` **no lleva la cantidad** por lo mismo que allá:
 * si la llevara, verificar un archivo cambiaría el id y el aviso volvería a contarse como nuevo.
 *
 * El `ts` es el del archivo **más viejo**: lo que ordena no es que llegó algo, es hace cuánto que
 * está esperando.
 */
export function avisosDeContenidoSinRevisar(
  sinRevisar: { canjeId: number; store: CanjeStore; persona: string; cuantas: number; desde: number }[],
  perfil: Perfil | null,
  marcaActiva: Marca,
): Aviso[] {
  const visibles = sinRevisar.filter((v) => puedeVer(perfil, marcaDelCanje(v.store), 'canjes'))
  if (!visibles.length) return []

  const personas = new Set(visibles.map((v) => v.persona))
  const total = visibles.reduce((a, v) => a + v.cuantas, 0)
  const masViejo = Math.min(...visibles.map((v) => v.desde).filter(Boolean))

  return [
    {
      id: 'canje-contenido',
      tipo: 'canje-contenido' as const,
      marca: marcaActiva,
      linea: marcaActiva,
      titulo: total === 1 ? '1 archivo sin revisar' : `${total} archivos sin revisar`,
      detalle: personas.size === 1
        ? `${[...personas][0]} subió contenido y todavía no lo miramos`
        : `${personas.size} creadoras subieron contenido y todavía no lo miramos`,
      ruta: '/canjes',
      ts: Number.isFinite(masViejo) ? masViejo : 0,
      tono: 'brand' as const,
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

/**
 * Los insumos que hay que pedir, y los que están en cero en un local teniendo en el depósito.
 *
 * # Por qué son DOS avisos y no uno por insumo
 *
 * Armar el pedido de insumos es **un** acto: se llama al proveedor una vez y se piden los que
 * falten. Un aviso por insumo llenaría el contador con seis renglones que se resuelven juntos, y
 * *«un aviso que se ignora doce veces enseña a ignorar el número trece»* (`docs/secciones/agenda.md`).
 * Subir del depósito al local es **otro** acto —y otro día, y a veces otra persona—, así que va
 * aparte y agrupado **por lugar**, que es lo que define el viaje.
 *
 * # Por qué el `ts` NO es «hoy»
 *
 * Es la fecha del movimiento que dejó el stock debajo del mínimo, calculada caminando el libro
 * (`desdeCuandoCruzo`). Con la fecha de hoy, el aviso diría «apareció hoy» todas las mañanas, el
 * «NUEVO» no se apagaría nunca y el «trabado hace N días» de Inicio no saldría jamás. Es la misma
 * trampa de `updated_at` para medir una espera.
 *
 * # Marca
 *
 * ⛔ **No se filtra por marca ni se duplica por marca.** El catálogo es de la empresa —el depósito
 * es uno solo y la compra se hace una vez— así que el aviso sale una sola vez, sobre la marca que
 * la persona tiene puesta. Duplicarlo por marca haría que el mismo pedido se cuente dos veces.
 */
export function avisosDeInsumo(vistas: VistaInsumo[], perfil: Perfil | null, marcaActiva: Marca): Aviso[] {
  // La misma regla de visibilidad que el resto: nadie ve un aviso de algo que no vería entrando.
  if (!puedeVer(perfil, marcaActiva, 'insumos')) return []

  const avisos: Aviso[] = []

  const comprar = paraComprar(vistas)
  if (comprar.length) {
    const desde = comprar[0].reposicion.comprar?.desde
    avisos.push({
      id: 'insumo-comprar',
      tipo: 'insumo-comprar' as const,
      marca: marcaActiva,
      linea: marcaActiva,
      titulo: comprar.length === 1 ? '1 insumo para pedir' : `${comprar.length} insumos para pedir`,
      detalle: nombrarInsumos(comprar),
      ruta: '/insumos?ver=comprar',
      ts: desde ? inicioDelDia(desde) : 0,
      tono: 'warning' as const,
    })
  }

  // 🔴 **Los pedidos demorados son OTRO aviso, y a propósito.** «Falta» lo resolvemos nosotros
  // comprando; «el pedido no llegó» lo resuelve el proveedor y la acción es reclamar. Meterlos en
  // el mismo aviso le echaría la culpa a quien no puede hacer nada — es el mismo reloj sin dueño
  // que ya hubo que partir en Postventa.
  const demorados = pedidosDemorados(vistas)
  if (demorados.length) {
    const primero = demorados[0].pedido as PedidoAbierto
    avisos.push({
      id: 'insumo-demorado',
      tipo: 'insumo-demorado' as const,
      marca: marcaActiva,
      linea: marcaActiva,
      titulo: demorados.length === 1 ? '1 pedido demorado' : `${demorados.length} pedidos demorados`,
      detalle: `${nombrarInsumos(demorados)} · se esperaba el ${primero.esperadoEl}`,
      ruta: '/insumos?ver=demorados',
      // 🔑 El `ts` es **cuándo se lo esperaba**, ⛔ no cuándo se pidió ni hoy: la espera empieza a
      // contar el día que se pasó de fecha, y es lo que hace que el «NUEVO» se apague.
      ts: inicioDelDia(primero.esperadoEl as string),
      tono: 'warning' as const,
    })
  }

  for (const g of paraSubir(vistas)) {
    avisos.push({
      id: `insumo-subir:${g.ubicacion}`,
      tipo: 'insumo-subir' as const,
      marca: marcaActiva,
      linea: marcaActiva,
      titulo: `Falta en ${rotuloUbicacion(g.ubicacion)}`,
      // 🔑 Dice que HAY en otro lado: sin eso se lee como «hay que comprar», que es la acción
      // equivocada y la que tarda días.
      detalle: `${nombrarInsumos(g.vistas)} · hay en otro lugar, sólo hay que subirlo`,
      ruta: `/insumos?ver=subir&ubicacion=${g.ubicacion}`,
      ts: inicioDelDia(g.desde),
      tono: 'warning' as const,
    })
  }

  return avisos
}

/** Los primeros nombres y «y N más». Un aviso con quince nombres adentro no se lee. */
function nombrarInsumos(vistas: VistaInsumo[], tope = 3): string {
  const nombres = vistas.map((v) => v.insumo.nombre)
  if (nombres.length <= tope) return nombres.join(', ')
  return `${nombres.slice(0, tope).join(', ')} y ${nombres.length - tope} más`
}
