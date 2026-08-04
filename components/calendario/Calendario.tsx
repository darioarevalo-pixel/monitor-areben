'use client'

/**
 * Calendario editorial — cuándo se necesita cada cosa.
 *
 * # Por qué esta pantalla existe
 *
 * No había ningún lugar donde vivieran las fechas. Las comerciales se recordaban tarde (el Día de
 * la Madre quince días antes, cuando ya no hay tiempo de producir una pieza) y los lanzamientos
 * propios vivían en la cabeza de cada uno. Es la mitad "cuándo lo necesitás" del problema; la otra
 * mitad —"qué falta"— la contesta `/meta-ads/etapas`.
 *
 * **Sueltas son dos pantallas informativas; juntas producen un pedido.** De ahí el renglón "Etapas
 * armadas" de cada fila: no dice sólo que el Día de la Madre es en 34 días, dice que en 34 días es
 * el Día de la Madre y que **no hay ni una idea de la segunda etapa anotada**. Eso es lo único que
 * hace que alguien se ponga a craneаr hoy.
 *
 * # Las cuatro decisiones de diseño que no son cosméticas
 *
 *  1. **Arranca en la lista, no en la grilla.** La lista es la que hace actuar (los días que faltan
 *     en grande, el pedido al lado); la grilla es contexto para ubicarse. Encima en el celular la
 *     grilla no se lee, y la lista sí.
 *  2. **Una fecha estimada NUNCA se dibuja como firme.** Chip ámbar y botón para confirmarla. Una
 *     fecha inventada presentada como cierta es peor que no tener la fecha: el equipo planifica
 *     contra un dato falso y cuando se entera ya es tarde.
 *  3. **Los días que faltan van en grande y la decisión abajo.** "Faltan 34 días" tranquiliza; con
 *     cuánta fuerza la vamos a jugar es lo que mueve.
 *  4. 🔴 **La urgencia NO se deduce: la pone una persona.** La pantalla nació anunciando "ya habría
 *     que estar produciendo" cuando el `anticipoDias` del catálogo había vencido, sin que nadie
 *     hubiera decidido trabajar esa fecha. Es falso —si estas marcas se suman al Día del Niño
 *     depende del stock y de las manos que haya, no del almanaque— y encima es caro: un aviso que
 *     se ignora doce veces enseña a ignorar el número trece, que sí importaba. Ahora el catálogo
 *     pone las fechas sobre la mesa, alguien marca fuerte / suave / pasamos, y **la ausencia de
 *     decisión se dibuja como la pregunta abierta que es**, no como un default inventado.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { InfoPopover } from '@/components/ui/InfoPopover'
import {
  apagaLaFila, diaDeSemanaDe, diasDelMes, diasEntre, fechaComercialDe, hoyIso, iso, juegaLaFecha,
  laQueAprieta, PRIORIDADES, prioridadDe, proximas, sinDecidir, TIPOS_HITO,
  type DecisionFecha, type EntradaCalendario, type FechaFijada, type Hito, type Prioridad,
} from '@/lib/calendario'
import {
  borrarHito, decidirFecha, desfijarFecha, fijarFecha, guardarHito, indecidirFecha, leerCalendario,
  nuevoIdHito,
} from '@/lib/calendario/persistencia'
import { ETIQUETA_ETAPA } from '@/lib/meta-ads/etapas'
import { ETAPAS } from '@/lib/meta-ads/etapas'
import type { Etapa } from '@/lib/meta-ads/tipos'
import { FORMATOS_IDEA, guardarIdea, leerIdeas, nuevoIdIdea, type Idea } from '@/lib/meta-ads/ideas'
import {
  Button, Card, EmptyState, Field, Input, Modal, Notice, Select, StatusPill, Tabs, useToast,
  color, font, radius, space, weight,
} from '@/components/ui'

/**
 * Hasta dónde mira "lo que se viene".
 *
 * 🔴 **El default son 6 meses, no 3, y el cambio no es cosmético.** Arrancó en 90 días porque la
 * pantalla servía para *avisar*: un trimestre alcanza para no llegar tarde a lo que viene. Desde que
 * sirve para **decidir** con cuánta fuerza jugamos cada fecha, 90 días es un techo que estorba —
 * parado en agosto cortaba el 2 de noviembre y no se podía decidir ni Black Friday ni Navidad, que
 * son justamente las que hay que resolver con tiempo. No se puede decidir lo que no se ve.
 *
 * Sigue siendo elegible porque las dos lecturas son válidas: "qué tengo encima" y "qué queda por
 * resolver este año".
 */
const VENTANAS = [
  { key: '90', label: '3 meses', dias: 90 },
  { key: '180', label: '6 meses', dias: 180 },
  { key: '365', label: 'Todo el año', dias: 365 },
]
const VENTANA_DEFAULT = '180'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

/** `180` → `los próximos 6 meses`. Para no repetir "en los próximos 180 días", que nadie piensa así. */
function rotuloVentana(dias: number): string {
  if (dias >= 365) return 'los próximos 12 meses'
  return `los próximos ${Math.round(dias / 30)} meses`
}

/** `2026-10-18` → `dom 18-oct`. Sin `toLocaleDateString`, que se corre de día por zona horaria. */
function rotuloFecha(f: string): string {
  const [, m, d] = f.split('-').map(Number)
  return `${DIAS_CORTOS[diaDeSemanaDe(f)]} ${d}-${MESES[m - 1].slice(0, 3)}`
}

