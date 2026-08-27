/**
 * El dominio del CRM: filas crudas + los mapas del KV → todo lo que la sección
 * muestra. Port literal de index.html:13105-13752.
 *
 * "Literal" es una regla, no una descripción: acá no se arregla nada. Los bugs
 * del CRM que ya se arreglaron (el truncado de PostgREST, el borrado del KV) se
 * arreglaron **en el legacy**, en su propio commit, para que este port se pueda
 * verificar contra un legacy que ya está bien. Mezclar port y fix hace imposible
 * saber qué rompió los números.
 *
 * Los únicos cambios, todos de forma:
 *
 *  1. `today` entra por parámetro en vez de leerse del global `TODAY` (1920).
 *  2. `crmSeg`, `crmClientes` y `crmTelOverride` entran por parámetro en vez de
 *     ser globales. Eso es lo que vuelve testeable todo el archivo.
 *  3. `calcularAgregado` devuelve `{activos, descartados}` en vez de escribir el
 *     global `crmDescartados` y devolver solo los activos (13631-13633).
 *  4. `resumenCompras` devuelve los datos; el HTML lo arma el componente.
 *
 * Nadie importa esto todavía: se conecta recién cuando la paridad esté verde.
 */

import type {
  Agregado,
  ClienteCRM,
  EstadoSeg,
  FilaCliente,
  FilaDetalle,
  FilaVenta,
  Kpis,
  MapaSeguimiento,
  MapaTelefonos,
  Nota,
  ResumenCompras,
  Seg,
  Segmento,
  Temperatura,
} from './tipos'

import { normalizeArgPhone as normalizeArgPhoneJs } from './telefono.core.js'

// ── Constantes de negocio (index.html:13105-13113) ───────────────────────────
export const CADENCIA_DIAS: Record<string, number> = { semanal: 7, quincenal: 15, mensual: 30 }
export const RIESGO_MIN_DAYS = 30 // entre estos dos días → "en riesgo"
export const RIESGO_MAX_DAYS = 90
export const DORMIDO_DAYS = 90 // > 90 → "dormido"
export const NUEVO_DAYS = 30 // primer pedido <= 30 días → "nuevo"
export const ACTIVO_MIN_PED = 3 // 3+ pedidos activos → "recurrente"
export const TOP_LIMIT = 20 // tarjeta "Top clientes"

// ── Temperatura (ago-2026, posterior al legacy) ──────────────────────────────

/**
 * Con qué temperatura entra un cliente que nunca se marcó.
 *
 * **`templado` es una decisión, no un descuido.** Los 305 clientes que ya viven en el KV
 * no tienen el campo, así que el día 1 caen TODOS acá. Con `templado` todos quedan en la
 * misma prioridad (3) y la lista sale ordenada por urgencia pura — es decir, idéntica a
 * la de antes de este cambio — y se va acomodando a medida que Bruno marca. Con
 * `caliente` habría pasado lo mismo pero repartiendo por tamaño sin que nadie lo pidiera.
 * El criterio elegido: nada se mueve de lugar sin una decisión explícita.
 */
export const TEMPERATURA_DEFAULT: Temperatura = 'templado'

/** El orden del ciclo del botón de la tabla: un termómetro que baja y da la vuelta. */
const CICLO_TEMPERATURA: Temperatura[] = ['caliente', 'templado', 'frio']

/**
 * La que sigue al tocar el badge. Arrancando todos en `templado`, el primer clic marca
 * `frio` — que es justo la tarea inicial: hundir a los que no contestan.
 */
export function siguienteTemperatura(t: Temperatura): Temperatura {
  const i = CICLO_TEMPERATURA.indexOf(t)
  return CICLO_TEMPERATURA[(i + 1) % CICLO_TEMPERATURA.length]
}

// ── Helpers de fecha ─────────────────────────────────────────────────────────

