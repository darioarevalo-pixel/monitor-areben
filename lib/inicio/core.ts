/**
 * Lógica pura de Inicio (novedades: solicitudes de Sesión de fotos pendientes de
 * armar, multimarca). Port de las funciones `_inicio*` del legacy
 * (index.html:9717-9746).
 */

import { CUENTAS } from '@/lib/cuentas'
import { diasDelMes, diasEntre, FECHAS_COMERCIALES, iso, resolverComercial, sumarDias, type TipoFecha } from '@/lib/calendario'
import { esAdmin, puedeVer, tieneFuncion, type Perfil } from '@/lib/permisos'
import { marcasQueVe, type ResumenSolicitud } from '@/lib/solicitudes/overview'
import { ordenarAvisos } from '@/lib/notificaciones/derivar'
import { TIPO_LABEL, type Aviso, type TipoAviso } from '@/lib/notificaciones/tipos'
import { sinLeer, type Lectura, type Novedad } from '@/lib/novedades/tipos'
import type { Tone } from '@/components/ui/tokens'
import type { Marca } from '@/lib/nav'
import type { Origen, Solicitud } from '@/lib/sesionfotos/tipos'

/** Una solicitud pendiente, aplanada para el listado de Inicio. */
export type PendienteFoto = {
  id: string
  marca: Marca
  descripcion: string
  creadoPor: string
  creado: number
  fecha: string
  unidades: number
  /** Unidades partidas por origen (para las vistas por sector: Local / Depósito). */
  uLocal: number
  uDeposito: number
}

/**
 * Cómo se arma el Inicio según la función del usuario:
 * - `gerencial`: admin o Dirección → NO arranca con "fotos para armar" (solo un resumen).
 * - `sector`: Local/Depósito → solo lo pendiente de su origen.
 * - `completa`: Marketing/Administración, o sin función (compatibilidad) → la lista completa.
 */
export type ModoInicio = 'gerencial' | 'sector' | 'completa'

export function modoInicio(perfil: Perfil | null): ModoInicio {
  if (esAdmin(perfil) || tieneFuncion(perfil, 'direccion')) return 'gerencial'
  if (tieneFuncion(perfil, 'marketing') || tieneFuncion(perfil, 'administracion')) return 'completa'
  if (tieneFuncion(perfil, 'local') || tieneFuncion(perfil, 'deposito')) return 'sector'
  return 'completa'
}

/** Los orígenes que le tocan a este usuario en modo `sector` (Local y/o Depósito). */
export function origenesDe(perfil: Perfil | null): Origen[] {
  const o: Origen[] = []
  if (tieneFuncion(perfil, 'local')) o.push('local')
  if (tieneFuncion(perfil, 'deposito')) o.push('deposito')
  return o
}

/**
 * Marcas a las que este usuario puede ver Sesión de fotos (respeta la cuenta fija).
 * Port de _inicioMarcasVisibles: si tiene cuenta fija, solo esa; si no, las que
 * pueda ver (admin ve todas).
 */
export function marcasVisibles(perfil: Perfil | null, marcaActiva: Marca): Marca[] {
  if (!perfil) return []
  // Misma regla que la pantalla de Solicitudes (`marcasQueVe`): Administración y Dirección
  // ven las dos marcas juntas; Local, Depósito y Marketing, la marca en la que están
  // parados. Antes el Inicio mezclaba siempre las dos, así que en el local aparecían
  // pendientes de la otra marca.
  const candidatas = marcasQueVe(perfil, marcaActiva, Object.keys(CUENTAS) as Marca[])
  return candidatas.filter((m) => esAdmin(perfil) || puedeVer(perfil, m, 'sesion-fotos') || puedeVer(perfil, m, 'solicitudes'))
}

/**
 * Lo que está esperando trabajo de alguien: pendiente de preparar/aprobar, en proceso, o
 * ya separado en GN pero sin retirar.
 *
 * Antes el Inicio listaba `estado === 'pendiente'` del cajón de fotos y nada más. Con las
 * solicitudes unificadas eso mostraría la mitad del trabajo (las de otros motivos vivían en
 * el otro cajón) y dejaría afuera lo que está separado esperando que alguien lo pase a
 * buscar — que es exactamente lo que el local necesita ver a la mañana.
 */
