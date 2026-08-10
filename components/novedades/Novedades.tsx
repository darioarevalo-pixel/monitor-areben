'use client'

/**
 * "Novedades" — qué cambió en los sistemas, en un solo lugar.
 *
 * El problema que resuelve no es escribirlas: es que **lleguen**. Los sistemas avanzan todo el
 * tiempo, grabar un Loom es fricción, y lo que no se graba no se cuenta. Así que las novedades se
 * escriben desde afuera —yo las cargo como borrador al terminar cada cambio, con
 * `scripts/novedad.mjs`— y acá sólo se revisan y se publican de un click. La fricción baja a cero
 * porque nadie se tiene que acordar de nada.
 *
 * **Abrir esta pantalla marca como leídas las que se ven.** No hay botón de "marcar leído": si
 * alguien entró, se enteró. Las importantes son otra cosa y tienen su propio cartel.
 */

import { useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { HeaderAcciones } from '@/components/layout/acciones'
import { EditorNovedad } from './EditorNovedad'
import { useSistema } from '@/store/useSistema'
import { borrarNovedad, cambiarEstado, nuevoId } from '@/lib/novedades/cliente'
import { NUEVA, type Novedad } from '@/lib/novedades/tipos'
import {
  Badge, Button, EmptyState, Esqueleto, Markdown, Notice, Plegable, SectionCard,
  color, font, space, useConfirmar, useToast,
} from '@/components/ui'

/** "9 de agosto", sin el año cuando es de este año: es una novedad, no un expediente. */
function cuando(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const esteAnio = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', ...(esteAnio ? {} : { year: 'numeric' }) })
}

export function Novedades() {
  const { perfil } = useSesion()
  const toast = useToast()
  const { confirmar } = useConfirmar()
  const { novedades, leidas, puede, cargado, cargar, marcar } = useSistema()

  const [editando, setEditando] = useState<Novedad | null>(null)
  const [verViejas, setVerViejas] = useState(false)

  useEffect(() => {
    if (!cargado) void cargar()
  }, [cargado, cargar])

  // Al entrar, todo lo publicado que se está viendo queda leído. Se hace en un efecto y no al
  // pintar cada tarjeta para que no dependa de si la persona scrolleó hasta el final.
  useEffect(() => {
    if (!cargado) return
    for (const n of novedades) if (n.estado === 'publicada') void marcar(n)
  }, [cargado, novedades, marcar])

  const leidaSet = useMemo(
    () => new Set(leidas.map((l) => `${l.novedad_id}|${l.version}`)),
    [leidas],
  )

  const borradores = novedades.filter((n) => n.estado === 'borrador')
  const vigentes = novedades.filter((n) => n.estado === 'publicada')
  const archivadas = novedades.filter((n) => n.estado === 'archivada')

  const accion = async (fn: () => Promise<void>, siSale: string) => {
    try {
      await fn()
      toast.ok(siSale)
      await cargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo.')
    }
  }

  const onBorrar = (n: Novedad) =>
    void confirmar({
      titulo: `Borrar «${n.titulo}»`,
      tono: 'danger',
      ok: 'Borrar',
      mensaje: 'Se va para todos, junto con el registro de quiénes la habían leído. Si sólo querés sacarla de la lista, archivala.',
    }).then(async (ok) => {
      if (ok) await accion(() => borrarNovedad(n.id), 'Borrada.')
    })

  if (!cargado) return <Esqueleto />

  const Tarjeta = ({ n }: { n: Novedad }) => (
    <div
      style={{
        border: `1px solid ${color.line}`, borderRadius: 12, padding: space[4],
        background: color.bg, display: 'grid', gap: space[2],
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2], flexWrap: 'wrap' }}>
        <strong style={{ fontSize: font.md, color: color.ink }}>{n.titulo}</strong>
        {n.estado === 'borrador' && <Badge tone="warning">Borrador</Badge>}
        {n.importante && n.estado === 'publicada' && <Badge tone="brand">Importante</Badge>}
        {n.estado === 'publicada' && !leidaSet.has(`${n.id}|${n.version}`) && <Badge tone="brand" subtle>Nueva</Badge>}
        <span style={{ marginLeft: 'auto', fontSize: font.xs, color: color.mut2 }}>
          {cuando(n.publicada_at || n.created_at)}
          {n.autor ? ` · ${n.autor}` : ''}
          {n.version > 1 ? ` · v${n.version}` : ''}
        </span>
      </div>

      <Markdown texto={n.cuerpo} />

      {puede.publicar && (
        <div style={{ display: 'flex', gap: space[1], flexWrap: 'wrap', marginTop: space[1] }}>
          {n.estado !== 'publicada' && (
            <Button size="sm" onClick={() => void accion(() => cambiarEstado(n.id, 'publicada'), 'Publicada. Ya la ve el equipo.')}>
              Publicar
            </Button>
          )}
          {n.estado === 'publicada' && (
            <>
              <Button size="sm" variant="soft" onClick={() => void accion(() => cambiarEstado(n.id, 'borrador'), 'Vuelve a ser un borrador.')}>
                Despublicar
              </Button>
              <Button size="sm" variant="soft" onClick={() => void accion(() => cambiarEstado(n.id, 'archivada'), 'Archivada.')}>
                Archivar
              </Button>
            </>
          )}
          {n.estado === 'archivada' && (
            <Button size="sm" variant="soft" onClick={() => void accion(() => cambiarEstado(n.id, 'publicada'), 'Volvió a la lista.')}>
              Desarchivar
            </Button>
          )}
          <Button size="sm" variant="ghost" iconLeft="✏️" onClick={() => setEditando(n)}>Editar</Button>
          <Button size="sm" variant="ghost" tone="danger" iconLeft="🗑" onClick={() => onBorrar(n)}>Borrar</Button>
        </div>
      )}
    </div>
  )

  return (
    <>
      <HeaderAcciones>
        {puede.publicar && (
          <Button iconLeft="＋" onClick={() => setEditando({ ...NUEVA, id: nuevoId() })}>
            Escribir una novedad
          </Button>
        )}
      </HeaderAcciones>

      {puede.publicar && borradores.length > 0 && (
        <SectionCard title="Sin publicar" subtitle="Sólo las ves vos. El equipo no se entera hasta que le des Publicar.">
          <div style={{ display: 'grid', gap: space[3] }}>
            {borradores.map((n) => <Tarjeta key={n.id} n={n} />)}
          </div>
        </SectionCard>
      )}

      <SectionCard title="Lo último" subtitle="Lo que cambió en los sistemas, de lo más nuevo a lo más viejo.">
        {vigentes.length === 0 ? (
          <EmptyState
            icon="📣"
            title="Todavía no hay novedades publicadas"
            hint={puede.publicar ? 'Cuando termine un cambio te la voy a dejar acá como borrador.' : 'Cuando haya algo nuevo en los sistemas, va a aparecer acá.'}
          />
        ) : (
          <div style={{ display: 'grid', gap: space[3] }}>
            {vigentes.map((n) => <Tarjeta key={n.id} n={n} />)}
          </div>
        )}
      </SectionCard>

      {archivadas.length > 0 && (
        <SectionCard title="Anteriores">
          <Plegable
            abierto={verViejas}
            onToggle={() => setVerViejas((v) => !v)}
            titulo={`${archivadas.length} archivadas`}
            ayuda="Novedades viejas que ya no hace falta tener a mano. Siguen buscables acá."
          >
            <div style={{ display: 'grid', gap: space[3] }}>
              {archivadas.map((n) => <Tarjeta key={n.id} n={n} />)}
            </div>
          </Plegable>
        </SectionCard>
      )}

      {!perfil && <Notice tone="warning">Volvé a entrar: la sesión no tiene nombre y sin eso no se puede registrar la lectura.</Notice>}

      {editando && (
        <EditorNovedad
          novedad={editando}
          onCerrar={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null)
            void cargar()
          }}
        />
      )}
    </>
  )
}
