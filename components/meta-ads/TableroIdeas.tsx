'use client'

/**
 * El tablero de ideas de creativos — la otra mitad de `/meta-ads/etapas`.
 *
 * # Por qué existe
 *
 * El diagnóstico del Embudo dice **qué falta** ("no hay ni una pauta de la segunda etapa"). Eso solo
 * es un dato; sin un lugar donde anotar la pieza que lo llena, se lee, se asiente y no pasa nada.
 * Acá la pelota **se ve** cambiar de mano: marketing anota, Bruno aprueba, marketing produce, Bruno
 * pautea. Cada columna deja a alguien esperando algo concreto de alguien concreto, que es lo único
 * que evita que un tablero de ideas se llene de propuestas que nadie mira.
 *
 * # Tres decisiones que parecen de forma y no lo son
 *
 *  1. **El tablero se dibuja aunque Meta se caiga.** Vive adentro de la sección pero no cuelga
 *     del diagnóstico: se lee por `api/datos.js?recurso=meta-funnel`, que no habla con Meta. Si el
 *     token vence justo cuando marketing tiene que craneаr las piezas, el tablero sigue en pie —es
 *     exactamente el motivo por el que el endpoint está separado (`api/_meta-funnel.js`).
 *  2. **Los botones salen de `transicionesDesde()`, la misma función que valida el servidor.** No
 *     hay una lista de botones acá adentro. Escribir la máquina de estados dos veces es el bug que
 *     este repo ya se comió dos veces (el padrón de Canjes, las campañas pausables de más).
 *  3. **La columna vacía no se esconde.** Cinco columnas siempre, aunque cuatro estén en cero: el
 *     tablero tiene que mostrar el recorrido completo desde el día 1, no aparecer de a pedazos.
 *
 * ⚠️ Dibujar o no un botón **no es el control de acceso**: el que manda es el guard del servidor.
 */

import { useMemo, useState } from 'react'
import type { Marca } from '@/lib/nav.datos'
import { fechaComercialDe, type EntradaCalendario } from '@/lib/calendario'
import { ETAPAS, ETIQUETA_ETAPA } from '@/lib/meta-ads/etapas'
import type { CampañaEtapa, Etapa } from '@/lib/meta-ads/tipos'
import {
  borrarIdea, ESTADOS_IDEA, ETIQUETA_ESTADO, FORMATOS_IDEA, guardarIdea, moverIdea, nuevoIdIdea,
  puedeEditarIdea, transicionesDesde, type EstadoIdea, type Idea, type PoderesIdeas, type Transicion,
} from '@/lib/meta-ads/ideas'
import {
  Button, Chips, EmptyState, Field, Input, Modal, Notice, SectionCard, Select, StatusPill,
  useConfirmar, useToast,
  color, font, radius, space, weight, type Tone,
} from '@/components/ui'

/**
 * Qué está esperando cada columna, en una línea. Es lo que convierte el nombre del estado en un
 * pedido: "Lista" no dice nada, "esperando que la pauteen" sí.
 */
const ESPERA: Record<EstadoIdea, string> = {
  propuesta: 'esperando el ok',
  aprobada: 'para empezar a producir',
  'en-produccion': 'la está armando el equipo',
  lista: 'esperando que la pauteen',
  pauteada: 'al aire',
  descartada: 'no va',
}

/** El tono de cada columna. `pauteada` en verde: es la única que significa que la pieza salió. */
const TONO_ESTADO: Record<EstadoIdea, Tone> = {
  propuesta: 'warning',
  aprobada: 'brand',
  'en-produccion': 'neutral',
  lista: 'action',
  pauteada: 'success',
  descartada: 'neutral',
}

/** Las columnas del tablero. `descartada` no es una: es un plegable al pie. */
const COLUMNAS = ESTADOS_IDEA.filter((e) => e !== 'descartada')

const rotuloFormato = (k: string) => FORMATOS_IDEA.find((f) => f.key === k)?.label || k || '—'

/**
 * A qué fecha apunta una idea, en palabras.
 *
 * Se busca primero en las fechas que hoy están a la vista; si no está (la fecha ya pasó, o quedó
 * fuera de la ventana de 90 días), se reconstruye del id — `comercial:diadelamadre:2026`. Mostrar
 * el id crudo sería filtrar una clave interna a la pantalla de alguien que anota ideas.
 */