export function pendientesDeTrabajo(resumenes: ResumenSolicitud[]): ResumenSolicitud[] {
  return resumenes.filter(
    (r) => r.grupo === 'pendiente' || r.grupo === 'enproceso' || (r.grupo === 'conventagn' && r.estadoTag === 'sin retirar'),
  )
}

/** El título del listado según el sector, para que cada uno lea SU tarea y no "solicitudes". */
export function tituloPendientes(origenes: Origen[]): string {
  const soloLocal = origenes.length === 1 && origenes[0] === 'local'
  const soloDep = origenes.length === 1 && origenes[0] === 'deposito'
  if (soloLocal) return '🏪 Para preparar y entregar en el local'
  if (soloDep) return '📦 Para preparar en el depósito'
  if (origenes.length) return '📋 Tus tareas pendientes'
  return '📋 Solicitudes en curso'
}

/** Suma las unidades de los ítems de una solicitud. */
export function unidadesDe(s: Solicitud): number {
  return (s.items || []).reduce((a, i) => a + (Number(i.qty) || 0), 0)
}

/** Suma las unidades de los ítems de un origen dado. */
export function unidadesOrigen(s: Solicitud, origen: Origen): number {
  return (s.items || []).reduce((a, i) => a + (i.origen === origen ? Number(i.qty) || 0 : 0), 0)
}

/** Aplana una solicitud a PendienteFoto (con su marca). */
export function aPendiente(s: Solicitud, marca: Marca): PendienteFoto {
  return {
    id: String(s.id),
    marca,
    descripcion: s.descripcion || '',
    creadoPor: s.creadoPor || '',
    creado: s.creado || 0,
    fecha: s.fecha || '',
    unidades: unidadesDe(s),
    uLocal: unidadesOrigen(s, 'local'),
    uDeposito: unidadesOrigen(s, 'deposito'),
  }
}

/**
 * De la lista de una marca, las 'pendiente' aplanadas. La lista puede venir de
 * `leerLista('sesionfotos', marca)`.
 */
export function pendientesDeMarca(lista: Solicitud[], marca: Marca): PendienteFoto[] {
  return lista.filter((s) => s.estado === 'pendiente').map((s) => aPendiente(s, marca))
}

/** Filtra las pendientes a las que tienen unidades en alguno de los orígenes del usuario (modo sector). */
export function filtrarPorOrigen(pend: PendienteFoto[], origenes: Origen[]): PendienteFoto[] {
  if (!origenes.length) return []
  return pend.filter((p) => origenes.some((o) => (o === 'local' ? p.uLocal : p.uDeposito) > 0))
}

/** Ordena las pendientes: la más nueva primero. Port del sort de inicioCargarPendientes. */
export function ordenar(pend: PendienteFoto[]): PendienteFoto[] {
  return pend.slice().sort((a, b) => (b.creado || 0) - (a.creado || 0))
}

/**
 * Etiqueta de hora relativa ("hoy 14:30" / "ayer 09:00" / "12/7/2026 …"). Port de
 * _inicioHora, con `hoy` por parámetro (el legacy usaba `new Date()`) para testear.
 */
export function horaLabel(creado: number, fecha: string, hoy: Date = new Date()): string {
  if (!creado) return fecha || ''
  const d = new Date(creado)
  const ayer = new Date(hoy)
  ayer.setDate(hoy.getDate() - 1)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const dia = d.toDateString() === hoy.toDateString() ? 'hoy' : d.toDateString() === ayer.toDateString() ? 'ayer' : d.toLocaleDateString('es-AR')
  return `${dia} ${hh}:${mm}`
}

// ── El saludo ────────────────────────────────────────────────────────────────────