export function Calendario() {
  const { marca, perfil } = useSesion()
  const toast = useToast()
  const [vista, setVista] = useState<'lista' | 'mes'>('lista')
  const [ventana, setVentana] = useState(VENTANA_DEFAULT)
  const dias = VENTANAS.find((v) => v.key === ventana)?.dias ?? 180
  const [editando, setEditando] = useState<Partial<Hito> | null>(null)
  const [anotando, setAnotando] = useState<EntradaCalendario | null>(null)
  const [confirmando, setConfirmando] = useState<EntradaCalendario | null>(null)
  const [decidiendo, setDecidiendo] = useState<{ e: EntradaCalendario; prioridad: Prioridad } | null>(null)

  // Todo lo cargado viaja en UN estado sellado con su clave, como en `Etapas.tsx`. Así el `setState`
  // vive siempre adentro de la promesa (nunca en el cuerpo del efecto, que dispara renders en
  // cascada) y una respuesta vieja de la marca anterior no puede pisar a la nueva.
  const [datos, setDatos] = useState<{
    key: string
    hitos: Hito[]
    fijadas: FechaFijada[]
    decisiones: DecisionFecha[]
    ideas: Idea[]
    ideasCaidas: boolean
    error: string | null
  } | null>(null)
  const [nonce, setNonce] = useState(0)

  const hoy = hoyIso()
  const key = `${marca}|${nonce}`

  useEffect(() => {
    let vivo = true
    void (async () => {
      let hitos: Hito[] = []
      let fijadas: FechaFijada[] = []
      let decisiones: DecisionFecha[] = []
      let error: string | null = null
      try {
        const cal = await leerCalendario(marca)
        hitos = cal.hitos
        fijadas = cal.fijadas
        decisiones = cal.decisiones
      } catch (e) {
        error = e instanceof Error ? e.message : 'No se pudo leer el calendario.'
      }
      // Las ideas van aparte y su falla NO tumba el calendario: son el enganche, no el contenido.
      // Si la tabla todavía no está migrada en esta marca, el calendario tiene que seguir sirviendo
      // y lo único que se pierde es el renglón "Etapas armadas".
      let ideas: Idea[] = []
      let ideasCaidas = false
      try {
        ideas = (await leerIdeas(marca)).ideas
      } catch {
        ideasCaidas = true
      }
      if (vivo) setDatos({ key: `${marca}|${nonce}`, hitos, fijadas, decisiones, ideas, ideasCaidas, error })
    })()
    return () => { vivo = false }
  }, [marca, nonce])

  const recargar = useCallback(() => setNonce((n) => n + 1), [])

  const cargando = !datos || datos.key !== key
  const hitos = datos?.hitos ?? []
  const entradas = useMemo(
    () => proximas(hoy, dias, {
      fijadas: datos?.fijadas ?? [],
      hitos: datos?.hitos ?? [],
      ideas: datos?.ideas ?? [],
      decisiones: datos?.decisiones ?? [],
    }),
    [hoy, dias, datos],
  )

  async function guardar(h: Partial<Hito>) {
    try {
      await guardarHito(marca, {
        ...h,
        id: h.id || nuevoIdHito(),
        titulo: String(h.titulo || ''),
        fecha: String(h.fecha || ''),
      })
      setEditando(null)
      toast.ok('Hito guardado.')
      recargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar.')
    }
  }

  async function borrar(id: string) {
    try {
      await borrarHito(marca, id)
      setEditando(null)
      toast.ok('Hito borrado.')
      recargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo borrar.')
    }
  }

  async function anotar(e: EntradaCalendario, d: { etapa: Etapa; titulo: string; formato: string; gancho: string }) {
    try {
      await guardarIdea(marca, {
        id: nuevoIdIdea(),
        etapa: d.etapa,
        titulo: d.titulo,
        formato: d.formato,
        gancho: d.gancho || null,
        evento: e.id,
      })
      setAnotando(null)
      toast.ok(`Idea anotada para ${e.titulo}.`)
      recargar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo anotar la idea.')
    }
  }

  async function confirmar(e: EntradaCalendario, fecha: string) {
    const clave = e.id.split(':')[1]
    const anio = Number(e.id.split(':')[2])
    try {
      if (fecha) await fijarFecha(marca, clave, anio, fecha)
      else await desfijarFecha(marca, clave, anio)
      setConfirmando(null)
      toast.ok(fecha ? 'Fecha confirmada.' : 'Vuelve a mostrarse como estimada.')
      recargar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo confirmar la fecha.')
    }
  }

  /**
   * `pasamos` guarda de una: no hay nada que producir, así que pedir una fecha de arranque sería
   * pedir un dato que no existe. Jugarla abre el modal con el arranque sugerido para confirmar —
   * el catálogo prellena, la persona decide.
   */
  async function elegirPrioridad(e: EntradaCalendario, prioridad: Prioridad) {
    if (juegaLaFecha(prioridad)) return setDecidiendo({ e, prioridad })
    await decidir(e, prioridad, null)
  }

  async function decidir(e: EntradaCalendario, prioridad: Prioridad, arrancar: string | null) {
    try {
      await decidirFecha(marca, e.id, prioridad, arrancar)
      setDecidiendo(null)
      toast.ok(`${e.titulo}: ${prioridadDe(prioridad)?.label.toLowerCase()}.`)
      recargar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar la prioridad.')
    }
  }

  async function indecidir(e: EntradaCalendario) {
    try {
      await indecidirFecha(marca, e.id)
      setDecidiendo(null)
      toast.ok(`${e.titulo} vuelve a quedar sin decidir.`)
      recargar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo volver atrás.')
    }
  }

  const aprieta = laQueAprieta(entradas)
  const pendientes = useMemo(() => sinDecidir(entradas), [entradas])
  const error = datos?.error ?? null
  const ideasCaidas = !!datos?.ideasCaidas

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
        <Tabs
          items={[{ key: 'lista', label: 'Lo que se viene' }, { key: 'mes', label: 'Mes' }]}
          value={vista}
          onChange={(k) => setVista(k as 'lista' | 'mes')}
        />
        <Select value={ventana} onChange={(e) => setVentana(e.target.value)} style={{ width: 140 }}>
          {VENTANAS.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
        </Select>
        <div style={{ flex: 1 }} />
        <Button variant="solid" onClick={() => setEditando({ fecha: hoy, firme: false, tipo: 'lanzamiento' })}>
          Cargar algo nuestro
        </Button>
      </div>

      {error && <Notice tone="danger">{error}</Notice>}

      {ideasCaidas && (
        <Notice tone="neutral">
          <div style={{ fontSize: font.sm, lineHeight: 1.5 }}>
            No se pudieron leer las ideas de creativos, así que el renglón <b>Etapas armadas</b> no
            se muestra. El resto del calendario funciona igual. Si es la primera vez, puede faltar
            correr <code>node scripts/apply-meta-funnel.mjs</code>.
          </div>
        </Notice>
      )}

      {/*
        La banda de arriba dice lo que decidimos, no lo que dedujo una resta.
        Antes anunciaba "ya habría que estar produciendo" para cualquier fecha del catálogo cuyo
        anticipo hubiera vencido — el Día del Niño incluido, que estas dos marcas casi no trabajan.
        Un aviso que se ignora doce veces enseña a ignorar el número trece.
      */}
      {aprieta && (
        <Notice tone={aprieta.arrancarEn !== null && aprieta.arrancarEn <= 0 ? 'warning' : 'neutral'}>
          <div style={{ fontSize: font.md, fontWeight: weight.bold }}>
            {aprieta.titulo} es en {aprieta.faltan} {aprieta.faltan === 1 ? 'día' : 'días'}
            {aprieta.arrancarEn === null
              ? ` y le vamos ${prioridadDe(aprieta.prioridad)?.corto.toLowerCase()}.`
              : aprieta.arrancarEn <= 0
                ? `: pusiste arrancar el ${rotuloFecha(aprieta.arrancar!)} y ya pasó.`
                : `: pusiste arrancar en ${aprieta.arrancarEn} ${aprieta.arrancarEn === 1 ? 'día' : 'días'}.`}
          </div>
          <div style={{ fontSize: font.sm, marginTop: space[1], lineHeight: 1.5 }}>
            {aprieta.arrancarEn === null
              ? 'Falta poner desde cuándo hay que producirla.'
              : aprieta.detalle}
          </div>
        </Notice>
      )}

      {!cargando && pendientes.length > 0 && (
        <Notice tone="neutral">
          <div style={{ fontSize: font.md, fontWeight: weight.bold }}>
            {pendientes.length === 1
              ? `Hay 1 fecha sin decidir en ${rotuloVentana(dias)}.`
              : `Hay ${pendientes.length} fechas sin decidir en ${rotuloVentana(dias)}.`}
          </div>
          <div style={{ fontSize: font.sm, marginTop: space[1], lineHeight: 1.5 }}>
            {pendientes.slice(0, 4).map((e) => `${e.titulo} (${e.faltan} d)`).join(' · ')}
            {pendientes.length > 4 ? ` y ${pendientes.length - 4} más abajo` : ''}. Marcá con cuánta fuerza vamos a
            cada una: sin eso, el calendario no puede decir qué aprieta ni pedirle creativos a
            Etapas de la pauta.
          </div>
        </Notice>
      )}

      {cargando ? (
        <Card style={{ color: color.mut2 }}>Leyendo el calendario…</Card>
      ) : vista === 'lista' ? (
        <Lista
          entradas={entradas}
          dias={dias}
          sinIdeas={ideasCaidas}
          onAnotar={setAnotando}
          onConfirmar={setConfirmando}
          onPrioridad={elegirPrioridad}
          onCambiar={(e) => setDecidiendo({ e, prioridad: e.prioridad || e.prioridadSugerida || 'fuerte' })}
          onEditar={(id) => setEditando(hitos.find((h) => h.id === id) || null)}
        />
      ) : (
        <Grilla entradas={entradas} hoy={hoy} />
      )}

      {editando && (
        <ModalHito
          hito={editando}
          onCerrar={() => setEditando(null)}
          onGuardar={guardar}
          onBorrar={editando.id ? () => borrar(String(editando.id)) : undefined}
          puedeBorrar={!!editando.id && (String(editando.creadoPor || '') === String(perfil?.name || ''))}
        />
      )}

      {anotando && <ModalIdea entrada={anotando} onCerrar={() => setAnotando(null)} onAnotar={anotar} />}

      {confirmando && <ModalConfirmarFecha entrada={confirmando} onCerrar={() => setConfirmando(null)} onConfirmar={confirmar} />}

      {decidiendo && (
        <ModalDecidir
          entrada={decidiendo.e}
          prioridad={decidiendo.prioridad}
          hoy={hoy}
          onCerrar={() => setDecidiendo(null)}
          onGuardar={decidir}
          onSoltar={() => indecidir(decidiendo.e)}
        />
      )}
    </div>
  )
}

