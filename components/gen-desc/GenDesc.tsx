'use client'

import { useMemo, useState } from 'react'
import {
  Badge, Button, Card, EmptyState, Field, Input, KpiCard, Notice, Select, Toolbar, useToast,
} from '@/components/ui'
import { useSesion } from '@/components/SesionProvider'
import { useGenDesc, type FilaCola, type ProductoTn, type ResultadoIA } from './useGenDesc'
import { partir } from '@/lib/tn-desc/bloques'
import { MODELOS, MODELO_POR_DEFECTO } from '@/lib/tn-desc/redactor.core.js'
import {
  ETIQUETAS, MAX_BULLET, MAX_PARRAFO, MIN_BULLETS, MAX_BULLETS, generarHtml, validarBorrador,
} from '@/lib/tn-desc/formato'
import type { Borrador } from '@/lib/tn-desc/formato'

/**
 * Redacción: la cola de descripciones de producto.
 *
 * Medido contra Zattia el 19-ago-2026 (369 publicados): **41 sin una sola palabra** —casi
 * todos NEW IN, o sea los ingresos— y **237 con menos de 120 caracteres**, las «6 o 7
 * palabras» que escribe el local. Y no había ningún formato base: de 369, UNO tenía formato
 * rico y convivían tres dialectos.
 *
 * 🔴 Desde el 19-ago-2026 esta pantalla SÍ sale a la tienda, pero por un solo botón y de a un
 * producto: «Publicar en la tienda», y sólo sobre un borrador ya aprobado. El navegador no
 * compone ni escribe: el servidor lee fresco, respalda, escribe con compare-and-swap y relee.
 */

const BORRADOR_VACIO: Borrador = { parrafo: '', bullets: [{ etiqueta: 'Tela', texto: '' }, { etiqueta: 'Calce', texto: '' }, { etiqueta: 'Detalle', texto: '' }] }

type Filtro = 'sin-desc' | 'corta' | 'con-insumo' | 'aprobados' | 'en-la-tienda' | 'todos'

const FILTROS: { v: Filtro; label: string }[] = [
  { v: 'sin-desc', label: 'Sin descripción' },
  { v: 'corta', label: 'Descripción corta' },
  { v: 'con-insumo', label: 'Con insumo cargado' },
  { v: 'aprobados', label: 'Aprobados' },
  { v: 'en-la-tienda', label: 'Publicados en la tienda' },
  { v: 'todos', label: 'Todos los publicados' },
]

