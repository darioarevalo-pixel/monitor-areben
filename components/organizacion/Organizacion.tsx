'use client'

/**
 * **Organización** — de quién es cada cosa, sin fecha.
 *
 * Es la contracara de la Agenda, y la frontera entre las dos es la única línea que hay que tener
 * clara para no volver a mezclarlas:
 *
 * | | contesta | qué la dispara |
 * | --- | --- | --- |
 * | **Agenda** | ¿qué me toca hoy? | un día del calendario, o un hecho (los moldes) |
 * | **Organización** | ¿de quién es esto? | que aparezca algo y nadie sepa de quién es |
 *
 * # Por qué esto no podía vivir en la Agenda
 *
 * Todo ítem de la Agenda exige una `regla` de las cinco, y `cumplimiento()` emite TODA ocurrencia
 * que esa regla genere: una responsabilidad permanente ahí queda roja para siempre, o hay que
 * inventarle un día. Y medido el 30-ago-2026, la Agenda tampoco DESCRIBE el reparto — **Camila
 * Budek tiene 0 rutinas propias** y trabaja igual, porque su trabajo dispara por hecho y vive en
 * los moldes. Quien lea la Agenda como «quién responde de qué» concluye que ella no responde por
 * nada, que es falso. Por eso «sus rutinas» acá es **una fila más de la ficha**, ⛔ no la ficha.
 *
 * # Los grises son una pestaña, no una omisión
 *
 * 🔑 Una responsabilidad sin dueña se guarda igual, con su sector y con `persona: null`, y esta
 * pantalla **la cuenta en la propia pestaña**. Un gris escondido es el que se cobra: en este grupo
 * el mismo agujero —el último campo del producto sin dueño— apareció en tres fichas distintas antes
 * de que alguien lo nombrara.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { HeaderAcciones } from '@/components/layout/acciones'
import { Organigrama } from './Organigrama'
import { EditorResp } from './EditorResp'
import { useSistema } from '@/store/useSistema'
import { leerAgenda } from '@/lib/agenda/cliente'
import type { ItemAgenda } from '@/lib/agenda/tipos'
import { clavesDestino } from '@/lib/novedades/tipos'
import { borrarResp, leerOrganizacion, nuevoIdResp } from '@/lib/organizacion/cliente'
import {
  CLASES, NUEVA, arbol, deLaPersona, delSector, grises, sinDueno,
  type Nodo, type Responsabilidad,
} from '@/lib/organizacion/tipos'
import { FUNCIONES, type Funcion } from '@/lib/permisos'
import { traerEquipo, type Companero } from '@/lib/usuarios/equipo'
import {
  Badge, Button, EmptyState, Esqueleto, Markdown, Notice, SectionCard, Tabs,
  color, font, space, useConfirmar, useFiltroUrl, useToast, weight,
} from '@/components/ui'

type Pestana = 'organigrama' | 'sector' | 'persona' | 'grises'

export function Organizacion() {
  const toast = useToast()
  const { confirmar } = useConfirmar()
  const { manuales, cargado: sistemaCargado, cargar: cargarSistema } = useSistema()

  const [nodos, setNodos] = useState<Nodo[]>([])
  const [resp, setResp] = useState<Responsabilidad[]>([])
  const [puede, setPuede] = useState({ editar: false })
  const [equipo, setEquipo] = useState<Companero[] | null>(null)
  /**
   * Las rutinas de la Agenda. ⚠️ **No se guardan acá ni se copian**: se leen del mismo GET que ve
   * todo el equipo y se filtran por destino. Duplicar el dato es lo que hace que una de las dos
   * fuentes mienta el día que alguien edita la otra.
   */
  const [rutinas, setRutinas] = useState<ItemAgenda[] | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editando, setEditando] = useState<Responsabilidad | null>(null)

  const [pestana, setPestana] = useFiltroUrl<Pestana>('ver', 'organigrama')
  const [quien, setQuien] = useFiltroUrl<string>('quien', '')
  const [sector, setSector] = useFiltroUrl<Funcion | ''>('sector', '')

  // ⚠️ Todos los `setState` van adentro de un callback de la promesa, ninguno en el cuerpo: un
  // `setState` sincrónico dentro de un efecto encadena renders y lo corta el lint. Por eso
  // `cargando` arranca en `true` en vez de prenderse acá — y al refrescar después de editar no
  // hace falta el esqueleto, porque la lista ya está dibujada.
  const recargar = useCallback(() => leerOrganizacion()
    .then((d) => {
      setNodos(d.nodos)
      setResp(d.resp)
      setPuede(d.puede)
      setError(null)
    })
    .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo leer la organización.'))
    .finally(() => setCargando(false)), [])

  useEffect(() => { void recargar() }, [recargar])
  useEffect(() => { if (!sistemaCargado) void cargarSistema() }, [sistemaCargado, cargarSistema])
  useEffect(() => { void traerEquipo().then(setEquipo) }, [])
  // La Agenda se pide una sola vez y aparte: la ficha se puede leer entera sin ella, así que un
  // fallo suyo deja el renglón de rutinas mudo y ⛔ no rompe la pantalla.
  useEffect(() => { leerAgenda().then((d) => setRutinas(d.items)).catch(() => setRutinas([])) }, [])

  const arbolNodos = useMemo(() => arbol(nodos), [nodos])
  const losGrises = useMemo(() => grises(resp), [resp])
  /** Las personas que TIENEN alguna responsabilidad cargada, en el orden del organigrama. */
  const conFicha = useMemo(() => {
    const enOrden: string[] = []
    const caminar = (ns: typeof arbolNodos) => ns.forEach((n) => { if (n.persona) enOrden.push(n.persona); caminar(n.hijos) })
    caminar(arbolNodos)
    const sueltas = resp.map((r) => r.persona).filter((p): p is string => !!p && !enOrden.includes(p))
    return [...enOrden, ...Array.from(new Set(sueltas))].filter((p) => resp.some((r) => r.persona === p && r.activo !== false))
  }, [arbolNodos, resp])

  const apodoDe = (name: string) => equipo?.find((c) => c.name === name)?.apodo || name

  async function eliminar(r: Responsabilidad) {
    const ok = await confirmar({
      titulo: 'Eliminar esta responsabilidad',
      mensaje: `«${r.titulo}». Si lo que pasó es que ya no es de nadie, es mejor sacarle la persona y dejarla como gris: así se sigue viendo que falta.`,
      ok: 'Eliminar',
      tono: 'danger',
    })
    if (!ok) return
    try {
      await borrarResp(r.id)
      toast.ok('Eliminada.')
      await recargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo eliminar.')
    }
  }

  const items = [
    { key: 'organigrama', label: 'Organigrama' },
    { key: 'sector', label: 'Por sector' },
    { key: 'persona', label: 'Por persona' },
    { key: 'grises', label: 'Sin dueño', badge: losGrises.length ? <Badge tone="warning">{losGrises.length}</Badge> : undefined },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      {puede.editar && (
        <HeaderAcciones>
          <Button size="sm" onClick={() => setEditando({ ...NUEVA, id: nuevoIdResp() })}>+ Responsabilidad</Button>
        </HeaderAcciones>
      )}

      {error && <Notice tone="danger">{error}</Notice>}

      <Tabs items={items} value={pestana} onChange={(k) => setPestana(k as Pestana)} />

      {cargando && !resp.length ? <Esqueleto filas={6} /> : (
        <>
          {pestana === 'organigrama' && (
            <SectionCard title="Quién cuelga de quién">
              {arbolNodos.length === 0 ? (
                <EmptyState title="El organigrama todavía no está cargado." hint="Se carga con scripts/organizacion-marketing.mjs, desde organigrama.md." />
              ) : (
                <Organigrama
                  nodos={arbolNodos}
                  onPersona={(p) => { setQuien(p); setPestana('persona') }}
                />
              )}
            </SectionCard>
          )}

          {pestana === 'sector' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
              {FUNCIONES.filter((f) => !sector || f.key === sector).map((f) => {
                const filas = delSector(resp, f.key)
                if (!filas.length && sector !== f.key) return null
                return (
                  // ⛔ El subtítulo NO lleva `f.info`: eso es la AYUDA DEL PERMISO («crea las
                  // solicitudes y ve la solicitud completa»), que describe lo que la función puede
                  // apretar, no lo que el sector es. Caminando la pantalla se leía como una
                  // definición del sector, y afirmaba algo que no es. Una pantalla que no pregunta
                  // igual afirma.
                  <SectionCard key={f.key} title={f.label}>
                    <Lista
                      filas={filas}
                      manuales={manuales}
                      apodoDe={apodoDe}
                      mostrarPersona
                      puedeEditar={puede.editar}
                      onEditar={setEditando}
                      onEliminar={eliminar}
                    />
                  </SectionCard>
                )
              })}
              {sector && <Button variant="ghost" size="sm" onClick={() => setSector('')}>Ver los cinco sectores</Button>}
            </div>
          )}

          {pestana === 'persona' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
              <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
                {conFicha.map((p) => (
                  <Button key={p} size="sm" variant={p === quien ? 'soft' : 'ghost'} onClick={() => setQuien(p === quien ? '' : p)}>
                    {apodoDe(p)}
                  </Button>
                ))}
              </div>
              {!quien ? (
                <EmptyState title="Elegí a alguien." hint="La ficha dice de qué responde, qué decide sola, qué publica y qué NO es suyo." />
              ) : (
                <Ficha
                  persona={quien}
                  apodo={apodoDe(quien)}
                  filas={deLaPersona(resp, quien)}
                  manuales={manuales}
                  rutinas={rutinas}
                  puedeEditar={puede.editar}
                  onEditar={setEditando}
                  onEliminar={eliminar}
                />
              )}
            </div>
          )}

          {pestana === 'grises' && (
            <SectionCard
              title={losGrises.length ? `${losGrises.length} sin dueño` : 'Sin dueño'}
              subtitle="Cosas de las que el sector responde y ninguna persona reclamó. Se ven a propósito: un gris escondido es el que se cobra."
            >
              {/* 🔑 El vacío de acá NO es una felicitación. Que no haya grises cargados casi nunca
                  significa que no haya grises: significa que nadie los escribió. El cartel lo dice,
                  porque un «✅ todo cubierto» sería la afirmación más cara de la pantalla. */}
              {losGrises.length === 0 ? (
                <EmptyState
                  title="No hay ninguno cargado."
                  hint="⚠️ Que la lista esté vacía no dice que todo tenga dueño: dice que nadie anotó lo que no lo tiene. Un gris se carga como cualquier responsabilidad, dejando la persona en blanco."
                />
              ) : (
                <Lista
                  filas={losGrises}
                  manuales={manuales}
                  apodoDe={apodoDe}
                  mostrarSector
                  puedeEditar={puede.editar}
                  onEditar={setEditando}
                  onEliminar={eliminar}
                />
              )}
            </SectionCard>
          )}
        </>
      )}

      {editando && (
        <EditorResp
          resp={editando}
          equipo={equipo}
          manuales={manuales}
          onCerrar={() => setEditando(null)}
          onGuardado={async () => { setEditando(null); await recargar() }}
        />
      )}
    </div>
  )
}

