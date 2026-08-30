'use client'

/**
 * **Rentabilidad** — hasta cuánto se puede pagar por una compra, y por qué.
 *
 * # Qué contesta y a quién
 *
 * Contesta la única pregunta que todas las otras pantallas de Meta dejaban abierta: **¿esto rinde?**
 * Hasta acá cada «rinde / no rinde» era una opinión, porque el umbral vivía en una planilla aparte.
 * El que la mira es el que decide subir o bajar un presupuesto, y se tiene que ir con **un número**:
 * el techo de costo por compra.
 *
 * # Las tres decisiones de esta pantalla
 *
 * 1. 🔑 **La regla va ARRIBA de todo y en una frase.** Es lo único que hay que recordar; el resto
 *    del scroll existe para poder confiar en ella, no para leerlo cada vez.
 * 2. 🔑 **El semáforo es el costo por compra, no el ROAS.** El bloque «El mix de cobro» lo
 *    demuestra en vivo: entre todo-tarjeta y todo-transferencia el techo se mueve menos del 1% y el
 *    ROAS más del 10%. Como no sabemos el mix, el ROAS depende de un dato que no tenemos y el techo
 *    no. Corolario que ya confundió una vez y por eso está escrito en la pantalla: **si crece la
 *    transferencia, el ROAS de Ads Manager baja sin que la pauta empeore.**
 * 3. ⚠️ **Los supuestos son los de las fundas de BDI**, y el cartel lo dice. Se persisten por
 *    marca desde la segunda tanda.
 * 4. 🔴🔑 **El AIRE sale de la foto, ⛔ no de un número tipeado** (30-ago-2026, la tanda que la
 *    convierte de calculadora en alarma). Es la única línea de la pantalla que habla del PRESENTE,
 *    y hasta acá salía de `costoHoy`, un supuesto que se escribe a mano y que había envejecido en
 *    las dos fichas **y para lados opuestos**: BDI decía 2,70× de aire y tenía 1,17×; Zattia decía
 *    1,97× y tenía 6,62×. Ahora se lee la MISMA zona que dibuja Rendimiento (`useZona`) — ⛔ no una
 *    consulta propia, que sería la quinta copia de la misma división— y lo tipeado queda de
 *    respaldo para la línea que todavía no tiene un día cerrado con pedidos.
 *    ⚠️ `?recurso=rendimiento` está ARRIBA del guard de `META_ADS_TOKEN` en `api/meta-ads.js`, así
 *    que esta pantalla **sigue abriendo con el token vencido**, que es la razón por la que el resto
 *    de la ficha ⛔ no entra por ese endpoint.
 *
 * La matemática está toda en `lib/meta-ads/rentabilidad.ts`, con su banco de pruebas. Acá no se
 * calcula nada: **dos implementaciones del mismo margen es cómo se termina discutiendo cuál está
 * bien.**
 */

import { useMemo } from 'react'
import { useMeta } from '@/components/meta-ads/ContextoMeta'
import { PanelesDeSupuestos } from '@/components/meta-ads/rentabilidad/Supuestos'
import { useRentabilidad, type EstadoRentabilidad } from '@/components/meta-ads/rentabilidad/useRentabilidad'
import { useZona } from '@/components/meta-ads/zona/useZona'
import { plata, roas as equis, decimal, diaCorto } from '@/lib/meta-ads/formato'
import { ETIQUETA_LINEA } from '@/lib/meta-ads/lineas'
import {
  calcularRentabilidad, costoQueManda, escenariosDeFreno, proyeccionStock,
  type CostoMedido, type CostoVigente, type Rentabilidad as Resultado, type Supuestos,
} from '@/lib/meta-ads/rentabilidad'
import { VENTANA } from '@/lib/meta-ads/rendimiento'
import type { LineaPauta } from '@/lib/meta-ads/tipos'
import { InfoPopover } from '@/components/ui/InfoPopover'
import {
  Button, Card, KpiCard, Notice, SectionCard, Tabs, TBody, TableWrap, Td, Th, THead, Tr,
  color, font, space, weight, type TabItem,
} from '@/components/ui'

/** Millones, para las cifras del stock entero: `$132,5M`. Abajo de un millón se escribe entero. */
const millones = (v: number) =>
  Math.abs(v) >= 1e6 ? `$${(v / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 })}M` : plata(v)