// ── Lo que se viene ──────────────────────────────────────────────────────────────────────────

function Lista({ entradas, dias, sinIdeas, onAnotar, onConfirmar, onPrioridad, onCambiar, onEditar }: {
  entradas: EntradaCalendario[]
  dias: number
  sinIdeas: boolean
  onAnotar: (e: EntradaCalendario) => void
  onConfirmar: (e: EntradaCalendario) => void
  onPrioridad: (e: EntradaCalendario, p: Prioridad) => void
  onCambiar: (e: EntradaCalendario) => void
  onEditar: (id: string) => void
}) {
  if (!entradas.length) {
    return (
      <EmptyState
        title={`No hay nada en ${rotuloVentana(dias)}`}
        hint="Las fechas comerciales se calculan solas; lo propio (lanzamientos, sesiones, llegada de mercadería) se carga con el botón de arriba."
        dashed
      />
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
      {entradas.map((e) => (
        <Fila
          key={e.id} e={e} sinIdeas={sinIdeas}
          onAnotar={onAnotar} onConfirmar={onConfirmar} onPrioridad={onPrioridad}
          onCambiar={onCambiar} onEditar={onEditar}
        />
      ))}
    </div>
  )
}

function Fila({ e, sinIdeas, onAnotar, onConfirmar, onPrioridad, onCambiar, onEditar }: {
  e: EntradaCalendario
  sinIdeas: boolean
  onAnotar: (e: EntradaCalendario) => void
  onConfirmar: (e: EntradaCalendario) => void
  onPrioridad: (e: EntradaCalendario, p: Prioridad) => void
  onCambiar: (e: EntradaCalendario) => void
  onEditar: (id: string) => void
}) {
  // 🔴 Urgente sólo si una persona puso desde cuándo producir y esa fecha ya pasó. Antes salía de
  // `faltan <= anticipoDias`, o sea del catálogo: la mitad de las filas aparecían en ámbar sin que
  // nadie hubiera decidido trabajarlas.
  const urgente = juegaLaFecha(e.prioridad) && e.arrancarEn !== null && e.arrancarEn <= 0
  // Una fecha que dejamos pasar se apaga en vez de esconderse: sigue estando (para no volver a
  // discutirla) pero deja de competir por la atención con las que sí vamos a trabajar.
  // ⚠️ `institucional` NO apaga: está decidida y se ve normal, sólo que no reclama producción.
  const apagada = apagaLaFila(e.prioridad)
  return (
    <div
      style={{
        display: 'flex', gap: space[4], alignItems: 'flex-start', flexWrap: 'wrap',
        border: `1px solid ${urgente ? color.warningBorder : color.line}`,
        background: color.surface, borderRadius: radius.xl, padding: space[4],
        opacity: apagada ? 0.6 : 1,
      }}
    >
      {/* Los días que faltan, en grande. Es el dato que se busca al entrar. */}
      <div style={{ minWidth: 68, textAlign: 'center' }}>
        <div style={{ fontSize: font['2xl'], fontWeight: weight.heavy, color: urgente ? color.warningInk : color.ink, lineHeight: 1 }}>
          {e.faltan}
        </div>
        <div style={{ fontSize: font.xs, color: color.mut2 }}>{e.faltan === 1 ? 'día' : 'días'}</div>
      </div>

      <div style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: space[1.5] }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
          <span style={{ fontSize: font.md, fontWeight: weight.bold, color: color.ink }}>{e.titulo}</span>
          <span style={{ fontSize: font.sm, color: color.mut }}>{rotuloFecha(e.fecha)}</span>
          <ChipCerteza e={e} />
          {e.tipoHito && <span style={{ fontSize: font.xs, color: color.mut2 }}>{TIPOS_HITO.find((t) => t.key === e.tipoHito)?.label || e.tipoHito}</span>}
        </div>

        {e.clase === 'comercial' && (
          <Decision e={e} urgente={urgente} onPrioridad={onPrioridad} onCambiar={onCambiar} />
        )}

        {e.detalle && <div style={{ fontSize: font.sm, color: color.mut2, lineHeight: 1.45 }}>{e.detalle}</div>}

        {e.creadoPor && <div style={{ fontSize: font.xs, color: color.mut2 }}>Cargado por {e.creadoPor}</div>}

        {/* El renglón de etapas se dibuja sólo cuando la fecha pide producción de verdad. Una que
            dejamos pasar no necesita creativos, y un feriado en `institucional` tampoco: mostrarle
            tres etapas vacías haría parecer que falta trabajo que nadie va a hacer. Sin decidir SÍ
            se dibuja — es lo que hace que valga la pena decidir. */}
        {!sinIdeas && (!e.prioridad || juegaLaFecha(e.prioridad)) && <Cobertura e={e} />}
      </div>

      <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center' }}>
        {e.certeza === 'estimada' && (
          <Button size="sm" variant="ghost" tone="warning" onClick={() => onConfirmar(e)}>Confirmar fecha</Button>
        )}
        {e.clase === 'hito' && (
          <Button size="sm" variant="ghost" onClick={() => onEditar(e.id.replace(/^hito:/, ''))}>Editar</Button>
        )}
        {!apagada && <Button size="sm" variant="soft" onClick={() => onAnotar(e)}>Anotar idea</Button>}
      </div>
    </div>
  )
}

