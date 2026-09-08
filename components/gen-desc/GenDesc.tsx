'use client'

import { useMemo, useState } from 'react'
import {
  Badge, Button, Card, color, EmptyState, Field, font, Input, KpiCard, Lightbox, Notice, Select, Tabs, Toolbar, useToast,
} from '@/components/ui'
import { useSesion } from '@/components/SesionProvider'
import { useGenDesc, type FilaCola, type ProductoTn, type ResultadoIA } from './useGenDesc'
import { partir } from '@/lib/tn-desc/bloques'
import { MODELOS, MODELO_POR_DEFECTO } from '@/lib/tn-desc/redactor.core.js'
import { MAX_PARRAFO, MAX_TIP, generarHtml, validarParrafo, validarTip, type Chivato } from '@/lib/tn-desc/formato'
import { ATRIBUTOS, FAMILIAS, MAX_PROPUESTA, NO_APLICA, NO_SE, atributosDe, atributosExtra, bulletsDe, cargadosDe, esPalabraPropuesta, opcionesDe, sinTela, type Atributo, type Cargados, type Familia, type OpcionesAtributo } from '@/lib/tn-desc/atributos'
import { GRUPOS, cuidadosDe } from '@/lib/tn-desc/cuidados.core.js'
import { familiaDeProducto, listaDe, paraRevisar, paraVolverAMirar, sinFicha, ultimasTandas, type Filtro } from '@/lib/tn-desc/lista.core'
import { ESTIRA, TELAS_QUE_ESTIRAN, contestadasDe, medidasDe, tallesDe, type Medida, type Medidas } from '@/lib/tn-medidas/medidas'
import { fraseDeModelo, modeloDeProducto, resumenDeModelo, type TalleDeModelo } from '@/lib/sesionfotos/modelo'