export function Rentabilidad() {
  const { linea, setLinea, visibles } = useMeta()

  /**
   * 🔑 **La línea se valida al RENDERIZAR, no con un efecto que la corrija.**
   *
   * El eje de la sección admite «Todas», que acá no significa nada —el umbral es de una economía, y
   * tres economías no se promedian—. Así que se elige la primera visible y listo. Corregirlo con un
   * efecto dejaría un cuadro intermedio calculando contra otra línea, que es el patrón que ya mordió
   * tres veces en esta sección y que el lint del repo prohíbe (ver `ContextoMeta`).
   *
   * ⚠️ Tampoco se escribe el eje de vuelta: alguien que venía de Campañas mirando «Todas» y pasa
   * por acá tiene que encontrar «Todas» al volver. Lo que se elige EN estas pestañas sí lo escribe,
   * porque ahí la intención es explícita.
   */
  const laLinea: LineaPauta | null = linea !== 'todas' ? linea : (visibles[0] ?? null)

  if (!laLinea) {
    return <Notice tone="warning">No tenés ninguna línea de pauta habilitada para mirar.</Notice>
  }
  return <DeUnaLinea key={laLinea} laLinea={laLinea} visibles={visibles} setLinea={setLinea} />
}

/**
 * La pantalla de UNA línea.
 *
 * Va aparte y con `key={laLinea}` a propósito: cambiar de pestaña **remonta todo**. Cada línea es
 * su propia economía, y arrastrar lo que se estaba editando de BDI a la pestaña de Zattia sería
 * mostrarle a Zattia los números de otro producto.
 */