export function GenDesc() {
  // La marca sale de la sesión, no de una prop: así entra al registro de secciones como
  // cualquier otra pantalla (el molde es `GenTalles`).
  const { marca } = useSesion()
  const { cargando, productos, cola, puedePublicar, error, refrescar, guardar, redactar, publicar } = useGenDesc(marca)
  const [filtro, setFiltro] = useState<Filtro>('sin-desc')
  const [abierto, setAbierto] = useState<string | null>(null)
  const toast = useToast()

  const publicados = useMemo(() => productos.filter((p) => p.published), [productos])

  const stats = useMemo(
    () => ({
      sinDesc: publicados.filter((p) => p.prosa.banda === 'nada').length,
      corta: publicados.filter((p) => p.prosa.banda === 'corta').length,
      conInsumo: publicados.filter((p) => (cola[p.id]?.insumo || '').trim()).length,
      aprobados: publicados.filter((p) => cola[p.id]?.estado === 'aprobado').length,
      enLaTienda: publicados.filter((p) => cola[p.id]?.estado === 'escrito').length,
    }),
    [publicados, cola],
  )

  const lista = useMemo(() => {
    const f = publicados.filter((p) => {
      const fila = cola[p.id]
      if (filtro === 'sin-desc') return p.prosa.banda === 'nada'
      if (filtro === 'corta') return p.prosa.banda === 'corta'
      if (filtro === 'con-insumo') return !!(fila?.insumo || '').trim()
      if (filtro === 'aprobados') return fila?.estado === 'aprobado'
      if (filtro === 'en-la-tienda') return fila?.estado === 'escrito' || fila?.estado === 'falla'
      return true
    })
    // Primero los mudos: son los que hoy salen a la calle sin decir nada.
    return f.sort((a, b) => a.prosa.largo - b.prosa.largo || a.name.localeCompare(b.name))
  }, [publicados, cola, filtro])

  if (error) return <Notice tone="danger">{error}</Notice>

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Notice tone="neutral">
        Acá se prepara el texto: se carga el <b>insumo</b> (3 o 4 palabras: la tela y el detalle que
        la foto no dice) y se escribe el borrador con el formato base. Recién cuando el borrador
        está <b>aprobado</b> aparece el botón de publicar, que escribe en la tienda de a un producto
        y guarda el texto anterior antes de pisarlo.
      </Notice>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
        <KpiCard label="Sin descripción" value={stats.sinDesc} tone="danger" activo={filtro === 'sin-desc'} onClick={() => setFiltro('sin-desc')} />
        <KpiCard label="Descripción corta" value={stats.corta} tone="warning" activo={filtro === 'corta'} onClick={() => setFiltro('corta')} />
        <KpiCard label="Con insumo" value={stats.conInsumo} tone="neutral" activo={filtro === 'con-insumo'} onClick={() => setFiltro('con-insumo')} />
        <KpiCard label="Aprobados" value={stats.aprobados} tone="success" activo={filtro === 'aprobados'} onClick={() => setFiltro('aprobados')} />
        <KpiCard label="En la tienda" value={stats.enLaTienda} tone="success" activo={filtro === 'en-la-tienda'} onClick={() => setFiltro('en-la-tienda')} />
      </div>

      <Toolbar>
        <Field label="Ver">
          <Select value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)}>
            {FILTROS.map((o) => (
              <option key={o.v} value={o.v}>{o.label}</option>
            ))}
          </Select>
        </Field>
        <Button variant="outline" onClick={() => void refrescar()} disabled={cargando}>
          {cargando ? 'Cargando…' : 'Traer de TiendaNube'}
        </Button>
        {!puedePublicar && <Badge tone="neutral">Sólo podés cargar el insumo</Badge>}
      </Toolbar>

      {cargando && !productos.length && <Card>Cargando el catálogo…</Card>}

      {!cargando && !lista.length && (
        <EmptyState title="No queda ninguno acá" hint="Probá con otro filtro." />
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        {lista.slice(0, 200).map((p) => (
          <FilaProducto
            key={p.id}
            p={p}
            fila={cola[p.id]}
            abierto={abierto === p.id}
            onAbrir={() => setAbierto(abierto === p.id ? null : p.id)}
            puedePublicar={puedePublicar}
            onRedactar={(modelo, insumo) =>
              redactar({
                tn_id: p.id,
                nombre: p.name,
                insumo,
                variantes: p.variantes,
                categorias: p.categories,
                prosaActual: p.prosa.texto,
                imagen: p.imagenes[0]?.src || null,
                modelo,
              })
            }
            onPublicar={async (conservarResiduo) => {
              const { error: err, verificado } = await publicar(p.id, conservarResiduo)
              if (err) toast.error(err)
              else if (verificado) toast.ok('Publicado en la tienda.')
              // ⛔ El PUT dio 200 y la relectura no coincidió: no se dice «listo».
              else toast.error('Se escribió, pero la relectura no coincide. Miralo en la tienda.')
              return err
            }}
            onGuardar={async (cuerpo) => {
              const err = await guardar({ tn_id: p.id, nombre: p.name, ...cuerpo })
              toast[err ? 'error' : 'ok'](err || 'Guardado.')
              return err
            }}
          />
        ))}
      </div>
      {lista.length > 200 && <Notice tone="neutral">Se muestran 200 de {lista.length}. Afiná el filtro.</Notice>}
    </div>
  )
}

