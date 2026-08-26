'use client'

/**
 * LA ZONA DE RENDIMIENTO — la entrada de Meta. **Qué apago, qué escalo, qué testeo hoy.**
 *
 * # Por qué esta pantalla existe
 *
 * Medido contra producción el 25-ago-2026: `meta_ads_regla`, `meta_ads_umbral` y
 * `meta_ads_hallazgo` estaban **las tres en cero** —el cron corría todas las mañanas y no producía
 * nada— y `meta_ads_accion` tenía 37 filas, todas de una sola persona. ⇒ **el módulo se usaba para
 * EJECUTAR y nunca para DECIDIR.** La prueba más incómoda es que ese mismo día se hizo una sesión
 * entera de análisis de la pauta —cruce con pedidos reales, elasticidad, techo re-medido, veredicto
 * por conjunto— y **no se abrió el monitor ni una vez**: se contestó con ~20 consultas a la base.
 * *Si la pantalla contestara la pregunta, se habría abierto.*
 *
 * # 🔑 Sale de la FOTO, y eso es lo que la deja ser una pantalla
 *
 * El Parte del día contesta casi lo mismo y **es un botón que copia texto para pegar en otro lado**:
 * la herramienta admitía que la decisión se toma afuera. No podía ser otra cosa, porque se arma con
 * cinco llamadas a Graph y el cupo de la Marketing API es un porcentaje. Esto sale de
 * `meta_ads_snapshot_dia`: se pide sola al entrar, tiene 90 días de historia y sigue contestando con
 * el token vencido.
 *
 * ⚠️ **Lo que no tiene es el día EN CURSO**, y se dice arriba en vez de disimularlo. Para eso sigue
 * estando el Parte, que ahora es lo que es: el botón que trae hoy.
 *
 * # Lo que NO está acá, a propósito
 *
 * Un bloque de hallazgos vacío igual se dibuja **y dice por qué está vacío**. Un bloque que sólo
 * aparece con malas noticias deja sin saber si el silencio es «está todo bien» o «no se miró» — que
 * es exactamente el estado en que estaba el motor.
 *
 * 🔴 Y el porqué **se pregunta, ⛔ no se afirma**: el primer texto decía «no hay reglas cargadas»
 * clavado, y siguió diciéndolo la tarde del 26-ago en que se prendieron las once. Hoy sale de
 * `silencioDeReglas()`, que separa las tres causas del silencio —sin reglas, prendidas pero todavía
 * sin correr, y corrieron sin encontrar nada— porque **sólo la última significa «está todo bien»**.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ModalesDeAccion, useAccionMeta } from '@/components/meta-ads/acciones'
import { useMeta } from '@/components/meta-ads/ContextoMeta'
import { BandaDeHoy } from '@/components/meta-ads/parte/BandaDeHoy'
import { ParteDelDia } from '@/components/meta-ads/parte/ParteDelDia'
import { useParte } from '@/components/meta-ads/parte/useParte'
import { PlanesEnCurso } from '@/components/meta-ads/planes/PlanesEnCurso'
import { HallazgosPanel } from '@/components/meta-ads/reglas/HallazgosPanel'
import { PodaPendiente, usePoda } from '@/components/meta-ads/reglas/PodaPendiente'
import { useReglas } from '@/components/meta-ads/reglas/useReglas'
import { TablaCeldas } from '@/components/meta-ads/zona/TablaCeldas'
import { useZona } from '@/components/meta-ads/zona/useZona'
import { entero, plata } from '@/lib/meta-ads/formato'
import { DIAS_ZONA, type RespuestaZona } from '@/lib/meta-ads/rendimiento'
import { silencioDeReglas, type Regla } from '@/lib/meta-ads/reglas'
import { ETIQUETA_LINEA } from '@/lib/meta-ads/lineas'
import type { Acciones } from '@/components/meta-ads/acciones/tipos'
import type { LineaPauta } from '@/lib/meta-ads/tipos'
import {
  Button, Card, EmptyState, KpiCard, Notice, Plegable, SectionCard, TBody, TableWrap, Td, Th, THead,
  Tr, color, font, space, weight,
} from '@/components/ui'

export function ZonaRendimiento() {
  const { linea, setLinea, visibles, laCuenta } = useMeta()
  const [dias, setDias] = useState<number>(7)
  // 🔑 La zona es de UNA línea y no es una comodidad: adentro de la misma cuenta publicitaria
  // conviven BDI y Zattia, y dividir el gasto de las dos por los pedidos de una da un costo por
  // pedido que no existe. Con una sola línea visible se elige sola; con varias, se pide.
  const laLinea: LineaPauta | null = linea !== 'todas' ? linea : visibles.length === 1 ? visibles[0] : null
  const { estado, recargar } = useZona(laLinea, dias)
  const acciones = useAccionMeta(recargar)
  const r = useReglas()
  // 🔴 **Se pide sola, y eso cambia una decisión que estaba escrita.** El motivo por el que el parte
  // no se pedía solo era una SUPOSICIÓN sobre el cupo; medido el 26-ago contra prod, la cuenta está
  // en 1-3%. Los candados que hacen segura la decisión —caché, dedup y la hora a la vista— viven en
  // `useParte`, ⛔ no acá.
  const parte = useParte(laCuenta ? laCuenta.id : null, laLinea || undefined)
  const lineasDeReglas = useMemo(() => (laLinea ? [laLinea] : []), [laLinea])
  const poda = usePoda(lineasDeReglas)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      {/* 🔑 Primero de todo: es la pantalla de arranque. Y no rompe la invariante de `PlanesEnCurso`
          —«va antes que la zona porque no depende de la foto»— porque la banda TAMPOCO sale de la
          foto: sale de Meta, que es lo único que tiene el día en curso. */}
      {parte.estado.fase === 'ok' && (
        <BandaDeHoy
          b={parte.estado.dato.banda}
          fecha={parte.estado.dato.fechas.hoy}
          leidoA={parte.estado.leidoA}
          actualizar={parte.actualizar}
          error={parte.error}
        />
      )}

      {/* Va antes que todo y no depende de la zona: sale de la base, así que se ve aunque la foto
          esté vacía — que es justo cuando importa saber qué quedó a medias en Meta. */}
      <PlanesEnCurso />

      {!laLinea ? (
        <EmptyState
          title="Elegí una marca arriba"
          hint="La zona de rendimiento es de una sola línea: el techo por compra, los pedidos reales y la meta son de una marca, y mezclarlas da un costo por pedido que no existe."
          dashed
        />
      ) : (
        <>
          <BarraVentana dias={dias} setDias={setDias} />

          {estado.fase === 'cargando' && <Card style={{ color: color.mut2 }}>Leyendo la foto de la pauta…</Card>}

          {estado.fase === 'error' && (
            <Notice tone="danger">
              No se pudo leer la zona: {estado.motivo}
              <div style={{ fontSize: font.sm, marginTop: space[1] }}>
                Esto sale de la base y no de Meta, así que un token vencido no es la causa.
              </div>
            </Notice>
          )}

          {estado.fase === 'ok' && <Contenido d={estado.data} dias={dias} acciones={acciones.acciones} />}
          {/* Los cinco modales de escritura, dibujados una vez para toda la pantalla. */}
          <ModalesDeAccion m={acciones.modales} />
        </>
      )}

      <SectionCard
        title="Qué hay que decidir"
        subtitle="Lo que detectaron las automatizaciones. Sale de la base, así que se ve aunque Meta no conteste."
      >
        {r.hallazgos.length === 0 && poda.resumenes.length === 0 ? (
          // 🔴 Se dice que está vacío Y POR QUÉ, y el porqué **se pregunta**: hasta el 26-ago-2026
          // esta frase afirmaba «no hay reglas cargadas» con el texto clavado, y siguió diciéndolo
          // la tarde en que se prendieron las once. Un cartel que manda a cargar reglas al que ya
          // las cargó es el que hace que se le deje de creer a la pantalla. Ver `silencioDeReglas`.
          <Silencio reglas={r.estado.fase === 'ok' ? r.estado.data.reglas : null} cargando={r.estado.fase === 'cargando'} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
            <HallazgosPanel hallazgos={r.hallazgos} quitar={r.quitar} />
            <PodaPendiente resumenes={poda.resumenes} recargar={poda.recargar} />
          </div>
        )}
      </SectionCard>

      {/* 🔑 El Parte queda como lo que ahora es: el MISMO día en curso de la banda de arriba, pero
          entero y en texto para pegarlo en una conversación. Comparte `useParte`, así que abrirlo
          ⛔ no pide nada — las cinco llamadas ya se hicieron una vez. */}
      <ParteDelDia cuenta={laCuenta ? laCuenta.id : null} linea={laLinea || undefined} />

      <SinLinea visibles={visibles} linea={linea} setLinea={setLinea} />
    </div>
  )
}