export function DeUnaLinea({ laLinea, visibles, setLinea }: {
  laLinea: LineaPauta
  visibles: LineaPauta[]
  setLinea: (l: LineaPauta) => void
}) {
  const m = useRentabilidad(laLinea)
  const s = m.supuestos

  /**
   * 🔑 **La foto de la línea, que es lo que convierte esta pantalla en una alarma.**
   *
   * Se pide la MISMA zona que dibuja Rendimiento (`useZona`), ⛔ no una consulta propia: el costo
   * por compra contra el techo ya está calculado ahí, y una segunda cuenta acá sería la quinta copia
   * de la misma división. El día que la zona cambie de criterio, esta pantalla cambia con ella.
   */
  const z = useZona(laLinea, VENTANA)

  /**
   * Lo que la foto contesta, o `null` mientras no contesta. ⚠️ **`undefined` y `null` NO son lo
   * mismo acá**: `undefined` es «todavía no sé» (se está leyendo) y `null` es «ya sé, y no hay».
   * De esa diferencia cuelga que el aire diga «midiéndose» en vez de un número que después salta.
   */
  const medido: CostoMedido | null | undefined = useMemo(() => {
    if (z.estado.fase === 'cargando' || z.estado.fase === 'sin-linea') return undefined
    if (z.estado.fase === 'error') return null
    const zona = z.estado.data.zona
    if (!zona) return null
    return {
      costo: zona.totales.costoPedidoReal,
      pedidos: zona.totales.pedidos,
      desde: zona.desde,
      hasta: zona.hasta,
    }
  }, [z.estado])

  const vigente: CostoVigente | null = useMemo(
    () => (medido === undefined ? null : costoQueManda({ medido, tipeado: s.costoHoy })),
    [medido, s.costoHoy],
  )

  /**
   * 🔴 **La sustitución es UNA sola y acá.** `aire` y el renglón «el de hoy» de la proyección son
   * los dos únicos que leen `costoHoy`; pisarlo en el objeto que entra al cálculo los corrige a los
   * dos de una vez. Escribir la corrección en el JSX del KPI habría dejado la tabla de Stock
   * proyectando contra el número viejo, y dos números del mismo hecho que no atan es peor que uno
   * solo mal — 📌 [[feedback_areben_medido_no_reemplaza_calculado_en_un_solo_lugar]].
   *
   * ⚠️ Se sustituye para CALCULAR, ⛔ no en `m.supuestos`: lo que se guarda sigue siendo lo que la
   * persona escribió, y `sucio` sigue midiendo lo que ella tocó.
   */
  const sCalculo = useMemo(
    () => (vigente && vigente.fuente === 'foto' ? { ...s, costoHoy: vigente.costo } : s),
    [s, vigente],
  )
  const r = useMemo(() => calcularRentabilidad(sCalculo), [sCalculo])

  const pestañas: TabItem[] = visibles.map((l) => ({ key: l, label: ETIQUETA_LINEA[l] }))

  const cabecera = (
    <>
      {/* Sin «Todas»: el umbral es de UNA economía. Sólo si hay más de una para elegir. */}
      {visibles.length > 1 && (
        <Tabs items={pestañas} value={laLinea} onChange={(k) => setLinea(k as LineaPauta)} />
      )}
      {m.error && <Notice tone="danger">{m.error}</Notice>}
    </>
  )

  /**
   * 🔴 **Mientras carga no se dibuja UN SOLO número.**
   *
   * El hook arranca en `DEFAULTS` —la economía de las fundas de BDI— y recién después llega la fila
   * de la línea. Como este componente va con `key={laLinea}`, **cambiar de marca lo remonta**, así
   * que ese arranque se repintaba en cada cambio de pestaña: durante un cuadro, las cinco tarjetas
   * y las cuatro tablas afirmaban un techo de **$9.101** que no es el de ninguna línea guardada —ni
   * siquiera el de BDI, que está en $6.755 desde el 21-ago—. Lo reportó Bruno el 22-ago-2026 y lo
   * describió exacto: «cada vez que cambio de marca, incluso en la de BDI, primero me aparece el
   * rendimiento anterior de BDI de 9 mil pesos de techo por compra».
   *
   * 🔑 **El defecto era MEDIA regla en la pantalla**: `cargando` existía y lo miraba únicamente el
   * cartel de `DeDondeSalen`, en la columna angosta. O sea que el cartel decía «leyendo…» mientras
   * el número grande de al lado afirmaba una cifra — que es peor que no mostrar nada, porque un
   * número dibujado no se lee como provisorio. Es la misma familia que el default que se hace pasar
   * por un dato medido, la advertencia que ya estaba escrita en `DEFAULTS` y en el hook.
   *
   * ⛔ No alcanza con dejar de remontar (sacar la `key`): eso arrastraría lo editado de una línea a
   * la otra, que es un defecto peor y está decidido al revés a propósito. El arreglo es no pintar.
   */
  if (m.cargando) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
        {cabecera}
        <Notice tone="neutral">Leyendo el umbral de {ETIQUETA_LINEA[laLinea]}…</Notice>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      {cabecera}

      <Regla r={r} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: space[3] }}>
        <KpiCard
          label="Techo por compra"
          value={plata(r.costoMax)}
          tone="brand"
          sub={<AireDeHoy vigente={vigente} medido={medido} aire={r.aire} fichaPropia={m.origen.guardado} />}
          info={<InfoPopover titulo="Techo por compra">El semáforo. Es lo máximo que se puede pagar por una compra sin comerse más ganancia de la que se decidió entregarle a la pauta.</InfoPopover>}
        />
        {s.saldoIva && (
          <KpiCard
            label="Techo con el saldo"
            value={plata(r.costoMaxCaja)}
            sub={<>Equilibrio de caja: <b>{equis(r.roasBECaja)}</b></>}
            info={<InfoPopover titulo="Techo con el saldo">Suma el IVA que se netea contra el saldo a favor en vez de pagarse. 🔴 <b>No es ganancia</b>: es plata propia que se descongela, de un stock finito, y la libera cualquier venta facturada. Sirve para un empujón deliberado y con fecha; <b>la regla permanente es el techo de arriba</b>.</InfoPopover>}
          />
        )}
        <KpiCard
          label="ROAS objetivo"
          value={equis(r.roasObj)}
          sub={<>Punto de equilibrio: <b>{equis(r.roasBE)}</b></>}
          info={<InfoPopover titulo="ROAS objetivo">El ROAS que corresponde al techo. 🔴 El break-even NO es el objetivo: entre los dos se gana plata, sólo que menos de la decidida. Confundirlos hace apagar campañas que están dando ganancia.</InfoPopover>}
        />
        <KpiCard
          label="Presupuesto diario"
          value={plata(r.diario)}
          sub={<>Para {decimal(s.ventasDia)} ventas por día</>}
          info={<InfoPopover titulo="Presupuesto diario">Lo que se puede gastar por día si cada compra sale el techo y se llega al objetivo de ventas.</InfoPopover>}
        />
        <KpiCard
          label="Vaciar el stock"
          value={`${decimal(r.dias)} días`}
          sub={<>{Math.round(r.compras).toLocaleString('es-AR')} compras · {millones(r.factu)}</>}
          info={<InfoPopover titulo="Vaciar el stock">A ese ritmo de ventas, cuánto tarda en venderse el stock cargado y cuánto factura.</InfoPopover>}
        />
      </div>

      <LaFichaContraLaFoto
        vigente={vigente}
        medido={medido}
        tipeado={s.costoHoy}
        fichaPropia={m.origen.guardado}
        puedeEditar={m.puedeEditar}
        adoptar={() => m.cambiar('costoHoy', Math.round(vigente?.costo ?? 0))}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 340px) 1fr', gap: space[4], alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
          <DeDondeSalen m={m} linea={laLinea} />
          <PanelesDeSupuestos s={s} cambiar={m.cambiar} soloLectura={!m.puedeEditar} />
          <BarraDeGuardado m={m} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
          <Cascada s={s} r={r} />
          <Canales s={s} r={r} />
          <Escenarios s={s} r={r} />
          <Stock s={s} r={r} />
        </div>
      </div>
    </div>
  )
}