function FilaProducto({
  p, fila, abierto, onAbrir, puedePublicar, onRedactar, onGuardar, onPublicar,
}: {
  p: ProductoTn
  fila: FilaCola | undefined
  abierto: boolean
  onAbrir: () => void
  puedePublicar: boolean
  onRedactar: (modelo: string, insumo: string) => Promise<ResultadoIA>
  onGuardar: (cuerpo: Record<string, unknown>) => Promise<string | null>
  onPublicar: (conservarResiduo: boolean) => Promise<string | null>
}) {
  const [insumo, setInsumo] = useState(fila?.insumo || '')
  const [borrador, setBorrador] = useState<Borrador>(fila?.borrador || BORRADOR_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [modelo, setModelo] = useState<string>(MODELO_POR_DEFECTO)
  const [redactando, setRedactando] = useState(false)
  const [ia, setIa] = useState<ResultadoIA | null>(null)
  const [conservarResiduo, setConservarResiduo] = useState(true)
  const [publicando, setPublicando] = useState(false)

  /**
   * Lo que hay hoy en la ficha además de la prosa nuestra: la prosa vieja sin marcar y los
   * `<img>` (19 de los 369 publicados tienen uno). Se muestra para que quien publica DECIDA:
   * el default conserva, y tirarlo es un tilde que hay que sacar a mano.
   * ⚠️ Sale del catálogo cacheado, así que es orientativo: la composición de verdad la hace el
   * servidor sobre la descripción fresca.
   */
  const partes = useMemo(() => partir(p.raw_desc), [p.raw_desc])

  const problemas = useMemo(
    () => validarBorrador(borrador, { variantes: p.variantes, insumo, nombre: p.name }),
    [borrador, p.variantes, p.name, insumo],
  )
  const vacio = !borrador.parrafo.trim() && borrador.bullets.every((b) => !b.texto.trim())

  const setBullet = (i: number, campo: 'etiqueta' | 'texto', v: string) =>
    setBorrador((b) => ({ ...b, bullets: b.bullets.map((x, j) => (j === i ? { ...x, [campo]: v } : x)) }))

  /**
   * 🔑 El insumo que se le manda al modelo es el del CAMPO, no el guardado: si alguien acaba
   * de tipear «gasa» y todavía no apretó «Guardar el insumo», redactar sin eso pediría el
   * texto sin el único dato que hace falta — y la regla de la tela lo dejaría sin bullet.
   */
  const pedirIa = async () => {
    setRedactando(true)
    const r = await onRedactar(modelo, insumo)
    setRedactando(false)
    setIa(r)
    if (r.borrador) setBorrador(r.borrador)
  }

  const correr = async (cuerpo: Record<string, unknown>) => {
    setGuardando(true)
    await onGuardar(cuerpo)
    setGuardando(false)
  }

  return (
    <Card>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer' }} onClick={onAbrir}>
        {p.imagenes[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imagenes[0].src} alt="" width={44} height={55} style={{ objectFit: 'cover', borderRadius: 4 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <b>{p.name}</b>
          <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
            {p.prosa.banda === 'nada' ? 'sin una palabra' : `${p.prosa.largo} caracteres`}
            {p.categories.length > 0 && ` · ${p.categories.join(' / ')}`}
          </div>
        </div>
        <span style={{ display: 'inline-flex', gap: 4 }}>
          {p.prosa.banda === 'nada' && <Badge tone="danger">Sin descripción</Badge>}
          {p.prosa.banda === 'corta' && <Badge tone="warning">Corta</Badge>}
          {fila?.estado === 'aprobado' && <Badge tone="success">Aprobado</Badge>}
          {fila?.estado === 'escrito' && <Badge tone={fila.verificado ? 'success' : 'warning'}>{fila.verificado ? 'En la tienda' : 'Escrito sin verificar'}</Badge>}
          {fila?.estado === 'escribiendo' && <Badge tone="warning">Quedó a medias</Badge>}
          {fila?.estado === 'falla' && <Badge tone="danger">No se pudo publicar</Badge>}
          {fila?.estado === 'borrador' && <Badge tone="neutral">Borrador</Badge>}
          {!!(fila?.insumo || '').trim() && fila?.estado !== 'aprobado' && <Badge tone="neutral">Con insumo</Badge>}
        </span>
      </div>

      {abierto && (
        <div style={{ marginTop: 14, display: 'grid', gap: 14 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Lo que dice hoy en la tienda</div>
            <div style={{ fontSize: 13, color: p.prosa.largo ? '#222' : '#a00', background: '#fafafa', padding: 10, borderRadius: 6 }}>
              {p.prosa.texto || '(nada)'}
            </div>
          </div>

          <Field label="Insumo del local" hint="3 o 4 palabras: la tela y el detalle que la foto no dice. Ej: «gasa, botones nacarados».">
            <Input value={insumo} onChange={(e) => setInsumo(e.target.value)} placeholder="gasa, botones nacarados" />
          </Field>
          <div>
            <Button size="sm" disabled={guardando} onClick={() => void correr({ op: 'insumo', insumo })}>
              Guardar el insumo
            </Button>
          </div>

          {puedePublicar && (
            <>
              <hr style={{ border: 0, borderTop: '1px solid #eee' }} />

              <Toolbar>
                <Field label="Modelo">
                  <Select value={modelo} onChange={(e) => setModelo(e.target.value)} style={{ width: 150 }}>
                    {Object.entries(MODELOS).map(([id, m]) => (
                      <option key={id} value={id}>{(m as { nombre: string }).nombre}</option>
                    ))}
                  </Select>
                </Field>
                <Button size="sm" variant="outline" disabled={redactando} onClick={() => void pedirIa()}>
                  {redactando ? 'Redactando…' : 'Redactar con IA'}
                </Button>
                {ia && !ia.error && (
                  <span style={{ fontSize: 12, color: '#666' }}>
                    {ia.modeloNombre} · {ia.intentos === 1 ? 'un intento' : `${ia.intentos} intentos`} ·{' '}
                    <b>US${ia.costo.toFixed(4)}</b>
                  </span>
                )}
              </Toolbar>
              {ia?.error && <Notice tone="danger">{ia.error}</Notice>}

              <Field label={`Párrafo (máximo ${MAX_PARRAFO})`} hint="Una o dos frases. No nombres colores ni talles: los muestra el selector de variantes.">
                <Input value={borrador.parrafo} onChange={(e) => setBorrador((b) => ({ ...b, parrafo: e.target.value }))} />
              </Field>

              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>
                  Bullets ({MIN_BULLETS} a {MAX_BULLETS}, máximo {MAX_BULLET} caracteres cada uno)
                </div>
                {borrador.bullets.map((b, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8 }}>
                    <Select value={b.etiqueta} onChange={(e) => setBullet(i, 'etiqueta', e.target.value)} style={{ width: 130 }}>
                      {ETIQUETAS.map((et) => (
                        <option key={et} value={et}>{et}</option>
                      ))}
                    </Select>
                    <Input value={b.texto} onChange={(e) => setBullet(i, 'texto', e.target.value)} placeholder="gasa liviana con caída" />
                    <Button variant="ghost" size="sm" onClick={() => setBorrador((x) => ({ ...x, bullets: x.bullets.filter((_, j) => j !== i) }))}>
                      ✕
                    </Button>
                  </div>
                ))}
                {borrador.bullets.length < MAX_BULLETS && (
                  <div>
                    <Button variant="ghost" size="sm" onClick={() => setBorrador((x) => ({ ...x, bullets: [...x.bullets, { etiqueta: 'Detalle', texto: '' }] }))}>
                      + Agregar bullet
                    </Button>
                  </div>
                )}
              </div>

              {!vacio && problemas.length > 0 && (
                <Notice tone="warning">
                  <b>Falta corregir:</b>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    {problemas.map((x, i) => (
                      <li key={i}>
                        <b>{x.campo}</b>: {x.motivo}
                      </li>
                    ))}
                  </ul>
                </Notice>
              )}

              {!vacio && problemas.length === 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Cómo va a quedar</div>
                  <div
                    style={{ border: '1px solid #eee', borderRadius: 6, padding: 10 }}
                    dangerouslySetInnerHTML={{ __html: generarHtml(borrador) }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <Button size="sm" variant="outline" disabled={guardando || vacio} onClick={() => void correr({ op: 'borrador', borrador })}>
                  Guardar el borrador
                </Button>
                <Button
                  size="sm"
                  disabled={guardando || vacio || problemas.length > 0 || !fila?.borrador}
                  onClick={() => void correr({ op: 'aprobar' })}
                >
                  Aprobar
                </Button>
              </div>
              {!fila?.borrador && !vacio && (
                <div style={{ fontSize: 12, color: '#666' }}>Para aprobar, primero guardá el borrador.</div>
              )}

              {/* ── El único botón que sale a la tienda en vivo ── */}
              {(fila?.estado === 'aprobado' || fila?.estado === 'escrito' || fila?.estado === 'falla' || fila?.estado === 'escribiendo') && (
                <>
                  <hr style={{ border: 0, borderTop: '1px solid #eee' }} />

                  {fila.estado === 'escribiendo' && (
                    <Notice tone="warning">
                      Esta ficha quedó <b>a medias</b>: se guardó el respaldo y no llegó la confirmación de
                      la tienda. Mirá cómo está en TiendaNube antes de volver a publicar.
                    </Notice>
                  )}
                  {fila.estado === 'falla' && <Notice tone="danger">{fila.error || 'No se pudo publicar.'}</Notice>}
                  {fila.estado === 'escrito' && (
                    <Notice tone={fila.verificado ? 'success' : 'warning'}>
                      {fila.verificado
                        ? `Publicado${fila.escrito_at ? ' el ' + new Date(fila.escrito_at).toLocaleString('es-AR') : ''}. El texto anterior quedó guardado acá.`
                        : 'Se escribió, pero al releerla no coincidía con lo que se mandó. Miralo en la tienda.'}
                    </Notice>
                  )}

                  {/* 🔴 Los `<img>` y la prosa vieja se conservan salvo que alguien lo destilde
                      a mano: TiendaNube no tiene historial, así que un descarte por default
                      sería irreversible y silencioso. La tabla de talles NO se toca nunca. */}
                  {!!partes.residuo && (
                    <div>
                      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}>
                        <input
                          type="checkbox"
                          checked={conservarResiduo}
                          onChange={(e) => setConservarResiduo(e.target.checked)}
                          style={{ marginTop: 3 }}
                        />
                        <span>
                          Conservar lo que ya había en la ficha además de la tabla de talles
                          {partes.residuo.includes('<img') && <b> (incluye una imagen)</b>}. Si lo
                          destildás, eso <b>se pierde</b>: TiendaNube no guarda el texto anterior.
                          <div style={{ fontSize: 12, color: '#666', background: '#fafafa', padding: 8, borderRadius: 6, marginTop: 6, maxHeight: 90, overflow: 'auto' }}>
                            {partes.residuo}
                          </div>
                        </span>
                      </label>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Button
                      size="sm"
                      disabled={publicando}
                      onClick={() => {
                        void (async () => {
                          setPublicando(true)
                          await onPublicar(conservarResiduo)
                          setPublicando(false)
                        })()
                      }}
                    >
                      {publicando ? 'Publicando…' : fila.estado === 'aprobado' ? 'Publicar en la tienda' : 'Volver a publicar'}
                    </Button>
                    <span style={{ fontSize: 12, color: '#666' }}>
                      La tabla de talles se conserva siempre. El texto anterior se guarda antes de pisarlo.
                    </span>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  )
}