/** addDiasISO (13278). */
export function addDiasISO(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

/**
 * Corre la fecha al lunes si cayó sábado o domingo.
 *
 * 🔑 **Ningún próximo contacto puede caer en fin de semana**: la venta mayorista se hace de lunes a
 * viernes, así que un recordatorio para el sábado es un recordatorio que se pierde — el lunes ya
 * quedó viejo y se mezcla con el resto de los atrasados. Lo pidió Bruno el 24-ago-2026.
 *
 * **Corre para adelante y no para atrás**: si pediste "en 15 días" y cae sábado, el lunes son 17.
 * Al revés estaría contactando antes de lo que pidió, que es peor que un poco después.
 *
 * ⚠️ **No sabe de feriados.** Un feriado se ve el día que pasa y se corre a mano; una tabla de
 * feriados hay que mantenerla todos los años y el día que se desactualiza miente en silencio.
 */
export function diaHabil(iso: string): string {
  if (!iso) return iso
  const d = new Date(iso + 'T00:00:00')
  const dia = d.getDay() // 0 domingo, 6 sábado
  if (dia === 6) return addDiasISO(iso, 2)
  if (dia === 0) return addDiasISO(iso, 1)
  return iso
}

/**
 * Los plazos de "volver a hablarle", en un solo lugar.
 *
 * Los dibujan el panel de WhatsApp, la ficha del cliente y la de los prospectos; con tres listas
 * distintas, el mismo cliente se agenda distinto según desde dónde lo toques.
 *
 * 🔑 **Son números, no frases.** Van como fila de fichitas debajo de "En cuántos días", que es lo
 * que deja poner siete opciones sin que la sección se coma la pantalla — el panel mide 350 px.
 * Salieron de lo que Bruno pidió: *"mañana, 1 2 3, 7 15 21 y 30, que sea medio factor común"*.
 */
export const PLAZOS_DIAS = [1, 2, 3, 7, 15, 21, 30] as const

/** diasHasta (13283). Compara contra la medianoche local de `today`, no contra la hora. */
export function diasHasta(iso: string | null, today: Date): number | null {
  if (!iso) return null
  const target = new Date(iso + 'T00:00:00')
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((target.getTime() - base.getTime()) / 86400000)
}

/** diasDesde (13143). Ojo: usa floor y la hora exacta de `today`, no la medianoche. */
export function diasDesde(d: string | null, today: Date): number | null {
  if (!d) return null
  return Math.floor((today.getTime() - new Date(d).getTime()) / 86400000)
}

/**
 * normalizeArgPhone (13122). Devuelve dígitos listos para wa.me, o '' si no se
 * puede normalizar. El '' es lo que cuenta como "sin teléfono" en los KPIs.
 *
 * 🔑 **La implementación se mudó a `telefono.core.js`** (JS plano) cuando el panel de WhatsApp
 * necesitó normalizar teléfonos **del lado del servidor**, en `api/_crm.js`, que no puede importar
 * TypeScript. Esto es el re-export tipado, igual que `lib/permisos.ts` sobre `permisos.core.js`:
 * los que ya la importaban de acá no cambian nada, y no hay una segunda copia que se despegue.
 */
export const normalizeArgPhone: (phone: string | null | undefined) => string = normalizeArgPhoneJs

/** PostgREST devuelve numeric como string; el legacy hace parseFloat en cada uso. */
function num(v: number | string | null | undefined): number {
  return parseFloat(String(v)) || 0
}

// ── Seguimiento ──────────────────────────────────────────────────────────────

/** esDescartado (13035). */
export function esDescartado(id: number | string, crmSeg: MapaSeguimiento): boolean {
  const s = crmSeg[String(id)]
  return !!(s && s.descartado)
}

/**
 * estadoSeguimiento (13293).
 *
 * **El próximo contacto es la fecha que se puso a mano. Punto.**
 *
 * 🔴 **Hasta el 24-ago-2026 había una segunda regla: la cadencia sobre el último contacto.**
 * Se sacó, y la razón es que no hacía nada. Medido sobre los 771 clientes reales ese día:
 * 44 tenían cadencia cargada, **744 tenían fecha a mano —que le gana siempre— y en 0 clientes
 * la cadencia decidía la fecha**. Peor: ninguna pantalla de la app dejaba ponerla (las 44 venían
 * del sistema viejo), así que el panel mostraba "Cadencia mensual (cada 30 días)" al lado de una
 * fecha que salía de otro lado. Un cartel que miente es peor que no tener el cartel.
 *
 * Lo decidió Bruno: *"la cadencia puede sacarse y que sea todo manual, con sugerencias de en
 * cuánto tiempo recontactar"*. La sugerencia se calcula de lo que el cliente ya hace (cada cuánto
 * compra), que es un dato que existe, en vez de un campo que hay que mantener.
 *
 * ⚠️ El estado `pendiente` ("tiene cadencia y nunca se lo contactó") **ya no se produce**: sin
 * fecha es `none`. El valor sigue en el tipo porque lo leen pantallas que todavía lo mapean.
 * ⚠️ `cadencia` se sigue devolviendo tal como está guardado —no se borra nada del KV— pero no
 * entra en ninguna cuenta.
 */
export function estadoSeguimiento(id: number | string, crmSeg: MapaSeguimiento, today: Date): Seg {
  const s = crmSeg[String(id)] || {}
  const notas: Nota[] = Array.isArray(s.notas) ? s.notas : []
  const proximo: string | null = s.proximo_manual || null
  if (!proximo) return { cadencia: '', ultimo: s.ultimo_contacto || null, proximo: null, estado: 'none', dias: null, notas }
  // `proximo` ya se sabe no vacío: `diasHasta` sólo devuelve null cuando no hay fecha.
  const dias = diasHasta(proximo, today) as number
  const estado: EstadoSeg = dias <= 0 ? 'vencido' : dias <= 7 ? 'semana' : 'aldia'
  return { cadencia: '', ultimo: s.ultimo_contacto || null, proximo, estado, dias, notas }
}

/**
 * ¿Este cliente entra en la lista del día?
 *
 * ⚠️ **Diverge del legacy A PROPÓSITO** (paraContactar, 13312, contaba solo `vencido` y
 * `pendiente`). El legacy tenía un desfasaje: la tarjeta "Para contactar" contaba dos
 * estados y la tabla de abajo mostraba tres — al tocarla aparecían más filas que el
 * número de la tarjeta. Se empareja hacia arriba (sumando `semana`) y no hacia abajo,
 * porque la lista de llamados es la que está bien: los que vencen dentro de la semana
 * sirven y no había razón para esconderlos.
 *
 * El criterio de esta función y el filtro de `filtrarOrdenar` para `seg === 'contactar'`
 * tienen que ser el MISMO. Si se toca uno, se toca el otro.
 */
export function paraContactar(c: ClienteCRM): boolean {
  return c.seg_estado === 'vencido' || c.seg_estado === 'pendiente' || c.seg_estado === 'semana'
}

/**
 * Los que quedan afuera de la lista del día por estar marcados 🧊 Frío.
 *
 * 🔑 **Al frío no se le escribe.** Es una decisión comercial, no una prioridad: un frío no es
 * "el último de la fila", es alguien a quien hoy no se contacta — cerró el local, no contesta
 * nunca, o cuesta más de lo que deja. Medido el 23-ago-2026: de ~300 atrasados, **50 eran
 * fríos**. Dejarlos adentro no los hace contactar; hace que la lista se vea imposible y que no
 * se abra ninguno.
 *
 * ⚠️ **Afuera de la lista del día NO quiere decir afuera del día.** Los fríos se trabajan todos
 * los días y de ahí salen buenas recuperaciones; lo que no funciona es tenerlos mezclados,
 * porque entonces no se termina ninguna de las dos listas. Por eso son **otra etapa**, con su
 * propio filtro (`recuperar`) y su propio cupo — ver `TANDA_FRIOS`.
 */
export const esFrio = (c: ClienteCRM): boolean => c.temperatura === 'frio'

/** La lista del día sin los fríos. */
export function sinFrios(lista: ClienteCRM[]): ClienteCRM[] {
  return lista.filter((c) => !esFrio(c))
}

/**
 * Cuántos fríos entran en la tanda de recuperación de un día.
 *
 * 🔑 **Es un cupo, no un filtro.** Los fríos vencidos son ~50 y la lista completa son 67: si la
 * etapa de recuperación los mostrara todos, volvería a pasar lo mismo que motivó separarlos —
 * se ve una pila, no se empieza. Diez se terminan; la lista entera no.
 *
 * ⚠️ **La tanda ROTA sola y por eso no guarda nada.** Son los que están vencidos, ordenados por
 * lo que compraron: al registrarle el contacto a uno se le fija el próximo y sale de vencidos,
 * así que mañana suben los diez siguientes. Un "ya lo mostré hoy" guardado en algún lado sería
 * un dato más que mantener para el mismo resultado.
 */
export const TANDA_FRIOS = 10

/**
 * ¿Este frío entra en la tanda de recuperación?
 *
 * Es `paraContactar` **más el que no tiene seguimiento** (`none`). La diferencia importa: marcar
 * a alguien como frío NO le carga ninguna fecha —`setTemperatura` sólo cambia la marca—, así que
 * un cliente sin cadencia ni fecha manual que se marca frío queda en `none`. Sin esta línea sale
 * de la lista del día por ser frío y no entra en la de recuperación por no tener fecha:
 * **desaparece del sistema, en silencio y sin que nadie lo note.**
 *
 * Medido el 23-ago-2026: los 67 fríos tienen fecha, así que hoy no le pasa a ninguno. Es el caso
 * que se abre solo, la próxima vez que se enfríe a alguien que nunca estuvo en seguimiento.
 */
export function friosParaRecuperar(c: ClienteCRM): boolean {
  return esFrio(c) && (paraContactar(c) || c.seg_estado === 'none')
}

export type ConteoPorDia = {
  atrasados: number
  hoy: number
  manana: number
  semana: number
  /** Cuántos fríos quedaron afuera de la semana. Es el número que la pantalla muestra. */
  friosFuera: number
  /** El tamaño de la tanda de recuperación de hoy: lo que hay, con techo de `TANDA_FRIOS`. */
  recuperar: number
}

/**
 * Los contadores de los chips de la lista del día, con la MISMA regla que la tabla.
 *
 * Existe para que no puedan divergir: mientras los chips se contaban con `contarKpis` (que es
 * paridad con el legacy y no sabe de fríos) y la tabla filtraba por su cuenta, el chip decía
 * 302 y abajo aparecían 252 filas.
 */
export function contarPorDia(activos: ClienteCRM[], hoy: string, manana: string): ConteoPorDia {
  const l = sinFrios(activos)
  const atrasado = (c: ClienteCRM) => c.seg_estado === 'pendiente' || (!!c.proximo_contacto && c.proximo_contacto < hoy)
  return {
    atrasados: l.filter(atrasado).length,
    hoy: l.filter((c) => c.proximo_contacto === hoy).length,
    manana: l.filter((c) => c.proximo_contacto === manana).length,
    semana: l.filter(paraContactar).length,
    friosFuera: activos.filter(friosParaRecuperar).length,
    recuperar: Math.min(TANDA_FRIOS, activos.filter(friosParaRecuperar).length),
  }
}

// ── Prioridad comercial de la lista del día ──────────────────────────────────

/**
 * Los ids de los N clientes que más compraron. Es la definición de "cuenta clave" que ya
 * usaban la tarjeta ⭐ Top clientes y `planSugerirCadencias`, extraída para que las tres
 * midan lo mismo.
 *
 * ⚠️ **No se usa `es_mayorista` para esto.** La estrellita la tienen 274 de los 305
 * clientes: como marca de tamaño no separa nada. Lo suyo es otra cosa — decide qué ventas
 * se traen de Supabase (`datos.ts:60`).
 */
export function idsTop(lista: ClienteCRM[], n: number = TOP_LIMIT): Set<number> {
  return new Set(
    [...lista]
      .sort((a, b) => b.total_amount - a.total_amount)
      .slice(0, n)
      .map((c) => c.id),
  )
}

/**
 * En qué grupo cae el cliente dentro de la lista "Para contactar". Más chico = más arriba.
 *
 *   1. Caja rápida  — caliente que NO es cuenta clave: el mediano/chico que compra rápido.
 *   2. Cuenta clave — caliente y top por monto: importa, pero tarda más en cerrar.
 *   3. Templado     — el default de todos hasta que se los marque.
 *   4. Frío         — al fondo SIEMPRE, lleve los días de atraso que lleve.
 *
 * El problema que esto resuelve: los clientes grandes que se enfriaron tienen cadencia
 * semanal (se la da `planSugerirCadencias`), así que se vencen cada 7 días y quedaban
 * clavados arriba de la lista, comiéndose la mañana en mensajes sin respuesta.
 */
export function prioridadContacto(c: ClienteCRM, esCuentaClave: boolean): 1 | 2 | 3 | 4 {
  if (c.temperatura === 'frio') return 4
  if (c.temperatura === 'templado') return 3
  return esCuentaClave ? 2 : 1
}

/**
 * Qué tan urgente es la fecha de un cliente dentro de su grupo. Más chico = más arriba.
 *
 * 🔴 **Es `Math.abs`, y ese valor absoluto ES el arreglo.** Hasta el 27-ago-2026 el desempate
 * era `dias_proximo` a secas, o sea "primero el que hace más tiempo que espera". Suena sensato
 * y hace lo contrario de lo que hace falta: el que se agendó **para hoy** espera 0 días y se va
 * al fondo, detrás de todos los colgados. Medido ese día contra producción: de 226 en la lista,
 * los 5 agendados para hoy quedaban en los puestos **222 a 226** — y el panel muestra 25. O sea
 * que **la fecha que se promete al agendar no se cumplía nunca**, y cuanto mejor se usaba el
 * CRM, menos aparecía la gente. De ahí salía "no sé a quién hablarle".
 *
 * Con el valor absoluto el orden pasa a ser: hoy (0), ayer (1), anteayer (2)… y los colgados de
 * hace dos semanas al final. Los grupos ya vienen separados por `seg_estado`, así que esto sólo
 * desempata adentro de uno:
 *
 *   · vencidos (días ≤ 0) → 0, 1, 2… : hoy primero, el atraso más viejo último.
 *   · "esta semana" (días 1 a 7) → 1, 2, 3… : mañana primero. Igual que antes.
 *
 * `null` es el `pendiente` heredado (sin fecha contra la cual medir el atraso): va al final,
 * porque el que tiene fecha es más urgente que el que no tiene ninguna.
 */
export function urgenciaFecha(dias: number | null | undefined): number {
  return dias == null ? 999 : Math.abs(dias)
}

// ── Agregado (RFM) ───────────────────────────────────────────────────────────

export type EntradaAgregado = {
  ventas: FilaVenta[]
  clientes: Record<string | number, FilaCliente>
  crmSeg: MapaSeguimiento
  crmTelOverride: MapaTelefonos
  today: Date
}

/** calcularAgregadoCRM (13576). Ver el comentario de `Agregado` sobre los descartados. */
export function calcularAgregado({ ventas, clientes, crmSeg, crmTelOverride, today }: EntradaAgregado): Agregado {
  type Acum = { id: number; ventas: FilaVenta[]; first_sale: string | null; last_sale: string | null; total_sales: number; total_amount: number }
  const map = new Map<number, Acum>()

  for (const v of ventas) {
    if (!v.client_id) continue
    const id = v.client_id
    if (!map.has(id)) {
      map.set(id, { id, ventas: [], first_sale: null, last_sale: null, total_sales: 0, total_amount: 0 })
    }
    const e = map.get(id) as Acum
    e.ventas.push(v)
    e.total_sales += 1
    e.total_amount += num(v.total_price)
    const d = v.date_sale
    if (d) {
      if (!e.first_sale || d < e.first_sale) e.first_sale = d
      if (!e.last_sale || d > e.last_sale) e.last_sale = d
    }
  }

  const result: ClienteCRM[] = []
  for (const e of map.values()) {
    const cliente = clientes[e.id] || ({} as FilaCliente)
    const dias = diasDesde(e.last_sale, today)
    const diasFirst = diasDesde(e.first_sale, today)
    const avg = e.total_sales > 0 ? e.total_amount / e.total_sales : 0
    const seg = estadoSeguimiento(e.id, crmSeg, today)
    result.push({
      id: e.id,
      name: cliente.name || 'Cliente #' + e.id,
      email: cliente.email || '',
      phone: cliente.phone || crmTelOverride[String(e.id)] || '',
      city: cliente.city || '',
      province: cliente.province || '',
      first_sale: e.first_sale,
      last_sale: e.last_sale,
      dias_ultimo: dias,
      dias_primero: diasFirst,
      total_sales: e.total_sales,
      total_amount: e.total_amount,
      avg_ticket: avg,
      ventas: e.ventas,
      cadencia: seg.cadencia,
      ultimo_contacto: seg.ultimo,
      proximo_contacto: seg.proximo,
      seg_estado: seg.estado,
      dias_proximo: seg.dias,
      notas: seg.notas,
      en_difusion: !!(crmSeg[String(e.id)] && crmSeg[String(e.id)].en_difusion),
      temperatura: (crmSeg[String(e.id)] && crmSeg[String(e.id)].temperatura) || TEMPERATURA_DEFAULT,
    })
  }

  // Los "ya no se dedica" quedan fuera de KPIs/segmentos/recontacto y solo se ven
  // con "Ver descartados".
  return {
    activos: result.filter((c) => !esDescartado(c.id, crmSeg)),
    descartados: result.filter((c) => esDescartado(c.id, crmSeg)),
  }
}

/** segmentoCliente (13638). El orden de los ifs ES la lógica: gana el primero. */
export function segmentoCliente(c: ClienteCRM): Segmento {
  if (c.dias_primero !== null && c.dias_primero <= NUEVO_DAYS) return 'nuevos'
  if (c.dias_ultimo !== null && c.dias_ultimo > DORMIDO_DAYS) return 'dormidos'
  if (c.total_sales >= 2 && c.dias_ultimo !== null && c.dias_ultimo >= RIESGO_MIN_DAYS && c.dias_ultimo <= RIESGO_MAX_DAYS) return 'riesgo'
  if (c.total_sales >= ACTIVO_MIN_PED && c.dias_ultimo !== null && c.dias_ultimo < RIESGO_MIN_DAYS) return 'activos'
  return 'otros'
}

/** Los contadores de las tarjetas de segmento (dentro de renderCRM, 13654-13663). */
export function contarKpis(agregado: ClienteCRM[]): Kpis {
  const counts: Kpis = { top: Math.min(TOP_LIMIT, agregado.length), activos: 0, riesgo: 0, dormidos: 0, nuevos: 0, sinTel: 0, contactar: 0 }
  for (const c of agregado) {
    const seg = segmentoCliente(c)
    if (seg === 'activos') counts.activos++
    else if (seg === 'riesgo') counts.riesgo++
    else if (seg === 'dormidos') counts.dormidos++
    else if (seg === 'nuevos') counts.nuevos++
    if (!normalizeArgPhone(c.phone)) counts.sinTel++
    if (paraContactar(c)) counts.contactar++
  }
  return counts
}

// ── Filtro + orden de la tabla ───────────────────────────────────────────────

/**
 * Los filtros que responden **cuándo hay que llamarlo**, en contraste con los de segmento,
 * que responden **qué clase de cliente es**. Son los que llevan orden por urgencia en vez
 * del orden de columnas.
 *
 * Que existan por separado es lo que arregla el cruce con la temperatura: adentro de "Hoy"
 * todos comparten fecha, así que la prioridad ordena **dentro del día** y un 🧊 Frío
 * agendado para hoy queda al final de los de hoy, no al final de la semana entera.
 */
export const FILTROS_POR_DIA = new Set(['atrasados', 'hoy', 'manana', 'semana'])

export type OpcionesTabla = {
  /** Texto del buscador, ya en minúsculas y trimmeado. */
  q: string
  /** El valor del select de segmento, o 'todos'. */
  seg: string
  sort: { col: string; dir: number }
  /** Hoy en `YYYY-MM-DD`. Sale del mismo TODAY con el que se calculó el agregado. */
  hoy?: string
  /**
   * El próximo día HÁBIL, en `YYYY-MM-DD`. Un viernes "mañana" no es sábado: es el lunes,
   * o el martes si el lunes es feriado. Lo resuelve el llamador con `proximoHabil`.
   */
  manana?: string
}

/** renderCRMTabla (13695-13744), sin el DOM: la parte que decide QUÉ filas y en qué orden. */
export function filtrarOrdenar(lista: ClienteCRM[], { q, seg, sort, hoy, manana }: OpcionesTabla): ClienteCRM[] {
  let out = lista.slice()

  // Se calcula sobre la lista ENTERA que entra, antes de cualquier filtro. Si se calculara
  // después del buscador, el "top 20" sería el top de lo que quedó tipeado y un cliente
  // podría cambiar de prioridad por escribir en el buscador.
  const top = idsTop(lista)

  if (seg === 'top') {
    out.sort((a, b) => b.total_amount - a.total_amount)
    out = out.slice(0, TOP_LIMIT)
  } else if (seg === 'sin-tel') {
    out = out.filter((c) => !normalizeArgPhone(c.phone))
  } else if (seg === 'sin-difusion') {
    // Clientes que compraron pero todavía no están en el canal de difusión.
    out = out.filter((c) => !c.en_difusion)
  } else if (seg === 'recuperar') {
    // La etapa de recuperación del día: los fríos que tocan, con cupo. Ordenados por lo que
    // compraron — el que más conviene recuperar primero, igual que la lista completa de fríos.
    // El corte a `TANDA_FRIOS` va ANTES del buscador, igual que en `top`: la tanda es la tanda,
    // y buscar adentro de ella no la agranda.
    out = out.filter(friosParaRecuperar)
    out.sort((a, b) => b.total_amount - a.total_amount)
    out = out.slice(0, TANDA_FRIOS)
  } else if (seg === 'frios') {
    // Lista de recuperación: SOLO los fríos, y todos — también los que están al día.
    // No lleva orden propio a propósito: cae en el orden de columnas de abajo, que por
    // defecto es total_amount desc, o sea el frío que más compró primero. Es el que más
    // conviene recuperar, y desde ahí se puede reordenar por cualquier columna.
    out = out.filter((c) => c.temperatura === 'frio')
  } else if (FILTROS_POR_DIA.has(seg)) {
    // 🔑 Los fríos no entran en la lista del día. Ver `esFrio`: al frío no se le escribe, así
    // que ocupar la lista de trabajo con ellos sólo la vuelve inabordable. Siguen enteros en
    // el filtro `frios`, que es la lista de recuperación.
    out = sinFrios(out)
    if (seg === 'atrasados') {
      // La deuda: vencía ANTES de hoy y no se lo llamó. Los `pendiente` entran también —
      // tienen cadencia y nunca se les registró un contacto, que es la misma deuda sin
      // fecha. Es el número que avisa si el plan se está desarmando.
      out = out.filter((c) => c.seg_estado === 'pendiente' || (!!c.proximo_contacto && !!hoy && c.proximo_contacto < hoy))
    } else if (seg === 'hoy') {
      out = out.filter((c) => !!hoy && c.proximo_contacto === hoy)
    } else if (seg === 'manana') {
      out = out.filter((c) => !!manana && c.proximo_contacto === manana)
    } else {
      // 'semana' — vencidos + pendientes + los próximos 7 días. MISMO criterio que
      // `paraContactar`, que es lo que cuenta la tarjeta.
      out = out.filter(paraContactar)
    }
    // Primero la prioridad comercial (temperatura + tamaño), y recién adentro de cada
    // grupo la urgencia de la fecha. Ese es el cambio: antes mandaba solo la fecha, y los
    // clientes grandes fríos con cadencia semanal vivían arriba de todo.
    // ⚠️ Y adentro del grupo el desempate va por `urgenciaFecha`, NO por días crudos: el
    // agendado para hoy va primero y el colgado de hace dos semanas al final. Ver ahí el porqué.
    const ord: Record<string, number> = { vencido: 0, pendiente: 1, semana: 2, aldia: 3, none: 4 }
    out.sort(
      (a, b) =>
        prioridadContacto(a, top.has(a.id)) - prioridadContacto(b, top.has(b.id)) ||
        (ord[a.seg_estado] ?? 9) - (ord[b.seg_estado] ?? 9) ||
        urgenciaFecha(a.dias_proximo) - urgenciaFecha(b.dias_proximo),
    )
  } else if (seg !== 'todos') {
    out = out.filter((c) => segmentoCliente(c) === seg)
  }

  if (q) {
    out = out.filter(
      (c) =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q),
    )
  }

  // Los filtros por día traen su propio orden por prioridad y urgencia; no se pisa.
  if (!FILTROS_POR_DIA.has(seg)) {
    const { col, dir } = sort
    out.sort((a, b) => {
      let av: string | number, bv: string | number
      if (col === 'name') { av = (a.name || '').toLowerCase(); bv = (b.name || '').toLowerCase() }
      else if (col === 'contact') { av = (a.email || a.phone || '').toLowerCase(); bv = (b.email || b.phone || '').toLowerCase() }
      else if (col === 'city') { av = (a.city || '').toLowerCase(); bv = (b.city || '').toLowerCase() }
      else if (col === 'last_sale') { av = a.last_sale || ''; bv = b.last_sale || '' }
      else if (col === 'proximo') {
        // Sin cadencia van al final; entre los que tienen, por fecha de próximo contacto.
        av = a.proximo_contacto || (a.seg_estado === 'pendiente' ? '0000-00-00' : '9999-12-31')
        bv = b.proximo_contacto || (b.seg_estado === 'pendiente' ? '0000-00-00' : '9999-12-31')
        if (a.seg_estado === 'none') av = '~'
        if (b.seg_estado === 'none') bv = '~'
      } else {
        av = (a as unknown as Record<string, number>)[col] || 0
        bv = (b as unknown as Record<string, number>)[col] || 0
      }
      if (av < bv) return -dir
      if (av > bv) return dir
      return 0
    })
  }

  return out
}

