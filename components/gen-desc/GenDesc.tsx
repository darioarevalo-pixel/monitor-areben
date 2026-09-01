'use client'

import { useMemo, useState } from 'react'
import {
  Badge, Button, Card, EmptyState, Field, Input, KpiCard, Lightbox, Notice, Select, Toolbar, useToast,
} from '@/components/ui'
import { useSesion } from '@/components/SesionProvider'
import { useGenDesc, type FilaCola, type ProductoTn, type ResultadoIA } from './useGenDesc'
import { partir } from '@/lib/tn-desc/bloques'
import { MODELOS, MODELO_POR_DEFECTO } from '@/lib/tn-desc/redactor.core.js'
import { MAX_PARRAFO, generarHtml, validarParrafo } from '@/lib/tn-desc/formato'
import { FAMILIAS, NO_APLICA, atributosDe, atributosExtra, bulletsDe, cargadosDe, opcionesDe, type Atributo, type Cargados, type Familia, type OpcionesAtributo } from '@/lib/tn-desc/atributos'

/**
 * Redacción: la ficha de cada prenda y el párrafo que la vende.
 *
 * Medido contra Zattia el 27-ago-2026 (328 publicados): **44 sin una palabra** —casi todos de las
 * dos últimas tandas, o sea los ingresos— y **194 con menos de 120 caracteres**.
 *
 * 🔑 **Desde el 27-ago-2026 esta pantalla tiene dos mitades y dos manos.** Arriba, la FICHA:
 * seis desplegables con lista cerrada que carga el local, y de los que salen los bullets solos.
 * Abajo, el PÁRRAFO: lo único que sigue escribiendo un modelo, y lo único que hay que validar.
 * Antes los bullets también los escribía el modelo y los sostenía un validador — una etiqueta
 * repetida o una tela inventada eran cosas que podían pasar. Ahora no pueden.
 *
 * 🔴 «Publicar en la tienda» sigue siendo el único botón que sale a la tienda en vivo, de a un
 * producto y sólo sobre un borrador aprobado. El navegador no compone ni escribe: el servidor lee
 * fresco, respalda, escribe con compare-and-swap y relee.
 */

type Filtro = 'ultimas-tandas' | 'sin-desc' | 'sin-ficha' | 'corta' | 'aprobados' | 'en-la-tienda' | 'todos'

const FILTROS: { v: Filtro; label: string }[] = [
  { v: 'ultimas-tandas', label: 'Últimas 2 tandas' },
  { v: 'sin-desc', label: 'Sin descripción' },
  { v: 'sin-ficha', label: 'Sin ficha cargada' },
  { v: 'corta', label: 'Descripción corta' },
  { v: 'aprobados', label: 'Aprobados' },
  { v: 'en-la-tienda', label: 'Publicados en la tienda' },
  { v: 'todos', label: 'Todos los publicados' },
]

/**
 * Las fechas de alta de las dos últimas tandas.
 *
 * 🔑 Se calcula por **fechas distintas de alta** y no por «los últimos 14 días»: la mercadería
 * entra de golpe, no de a poco. Medido el 27-ago-2026: de dos semanas para acá no había entrado
 * NINGUNO, y los 41 mudos recientes eran dos tandas, de hace 15 y 27 días. Un umbral en días
 * habría mostrado una lista vacía justo el día que había 41 productos para cargar.
 */
function ultimasTandas(productos: ProductoTn[], cuantas = 2): Set<string> {
  const fechas = [...new Set(productos.map((p) => p.created_at.slice(0, 10)).filter(Boolean))]
  return new Set(fechas.sort().reverse().slice(0, cuantas))
}