/**
 * Con cuánta fuerza jugamos esta fecha — la decisión que antes tomaba una resta.
 *
 * Sin decidir **no se dibuja como un estado neutro**: se dibuja como la pregunta abierta que es, con
 * los tres botones a la vista. Es lo único que la pantalla pide, y pedirlo con un `<Select>` que ya
 * muestra un valor haría parecer que alguien decidió. La ausencia de decisión tiene que verse.
 */
function Decision({ e, urgente, onPrioridad, onCambiar }: {
  e: EntradaCalendario
  urgente: boolean
  onPrioridad: (e: EntradaCalendario, p: Prioridad) => void
  onCambiar: (e: EntradaCalendario) => void
}) {
  if (!e.prioridad) {
    // El peldaño sugerido va primero y resaltado; los otros tres quedan disponibles igual. Un
    // feriado sugiere `institucional` y una comercial `fuerte`, pero ninguno de los dos es un techo:
    // el 9 de julio en año de Mundial se sube a `fuerte` desde acá mismo.
    const sug = e.prioridadSugerida
    const orden = [...PRIORIDADES].sort((a, b) => Number(b.key === sug) - Number(a.key === sug))
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
        <span style={{ fontSize: font.sm, color: color.ink2, fontWeight: weight.semibold }}>
          {e.tipo === 'feriado' || e.tipo === 'efemeride' ? '¿Subimos algo?' : '¿Nos sumamos?'}
        </span>
        {orden.map((p) => (
          <Button
            key={p.key} size="sm" variant={p.key === sug ? 'soft' : 'ghost'} title={p.ayuda}
            onClick={() => onPrioridad(e, p.key)}
          >
            {p.corto}
          </Button>
        ))}
        <InfoPopover titulo="Por qué lo pregunta en vez de deducirlo">
          <p>
            El calendario sabe <b>cuándo</b> es cada fecha. No puede saber si estas marcas se suman:
            eso depende del stock, de si la fecha le habla al público y de si hay manos esa semana.
          </p>
          <p>
            Antes lo deducía de un anticipo del catálogo y avisaba «ya habría que estar produciendo»
            para fechas que nadie pensaba trabajar. Un aviso que se ignora doce veces enseña a
            ignorar el número trece, que sí importaba.
          </p>
          <p>
            Un feriado o una efeméride arrancan sugiriendo <b>algo institucional</b> —subimos una
            pieza y listo—, pero eso no es un techo: si ese año la fecha vale la pena (un 9 de julio
            en año de Mundial), se la sube a <b>suave</b> o <b>fuerte</b> y pide creativos como
            cualquier otra.
          </p>
          <p>
            Lo que elijas vale <b>para esta marca y este año</b>: el que viene se vuelve a preguntar,
            así que lo que subiste una vez no queda subido para siempre.
          </p>
        </InfoPopover>
      </div>
    )
  }

  const p = prioridadDe(e.prioridad)!
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
      <StatusPill tone={e.prioridad === 'fuerte' ? 'success' : 'neutral'} label={p.label.toLowerCase()} />
      {p.arrastraProduccion && (
        <span
          style={{
            fontSize: font.sm,
            color: urgente ? color.warningInk : color.mut,
            fontWeight: urgente ? weight.semibold : weight.normal,
          }}
        >
          {e.arrancar === null
            ? 'falta poner desde cuándo producirla'
            : urgente
              ? `había que arrancar el ${rotuloFecha(e.arrancar)}`
              : `arrancar el ${rotuloFecha(e.arrancar)}${e.arrancarEn !== null ? ` (en ${e.arrancarEn} ${e.arrancarEn === 1 ? 'día' : 'días'})` : ''}`}
        </span>
      )}
      <Button size="sm" variant="ghost" onClick={() => onCambiar(e)}>Cambiar</Button>
    </div>
  )
}