function rotuloEvento(evento: string | null, fechas: EntradaCalendario[]): string | null {
  if (!evento) return null
  const viva = fechas.find((f) => f.id === evento)
  if (viva) return viva.titulo
  const [clase, clave, anio] = evento.split(':')
  if (clase === 'comercial') {
    const cat = fechaComercialDe(clave)
    return cat ? `${cat.titulo}${anio ? ` ${anio}` : ''}` : 'una fecha del calendario'
  }
  return 'una fecha propia'
}

/** `hace 3 días`, sin librería. Para el pie de la tarjeta, que es contexto y no un dato duro. */
function hace(ms: number | null | undefined): string {
  if (!ms) return ''
  const dias = Math.floor((Date.now() - ms) / 86400000)
  if (dias <= 0) return 'hoy'
  if (dias === 1) return 'ayer'
  if (dias < 30) return `hace ${dias} días`
  const meses = Math.floor(dias / 30)
  return meses === 1 ? 'hace un mes' : `hace ${meses} meses`
}

export type TableroIdeasProps = {
  marca: Marca
  ideas: Idea[]
  puede: PoderesIdeas
  /** `perfil.name`: es con lo que firma el servidor, así que es con lo que se compara el autor. */
  quien: string | null
  cargando: boolean
  /** Motivo por el que no se pudieron leer las ideas, o `null`. */
  caido: string | null
  recargar: () => void
  /** Las campañas al aire, para enlazar una idea con su campaña al pautearla. Vacío si Meta falló. */
  campañas: CampañaEtapa[]
  /** La etapa que el diagnóstico está pidiendo: viene preelegida al anotar. */
  sugerida: Etapa | null
  /** Las fechas próximas, para colgar la idea de una. */
  fechas: EntradaCalendario[]
}