export function GenDesc() {
  // La marca sale de la sesión, no de una prop: así entra al registro de secciones como
  // cualquier otra pantalla (el molde es `GenTalles`).
  const { marca } = useSesion()
  const { cargando, productos, cola, atributos, puedePublicar, error, refrescar, guardar, guardarAtributo, guardarFamilia, redactar, publicar } = useGenDesc(marca)
  const [filtro, setFiltro] = useState<Filtro>('ultimas-tandas')
  const [abierto, setAbierto] = useState<string | null>(null)
  const toast = useToast()

  const publicados = useMemo(() => productos.filter((p) => p.published), [productos])
  const tandas = useMemo(() => ultimasTandas(publicados), [publicados])
  /**
   * 🔑 La categoría de TiendaNube GANA sobre la elegida a mano: si mañana alguien se la pone, la
   * familia se corrige sola. Lo elegido a mano es el piso para los dos productos que no tienen
   * ninguna, no una segunda fuente que compita con la tienda.
   */
  const familiaDeProducto = (p: ProductoTn): Familia | null => p.familia ?? cola[p.id]?.familia ?? null
  const sinFicha = (p: ProductoTn) => !!familiaDeProducto(p) && !Object.keys(atributos[p.id] || {}).length

  const stats = useMemo(
    () => ({
      ultimas: publicados.filter((p) => tandas.has(p.created_at.slice(0, 10))).length,
      sinDesc: publicados.filter((p) => p.prosa.banda === 'nada').length,
      sinFicha: publicados.filter(sinFicha).length,
      aprobados: publicados.filter((p) => cola[p.id]?.estado === 'aprobado').length,
      enLaTienda: publicados.filter((p) => cola[p.id]?.estado === 'escrito').length,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [publicados, cola, atributos, tandas],
  )

  const lista = useMemo(() => {
    const f = publicados.filter((p) => {
      const fila = cola[p.id]
      if (filtro === 'ultimas-tandas') return tandas.has(p.created_at.slice(0, 10))
      if (filtro === 'sin-desc') return p.prosa.banda === 'nada'
      if (filtro === 'sin-ficha') return sinFicha(p)
      if (filtro === 'corta') return p.prosa.banda === 'corta'
      if (filtro === 'aprobados') return fila?.estado === 'aprobado'
      if (filtro === 'en-la-tienda') return fila?.estado === 'escrito' || fila?.estado === 'falla'
      return true
    })
    // Primero los mudos: son los que hoy salen a la calle sin decir nada.
    return f.sort((a, b) => a.prosa.largo - b.prosa.largo || a.name.localeCompare(b.name))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicados, cola, atributos, filtro, tandas])

  if (error) return <Notice tone="danger">{error}</Notice>

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Notice tone="neutral">
        Primero se carga la <b>ficha</b> de la prenda —tela, calce, escote, manga, largo— eligiendo
        de una lista. De ahí salen solos los datos que se leen abajo de la descripción. Después se
        escribe el <b>párrafo</b>, y recién cuando está aprobado aparece el botón de publicar, que
        escribe en la tienda de a un producto y guarda el texto anterior antes de pisarlo.
      </Notice>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
        <KpiCard label="Últimas 2 tandas" value={stats.ultimas} tone="neutral" activo={filtro === 'ultimas-tandas'} onClick={() => setFiltro('ultimas-tandas')} />
        <KpiCard label="Sin descripción" value={stats.sinDesc} tone="danger" activo={filtro === 'sin-desc'} onClick={() => setFiltro('sin-desc')} />
        <KpiCard label="Sin ficha cargada" value={stats.sinFicha} tone="warning" activo={filtro === 'sin-ficha'} onClick={() => setFiltro('sin-ficha')} />
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
          {cargando ? 'Cargando…' : 'Cargar de TiendaNube'}
        </Button>
        {!puedePublicar && <Badge tone="neutral">Cargás la ficha; el texto lo escribe Marketing</Badge>}
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
            ficha={atributos[p.id] || {}}
            abierto={abierto === p.id}
            onAbrir={() => setAbierto(abierto === p.id ? null : p.id)}
            puedePublicar={puedePublicar}
            familia={familiaDeProducto(p)}
            onFamilia={async (familia) => {
              const err = await guardarFamilia(p.id, familia, p.name)
              if (err) toast.error(err)
              return err
            }}
            onAtributo={async (atributo, valor) => {
              const familia = familiaDeProducto(p)
              if (!familia) return 'Elegí primero qué prenda es.'
              const err = await guardarAtributo(p.id, familia, atributo, valor, p.name)
              if (err) toast.error(err)
              return err
            }}
            onRedactar={(modelo, insumo, bullets) =>
              redactar({
                tn_id: p.id,
                nombre: p.name,
                insumo,
                variantes: p.variantes,
                categorias: p.categories,
                prosaActual: p.prosa.texto,
                imagen: p.imagenes[0]?.src || null,
                bullets,
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
  p, fila, ficha, familia, abierto, onAbrir, puedePublicar, onFamilia, onAtributo, onRedactar, onGuardar, onPublicar,
}: {
  p: ProductoTn
  fila: FilaCola | undefined
  ficha: Cargados
  /** La de TiendaNube, o la que eligió alguien a mano. `null` = todavía no se sabe qué prenda es. */
  familia: Familia | null
  abierto: boolean
  onAbrir: () => void
  puedePublicar: boolean
  onFamilia: (familia: Familia) => Promise<string | null>
  onAtributo: (atributo: Atributo, valor: string) => Promise<string | null>
  onRedactar: (modelo: string, insumo: string, bullets: { etiqueta: string; texto: string }[]) => Promise<ResultadoIA>
  onGuardar: (cuerpo: Record<string, unknown>) => Promise<string | null>
  onPublicar: (conservarResiduo: boolean) => Promise<string | null>
}) {
  const [insumo, setInsumo] = useState(fila?.insumo || '')
  const [parrafo, setParrafo] = useState(fila?.borrador?.parrafo || '')
  const [guardando, setGuardando] = useState(false)
  const [modelo, setModelo] = useState<string>(MODELO_POR_DEFECTO)
  const [redactando, setRedactando] = useState(false)
  const [ia, setIa] = useState<ResultadoIA | null>(null)
  const [conservarResiduo, setConservarResiduo] = useState(true)
  const [publicando, setPublicando] = useState(false)
  // La foto que se está mirando en grande. Es de la fila y no de la sección: se abre con la
  // ficha delante, que es el momento en que hace falta.
  const [foto, setFoto] = useState<string | null>(null)

  /**
   * Lo que hay hoy en la ficha además de la prosa nuestra: la prosa vieja sin marcar y los
   * `<img>` (19 de los 369 publicados tienen uno). Se muestra para que quien publica DECIDA:
   * el default conserva, y tirarlo es un tilde que hay que sacar a mano.
   * ⚠️ Sale del catálogo cacheado, así que es orientativo: la composición de verdad la hace el
   * servidor sobre la descripción fresca.
   */
  const partes = useMemo(() => partir(p.raw_desc), [p.raw_desc])

  /** 🔑 Los mismos bullets que va a componer el servidor al publicar: una sola implementación. */
  const bullets = useMemo(() => bulletsDe(familia, ficha), [familia, ficha])
  const campos = useMemo(() => atributosDe(familia), [familia])
  const cuenta = useMemo(() => cargadosDe(familia, ficha), [familia, ficha])
  /**
   * Los atributos que la familia NO pide. Se dibujan sólo los que ya tienen valor, más el que se
   * sume a mano: la lista entera arriba de la ficha convertiría el «+ agregar un dato» en seis
   * campos más que nadie pidió.
   */
  const extras = useMemo(() => atributosExtra(familia), [familia])
  const [sumado, setSumado] = useState<Atributo[]>([])
  const extrasVisibles = useMemo(
    () => extras.filter((a) => sumado.includes(a.key as Atributo) || String(ficha[a.key as Atributo] || '').trim()),
    [extras, sumado, ficha],
  )

  const problemas = useMemo(
    () => validarParrafo(parrafo, { variantes: p.variantes, nombre: p.name, bullets }),
    [parrafo, p.variantes, p.name, bullets],
  )
  const vacio = !parrafo.trim()

  /**
   * 🔑 El insumo que se le manda al modelo es el del CAMPO, no el guardado: si alguien acaba
   * de tipear «gasa» y todavía no apretó «Guardar el insumo», redactar sin eso pediría el
   * texto sin el único dato que hace falta.
   */
  const pedirIa = async () => {
    setRedactando(true)
    const r = await onRedactar(modelo, insumo, bullets)
    setRedactando(false)
    setIa(r)
    if (r.borrador?.parrafo) setParrafo(r.borrador.parrafo)
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
          {/* La ficha primero: es lo que hay que cargar y lo que le falta a la mayoría. */}
          {familia
            ? <Badge tone={cuenta.con === 0 ? 'warning' : cuenta.con === cuenta.total ? 'success' : 'neutral'}>Ficha {cuenta.con}/{cuenta.total}</Badge>
            : <Badge tone="warning">Falta decir qué prenda es</Badge>}
          {p.prosa.banda === 'nada' && <Badge tone="danger">Sin descripción</Badge>}
          {p.prosa.banda === 'corta' && <Badge tone="warning">Corta</Badge>}
          {fila?.estado === 'aprobado' && <Badge tone="success">Aprobado</Badge>}
          {fila?.estado === 'escrito' && <Badge tone={fila.verificado ? 'success' : 'warning'}>{fila.verificado ? 'En la tienda' : 'Escrito sin verificar'}</Badge>}
          {fila?.estado === 'escribiendo' && <Badge tone="warning">Quedó a medias</Badge>}
          {fila?.estado === 'falla' && <Badge tone="danger">No se pudo publicar</Badge>}
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

          {/* 🔑 Van TODAS las fotos y no sólo la portada: el tajo, el botón, el escote de atrás o
              el largo real casi nunca están en la primera, y son justo lo que hay que mirar para
              contestar la ficha. La miniatura del encabezado no sirve —44×55 px y su clic abre la
              fila—, así que la tira vive acá adentro, al lado de los campos que se cargan. */}
          {p.imagenes.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                Las fotos del producto <span style={{ fontWeight: 400, color: '#666' }}>· tocá una para verla en grande</span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {p.imagenes.map((im) => (
                  <button
                    key={im.id}
                    type="button"
                    onClick={() => setFoto(im.src)}
                    title="Ver en grande"
                    style={{ padding: 0, border: '1px solid #ddd', borderRadius: 6, background: 'none', cursor: 'zoom-in', lineHeight: 0 }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={im.src} alt="" width={72} height={90} style={{ objectFit: 'cover', borderRadius: 5, display: 'block' }} />
                  </button>
                ))}
              </div>
            </div>
          )}
          <Lightbox src={foto} alt={p.name} onCerrar={() => setFoto(null)} />

          {/* ── La ficha: la carga el local y de acá salen los bullets ── */}
          {!familia ? (
            <div>
              <Notice tone="warning">
                Este producto no tiene categoría en TiendaNube (sólo «{p.categories.join(' / ') || 'ninguna'}»),
                así que la ficha no sabe qué preguntarle. <b>Decile qué prenda es</b> y aparecen los campos.
                Conviene igual ponerle la categoría en la tienda.
              </Notice>
              <div style={{ marginTop: 10, maxWidth: 320 }}>
                <Field label="¿Qué prenda es?">
                  <Select value="" onChange={(ev) => { const v = ev.target.value as Familia; if (v) void onFamilia(v) }}>
                    <option value="">— elegí —</option>
                    {Object.entries(FAMILIAS).map(([k, f]) => (
                      <option key={k} value={k}>{(f as { label: string }).label}</option>
                    ))}
                  </Select>
                </Field>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>La ficha de la prenda</div>
                <span style={{ fontSize: 12, color: '#666' }}>
                  {cuenta.con} de {cuenta.total} · se guarda al elegir
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 10 }}>
                {campos.map((a) => (
                  <CampoAtributo
                    key={a.key}
                    label={a.label}
                    libre={a.libre}
                    opciones={familia ? opcionesDe(familia, a.key) : null}
                    valor={ficha[a.key] || ''}
                    onElegir={(v) => onAtributo(a.key, v)}
                  />
                ))}
                {extrasVisibles.map((a) => (
                  <CampoAtributo
                    key={a.key}
                    label={a.label}
                    prestado
                    libre={a.libre}
                    opciones={familia ? opcionesDe(familia, a.key) : null}
                    valor={ficha[a.key] || ''}
                    onElegir={(v) => onAtributo(a.key, v)}
                  />
                ))}
              </div>
              {/* 🔑 «+ agregar un dato»: lo pidió Bruno el 1-sep-2026. Un short que cae en la
                  familia `faldas` puede necesitar declarar su silueta, y agrandar la lista de
                  TODA la familia por un producto le pregunta a las otras 39 algo que no les toca. */}
              {extras.filter((a) => !extrasVisibles.some((v) => v.key === a.key)).length > 0 && (
                <div style={{ marginTop: 10, maxWidth: 260 }}>
                  <Select
                    value=""
                    onChange={(ev) => {
                      const k = ev.target.value as Atributo
                      if (k) setSumado((prev) => (prev.includes(k) ? prev : [...prev, k]))
                    }}
                  >
                    <option value="">+ agregar un dato de otra prenda</option>
                    {extras
                      .filter((a) => !extrasVisibles.some((v) => v.key === a.key))
                      .map((a) => (
                        <option key={a.key} value={a.key}>{a.label}</option>
                      ))}
                  </Select>
                </div>
              )}
            </div>
          )}

          <Field label="Insumo del local" hint="Lo que no entra en ningún campo y ayuda a escribir el párrafo. Ej: «llega esta semana, va con la campera Alpes».">
            <Input value={insumo} onChange={(e) => setInsumo(e.target.value)} placeholder="opcional" />
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
                  {redactando ? 'Redactando…' : 'Escribir el párrafo con IA'}
                </Button>
                {ia && !ia.error && (
                  <span style={{ fontSize: 12, color: '#666' }}>
                    {ia.modeloNombre} · {ia.intentos === 1 ? 'un intento' : `${ia.intentos} intentos`} ·{' '}
                    <b>US${ia.costo.toFixed(4)}</b>
                  </span>
                )}
              </Toolbar>
              {ia?.error && <Notice tone="danger">{ia.error}</Notice>}

              <Field
                label={`Párrafo (${parrafo.trim().length} de ${MAX_PARRAFO})`}
                hint="Arranca nombrando la prenda. No repitas lo que ya dicen los datos de la ficha."
              >
                <Input value={parrafo} onChange={(e) => setParrafo(e.target.value)} />
              </Field>

              {!vacio && problemas.length > 0 && (
                <Notice tone="warning">
                  <b>Falta corregir:</b>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    {problemas.map((x, i) => (
                      <li key={i}>{x.motivo}</li>
                    ))}
                  </ul>
                </Notice>
              )}

              {!vacio && problemas.length === 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Cómo va a quedar</div>
                  <div
                    style={{ border: '1px solid #eee', borderRadius: 6, padding: 10 }}
                    dangerouslySetInnerHTML={{ __html: generarHtml({ parrafo, bullets }) }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <Button size="sm" variant="outline" disabled={guardando || vacio} onClick={() => void correr({ op: 'borrador', borrador: { parrafo, bullets } })}>
                  Guardar el párrafo
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
                <div style={{ fontSize: 12, color: '#666' }}>Para aprobar, primero guardá el párrafo.</div>
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

/**
 * Un campo de la ficha. Guarda **al elegir** y muestra el estado del guardado en el mismo lugar
 * donde se eligió — no en un toast que tapa otra cosa y se va.
 *
 * ⚠️ El valor que se dibuja es el que confirmó el servidor (llega por prop), no el del `<select>`:
 * si el guardado falla, el desplegable vuelve solo a lo que está guardado de verdad, en vez de
 * quedar mostrando una elección que no existe en ningún lado.
 */
function CampoAtributo({
  label, opciones, valor, libre, prestado = false, onElegir,
}: {
  label: string
  opciones: OpcionesAtributo | null
  valor: string
  libre: boolean
  /** Un atributo que la familia no pide y alguien sumó a mano: se rotula para que se note. */
  prestado?: boolean
  onElegir: (v: string) => Promise<string | null>
}) {
  const [guardando, setGuardando] = useState(false)
  const [texto, setTexto] = useState(valor)

  const mandar = async (v: string) => {
    setGuardando(true)
    await onElegir(v)
    setGuardando(false)
  }

  if (libre) {
    return (
      <Field label={label} hint="Texto libre. No entra en ningún conteo.">
        <Input
          value={texto}
          disabled={guardando}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={() => { if (texto.trim() !== valor) void mandar(texto.trim()) }}
          placeholder="argolla plateada en el medio"
        />
      </Field>
    )
  }

  const propios = opciones?.propios || []
  const prestados = opciones?.prestados || []
  return (
    <Field label={prestado ? `${label} · de otra prenda` : label}>
      <Select value={valor} disabled={guardando} onChange={(e) => void mandar(e.target.value)}>
        <option value="">— sin cargar —</option>
        {propios.map((v) => (
          <option key={v} value={v}>{v}</option>
        ))}
        {/* 🔑 Los prestados van en su propio grupo y ABAJO: la palabra de la familia se elige
            primero, que es la que va a estar bien el 95% de las veces. Poner las 12 juntas es
            hacer que el que carga tenga que leer todas para encontrar la suya. */}
        {prestados.length > 0 && (
          <optgroup label="de otras prendas">
            {prestados.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </optgroup>
        )}
        {/* ⛔ Último, y separado: «no aplica» es una respuesta, no un valor de venta. */}
        {opciones?.noAplica && <option value={NO_APLICA}>{NO_APLICA}</option>}
      </Select>
    </Field>
  )
}