/**
 * El reloj entra acá y no adentro del render: `react-hooks/purity` prohíbe `Date.now()` en el
 * cuerpo de un componente, y con razón. El núcleo lo recibe como parámetro para poder probarlo.
 */
function leerSilencio(reglas: Regla[] | null) {
  return silencioDeReglas(reglas, Date.now())
}

/**
 * El cartel de cuando no hay nada que decidir. **Dice por qué está vacío, y el porqué lo mide.**
 *
 * 🔑 Sólo una de las tres causas es buena noticia, y la que manda a cargar reglas aparece **sólo si
 * de verdad no hay ninguna prendida**. La decisión vive en `silencioDeReglas()` —con `ahora` como
 * parámetro, para poder probarla— y acá queda nada más que a dónde lleva el link.
 */
function Silencio({ reglas, cargando }: { reglas: Regla[] | null; cargando: boolean }) {
  const s = leerSilencio(reglas)
  return (
    <div style={{ fontSize: font.base, color: color.mut, lineHeight: 1.5 }}>
      {cargando ? 'Buscando las automatizaciones…' : s.texto}
      {s.clase === 'sin-reglas' && (
        <>
          {' '}
          <Link href="/meta-ads/automatizaciones" style={{ color: color.brandSolid, fontWeight: weight.semibold }}>
            Prenderlas →
          </Link>
        </>
      )}
    </div>
  )
}