export function TableroIdeas({
  marca, ideas, puede, quien, cargando, caido, recargar, campañas, sugerida, fechas,
}: TableroIdeasProps) {
  const toast = useToast()
  const { confirmar } = useConfirmar()
  const [filtro, setFiltro] = useState<'todas' | Etapa>('todas')
  const [verDescartadas, setVerDescartadas] = useState(false)
  const [editando, setEditando] = useState<Partial<Idea> | null>(null)
  const [descartando, setDescartando] = useState<Idea | null>(null)
  const [pauteando, setPauteando] = useState<Idea | null>(null)

  // `ver: true` porque para estar leyendo esta pantalla el guard ya dejó pasar. La máquina igual lo
  // vuelve a preguntar: es la misma función que corre en el servidor y no se la toca desde acá.
  const poder = useMemo(() => ({ ...puede, ver: true }), [puede])

  const visibles = useMemo(
    () => (filtro === 'todas' ? ideas : ideas.filter((i) => i.etapa === filtro)),
    [ideas, filtro],
  )
  const descartadas = visibles.filter((i) => i.estado === 'descartada')
  const vivas = visibles.filter((i) => i.estado !== 'descartada')

  async function guardar(d: Partial<Idea>) {
    try {
      // Sólo los campos editables. Mandar la idea entera devolvería el `historial` tal como se leyó
      // al abrir el modal y le pisaría el paso a quien la haya movido mientras tanto: el servidor
      // mergea con lo que llega, y lo que llega ganaría. El estado y el autor ya los protege él.
      await guardarIdea(marca, {
        id: d.id || nuevoIdIdea(),
        titulo: String(d.titulo || '').trim(),
        etapa: (d.etapa || 'tofu') as Etapa,
        formato: String(d.formato || 'reel'),
        gancho: d.gancho ? String(d.gancho) : null,
        copy: d.copy ? String(d.copy) : null,
        aQuien: d.aQuien ? String(d.aQuien) : null,
        evento: d.evento ? String(d.evento) : null,
      })
      setEditando(null)
      toast.ok(d.id ? 'Idea actualizada.' : 'Idea anotada.')
      recargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar la idea.')
    }
  }

  async function mover(idea: Idea, a: EstadoIdea, opts: { nota?: string; campaignId?: string } = {}) {
    try {
      await moverIdea(marca, idea.id, a, opts)
      setDescartando(null)
      setPauteando(null)
      toast.ok(a === 'descartada' ? 'Idea descartada.' : `Ahora está en «${ETIQUETA_ESTADO[a]}».`)
      recargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo mover la idea.')
    }
  }

  /**
   * Borrar **sí** pregunta, y descartar no.
   *
   * Parece al revés y no lo es: descartar deja la idea a la vista con su motivo y se puede reabrir,
   * así que el motivo obligatorio es toda la ceremonia que necesita. Borrar es lo único acá adentro
   * que no deja rastro —se lleva el historial entero de la pieza— y el botón está pegado a «Editar»,
   * a un pixel de distancia. Sin este paso, un click de más borra sin decir nada y no hay deshacer.
   */
  async function borrar(idea: Idea) {
    const ok = await confirmar({
      titulo: 'Eliminar la idea',
      tono: 'danger',
      ok: 'Eliminarla',
      mensaje: (
        <>
          <div>
            Se elimina <b>«{idea.titulo}»</b> con todo su historial. No se puede deshacer.
          </div>
          <div style={{ marginTop: space[2], color: color.mut, fontSize: font.sm, lineHeight: 1.5 }}>
            Si la idea no va, conviene <b>descartarla</b>: queda guardada con el motivo, quien la
            anotó puede ver por qué no fue, y se reabre cuando haga falta.
          </div>
        </>
      ),
    })
    if (!ok) return
    try {
      await borrarIdea(marca, idea.id)
      toast.ok('Idea eliminada.')
      recargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo eliminar la idea.')
    }
  }

  /** Una transición se pide por modal cuando necesita algo más que el clic. */
  function pedirTransicion(idea: Idea, t: Transicion) {
    if (t.a === 'descartada') return setDescartando(idea)
    if (t.a === 'pauteada') return setPauteando(idea)
    void mover(idea, t.a)
  }

  return (
    <SectionCard
      title="Ideas de creativos"
      subtitle="Lo que el equipo está pensando para cada etapa. La idea se anota, alguien la aprueba, alguien la produce y alguien la pautea: en cada columna la pelota es de otro."
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap', marginBottom: space[4] }}>
        <Chips
          opciones={[
            { key: 'todas' as const, label: 'Todas', n: ideas.filter((i) => i.estado !== 'descartada').length },
            ...ETAPAS.map((e) => ({
              key: e,
              label: ETIQUETA_ETAPA[e],
              n: ideas.filter((i) => i.etapa === e && i.estado !== 'descartada').length,
            })),
          ]}
          value={filtro}
          onChange={(v) => setFiltro(v)}
        />
        <div style={{ marginLeft: 'auto' }}>
          <Button
            variant="solid"
            onClick={() => setEditando({ etapa: (filtro === 'todas' ? sugerida || 'mofu' : filtro) as Etapa, formato: 'reel' })}
          >
            Crear una idea
          </Button>
        </div>
      </div>

      {caido && (
        <Notice tone="warning" style={{ marginBottom: space[3] }}>
          No se pudieron leer las ideas: {caido}
          <div style={{ fontSize: font.sm, marginTop: space[1] }}>
            El diagnóstico del Embudo no depende de esto y sigue siendo válido.
          </div>
        </Notice>
      )}

      {cargando && !ideas.length && <div style={{ color: color.mut2, fontSize: font.base }}>Leyendo las ideas…</div>}

      {!cargando && !caido && ideas.length === 0 ? (
        <EmptyState
          title="Todavía no hay ninguna idea anotada"
          hint={
            sugerida
              ? `El Embudo está pidiendo piezas de «${ETIQUETA_ETAPA[sugerida]}». Anotá la primera: alcanza con el título y el formato, lo demás se completa después.`
              : 'Anotá la primera: alcanza con el título y el formato, lo demás se completa después. También se pueden anotar desde el calendario, colgadas de una fecha.'
          }
          dashed
        />
      ) : (
        // `mo-scroll-x` (kit.css) deja la barra de scroll siempre a la vista: en macOS es overlay y
        // se esconde hasta que alguien scrollea, así que la quinta columna cortada no avisaba que
        // existía. El ancho mínimo de las columnas es lo que hace que casi nunca haga falta (ver
        // `Columna`); esto es la red por debajo, para las pantallas donde igual no entren.
        !caido && (
          <div className="mo-scroll-x" style={{ display: 'flex', gap: space[2], alignItems: 'flex-start', paddingBottom: space[2] }}>
            {COLUMNAS.map((estado) => (
              <Columna
                key={estado}
                estado={estado}
                ideas={vivas.filter((i) => i.estado === estado)}
                puede={poder}
                quien={quien}
                fechas={fechas}
                campañas={campañas}
                onTransicion={pedirTransicion}
                onEditar={(i) => setEditando(i)}
                onBorrar={borrar}
              />
            ))}
          </div>
        )
      )}

      {descartadas.length > 0 && (
        <div style={{ borderTop: `1px solid ${color.line}`, paddingTop: space[3], marginTop: space[3] }}>
          <button
            onClick={() => setVerDescartadas((v) => !v)}
            style={{
              height: 'auto', // `.shell-content button` fija la altura de un control.
              background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
              textAlign: 'left', color: color.ink2, fontSize: font.base, fontWeight: weight.semibold,
            }}
          >
            {verDescartadas ? '▾' : '▸'} {descartadas.length} descartada{descartadas.length === 1 ? '' : 's'}
          </button>
          <div style={{ fontSize: font.xs, color: color.mut2, marginTop: space[1], lineHeight: 1.4 }}>
            No se eliminan: quien la anotó tiene que poder ver por qué no fue. Se pueden reabrir.
          </div>
          {verDescartadas && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: space[2], marginTop: space[3] }}>
              {descartadas.map((i) => (
                <TarjetaIdea
                  key={i.id}
                  idea={i}
                  puede={poder}
                  quien={quien}
                  fechas={fechas}
                  campañas={campañas}
                  onTransicion={pedirTransicion}
                  onEditar={(x) => setEditando(x)}
                  onBorrar={borrar}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {editando && (
        <ModalIdea
          idea={editando}
          fechas={fechas}
          onCerrar={() => setEditando(null)}
          onGuardar={guardar}
        />
      )}
      {descartando && (
        <ModalDescartar
          idea={descartando}
          onCerrar={() => setDescartando(null)}
          onDescartar={(motivo) => mover(descartando, 'descartada', { nota: motivo })}
        />
      )}
      {pauteando && (
        <ModalPautear
          idea={pauteando}
          campañas={campañas}
          onCerrar={() => setPauteando(null)}
          onPautear={(campaignId, nota) => mover(pauteando, 'pauteada', { campaignId, nota })}
        />
      )}
    </SectionCard>
  )
}

// ── La columna ───────────────────────────────────────────────────────────────────────────────

function Columna({ estado, ideas, puede, quien, fechas, campañas, onTransicion, onEditar, onBorrar }: {
  estado: EstadoIdea
  ideas: Idea[]
  puede: { ver: boolean; pautar: boolean; admin: boolean }
  quien: string | null
  fechas: EntradaCalendario[]
  campañas: CampañaEtapa[]
  onTransicion: (i: Idea, t: Transicion) => void
  onEditar: (i: Idea) => void
  onBorrar: (i: Idea) => void
}) {
  return (
    <div
      style={{
        flex: '1 1 0',
        /**
         * 176, no 215. Con 215 las cinco columnas pedían 1107 px y a 1440 de ventana el contenido
         * mide 1094: la quinta —«Pauteada», la que dice que la pieza salió— quedaba cortada, y en
         * una notebook de 1280 se escondía casi entera. Como el `flex` las estira, en una pantalla
         * ancha siguen midiendo lo mismo que antes (~212): el mínimo sólo decide **hasta dónde se
         * dejan comprimir** antes de empujar el scroll, y a 1280 entran las cinco justas.
         */
        minWidth: 176,
        background: color.bg2,
        border: `1px solid ${color.line}`,
        borderRadius: radius.xl,
        padding: space[2],
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space[1], marginBottom: space[1] }}>
        <span style={{ fontSize: font.sm, fontWeight: weight.bold, color: color.ink }}>{ETIQUETA_ESTADO[estado]}</span>
        <StatusPill tone={TONO_ESTADO[estado]} label={String(ideas.length)} />
      </div>
      <div style={{ fontSize: font.xs, color: color.mut2, marginBottom: space[2] }}>{ESPERA[estado]}</div>

      {ideas.length === 0 ? (
        <div style={{ fontSize: font.xs, color: color.mut2, textAlign: 'center', padding: `${space[4]}px 0` }}>—</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
          {ideas.map((i) => (
            <TarjetaIdea
              key={i.id}
              idea={i}
              puede={puede}
              quien={quien}
              fechas={fechas}
              campañas={campañas}
              onTransicion={onTransicion}
              onEditar={onEditar}
              onBorrar={onBorrar}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── La tarjeta ───────────────────────────────────────────────────────────────────────────────

function TarjetaIdea({ idea, puede, quien, fechas, campañas, onTransicion, onEditar, onBorrar }: {
  idea: Idea
  puede: { ver: boolean; pautar: boolean; admin: boolean }
  quien: string | null
  fechas: EntradaCalendario[]
  campañas: CampañaEtapa[]
  onTransicion: (i: Idea, t: Transicion) => void
  onEditar: (i: Idea) => void
  onBorrar: (i: Idea) => void
}) {
  const [abierta, setAbierta] = useState(false)
  const evento = rotuloEvento(idea.evento, fechas)
  const salidas = transicionesDesde(puede, idea.estado)
  const editable = puedeEditarIdea(puede, idea, quien)
  const ultimo = idea.historial?.length ? idea.historial[idea.historial.length - 1] : null
  const campaña = idea.campaignId ? campañas.find((c) => c.id === idea.campaignId) : null
  const hayDetalle = !!(idea.gancho || idea.copy || idea.aQuien || idea.historial?.length)

  return (
    <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: radius.lg, padding: space[2] }}>
      <div style={{ fontSize: font.base, fontWeight: weight.semibold, color: color.ink, lineHeight: 1.35 }}>{idea.titulo}</div>

      <div style={{ display: 'flex', gap: space[1], flexWrap: 'wrap', marginTop: space[1.5] }}>
        <Etiqueta texto={ETIQUETA_ETAPA[idea.etapa]} />
        <Etiqueta texto={rotuloFormato(idea.formato)} />
        {evento && <Etiqueta texto={`📅 ${evento}`} />}
      </div>

      {idea.gancho && (
        <div style={{ fontSize: font.xs, color: color.mut, marginTop: space[1.5], lineHeight: 1.45 }}>{idea.gancho}</div>
      )}

      {campaña && (
        <div style={{ fontSize: font.xs, color: color.successInk, marginTop: space[1.5], lineHeight: 1.4 }}>
          Salió como <b>{campaña.nombre}</b>
        </div>
      )}

      {hayDetalle && (
        <button
          onClick={() => setAbierta((v) => !v)}
          style={{
            height: 'auto', background: 'transparent', border: 'none', padding: 0, marginTop: space[1.5],
            cursor: 'pointer', color: color.mut, fontSize: font.xs, textAlign: 'left',
          }}
        >
          {abierta ? '▾ menos' : '▸ ver el detalle'}
        </button>
      )}

      {abierta && (
        <div style={{ marginTop: space[1.5], display: 'flex', flexDirection: 'column', gap: space[1.5] }}>
          {idea.aQuien && <Detalle rotulo="A quién le habla" texto={idea.aQuien} />}
          {idea.copy && <Detalle rotulo="El texto" texto={idea.copy} />}
          {!!idea.historial?.length && (
            <div>
              <div style={{ fontSize: font.xs, color: color.mut2, fontWeight: weight.medium }}>Cómo viene</div>
              <ul style={{ margin: `${space[1]}px 0 0`, paddingLeft: 14, fontSize: font.xs, color: color.mut, lineHeight: 1.5 }}>
                {idea.historial.map((p, n) => (
                  <li key={n}>
                    {ETIQUETA_ESTADO[p.a]} — {p.quien || 'alguien'}, {hace(p.cuando)}
                    {p.nota ? `: ${p.nota}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: space[1], flexWrap: 'wrap', marginTop: space[2], alignItems: 'center' }}>
        {salidas.map((t) => (
          <Button
            key={`${t.de}-${t.a}`}
            size="sm"
            variant={t.a === 'descartada' || t.a === 'propuesta' ? 'ghost' : 'soft'}
            onClick={() => onTransicion(idea, t)}
          >
            {t.rotulo}
          </Button>
        ))}
        {editable && (
          <>
            <Button size="sm" variant="ghost" onClick={() => onEditar(idea)}>Editar</Button>
            {/* Borrar se va al otro extremo: es lo único de la tarjeta que no deja rastro y estaba
                pegado a «Editar». El `auto` lo empuja al borde de la columna, así que dejan de ser
                dos botones grises consecutivos y hay que apuntarle. */}
            <span style={{ marginLeft: 'auto' }}>
              <Button size="sm" variant="ghost" onClick={() => onBorrar(idea)}>Eliminar</Button>
            </span>
          </>
        )}
      </div>

      <div style={{ fontSize: font.xs, color: color.mut2, marginTop: space[1.5] }}>
        {idea.creadoPor ? `La anotó ${idea.creadoPor}` : 'Sin autor'}
        {ultimo ? ` · ${hace(ultimo.cuando)}` : idea.creado ? ` · ${hace(idea.creado)}` : ''}
      </div>
    </div>
  )
}

function Etiqueta({ texto }: { texto: string }) {
  return (
    <span style={{
      fontSize: font.xs, color: color.ink2, background: color.bg2, border: `1px solid ${color.line}`,
      borderRadius: radius.pill, padding: '1px 8px', whiteSpace: 'nowrap',
    }}>
      {texto}
    </span>
  )
}

function Detalle({ rotulo, texto }: { rotulo: string; texto: string }) {
  return (
    <div>
      <div style={{ fontSize: font.xs, color: color.mut2, fontWeight: weight.medium }}>{rotulo}</div>
      <div style={{ fontSize: font.xs, color: color.ink2, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{texto}</div>
    </div>
  )
}

// ── Los modales ──────────────────────────────────────────────────────────────────────────────

/**
 * El alta completa. El calendario tiene su propia versión mínima (etapa, título, formato y gancho)
 * porque ahí la pregunta es "para esta fecha, ¿qué falta pensar?" y pedir el copy entero haría que
 * nadie anote nada. Acá sí: esta es la pantalla donde la idea se termina de escribir.
 */
function ModalIdea({ idea, fechas, onCerrar, onGuardar }: {
  idea: Partial<Idea>
  fechas: EntradaCalendario[]
  onCerrar: () => void
  onGuardar: (d: Partial<Idea>) => void
}) {
  const [f, setF] = useState<Partial<Idea>>({ formato: 'reel', ...idea })
  const listo = !!String(f.titulo || '').trim()

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      cerrarConFondo={false}
      titulo={idea.id ? 'Editar la idea' : 'Crear una idea'}
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button variant="solid" disabled={!listo} onClick={() => onGuardar(f)}>
            {idea.id ? 'Guardar' : 'Crear'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <Field label="La idea, en una línea" required>
          <Input
            value={String(f.titulo || '')}
            onChange={(e) => setF({ ...f, titulo: e.target.value })}
            placeholder="Testimonios de clientas sobre el talle"
            autoFocus
          />
        </Field>

        <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
          <Field label="Para qué etapa" width={220} hint="A quién le habla la pieza.">
            <Select value={String(f.etapa || 'tofu')} onChange={(e) => setF({ ...f, etapa: e.target.value as Etapa })}>
              {ETAPAS.map((x) => <option key={x} value={x}>{ETIQUETA_ETAPA[x]}</option>)}
            </Select>
          </Field>
          <Field label="Formato" width={200}>
            <Select value={String(f.formato || 'reel')} onChange={(e) => setF({ ...f, formato: e.target.value })}>
              {FORMATOS_IDEA.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
            </Select>
          </Field>
          <Field label="Para qué fecha" width={260} hint="Opcional. La deja colgada del calendario.">
            <Select value={String(f.evento || '')} onChange={(e) => setF({ ...f, evento: e.target.value || null })}>
              <option value="">Sin fecha — es de siempre</option>
              {fechas.map((x) => (
                <option key={x.id} value={x.id}>{x.titulo} — faltan {x.faltan} días</option>
              ))}
              {/* Si la idea apunta a una fecha que ya no está en la ventana, no se pierde al editar. */}
              {f.evento && !fechas.some((x) => x.id === f.evento) && (
                <option value={String(f.evento)}>{rotuloEvento(String(f.evento), fechas)}</option>
              )}
            </Select>
          </Field>
        </div>

        <Field label="El gancho" hint="Los primeros dos segundos, o la frase que arranca.">
          <Input value={String(f.gancho || '')} onChange={(e) => setF({ ...f, gancho: e.target.value })} />
        </Field>

        <Field label="A quién le habla" hint="Opcional, en tus palabras: «a la que nos sigue hace meses y no compró».">
          <Input value={String(f.aQuien || '')} onChange={(e) => setF({ ...f, aQuien: e.target.value })} />
        </Field>

        <Field label="El texto de la pieza" hint="Opcional. Se puede completar más adelante, cuando se produzca.">
          <textarea
            className="mo-input"
            rows={4}
            value={String(f.copy || '')}
            onChange={(e) => setF({ ...f, copy: e.target.value })}
            style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: font.base, boxSizing: 'border-box' }}
          />
        </Field>

        {!idea.id && (
          <div style={{ fontSize: font.xs, color: color.mut2, lineHeight: 1.45 }}>
            Entra como <b>propuesta</b>. La aprueba quien tenga el permiso para pautear, y hasta
            entonces la podés editar o eliminar vos.
          </div>
        )}
      </div>
    </Modal>
  )
}

/**
 * Descartar pide el motivo, y es la única transición que lo pide. Quien anotó la idea tiene que
 * poder entender por qué no fue: un descarte mudo es cómo se deja de anotar ideas.
 */
function ModalDescartar({ idea, onCerrar, onDescartar }: {
  idea: Idea
  onCerrar: () => void
  onDescartar: (motivo: string) => void
}) {
  const [motivo, setMotivo] = useState('')
  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      cerrarConFondo={false}
      titulo="Descartar la idea"
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button variant="solid" tone="danger" disabled={!motivo.trim()} onClick={() => onDescartar(motivo.trim())}>
            Descartar
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <div style={{ fontSize: font.base, color: color.ink2, lineHeight: 1.5 }}>
          «{idea.titulo}»{idea.creadoPor ? `, que anotó ${idea.creadoPor}` : ''}.
        </div>
        <Field label="Por qué no va" required hint="Lo lee quien la anotó. Sin esto, la próxima idea no se anota.">
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
        </Field>
        <div style={{ fontSize: font.xs, color: color.mut2, lineHeight: 1.45 }}>
          No se elimina: queda al pie del tablero y se puede reabrir.
        </div>
      </div>
    </Modal>
  )
}

/**
 * Pautear cierra el círculo: la idea se enlaza con la campaña que salió, así el tablero deja de ser
 * una lista de deseos y se puede mirar contra el diagnóstico. La campaña es opcional a propósito —
 * si Meta no contesta, marcarla igual tiene que poder hacerse.
 */
function ModalPautear({ idea, campañas, onCerrar, onPautear }: {
  idea: Idea
  campañas: CampañaEtapa[]
  onCerrar: () => void
  onPautear: (campaignId: string | undefined, nota: string | undefined) => void
}) {
  const [campaignId, setCampaignId] = useState('')
  const [nota, setNota] = useState('')

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      cerrarConFondo={false}
      titulo="Marcarla como pauteada"
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button variant="solid" onClick={() => onPautear(campaignId || undefined, nota.trim() || undefined)}>
            Ya la pauteé
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <div style={{ fontSize: font.base, color: color.ink2, lineHeight: 1.5 }}>«{idea.titulo}»</div>
        {campañas.length > 0 ? (
          <Field label="Con qué campaña salió" hint="Opcional, pero es lo que después deja ver qué idea se convirtió en qué pauta.">
            <Select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              <option value="">Sin enlazar</option>
              {campañas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </Select>
          </Field>
        ) : (
          <div style={{ fontSize: font.sm, color: color.mut2, lineHeight: 1.45 }}>
            No hay campañas al aire para enlazar (o Meta no contestó). Se puede marcar igual.
          </div>
        )}
        <Field label="Nota" hint="Opcional. Queda en el historial de la idea.">
          <Input value={nota} onChange={(e) => setNota(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