/**
 * El aire, debajo del techo. **Es la única línea de esta pantalla que habla del PRESENTE.**
 *
 * 🔴 **Mientras la foto se lee ⛔ no se dibuja el número.** Pintar el aire del valor tipeado y
 * después reemplazarlo por el medido es exactamente el defecto que Bruno cazó el 22-ago-2026 con el
 * techo de $9.101: un número dibujado ⛔ no se lee como provisorio. Acá el salto sería peor, porque
 * los dos son plausibles — 📌 medido el 30-ago, BDI saltaba de 2,70× a 1,17×.
 *
 * 🔑 **La ventana va escrita al lado.** Cierra en el último día CERRADO de esa línea, que ⛔ no es
 * el mismo para todas: el 30-ago BDI cerraba el 29 y Zattia el 26. Sin la fecha, «pagás $913» se lee
 * como «hoy» y son seis días atrás.
 */
export function AireDeHoy({ vigente, medido, aire, fichaPropia }: {
  vigente: CostoVigente | null
  medido: CostoMedido | null | undefined
  aire: number
  /** 🔴 Con `false` el techo de arriba es el PRESTADO de BDI. Ver el caso de Stunned, abajo. */
  fichaPropia: boolean
}) {
  if (!vigente) return <>Leyendo la foto para saber cuánto estás pagando…</>
  if (vigente.fuente === 'ninguno') return <>Sin con qué compararlo: {vigente.motivo}.</>

  const ventana = medido?.desde ? `${diaCorto(medido.desde)}→${diaCorto(medido.hasta)}` : 'la foto'
  const cuanto = plata(vigente.costo)

  /**
   * 🔴🔑 **Sin ficha propia se muestra el COSTO y ⛔ NO el aire, y ⛔ no es una sutileza.**
   *
   * El costo medido es de ESTA línea y es real; el techo de arriba, cuando la línea no cargó su
   * economía, es el prestado de las fundas de BDI. Dividir uno por el otro da un número que ⛔ no es
   * de nadie: ni el aire de BDI (el costo es de otra línea) ni el de esta línea (el techo es de
   * otro producto). 📌 Es el caso de Stunned al 30-ago-2026 — $361 por pedido real y **cero ficha**.
   * Antes ⛔ no pasaba, porque los dos lados salían del mismo default y el número era al menos
   * internamente consistente. La medición mejora una mitad, y una mitad medida contra otra prestada
   * es 📌 [[feedback_areben_ratio_con_dos_ventanas]] con otra ropa.
   */
  if (!fichaPropia) {
    return (
      <>
        Pagás {cuanto} por pedido
        <br />
        <span style={{ color: color.mut2 }}>
          {vigente.fuente === 'foto' ? `medido sobre ${ventana}` : 'según la ficha'} · ⛔ sin aire:
          {' '}esta línea todavía ⛔ no cargó su economía y el techo de arriba es prestado
        </span>
      </>
    )
  }

  if (vigente.fuente === 'ficha') {
    return (
      <>
        Según la ficha pagás {cuanto} · <b>{decimal(aire)}× de aire</b>
        <br />
        <span style={{ color: color.mut2 }}>⛔ Sin medir: {vigente.motivo}.</span>
      </>
    )
  }
  return (
    <>
      Pagás {cuanto} · <b>{decimal(aire)}× de aire</b>
      <br />
      <span style={{ color: color.mut2 }}>
        medido sobre {ventana}{medido?.pedidos ? `, ${medido.pedidos} pedidos` : ''}
      </span>
    </>
  )
}

/**
 * **Lo que la ficha dice que se paga contra lo que la foto midió.**
 *
 * 🔴 El renglón existe porque los dos se despegan solos y nada avisa. 📊 Medido el 30-ago-2026:
 * BDI tenía $2.472 guardados contra $5.697 medidos (**−57%**) y Zattia $3.069 contra $913
 * (**+236%**) — las dos viejas, y para lados opuestos.
 *
 * 🔑 **Manda la foto igual, así que esto ⛔ no es una pregunta bloqueante**: es el aviso de que el
 * campo guardado quedó viejo, más la válvula para emparejarlo de un click. Sin la válvula, el número
 * tipeado se queda viejo para siempre y vuelve a mandar el día que la foto no conteste.
 */
