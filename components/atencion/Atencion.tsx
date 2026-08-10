'use client'

/**
 * "Atención al cliente" — los links y mensajes que se copian y se pegan en Instagram y WhatsApp.
 *
 * Tres bloques, y el buscador de arriba filtra los tres. Las fundas por modelo de celular no se
 * cargan: salen del menú público de la tienda, así que cuando entra un iPhone nuevo aparece solo.
 * Los productos de la tienda salen del catálogo de TN y se buscan por nombre o SKU. Y abajo, lo que
 * carga el equipo — envíos, cambios, talles, promos — que puede ser un link, un mensaje, o las dos.
 *
 * **Un bloque sin nada no se dibuja.** Es lo que arregla Zattia sin un solo condicional por marca:
 * Zattia no vende fundas por modelo, ese bloque desaparece solo y los productos quedan arriba.
 *
 * La pantalla se usa MIENTRAS alguien está esperando del otro lado, así que todo está pensado para
 * el camino corto: el buscador arranca con el foco puesto, y cada fila copia con un clic.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { HeaderAcciones } from '@/components/layout/acciones'
import { useAtencion } from './useAtencion'
import { useProductosTienda } from './useProductosTienda'
import {
  armarMensaje, filtrarItems, filtrarModelos, filtrarProductos, porGrupo, textoDeItem, textoDeProducto,
} from '@/lib/atencion/core'
import { nuevoId } from '@/lib/atencion/cliente'
import { linkProducto, precioVigente } from '@/lib/tienda'
import {
  ID_PLANTILLA_MODELO,
  ID_PLANTILLA_PRODUCTO,
  PLANTILLA_MODELO_DEFECTO,
  PLANTILLA_PRODUCTO_DEFECTO,
  type ItemAtencion,
  type ProductoTienda,
} from '@/lib/atencion/tipos'
import {
  Badge, Button, CopyButton, EmptyState, Esqueleto, Field, formatMoney, Input,
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
  /** Cuál de las dos plantillas se está editando, o `null`. */
  const [editandoPlantilla, setEditandoPlantilla] = useState<'modelo' | 'producto' | null>(null)
  const buscador = useRef<HTMLInputElement>(null)

  // El catálogo se baja recién cuando hay algo escrito: ver el docblock del hook.
  const buscando = busqueda.trim().length >= 2
  const prod = useProductosTienda(marca)

  const onBuscar = (v: string) => {
    setBusqueda(v)
    if (v.trim().length >= 2) prod.pedir()
  }

  // El foco arranca en el buscador: se entra acá para encontrar UN link, no para leer la lista.
  useEffect(() => {
    buscador.current?.focus()
  }, [])

  const todos = useMemo(() => at.items ?? [], [at.items])
  // Las plantillas se guardan como un item más (id fijo) para no necesitar otra tabla; no se listan.
  const plantilla = useMemo(
    () => todos.find((i) => i.id === ID_PLANTILLA_MODELO)?.texto || PLANTILLA_MODELO_DEFECTO,
    [todos],
  )
  const plantillaProd = useMemo(
    () => todos.find((i) => i.id === ID_PLANTILLA_PRODUCTO)?.texto || PLANTILLA_PRODUCTO_DEFECTO,
    [todos],
  )
  const items = useMemo(
    () => todos.filter((i) => i.id !== ID_PLANTILLA_MODELO && i.id !== ID_PLANTILLA_PRODUCTO),
    [todos],
  )

  const modelosFiltrados = useMemo(() => filtrarModelos(at.modelos, busqueda), [at.modelos, busqueda])
  const gruposFiltrados = useMemo(() => porGrupo(filtrarItems(items, busqueda)), [items, busqueda])
  // Los despublicados quedan afuera: su URL pública da 404, y un link roto pegado en un chat es
  // peor que no encontrar el producto.
  const productos = useMemo(
    () => filtrarProductos(prod.productos.filter((p) => p.published !== false), busqueda),
    [prod.productos, busqueda],
  )

  const guardar = async (item: ItemAtencion) => {
    const err = await at.persistir(
      (l) => (l.some((i) => i.id === item.id) ? l.map((i) => (i.id === item.id ? item : i)) : [...l, item]),
      [item],
    )
    if (err) return void toast.error(err)
    setForm(null)
    setEditandoPlantilla(null)
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
        {at.puedeEditar && at.modelos.length > 0 && (
          <Button variant="soft" iconLeft="✏️" onClick={() => setEditandoPlantilla('modelo')}>
            Mensaje de las fundas
          </Button>
        )}
        {at.puedeEditar && (
          <Button variant="soft" iconLeft="✏️" onClick={() => setEditandoPlantilla('producto')}>
            Mensaje de un producto
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
          onChange={(e) => onBuscar(e.target.value)}
          placeholder="Buscar un modelo, un producto o un link… (ej: 15 pro, corset, envíos)"
          style={{ width: '100%' }}
        />
      </div>

      {/* Zattia no vende fundas por modelo: el bloque entero desaparece, sin preguntar por la marca. */}
      {at.modelos.length > 0 && (
      <SectionCard
        title="Fundas por modelo"
        subtitle={`${at.modelos.length} modelos, directo de la tienda. El link ya abre filtrado.`}
      >
        {modelosFiltrados.length === 0 ? (
          <EmptyState icon="🔎" title="Ningún modelo con ese nombre" hint="Probá con menos palabras, por ejemplo sólo el número." />
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
      )}

      {/*
        Este bloque se dibuja siempre, aunque no haya nada que mostrar todavía: es la única señal de
        que se puede buscar un producto. Un buscador que aparece recién cuando ya sabés que existe
        no lo usa nadie.
      */}
      <SectionCard
        title="Productos de la tienda"
        subtitle="Buscá por nombre o SKU y mandale el link con el precio de hoy."
      >
        {!buscando ? (
          <EmptyState icon="🔎" title="Escribí para buscar un producto" hint="Con dos letras alcanza: «corset», «clear case», o el SKU." />
        ) : prod.cargando && prod.productos.length === 0 ? (
          <Esqueleto />
        ) : prod.error ? (
          <Notice tone="warning">
            {prod.error} Los links de acá abajo siguen andando.{' '}
            <Button variant="ghost" size="sm" onClick={prod.pedir}>Reintentar</Button>
          </Notice>
        ) : productos.hallados.length === 0 ? (
          <EmptyState icon="🔎" title="Ningún producto con ese nombre" hint="Probá con una palabra sola, o con el SKU." />
        ) : (
          <>
            <div style={{ display: 'grid', gap: 6 }}>
              {productos.hallados.map((p) => (
                <FilaProducto key={String(p.id)} p={p} link={linkProducto(marca, p.handle)} plantilla={plantillaProd} />
              ))}
            </div>
            {productos.total > productos.hallados.length && (
              <div style={{ fontSize: font.xs, color: color.mut2, marginTop: 8 }}>
                y {productos.total - productos.hallados.length} más — afiná la búsqueda.
              </div>
            )}
          </>
        )}
      </SectionCard>

      {/* Buscando, un bloque sin resultados se va: lo que se busca puede estar en cualquiera de los tres. */}
      {(gruposFiltrados.length > 0 || busqueda.trim() === '') && (
      <SectionCard title="Otros links y mensajes" subtitle="Lo que carga el equipo: envíos, cambios, talles, promos.">
        {items.length === 0 ? (
          <EmptyState
            icon="🔗"
            title="Todavía no hay nada cargado"
            hint={at.puedeEditar ? 'Agregá el primero con el botón de arriba.' : 'Cuando alguien cargue links, van a aparecer acá.'}
          />
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
      )}

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

      {editandoPlantilla === 'modelo' && (
        <PlantillaModal
          titulo="Mensaje de las fundas por modelo"
          hint="Escribí {modelo} y {link} donde quieras que entren el nombre y el link."
          valor={plantilla}
          defecto={PLANTILLA_MODELO_DEFECTO}
          previa={(t) =>
            armarMensaje(t, {
              nombre: 'iPhone 15 Pro',
              url: 'https://bdiaccesorios.com.ar/fundas/modelo-de-iphone/iphone-15-pro/',
            })
          }
          onCerrar={() => setEditandoPlantilla(null)}
          onGuardar={(texto) =>
            void guardar({ id: ID_PLANTILLA_MODELO, tipo: 'mensaje', titulo: 'Mensaje de las fundas por modelo', texto })
          }
        />
      )}

      {editandoPlantilla === 'producto' && (
        <PlantillaModal
          titulo="Mensaje de un producto"
          hint="Marcadores: {producto}, {link}, {precio} y {sku}. Un renglón que quede vacío se cae solo."
          valor={plantillaProd}
          defecto={PLANTILLA_PRODUCTO_DEFECTO}
          previa={(t) =>
            textoDeProducto(t, {
              producto: 'Corset Bianca',
              link: 'https://zattia.com.ar/productos/corset-bianca/',
              precio: formatMoney(39990),
              sku: 'ZT-1043',
            })
          }
          onCerrar={() => setEditandoPlantilla(null)}
          onGuardar={(texto) =>
            void guardar({ id: ID_PLANTILLA_PRODUCTO, tipo: 'mensaje', titulo: 'Mensaje de un producto', texto })
          }
        />
      )}
    </>
  )
}

/**
 * Una fila de producto: foto chica, nombre, SKU y precio, y los dos botones de copiar.
 *
 * Sin stock ni variantes a propósito — ver el docblock de `ProductoTienda`. Sin precio se muestra
 * "sin precio" y **nunca** `$0`: en un chat con un cliente eso no es un detalle de formato.
 */
function FilaProducto({ p, link, plantilla }: { p: ProductoTienda; link: string | null; plantilla: string }) {
  const precio = precioVigente(p)
  const precioTxt = precio == null ? '' : formatMoney(precio)
  const foto = p.images?.[0]

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
        border: `1px solid ${color.line}`, borderRadius: 10, background: color.bg,
      }}
    >
      {foto ? (
        // eslint-disable-next-line @next/next/no-img-element -- foto remota de TN, sin loader de next/image
        <img src={foto} alt="" width={48} height={48} loading="lazy" style={{ objectFit: 'cover', borderRadius: 8, flexShrink: 0, background: color.bg2 }} />
      ) : (
        <div style={{ width: 48, height: 48, borderRadius: 8, flexShrink: 0, background: color.bg2 }} />
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: font.sm, fontWeight: 600, color: color.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {p.name}
        </div>
        <div style={{ fontSize: font.xs, color: color.mut2 }}>
          {precioTxt || 'sin precio'}
          {p.sku ? ` · ${p.sku}` : ''}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {link ? (
          <>
            <CopyButton getText={() => link} label="Link" tone="neutral" iconLeft="🔗" />
            <CopyButton
              getText={() => textoDeProducto(plantilla, { producto: p.name, link, precio: precioTxt, sku: p.sku || '' })}
              label="Mensaje"
            />
          </>
        ) : (
          <Badge tone="neutral" subtle>sin link</Badge>
        )}
      </div>
    </div>
  )
}

/**
 * El texto con el que se arma un mensaje, con la vista previa debajo.
 *
 * Sirve a las dos plantillas —la de los modelos y la de los productos— porque lo único que cambia
 * entre ellas son los marcadores y el ejemplo, y eso entra por props.
 */
function PlantillaModal({
  titulo, hint, valor, defecto, previa, onCerrar, onGuardar,
}: {
  titulo: string
  hint: string
  valor: string
  defecto: string
  previa: (texto: string) => string
  onCerrar: () => void
  onGuardar: (t: string) => void
}) {
  const [texto, setTexto] = useState(valor)
  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={titulo}
      pie={
        <>
          <Button variant="ghost" onClick={() => setTexto(defecto)}>Volver al original</Button>
          <Button onClick={() => onGuardar(texto)}>Guardar</Button>
        </>
      }
    >
      <Field label="El mensaje" hint={hint}>
        <AreaTexto rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus />
      </Field>
      <div style={{ fontSize: font.xs, color: color.mut2, marginBottom: 4 }}>Así se copia:</div>
      <div style={{ whiteSpace: 'pre-wrap', fontSize: font.sm, background: color.bg2, border: `1px solid ${color.line}`, borderRadius: 10, padding: 10 }}>
        {previa(texto)}
      </div>
    </Modal>
  )
}