/** El selector de ventana. Los tres valores son los que el servidor acepta; ⛔ no hay uno libre. */
function BarraVentana({ dias, setDias }: { dias: number; setDias: (n: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
      <span style={{ fontSize: font.sm, color: color.mut }}>Mirando los últimos:</span>
      {DIAS_ZONA.map((n) => (
        <Button key={n} size="sm" variant={n === dias ? 'solid' : 'ghost'} onClick={() => setDias(n)}>
          {n} días
        </Button>
      ))}
    </div>
  )
}

function Contenido({ d, dias, acciones }: {
  d: RespuestaZona
  dias: number
  acciones: Acciones
}) {
  if (!d.zona) {
    return <Notice tone="warning">{d.motivo || 'La foto no tiene ningún día cerrado todavía.'}</Notice>
  }
  const z = d.zona
  const t = z.totales
  const conc = z.concentracion.mayor

  return (
    <>
      {d.problemas.length > 0 && (
        <Notice tone="warning">
          La zona salió, pero sin esto:
          <ul style={{ margin: `${space[1]}px 0 0`, paddingLeft: space[4] }}>
            {d.problemas.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </Notice>
      )}

      <Cabecera d={d} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: space[2] }}>
        <KpiCard label="Gasto" value={plata(t.spend)} sub={`${z.desde} → ${z.hasta}`} />
        <KpiCard
          label="Pedidos reales"
          value={entero(t.pedidos)}
          sub={`${t.pedidosDia.toFixed(1)}/día${z.objetivoPedidos ? ` · meta ${z.objetivoPedidos}` : ''}`}
        />
        <KpiCard
          label="Costo por pedido"
          value={t.pedidos ? plata(t.costoPedidoReal) : '—'}
          sub={t.pctTecho == null ? 'sin techo cargado' : `${Math.round(t.pctTecho)}% del techo`}
          tone={t.pctTecho != null && t.pctTecho > 100 ? 'danger' : t.pctTecho != null ? 'success' : 'warning'}
        />
        <KpiCard
          label="Marginal"
          value={z.marginal.marginal ? plata(z.marginal.marginal) : '—'}
          sub={z.marginal.marginal ? 'el pedido que se sumó' : z.marginal.motivo}
          tone={z.marginal.marginal && d.techo && z.marginal.marginal > d.techo ? 'danger' : 'neutral'}
        />
        {conc && (
          <KpiCard
            label="Pieza más grande"
            value={`${Math.round(conc.pct)}%`}
            sub={`«${conc.pieza}» en ${conc.cajas} caja${conc.cajas === 1 ? '' : 's'}`}
            tone={conc.pct >= 40 ? 'warning' : 'neutral'}
          />
        )}
      </div>

      <SectionCard
        title={`Las celdas (${z.celdas.length})`}
        subtitle="Una fila por conjunto, ordenadas por gasto. El «por qué» de cada veredicto son los números que lo sostienen, no una frase. Abrí una para ver su embudo y su día a día."
      >
        {z.celdas.length === 0 ? (
          <EmptyState title="Ninguna celda entregó en la ventana" hint="Probá una ventana más larga." dashed />
        ) : (
          <TablaCeldas celdas={z.celdas} moneda={z.celdas[0]?.moneda ?? null} acciones={acciones} />
        )}
      </SectionCard>

      <Oraculo d={d} dias={dias} />
    </>
  )
}