export function LaFichaContraLaFoto({ vigente, medido, tipeado, fichaPropia, puedeEditar, adoptar }: {
  vigente: CostoVigente | null
  medido: CostoMedido | null | undefined
  tipeado: number
  /** 🔴 Con `false` lo tipeado ⛔ no es «la ficha»: son los defaults de BDI. Nada que emparejar. */
  fichaPropia: boolean
  puedeEditar: boolean
  adoptar: () => void
}) {
  // ⛔ Nada mientras se lee, y nada cuando no hay los dos números: un cartel que aparece y
  // desaparece en cada carga es ruido, y sin las dos mitades no hay nada que comparar.
  if (!vigente || vigente.discrepaPct == null || vigente.fuente !== 'foto') return null
  /**
   * 🔴 **Sin fila guardada esto ⛔ no se dibuja, y ⛔ no es un detalle.** Lo tipeado sería el
   * `costoHoy` de los DEFAULTS —la economía de las fundas de BDI—, así que el cartel diría «la ficha
   * de Stunned quedó vieja» sobre una ficha que ⛔ nunca existió, y el botón ofrecería emparejar un
   * número prestado. Quien tiene que aparecer ahí es el cartel que ya está: «cargá tu economía».
   */
  if (!fichaPropia) return null
  // Por debajo de esto son dos redondeos del mismo número, ⛔ no una ficha vieja.
  if (Math.abs(vigente.discrepaPct) < 10) return null
  const alto = vigente.discrepaPct > 0
  return (
    <Notice tone="warning" icon="📌">
      <b>La ficha quedó vieja en «Lo que pagás hoy».</b> Dice {plata(tipeado)} y la foto de{' '}
      {medido ? `${diaCorto(medido.desde)}→${diaCorto(medido.hasta)}` : 'la ventana'} mide{' '}
      {plata(vigente.costo)} por pedido real: lo guardado está un{' '}
      {Math.abs(Math.round(vigente.discrepaPct))}% {alto ? 'por encima' : 'por debajo'}. El aire y la
      proyección de acá abajo ya salen de <b>la foto</b>; lo guardado sólo vuelve a mandar el día que
      la foto no conteste.
      {puedeEditar && (
        <>
          {' '}
          <Button size="sm" variant="ghost" onClick={adoptar}>Emparejar la ficha</Button>
        </>
      )}
    </Notice>
  )
}

/**
 * De dónde salen los números que se están viendo. **Nunca calla.**
 *
 * Son tres estados y cada uno se lee distinto: los guardados de esta línea (con la firma de quién),
 * los defaults prestados porque la línea todavía no cargó los suyos, y los defaults porque la
 * lectura falló. El del medio es el que importa: los defaults son la economía de las fundas de BDI,
 * y mostrárselos a Zattia sin decirlo haría pasar el techo de un producto por el de otro.
 */
/**
 * De dónde salen los números que se están viendo.
 *
 * ⚠️ **Ya no pregunta por `cargando`**: desde el 22-ago-2026 el padre no dibuja nada mientras carga,
 * así que acá `cargando` es siempre `false`. El guard que estaba —y que era lo ÚNICO que miraba esa
 * bandera— es justo lo que hacía creíble el defecto: este cartel decía «leyendo…» al lado de un
 * techo de $9.101 dibujado como un hecho.
 */
function DeDondeSalen({ m, linea }: { m: EstadoRentabilidad; linea: LineaPauta }) {
  if (!m.origen.guardado) {
    return (
      <Notice tone="warning">
        <b>{ETIQUETA_LINEA[linea]} todavía no tiene sus números.</b> Lo que se ve es la economía de
        las <b>fundas de BDI</b>, que es de donde salió esta calculadora
        {linea === 'bdi' ? '' : ' — otro producto, otro costo y otro margen'}.
        {m.puedeEditar ? ' Cargá los suyos y guardá.' : ' Todavía no hay nada guardado para esta línea.'}
      </Notice>
    )
  }

  const cuando = m.origen.cuando
    ? new Date(m.origen.cuando).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
    : null

  return (
    <Notice tone="success">
      Los números de <b>{ETIQUETA_LINEA[linea]}</b>
      {m.origen.por ? <>, guardados por <b>{m.origen.por}</b></> : null}
      {cuando ? ` el ${cuando}` : null}.
      {!m.puedeEditar && ' Los podés mover para probar, pero el guardado es de un admin.'}
    </Notice>
  )
}

/**
 * Guardar y descartar. **Guardar es un botón y no un efecto**, y por eso esto existe.
 *
 * El umbral es lo que todas las otras pantallas leen como «rinde»: con autoguardado, arrastrar el
 * deslizador del reparto —que va de 10% a 100%— publicaría una decisión de negocio por cada pixel.
 * Mientras haya cambios sin guardar, la barra queda a la vista y lo dice.
 */