/**
 * El renglón que convierte una fecha en un pedido: cuántas ideas hay anotadas por etapa.
 *
 * Cuenta las ideas vivas, no las producidas: la pregunta que contesta es "¿hay alguien pensando
 * esto?". Si sólo contara las terminadas, diría "no hay nada de la segunda etapa" con cuatro ideas
 * anotadas y el equipo dejaría de creerle en una semana.
 */
function Cobertura({ e }: { e: EntradaCalendario }) {
  const total = ETAPAS.reduce((t, x) => t + (e.cobertura[x] || 0), 0)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap', marginTop: space[1] }}>
      <span style={{ fontSize: font.xs, color: color.mut2 }}>Etapas armadas:</span>
      {ETAPAS.map((x) => {
        const n = e.cobertura[x] || 0
        return (
          <span
            key={x}
            title={n ? `${n} idea${n === 1 ? '' : 's'} anotada${n === 1 ? '' : 's'}` : 'Nadie anotó nada para esta etapa'}
            style={{
              fontSize: font.xs, display: 'inline-flex', alignItems: 'center', gap: 4,
              color: n ? color.successInk : color.mut2,
              // La que falta va punteada y sin relleno, igual que la tarjeta vacía de Etapas de la
              // pauta: el hueco se tiene que ver, no leerse.
              border: `1px ${n ? 'solid' : 'dashed'} ${n ? color.successBorder : color.line}`,
              background: n ? color.successBg : 'transparent',
              borderRadius: radius.pill, padding: '2px 8px',
            }}
          >
            {n ? '✓' : '✗'} {ETIQUETA_ETAPA[x]}{n > 1 ? ` (${n})` : ''}
          </span>
        )
      })}
      {total === 0 && <span style={{ fontSize: font.xs, color: color.mut2 }}>— todavía no hay nada pensado</span>}
    </div>
  )
}

