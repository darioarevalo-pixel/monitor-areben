'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { HeaderAcciones } from '@/components/layout/acciones'
import { Button, Card, Field, Input, Notice, color, font, formatMoney, space, useConfirmar, useToast, weight } from '@/components/ui'
import { descargarXlsx } from '@/lib/excel'
import { candidatosPorCodigo, coincidencias, precioDeGondola } from '@/lib/exhib/core'
import { leerRecorrido, leerRecorridos } from '@/lib/exhib/cliente'
import { agruparPorLugar, ANCHOS_EXPORT, catsVisibles, compararConHistorial, filasExport, hallazgoDe, resumenRecorrido, type EscaneoLibre, type RecorridoLibre } from '@/lib/exhib/libre'
import { colgarEnLugar, paraColgar, resumenColgar, type Colgar } from '@/lib/exhib/colgar'
import { ParaColgar } from './ParaColgar'
import { BalanceSector } from './BalanceSector'
import type { ExhibItem } from '@/lib/exhib/tipos'
import { useExhibLibre, type ResultadoLibre } from './useExhibLibre'
import { avisoDe } from '@/lib/exhib/aviso'
import { avisar, estadoSonido, prepararSonido, type EstadoSonido } from '@/lib/sonido'

/**
 * Chequeo de exhibición **libre**: se camina el local escaneando por LUGAR («perchero tops»), y
 * cada escaneo se guarda en la base con su lugar.
 *
 * 🔑 **Por qué no alcanzaba el modo por categoría.** Una misma categoría de Tienda Nube está
 * colgada en varios lugares del salón, y además engloba mal: el perchero de tops se compara contra
 * «TOPS Y BODIES», un bolsón de 291 que se come tops, bodies, blusas, camisas, corsets y
 * musculosas. Acá la unidad de trabajo es el mueble que uno tiene delante.
 *
 * 🔑 **Desde el 19-sep-2026 sí contesta UNA cosa: qué falta colgar** (`lib/exhib/colgar.ts`) —los
 * **hermanos** de las prendas que este recorrido tocó, que tienen stock y ⛔ no pasaron por el
 * lector—. Lo pidió Bruno mirando el reporte: *«son 3 colores, sólo se escanearon dos y me dice que
 * no pasa nada»*.
 * ⛔ **Lo que sigue sin hacer es decidir qué DEBERÍA estar colgado en cada perchero**: sobre un
 * mueble que nadie caminó ⛔ no se afirma nada. Ésa es la línea, y es lo que hace que a la lista se
 * le pueda creer.
 */

/**
 * `cierre` es la fase de después de guardar: la caminata terminó y lo que queda por contestar es
 * **qué hay que ir a colgar**. Va como fase propia y ⛔ no como un cartel en «Configurar» porque
 * `cerrar` limpia el borrador del teléfono: si la lista no se congela acá, se la lleva el guardado.
 */
type Fase = 'config' | 'scan' | 'cierre' | 'ver'

/**
 * Cuántos escaneos se dibujan mientras se camina.
 *
 * 🔑 **25 es lo que entra en una pantalla de teléfono con margen**, y alcanza de sobra para lo
 * único que se mira de esta lista con el lector en la mano: **que la última prenda enganchó**.
 */
const TOPE_FILAS = 25

/** Todo en hora de Buenos Aires: el reloj del teléfono es el del local, y el servidor guarda UTC. */
const EN_AR = { timeZone: 'America/Argentina/Buenos_Aires' } as const