/**
 * La cabecera: **hasta cuándo llegan los datos, y si al techo se le puede creer.**
 *
 * 🔴 Lo segundo es una cicatriz. El 25-ago-2026 el monitor imprimía «zattia 6046» con cara de
 * certeza y ese techo estaba cargado a precio de LISTA con la tienda en liquidación: el ticket real
 * era 38% más bajo, y como el costo de la mercadería no baja con el precio, el techo real era casi
 * cero. Se le creyó toda una tarde. 🔑 **Una regla no protege de una ficha mal cargada: hay que
 * contrastar la ficha**, y la única manera de que eso pase es que la pantalla lo haga sola.
 */
function Cabecera({ d }: { d: RespuestaZona }) {
  const z = d.zona
  if (!z) return null
  const ticketReal = z.totales.compras ? z.totales.revenue / z.totales.compras : 0
  const dif = d.ficha && d.ficha.ticket > 0 && ticketReal > 0
    ? ((ticketReal - d.ficha.ticket) / d.ficha.ticket) * 100
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[1] }}>
      <div style={{ fontSize: font.sm, color: color.mut }}>
        Sale de la <strong>foto diaria</strong>, no de Meta: llega hasta el <strong>{z.hasta}</strong>,
        que es el último día cerrado. El día en curso no entra —arrastraría medio día de gasto contra
        medio día de pedidos—; para verlo, armá el parte más abajo.
      </div>
      <div style={{ fontSize: font.sm, color: color.mut }}>
        {d.techo ? (
          <>
            Techo por compra <strong>{plata(d.techo)}</strong>
            {d.techoCaja ? <> · de caja {plata(d.techoCaja)}</> : null}
            {d.ficha?.cargadaEl && <> · ficha cargada el {String(d.ficha.cargadaEl).slice(0, 10)}</>}
          </>
        ) : (
          <span style={{ color: color.warningInk }}>
            ⛔ Esta línea no tiene fila de rentabilidad: sin techo no se puede juzgar ninguna celda, y
            no se inventa un default.{' '}
            <Link href="/meta-ads/rentabilidad" style={{ color: color.brandSolid, fontWeight: weight.semibold }}>Cargarla →</Link>
          </span>
        )}
      </div>
      {dif != null && Math.abs(dif) >= 15 && (
        <Notice tone="danger">
          🔴 El techo está calculado sobre un ticket de {plata(d.ficha!.ticket)} y el ticket REAL de
          esta ventana es {plata(ticketReal)} ({dif >= 0 ? '+' : ''}{Math.round(dif)}%).{' '}
          <strong>Hasta que la ficha se corrija, el % del techo de cada celda está mal.</strong> Y el
          error no es proporcional: el costo de la mercadería no baja con el precio, así que un
          descuento se lleva casi tres veces su valor de techo.{' '}
          <Link href="/meta-ads/rentabilidad" style={{ color: 'inherit', textDecoration: 'underline' }}>Corregirla →</Link>
        </Notice>
      )}
    </div>
  )
}

/**
 * EL ORÁCULO: los pedidos reales de la tienda contra lo que Meta se atribuye.
 *
 * 🔴🔑 Medido el 20-ago-2026: **las dos series fueron en sentido contrario durante dos días.** Meta
 * decía que el costo por compra había bajado 34% y los pedidos reales decían que había subido 47%.
 * Ninguna mentía: el CAPI arrancó y Meta pasó de explicar el 40% de los pedidos al 89%. La mejora
 * era de ATRIBUCIÓN y **ninguna de esas compras era nueva**. ⇒ el oráculo del escalado es
 * `pedidos/día` de la tienda, ⛔ NO las `purchases` de Meta — y la forma de que eso no se olvide no
 * es un comentario: es que las dos columnas estén una al lado de la otra con la proporción en el
 * medio.
 */