function ChipCerteza({ e }: { e: EntradaCalendario }) {
  if (e.certeza === 'estimada') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <StatusPill tone="warning" label="fecha estimada" />
        <InfoPopover titulo="Por qué esta fecha no es segura">
          <p>
            Esta fecha <b>no la decide el calendario</b>: la anuncia una cámara y cambia todos los
            años. Lo que se muestra es la mejor estimación posible con la regla histórica, y por eso
            va marcada.
          </p>
          {e.comoSeConfirma && <p>{e.comoSeConfirma}</p>}
          <p>
            Cuando salga la fecha real, <b>Confirmar fecha</b> la fija para este año y el chip se
            apaga. Planificar contra una estimación presentada como firme es cómo se llega tarde.
          </p>
        </InfoPopover>
      </span>
    )
  }
  if (e.certeza === 'proyectada') return <StatusPill tone="neutral" label="proyectada" />
  return null
}

// ── La grilla del mes ────────────────────────────────────────────────────────────────────────

/**
 * Contexto, no acción: sirve para ubicarse ("¿cuánto hay entre el lanzamiento y Black Friday?").
 * Por eso no tiene botones y es la segunda pestaña — en el celular directamente no se lee bien.
 */
function Grilla({ entradas, hoy }: { entradas: EntradaCalendario[]; hoy: string }) {
  const [offset, setOffset] = useState(0)
  const base = new Date(Date.UTC(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)) - 1 + offset, 1))
  const anio = base.getUTCFullYear()
  const mes = base.getUTCMonth() + 1

  const porDia = new Map<string, EntradaCalendario[]>()
  for (const e of entradas) porDia.set(e.fecha, [...(porDia.get(e.fecha) || []), e])

  const primerDow = diaDeSemanaDe(iso(anio, mes, 1))
  const total = diasDelMes(anio, mes)
  const celdas: (number | null)[] = [...Array(primerDow).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
        <Button size="sm" variant="ghost" onClick={() => setOffset((o) => o - 1)}>‹</Button>
        <div style={{ fontSize: font.md, fontWeight: weight.bold, minWidth: 160, textAlign: 'center' }}>
          {MESES[mes - 1]} {anio}
        </div>
        <Button size="sm" variant="ghost" onClick={() => setOffset((o) => o + 1)}>›</Button>
        {offset !== 0 && <Button size="sm" variant="ghost" onClick={() => setOffset(0)}>Hoy</Button>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {DIAS_CORTOS.map((d) => (
          <div key={d} style={{ fontSize: font.xs, color: color.mut2, textAlign: 'center', paddingBottom: 4 }}>{d}</div>
        ))}
        {celdas.map((d, i) => {
          if (d === null) return <div key={`v${i}`} />
          const fecha = iso(anio, mes, d)
          const items = porDia.get(fecha) || []
          const esHoy = fecha === hoy
          return (
            <div
              key={fecha}
              style={{
                minHeight: 76, padding: 6, borderRadius: radius.md,
                border: `1px solid ${esHoy ? color.brandBorder : color.line}`,
                background: esHoy ? color.brandBg : color.surface,
                display: 'flex', flexDirection: 'column', gap: 3, overflow: 'hidden',
              }}
            >
              <div style={{ fontSize: font.xs, color: esHoy ? color.brand : color.mut2, fontWeight: esHoy ? weight.bold : weight.normal }}>{d}</div>
              {items.map((e) => (
                <div
                  key={e.id}
                  title={`${e.titulo} — ${e.certeza === 'estimada' ? 'fecha estimada' : e.certeza === 'proyectada' ? 'proyectada' : rotuloFecha(e.fecha)}`}
                  style={{
                    fontSize: font.xs, lineHeight: 1.25, padding: '2px 4px', borderRadius: 4,
                    background: e.clase === 'comercial' ? color.brandBg : color.bg2,
                    color: e.clase === 'comercial' ? color.brand : color.ink2,
                    border: e.certeza === 'firme' ? '1px solid transparent' : `1px dashed ${color.warningBorder}`,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                >
                  {e.titulo}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Los diálogos ─────────────────────────────────────────────────────────────────────────────

function ModalHito({ hito, onCerrar, onGuardar, onBorrar, puedeBorrar }: {
  hito: Partial<Hito>
  onCerrar: () => void
  onGuardar: (h: Partial<Hito>) => void
  onBorrar?: () => void
  puedeBorrar: boolean
}) {
  const [f, setF] = useState<Partial<Hito>>(hito)
  const listo = !!String(f.titulo || '').trim() && !!f.fecha

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      cerrarConFondo={false}
      titulo={hito.id ? 'Editar' : 'Cargar algo nuestro'}
      pie={
        <>
          {puedeBorrar && onBorrar && <Button variant="ghost" tone="danger" onClick={onBorrar}>Borrar</Button>}
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button variant="solid" disabled={!listo} onClick={() => onGuardar(f)}>Guardar</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <Field label="Qué es" required>
          <Input
            value={String(f.titulo || '')}
            onChange={(e) => setF({ ...f, titulo: e.target.value })}
            placeholder="Lanzamiento cápsula tejidos"
            autoFocus
          />
        </Field>
        <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
          <Field label="Cuándo" required width={180}>
            <Input type="date" value={String(f.fecha || '')} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
          </Field>
          <Field label="Tipo" width={200}>
            <Select value={String(f.tipo || 'otro')} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
              {TIPOS_HITO.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </Select>
          </Field>
        </div>
        {/* Firme vs. proyectada. El default es proyectada porque una fecha que alguien tipeó sin
            decir nada casi nunca está cerrada, y mostrarla firme hace que otro planifique contra
            ella. Se puede mover después sin borrar nada. */}
        <Field
          label="¿La fecha está cerrada?"
          hint="Si todavía se puede mover, dejala en proyectada: se muestra distinta y nadie planifica encima como si fuera segura."
        >
          <Select value={f.firme ? 'si' : 'no'} onChange={(e) => setF({ ...f, firme: e.target.value === 'si' })}>
            <option value="no">Proyectada — puede moverse</option>
            <option value="si">Firme — es ese día</option>
          </Select>
        </Field>
        <Field label="Nota" hint="Opcional. Lo que el resto necesita saber para producir a tiempo.">
          <Input value={String(f.nota || '')} onChange={(e) => setF({ ...f, nota: e.target.value })} />
        </Field>
      </div>
    </Modal>
  )
}

/**
 * Anotar una idea desde el calendario.
 *
 * Es el alta mínima —etapa, título, formato y el gancho—, no el tablero completo: acá la pregunta
 * es "para esta fecha, ¿qué falta pensar?", y pedir el copy entero en ese momento haría que nadie
 * anote nada. Lo demás se completa después, en `/meta-ads/etapas`.
 *
 * La etapa arranca en la primera que no tiene nada anotado: es exactamente el hueco que la fila
 * acaba de mostrar, así que es lo que se viene a llenar.
 */
function ModalIdea({ entrada, onCerrar, onAnotar }: {
  entrada: EntradaCalendario
  onCerrar: () => void
  onAnotar: (e: EntradaCalendario, d: { etapa: Etapa; titulo: string; formato: string; gancho: string }) => void
}) {
  const sugerida = (ETAPAS.find((x) => !(entrada.cobertura[x] || 0)) || 'mofu') as Etapa
  const [etapa, setEtapa] = useState<Etapa>(sugerida)
  const [titulo, setTitulo] = useState('')
  const [formato, setFormato] = useState('reel')
  const [gancho, setGancho] = useState('')

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      cerrarConFondo={false}
      titulo={`Anotar una idea para ${entrada.titulo}`}
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button variant="solid" disabled={!titulo.trim()} onClick={() => onAnotar(entrada, { etapa, titulo, formato, gancho })}>
            Anotar
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <div style={{ fontSize: font.sm, color: color.mut2 }}>
          {rotuloFecha(entrada.fecha)} · faltan {entrada.faltan} días
        </div>
        <Field label="Para qué etapa" hint="Viene elegida la que no tiene nada anotado para esta fecha.">
          <Select value={etapa} onChange={(e) => setEtapa(e.target.value as Etapa)}>
            {ETAPAS.map((x) => (
              <option key={x} value={x}>
                {ETIQUETA_ETAPA[x]}{(entrada.cobertura[x] || 0) === 0 ? ' — no hay nada' : ` — ya hay ${entrada.cobertura[x]}`}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="La idea, en una línea" required>
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Testimonios de clientas sobre el talle" autoFocus />
        </Field>
        <Field label="Formato" width={220}>
          <Select value={formato} onChange={(e) => setFormato(e.target.value)}>
            {FORMATOS_IDEA.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
          </Select>
        </Field>
        <Field label="El gancho" hint="Opcional. Los primeros dos segundos, o la frase que arranca.">
          <Input value={gancho} onChange={(e) => setGancho(e.target.value)} />
        </Field>
        <div style={{ fontSize: font.xs, color: color.mut2, lineHeight: 1.45 }}>
          Entra como <b>propuesta</b>. El resto (el copy, a quién le habla) se completa en Etapas de
          la pauta, y de ahí en más la aprueba quien tenga el permiso para pautear.
        </div>
      </div>
    </Modal>
  )
}

function ModalConfirmarFecha({ entrada, onCerrar, onConfirmar }: {
  entrada: EntradaCalendario
  onCerrar: () => void
  onConfirmar: (e: EntradaCalendario, fecha: string) => void
}) {
  const [fecha, setFecha] = useState(entrada.fecha)
  const anio = Number(entrada.id.split(':')[2])
  const cat = fechaComercialDe(entrada.id.split(':')[1])
  const mueve = diasEntre(entrada.fecha, fecha)

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`Confirmar la fecha de ${entrada.titulo}`}
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button variant="solid" disabled={!fecha || Number(fecha.slice(0, 4)) !== anio} onClick={() => onConfirmar(entrada, fecha)}>
            Confirmar
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <div style={{ fontSize: font.sm, color: color.ink2, lineHeight: 1.5 }}>
          Hoy se está mostrando <b>{rotuloFecha(entrada.fecha)}</b>, que es una estimación.
          {cat?.comoSeConfirma ? ` ${cat.comoSeConfirma}` : ''}
        </div>
        <Field label={`La fecha real de ${anio}`} required>
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} autoFocus />
        </Field>
        {!!mueve && Number(fecha.slice(0, 4)) === anio && (
          <div style={{ fontSize: font.sm, color: color.warningInk }}>
            Se corre {Math.abs(mueve)} {Math.abs(mueve) === 1 ? 'día' : 'días'} {mueve > 0 ? 'más adelante' : 'para atrás'}.
          </div>
        )}
        <div style={{ fontSize: font.xs, color: color.mut2, lineHeight: 1.45 }}>
          Queda confirmada sólo para {anio}: el año que viene la vuelve a decidir la cámara y se
          muestra estimada de nuevo.
        </div>
      </div>
    </Modal>
  )
}

/**
 * Con cuánta fuerza jugamos la fecha, y desde cuándo hay que producirla.
 *
 * 🔑 **El arranque viene sugerido pero se guarda como propio.** El catálogo prellena el campo con
 * `fecha − anticipoDias`, y ahí termina su intervención: lo que queda guardado es lo que confirmó
 * una persona. La diferencia no es cosmética — un número que nadie miró disfrazado de decisión es
 * exactamente lo que hacía que la pantalla reclamara producción que nadie había pedido.
 *
 * **Se puede dejar vacío.** "Nos sumamos pero todavía no sabemos desde cuándo" es un estado real y
 * frecuente; obligar a poner una fecha ahí garantizaría que se tipee cualquiera con tal de cerrar
 * el modal, y a partir de ahí el dato miente.
 */
function ModalDecidir({ entrada, prioridad: inicial, hoy, onCerrar, onGuardar, onSoltar }: {
  entrada: EntradaCalendario
  prioridad: Prioridad
  hoy: string
  onCerrar: () => void
  onGuardar: (e: EntradaCalendario, p: Prioridad, arrancar: string | null) => void
  onSoltar: () => void
}) {
  const [prioridad, setPrioridad] = useState<Prioridad>(inicial)
  const [arrancar, setArrancar] = useState(entrada.arrancar || entrada.arranqueSugerido || '')

  const juega = juegaLaFecha(prioridad)
  const sugerido = entrada.arranqueSugerido
  const esElSugerido = !!sugerido && arrancar === sugerido
  const tarde = juega && !!arrancar && arrancar < hoy
  const despues = juega && !!arrancar && arrancar > entrada.fecha

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`${entrada.titulo} — ¿nos sumamos?`}
      pie={
        <>
          {entrada.prioridad && (
            <Button variant="ghost" onClick={onSoltar} title="Vuelve a la pregunta abierta. No es lo mismo que dejarla pasar.">
              Dejar sin decidir
            </Button>
          )}
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button variant="solid" disabled={despues} onClick={() => onGuardar(entrada, prioridad, juega ? (arrancar || null) : null)}>
            Guardar
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <div style={{ fontSize: font.sm, color: color.mut2 }}>
          {rotuloFecha(entrada.fecha)} · faltan {entrada.faltan} {entrada.faltan === 1 ? 'día' : 'días'}
          {entrada.certeza === 'estimada' ? ' · la fecha todavía es estimada' : ''}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
          {PRIORIDADES.map((p) => {
            const elegida = p.key === prioridad
            return (
              <label
                key={p.key}
                style={{
                  display: 'flex', gap: space[2], alignItems: 'flex-start', cursor: 'pointer',
                  border: `1px solid ${elegida ? color.brandBorder : color.line}`,
                  background: elegida ? color.brandBg : 'transparent',
                  borderRadius: radius.md, padding: space[3],
                }}
              >
                <input
                  type="radio"
                  name="prioridad"
                  checked={elegida}
                  onChange={() => setPrioridad(p.key)}
                  style={{ marginTop: 3 }}
                />
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: font.sm, fontWeight: weight.semibold, color: elegida ? color.brand : color.ink }}>
                    {p.label}
                  </span>
                  <span style={{ fontSize: font.xs, color: color.mut2, lineHeight: 1.45 }}>{p.ayuda}</span>
                </span>
              </label>
            )
          })}
        </div>

        {juega && (
          <Field
            label="¿Desde cuándo hay que producirla?"
            hint={
              sugerido
                ? `Se puede dejar vacío. Viene sugerido el ${rotuloFecha(sugerido)}, que son ${entrada.anticipoDias} días antes — es sólo una sugerencia del catálogo.`
                : 'Se puede dejar vacío si todavía no se sabe.'
            }
          >
            <Input type="date" value={arrancar} onChange={(ev) => setArrancar(ev.target.value)} />
          </Field>
        )}

        {despues && (
          <div style={{ fontSize: font.sm, color: color.dangerInk }}>
            El arranque cae <b>después</b> de la fecha: así no se llega a producir nada.
          </div>
        )}

        {tarde && !despues && (
          <div style={{ fontSize: font.sm, color: color.warningInk }}>
            Esa fecha ya pasó: va a quedar marcada como que habría que estar produciendo.
          </div>
        )}

        {juega && esElSugerido && !tarde && !despues && (
          <div style={{ fontSize: font.xs, color: color.mut2, lineHeight: 1.45 }}>
            Guardándola tal cual queda como <b>tu</b> fecha de arranque, no como una cuenta del
            catálogo: de ahí en más el calendario avisa contra esto y no contra una estimación.
          </div>
        )}

        {prioridad === 'institucional' && (
          <div style={{ fontSize: font.xs, color: color.mut2, lineHeight: 1.45 }}>
            No pide fecha de arranque ni creativos de embudo: se resuelve en el día. La fila se sigue
            viendo normal — está decidida, sólo que no reclama trabajo. Si más adelante esta fecha
            resulta valer la pena, <b>subila a suave o fuerte</b> y pasa a comportarse como cualquier
            comercial. Vale sólo para esta marca y este año.
          </div>
        )}

        {prioridad === 'pasamos' && (
          <div style={{ fontSize: font.xs, color: color.mut2, lineHeight: 1.45 }}>
            Queda en la lista, apagada, para no volver a discutirla. No pide creativos ni aparece en
            el veredicto de Etapas de la pauta. Vale sólo para esta marca y este año.
          </div>
        )}
      </div>
    </Modal>
  )
}
