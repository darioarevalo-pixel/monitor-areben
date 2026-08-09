'use client'

/**
 * "Atención al cliente" — los links y mensajes que se copian y se pegan en Instagram y WhatsApp.
 *
 * Dos bloques. Arriba, las fundas por modelo de celular: no se cargan, salen del menú público de la
 * tienda, así que cuando entra un iPhone nuevo aparece solo. Abajo, lo que carga el equipo — envíos,
 * cambios, talles, promos — que puede ser un link, un mensaje, o las dos cosas juntas.
 *
 * La pantalla se usa MIENTRAS alguien está esperando del otro lado, así que todo está pensado para
 * el camino corto: el buscador arranca con el foco puesto, y cada fila copia con un clic.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { HeaderAcciones } from '@/components/layout/acciones'
import { useAtencion } from './useAtencion'
import { armarMensaje, filtrarItems, filtrarModelos, porGrupo, textoDeItem } from '@/lib/atencion/core'
import { nuevoId } from '@/lib/atencion/cliente'
import {
  ID_PLANTILLA_MODELO,
  PLANTILLA_MODELO_DEFECTO,
  type ItemAtencion,
} from '@/lib/atencion/tipos'
import {
  Badge, Button, CopyButton, EmptyState, Esqueleto, Field, Input,
  Modal, Notice, SectionCard, Select, color, font, useConfirmar, useToast,
} from '@/components/ui'

/** El formulario vacío de un item nuevo. */
const NUEVO: ItemAtencion = { id: '', tipo: 'link', titulo: '', url: '', texto: '', grupo: '' }

/** El `<textarea>` del kit: misma forma que un Input, con alto propio (`mo-input--multi`). */
function AreaTexto(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="mo-input mo-input--multi" style={{ width: '100%', boxSizing: 'border-box' }} {...props} />
}

