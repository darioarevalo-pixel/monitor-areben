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
 */

import { useEffect, useMemo, useState } from 'react'
import { HeaderAcciones } from '@/components/layout/acciones'
import { EditorManual } from './EditorManual'
import { useSistema } from '@/store/useSistema'
import { borrarManual, leerManual, nuevoId } from '@/lib/manuales/cliente'
import { NUEVO, type Manual, type ManualIndice } from '@/lib/manuales/tipos'
import { coincide } from '@/lib/texto'
import { tituloLimpio } from '@/lib/nav'
import {
  Badge, Button, EmptyState, Esqueleto, Input, Markdown, Notice, SectionCard,
  color, font, space, useConfirmar, useToast,
} from '@/components/ui'

export function Manuales() {
  const toast = useToast()
  const { confirmar } = useConfirmar()
  const { manuales, puede, cargado, cargar } = useSistema()

  const [busqueda, setBusqueda] = useState('')
  const [abierto, setAbierto] = useState<Manual | null>(null)
  const [editando, setEditando] = useState<Manual | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!cargado) void cargar()
  }, [cargado, cargar])

  const filtrados = useMemo(
    () => manuales.filter((m) => coincide(`${m.titulo} ${m.seccion ? tituloLimpio(m.seccion) : ''}`, busqueda)),
    [manuales, busqueda],
  )
  const dePantalla = filtrados.filter((m) => m.seccion)
  const sueltos = filtrados.filter((m) => !m.seccion)

  const abrir = async (m: ManualIndice) => {
    setError(null)
    try {
      setAbierto(await leerManual(m.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir.')
    }
  }

  const editar = async (m: ManualIndice) => {
    try {
      setEditando(await leerManual(m.id))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo abrir para editar.')
    }
  }

  const onBorrar = (m: Manual) =>
    void confirmar({
      titulo: `Borrar «${m.titulo}»`,
      tono: 'danger',
      ok: 'Borrar',
      mensaje: m.seccion
        ? 'Se va para todos, y esa pantalla deja de mostrar el botón «Cómo se usa».'
        : 'Se va para todos.',
    }).then(async (ok) => {
      if (!ok) return
      try {
        await borrarManual(m.id)
        setAbierto(null)
        await cargar()
        toast.ok('Borrado.')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'No se pudo borrar.')
      }
    })

  if (!cargado) return <Esqueleto />

  const Fila = ({ m }: { m: ManualIndice }) => (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: space[2], padding: '8px 10px',
        border: `1px solid ${color.line}`, borderRadius: 10, background: color.bg,
      }}
    >
      <button
        onClick={() => void abrir(m)}
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
          <Markdown texto={abierto.cuerpo} />
          <div style={{ display: 'flex', gap: space[1], marginTop: space[4], flexWrap: 'wrap' }}>
            <Button variant="ghost" size="sm" onClick={() => setAbierto(null)}>Cerrar</Button>
            {puede.editarManuales && (
              <>
                <Button variant="soft" size="sm" iconLeft="✏️" onClick={() => setEditando(abierto)}>Editar</Button>
                <Button variant="ghost" size="sm" tone="danger" iconLeft="🗑" onClick={() => onBorrar(abierto)}>Borrar</Button>
              </>
            )}
          </div>
        </SectionCard>
      )}

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