const fechaHora = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('es-AR', { ...EN_AR, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

const fechaDe = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('es-AR', { ...EN_AR, weekday: 'long', day: '2-digit', month: '2-digit' }) : '—'

const hora = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString('es-AR', { ...EN_AR, hour: '2-digit', minute: '2-digit' }) : '—'

export function ExhibLibre({ items, buscables, enCero, deStunned, cargando, errorMsg, selector, onTraerStock, trayendo }: { items: ExhibItem[]; buscables: ExhibItem[]; enCero: number; deStunned: number; cargando: boolean; errorMsg: string | null; selector: React.ReactNode; onTraerStock: () => Promise<void>; trayendo: boolean }) {
  const { marca } = useSesion()
  const { confirmar } = useConfirmar()
  const toast = useToast()
  // 🔑 El lector engancha contra TODO el Local —`buscables`—, ⛔ no contra lo que tiene stock: una
  // prenda colgada que el sistema tiene en cero es un hallazgo, y antes caía en «no cruzó».
  const lib = useExhibLibre(marca, buscables)

  const [fase, setFase] = useState<Fase>('config')
  /** Lo que el teléfono pudo hacer con el sonido, para poder DECIRLO. Ver `lib/sonido.ts`. */
  const [audio, setAudio] = useState<EstadoSonido | null>(null)
  const [fb, setFb] = useState<ResultadoLibre | null>(null)
  /** Ver la lista entera del lugar: se pide a mano, ⛔ no se dibuja sola mientras se escanea. */
  const [verTodosLosEscaneos, setVerTodosLosEscaneos] = useState(false)
  const [previos, setPrevios] = useState<RecorridoLibre[] | null>(null)
  const [viendo, setViendo] = useState<{ recorrido: RecorridoLibre; escaneos: EscaneoLibre[] } | null>(null)
  /** Lo que quedó sin colgar del mueble que se acaba de dejar, y lo del recorrido entero al cerrar. */
  const [cierreLugar, setCierreLugar] = useState<{ lugar: string; lista: Colgar[] } | null>(null)
  const [cierreFinal, setCierreFinal] = useState<Colgar[]>([])
  /**
   * 🔴 **¿Lo que se oyó es lo que quedó guardado?** (26-sep-2026, Bruno: *«si a ella le dice 198
   * quiero que haya 198»*). Se lee el historial del servidor DESPUÉS de cerrar y se compara con lo
   * que contó el teléfono. `null` = todavía ⛔ se sabe; `'sin-leer'` = ⛔ hubo señal para leerlo.
   */
  const [verificacion, setVerificacion] = useState<ReturnType<typeof compararConHistorial> | 'sin-leer' | null>(null)
  const [verColgarAca, setVerColgarAca] = useState(false)
  const scanRef = useRef<HTMLInputElement>(null)
  const lugarRef = useRef<HTMLInputElement>(null)

  const cargarPrevios = useCallback(() => {
    void leerRecorridos(marca)
      .then(setPrevios)
      // La lista de anteriores es un extra: si falla, el recorrido de hoy arranca igual. Se
      // distingue «no pude preguntar» (null) de «no hay ninguno» ([]), que es lo que dibuja abajo.
      .catch(() => setPrevios(null))
  }, [marca])

  useEffect(cargarPrevios, [cargarPrevios])

  function foco(ref: React.RefObject<HTMLInputElement | null>) {
    setTimeout(() => ref.current?.focus(), 150)
  }

  function iniciar() {
    // ⚠️ El audio del navegador arranca bloqueado hasta que la persona toca algo de verdad, y el
    // Enter del lector ⛔ no siempre alcanza: sin este enganche, el primer escaneo ⛔ no suena.
    // 🔑 **Y el «listo» ⛔ no es un adorno**: hablar DENTRO del toque es lo que destraba la voz en
    // iPhone, y de paso es la prueba de que el teléfono ⛔ no está en silencio — que es la forma más
    // fácil de caminar el local entero sin oír nada y no enterarse.
    prepararSonido()
    avisar('ok', 'listo')
    lib.iniciar()
    setFb(null)
    setFase('scan')
    foco(lugarRef)
  }

  /**
   * 🔑 **Todo lo que contesta el escaneo pasa por acá, y por eso el sonido ⛔ no se puede olvidar en
   * una rama.** Quien camina el local ⛔ no mira el teléfono: un final que ⛔ no suena es un final
   * que ⛔ no existe. Ver `lib/exhib/aviso.ts`, que decide qué pitido le toca a cada uno.
   */
  /**
   * **Escuchar los cinco avisos antes de salir a caminar.**
   *
   * 🔑 Todo esto sirve sólo si la persona los **reconoce de oído**: leer en la pantalla que «el
   * grave es no figura» ⛔ no sirve de nada parado en el salón con el lector en la mano. Y es
   * además el único momento en que se comprueba que el teléfono **no está en silencio**, que es la
   * forma más fácil de que el recorrido entero pase mudo sin que nadie se entere.
   *
   * ⚠️ Van espaciados ~1,2 s: encimados ⛔ no se distinguen, que es justo lo que se viene a probar.
   */
  function escucharAvisos() {
    prepararSonido()
    // ⚠️ Se pregunta DESPUÉS de un respiro: reanudar el audio es asíncrono, y preguntando en el
    // mismo suspiro diría «bloqueado» sobre un teléfono que está por sonar perfecto.
    window.setTimeout(() => setAudio(estadoSonido()), 400)
    // ⚠️ Son **dos**, y el primero va con avances crecientes: lo único que hay que reconocer de oído
    // es que el número sube. Con todos en el mismo número la prueba ⛔ no enseñaría nada.
    const demo: Array<{ tipo: string; avance?: number }> = [
      { tipo: 'ok', avance: 12 },
      { tipo: 'ok', avance: 13 },
      { tipo: 'no-cruzo' },
    ]
    demo.forEach((d, i) => {
      window.setTimeout(() => {
        const a = avisoDe(d)
        avisar(a.aviso, a.voz)
      }, i * 1200)
    })
  }

  function sonando(r: ResultadoLibre): ResultadoLibre {
    // ⚠️ `avance` y `parecidos` viajan adentro del resultado y ⛔ no se calculan acá: el primero sale
    // de la ref de la cola —la única que ya tiene el escaneo recién hecho— y el segundo decide entre
    // «no figura» y «pasala de nuevo».
    const a = avisoDe(r)
    avisar(a.aviso, a.voz)
    return r
  }

  function marcar(code: string) {
    const c = code.trim()
    if (!c) return
    if (!lib.lugar.trim()) {
      toast.aviso('Escribí primero en qué lugar estás parado.')
      foco(lugarRef)
      return
    }
    /*
     * 🔑 **El cierre del mueble se dispara con el PRIMER escaneo del siguiente, ⛔ no al tipear el
     * lugar.** El campo «Lugar» cambia letra por letra mientras se escribe —ahí el lugar todavía no
     * es nada—, y el momento en que de verdad se dejó un mueble es cuando ya se está escaneando en
     * otro. Es también cuando la persona todavía puede volver tres pasos.
     */
    const previo = lib.escaneos.at(-1)?.lugar
    setFb(sonando(lib.escanear(c, lib.lugar)))
    // Al escanear se vuelve a la vista corta: si quedó abierta la lista entera de un mueble, cada
    // lectura siguiente pagaría el dibujo completo otra vez.
    setVerTodosLosEscaneos(false)
    if (previo && previo !== lib.lugar.trim()) {
      const quedo = colgarEnLugar(paraColgar(lib.escaneos, items), previo)
      setCierreLugar(quedo.length ? { lugar: previo, lista: quedo } : null)
      setVerColgarAca(false)
    }
  }

  async function terminar() {
    // La lista se calcula ANTES de cerrar: `cerrar` limpia el borrador del teléfono y con él se
    // irían los escaneos de los que sale.
    const quedan = paraColgar(lib.escaneos, items)
    // ⚠️ Los escaneos se congelan por lo mismo que la lista: `cerrar` limpia el borrador del
    // teléfono, y el conteo sale justamente de ellos.
    const caminados = lib.escaneos
    const id = lib.recorridoId
    try {
      await lib.cerrar()
    } catch (e) {
      toast.error((e as Error).message)
      return
    }
    toast.ok('Recorrido guardado')
    cargarPrevios()
    setCierreLugar(null)
    setCierreFinal(quedan)
    setFase(quedan.length || caminados.length ? 'cierre' : 'config')
    setVerificacion(null)
    if (id && caminados.length) {
      leerRecorrido(marca, id)
        .then((r) => setVerificacion(compararConHistorial(caminados, r.escaneos)))
        .catch(() => setVerificacion('sin-leer'))
    }
  }

  async function eliminar() {
    const n = lib.escaneos.length
    const ok = await confirmar({
      titulo: '¿Eliminar este recorrido?',
      tono: 'danger',
      ok: 'Eliminar',
      mensaje: `Se van los ${n} ${n === 1 ? 'escaneo' : 'escaneos'} con sus lugares, acá y en el servidor. No se puede deshacer.`,
    })
    if (!ok) return
    try {
      await lib.eliminar()
    } catch (e) {
      // 🔑 «Ese recorrido no está» ⛔ no es una falla: pasa cuando nunca llegó a subir (sin señal),
      // y el borrador del teléfono ya se limpió igual. Cortar acá dejaba la pantalla trabada en el
      // recorrido, con un cartel rojo, sobre algo que sí se eliminó.
      const msg = (e as Error).message
      if (!/no está/i.test(msg)) toast.error('No se pudo eliminar: ' + msg)
    }
    setFase('config')
    cargarPrevios()
  }

  async function bajarExcel(escaneos: EscaneoLibre[], cuando: string) {
    if (!escaneos.length) {
      toast.aviso('Todavía no hay nada escaneado.')
      return
    }
    await descargarXlsx(filasExport(escaneos), {
      archivo: `chequeo-exhibicion-${marca}-${cuando.slice(0, 10)}.xlsx`,
      hoja: 'Exhibición',
      anchos: ANCHOS_EXPORT,
    })
  }

  function abrirPrevio(id: string) {
    void leerRecorrido(marca, id)
      .then((d) => {
        setViendo(d)
        setFase('ver')
      })
      .catch((e: Error) => toast.error('No se pudo abrir: ' + e.message))
  }

  const grupos = useMemo(() => agruparPorLugar(lib.escaneos), [lib.escaneos])
  const deEsteLugar = useMemo(() => grupos.find((g) => g.lugar === lib.lugar.trim())?.escaneos ?? [], [grupos, lib.lugar])
  /**
   * Lo que falta colgar **de este mueble**, en vivo.
   *
   * ⚠️ Va como **contador con un botón**, ⛔ no como una lista desplegada que se rearma a cada
   * escaneo: mientras se camina el perchero, cada color que todavía ⛔ no pasó por el lector figura
   * como faltante, así que desplegarla sería ruido puro justo cuando hay que mirar el lector. Se
   * abre cuando la persona quiere, y se corrige sola en cuanto el color aparece.
   */
  const colgarAca = useMemo(() => colgarEnLugar(paraColgar(lib.escaneos, items), lib.lugar), [lib.escaneos, items, lib.lugar])

  return (
    <>
      <HeaderAcciones>
        {fase === 'config' && (
          <>
            {lib.recorridoId && (
              <Button variant="outline" onClick={() => { prepararSonido(); setFase('scan'); foco(scanRef) }}>Retomar</Button>
            )}
            <Button variant="solid" tone="brand" onClick={iniciar} disabled={cargando || !items.length || !!lib.recorridoId}>
              Iniciar recorrido
            </Button>
          </>
        )}
        {fase === 'scan' && (
          <>
            <Button variant="ghost" tone="danger" onClick={() => void eliminar()}>Eliminar</Button>
            <Button variant="outline" onClick={() => void bajarExcel(lib.escaneos, new Date().toISOString())}>Excel</Button>
            <Button variant="solid" tone="brand" onClick={() => void terminar()} loading={lib.subiendo}>Terminar y guardar</Button>
          </>
        )}
        {fase === 'ver' && viendo && (
          <>
            <Button variant="outline" onClick={() => { setViendo(null); setFase('config') }}>← Volver</Button>
            <Button variant="solid" tone="brand" onClick={() => void bajarExcel(viendo.escaneos, viendo.recorrido.creado_en)}>Descargar Excel</Button>
          </>
        )}
      </HeaderAcciones>

      {/* ── Configurar ── */}
      {fase === 'config' && (
        <Card>
          {selector}

          {errorMsg ? (
            <Notice tone="danger" icon="⚠" style={{ marginBottom: space[4] }}>Error cargando inventario: {errorMsg}</Notice>
          ) : cargando ? (
            <Notice tone="neutral" icon="⏳" style={{ marginBottom: space[4] }}>Cargando inventario…</Notice>
          ) : (
            <Notice tone="neutral" icon="🏷️" style={{ marginBottom: space[4] }}>
              Escaneás lo que hay en cada lugar del local —un perchero, una mesa, la vidriera— y todo queda guardado con ese lugar.
              Tenés <b>{items.length}</b> variantes con stock en Local contra las que cruzar
              {/* 🔑 Las en cero se dicen acá: son la mitad del salón y **también se pueden escanear**.
                  Callarlas dejaba creer que una prenda sin stock no se podía registrar. */}
              {enCero > 0 && <> · <b>{enCero}</b> más figuran en cero y también se pueden escanear</>}.
              {/* 🔑 Stunned se dice ACÁ y ⛔ no se calla: es otra tienda y la revisa otro sector, pero
                  sus prendas están colgadas en el mismo salón. Quien camina tiene que saber que si
                  escanea un buzo de Stunned el teléfono se lo va a tomar —y ⛔ no va a contar—, o el
                  número de la cobertura se lee como si faltaran prendas que nadie tenía que mirar. */}
              {deStunned > 0 && (
                <>
                  {' '}Las <b>{deStunned}</b> de <b>Stunned</b> ⛔ no se chequean acá (tienen su propia pantalla): si escaneás una, se registra pero ⛔ no cuenta.
                </>
              )}
            </Notice>
          )}

          {/* 🔑 Los avisos se aprenden **antes** de caminar, ⛔ no en el primer perchero. */}
          <Notice tone="neutral" icon="🔊" style={{ marginBottom: space[4] }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
              {/* 🔑 Son dos cosas y se dicen en dos renglones: la persona que lo lee está por salir a
                  caminar el salón, ⛔ no estudiando la pantalla. */}
              <span>
                Mientras escaneás <b>no hace falta mirar el teléfono</b>. Son dos avisos:<br />
                • <b>Un pitido y un número</b> (doce, trece, catorce…) = la detectó. <b>Si el número sube, escaneó bien.</b><br />
                • <b>Un pitido grave y «de nuevo»</b> = ⛔ no la detectó: pasá la prenda otra vez.
              </span>
              <Button size="sm" variant="outline" onClick={escucharAvisos}>Escuchar los avisos</Button>
            </div>
            {/* 🔴 **«Se oye la voz pero no los pitidos» es un síntoma con nombre**, y pasó la primera
                noche: en iPhone el interruptor de silencio del costado apaga los pitidos y deja
                pasar la voz. Decirlo acá es la diferencia entre resolverlo en diez segundos y
                caminar el local entero a medias. */}
            {audio && (
              <div style={{ fontSize: font.sm, marginTop: space[2], color: audio === 'listo' ? color.mut : color.ink }}>
                {audio === 'listo' && <>Si escuchás la voz pero <b>no los pitidos</b>, es el <b>interruptor de silencio</b> del costado del teléfono: la voz lo ignora y los pitidos no.</>}
                {audio === 'bloqueado' && <>El teléfono todavía ⛔ no deja sonar. Subí el volumen, sacalo de silencio y tocá de nuevo.</>}
                {audio === 'sin-audio' && <>Este navegador ⛔ no puede hacer sonidos. La voz puede andar igual.</>}
              </div>
            )}
          </Notice>

          {lib.recorridoId && (
            <Notice tone="brand" icon="↩" style={{ marginBottom: space[4] }}>
              Hay un recorrido en curso con <b>{lib.escaneos.length}</b> {lib.escaneos.length === 1 ? 'escaneo' : 'escaneos'}
              {lib.sinSubir > 0 && <> · <b>{lib.sinSubir}</b> sin subir</>}. Tocá <b>Retomar</b> para seguir.
            </Notice>
          )}

          <Subtitulo>Recorridos anteriores</Subtitulo>
          {previos === null ? (
            // 🔑 «No se pudo preguntar» ⛔ no es «no hay ninguno»: un cero acá se leería como que
            // nunca se hizo un recorrido, que es exactamente lo contrario de lo que pasa.
            <div style={{ color: color.mut, fontSize: font.sm, padding: '8px 0' }}>No se pudo leer la lista de recorridos.</div>
          ) : previos.length === 0 ? (
            <div style={{ color: color.mut, fontSize: font.sm, padding: '8px 0' }}>Todavía no hay ninguno guardado.</div>
          ) : (
            previos.map((r) => (
              <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', padding: '8px 4px', borderBottom: `1px solid ${color.line}`, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: font.base, color: color.ink }}>
                    {fechaHora(r.creado_en)} · {r.persona || 'sin nombre'}
                  </div>
                  <div style={{ fontSize: font.xs, color: color.mut }}>
                    {r.escaneos ?? 0} {r.escaneos === 1 ? 'escaneo' : 'escaneos'} · {r.estado === 'cerrado' ? 'cerrado' : 'sin cerrar'}
                    {/* 🔑 El balance es de otra persona y de otro momento, así que la lista tiene
                        que decir cuáles esperan que alguien los mire. */}
                    {r.estado === 'cerrado' && (r.cobertura ? <> · <b>balance hecho</b></> : <> · sin balance</>)}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => abrirPrevio(r.id)}>Ver</Button>
              </div>
            ))
          )}
        </Card>
      )}

      {/* ── Recorrer ── */}
      {fase === 'scan' && (
        <Card>
          <Field label="¿En qué lugar estás?" hint="Por ejemplo: perchero tops. Cuando termines de escribirlo, tocá Enter y ya podés escanear." width={320}>
            <Input
              ref={lugarRef}
              value={lib.lugar}
              onChange={(e) => lib.setLugar(e.target.value)}
              /*
               * 🔴 **El lector de códigos TIPEA, y termina con Enter.** Si el foco quedó acá, el
               * código de barras entra como si fuera el nombre del lugar: el escaneo se pierde y
               * ⛔ nadie se entera —no hay error, el campo simplemente dice «7790001234567»—. Por
               * eso Enter y salir del campo mandan el foco al escaneo, que es donde tiene que
               * estar todo el tiempo que se camina.
               */
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  foco(scanRef)
                }
              }}
              onBlur={() => lib.lugar.trim() && foco(scanRef)}
              // 🔑 `datalist` y ⛔ no un desplegable: el salón se reacomoda, y una lista cerrada que
              // no tiene el perchero de hoy obliga a elegir uno que miente.
              list="mo-exhib-lugares"
              placeholder="perchero tops"
              autoComplete="off"
              style={{ height: 44, fontSize: 16 }}
            />
          </Field>
          <datalist id="mo-exhib-lugares">
            {lib.sugerencias.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>

          <div style={{ display: 'flex', gap: space[2], alignItems: 'center', margin: `${space[3]}px 0`, flexWrap: 'wrap' }}>
            <input
              ref={scanRef}
              className="mo-input"
              type="text"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  marcar((e.target as HTMLInputElement).value)
                  ;(e.target as HTMLInputElement).value = ''
                }
              }}
              placeholder="código de barras"
              aria-label="Código de barras"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              style={{ flex: '1 1 240px', maxWidth: 320, height: 46, fontSize: 17, textAlign: 'center', borderWidth: 2, borderColor: color.brandSolid }}
            />
            <Button
              variant="solid"
              tone="brand"
              size="lg"
              onClick={() => {
                if (scanRef.current) {
                  marcar(scanRef.current.value)
                  scanRef.current.value = ''
                  scanRef.current.focus()
                }
              }}
            >
              Marcar
            </Button>
          </div>

          <div style={{ minHeight: 26, marginBottom: space[3] }}>
            {fb?.tipo === 'ok' && (
              <Notice tone="success" icon="✓">
                <div>{fb.it.name} · {fb.it.size}</div>
                <div style={{ marginTop: 2 }}><PrecioEtiqueta it={fb.it} /></div>
              </Notice>
            )}
            {/* 🔑 La prenda EN CERO es un hallazgo con nombre y apellido, ⛔ no un código huérfano:
                existe, está colgada, y el sistema la tiene en cero. Hasta el 19-sep-2026 el lector
                ni siquiera la encontraba y caía en «no cruzó», junto con las lecturas malas. */}
            {fb?.tipo === 'stock-cero' && (
              <Notice tone="warning" icon="⚠">
                <div style={{ fontWeight: 700 }}>{fb.it.name}{fb.it.size ? ` · ${fb.it.size}` : ''} — el sistema la tiene en CERO</div>
                <div style={{ margin: '2px 0' }}><PrecioEtiqueta it={fb.it} /></div>
                <div>Queda anotada con este lugar: está colgada y el stock está mal.</div>
              </Notice>
            )}
            {/* 🔑 El que no cruza se GUARDA, y el cartel lo dice. Antes se contestaba «ese código no
                está en la lista» y el dato se perdía: una prenda colgada que no figura en el Local
                es justo lo que después nadie puede reconstruir.
                🔴 **Y desde el 20-sep-2026 tampoco frena cuando el código engancha VARIAS.** Antes
                abría un panel para elegir cuál era, y eso se lo preguntaba a quien tiene el lector
                en la mano: «yo no la frenaría a la chica que escanea, luego prefiero hacer el
                balance yo mismo» (Bruno). Lo que corresponde decirle es **pasala de nuevo**, que la
                prenda todavía está ahí; quién era se resuelve después, mirando el recorrido. */}
            {fb?.tipo === 'no-cruzo' && (
              <Notice tone="warning" icon="⚠">
                <div style={{ fontWeight: 700 }}>{fb.e.codigo_crudo} no quedó identificado</div>
                <div>
                  {fb.parecidos
                    ? `Queda anotado igual, con este lugar. Ese código da con ${fb.parecidos} ${fb.parecidos === 1 ? 'prenda' : 'prendas'}: si podés, pasá la prenda de nuevo con el lector.`
                    : 'Queda anotado igual, con este lugar: está colgado y el sistema no lo tiene.'}
                </div>
              </Notice>
            )}
            {/* 🔴 El repetido ⛔ ya no frena nada: suma y sigue. El cartel es para que la persona
                vea que quedó contado —«van 3»—, que es justo lo que antes ⛔ no se podía anotar. */}
            {fb?.tipo === 'sumado' && (
              <Notice tone="brand" icon="＋">
                <b>Van {fb.veces}</b> de esta prenda en «{fb.e.lugar}»{fb.it ? ` · ${fb.it.name}${fb.it.size ? ' · ' + fb.it.size : ''}` : ''}.
              </Notice>
            )}
            {/* ⚠️ El lector entra como teclado y repite el Enter solo. Ese rebote ⛔ no es una
                segunda prenda, y contarlo sería inventar una unidad que no está colgada. */}
            {fb?.tipo === 'doble-lectura' && (
              <Notice tone="neutral" icon="↺">
                Doble lectura del aparato: no se contó. Siguen siendo <b>{fb.veces}</b>. Si hay otra de verdad, pasala de nuevo.
              </Notice>
            )}
          </div>

          {lib.errorMsg && (
            <Notice tone="warning" icon="📡" style={{ marginBottom: space[3] }}>
              <div style={{ fontWeight: 700 }}>Hay {lib.sinSubir} {lib.sinSubir === 1 ? 'escaneo' : 'escaneos'} sin subir</div>
              <div style={{ margin: '2px 0 8px' }}>Seguí escaneando: no se pierde nada, queda guardado en el teléfono hasta que suba. ({lib.errorMsg})</div>
              <Button size="sm" variant="outline" onClick={() => void lib.reintentar()} loading={lib.subiendo}>Reintentar</Button>
            </Notice>
          )}

          {/* El mueble que se acaba de dejar, con lo que quedó sin colgar: se avisa cuando todavía
              se puede volver tres pasos, ⛔ no al final del recorrido. */}
          {cierreLugar && (
            <div style={{ position: 'relative' }}>
              <ParaColgar lista={cierreLugar.lista} titulo={`Antes de irte de «${cierreLugar.lugar}»`} plegable />
              <Button size="sm" variant="ghost" style={{ position: 'absolute', top: 6, right: 6 }} onClick={() => setCierreLugar(null)}>
                Listo
              </Button>
            </div>
          )}

          {colgarAca.length > 0 && (
            <Notice tone="neutral" icon="🧺" style={{ marginBottom: space[3] }}>
              <div style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap' }}>
                <span>
                  De lo que colgaste acá faltan <b>{colgarAca.length}</b> {colgarAca.length === 1 ? 'color o talle' : 'colores o talles'} ({resumenColgar(colgarAca).unidades} u).
                </span>
                <Button size="sm" variant="outline" onClick={() => setVerColgarAca((v) => !v)}>
                  {verColgarAca ? 'Ocultar' : 'Ver cuáles'}
                </Button>
              </div>
            </Notice>
          )}
          {verColgarAca && <ParaColgar lista={colgarAca} titulo={`Falta colgar en «${lib.lugar.trim()}»`} plegable />}

          <Subtitulo>
            {lib.enEsteLugar} {lib.enEsteLugar === 1 ? 'escaneo acá' : 'escaneos acá'} · {lib.escaneos.length} en el recorrido
            {lib.sinSubir > 0 && ` · ${lib.sinSubir} sin subir`}
          </Subtitulo>
          {/* 🔴 **Se dibujan las ÚLTIMAS, ⛔ no todas, y es por velocidad.** Esta lista se rearma en
              CADA escaneo: con el sector entero adentro serían cientos de filas —cada una con su
              botón— redibujándose mientras la persona ya está pasando la prenda siguiente. Medido
              el 20-sep-2026, la cuenta de un escaneo con 400 ya escaneados tarda **0,4 ms**; lo que
              pesa ⛔ no es calcular, es dibujar. Y quien escanea sólo mira **la última** para
              confirmar que enganchó: el resto está en el Excel y en la base.
              ⚠️ El contador de arriba sigue diciendo el total, así que ⛔ no se esconde nada. */}
          <div style={{ maxHeight: 340, overflowY: 'auto' }}>
            {deEsteLugar.length ? (
              <>
                {deEsteLugar.slice(0, verTodosLosEscaneos ? undefined : TOPE_FILAS).map((e) => (
                  <FilaEscaneo key={e.variante_id} e={e} onSacar={lib.sacar} />
                ))}
                {!verTodosLosEscaneos && deEsteLugar.length > TOPE_FILAS && (
                  <div style={{ padding: '10px 4px', textAlign: 'center' }}>
                    <Button size="sm" variant="ghost" onClick={() => setVerTodosLosEscaneos(true)}>
                      Ver los {deEsteLugar.length} de este lugar
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div style={{ color: color.mut, padding: 14, textAlign: 'center' }}>
                {lib.lugar.trim() ? 'Nada escaneado en este lugar todavía.' : 'Escribí el lugar y empezá a escanear.'}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ── El cierre de la caminata: qué hay que ir a colgar ── */}
      {fase === 'cierre' && (
        <Card>
          {verificacion === 'sin-leer' && (
            <Notice tone="warning" icon="📶" style={{ marginBottom: space[3] }}>
              No se pudo comprobar el historial ahora. Buscá este recorrido en la lista y tocá «Ver» cuando haya señal.
            </Notice>
          )}
          {verificacion && verificacion !== 'sin-leer' && (verificacion.faltan.length === 0 && verificacion.telefono === verificacion.historial ? (
            <Notice tone="success" icon="✓" style={{ marginBottom: space[3] }}>
              El teléfono contó <b>{verificacion.telefono}</b> · en el historial hay <b>{verificacion.historial}</b>. Quedó todo guardado.
            </Notice>
          ) : (
            <Notice tone="danger" icon="⚠️" style={{ marginBottom: space[3] }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                El teléfono contó {verificacion.telefono} · en el historial hay {verificacion.historial}
              </div>
              {verificacion.faltan.length > 0 && (
                <div style={{ fontSize: font.sm }}>
                  Faltan en el historial:{' '}
                  {verificacion.faltan.map((f) => `${f.nombre}${f.talle ? ` ${f.talle}` : ''}${f.reconocida ? '' : ' (no reconocida)'} en «${f.lugar}» (${f.faltan})`).join(', ')}.
                </div>
              )}
            </Notice>
          ))}
          <ParaColgar
            lista={cierreFinal}
            titulo="Terminaste. Para colgar"
            archivo={`para-colgar-${marca}-${new Date().toISOString().slice(0, 10)}.xlsx`}
          />
          {/* ⛔ «El conteo» en UNIDADES se sacó el 26-sep-2026: a Bruno le interesa que esté
              exhibida, ⛔ cuántas hay (regla del 21-sep). `Analisis.tsx` queda sin usar en el libre. */}
          <Button variant="solid" tone="brand" onClick={() => { setCierreFinal([]); setVerificacion(null); setFase('config') }}>
            Listo
          </Button>
        </Card>
      )}

      {/* ── Ver uno guardado ── */}
      {fase === 'ver' && viendo && (
        <Card>
          {/*
            🔑 **El titular que antes sólo estaba en la planilla.** Quién, qué día, de qué hora a
            qué hora, cuántos muebles y cuántos hallazgos: para saberlo había que bajar el Excel, y
            eso ⛔ no se hace parado en el local. Bruno: *«que tenga registro de hora, día y quién»*.
            ⚠️ Las horas son del **reloj del teléfono que escaneó**, ⛔ no de cuándo subió la cola.
          */}
          <Notice tone="neutral" icon="📋" style={{ marginBottom: space[4] }}>
            <div style={{ fontWeight: 700 }}>
              {fechaDe(viendo.recorrido.creado_en)} · {viendo.recorrido.persona || 'sin nombre'} ·{' '}
              {viendo.recorrido.estado === 'cerrado' ? 'cerrado' : 'sin cerrar'}
            </div>
            {(() => {
              const r = resumenRecorrido(viendo.escaneos)
              return (
                <div style={{ fontSize: font.sm }}>
                  <b>{r.escaneos}</b> {r.escaneos === 1 ? 'escaneo' : 'escaneos'} en <b>{r.lugares}</b>{' '}
                  {r.lugares === 1 ? 'lugar' : 'lugares'}
                  {r.desde && <> · de <b>{hora(r.desde)}</b> a <b>{hora(r.hasta)}</b></>}
                  {r.enCero > 0 && <> · <b>{r.enCero}</b> en cero</>}
                  {r.noCruzo > 0 && <> · <b>{r.noCruzo}</b> sin cruzar</>}
                </div>
              )
            })()}
          </Notice>

          {/* 🔴 **El balance va PRIMERO**, y ⛔ no es orden de pantalla: es lo que se viene a hacer
              cuando la empleada avisa que terminó el sector. «Para colgar» queda abajo porque es la
              lista conservadora —los hermanos de lo que tocó—, que sigue valiendo aunque nadie
              declare nada. */}
          <BalanceSector
            escaneos={viendo.escaneos}
            items={items}
            marca={marca}
            recorridoId={viendo.recorrido.id}
            cobertura={viendo.recorrido.cobertura}
            onTraerStock={onTraerStock}
            trayendo={trayendo}
            onGuardada={(c) => {
              setViendo({ ...viendo, recorrido: { ...viendo.recorrido, cobertura: c } })
              // La lista de atrás muestra cuáles ya tienen balance: sin esto, volver mostraría el
              // recorrido que se acaba de balancear como si siguiera pendiente.
              cargarPrevios()
            }}
          />

          {/* ⛔ «Para colgar» y «El conteo» se sacaron de acá el 26-sep-2026: daban otras dos
              respuestas a «¿qué falta?». */}

          {/*
            🔴 **Los códigos que quedaron sin identificar, con a qué prenda se parecen.**
            Es la otra mitad de «⛔ no frenar a quien escanea» (20-sep-2026): si el panel de
            candidatos ⛔ ya no aparece en el salón, la pregunta tiene que aparecer **acá**, donde
            mira quien decide. Sin esto, «⛔ no frenarla» sería perder el dato en silencio.
            ⚠️ Es informativo: dice **qué podía ser**, ⛔ no lo reasigna. Con el lector es raro —de 97
            escaneos reales, 97 engancharon por código de barras y sólo 2 quedaron así—.
          */}
          {(() => {
            const sinIdentificar = viendo.escaneos.filter((e) => !e.encontrado)
            if (!sinIdentificar.length) return null
            return (
              <Notice tone="warning" icon="❓" style={{ marginBottom: space[4] }}>
                <div style={{ fontWeight: weight.bold }}>
                  {sinIdentificar.length} {sinIdentificar.length === 1 ? 'código' : 'códigos'} sin identificar
                </div>
                {sinIdentificar.map((e) => {
                  // Las mismas dos puertas del escaneo: el código exacto que engancha a varias, o el
                  // pedazo que se parece a unas pocas.
                  const exactas = coincidencias(buscables, e.codigo_crudo)
                  const posibles = exactas.length ? exactas : candidatosPorCodigo(buscables, e.codigo_crudo)
                  return (
                    <div key={e.variante_id} style={{ padding: '6px 2px', borderBottom: `1px solid ${color.line}` }}>
                      <div style={{ fontSize: font.base, color: color.ink }}>
                        <b>{e.codigo_crudo}</b> <span style={{ color: color.mut }}>· {e.lugar} · {hora(e.escaneado_en)}</span>
                      </div>
                      <div style={{ fontSize: font.xs, color: color.mut }}>
                        {posibles.length
                          ? 'Puede ser: ' + posibles.slice(0, 6).map((c) => `${c.name}${c.size ? ' · ' + c.size : ''}`).join('  |  ')
                          : 'No se parece a ninguna prenda del Local: puede ser de otra marca, o stock sin ingresar.'}
                      </div>
                    </div>
                  )
                })}
              </Notice>
            )
          })()}

          {/* Los escaneos crudos son el respaldo, ⛔ lo que se viene a mirar: van plegados. */}
          <details>
            <summary style={{ cursor: 'pointer', fontSize: font.sm, color: color.mut, marginBottom: space[2] }}>
              Ver los {viendo.escaneos.length} escaneos
            </summary>
            {agruparPorLugar(viendo.escaneos).map((g) => (
              <div key={g.lugar} style={{ marginBottom: space[4] }}>
                <Subtitulo>{g.lugar} ({g.escaneos.length})</Subtitulo>
                {g.escaneos.map((e) => <FilaEscaneo key={g.lugar + e.variante_id} e={e} />)}
              </div>
            ))}
          </details>
        </Card>
      )}
    </>
  )
}

/** El precio que la etiqueta tendría que decir. Gemelo del de `Exhib.tsx`, sobre el escaneo guardado. */
function PrecioEtiqueta({ it }: { it: Pick<ExhibItem, 'precio' | 'promo'> }) {
  const { aCobrar, lista, enOferta, pct } = precioDeGondola(it)
  if (aCobrar == null) return <span style={{ fontSize: font.sm, color: color.mut }}>sin precio en Tienda Nube</span>
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: font['2xl'], fontWeight: weight.bold, color: color.ink }}>{formatMoney(aCobrar)}</span>
      {enOferta && (
        <span style={{ fontSize: font.sm, color: color.mut }}>
          <s>{formatMoney(lista!)}</s> · en oferta −{pct}%
        </span>
      )}
    </span>
  )
}

