'use client'

/**
 * "Manuales" — cómo se hace cada cosa.
 *
 * El manual de una pantalla se lee **desde esa pantalla**, con el botón "Cómo se usa" del
 * encabezado. Esta sección es el otro lado: verlos todos juntos, buscar uno, y tener un lugar para
 * los procedimientos que no son de ninguna pantalla ("cómo se cierra la caja", "dónde están las
 * contraseñas").
 *
 * Se leen **en la misma página, no en un modal**: un manual se lee largo, y un modal empuja a
 * cerrarlo antes de terminar.
 *
 * # Con un manual abierto, las listas se esconden
 *
 * Y no es cosmética: el manual se dibuja ARRIBA de las dos listas, así que al terminar de leerlo
 * había que scrollear la lista entera para volver. Queda el buscador, el manual y un «volver» — que
 * es lo que hace falta mientras se lee uno, y nada más.
 *
 * # El manual abierto vive en la URL
 *
 * `?manual=<id>` con `useFiltroUrl`, el mismo mecanismo de los filtros del resto de la app. Sirve
 * para dos cosas que antes no existían: **mandarle a alguien un manual**, y que un manual pueda
 * linkear a otro (`hrefSeguro` acepta las rutas internas que empiezan con `/`). El `id` es opaco,
 * así que el link se copia con el botón: no está pensado para escribirlo a mano.
 */

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { HeaderAcciones } from '@/components/layout/acciones'
import { EditorManual } from './EditorManual'
import { useSistema } from '@/store/useSistema'
import { borrarManual, leerManual, leerManualConRutinas, nuevoId } from '@/lib/manuales/cliente'
import { NUEVO, type Manual, type ManualIndice, type RutinaDeManual } from '@/lib/manuales/tipos'
import { coincide } from '@/lib/texto'
import { tituloLimpio } from '@/lib/nav'
import {
  Badge, Button, CopyButton, EmptyState, Esqueleto, Input, Markdown, Notice, SectionCard,
  color, font, space, useConfirmar, useFiltroUrl, useToast,
} from '@/components/ui'

/**
 * «Este manual explica estas rutinas» — el pie del manual abierto.
 *
 * 🔑 **Es lo que lo saca de ser un documento suelto.** Hasta hoy la flecha iba en un solo sentido:
 * la rutina de la Agenda apuntaba al manual con el botón «Cómo se hace», y el manual no sabía para
 * qué se usaba. Leerlo al revés contesta la pregunta con la que se llega a un manual por un link —
 * *«¿esto de qué es?»*— sin tener que abrir la Agenda y buscarlo.
 *
 * ⚠️ **Sólo las activas.** Una rutina apagada no le toca a nadie, y nombrarla acá haría que el
 * manual prometiera un trabajo que no está pasando.
 */
function RutinasQueExplica({ rutinas }: { rutinas: RutinaDeManual[] }) {
  if (!rutinas.length) return null
  return (
    <div style={{ marginTop: space[4], paddingTop: space[3], borderTop: `1px solid ${color.line}` }}>
      <div style={{ fontSize: font.xs, color: color.mut2, marginBottom: space[2] }}>
        Con esto se hacen {rutinas.length === 1 ? 'esta rutina de la Agenda' : `estas ${rutinas.length} rutinas de la Agenda`}:
      </div>
      <div style={{ display: 'flex', gap: space[1], flexWrap: 'wrap', alignItems: 'center' }}>
        {rutinas.map((r) => (
          <span key={r.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: font.sm, color: color.ink2, border: `1px solid ${color.line}`, borderRadius: 999, padding: '3px 10px' }}>
            {/* El aviso se distingue del pendiente porque no se tilda: quien lee esto tiene que
                saber si lo que va a encontrar en la Agenda le pide una acción o sólo le avisa. */}
            <span aria-hidden>{r.clase === 'aviso' ? '📣' : '☑️'}</span>
            {r.titulo}
          </span>
        ))}
        <Link href="/agenda" style={{ fontSize: font.sm, color: color.brand, fontWeight: 600 }}>
          Ver la Agenda →
        </Link>
      </div>
    </div>
  )
}

