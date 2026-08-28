'use client'

/**
 * Las vitrinas: **el espejo curado de Tienda Nube** que la creadora ve al abrir su link.
 *
 * Se trae de la tienda lo que se quiere promocionar, se saca lo que no va, y lo que queda se
 * congela con su foto y su precio. **De acá no vuelve nada a TN**: el monitor lee la tienda y nada
 * más; la venta se tipea después a mano en el admin.
 *
 * Dos decisiones que explican por qué la pantalla es así:
 *
 *   - **Se trae de a poco, por categoría o buscando.** La tienda entera son 235 productos en BDI y
 *     661 en Zattia: traer todo y podar es una sentada larga y para nada, porque una vitrina es lo
 *     que se quiere promocionar ahora. Por eso se arman varias con nombre y se elige cuál va en
 *     cada canje, en vez de tener una sola gigante.
 *   - **Congelar es lo que hace que el link abra.** El portal no tiene sesión y no puede pedirle
 *     nada a Tienda Nube, así que todo lo que ella va a ver tiene que estar guardado de este lado.
 *     El costo de eso es que la vitrina envejece: por eso está el botón de actualizar.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Badge, Button, Card, EmptyState, Field, Input, Modal, Notice, SectionCard, Select,
  color, font, radius, space, weight, useConfirmar, useToast,
} from '@/components/ui'
import { FotoTn } from '@/components/tncat/FotoTn'
import { traerAudit } from '@/lib/tn-audit'
import {
  borrarVitrina, cambiarEstadoVitrina, crearVitrina, editarVitrina, leerVitrinas,
  revisarStockDeVitrina, sacarDeVitrina, sumarAVitrina, type ProductoParaVitrina,
} from '@/lib/canjes/cliente'
import {
  buscarEnLaTienda, categoriasDeLaTienda, idsOcultos, revisarStock,
  type CategoriaTn, type ProductoTn,
} from '@/lib/canjes/vitrina'
import { baseDeCostos } from '@/lib/canjes/tipos'
import {
  ESTADO_VITRINA_LABEL, opcionEnCriollo,
  type CanjeStore, type CanjeVitrina, type CanjeVitrinaItem, type EstadoVitrina,
} from '@/lib/canjes/tipos'

/** El tope del servidor, repetido acá para poder avisar antes de mandar 300 productos al vacío. */
const TOPE_VITRINA = 120

/**
 * Qué tan vieja es la foto del stock, en criollo.
 *
 * Va en la pantalla porque **la vitrina no se entera sola de que algo se agotó**: es un espejo
 * congelado y el portal no puede preguntarle nada a la tienda. Decir la fecha es lo que convierte
 * eso de trampa silenciosa en un dato que se mira antes de mandar el link.
 */
function desdeCuandoElStock(v: Pick<CanjeVitrina, 'stock_at' | 'created_at'>): string {
  if (v.stock_at) return `el stock se revisó el ${v.stock_at.slice(0, 10)}`
  // Sin revisión, la foto es de cuando se armó. Es menos preciso —los productos entraron en
  // distintos momentos— pero es la fecha más vieja posible, que es la que conviene que se lea.
  return v.created_at
    ? `el stock no se revisó desde que se armó, el ${v.created_at.slice(0, 10)}`
    : 'el stock nunca se revisó'
}

const tono: Record<EstadoVitrina, 'neutral' | 'success' | 'warning'> = {
  borrador: 'warning',
  activa: 'success',
  archivada: 'neutral',
}