/**
 * Cómo le decimos a quien está mirando.
 *
 * **Es el único lugar donde se decide**, y por eso lo usan tanto el Inicio como el sidebar: si
 * cada pantalla eligiera por su cuenta, la misma persona sería "Mari" en una y "mariana.local" en
 * la otra. Cae al `name` cuando no hay apodo, que es el caso de los puestos compartidos
 * (`bdilocal`, `deposito`): son cuentas de puesto y no de persona, y no tienen a quién saludar.
 */
export function comoLeLlamamos(perfil: Perfil | null): string {
  // Cada candidato se recorta ANTES de elegir, no después: un apodo de puros espacios es truthy y
  // ganaba la comparación, y recién el trim final lo dejaba vacío — o sea, "Hola, !".
  return (perfil?.apodo || '').trim() || (perfil?.name || '').trim()
}

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/**
 * "miércoles 12 de agosto". Con arrays propios y no con `toLocaleDateString('es-AR', …)` porque
 * este texto es la primera línea que lee todo el equipo: no puede depender de qué datos de idioma
 * tenga instalados el navegador ni el runtime de los tests.
 *
 * `hoy` entra por parámetro, como en `horaLabel`, por lo mismo que documenta `store/useAgenda.ts`:
 * **el día lo decide quien mira**. El server es UTC y a las 21:00 de Argentina ya es mañana.
 */
export function fechaLarga(hoy: Date = new Date()): string {
  return `${DIAS_SEMANA[hoy.getDay()]} ${hoy.getDate()} de ${MESES[hoy.getMonth()]}`
}

// ── Lo que viene ─────────────────────────────────────────────────────────────────

/** Una fecha del almanaque como la muestra la franja de Inicio. */
export type FechaQueViene = {
  clave: string
  /** `YYYY-MM-DD` */
  fecha: string
  titulo: string
  tipo: TipoFecha
  /** El catálogo hizo lo que pudo y todavía nadie confirmó el día. Se dibuja "(a confirmar)". */
  estimada: boolean
  /** El renglón en castellano que ya trae el catálogo: por qué esta fecha nos importa. */
  porQue: string
  /** Días desde hoy. `0` es hoy. */
  faltan: number
}

/**
 * Las fechas del almanaque que caen en los próximos `dias`, ordenadas por cercanía.
 *
 * 🔑 **No cuesta un fetch y por eso puede vivir en Inicio.** El calendario editorial pide al
 * servidor las fechas fijadas a mano, los hitos propios y las decisiones de cada marca; esta franja
 * **no las necesita**, porque no muestra ni prioridad ni producción — muestra qué días vienen. Todo
 * eso se calcula del catálogo, que es código. Es la misma razón por la que `proximas()` sigue
 * viviendo en `lib/calendario`: son dos preguntas distintas y comparten el catálogo, no la firma.
 *
 * ⚠️ **La ventana se recorre por años calendario, no por el año de hoy.** Parado un 20 de diciembre,
 * lo que viene es Año Nuevo y Reyes del año siguiente; mirar sólo el año en curso devolvería una
 * franja vacía justo en la semana en que más importa saber qué días no se abre. Es el mismo cuidado
 * que documenta `proximas()`, y el test lo amarra parándose el 26-dic.
 *
 * `soloFeriados` es la vista de Local y Depósito: a ellos les cambia **el día** (el local no abre,
 * el correo no despacha), no el trabajo. El Día de la Madre no les dice nada que puedan usar.
 */
export function loQueViene(hoy: string, dias: number, opts: { soloFeriados?: boolean } = {}): FechaQueViene[] {
  const hasta = sumarDias(hoy, dias)
  const out: FechaQueViene[] = []
  for (let anio = Number(hoy.slice(0, 4)); anio <= Number(hasta.slice(0, 4)); anio++) {
    for (const f of FECHAS_COMERCIALES) {
      if (opts.soloFeriados && f.tipo !== 'feriado') continue
      const r = resolverComercial(f.clave, anio)
      if (!r || r.fecha < hoy || r.fecha > hasta) continue
      out.push({
        clave: f.clave,
        fecha: r.fecha,
        titulo: f.titulo,
        tipo: f.tipo,
        estimada: r.estimada,
        porQue: f.porQue,
        faltan: diasEntre(hoy, r.fecha),
      })
    }
  }
  // Por fecha; el mismo día, primero el feriado: es el que decide si se trabaja. En 2026 el 2 de
  // abril es Malvinas y Jueves Santo a la vez, así que dos entradas el mismo día no es un caso raro.
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha) || ordenTipo(a.tipo) - ordenTipo(b.tipo) || a.titulo.localeCompare(b.titulo))
}