export function Manuales() {
  const toast = useToast()
  const { confirmar } = useConfirmar()
  const { manuales, puede, cargado, cargar } = useSistema()

  const [busqueda, setBusqueda] = useState('')
  const [abierto, setAbierto] = useState<Manual | null>(null)
  /** Las rutinas de la Agenda que explica el manual abierto. Viajan con él, en la misma request. */
  const [rutinas, setRutinas] = useState<RutinaDeManual[]>([])
  const [editando, setEditando] = useState<Manual | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [idUrl, setIdUrl] = useFiltroUrl<string>('manual', '')

  useEffect(() => {
    if (!cargado) void cargar()
  }, [cargado, cargar])

  const filtrados = useMemo(
    () => manuales.filter((m) => coincide(`${m.titulo} ${m.seccion ? tituloLimpio(m.seccion) : ''}`, busqueda)),
    [manuales, busqueda],
  )
  const dePantalla = filtrados.filter((m) => m.seccion)
  const sueltos = filtrados.filter((m) => !m.seccion)

  /**
   * 🔑 **La URL es la única fuente de cuál manual está abierto.** Abrirlo es escribir su id ahí, y
   * este efecto lo resuelve al cuerpo; no hay un segundo camino que abra sin pasar por acá. Eso es
   * lo que hace que llegar por un link y hacer clic en la lista sean exactamente lo mismo — si
   * fueran dos funciones, una de las dos se iba a olvidar de algo.
   *
   * ⚠️ Si el id no existe —un manual borrado, un link viejo— se avisa arriba y **la URL se limpia**:
   * sin eso el efecto lo reintentaría en cada render y el cartel de error se repondría solo.
   */
  useEffect(() => {
    if (!cargado || !idUrl || abierto?.id === idUrl) return
    let vivo = true
    ;(async () => {
      try {
        const { manual, rutinas: rs } = await leerManualConRutinas(idUrl)
        if (!vivo) return
        setAbierto(manual)
        setRutinas(rs)
        // El error se limpia al acertar y no al empezar: mientras carga, lo último que se sabe
        // sigue siendo lo que dice la pantalla.
        setError(null)
      } catch (e) {
        if (!vivo) return
        setError(e instanceof Error ? e.message : 'No se pudo abrir.')
        setIdUrl('')
      }
    })()
    return () => {
      vivo = false
    }
  }, [cargado, idUrl, abierto?.id, setIdUrl])

  const cerrar = () => {
    setAbierto(null)
    setRutinas([])
    setIdUrl('')
  }

  const editar = async (m: ManualIndice) => {
    try {
      setEditando(await leerManual(m.id))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo abrir para editar.')
    }
  }

  /**
   * 🔑 **El cartel dice lo que se lleva puesto, y hasta hoy callaba la mitad.** Avisaba que la
   * pantalla perdía el botón «Cómo se usa», pero no que las rutinas que lo explican quedan
   * apuntando a la nada: `agenda_items.manual_id` es `text` pelado, sin `references`, así que el
   * borrado no falla ni limpia nada y el botón «Cómo se hace» simplemente deja de dibujarse. Ahora
   * el número está en la mano —viajó con el manual— y se dice.
   */
  const onBorrar = (m: Manual) => {
    const cuelgan = rutinas.length
      ? ` Y ${rutinas.length === 1 ? '1 rutina de la Agenda se queda' : `${rutinas.length} rutinas de la Agenda se quedan`} sin el «Cómo se hace»: ${rutinas.map((r) => `«${r.titulo}»`).join(', ')}.`
      : ''
    return void confirmar({
      titulo: `Eliminar «${m.titulo}»`,
      tono: 'danger',
      ok: 'Eliminar',
      mensaje: (m.seccion
        ? 'Se va para todos, y esa pantalla deja de mostrar el botón «Cómo se usa».'
        : 'Se va para todos.') + cuelgan,
    }).then(async (ok) => {
      if (!ok) return
      try {
        await borrarManual(m.id)
        cerrar()
        await cargar()
        toast.ok('Eliminado.')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'No se pudo eliminar.')
      }
    })
  }

  if (!cargado) return <Esqueleto />

  const Fila = ({ m }: { m: ManualIndice }) => (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: space[2], padding: '8px 10px',
        border: `1px solid ${color.line}`, borderRadius: 10, background: color.bg,
      }}
    >
      <button
        onClick={() => setIdUrl(m.id)}
        style={{
          height: 'auto', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
          textAlign: 'left', flex: 1, minWidth: 0, color: color.ink, fontSize: font.sm, fontWeight: 600,
        }}
      >
        {m.titulo}
      </button>
      {m.seccion && <Badge tone="neutral" subtle>{tituloLimpio(m.seccion)}</Badge>}
      {!m.publicado && <Badge tone="warning">Sin publicar</Badge>}
      {puede.editarManuales && (
        <Button variant="ghost" size="sm" iconLeft="✏️" aria-label="Editar" onClick={() => void editar(m)} />
      )}
    </div>
  )

  return (
    <>
      <HeaderAcciones>
        {puede.editarManuales && (
          <Button iconLeft="＋" onClick={() => setEditando({ ...NUEVO, id: nuevoId() })}>
            Escribir un manual
          </Button>
        )}
      </HeaderAcciones>

      {error && <Notice tone="warning">{error}</Notice>}

      <div style={{ maxWidth: 520, margin: '0 0 16px' }}>
        <Input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar un manual… (ej: fallas, caja, contraseñas)"
          style={{ width: '100%' }}
        />
      </div>

      {abierto && (
        <SectionCard
          title={abierto.titulo}
          subtitle={abierto.seccion ? `Se lee también desde ${tituloLimpio(abierto.seccion)}, en «Cómo se usa».` : undefined}
        >
          <Markdown texto={abierto.cuerpo} indice="abierto" />
          <RutinasQueExplica rutinas={rutinas} />
          <div style={{ display: 'flex', gap: space[1], marginTop: space[4], flexWrap: 'wrap' }}>
            <Button variant="ghost" size="sm" onClick={cerrar}>← Volver a todos los manuales</Button>
            {/* El link con el id adentro, para mandárselo a alguien. El dominio sale de `window` y
                no escrito a mano: el monitor se abre por más de un dominio y uno fijo acá sería el
                equivocado justo cuando alguien lo pega en un chat. Se arma al hacer clic, así que
                nunca corre en el servidor. */}
            <CopyButton getText={() => `${window.location.origin}/manuales?manual=${abierto.id}`} label="Copiar el link" share />
            {puede.editarManuales && (
              <>
                <Button variant="soft" size="sm" iconLeft="✏️" onClick={() => setEditando(abierto)}>Editar</Button>
                <Button variant="ghost" size="sm" tone="danger" iconLeft="🗑" onClick={() => onBorrar(abierto)}>Eliminar</Button>
              </>
            )}
          </div>
        </SectionCard>
      )}

      {/* 🔑 Con uno abierto, las dos listas se van. El manual se dibuja ARRIBA de ellas, así que
          dejarlas obligaba a scrollear la lista entera para volver — el «bajar y bajar» que esta
          tanda vino a sacar. El buscador queda, para saltar a otro sin volver. */}
      {!abierto && (
        <>
      <SectionCard
        title="De una pantalla del monitor"
        subtitle="Cada uno se lee también desde su propia pantalla, con el botón «Cómo se usa»."
      >
        {dePantalla.length === 0 ? (
          <EmptyState
            icon="📘"
            title={manuales.some((m) => m.seccion) ? 'Ninguno con ese nombre' : 'Todavía no hay ninguno'}
            hint={puede.editarManuales ? 'Escribí el primero con el botón de arriba, eligiendo de qué pantalla habla.' : undefined}
          />
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {dePantalla.map((m) => <Fila key={m.id} m={m} />)}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Otros procedimientos"
        subtitle="Lo que no es de una pantalla: cómo se cierra la caja, dónde están las contraseñas, cómo se pide un ingreso."
      >
        {sueltos.length === 0 ? (
          <EmptyState
            icon="🗂"
            title={manuales.some((m) => !m.seccion) ? 'Ninguno con ese nombre' : 'Todavía no hay ninguno'}
          />
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {sueltos.map((m) => <Fila key={m.id} m={m} />)}
          </div>
        )}
      </SectionCard>
        </>
      )}

      {editando && (
        <EditorManual
          manual={editando}
          onCerrar={() => setEditando(null)}
          onGuardado={async () => {
            setEditando(null)
            setAbierto(null)
            await cargar()
          }}
        />
      )}
    </>
  )
}