export function Vitrinas({ store }: { store: CanjeStore }) {
  const toast = useToast()
  const { confirmar } = useConfirmar()
  const [vitrinas, setVitrinas] = useState<CanjeVitrina[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [abierta, setAbierta] = useState<number | null>(null)
  const [creando, setCreando] = useState(false)

  const recargar = useCallback(async () => {
    setCargando(true)
    try {
      const v = await leerVitrinas(store)
      setVitrinas(v)
      setError(null)
    } catch (e) {
      setError(String((e as Error)?.message || e))
      setVitrinas([])
    } finally {
      setCargando(false)
    }
  }, [store])

  // El flag `vivo` no es ceremonia: cambiar de marca dos veces rápido dispara dos lecturas y sin
  // esto la primera en volver —que es la vieja— pisa a la nueva. Es el molde del resto del módulo.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      setCargando(true)
      // Cambiar de marca cierra la vitrina abierta: la de la marca anterior no es de esta.
      setAbierta(null)
      try {
        const v = await leerVitrinas(store)
        if (vivo) { setVitrinas(v); setError(null) }
      } catch (e) {
        if (vivo) { setError(String((e as Error)?.message || e)); setVitrinas([]) }
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => { vivo = false }
  }, [store])

  const laAbierta = vitrinas.find((v) => v.id === abierta) || null

  if (laAbierta) {
    return (
      <ArmarVitrina
        store={store}
        vitrina={laAbierta}
        onVolver={() => { setAbierta(null); void recargar() }}
        onCambio={recargar}
      />
    )
  }

  return (
    <>
      {error && <Notice tone="danger">{error}</Notice>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: space[4], gap: space[3], flexWrap: 'wrap' }}>
        <span style={{ color: color.mut, fontSize: font.sm, maxWidth: 620 }}>
          Lo que la creadora ve al abrir su link. Se arma con productos de la tienda y se le cuelga a
          cada canje: la misma vitrina sirve para varios, pero el link de cada persona es el suyo.
        </span>
        <Button variant="solid" tone="brand" onClick={() => setCreando(true)}>Nueva vitrina</Button>
      </div>

      {cargando && !vitrinas.length ? (
        <Card>Cargando las vitrinas…</Card>
      ) : !vitrinas.length ? (
        <EmptyState
          dashed
          title="Todavía no hay ninguna vitrina"
          hint="Creá una con el nombre de lo que quieras promocionar (“Fundas verano”) y traele productos de la tienda."
        />
      ) : (
        <div style={{ display: 'grid', gap: space[3] }}>
          {vitrinas.map((v) => {
            const activos = (v.items || []).filter((i) => i.activo).length
            const apagados = (v.items || []).length - activos
            return (
              <Card key={v.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
                      <span style={{ fontWeight: weight.semibold, color: color.ink }}>{v.nombre}</span>
                      <Badge tone={tono[v.estado]} subtle>{ESTADO_VITRINA_LABEL[v.estado]}</Badge>
                    </div>
                    <div style={{ color: color.mut, fontSize: font.sm, marginTop: 2 }}>
                      {activos === 0 ? 'Sin productos todavía' : `${activos} ${activos === 1 ? 'producto' : 'productos'}`}
                      {apagados > 0 && ` · ${apagados} apagado${apagados === 1 ? '' : 's'}`}
                      {v.nota ? ` · ${v.nota}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: space[2] }}>
                    {v.estado === 'activa' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          if (!(await confirmar({
                            titulo: `Archivar “${v.nombre}”`,
                            mensaje: 'Deja de ofrecerse para canjes nuevos. Los que ya la tienen la siguen viendo.',
                            ok: 'Archivar',
                          }))) return
                          try { await cambiarEstadoVitrina(store, v.id, 'archivada'); await recargar() } catch (e) { toast.error(String((e as Error)?.message || e)) }
                        }}
                      >
                        Archivar
                      </Button>
                    )}
                    {v.estado !== 'activa' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          try { await cambiarEstadoVitrina(store, v.id, 'activa'); await recargar(); toast.ok('Ya se le puede colgar a un canje.') } catch (e) { toast.error(String((e as Error)?.message || e)) }
                        }}
                      >
                        Activar
                      </Button>
                    )}
                    <Button variant="solid" tone="brand" size="sm" onClick={() => setAbierta(v.id)}>Abrir</Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <NuevaVitrina
        abierto={creando}
        store={store}
        onCerrar={() => setCreando(false)}
        onListo={async (id) => { setCreando(false); await recargar(); setAbierta(id) }}
      />
    </>
  )
}

function NuevaVitrina({
  abierto, store, onCerrar, onListo,
}: {
  abierto: boolean
  store: CanjeStore
  onCerrar: () => void
  onListo: (id: number) => Promise<void>
}) {
  const toast = useToast()
  const [nombre, setNombre] = useState('')
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)

  const guardar = async () => {
    if (!nombre.trim()) return
    setGuardando(true)
    try {
      const v = await crearVitrina(store, nombre.trim(), nota.trim() || undefined)
      setNombre('')
      setNota('')
      await onListo(v.id)
    } catch (e) {
      toast.error(String((e as Error)?.message || e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Nueva vitrina"
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button variant="solid" tone="brand" onClick={() => void guardar()} loading={guardando} disabled={!nombre.trim()}>
            Crear
          </Button>
        </>
      }
    >
      <Field label="Nombre" required hint="Lo vas a ver vos al colgársela a un canje; ella no lo ve.">
        <Input value={nombre} placeholder="Fundas verano" autoFocus onChange={(e) => setNombre(e.target.value)} />
      </Field>
      <div style={{ marginTop: space[3] }}>
        <Field label="Nota" hint="Opcional. Para acordarte de para qué la armaste.">
          <Input value={nota} onChange={(e) => setNota(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

/**
 * Armar una vitrina: lo que ya tiene arriba, y abajo la tienda para traer más.
 *
 * El catálogo se baja **una sola vez por marca** (`traerAudit` lo cachea mientras vive la pestaña) y
 * con `refrescar` al pedirlo a mano: es la única llamada del módulo que justifica saltear los
 * cachés, porque si acaban de subir fotos la vitrina las tiene que ver.
 */
function ArmarVitrina({
  store, vitrina, onVolver, onCambio,
}: {
  store: CanjeStore
  vitrina: CanjeVitrina
  onVolver: () => void
  onCambio: () => Promise<void>
}) {
  const toast = useToast()
  const { confirmar } = useConfirmar()
  const [tienda, setTienda] = useState<ProductoTn[] | null>(null)
  const [bajando, setBajando] = useState(false)
  const [errorTienda, setErrorTienda] = useState<string | null>(null)
  const [categoria, setCategoria] = useState('')
  const [texto, setTexto] = useState('')
  /**
   * El filtro de los ocultos: cuando está prendido la pantalla muestra **sólo** lo despublicado.
   * Es un mundo aparte y no un "incluir también" porque es a lo que se entra a propósito —el
   * ingreso que todavía no salió— y porque casi nunca tiene categoría con la que llegarle.
   */
  const [soloOcultos, setSoloOcultos] = useState(false)
  const [elegidos, setElegidos] = useState<Set<string>>(new Set())
  const [guardando, setGuardando] = useState(false)
  const [revisando, setRevisando] = useState(false)

  // Stunned se sirve del catálogo de Zattia: es una línea de esa tienda, no una tienda propia.
  const marcaTn = baseDeCostos(store)

  const bajar = useCallback(async (refrescar: boolean) => {
    setBajando(true)
    try {
      const ps = await traerAudit<ProductoTn>(marcaTn, { variantes: true, refrescar })
      setTienda(ps)
      setErrorTienda(null)
    } catch (e) {
      setErrorTienda(String((e as Error)?.message || e))
    } finally {
      setBajando(false)
    }
  }, [marcaTn])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      setBajando(true)
      try {
        const ps = await traerAudit<ProductoTn>(marcaTn, { variantes: true })
        if (vivo) { setTienda(ps); setErrorTienda(null) }
      } catch (e) {
        if (vivo) setErrorTienda(String((e as Error)?.message || e))
      } finally {
        if (vivo) setBajando(false)
      }
    })()
    return () => { vivo = false }
  }, [marcaTn])

  const categorias = useMemo<CategoriaTn[]>(() => categoriasDeLaTienda(tienda || []), [tienda])

  /** Lo despublicado con stock. Se calcula siempre: es el número que va en el botón del filtro. */
  const ocultos = useMemo<ProductoParaVitrina[]>(
    () => (tienda ? buscarEnLaTienda(tienda, { ocultos: true }) : []),
    [tienda],
  )
  const marcadosOcultos = useMemo(() => idsOcultos(tienda || []), [tienda])

  const yaEstan = useMemo(
    () => new Set((vitrina.items || []).map((i) => String(i.tn_product_id))),
    [vitrina.items],
  )

  // Sin categoría ni texto no se muestra nada: la tienda entera en pantalla es exactamente lo que
  // esta pantalla existe para no hacer. Los ocultos son la excepción: son pocos y entrar al filtro
  // ya es la decisión de verlos.
  const candidatos = useMemo<ProductoParaVitrina[]>(() => {
    if (!tienda) return []
    if (soloOcultos) return buscarEnLaTienda(tienda, { texto, ocultos: true })
    if (!categoria && texto.trim().length < 2) return []
    return buscarEnLaTienda(tienda, { categoria, texto })
  }, [tienda, categoria, texto, soloOcultos])

  const nuevos = candidatos.filter((c) => !yaEstan.has(c.tn_product_id))

  const alternar = (id: string) => setElegidos((s) => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  const sumar = async () => {
    const items = candidatos.filter((c) => elegidos.has(c.tn_product_id))
    if (!items.length) return
    setGuardando(true)
    try {
      const r = await sumarAVitrina(store, vitrina.id, items)
      setElegidos(new Set())
      await onCambio()
      toast.ok(r.sumados ? `Sumaste ${r.sumados} ${r.sumados === 1 ? 'producto' : 'productos'}.` : 'Se actualizaron las fotos y los precios.')
    } catch (e) {
      toast.error(String((e as Error)?.message || e))
    } finally {
      setGuardando(false)
    }
  }

  /**
   * Revisar la vitrina entera contra la tienda de hoy.
   *
   * ⚠️ **Baja el catálogo salteando el caché, siempre.** Es lo único que esta acción decide sola, y
   * es a propósito: revisar el stock contra una foto de hace una hora es no revisarlo.
   *
   * ⚠️ **Si el catálogo viene vacío no se toca nada.** Sin esa guarda, una lectura fallida apaga la
   * vitrina entera de un click y no hay forma de distinguirlo de "se agotó todo".
   */
  const revisar = async () => {
    setRevisando(true)
    try {
      const ps = await traerAudit<ProductoTn>(marcaTn, { variantes: true, refrescar: true })
      setTienda(ps)
      setErrorTienda(null)
      if (!ps.length) {
        toast.error('La tienda no devolvió ningún producto. No se tocó nada: probá de nuevo en un rato.')
        return
      }
      const { actualizar, apagar } = revisarStock(items, ps)

      // Apagar es la parte que cambia lo que ella ve, así que se pregunta con el número puesto.
      if (apagar.length) {
        const nombres = items
          .filter((i) => apagar.includes(String(i.tn_product_id)))
          .map((i) => i.nombre)
        if (!(await confirmar({
          titulo: apagar.length === 1 ? 'Se agotó 1 producto' : `Se agotaron ${apagar.length} productos`,
          mensaje: `Dejan de ofrecerse en los canjes que tengan esta vitrina: ${nombres.slice(0, 6).join(', ')}${nombres.length > 6 ? '…' : ''}. Lo que alguien ya haya elegido no se toca.`,
          ok: 'Apagarlos',
        }))) return
      }

      const r = await revisarStockDeVitrina(store, vitrina.id, actualizar, apagar)
      await onCambio()
      toast.ok(
        r.apagados
          ? `Se apagaron ${r.apagados} y se actualizaron ${r.actualizados}.`
          : `Todo en pie: se actualizaron ${r.actualizados} ${r.actualizados === 1 ? 'producto' : 'productos'}.`,
      )
    } catch (e) {
      toast.error(String((e as Error)?.message || e))
    } finally {
      setRevisando(false)
    }
  }

  const sacar = async (item: CanjeVitrinaItem) => {
    // En borrador se borra de verdad: todavía no se le ofreció a nadie y no hay nada que explicar.
    // Una vez que salió se apaga, porque que un producto se haya caído es información.
    const borra = vitrina.estado === 'borrador'
    if (!borra && !(await confirmar({
      titulo: `Apagar “${item.nombre}”`,
      mensaje: 'Deja de ofrecerse en los canjes que tengan esta vitrina. Lo que alguien ya haya elegido no se toca.',
      ok: 'Apagar',
    }))) return
    try {
      await sacarDeVitrina(store, vitrina.id, item.id, borra ? undefined : false)
      await onCambio()
    } catch (e) {
      toast.error(String((e as Error)?.message || e))
    }
  }

  const items = vitrina.items || []
  const activos = items.filter((i) => i.activo)
  const apagados = items.filter((i) => !i.activo)
  /** Cuántos se congelaron antes de que se guardaran las demás fotos del producto. */
  const sinGaleria = activos.filter((i) => !(i.fotos || []).length).length

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space[3], flexWrap: 'wrap', marginBottom: space[4] }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
          <Button variant="ghost" size="sm" onClick={onVolver}>← Vitrinas</Button>
          <span style={{ fontWeight: weight.semibold, fontSize: font.lg, color: color.ink }}>{vitrina.nombre}</span>
          <Badge tone={tono[vitrina.estado]} subtle>{ESTADO_VITRINA_LABEL[vitrina.estado]}</Badge>
        </div>
        <div style={{ display: 'flex', gap: space[2] }}>
          {/* Es la acción que evita ofrecerle algo agotado, así que va primera y con tono de marca:
              "actualizar la tienda" de al lado sólo refresca el catálogo en pantalla. */}
          {items.length > 0 && (
            <Button variant="soft" tone="brand" size="sm" onClick={() => void revisar()} loading={revisando}>
              Revisar el stock
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => void bajar(true)} disabled={bajando || revisando}>
            {bajando ? 'Bajando…' : 'Actualizar la tienda'}
          </Button>
          <RenombrarVitrina store={store} vitrina={vitrina} onListo={onCambio} />
          {!items.length && (
            <Button
              variant="ghost"
              tone="danger"
              size="sm"
              onClick={async () => {
                if (!(await confirmar({
                  titulo: `Eliminar “${vitrina.nombre}”`,
                  mensaje: 'No tiene productos cargados, así que no se pierde nada.',
                  ok: 'Eliminar',
                }))) return
                try { await borrarVitrina(store, vitrina.id); onVolver() } catch (e) { toast.error(String((e as Error)?.message || e)) }
              }}
            >
              Eliminar
            </Button>
          )}
        </div>
      </div>

      {vitrina.estado === 'borrador' && (
        <div style={{ marginBottom: space[4] }}>
          <Notice tone="neutral">
            Se está armando: todavía no se le puede colgar a un canje. Cuando esté lista, activala
            desde la lista de vitrinas.
          </Notice>
        </div>
      )}

      {/* Las vitrinas armadas antes del 5-ago-2026 se congelaron con una sola foto por producto.
          Funcionan igual —el visor abre con la que hay—, pero desde el teléfono, con una prenda,
          una sola foto no alcanza para elegir.
          🔑 Se recomienda **revisar el stock** y no "actualizar la tienda": aquél recorre la vitrina
          entera contra la tienda de hoy, y éste sólo refresca lo que venga en esa importación. */}
      {sinGaleria > 0 && (
        <div style={{ marginBottom: space[4] }}>
          <Notice tone="warning">
            {sinGaleria === 1
              ? 'Hay 1 producto con una sola foto'
              : `Hay ${sinGaleria} productos con una sola foto`}: se cargaron antes de que se
            guardaran las demás. Tocá <strong>Revisar el stock</strong> y las trae de la tienda —
            desde el link se van a poder ver todas.
          </Notice>
        </div>
      )}

      <SectionCard
        title="Lo que ella va a ver"
        subtitle={
          activos.length
            ? `${activos.length} de ${TOPE_VITRINA} productos. Todo quedó congelado el día que se trajo: ${desdeCuandoElStock(vitrina)}.`
            : 'Todavía no hay nada. Buscá productos abajo y sumalos.'
        }
      >
        {!activos.length ? (
          <EmptyState dashed title="Vitrina vacía" hint="Elegí una categoría de la tienda o buscá por nombre." />
        ) : (
          <Grilla>
            {activos.map((i) => (
              <Tarjeta
                key={i.id}
                nombre={i.nombre}
                foto={i.foto_url}
                pvp={i.pvp}
                chapita={marcadosOcultos.has(String(i.tn_product_id)) ? 'oculto' : undefined}
                pie={`${i.opciones.length} ${i.opciones.length === 1 ? 'opción' : 'opciones'}: ${i.opciones.slice(0, 3).map(opcionEnCriollo).filter(Boolean).join(', ') || '—'}${i.opciones.length > 3 ? '…' : ''}`}
                accion={<Button variant="ghost" tone="danger" size="sm" onClick={() => void sacar(i)}>Sacar</Button>}
              />
            ))}
          </Grilla>
        )}

        {apagados.length > 0 && (
          <div style={{ marginTop: space[4] }}>
            <div style={{ color: color.mut, fontSize: font.sm, fontWeight: weight.medium, marginBottom: space[2] }}>
              Apagados — no se ofrecen, pero queda registrado que estuvieron
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[2] }}>
              {apagados.map((i) => (
                <Badge key={i.id} tone="neutral" subtle>{i.nombre}</Badge>
              ))}
            </div>
          </div>
        )}
      </SectionCard>

      <div style={{ marginTop: space[5] }}>
        <SectionCard
          title="Traer de la tienda"
          subtitle="Se trae de a poco: elegí una categoría o buscá por nombre. Lo agotado no aparece."
        >
          {errorTienda && <Notice tone="danger">No se pudo leer la tienda: {errorTienda}</Notice>}

          <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: space[4] }}>
            <div style={{ minWidth: 240 }}>
              <Field label="Categoría de la tienda">
                <Select
                  value={categoria}
                  disabled={soloOcultos}
                  onChange={(e) => { setCategoria(e.target.value); setElegidos(new Set()) }}
                >
                  <option value="">— elegir —</option>
                  {categorias.map((c) => (
                    <option key={c.nombre} value={c.nombre}>{c.nombre} ({c.cuantos})</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div style={{ minWidth: 240, flex: 1 }}>
              <Field label="O buscar por nombre">
                <Input
                  value={texto}
                  placeholder="AMBER CASE, JEAN MEADOW…"
                  onChange={(e) => { setTexto(e.target.value); setElegidos(new Set()) }}
                />
              </Field>
            </div>
            <Button
              variant="solid"
              tone="brand"
              onClick={() => void sumar()}
              loading={guardando}
              disabled={!elegidos.size}
            >
              {elegidos.size ? `Sumar ${elegidos.size}` : 'Sumar'}
            </Button>
          </div>

          {/* El ingreso nuevo se carga en TN despublicado y **sin categoría**: sin esta puerta no hay
              forma de llegarle, ni por el desplegable ni acordándose del nombre de cada modelo. */}
          {ocultos.length > 0 && (
            <div style={{ marginBottom: space[4] }}>
              <Button
                variant={soloOcultos ? 'soft' : 'ghost'}
                tone={soloOcultos ? 'brand' : undefined}
                size="sm"
                onClick={() => {
                  setSoloOcultos((v) => !v)
                  setCategoria('')
                  setElegidos(new Set())
                }}
              >
                {soloOcultos ? `← Volver a la tienda publicada` : `Ocultos en la tienda (${ocultos.length})`}
              </Button>
              {soloOcultos && (
                <div style={{ color: color.mut, fontSize: font.sm, marginTop: space[2] }}>
                  Están cargados en Tienda Nube pero todavía no se publicaron. Se pueden ofrecer igual:
                  el producto sale del depósito a mano. Revisar el stock no los va a apagar.
                </div>
              )}
            </div>
          )}

          {bajando && !tienda ? (
            <Card>Bajando el catálogo de la tienda…</Card>
          ) : !soloOcultos && !categoria && texto.trim().length < 2 ? (
            <EmptyState
              dashed
              title="Elegí por dónde empezar"
              hint={categorias.length ? `La tienda tiene ${categorias.length} categorías. También podés buscar por nombre.` : 'Buscá un producto por nombre.'}
            />
          ) : !candidatos.length ? (
            <EmptyState dashed title="No hay nada acá" hint="Puede que esté todo agotado: eso no se ofrece." />
          ) : (
            <>
              <div style={{ display: 'flex', gap: space[3], alignItems: 'center', marginBottom: space[3], flexWrap: 'wrap' }}>
                <span style={{ color: color.mut, fontSize: font.sm }}>
                  {candidatos.length} {candidatos.length === 1 ? 'producto' : 'productos'}
                  {nuevos.length !== candidatos.length && ` · ${candidatos.length - nuevos.length} ya ${candidatos.length - nuevos.length === 1 ? 'está' : 'están'} en la vitrina`}
                </span>
                {nuevos.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setElegidos(new Set(nuevos.slice(0, TOPE_VITRINA - activos.length).map((n) => n.tn_product_id)))}
                  >
                    Marcar los que faltan
                  </Button>
                )}
              </div>
              <Grilla>
                {candidatos.map((c) => {
                  const esta = yaEstan.has(c.tn_product_id)
                  const marcado = elegidos.has(c.tn_product_id)
                  return (
                    <Tarjeta
                      key={c.tn_product_id}
                      nombre={c.nombre}
                      foto={c.foto_url}
                      pvp={c.pvp}
                      atenuada={esta && !marcado}
                      marcada={marcado}
                      chapita={marcadosOcultos.has(c.tn_product_id) ? 'oculto' : undefined}
                      onClick={() => alternar(c.tn_product_id)}
                      pie={`${c.opciones.length} ${c.opciones.length === 1 ? 'opción' : 'opciones'}${esta ? ' · ya está' : ''}`}
                    />
                  )
                })}
              </Grilla>
            </>
          )}
        </SectionCard>
      </div>
    </>
  )
}

function RenombrarVitrina({
  store, vitrina, onListo,
}: {
  store: CanjeStore
  vitrina: CanjeVitrina
  onListo: () => Promise<void>
}) {
  const toast = useToast()
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState(vitrina.nombre)
  const [guardando, setGuardando] = useState(false)

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => { setNombre(vitrina.nombre); setAbierto(true) }}>Renombrar</Button>
      <Modal
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        titulo="Renombrar la vitrina"
        pie={
          <>
            <Button variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button
              variant="solid"
              tone="brand"
              loading={guardando}
              disabled={!nombre.trim()}
              onClick={async () => {
                setGuardando(true)
                try {
                  await editarVitrina(store, vitrina.id, { nombre: nombre.trim() })
                  setAbierto(false)
                  await onListo()
                } catch (e) {
                  toast.error(String((e as Error)?.message || e))
                } finally {
                  setGuardando(false)
                }
              }}
            >
              Guardar
            </Button>
          </>
        }
      >
        <Field label="Nombre" required>
          <Input value={nombre} autoFocus onChange={(e) => setNombre(e.target.value)} />
        </Field>
      </Modal>
    </>
  )
}

/** La grilla de fotos. `auto-fill` para que en un monitor ancho entren más sin recalcular nada. */
function Grilla({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: space[3] }}>
      {children}
    </div>
  )
}

function Tarjeta({
  nombre, foto, pvp, pie, accion, onClick, marcada, atenuada, chapita,
}: {
  nombre: string
  foto?: string | null
  pvp?: number | null
  pie?: string
  accion?: React.ReactNode
  onClick?: () => void
  marcada?: boolean
  atenuada?: boolean
  /** Una palabra sobre la foto. Hoy sólo "oculto": que no esté publicado se tiene que ver. */
  chapita?: string
}) {
  return (
    <div
      onClick={onClick}
      style={{
        border: `1px solid ${marcada ? color.brandBorder : color.line}`,
        background: marcada ? color.brandBg : color.surface,
        borderRadius: radius.xl,
        padding: space[2],
        cursor: onClick ? 'pointer' : 'default',
        opacity: atenuada ? 0.45 : 1,
        display: 'flex',
        flexDirection: 'column',
        gap: space[1],
      }}
    >
      <div style={{ position: 'relative', aspectRatio: '1 / 1', background: color.bg2, borderRadius: radius.lg, overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
        {foto ? (
          <FotoTn src={foto} alt={nombre} ancho={150} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ color: color.mut2, fontSize: font.xs }}>sin foto</span>
        )}
        {chapita && (
          <div style={{ position: 'absolute', top: space[1], left: space[1] }}>
            <Badge tone="warning">{chapita}</Badge>
          </div>
        )}
      </div>
      <div style={{ fontSize: font.sm, fontWeight: weight.medium, color: color.ink, lineHeight: 1.3 }}>{nombre}</div>
      {pvp != null && (
        <div style={{ fontSize: font.sm, color: color.mut }}>${pvp.toLocaleString('es-AR')}</div>
      )}
      {pie && <div style={{ fontSize: font.xs, color: color.mut2, lineHeight: 1.3 }}>{pie}</div>}
      {accion && <div style={{ marginTop: 'auto', paddingTop: space[1] }}>{accion}</div>}
    </div>
  )
}