const ordenTipo = (t: TipoFecha) => (t === 'feriado' ? 0 : t === 'efemeride' ? 1 : 2)

// ── Los cumpleaños ───────────────────────────────────────────────────────────────

/** Alguien del equipo cumpliendo años, ya resuelto al año que corresponde. */
export type CumpleDeInicio = {
  apodo: string
  /** `YYYY-MM-DD` — el `MM-DD` del padrón, puesto en el año en que cae dentro de la ventana. */
  fecha: string
  faltan: number
}

/**
 * Quién cumple años en los próximos `dias`.
 *
 * 🔴 **Viaja sin año a propósito**: el padrón guarda `MM-DD` y nada más, así que la pantalla no
 * puede publicar la edad de nadie ni aunque alguien la quiera calcular. La lista llega con el login
 * (`cumples` en la respuesta de `bdi-catalogo/api/usuarios.js`) y trae **sólo apodo y día** — ni
 * mails, ni permisos, ni quién es admin. Que sea la única forma de saber quién cumple sin abrir el
 * padrón entero, que es admin-only, no es una casualidad del diseño: es el diseño.
 *
 * El cruce de año se resuelve probando el año en curso y el siguiente: un 3 de enero mirado desde
 * el 27 de diciembre cae en el año que viene, y sin eso la franja se apagaría sola justo en las
 * fiestas. Un `MM-DD` que no existe ese año —el 29 de febrero de quien nació bisiesto— se saluda
 * el 28: correrlo al 1 de marzo lo pasaría a otro mes, y el saludo llegaría tarde en vez de temprano.
 */
export function cumplesDe(cumples: { apodo: string; cumple: string }[], hoy: string, dias: number): CumpleDeInicio[] {
  const hasta = sumarDias(hoy, dias)
  const out: CumpleDeInicio[] = []
  for (const c of cumples || []) {
    const m = /^(\d{2})-(\d{2})$/.exec(String(c?.cumple || '').trim())
    if (!m) continue
    const mes = Number(m[1])
    const dia = Number(m[2])
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) continue
    const apodo = String(c.apodo || '').trim()
    if (!apodo) continue
    for (let anio = Number(hoy.slice(0, 4)); anio <= Number(hasta.slice(0, 4)); anio++) {
      const fecha = iso(anio, mes, Math.min(dia, diasDelMes(anio, mes)))
      if (fecha < hoy || fecha > hasta) continue
      out.push({ apodo, fecha, faltan: diasEntre(hoy, fecha) })
    }
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.apodo.localeCompare(b.apodo))
}

/**
 * Cómo se lee la distancia: "hoy", "mañana", "en 3 días", "el lunes".
 *
 * 🔑 **"Falta 1 día" y "mañana" no son la misma frase**, aunque sean el mismo número: la segunda se
 * entiende sin restar. Y a partir de una semana el número vuelve a ganar, porque "el martes" a
 * doce días de distancia es ambiguo — hay dos martes.
 */
export function cuandoLabel(faltan: number, fecha: string): string {
  if (faltan <= 0) return 'hoy'
  if (faltan === 1) return 'mañana'
  if (faltan <= 6) {
    const [a, m, d] = fecha.split('-').map(Number)
    return `el ${DIAS_SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]}`
  }
  return `en ${faltan} días`
}

// ── Los avisos, agrupados para la pantalla ───────────────────────────────────────