function Oraculo({ d, dias }: { d: RespuestaZona; dias: number }) {
  const [abierto, setAbierto] = useState(false)
  const z = d.zona
  if (!z) return null
  const m = z.marginal
  return (
    <SectionCard
      title="Pedidos reales vs. lo que Meta se atribuye"
      subtitle="El oráculo del escalado. Si atrib% sube mientras el costo por compra de Meta baja, la mejora es de atribución y no hay una sola venta nueva."
    >
      {m.marginal ? (
        <div style={{ fontSize: font.base, lineHeight: 1.5 }}>
          El pedido que se sumó costó <strong>{plata(m.marginal)}</strong>
          {d.techo && (
            m.marginal > d.techo
              ? <span style={{ color: color.dangerInk, fontWeight: weight.semibold }}> — más de lo que vale ({plata(d.techo)})</span>
              : <> , contra un techo de {plata(d.techo)}</>
          )}
          <div style={{ fontSize: font.sm, color: color.mut, marginTop: 2 }}>
            {m.a!.desde}→{m.a!.hasta} ({m.a!.pedidosDia.toFixed(1)}/día) contra {m.b!.desde}→{m.b!.hasta} ({m.b!.pedidosDia.toFixed(1)}/día).
            ⛔ No multiplicar los pedidos que faltan por este número: el marginal sube en cada escalón.
          </div>
        </div>
      ) : (
        // 🔴 `null` con MOTIVO, ⛔ nunca un número: con los pedidos planos la división da un costo
        // negativo, que se lee como «cada pedido nuevo te devuelve plata».
        <div style={{ fontSize: font.base, color: color.mut }}>
          El marginal no se puede calcular — {m.motivo}.
        </div>
      )}

      <Plegable
        abierto={abierto}
        onToggle={() => setAbierto((v) => !v)}
        titulo="Día por día"
        ayuda={`Los ${dias * 2} días que entran en la comparación, con las dos versiones del mismo hecho.`}
      >
        <TableWrap>
          <THead>
            <Tr>
              <Th>Fecha</Th>
              <Th align="right">Pedidos</Th>
              <Th align="right">Gasto</Th>
              <Th align="right">Costo real</Th>
              <Th align="right">Compras Meta</Th>
              <Th align="right">Costo Meta</Th>
              <Th align="right">atrib%</Th>
            </Tr>
          </THead>
          <TBody>
            {z.caja.slice(-dias * 2).map((x) => (
              <Tr key={x.fecha}>
                <Td>{x.fecha}</Td>
                <Td align="right">{entero(x.pedidos)}</Td>
                <Td align="right">{plata(x.gasto)}</Td>
                {/* ⛔ Vacío y no 0 cuando no hay denominador. */}
                <Td align="right">{x.pedidos ? plata(x.costoPedidoReal) : <span style={{ color: color.mut2 }}>—</span>}</Td>
                <Td align="right">{entero(x.comprasMeta)}</Td>
                <Td align="right">{x.comprasMeta ? plata(x.costoCompraMeta) : <span style={{ color: color.mut2 }}>—</span>}</Td>
                {/* `null` porque sin pedidos reales no es «0%», es «no se puede saber». Y puede
                    pasar el 100%: Meta atribuye a 7 días al clic. ⛔ No se recorta. */}
                <Td align="right">{x.atrib == null ? <span style={{ color: color.mut2 }}>—</span> : `${Math.round(x.atrib)}%`}</Td>
              </Tr>
            ))}
          </TBody>
        </TableWrap>
      </Plegable>
    </SectionCard>
  )
}

/** El recordatorio de que la zona es de una línea, cuando hay más de una para elegir. */
function SinLinea({ visibles, linea, setLinea }: {
  visibles: LineaPauta[]
  linea: string
  setLinea: (l: LineaPauta) => void
}) {
  if (linea !== 'todas' || visibles.length < 2) return null
  return (
    <Notice tone="brand">
      Elegí una marca arriba para ver su rendimiento:{' '}
      {visibles.map((l, i) => (
        <span key={l}>
          {i > 0 && ' · '}
          <button
            type="button"
            onClick={() => setLinea(l)}
            style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit', color: color.brandSolid, fontWeight: weight.semibold }}
          >
            {ETIQUETA_LINEA[l]}
          </button>
        </span>
      ))}
    </Notice>
  )
}