function BarraDeGuardado({ m }: { m: EstadoRentabilidad }) {
  if (!m.puedeEditar) {
    return (
      <div style={{ fontSize: font.xs, color: color.mut2, lineHeight: 1.5 }}>
        Mové lo que quieras: es una prueba tuya y no le cambia el umbral a nadie. Guardarlo es de un
        admin.
      </div>
    )
  }

  /**
   * 🔑 **Una línea sin fila propia se puede guardar SIN tocar nada.**
   *
   * Parecía un caso de borde y no lo es: el cartel de arriba dice «cargá los suyos y guardá», y con
   * el botón atado sólo a que haya cambios, la única forma de estrenar una línea era moverle algo y
   * volverlo atrás. Confirmar los números prestados **es** el acto: los convierte de «esto es lo de
   * BDI mientras no haya nada mejor» en «esto es lo de esta línea, y lo firmó alguien».
   */
  const estrenando = !m.origen.guardado
  const hayQueGuardar = m.sucio || estrenando
  const destacado = m.sucio

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: space[2],
        padding: space[3],
        border: `1px solid ${destacado ? color.warningBorder : color.line}`,
        background: destacado ? color.warningBg : color.surface,
        borderRadius: 10,
      }}
    >
      <span style={{ fontSize: font.sm, color: destacado ? color.warningInk : color.mut2, flex: 1 }}>
        {m.sucio ? 'Hay cambios sin guardar' : estrenando ? 'Todavía sin guardar' : 'Sin cambios'}
      </span>
      {m.sucio && (
        <Button variant="ghost" size="sm" onClick={m.descartar} disabled={m.guardando}>
          Descartar
        </Button>
      )}
      <Button size="sm" onClick={() => void m.guardar()} disabled={!hayQueGuardar || m.guardando}>
        {m.guardando ? 'Guardando…' : estrenando && !m.sucio ? 'Guardar estos números' : 'Guardar'}
      </Button>
    </div>
  )
}

/** La frase que hay que recordar. Va arriba de todo y repite el número grande a propósito. */
function Regla({ r }: { r: Resultado }) {
  return (
    <Card style={{ background: color.brandBg, borderColor: color.brandBorder, fontSize: font.md, lineHeight: 1.6 }}>
      Subir el presupuesto mientras el conjunto <b>tope su techo</b> y el costo por compra esté
      debajo de <b style={{ color: color.brandSolid }}>{plata(r.costoMax)}</b>. Frenar cuando lo
      pasa. Apagar debajo de <b style={{ color: color.brandSolid }}>{equis(r.roasBE)}</b>, que es
      donde la pauta se come toda la ganancia.
    </Card>
  )
}

/** De lo que paga el cliente a lo que queda: la cascada de una compra entera. */
function Cascada({ s, r }: { s: Supuestos; r: Resultado }) {
  const u = s.unidades
  const filas: ReadonlyArray<readonly [string, string, number, 'subtotal' | 'resta' | 'total']> = [
    ['Ingreso bruto', `${decimal(u)} unidades con descuento`, r.unidad.bruto * u, 'subtotal'],
    ['IVA', `${decimal(s.iva)}%`, -r.unidad.iva * u, 'resta'],
    ['Ingreso neto', '', r.unidad.neto * u, 'subtotal'],
    ['Producto', `${decimal(u)} × ${plata(s.costo)} sin IVA`, -r.unidad.producto * u, 'resta'],
    ['Ingresos Brutos', `${decimal(s.iibb)}%`, -r.unidad.iibb * u, 'resta'],
    ...(s.drei > 0 ? [['DREI', `${decimal(s.drei)}%`, -r.unidad.drei * u, 'resta'] as const] : []),
    ['Impuesto al cheque', `${decimal(s.cheque)}%`, -r.unidad.cheque * u, 'resta'],
    ['Comisiones', 'Tienda Nube + pasarela, según el mix', -r.unidad.comision * u, 'resta'],
    // El envío es del pedido y se factura con IVA: de la ganancia sale su neto.
    ...(s.envio > 0
      ? [['Envío', `${plata(s.envio)} con IVA, por pedido`, -(s.envio / (1 + s.iva / 100)), 'resta'] as const]
      : []),
    ['Queda para pauta y ganancia', '', r.contribPedido, 'total'],
    // 🔑 El recupero va DESPUÉS del total de ganancia, nunca sumado adentro: no lo generó la venta.
    ...(s.saldoIva
      ? ([
          ['El IVA vuelve', 'se netea contra el saldo a favor', r.recuperoPedido, 'resta'],
          ...(s.envio > 0 ? [['Envío, lo que falta', 'de la caja sale entero', -(s.envio - s.envio / (1 + s.iva / 100)), 'resta'] as const] : []),
          ['Caja que entra', 'ganancia + recupero', r.cajaPedido, 'total'],
        ] as const)
      : []),
  ]

  return (
    <SectionCard
      title="Una compra, de punta a punta"
      subtitle={`Ticket de ${plata(r.ticket)} — el mismo contra el que Meta calcula el ROAS`}
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {filas.map(([etq, sub, val, cls]) => (
          <div
            key={etq}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: space[3],
              padding: '7px 0',
              borderTop: cls === 'subtotal' || cls === 'total' ? `1px solid ${color.line}` : undefined,
              fontWeight: cls === 'total' ? weight.bold : cls === 'subtotal' ? weight.semibold : weight.normal,
              color: cls === 'total' ? color.successInk : cls === 'resta' ? color.mut : color.ink,
              fontSize: cls === 'total' ? font.lg : font.base,
            }}
          >
            <span>
              {etq}
              {sub && <span style={{ color: color.mut2, fontSize: font.xs, marginLeft: 6 }}>{sub}</span>}
            </span>
            <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{plata(val)}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: space[3], fontSize: font.sm, color: color.mut }}>
        Sobrevive <b style={{ color: color.ink2 }}>{decimal(r.margenPct)}%</b> de la venta bruta.
        Eso —y nada más— es lo que se reparte entre la pauta y la ganancia.
      </div>
    </SectionCard>
  )
}