export function Atencion() {
  const { marca } = useSesion()
  const toast = useToast()
  const { confirmar } = useConfirmar()
  const at = useAtencion(marca)

  const [busqueda, setBusqueda] = useState('')
  const [form, setForm] = useState<ItemAtencion | null>(null)
  const [editandoPlantilla, setEditandoPlantilla] = useState(false)
  const buscador = useRef<HTMLInputElement>(null)

  // El foco arranca en el buscador: se entra acá para encontrar UN link, no para leer la lista.
  useEffect(() => {
    buscador.current?.focus()
  }, [])

  const todos = useMemo(() => at.items ?? [], [at.items])
  // La plantilla se guarda como un item más (id fijo) para no necesitar otra tabla; no se lista.
  const plantilla = useMemo(
    () => todos.find((i) => i.id === ID_PLANTILLA_MODELO)?.texto || PLANTILLA_MODELO_DEFECTO,
    [todos],
  )
  const items = useMemo(() => todos.filter((i) => i.id !== ID_PLANTILLA_MODELO), [todos])

  const modelosFiltrados = useMemo(() => filtrarModelos(at.modelos, busqueda), [at.modelos, busqueda])
  const gruposFiltrados = useMemo(() => porGrupo(filtrarItems(items, busqueda)), [items, busqueda])

  const guardar = async (item: ItemAtencion) => {
    const err = await at.persistir(
      (l) => (l.some((i) => i.id === item.id) ? l.map((i) => (i.id === item.id ? item : i)) : [...l, item]),
      [item],
    )
    if (err) return void toast.error(err)
    setForm(null)
    setEditandoPlantilla(false)
  }

  const onGuardarForm = () => {
    if (!form) return
    const titulo = form.titulo.trim()
    if (!titulo) return void toast.error('Poné un título, que es lo que se busca después.')
    if (form.tipo === 'link' && !form.url?.trim()) return void toast.error('Falta el link.')
    if (form.tipo === 'mensaje' && !form.texto?.trim()) return void toast.error('Falta el mensaje.')
    void guardar({
      ...form,
      id: form.id || nuevoId(),
      titulo,
      url: form.tipo === 'link' ? form.url?.trim() : undefined,
      texto: form.texto?.trim() || undefined,
      grupo: form.grupo?.trim() || undefined,
      actualizado: new Date().toISOString(),
    })
  }

  const onBorrar = async (i: ItemAtencion) => {
    const ok = await confirmar({
      titulo: `Borrar «${i.titulo}»`,
      tono: 'danger',
      ok: 'Borrar',
      mensaje: 'Se va de la lista para todo el equipo. Si es un link que usan seguido, conviene editarlo en vez de borrarlo.',
    })
    if (!ok) return
    const err = await at.borrar(i.id)
    if (err) toast.error(err)
  }

  if (at.items === null) return <Esqueleto />

  return (
    <>
      <HeaderAcciones>
        {at.puedeEditar && (
          <Button variant="soft" iconLeft="✏️" onClick={() => setEditandoPlantilla(true)}>
            Mensaje de las fundas
          </Button>
        )}
        {at.puedeEditar && (
          <Button iconLeft="＋" onClick={() => setForm({ ...NUEVO })}>
            Agregar link o mensaje
          </Button>
        )}
      </HeaderAcciones>

      {at.error && <Notice tone="danger">{at.error}</Notice>}
      {at.desdeSemilla && (
        <Notice tone="warning">
          La tienda no contestó, así que estos son los modelos de la última vez que se pudo leer. Los
          links siguen funcionando; si entró un modelo nuevo, todavía no está acá.
        </Notice>
      )}

      {/* Input directo y no BuscarInput porque éste necesita el ref para arrancar con el foco. */}
      <div style={{ maxWidth: 520, margin: '0 0 16px' }}>
        <Input
          ref={buscador}
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar un modelo o un link… (ej: 15 pro, envíos)"
          style={{ width: '100%' }}
        />
      </div>

      <SectionCard
        title="Fundas por modelo"
        subtitle={`${at.modelos.length} modelos, directo de la tienda. El link ya abre filtrado.`}
      >
        {modelosFiltrados.length === 0 ? (
          <EmptyState
            icon="🔎"
            title={at.modelos.length ? 'Ningún modelo con ese nombre' : 'Esta marca no tiene fundas por modelo'}
            hint={at.modelos.length ? 'Probá con menos palabras, por ejemplo sólo el número.' : undefined}
          />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
            {modelosFiltrados.map((m) => (
              <div
                key={m.slug}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                  padding: '8px 10px', border: `1px solid ${color.line}`, borderRadius: 10, background: color.bg,
                }}
              >
                <a
                  href={m.url}
                  target="_blank"
                  rel="noreferrer"
                  title="Abrir en la tienda"
                  style={{ fontSize: font.sm, fontWeight: 600, color: color.ink, textDecoration: 'none', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {m.nombre}
                </a>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <CopyButton getText={() => m.url} label="Link" tone="neutral" iconLeft="🔗" />
                  <CopyButton getText={() => armarMensaje(plantilla, m)} label="Mensaje" />
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Otros links y mensajes" subtitle="Lo que carga el equipo: envíos, cambios, talles, promos.">
        {items.length === 0 ? (
          <EmptyState
            icon="🔗"
            title="Todavía no hay nada cargado"
            hint={at.puedeEditar ? 'Agregá el primero con el botón de arriba.' : 'Cuando alguien cargue links, van a aparecer acá.'}
          />
        ) : gruposFiltrados.length === 0 ? (
          <EmptyState icon="🔎" title="Nada con ese nombre" />
        ) : (
          gruposFiltrados.map(({ grupo, items: del }) => (
            <div key={grupo} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: font.xs, textTransform: 'uppercase', letterSpacing: 0.6, color: color.mut2, marginBottom: 6 }}>
                {grupo}
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                {del.map((i) => (
                  <div
                    key={i.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                      border: `1px solid ${color.line}`, borderRadius: 10, background: color.bg,
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: font.sm, fontWeight: 600, color: color.ink }}>
                        {i.titulo}{' '}
                        {i.tipo === 'mensaje' && <Badge tone="neutral" subtle>mensaje</Badge>}
                      </div>
                      <div style={{ fontSize: font.xs, color: color.mut2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {i.url || i.texto}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      {i.tipo === 'link' && i.texto && (
                        <CopyButton getText={() => i.url || ''} label="Link" tone="neutral" iconLeft="🔗" />
                      )}
                      <CopyButton getText={() => textoDeItem(i)} label="Copiar" />
                      {at.puedeEditar && (
                        <>
                          <Button variant="ghost" size="sm" iconLeft="✏️" aria-label="Editar" onClick={() => setForm({ ...NUEVO, ...i })} />
                          <Button variant="ghost" size="sm" tone="danger" iconLeft="🗑" aria-label="Borrar" onClick={() => void onBorrar(i)} />
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </SectionCard>

      {form && (
        <Modal
          abierto
          onCerrar={() => setForm(null)}
          titulo={form.id ? 'Editar' : 'Agregar link o mensaje'}
          pie={
            <>
              <Button variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>
              <Button onClick={onGuardarForm}>Guardar</Button>
            </>
          }
        >
          <Field label="Tipo">
            <Select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as ItemAtencion['tipo'] })}>
              <option value="link">Un link</option>
              <option value="mensaje">Sólo un mensaje</option>
            </Select>
          </Field>
          <Field label="Título" hint="Es lo que se busca después. Poné lo que escribirías vos: «costos de envío».">
            <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} autoFocus style={{ width: '100%' }} />
          </Field>
          {form.tipo === 'link' && (
            <Field label="Link">
              <Input value={form.url || ''} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" style={{ width: '100%' }} />
            </Field>
          )}
          <Field
            label={form.tipo === 'link' ? 'Mensaje que acompaña (opcional)' : 'Mensaje'}
            hint={form.tipo === 'link' ? 'Si lo ponés, el botón «Copiar» manda el mensaje con el link abajo.' : undefined}
          >
            <AreaTexto rows={3} value={form.texto || ''} onChange={(e) => setForm({ ...form, texto: e.target.value })} />
          </Field>
          <Field label="Grupo (opcional)" hint="Para ordenar la lista: «Envíos», «Cambios», «Promos».">
            <Input value={form.grupo || ''} onChange={(e) => setForm({ ...form, grupo: e.target.value })} style={{ width: '100%' }} />
          </Field>
        </Modal>
      )}

      {editandoPlantilla && (
        <PlantillaModal
          valor={plantilla}
          onCerrar={() => setEditandoPlantilla(false)}
          onGuardar={(texto) =>
            void guardar({ id: ID_PLANTILLA_MODELO, tipo: 'mensaje', titulo: 'Mensaje de las fundas por modelo', texto })
          }
        />
      )}
    </>
  )
}

/** El texto con el que se arma el mensaje de cada modelo, con la vista previa al lado. */
function PlantillaModal({ valor, onCerrar, onGuardar }: { valor: string; onCerrar: () => void; onGuardar: (t: string) => void }) {
  const [texto, setTexto] = useState(valor)
  const ejemplo = armarMensaje(texto, {
    nombre: 'iPhone 15 Pro',
    url: 'https://bdiaccesorios.com.ar/fundas/modelo-de-iphone/iphone-15-pro/',
  })
  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Mensaje de las fundas por modelo"
      pie={
        <>
          <Button variant="ghost" onClick={() => setTexto(PLANTILLA_MODELO_DEFECTO)}>Volver al original</Button>
          <Button onClick={() => onGuardar(texto)}>Guardar</Button>
        </>
      }
    >
      <Field label="El mensaje" hint="Escribí {modelo} y {link} donde quieras que entren el nombre y el link.">
        <AreaTexto rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus />
      </Field>
      <div style={{ fontSize: font.xs, color: color.mut2, marginBottom: 4 }}>Así se copia:</div>
      <div style={{ whiteSpace: 'pre-wrap', fontSize: font.sm, background: color.bg2, border: `1px solid ${color.line}`, borderRadius: 10, padding: 10 }}>
        {ejemplo}
      </div>
    </Modal>
  )
}