/** Un tipo de aviso con sus filas: es lo que se dibuja como bloque en Inicio. */
export type GrupoAvisos = {
  tipo: TipoAviso
  /** El rótulo ya escrito en `TIPO_LABEL`: no hay una segunda lista de nombres. */
  label: string
  /** El peor tono del grupo — el que le pone color al encabezado. */
  tono: Tone
  avisos: Aviso[]
}

/** Qué tan fuerte grita cada tono. Es el orden en que se leen los bloques. */
const PESO_TONO: Record<string, number> = { danger: 0, warning: 1, brand: 2, action: 3, success: 4, neutral: 5 }

/** El orden en que se muestran los bloques cuando empatan en tono: el del catálogo de tipos. */
const ORDEN_TIPO = Object.keys(TIPO_LABEL) as TipoAviso[]

/**
 * Los avisos partidos en bloques por tipo, listos para pintar.
 *
 * 🔑 **Recibe los MISMOS avisos que cuenta el badge del sidebar y no filtra ninguno.** Ese es todo
 * el punto: antes Inicio leía las solicitudes crudas (`resumenes`) en vez de `avisos`, así que el
 * badge decía "6" y al entrar se veían tres — los canjes por firmar, las fallas por llevar al
 * depósito y lo que salió sin volver no se veían en ninguna pantalla. Un contador que no se puede
 * vaciar mirando enseña a ignorar el contador. `tests/inicio.test.ts` amarra que las dos cuentas
 * den lo mismo; si algún día hace falta esconder un tipo, se esconde en el derivador, no acá.
 *
 * Adentro de cada bloque manda `ordenarAvisos` (lo más nuevo arriba), que es el mismo orden que ya
 * usa el store. Entre bloques manda el tono: lo que está en rojo se lee antes.
 */
export function agruparAvisos(avisos: Aviso[]): GrupoAvisos[] {
  const porTipo = new Map<TipoAviso, Aviso[]>()
  for (const a of avisos) {
    const ya = porTipo.get(a.tipo)
    if (ya) ya.push(a)
    else porTipo.set(a.tipo, [a])
  }
  return [...porTipo.entries()]
    .map(([tipo, lista]) => {
      const tono = lista.reduce<Tone>((peor, a) => ((PESO_TONO[a.tono] ?? 9) < (PESO_TONO[peor] ?? 9) ? a.tono : peor), lista[0].tono)
      return { tipo, label: TIPO_LABEL[tipo], tono, avisos: ordenarAvisos(lista) }
    })
    .sort((a, b) => (PESO_TONO[a.tono] ?? 9) - (PESO_TONO[b.tono] ?? 9) || ORDEN_TIPO.indexOf(a.tipo) - ORDEN_TIPO.indexOf(b.tipo))
}

// ── Las novedades del pie ────────────────────────────────────────────────────────

/** Una novedad como la muestra Inicio: la fila más el "todavía no la leíste". */
export type NovedadDeInicio = { novedad: Novedad; nueva: boolean }

/**
 * Las últimas novedades que le tocan a esta persona.
 *
 * **El filtro por rol ya vino hecho**: el servidor calcula `paraMi` según el `destino` de cada una
 * (todos / una sección / ciertos roles) y a quien no publica ni se las manda. Acá sólo se recorta
 * a las publicadas y se ordena — la lista cruda del store trae también los borradores de quien
 * puede publicar, que no van al pie de Inicio de nadie.
 *
 * `nueva` sale de `sinLeer`, que compara **por versión**: una novedad reeditada vuelve a contar.
 */
export function novedadesDeInicio(novedades: Novedad[], leidas: Lectura[], max = 3): NovedadDeInicio[] {
  const nuevas = new Set(sinLeer(novedades, leidas).map((n) => n.id))
  return (novedades || [])
    .filter((n) => n.estado === 'publicada' && n.paraMi !== false)
    .sort((a, b) => Date.parse(b.publicada_at || b.created_at || '') - Date.parse(a.publicada_at || a.created_at || ''))
    .slice(0, max)
    .map((n) => ({ novedad: n, nueva: nuevas.has(n.id) }))
}