/**
 * Los dos caminos de cobro, y **el bloque que sostiene toda la pantalla**: cuánto mueve el mix.
 *
 * El texto se arma con el resultado y no está clavado, porque el mismo motor con otros supuestos
 * puede dar vuelta la conclusión: si el descuento por transferencia sube lo suficiente, deja de
 * convenir. Un cartel fijo diciendo «transferencia deja más» mentiría en silencio.
 */
function Canales({ s, r }: { s: Supuestos; r: Resultado }) {
  const dif = r.transferencia.contrib - r.tarjeta.contrib
  const margen = (c: { contrib: number; bruto: number }) => (c.bruto > 0 ? (c.contrib / c.bruto) * 100 : 0)
  const { tarjeta: eT, transferencia: eX, spreadPct } = r.extremos
  const pesaPoco = spreadPct < 5

  return (
    <SectionCard
      title="Los dos caminos de cobro"
      info={<InfoPopover titulo="Los dos caminos de cobro">Todo por unidad. La transferencia cobra menos pero se ahorra la pasarela y la comisión de Tienda Nube.</InfoPopover>}
    >
      <TableWrap>
        <THead>
          <Tr>
            <Th>Por unidad</Th>
            <Th align="right">Con tarjeta</Th>
            <Th align="right">Por transferencia</Th>
          </Tr>
        </THead>
        <TBody>
          <Tr><Td>Precio que paga el cliente</Td><Td align="right">{plata(r.tarjeta.bruto)}</Td><Td align="right">{plata(r.transferencia.bruto)}</Td></Tr>
          <Tr><Td>Comisiones</Td><Td align="right">{plata(r.tarjeta.comision)}</Td><Td align="right">{plata(r.transferencia.comision)}</Td></Tr>
          <Tr>
            <Td><b>Te queda</b></Td>
            <Td align="right"><b style={{ color: dif <= 0 ? color.successInk : undefined }}>{plata(r.tarjeta.contrib)}</b></Td>
            <Td align="right"><b style={{ color: dif > 0 ? color.successInk : undefined }}>{plata(r.transferencia.contrib)}</b></Td>
          </Tr>
          <Tr><Td>Margen sobre la venta</Td><Td align="right">{decimal(margen(r.tarjeta))}%</Td><Td align="right">{decimal(margen(r.transferencia))}%</Td></Tr>
        </TBody>
      </TableWrap>

      <div style={{ marginTop: space[4], fontSize: font.base, lineHeight: 1.6 }}>
        {Math.abs(dif) < 1 ? (
          <>
            <b>Los dos caminos dejan lo mismo.</b> El descuento por transferencia se compensa exacto
            con la comisión que evita.
          </>
        ) : dif > 0 ? (
          <>
            <b>Transferencia deja {plata(dif)} más por unidad</b>, aunque cobre menos: el descuento
            sale más barato que la comisión que evita. 🔑 Empujarla es una palanca de margen que{' '}
            <b>no depende de la pauta</b> — a {Math.round(r.compras).toLocaleString('es-AR')} compras,
            cada punto de mix vale {plata((Math.abs(dif) * s.unidades * r.compras) / 100)}.
          </>
        ) : (
          <>
            <b>Tarjeta deja {plata(-dif)} más por unidad</b>: el descuento por transferencia salió
            más caro que la comisión que evita. Convendría achicarlo o empujar cuotas.
          </>
        )}
      </div>

      <div style={{ marginTop: space[4], paddingTop: space[3], borderTop: `1px solid ${color.line}`, fontSize: font.base, lineHeight: 1.6 }}>
        <div style={{ fontWeight: weight.semibold, marginBottom: space[1] }}>
          {pesaPoco ? 'El mix de cobro casi no mueve el techo' : 'El mix de cobro sí mueve el techo'}
          <InfoPopover titulo="El dato que falta">
            No sabemos qué proporción paga por transferencia. Este bloque existe para mostrar que,
            con estos supuestos, no hace falta saberlo para decidir.
          </InfoPopover>
        </div>
        <div>
          Entre <b>todo tarjeta</b> y <b>todo transferencia</b>, lo que se puede pagar por compra va
          de {plata(eT.costoMax)} a {plata(eX.costoMax)} — {decimal(spreadPct)}% de diferencia. El{' '}
          <b>ROAS</b>, en cambio, va de {equis(eT.roas)} a {equis(eX.roas)}, porque cambia el ticket
          que Meta reporta.
        </div>
        {pesaPoco && (
          <div style={{ marginTop: space[2], color: color.ink2 }}>
            ⇒ 🔑 <b>El semáforo es el costo por compra, no el ROAS</b>: es el único de los dos que no
            depende de un dato que no tenemos. Y si mañana crece la transferencia, el ROAS de Ads
            Manager va a <b>bajar sin que la pauta empeore</b> — no es una degradación.
          </div>
        )}
      </div>
    </SectionCard>
  )
}