function Subtitulo({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: font.xs, fontWeight: 700, color: color.mut, marginBottom: space[2] }}>{children}</div>
}

function FilaEscaneo({ e, onSacar }: { e: EscaneoLibre; onSacar?: (e: EscaneoLibre) => void }) {
  // 🔑 El mismo `hallazgoDe` que escribe la columna del Excel: la pantalla y la planilla ⛔ no
  // pueden decir cosas distintas de la misma prenda.
  const hallazgo = hallazgoDe(e)
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 4px', borderBottom: `1px solid ${color.line}`, flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 160px', minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: font.base, color: hallazgo ? color.warningInk : color.ink }}>
          {e.encontrado ? `${e.product_name}${e.size ? ` · ${e.size}` : ''}` : `${e.codigo_crudo} · no cruzó`}
          {hallazgo && <span style={{ fontSize: font.xs, fontWeight: 700, marginLeft: 6 }}>· {hallazgo}</span>}
        </div>
        <div style={{ fontSize: font.xs, color: color.mut }}>
          {/* La hora de CADA escaneo, que hasta ahora sólo viajaba al Excel: es lo que deja
              reconstruir la caminata —y ver dónde se frenó— sin bajar nada. */}
          {hora(e.escaneado_en)} · {e.encontrado ? `SKU: ${e.sku || '—'} · Local: ${e.qty ?? '—'}` : 'No cruzó con el inventario del Local'}
          {e.cats.length > 0 && ` · ${catsVisibles(e.cats).join(' / ')}`}
        </div>
      </div>
      {onSacar && (
        <Button size="sm" variant="ghost" onClick={() => onSacar(e)}>sacar</Button>
      )}
    </div>
  )
}