/** Una lista de responsabilidades, agrupada por clase. */
function Lista({ filas, manuales, apodoDe, mostrarPersona, mostrarSector, puedeEditar, onEditar, onEliminar }: {
  filas: Responsabilidad[]
  manuales: { id: string; titulo: string; publicado: boolean }[]
  apodoDe: (n: string) => string
  mostrarPersona?: boolean
  mostrarSector?: boolean
  puedeEditar: boolean
  onEditar: (r: Responsabilidad) => void
  onEliminar: (r: Responsabilidad) => void
}) {
  if (!filas.length) return <EmptyState title="Todavía no hay nada cargado acá." />
  const porClase = CLASES.filter((c) => filas.some((f) => f.clase === c.key))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      {porClase.map((c) => (
        <div key={c.key}>
          <div style={{ fontSize: font.xs, color: color.mut2, marginBottom: space[2], textTransform: 'uppercase', letterSpacing: 0.4 }}>
            {c.label}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
            {filas.filter((f) => f.clase === c.key).map((f) => (
              <Renglon
                key={f.id}
                fila={f}
                manuales={manuales}
                apodoDe={apodoDe}
                mostrarPersona={mostrarPersona}
                mostrarSector={mostrarSector}
                puedeEditar={puedeEditar}
                onEditar={onEditar}
                onEliminar={onEliminar}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function Renglon({ fila, manuales, apodoDe, mostrarPersona, mostrarSector, puedeEditar, onEditar, onEliminar }: {
  fila: Responsabilidad
  manuales: { id: string; titulo: string; publicado: boolean }[]
  apodoDe: (n: string) => string
  mostrarPersona?: boolean
  mostrarSector?: boolean
  puedeEditar: boolean
  onEditar: (r: Responsabilidad) => void
  onEliminar: (r: Responsabilidad) => void
}) {
  const manual = manuales.find((m) => m.id === fila.manual_id)
  const huerfano = sinDueno(fila)
  return (
    <div style={{ border: `1px solid ${huerfano ? color.warningBorder : color.line}`, borderRadius: 8, padding: space[3], background: huerfano ? color.warningBg : undefined }}>
      <div style={{ display: 'flex', gap: space[2], alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{ fontSize: font.md, fontWeight: weight.semibold, color: color.ink }}>{fila.titulo}</span>
        {mostrarPersona && (
          huerfano
            ? <Badge tone="warning">Sin dueño</Badge>
            : <Badge tone="neutral">{apodoDe(fila.persona as string)}</Badge>
        )}
        {mostrarSector && <Badge tone="neutral">{FUNCIONES.find((f) => f.key === fila.sector)?.label || fila.sector}</Badge>}
        {fila.activo === false && <Badge tone="neutral">Apagada</Badge>}
        <span style={{ flex: 1 }} />
        {puedeEditar && (
          <>
            <Button size="sm" variant="ghost" onClick={() => onEditar(fila)}>Editar</Button>
            <Button size="sm" variant="ghost" onClick={() => onEliminar(fila)}>Eliminar</Button>
          </>
        )}
      </div>
      {fila.detalle && <div style={{ marginTop: space[2] }}><Markdown texto={fila.detalle} /></div>}
      {/* El link al manual sólo se dibuja si está PUBLICADO: un botón que promete ayuda y abre
          vacío enseña a no apretarlo. Es la misma regla del «📘 Cómo se hace» del pendiente. */}
      {manual?.publicado && (
        <div style={{ marginTop: space[2] }}>
          <Link href={`/manuales?manual=${encodeURIComponent(manual.id)}`} style={{ fontSize: font.sm, color: color.brand, fontWeight: weight.semibold }}>
            📘 {manual.titulo}
          </Link>
        </div>
      )}
    </div>
  )
}

/** La ficha de una persona: sus responsabilidades por clase, y el renglón de sus rutinas. */
function Ficha({ persona, apodo, filas, manuales, rutinas, puedeEditar, onEditar, onEliminar }: {
  persona: string
  apodo: string
  filas: Responsabilidad[]
  manuales: { id: string; titulo: string; publicado: boolean }[]
  rutinas: ItemAgenda[] | null
  puedeEditar: boolean
  onEditar: (r: Responsabilidad) => void
  onEliminar: (r: Responsabilidad) => void
}) {
  const suyas = useMemo(() => (
    (rutinas || []).filter((i) => i.activo !== false && !i.plantilla && clavesDestino(i.destino).includes(`p:${persona}`))
  ), [rutinas, persona])

  return (
    <SectionCard title={apodo} subtitle={apodo === persona ? undefined : persona}>
      <Lista
        filas={filas}
        manuales={manuales}
        apodoDe={() => apodo}
        puedeEditar={puedeEditar}
        onEditar={onEditar}
        onEliminar={onEliminar}
      />

      <div style={{ marginTop: space[4], paddingTop: space[3], borderTop: `1px solid ${color.line}` }}>
        <div style={{ fontSize: font.xs, color: color.mut2, marginBottom: space[2] }}>
          {rutinas === null ? 'Buscando sus rutinas en la Agenda…'
            : suyas.length ? `Y en la Agenda le caen ${suyas.length === 1 ? 'esta rutina' : `estas ${suyas.length} rutinas`}:`
            : 'En la Agenda no le cae ninguna rutina de calendario.'}
        </div>
        {/* 🔑 El cero de acá NO dice que no trabaje, y por eso lo dice la pantalla y no lo deduce el
            que mira: la Agenda dispara por día del calendario, y el trabajo que dispara por un
            HECHO —una sesión, una pieza, un ingreso— vive en los moldes, no acá. Medido el
            30-ago-2026: Camila Budek tiene 0 rutinas propias y 4 pasos en los moldes. */}
        {rutinas !== null && suyas.length === 0 && (
          <div style={{ fontSize: font.sm, color: color.mut }}>
            No es que no le toque nada: la Agenda dispara por día del calendario, y lo que dispara por
            un hecho —una sesión, un ingreso, un lanzamiento— vive en los eventos de la Agenda.
          </div>
        )}
        <div style={{ display: 'flex', gap: space[1], flexWrap: 'wrap', alignItems: 'center' }}>
          {suyas.map((r) => (
            <span key={r.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: font.sm, color: color.ink2, border: `1px solid ${color.line}`, borderRadius: 999, padding: '3px 10px' }}>
              <span aria-hidden>{r.clase === 'aviso' ? '📣' : '☑️'}</span>
              {r.titulo}
            </span>
          ))}
          <Link href="/agenda" style={{ fontSize: font.sm, color: color.brand, fontWeight: weight.semibold }}>Ver la Agenda →</Link>
        </div>
      </div>
    </SectionCard>
  )
}