/** Qué pasa si se le entrega a la pauta más o menos ganancia de la decidida. */
function Escenarios({ s, r }: { s: Supuestos; r: Resultado }) {
  const filas = escenariosDeFreno(s, r)
  return (
    <SectionCard
      title="Dónde poner el freno"
      subtitle="Cuánta de la ganancia se le entrega a la pauta, y qué techo sale de cada reparto"
    >
      <TableWrap>
        <THead>
          <Tr>
            <Th align="right">ROAS</Th>
            <Th>Reparto</Th>
            <Th align="right">Techo por compra</Th>
            <Th align="right">Por día</Th>
          </Tr>
        </THead>
        <TBody>
          {filas.map((e) => (
            <Tr key={e.reparto} style={e.elegido ? { background: color.brandBg } : undefined}>
              <Td align="right">
                <b style={{ color: e.tono === 'danger' ? color.danger : e.tono === 'warning' ? color.warning : e.tono === 'success' ? color.success : undefined }}>
                  {equis(e.roas)}
                </b>
              </Td>
              <Td>{e.etiqueta}</Td>
              <Td align="right">{plata(e.costoMax)}</Td>
              <Td align="right">{plata(e.diario)}</Td>
            </Tr>
          ))}
        </TBody>
      </TableWrap>
      <div style={{ marginTop: space[3], fontSize: font.sm, color: color.mut }}>
        La fila de arriba es el <b>punto de equilibrio</b>, no un objetivo: ahí la pauta se lleva
        toda la ganancia. Va en rojo por eso.
      </div>
    </SectionCard>
  )
}

/** Lo mismo, pero por el stock entero: la plata que hay del otro lado. */
function Stock({ s, r }: { s: Supuestos; r: Resultado }) {
  const filas = proyeccionStock(s, r)
  return (
    <SectionCard
      title={`Vender las ${s.stock.toLocaleString('es-AR')} unidades`}
      subtitle={`${Math.round(r.compras).toLocaleString('es-AR')} compras · ${millones(r.factu)} de facturación`}
    >
      <TableWrap>
        <THead>
          <Tr>
            <Th>Pagando por compra</Th>
            <Th align="right">Se va en pauta</Th>
            <Th align="right">Queda de ganancia</Th>
            <Th align="right">ROAS</Th>
          </Tr>
        </THead>
        <TBody>
          {filas.map((p) => (
            <Tr key={p.etiqueta}>
              <Td>
                {plata(p.costoPorCompra)}
                <span style={{ color: color.mut2, fontSize: font.xs, marginLeft: 6 }}>{p.etiqueta}</span>
              </Td>
              <Td align="right">{millones(p.pauta)}</Td>
              <Td align="right">
                <b style={{ color: p.ganancia > 0 ? color.successInk : color.danger }}>{millones(p.ganancia)}</b>
              </Td>
              <Td align="right">{equis(p.roas)}</Td>
            </Tr>
          ))}
        </TBody>
      </TableWrap>
    </SectionCard>
  )
}