/**
 * Descripción y medidas: la ficha de cada prenda y el párrafo que la vende.
 *
 * ⚠️ **Se llamaba «Redacción» hasta el 1-sep-2026 y lo renombró Bruno** —«no me gusta que diga
 * redacción»—: la pantalla dejó de ser sólo el párrafo cuando las medidas entraron adentro de la
 * fila. 🔑 **Lo que cambió es el RÓTULO, ⛔ no la key ni la ruta**: `gen-desc` es el permiso que
 * `josefinabatter` y `camilaquintana` ya tienen tildado, y renombrarlo lo destildaría —un permiso
 * que nadie tilda es una pantalla que no ve nadie.
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

const FILTROS: { v: Filtro; label: string }[] = [
  { v: 'ultimas-tandas', label: 'Últimas 2 tandas' },
  { v: 'sin-desc', label: 'Sin descripción' },
  { v: 'sin-ficha', label: 'Sin ficha cargada' },
  { v: 'para-mirar', label: 'Para volver a mirar' },
  { v: 'corta', label: 'Descripción corta' },
  { v: 'borrador', label: 'En borrador' },
  { v: 'aprobados', label: 'Aprobados' },
  { v: 'en-la-tienda', label: 'Publicados en la tienda' },
  { v: 'todos', label: 'Todos los publicados' },
]

export function GenDesc() {
  // La marca sale de la sesión, no de una prop: así entra al registro de secciones como
  // cualquier otra pantalla (el molde es `GenTalles`).
  const { marca } = useSesion()
  const { cargando, productos, cola, atributos, medidas, puedePublicar, modelos, errorModelos, error, refrescar, guardar, guardarAtributo, guardarMedida, marcarSinMedidas, guardarFamilia, redactar, publicar, revisar } = useGenDesc(marca)
  const [filtro, setFiltro] = useState<Filtro>('ultimas-tandas')
  const [busca, setBusca] = useState('')
  const [abierto, setAbierto] = useState<string | null>(null)
  /**
   * 🆕 **Las dos manos de esta pantalla, separadas** (7-sep-2026, veredicto de Bruno). «Cargar» es
   * la de siempre: buscar una prenda, abrirla, completar la ficha y las medidas. «Revisar» es la
   * otra tarea —mirar la foto contra lo que se va a publicar y sacarlo— y necesita lo contrario:
   * todo abierto, todo junto, y un botón.
   */
  const [vista, setVista] = useState<'cargar' | 'revisar'>('cargar')
  /** 🔴 Los que se publicaron en esta visita: se quedan en la pantalla de revisión. Ver `paraRevisar`. */
  const [retenidos, setRetenidos] = useState<Set<string>>(new Set())
  const toast = useToast()

  const publicados = useMemo(() => productos.filter((p) => p.published), [productos])
  const tandas = useMemo(() => ultimasTandas(publicados), [publicados])
  const familiaDe = (p: ProductoTn): Familia | null => familiaDeProducto(p, cola[p.id])

  const stats = useMemo(
    () => ({
      ultimas: publicados.filter((p) => tandas.has(p.created_at.slice(0, 10))).length,
      sinDesc: publicados.filter((p) => p.prosa.banda === 'nada').length,
      // ⚠️ El contador cuenta la VERDAD, aunque la lista de abajo se quede con la fila abierta:
      // «5 sin ficha» con 6 filas en pantalla es lo correcto — la 6ª ya tiene algo cargado.
      sinFicha: publicados.filter((p) => sinFicha(p, cola[p.id], atributos[p.id])).length,
      paraMirar: publicados.filter((p) => paraVolverAMirar(atributos[p.id])).length,
      borradores: publicados.filter((p) => cola[p.id]?.estado === 'borrador').length,
      aprobados: publicados.filter((p) => cola[p.id]?.estado === 'aprobado').length,
      enLaTienda: publicados.filter((p) => cola[p.id]?.estado === 'escrito').length,
    }),
    [publicados, cola, atributos, tandas],
  )

  // 🔴 `abierto` entra a la lista: la fila que se está cargando ⛔ NO se va aunque el guardado le
  // haga dejar de cumplir el filtro. La regla —y el porqué, que es un caso real— vive en el núcleo.
  const lista = useMemo(
    () => listaDe(publicados, { filtro, cola, atributos, tandas, abierto, busca }),
    [publicados, cola, atributos, filtro, tandas, abierto, busca],
  )

  const paraLeer = useMemo(
    () => paraRevisar(publicados, { cola, busca, retenidos }),
    [publicados, cola, busca, retenidos],
  )

  /**
   * Guardar un dato de la ficha. Vive acá y ⛔ no adentro de cada tarjeta porque **las dos vistas
   * escriben la misma ficha**: la fila de «Cargar» y la tarjeta de «Revisar» son dos lugares donde
   * se corrige lo mismo, y dos copias de esta función serían dos maneras de que una guarde bien y
   * la otra no.
   */
  const alElegirDato = (p: ProductoTn) => async (atributo: Atributo, valor: string, propuesto?: boolean) => {
    const familia = familiaDe(p)
    if (!familia) return 'Elegí primero qué prenda es.'
    const err = await guardarAtributo(p.id, familia, atributo, valor, p.name, propuesto)
    if (err) toast.error(err)
    return err
  }

  if (error) return <Notice tone="danger">{error}</Notice>

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Notice tone="neutral">
        Primero se carga la <b>ficha</b> de la prenda —tela, calce, escote, manga, largo— eligiendo
        de una lista. De ahí salen solos los datos que se leen abajo de la descripción. Después se
        escribe el <b>párrafo</b>, y recién cuando está aprobado aparece el botón de publicar, que
        escribe en la tienda de a un producto y guarda el texto anterior antes de pisarlo.
      </Notice>

      {/* 🔑 Las dos manos, separadas: cargar es de a una prenda con la prenda en la mano; revisar
          es leer varias seguidas. La pestaña de revisar sólo existe para quien puede publicar. */}
      {puedePublicar && (
        <Tabs
          items={[
            { key: 'cargar', label: 'Cargar y escribir' },
            { key: 'revisar', label: 'Revisar y publicar', badge: stats.borradores + stats.aprobados || undefined },
          ]}
          value={vista}
          onChange={(k) => setVista(k as 'cargar' | 'revisar')}
        />
      )}

      {vista === 'cargar' && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
        <KpiCard label="Últimas 2 tandas" value={stats.ultimas} tone="neutral" activo={filtro === 'ultimas-tandas'} onClick={() => setFiltro('ultimas-tandas')} />
        <KpiCard label="Sin descripción" value={stats.sinDesc} tone="danger" activo={filtro === 'sin-desc'} onClick={() => setFiltro('sin-desc')} />
        <KpiCard label="Sin ficha cargada" value={stats.sinFicha} tone="warning" activo={filtro === 'sin-ficha'} onClick={() => setFiltro('sin-ficha')} />
        <KpiCard label="Para volver a mirar" value={stats.paraMirar} tone="warning" activo={filtro === 'para-mirar'} onClick={() => setFiltro('para-mirar')} />
        <KpiCard label="En borrador" value={stats.borradores} tone="warning" activo={filtro === 'borrador'} onClick={() => setFiltro('borrador')} />
        <KpiCard label="Aprobados" value={stats.aprobados} tone="success" activo={filtro === 'aprobados'} onClick={() => setFiltro('aprobados')} />
        <KpiCard label="En la tienda" value={stats.enLaTienda} tone="success" activo={filtro === 'en-la-tienda'} onClick={() => setFiltro('en-la-tienda')} />
      </div>
      )}

      <Toolbar>
        {vista === 'cargar' && (
          <Field label="Ver">
            <Select value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)}>
              {FILTROS.map((o) => (
                <option key={o.v} value={o.v}>{o.label}</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Buscar">
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nombre del producto"
            style={{ minWidth: 200 }}
          />
        </Field>
        <Button variant="outline" onClick={() => void refrescar()} disabled={cargando}>
          {cargando ? 'Cargando…' : 'Cargar de TiendaNube'}
        </Button>
        {!puedePublicar && <Badge tone="neutral">Cargás la ficha; el texto lo escribe Marketing</Badge>}
      </Toolbar>

      {cargando && !productos.length && <Card>Cargando el catálogo…</Card>}

      {vista === 'cargar' ? (
        <>
      {!cargando && !lista.length && (
        <EmptyState title="No queda ninguno acá" hint={busca ? `Ningún producto se llama «${busca}». Probá con menos letras o borrá la búsqueda.` : 'Probá con otro filtro.'} />
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        {lista.slice(0, 200).map((p) => (
          <FilaProducto
            key={p.id}
            p={p}
            fila={cola[p.id]}
            ficha={atributos[p.id] || {}}
            medidas={medidas[p.id] || {}}
            abierto={abierto === p.id}
            onAbrir={() => setAbierto(abierto === p.id ? null : p.id)}
            puedePublicar={puedePublicar}
            talleModelo={modeloDeProducto(p.skus, modelos)}
            familia={familiaDe(p)}
            onFamilia={async (familia) => {
              const err = await guardarFamilia(p.id, familia, p.name)
              if (err) toast.error(err)
              return err
            }}
            onAtributo={alElegirDato(p)}
            onMedida={async (talle, medida, valor) => {
              const familia = familiaDe(p)
              if (!familia) return 'Elegí primero qué prenda es.'
              const err = await guardarMedida(p.id, familia, atributos[p.id] || {}, talle, medida, valor, p.name)
              if (err) toast.error(err)
              return err
            }}
            onSinMedidas={async (motivo) => {
              const err = await marcarSinMedidas(p.id, motivo, p.name)
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
                // 🆕 Las DOS primeras (8-sep-2026): la portada y la que sigue. Con una sola, el
                // modelo no ve la espalda ni el ruedo — y ahora que además chequea la ficha,
                // marcaría como error lo que sólo estaba fuera del cuadro.
                imagenes: p.imagenes.slice(0, 2).map((im) => im.src),
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
      {/* 🔴 Se dice, y no se traga: sin este cartel «esta prenda no tiene talle de modelo» y «no se
          pudieron leer las sesiones» se ven exactamente igual — un renglón que no está. */}
      {errorModelos && <Notice tone="warning">{errorModelos} El talle de la modelo no se va a ver en ninguna ficha.</Notice>}

      {lista.length > 200 && <Notice tone="neutral">Se muestran 200 de {lista.length}. Afiná el filtro.</Notice>}
        </>
      ) : (
        <>
          <Notice tone="neutral">
            Acá está lo que ya tiene párrafo escrito y todavía no salió a la tienda.
            Mirá <b>la foto</b> contra lo que dicen los datos y el párrafo: se corrige <b>acá mismo</b> —cada dato al
            elegirlo, el párrafo al salir del campo— y <b>Publicar</b> aprueba y escribe en un gesto.
          </Notice>

          {!cargando && !paraLeer.length && (
            <EmptyState
              title="No hay nada esperando que lo miren"
              hint={busca ? `Ningún borrador se llama «${busca}».` : 'Los párrafos se escriben en «Cargar y escribir».'}
            />
          )}

          <div style={{ display: 'grid', gap: 12 }}>
            {paraLeer.slice(0, 60).map((p) => (
              <TarjetaRevision
                key={p.id}
                p={p}
                fila={cola[p.id]}
                ficha={atributos[p.id] || {}}
                familia={familiaDe(p)}
                onAtributo={alElegirDato(p)}
                onGuardarTexto={async (borrador) => {
                  const err = await guardar({ tn_id: p.id, nombre: p.name, op: 'borrador', borrador })
                  if (err) toast.error(err)
                  return err
                }}
                onPublicar={async (borrador, conservarResiduo) => {
                  // 🔴 Se retiene ANTES de publicar: si se retuviera después, entre la respuesta y
                  // el `setState` la tarjeta ya se habría ido de la lista con el estado nuevo.
                  setRetenidos((prev) => (prev.has(p.id) ? prev : new Set(prev).add(p.id)))
                  const { error: err, verificado } = await revisar(p.id, p.name, borrador, conservarResiduo)
                  if (err) toast.error(err)
                  else if (verificado) toast.ok('Publicado en la tienda.')
                  // ⛔ El PUT dio 200 y la relectura no coincidió: no se dice «listo».
                  else toast.error('Se escribió, pero la relectura no coincide. Miralo en la tienda.')
                  return err
                }}
              />
            ))}
          </div>

          {paraLeer.length > 60 && (
            <Notice tone="neutral">Se muestran 60 de {paraLeer.length}. Buscá por nombre.</Notice>
          )}
        </>
      )}
    </div>
  )
}

function FilaProducto({
  p, fila, ficha, medidas, familia, abierto, onAbrir, puedePublicar, talleModelo, onFamilia, onAtributo, onMedida, onSinMedidas, onRedactar, onGuardar, onPublicar,
}: {
  p: ProductoTn
  fila: FilaCola | undefined
  ficha: Cargados
  /** La de TiendaNube, o la que eligió alguien a mano. `null` = todavía no se sabe qué prenda es. */
  familia: Familia | null
  abierto: boolean
  onAbrir: () => void
  puedePublicar: boolean
  /** Qué modelo lo fotografió y qué talle usa. `null` = ninguna sesión de fotos lo tocó. */
  talleModelo: TalleDeModelo | null
  onFamilia: (familia: Familia) => Promise<string | null>
  onAtributo: (atributo: Atributo, valor: string, propuesto?: boolean) => Promise<string | null>
  medidas: Medidas
  onMedida: (talle: string, medida: Medida, valor: string) => Promise<string | null>
  onSinMedidas: (motivo: string) => Promise<string | null>
  onRedactar: (modelo: string, insumo: string, bullets: { etiqueta: string; texto: string }[]) => Promise<ResultadoIA>
  onGuardar: (cuerpo: Record<string, unknown>) => Promise<string | null>
  onPublicar: (conservarResiduo: boolean) => Promise<string | null>
}) {
  const [insumo, setInsumo] = useState(fila?.insumo || '')
  const [parrafo, setParrafo] = useState(fila?.borrador?.parrafo || '')
  const [tip, setTip] = useState(fila?.borrador?.tip || '')
  const [guardando, setGuardando] = useState(false)
  const [modelo, setModelo] = useState<string>(MODELO_POR_DEFECTO)
  const [redactando, setRedactando] = useState(false)
  const [ia, setIa] = useState<ResultadoIA | null>(null)
  /** Lo que la última mirada a las fotos vio distinto de la ficha. Se guarda con el borrador. */
  const [chivatos, setChivatos] = useState<Chivato[] | undefined>(fila?.borrador?.chivatos)
  // ⛔ Arranca DESTILDADO: los productos de la tanda del 2-sep tienen un renglón escrito a mano en
  // TiendaNube, y conservarlo dejaría el texto viejo abajo del párrafo nuevo, diciendo lo mismo.
  // Decisión de Bruno del 4-sep-2026: se pisa. El respaldo queda igual en `html_previo`.
  const [conservarResiduo, setConservarResiduo] = useState(false)
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
    () => [...validarParrafo(parrafo, { variantes: p.variantes, nombre: p.name, bullets }), ...validarTip(tip, { variantes: p.variantes })],
    [parrafo, tip, p.variantes, p.name, bullets],
  )
  /** Los cuidados que le tocan a esta prenda por su tela. `null` si todavía no tiene ninguna. */
  const cuidados = useMemo(() => cuidadosDe(ficha), [ficha])
  /** 🔴 Sin tela no se redacta ni se publica: la tela es la que decide los cuidados. */
  const faltaTela = useMemo(() => sinTela(ficha), [ficha])
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
    if (typeof r.borrador?.tip === 'string') setTip(r.borrador.tip)
    // ⚠️ Se pisan con los del pedido nuevo, ⛔ no se suman: el modelo volvió a mirar las fotos, y
    // arrastrar un aviso de la corrida anterior sería mostrar algo que nadie chequeó.
    if (r.borrador) setChivatos(r.borrador.chivatos || [])
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
          // Misma caja fija que la tira de abajo, y por el mismo motivo.
          <span style={{ width: 44, height: 55, flex: '0 0 auto', overflow: 'hidden', borderRadius: 4, display: 'block' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.imagenes[0].src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </span>
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
          {paraVolverAMirar(ficha) && <Badge tone="warning">Para volver a mirar</Badge>}
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
                  // 🔴 La caja es del BOTÓN y la foto la llena adentro, con `overflow:hidden`.
                  // Con el alto puesto sólo en el atributo `height` del `<img>`, las fotos salían
                  // a su tamaño natural (~1024×1580) y **se montaban encima de la ficha de abajo**
                  // —lo vio Bruno el 1-sep-2026—: `objectFit` no recorta nada si la caja no tiene
                  // un alto que se respete. Así, ninguna regla que le pise el alto a un `<img>`
                  // puede desbordar la tira.
                  <button
                    key={im.id}
                    type="button"
                    onClick={() => setFoto(im.src)}
                    title="Ver en grande"
                    style={{
                      padding: 0, border: '1px solid #ddd', borderRadius: 6, background: 'none',
                      cursor: 'zoom-in', lineHeight: 0, width: 72, height: 90, flex: '0 0 auto', overflow: 'hidden',
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={im.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
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
                    onElegir={(v, propuesto) => onAtributo(a.key, v, propuesto)}
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
                    onElegir={(v, propuesto) => onAtributo(a.key, v, propuesto)}
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

          {/* ── Las medidas: mismo momento, misma prenda, misma pantalla ── */}
          {familia && <BloqueMedidas p={p} fila={fila} ficha={ficha} familia={familia} medidas={medidas} onMedida={onMedida} onSinMedidas={onSinMedidas} />}

          {/* 🔴 EL TALLE DE LA MODELO SE MUESTRA, ⛔ NO SE PUBLICA — y no es una etapa a medias, es
              una regla que se cruza con otra. Lo pidió Bruno el 3-sep-2026 («cargar el talle que usa
              la modelo en la descripción del producto») y el párrafo **no puede nombrar un talle**:
              lo rechaza `validarParrafo` desde el 27-ago por decisión suya —«eso lo dicen el selector
              y la tabla»—, porque los talles del PRODUCTO se desactualizan solos. El de la modelo no
              es ese talle y no se desactualiza nunca, así que sale como un BLOQUE compuesto —al lado
              de los bullets y de la tabla— y ⛔ no como prosa. Ese bloque todavía no existe: es la
              decisión que falta. Mientras tanto el dato está acá, que es donde se escribe la ficha. */}
          {talleModelo ? (
            <div style={{ border: `1px solid ${color.line}`, borderRadius: 9, padding: '8px 10px', background: color.bg, fontSize: 13 }}>
              👗 <b>{fraseDeModelo(talleModelo.modelo)}</b>{' '}
              <span style={{ color: color.mut2 }}>
                — {resumenDeModelo(talleModelo.modelo)} · sesión del {talleModelo.fecha}
              </span>
              <div style={{ fontSize: 11, color: color.mut, marginTop: 2 }}>
                Sale de la sesión de fotos. Todavía no se escribe solo en la tienda.
              </div>
            </div>
          ) : null}

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
                <Button size="sm" variant="outline" disabled={redactando || faltaTela} onClick={() => void pedirIa()}>
                  {redactando ? 'Redactando…' : 'Escribir el párrafo con IA'}
                </Button>
                {faltaTela && (
                  <span style={{ fontSize: 12, color: '#a00' }}>Cargá la tela: es la que decide los cuidados de la prenda.</span>
                )}
                {ia && !ia.error && (
                  <span style={{ fontSize: 12, color: '#666' }}>
                    {ia.modeloNombre} · {ia.intentos === 1 ? 'un intento' : `${ia.intentos} intentos`} ·{' '}
                    <b>US${ia.costo.toFixed(4)}</b>
                  </span>
                )}
              </Toolbar>
              {ia?.error && <Notice tone="danger">{ia.error}</Notice>}

              {/* 🆕 El chivato también acá: quien aprieta «Escribir el párrafo» es el primero que
                  se entera de que la ficha no coincide con la foto. */}
              <Chivatos chivatos={chivatos} ficha={ficha} />

              <Field
                label={`Párrafo (${parrafo.trim().length} de ${MAX_PARRAFO})`}
                hint="Arranca nombrando la prenda. No repitas lo que ya dicen los datos de la ficha."
              >
                <Input value={parrafo} onChange={(e) => setParrafo(e.target.value)} />
              </Field>

              <Field
                label={`Tip de look (${tip.trim().length} de ${MAX_TIP}) — opcional`}
                hint="Cómo combinarla o cómo queda mejor puesta. Si no suma, dejalo vacío."
              >
                <Input value={tip} onChange={(e) => setTip(e.target.value)} />
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
                    dangerouslySetInnerHTML={{ __html: generarHtml({ parrafo, bullets, tip, cuidados }) }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <Button size="sm" variant="outline" disabled={guardando || vacio} onClick={() => void correr({ op: 'borrador', borrador: { parrafo, bullets, tip: tip.trim(), ...(chivatos ? { chivatos } : {}) } })}>
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
/**
 * Las medidas de una prenda: la grilla que llena el local con la prenda apoyada y la cinta.
 *
 * 🔴 **Vive ADENTRO de la fila y no en una pantalla aparte**, y eso lo decidió la dinámica real que
 * contó Bruno el 1-sep-2026: la mercadería entra al depósito, baja al local, y ahí Camila Quintana
 * y Josefina Batter hacen **la descripción y las medidas en el mismo momento**, con la prenda en la
 * mano. Dos pantallas serían buscar la misma prenda dos veces, y esa fricción es la que hace que
 * una de las dos cosas no se haga.
 */
function BloqueMedidas({
  p, fila, ficha, familia, medidas, onMedida, onSinMedidas,
}: {
  p: ProductoTn
  fila: FilaCola | undefined
  ficha: Cargados
  familia: Familia
  medidas: Medidas
  onMedida: (talle: string, medida: Medida, valor: string) => Promise<string | null>
  onSinMedidas: (motivo: string) => Promise<string | null>
}) {
  // 🔴 Los talles salen de las VARIANTES, no se tipean. Sin eje de talle es UNA columna: medido,
  // 98 de los 111 productos sin medidas no tienen talles, así que ése es el caso normal.
  const talles = useMemo(() => tallesDe(p.variantes), [p.variantes])
  const cols = talles.length ? talles : ['']
  const campos = useMemo(() => medidasDe(familia, ficha), [familia, ficha])
  const cuenta = useMemo(() => contestadasDe(familia, ficha, talles, medidas), [familia, ficha, talles, medidas])
  const sinMedidas = fila?.sin_medidas || ''
  // 🔑 La ficha ya sabe la tela: el aviso sale solo, con la prenda delante, y no en un manual.
  const estira = TELAS_QUE_ESTIRAN.includes(String(ficha.tela || ''))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, fontWeight: 600 }}>Las medidas</div>
        <span style={{ fontSize: 12, color: '#666' }}>
          {sinMedidas ? 'esta prenda no lleva tabla' : `${cuenta.con} de ${cuenta.total} · en cm, la prenda apoyada y plana`}
        </span>
      </div>

      {/* La salida para las elastizadas. Sin ella se quedan en la cola para siempre, y una cola
          que nunca baja a cero deja de mirarse: son 60 de las 111. */}
      <div style={{ marginBottom: 8, maxWidth: 320 }}>
        <Select value={sinMedidas} onChange={(e) => void onSinMedidas(e.target.value)}>
          <option value="">Lleva tabla de medidas</option>
          <option value="elastizada">No lleva — es elastizada</option>
          <option value="talle unico">No lleva — talle único sin variación</option>
          <option value="accesorio">No lleva — es un accesorio</option>
        </Select>
      </div>

      {!sinMedidas && (
        <>
          {estira && (
            <Notice tone="neutral">
              Es de <b>{String(ficha.tela)}</b>: si estira mucho, <b>no midas el ancho</b> —marcalo con «estira»— y
              cargá el largo igual. El largo no se estira.
            </Notice>
          )}
          <div style={{ overflowX: 'auto', marginTop: 8 }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600 }}>Medida</th>
                  {cols.map((t) => (
                    <th key={t} style={{ padding: '4px 8px', fontWeight: 600, minWidth: 78 }}>{t || 'Único'}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {campos.map((m) => (
                  <tr key={m.key}>
                    <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }} title={m.comoMedir}>
                      {m.label}
                      {m.duplicar && <span style={{ color: '#666' }}> (la mitad)</span>}
                    </td>
                    {cols.map((t) => (
                      <td key={t} style={{ padding: '2px 4px' }}>
                        <CasilleroMedida
                          // 🔑 La `key` lleva el valor guardado adentro a propósito: cuando el
                          // servidor confirma otro, el casillero se REMONTA y nace con lo que está
                          // guardado de verdad. Es la alternativa al efecto que sincroniza estado
                          // con props, que además es lo que prohíbe `set-state-in-effect`.
                          key={t + '|' + (medidas[t]?.[m.key] || '')}
                          puedeEstirar={m.estira}
                          valor={medidas[t]?.[m.key] || ''}
                          onGuardar={(v) => onMedida(t, m.key, v)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
            {/* ⚠️ Lo del x2 sale SÓLO si esta prenda tiene una medida que se duplica. Un top no
                tiene cintura, y el cartel le hablaba de un campo que no está en su tabla: un texto
                que nombra algo que no se ve manda a buscarlo. */}
            {campos.some((m) => m.duplicar) && 'La cintura se mide por la mitad — se publica multiplicada por 2. '}
            Una fila sin ningún número no sale a la tienda.
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Un casillero de medida: un número, o el botón de «estira».
 *
 * ⚠️ El botón sólo aparece donde la medida puede estirar. En el largo ⛔ no existe, y ésa es la
 * regla de Bruno hecha imposible de romper en vez de escrita en un cartel: «si elastiza mucho no se
 * mide la medida que elastiza, pero se mide el largo».
 */
function CasilleroMedida({
  valor, puedeEstirar, onGuardar,
}: {
  valor: string
  puedeEstirar: boolean
  onGuardar: (v: string) => Promise<string | null>
}) {
  const esEstira = valor === ESTIRA
  // Nace con lo que está guardado. Si el guardado falla, el casillero vuelve solo a la verdad del
  // servidor porque el padre lo remonta con la `key`. Mismo criterio que `CampoAtributo`.
  const [texto, setTexto] = useState(esEstira ? '' : valor)
  const [guardando, setGuardando] = useState(false)

  const mandar = async (v: string) => {
    setGuardando(true)
    await onGuardar(v)
    setGuardando(false)
  }

  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      <Input
        value={esEstira ? '' : texto}
        disabled={guardando || esEstira}
        inputMode="decimal"
        placeholder={esEstira ? 'estira' : 'cm'}
        style={{ width: 64, textAlign: 'center' }}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => { if (texto.trim() !== valor) void mandar(texto.trim()) }}
      />
      {puedeEstirar && (
        <button
          type="button"
          title={esEstira ? 'Volver a medirla' : 'Esta medida estira: no se toma'}
          onClick={() => void mandar(esEstira ? '' : ESTIRA)}
          disabled={guardando}
          style={{
            border: '1px solid ' + (esEstira ? '#222' : '#ddd'),
            background: esEstira ? '#222' : 'none',
            color: esEstira ? '#fff' : '#666',
            borderRadius: 4, fontSize: 11, padding: '2px 5px', cursor: 'pointer', lineHeight: 1.4,
          }}
        >
          estira
        </button>
      )}
    </span>
  )
}

/** Cómo se llama en castellano el grupo de cuidados. `cuidadosDe` devuelve la `key`. */
function nombreDeCuidados(key: string): string {
  const g = (GRUPOS as { key: string; nombre: string }[]).find((x) => x.key === key)
  return g ? g.nombre : key
}

/** El valor del `<option>` que abre el campo para escribir una palabra que no está en la lista. */
const OTRA = '__otra__'

function CampoAtributo({
  label, opciones, valor, libre, prestado = false, onElegir,
}: {
  label: string
  opciones: OpcionesAtributo | null
  valor: string
  libre: boolean
  /** Un atributo que la familia no pide y alguien sumó a mano: se rotula para que se note. */
  prestado?: boolean
  onElegir: (v: string, propuesto?: boolean) => Promise<string | null>
}) {
  const [guardando, setGuardando] = useState(false)
  const [texto, setTexto] = useState(valor)
  const [proponiendo, setProponiendo] = useState(false)

  const mandar = async (v: string, propuesto?: boolean) => {
    setGuardando(true)
    const err = await onElegir(v, propuesto)
    setGuardando(false)
    if (!err) setProponiendo(false)
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
  // 🔑 Que el valor guardado sea una PROPUESTA no es un dato aparte: es que no está en ninguna de
  // las dos listas. Así, el día que Bruno la aprueba y entra al diccionario, el cartel se apaga
  // solo — acá y en todos los productos donde se haya cargado.
  const esPropuesta = !!valor && valor !== NO_APLICA && valor !== NO_SE && !propios.includes(valor) && !prestados.includes(valor)

  if (proponiendo || esPropuesta) {
    return (
      <Field label={prestado ? `${label} · de otra prenda` : label}>
        <div style={{ display: 'flex', gap: 4 }}>
          <Input
            value={texto}
            disabled={guardando}
            autoFocus={proponiendo}
            maxLength={MAX_PROPUESTA}
            placeholder="una o dos palabras"
            onChange={(e) => setTexto(e.target.value)}
            onBlur={() => { const v = texto.trim(); if (v && v !== valor && esPalabraPropuesta(v)) void mandar(v, true) }}
          />
          <Button size="sm" variant="outline" disabled={guardando} onClick={() => { setProponiendo(false); if (valor) void mandar('') }}>
            volver
          </Button>
        </div>
        <div style={{ fontSize: 11, color: '#a06000', marginTop: 3 }}>
          {esPropuesta
            ? <>Palabra propuesta: se guarda, pero <b>no sale a la tienda</b> hasta que Bruno la sume a la lista.</>
            : 'Una o dos palabras, sin signos. Ej: «forrado».'}
        </div>
      </Field>
    )
  }

  return (
    <Field label={prestado ? `${label} · de otra prenda` : label}>
      <Select
        value={valor}
        disabled={guardando}
        onChange={(e) => { if (e.target.value === OTRA) { setTexto(''); setProponiendo(true) } else void mandar(e.target.value) }}
      >
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
        {/* ⛔ Últimos, y separados: son respuestas, no valores de venta. Y son DOS porque dicen
            cosas distintas — «esta prenda no tiene eso» contra «la miré y no sé» —: sin la
            segunda, quien no sabe elige un valor cualquiera y la ficha queda midiendo lo que la
            persona se animó a poner (pedido de Bruno, 7-sep-2026). */}
        {opciones?.noAplica && <option value={NO_APLICA}>no aplica — la prenda no tiene eso</option>}
        {opciones?.noSe && <option value={NO_SE}>no sé — la miré y no me doy cuenta</option>}
        {/* 🔑 La VÁLVULA. Un freno sin salida se lo saltea la gente: sin esto, la palabra que no
            está en la lista termina en Detalle —texto libre— y se pierde para siempre para
            cualquier cuenta. Acá se escribe igual, queda marcada, y entra a la lista cuando Bruno
            la apruebe. 📌 feedback_areben_freno_sin_valvula */}
        <option value={OTRA}>otra…</option>
      </Select>
    </Field>
  )
}

/**
 * 🆕 Una prenda esperando que la miren: **la foto grande al lado de todo lo que va a salir**, y un
 * solo botón.
 *
 * 🔴 **Es la respuesta al veredicto de Bruno del 7-sep-2026** —«mucha fricción, tengo que revisar
 * todo, no me está convenciendo»— y a las tres cosas que él mismo nombró al día siguiente: que ⛔
 * no le confía a los bullets, que revisar de a una cuesta, y que son tres botones por prenda.
 *
 * 🔑 **La foto grande ⛔ no es estética: es el ORÁCULO de la ficha.** Medido el 7-sep: 4 de 20
 * prendas tenían la ficha peleada con la foto (TOP LOLA decía `Manga: 3/4` y es sin mangas). Con
 * la ficha en una fila cerrada y la foto en otra pantalla, la única forma de cazar eso era
 * acordarse de mirar; acá el error y su oráculo entran juntos en la misma mirada.
 *
 * 🔑 **Y se corrige en el lugar donde se ve** —lo pidió Bruno: «poder editar rápido, o poder
 * editar algunas partes»—: cada dato de la ficha se corrige al elegirlo y el párrafo al salir del
 * campo, sin botón de guardar. Es la misma regla que ya tenía la ficha desde el 27-ago: un botón
 * que junta seis campos es un botón que alguien no aprieta.
 *
 * ⚠️ La tarjeta ⛔ no muestra las medidas ni el insumo: eso se carga con la prenda en la mano y es
 * la otra pestaña. Acá se lee y se decide.
 */
function TarjetaRevision({
  p, fila, ficha, familia, onAtributo, onGuardarTexto, onPublicar,
}: {
  p: ProductoTn
  fila: FilaCola | undefined
  ficha: Cargados
  familia: Familia | null
  onAtributo: (atributo: Atributo, valor: string, propuesto?: boolean) => Promise<string | null>
  onGuardarTexto: (borrador: { parrafo: string; bullets: { etiqueta: string; texto: string }[]; tip: string }) => Promise<string | null>
  onPublicar: (
    borrador: { parrafo: string; bullets: { etiqueta: string; texto: string }[]; tip: string },
    conservarResiduo: boolean,
  ) => Promise<string | null>
}) {
  const [parrafo, setParrafo] = useState(fila?.borrador?.parrafo || '')
  const [tip, setTip] = useState(fila?.borrador?.tip || '')
  const [guardando, setGuardando] = useState(false)
  const [publicando, setPublicando] = useState(false)
  const [corrigiendo, setCorrigiendo] = useState(false)
  // ⛔ Arranca DESTILDADO, igual que en la fila: decisión de Bruno del 4-sep-2026, el renglón
  // viejo escrito a mano se pisa. El respaldo queda en `html_previo` igual.
  const [conservarResiduo, setConservarResiduo] = useState(false)
  const [foto, setFoto] = useState<string | null>(null)

  const bullets = useMemo(() => bulletsDe(familia, ficha), [familia, ficha])
  const cuidados = useMemo(() => cuidadosDe(ficha), [ficha])
  const campos = useMemo(() => atributosDe(familia), [familia])
  const cuenta = useMemo(() => cargadosDe(familia, ficha), [familia, ficha])
  const partes = useMemo(() => partir(p.raw_desc), [p.raw_desc])
  const problemas = useMemo(
    () => [...validarParrafo(parrafo, { variantes: p.variantes, nombre: p.name, bullets }), ...validarTip(tip, { variantes: p.variantes })],
    [parrafo, tip, p.variantes, p.name, bullets],
  )
  const faltaTela = useMemo(() => sinTela(ficha), [ficha])
  const vacio = !parrafo.trim()
  const sucio = parrafo !== (fila?.borrador?.parrafo || '') || tip.trim() !== (fila?.borrador?.tip || '')
  const enLaTienda = fila?.estado === 'escrito'

  // 🔴 Los chivatos VIAJAN con el borrador aunque acá no se toquen: guardar el párrafo manda el
  // objeto entero, así que no incluirlos sería BORRAR los avisos al corregir una coma. Nacen del
  // vistazo a las fotos, no de este campo.
  const textoDeAhora = () => ({
    parrafo,
    bullets,
    tip: tip.trim(),
    // ⛔ Si ⛔ no hay chivatos guardados ⛔ no se manda `[]`: eso AFIRMA que alguien miró la foto, y
    // corregir una coma en el párrafo ⛔ no es haber revisado la ficha.
    ...(fila?.borrador?.chivatos ? { chivatos: fila.borrador.chivatos } : {}),
  })

  /** 🔑 Se guarda al SALIR del campo, sin botón. Si no cambió nada, ⛔ no se escribe. */
  const alSalir = async () => {
    if (!sucio || vacio) return
    setGuardando(true)
    await onGuardarTexto(textoDeAhora())
    setGuardando(false)
  }

  return (
    <Card>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* ── La foto, del tamaño en que se puede ver una manga ── */}
        <div style={{ flex: '0 0 auto', width: 190 }}>
          {p.imagenes[0] ? (
            <button
              type="button"
              onClick={() => setFoto(p.imagenes[0].src)}
              title="Ver en grande"
              style={{ padding: 0, border: `1px solid ${color.line}`, borderRadius: 8, background: 'none', cursor: 'zoom-in', lineHeight: 0, width: 190, height: 238, overflow: 'hidden', display: 'block' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.imagenes[0].src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </button>
          ) : (
            <div style={{ width: 190, height: 238, border: `1px dashed ${color.line}`, borderRadius: 8, display: 'grid', placeItems: 'center', fontSize: 12, color: color.mut }}>
              sin fotos
            </div>
          )}
          {/* Las demás, chicas: el tajo o el largo real casi nunca están en la portada. */}
          {p.imagenes.length > 1 && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 5 }}>
              {p.imagenes.slice(1).map((im) => (
                <button
                  key={im.id}
                  type="button"
                  onClick={() => setFoto(im.src)}
                  title="Ver en grande"
                  style={{ padding: 0, border: `1px solid ${color.line}`, borderRadius: 5, background: 'none', cursor: 'zoom-in', lineHeight: 0, width: 43, height: 54, overflow: 'hidden' }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={im.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Lo que va a salir a la tienda ── */}
        <div style={{ flex: '1 1 340px', minWidth: 280, display: 'grid', gap: 9 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <b style={{ fontSize: font.base }}>{p.name}</b>
            {familia
              ? <Badge tone={cuenta.con === cuenta.total ? 'success' : 'neutral'}>Ficha {cuenta.con}/{cuenta.total}</Badge>
              : <Badge tone="warning">Falta decir qué prenda es</Badge>}
            {paraVolverAMirar(ficha) && <Badge tone="warning">Para volver a mirar</Badge>}
            {fila?.estado === 'aprobado' && <Badge tone="success">Aprobado</Badge>}
            {enLaTienda && <Badge tone={fila?.verificado ? 'success' : 'warning'}>{fila?.verificado ? 'En la tienda' : 'Escrito sin verificar'}</Badge>}
            {guardando && <span style={{ fontSize: font.xs, color: color.mut }}>guardando…</span>}
          </div>

          <textarea
            className="mo-input mo-input--multi"
            rows={3}
            value={parrafo}
            onChange={(e) => setParrafo(e.target.value)}
            onBlur={() => void alSalir()}
            placeholder="El párrafo que la vende"
            style={{ width: '100%', boxSizing: 'border-box', fontSize: font.base }}
          />
          <div style={{ fontSize: font.xs, color: color.mut, marginTop: -6 }}>
            Párrafo · {parrafo.trim().length} de {MAX_PARRAFO}
          </div>

          <textarea
            className="mo-input mo-input--multi"
            rows={2}
            value={tip}
            onChange={(e) => setTip(e.target.value)}
            onBlur={() => void alSalir()}
            placeholder="Tip de look (opcional): con qué se combina"
            style={{ width: '100%', boxSizing: 'border-box', fontSize: font.base }}
          />
          <div style={{ fontSize: font.xs, color: color.mut, marginTop: -6 }}>
            Tip · {tip.trim().length} de {MAX_TIP}
          </div>

          {/* 🔑 Los bullets, tal como salen — y cada uno abre la ficha para corregirlo. Son lo que
              hay que mirar contra la foto, así que se leen enteros y ⛔ no escondidos. */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {bullets.length === 0 && <span style={{ fontSize: font.sm, color: '#a00' }}>Sin ningún dato cargado.</span>}
            {bullets.map((b) => (
              <button
                key={b.etiqueta}
                type="button"
                onClick={() => setCorrigiendo(true)}
                title="Corregir la ficha"
                style={{ border: `1px solid ${color.line}`, borderRadius: 999, background: color.bg, cursor: 'pointer', fontSize: font.xs, padding: '2px 9px', color: color.ink }}
              >
                {b.etiqueta}: <b>{b.texto}</b>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCorrigiendo((v) => !v)}
              style={{ border: 0, background: 'none', cursor: 'pointer', fontSize: font.xs, color: color.mut2, textDecoration: 'underline' }}
            >
              {corrigiendo ? 'listo' : '✎ corregir la ficha'}
            </button>
          </div>

          {corrigiendo && familia && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 9, padding: 10, background: color.bg, borderRadius: 8 }}>
              {campos.map((a) => (
                <CampoAtributo
                  key={a.key}
                  label={a.label}
                  libre={a.libre}
                  opciones={opcionesDe(familia, a.key)}
                  valor={ficha[a.key] || ''}
                  onElegir={(v, propuesto) => onAtributo(a.key, v, propuesto)}
                />
              ))}
            </div>
          )}
          {corrigiendo && !familia && (
            <Notice tone="warning">
              Este producto no tiene categoría en TiendaNube, así que la ficha no sabe qué preguntarle.
              Decile qué prenda es desde <b>Cargar y escribir</b>.
            </Notice>
          )}

          {/* 🆕 EL CHIVATO: lo que quien miró las fotos vio distinto de la ficha. Va ARRIBA de
              los cuidados y abajo de los bullets, que es donde se mira el dato que discute. */}
          <Chivatos chivatos={fila?.borrador?.chivatos} ficha={ficha} onCorregir={() => setCorrigiendo(true)} />

          {cuidados && (
            <div style={{ fontSize: font.xs, color: color.mut2 }} title={cuidados.lineas.join(' ')}>
              {/* ⚠️ El NOMBRE del grupo, ⛔ no su `key`: «punto» es el identificador del código y en
                  la pantalla no quiere decir nada. Las líneas que van a salir, en el `title`. */}
              Cuidados: <b>{nombreDeCuidados(cuidados.grupo)}</b> — salen solos de la tela.
            </div>
          )}

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
          {faltaTela && (
            <Notice tone="warning">Sin tela cargada no sale a la tienda: la tela decide los cuidados de la prenda.</Notice>
          )}

          {/* 🔴 El residuo se decide acá también: sin este tilde, publicar desde la revisión sería
              un camino que tira texto viejo sin que nadie lo vea. TiendaNube ⛔ no tiene historial. */}
          {!!partes.residuo && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: font.sm }}>
              <input type="checkbox" checked={conservarResiduo} onChange={(e) => setConservarResiduo(e.target.checked)} style={{ marginTop: 3 }} />
              <span>
                Conservar lo que ya había escrito además de la tabla de talles
                {partes.residuo.includes('<img') && <b> (incluye una imagen)</b>}.
                <span style={{ color: color.mut, display: 'block' }}>{partes.residuo.replace(/<[^>]+>/g, ' ').trim().slice(0, 140)}</span>
              </span>
            </label>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button
              size="sm"
              disabled={publicando || guardando || vacio || problemas.length > 0 || faltaTela}
              onClick={() => {
                void (async () => {
                  setPublicando(true)
                  await onPublicar(textoDeAhora(), conservarResiduo)
                  setPublicando(false)
                })()
              }}
            >
              {publicando ? 'Publicando…' : enLaTienda ? 'Volver a publicar' : 'Publicar en la tienda'}
            </Button>
            <span style={{ fontSize: font.xs, color: color.mut }}>
              Aprueba y escribe en un solo gesto. La tabla de talles se conserva siempre y el texto anterior se guarda antes de pisarlo.
            </span>
          </div>
        </div>
      </div>
      <Lightbox src={foto} alt={p.name} onCerrar={() => setFoto(null)} />
    </Card>
  )
}

/**
 * 🆕 Los CHIVATOS de una prenda: lo que quien miró las fotos vio distinto de lo que dice la ficha.
 *
 * 🔴 **Existe porque la ficha ⛔ no es confiable y eso era la mitad de la fricción** (Bruno,
 * 7-sep-2026: «no confío en los bullets»). Medido ese día: 4 de 20 prendas tenían la ficha
 * peleada con la foto, y la única forma de cazarlo era acordarse de mirar. El 8-sep se midió lo
 * otro: en las 3 de esas 4 que ya tenían párrafo, **el texto —que sí mira la foto— describía
 * bien lo que la ficha decía mal**. O sea que el error ya estaba visto: lo que faltaba era que
 * alguien lo dijera en voz alta.
 *
 * 🔴 **Marca, ⛔ no corrige** (decisión de Bruno). El aviso ofrece el botón; el que cambia el
 * valor es una persona. Un invento del modelo pisando un dato que alguien cargó con la prenda en
 * la mano es peor que el error que arregla — y este mismo modelo ya inventó «terminaciones
 * deshilachadas» sobre un dobladillo limpio.
 *
 * 🔑 **Que esté corregido ⛔ no se guarda: se DEDUCE.** Si el valor de la ficha ya ⛔ no es el que
 * el chivato discute, el aviso se muestra saldado. Sin estado nuevo que pueda quedar mintiendo:
 * la verdad es la ficha.
 */
function Chivatos({
  chivatos, ficha, onCorregir,
}: {
  /**
   * 🔴 **`undefined` y `[]` dicen cosas DISTINTAS, y ésa es la mitad del valor de esto**:
   * `undefined` es «nadie la miró contra la foto» y `[]` es «la miré y coincide». Si las dos se
   * dibujaran igual, quien revisa tendría que volver a mirar las 17 para saber cuáles ya se
   * miraron — que es exactamente el trabajo que esto viene a sacar. Es la misma regla que el
   * «no sé» de la ficha: una respuesta ⛔ no es lo mismo que un casillero vacío.
   */
  chivatos: Chivato[] | undefined
  ficha: Cargados
  /**
   * ⚠️ OPCIONAL a propósito: en la fila de «Cargar» la ficha ya está abierta arriba del aviso, y
   * un botón «corregir la ficha» que no lleva a ningún lado es una pantalla que miente. Sin
   * `onCorregir`, el aviso se lee y nada más.
   */
  onCorregir?: () => void
}) {
  if (!chivatos) return null
  if (!chivatos.length) {
    return (
      <div style={{ fontSize: font.xs, color: color.mut2 }}>
        ✓ Revisado contra la foto: la ficha coincide.
      </div>
    )
  }
  const norm = (x: string) => String(x || '').trim().toLowerCase()
  const filas = chivatos.map((c) => {
    const actual = String(ficha[c.campo as Atributo] || '')
    return { ...c, actual, saldado: !!actual && norm(actual) !== norm(c.dice) }
  })
  const pendientes = filas.filter((f) => !f.saldado)

  return (
    <div style={{ border: `1px solid ${pendientes.length ? '#e6c200' : color.line}`, background: pendientes.length ? '#fffbe6' : color.bg, borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: font.xs, fontWeight: 600, marginBottom: 5 }}>
        {pendientes.length
          ? `La foto no coincide con la ficha en ${pendientes.length === 1 ? 'un dato' : `${pendientes.length} datos`}`
          : 'La foto no coincidía con la ficha, y ya está corregido'}
      </div>
      <div style={{ display: 'grid', gap: 4 }}>
        {filas.map((f, i) => (
          <div key={i} style={{ fontSize: font.xs, color: f.saldado ? color.mut : color.ink }}>
            {f.saldado ? '✓ ' : '• '}
            <b>{etiquetaDe(f.campo)}</b>: la ficha {f.saldado ? 'decía' : 'dice'} «{f.dice}» y en la foto se ve <b>{f.veo}</b>
            {f.saldado && <> — ahora dice «{f.actual}»</>}
          </div>
        ))}
      </div>
      {pendientes.length > 0 && onCorregir && (
        <button
          type="button"
          onClick={onCorregir}
          style={{ marginTop: 6, border: 0, background: 'none', cursor: 'pointer', fontSize: font.xs, color: color.mut2, textDecoration: 'underline', padding: 0 }}
        >
          corregir la ficha
        </button>
      )}
    </div>
  )
}

/** El rótulo del campo, como se llama en la ficha. `escote` no le dice nada a nadie. */
function etiquetaDe(campo: string): string {
  const a = (ATRIBUTOS as Record<string, { label?: string }>)[campo]
  return (a && a.label) || campo
}