// ── Resumen de compras del modal ─────────────────────────────────────────────

/**
 * Los renglones de cada pedido, agrupados por venta, para poder abrir cualquiera del
 * historial y no solo el último.
 *
 * No cuesta ninguna consulta: `traerDetalles` ya baja el detalle de TODAS las ventas del
 * cliente (la ficha se lo pide con todos los ids), y hasta ahora `resumenCompras` se
 * quedaba con la última y tiraba el resto. Esto es aprovechar lo que ya está en memoria.
 *
 * Los renglones sin `sale_id` se descartan: no hay pedido al que colgarlos.
 */
export function detallesPorVenta(det: FilaDetalle[]): Map<number, FilaDetalle[]> {
  const out = new Map<number, FilaDetalle[]>()
  for (const d of det || []) {
    if (d.sale_id == null) continue
    const k = Number(d.sale_id)
    const actual = out.get(k)
    if (actual) actual.push(d)
    else out.set(k, [d])
  }
  return out
}

/**
 * renderResumenCompras (13826), sin el HTML.
 *
 * "Última compra" = la venta con `date_sale` más reciente **que tenga detalle**:
 * no es la última venta del cliente, es la última de la que sabemos qué llevó.
 */
export function resumenCompras(ventasDelCliente: FilaVenta[], det: FilaDetalle[]): ResumenCompras {
  if (!det || !det.length) return { ultima: null, top: [] }

  const fechaPorVenta: Record<string, string> = {}
  ;(ventasDelCliente || []).forEach((v) => { fechaPorVenta[String(v.id)] = v.date_sale || '' })

  let lastSid: string | null = null
  let lastFecha = ''
  det.forEach((d) => {
    const f = fechaPorVenta[String(d.sale_id)] || ''
    if (f && (!lastFecha || f > lastFecha)) { lastFecha = f; lastSid = String(d.sale_id) }
  })
  const itemsUltima = lastSid ? det.filter((d) => String(d.sale_id) === lastSid) : []

  // Lo que más compró, agregado por product_name
  type Acum = { name: string; unidades: number; ventas: Set<string>; ultFecha: string; ultPrecio: number }
  const agg = new Map<string, Acum>()
  det.forEach((d) => {
    const name = d.product_name || '—'
    const f = fechaPorVenta[String(d.sale_id)] || ''
    if (!agg.has(name)) agg.set(name, { name, unidades: 0, ventas: new Set(), ultFecha: '', ultPrecio: 0 })
    const a = agg.get(name) as Acum
    a.unidades += d.quantity || 0
    a.ventas.add(String(d.sale_id))
    if (f && (!a.ultFecha || f > a.ultFecha)) { a.ultFecha = f; a.ultPrecio = num(d.unit_price) }
  })

  return {
    ultima: itemsUltima.length ? { fecha: lastFecha, items: itemsUltima } : null,
    top: [...agg.values()]
      .sort((a, b) => b.unidades - a.unidades)
      .slice(0, 8)
      .map((a) => ({ name: a.name, unidades: a.unidades, veces: a.ventas.size, ultPrecio: a.ultPrecio })),
  }
}
