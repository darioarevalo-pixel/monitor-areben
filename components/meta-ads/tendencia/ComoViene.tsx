'use client'

/**
 * «Cómo viene» — la ventana actual contra la anterior, arriba del reparto por marca.
 *
 * # Qué agrega al Panel
 *
 * El resto de la pantalla contesta **qué está pasando**. Esto contesta **si es mejor o peor que
 * antes**, que es la pregunta que un número solo no puede contestar: $365.000 de gasto no dice
 * nada; $365.000 contra $287.000 con las compras cayendo de 68 a 40 dice todo, y es un caso real de
 * Zattia que no aparecía en ninguna pantalla.
 *
 * # 🔑 Sale de la foto diaria y lo dice
 *
 * Todo lo demás del Panel viene de Graph en vivo. Esto viene de `meta_ads_snapshot_dia`, así que
 * **los pesos pueden no coincidir con la tabla de abajo**: Meta reatribuye hacia atrás unos días y
 * la foto de un día viejo es la que se leyó. Dos números parecidos y distintos sin explicación se
 * leen como un bug; con el subtítulo puesto, se leen como lo que son. A cambio, esto es lo único
 * del Panel que sigue contestando con el token vencido.
 *
 * # 🔴 «Más» no es «mejor», y depende de la métrica
 *
 * Gastar 36% más no es bueno ni malo: es una decisión, no un resultado. Un CPA 20% más alto sí es
 * malo. Pintar los cinco deltas de verde-cuando-sube diría que gastar más está bien y que traer
 * clientes más caro también. Por eso cada tarjeta declara su `sentido` y el gasto va en gris.
 */

import { Sparkline } from '@/components/meta-ads/tendencia/Sparkline'
import { useTendencia } from '@/components/meta-ads/tendencia/useTendencia'
import {
  Card, EmptyState, SectionCard, TBody, TableWrap, Td, Th, THead, Tr,
  chartColor, color, font, radius, space, weight,
} from '@/components/ui'
import { diaCorto, entero, pctFirmado, plata, roas as roasTxt } from '@/lib/meta-ads/formato'
import { ETIQUETA_LINEA, LINEAS } from '@/lib/meta-ads/lineas'
import { variacion, type Par, type PuntoSerie, type TotalTendencia, type Ventanas } from '@/lib/meta-ads/tendencia'
import type { LineaPauta } from '@/lib/meta-ads/tipos'

/** Si subir es una buena noticia, una mala, o ninguna de las dos. */
type Sentido = 'sube-bien' | 'sube-mal' | 'neutro'

export function ComoViene({ dias }: { dias: number }) {
  const t = useTendencia(dias)

  if (t.fase === 'cargando') return <Card style={{ color: color.mut2 }}>Comparando contra el período anterior…</Card>
  // No es un error de Meta: es la base. Se dice cuál de los dos falló, porque el arreglo es otro.
  if (t.fase === 'error') {
    return <Card style={{ color: color.mut }}>No se pudo leer la foto diaria para comparar: {t.motivo}</Card>
  }

  const { ventanas, total, porLinea, sinLinea, serie, ultimaFoto } = t.data
  if (!ventanas || !total) {
    return <EmptyState title="Todavía no hay foto diaria" hint="La comparación aparece cuando el cron de las 06:30 haya guardado unos días." dashed />
  }

  return (
    <SectionCard title="Cómo viene" subtitle={subtitulo(ventanas)}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        {!ventanas.anterior && <SinComparacion ventanas={ventanas} />}
        {ventanas.recortado && ventanas.anterior && <Recortado ventanas={ventanas} />}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: space[3] }}>
          <Tile label="Gasto" par={total} campo="gasto" formato={plata} sentido="neutro" serie={serie} serieCampo="gasto" />
          <Tile label="Compras" par={total} campo="compras" formato={entero} sentido="sube-bien" serie={serie} serieCampo="compras" tono={chartColor.success} />
          <Tile label="Ingresos" par={total} campo="revenue" formato={plata} sentido="sube-bien" serie={serie} serieCampo="revenue" tono={chartColor.success} />
          <Tile label="ROAS" par={total} campo="roas" formato={roasTxt} sentido="sube-bien" />
          <Tile label="CPA" par={total} campo="cpa" formato={plata} sentido="sube-mal" />
        </div>

        <PorMarca porLinea={porLinea} hayAnterior={!!ventanas.anterior} />

        <Notas ventanas={ventanas} sinLinea={sinLinea} ultimaFoto={ultimaFoto} total={total} />
      </div>
    </SectionCard>
  )
}

function subtitulo(v: Ventanas): string {
  const rango = (r: { desde: string; hasta: string }) => `${diaCorto(r.desde)}–${diaCorto(r.hasta)}`
  if (!v.anterior) return `${rango(v.actual)}. Sale de la foto diaria, no de Meta en vivo.`
  return `${v.dias} días (${rango(v.actual)}) contra los ${v.dias} anteriores (${rango(v.anterior)}). Sale de la foto diaria, no de Meta en vivo.`
}

/**
 * 🔴 El caso que hace falta decir con todas las letras.
 *
 * Con el selector en 90 días la foto no llega a cubrir los 90 anteriores. Un −100% ahí sería falso
 * y creíble: es el mismo error que leer «0 saltos en 90 días» como «esto no pasa nunca», cuando lo
 * que pasa es que todavía no se puede saber.
 */
function SinComparacion({ ventanas }: { ventanas: Ventanas }) {
  return (
    <div style={{ fontSize: font.sm, color: color.mut, lineHeight: 1.5, border: `1px solid ${color.line}`, borderRadius: radius.lg, padding: space[3] }}>
      <strong style={{ color: color.ink2 }}>Todavía no hay período anterior con qué comparar.</strong>{' '}
      La foto diaria arrancó el {ventanas.primeraFoto ? diaCorto(ventanas.primeraFoto) : '—'} y hasta ayer
      lleva {ventanas.disponibles} {ventanas.disponibles === 1 ? 'día' : 'días'}: hacen falta dos ventanas iguales
      y no entran. Los totales de abajo son de la ventana actual y son ciertos; lo que falta es el «vs».
    </div>
  )
}

/** La foto no llegaba a la ventana pedida, así que se compararon dos más cortas — y se dice cuáles. */
function Recortado({ ventanas }: { ventanas: Ventanas }) {
  return (
    <div style={{ fontSize: font.sm, color: color.mut, lineHeight: 1.5 }}>
      El Panel está en {ventanas.pedidos} días, pero la foto arrancó el{' '}
      {ventanas.primeraFoto ? diaCorto(ventanas.primeraFoto) : '—'} y no llega a dos ventanas de ese largo:
      se comparan <strong style={{ color: color.ink2 }}>los últimos {ventanas.dias} días contra los {ventanas.dias} anteriores</strong>.
    </div>
  )
}

function Tile({ label, par, campo, formato, sentido, serie, serieCampo, tono }: {
  label: string
  par: Par
  campo: keyof TotalTendencia
  formato: (v: number) => string
  sentido: Sentido
  serie?: PuntoSerie[]
  serieCampo?: 'gasto' | 'revenue' | 'compras'
  tono?: string
}) {
  const a = par.actual[campo] as number | null
  const b = par.anterior ? (par.anterior[campo] as number | null) : null

  return (
    <div style={{ background: color.bg, border: `1px solid ${color.line}`, borderRadius: radius.lg, padding: `${space[2]}px ${space[3]}px` }}>
      <div style={{ fontSize: font.xs, color: color.mut2 }}>{label}</div>
      <div style={{ fontSize: font.xl, fontWeight: weight.bold, color: color.ink, marginTop: 2 }}>
        {a == null ? '—' : formato(a)}
      </div>
      <Delta actual={a} anterior={b} hayAnterior={!!par.anterior} sentido={sentido} formato={formato} />
      {serie && serieCampo && <Sparkline serie={serie} campo={serieCampo} tono={tono} />}
    </div>
  )
}

/**
 * La variación, con los casos borde dichos en palabras.
 *
 * Los tres que existen de verdad en esta pauta: **no hay período anterior** (la foto no llega),
 * **el anterior fue 0** (de la nada no se crece un porcentaje) y **no cambió** — que sin esta rama
 * se dibujaba «▲ 0%», una flecha para arriba que no sube nada. Es el mismo criterio que
 * `components/crm/Metricas.tsx`, que ya los había encontrado.
 */
function Delta({ actual, anterior, hayAnterior, sentido, formato }: {
  actual: number | null
  anterior: number | null
  hayAnterior: boolean
  sentido: Sentido
  formato: (v: number) => string
}) {
  const gris = { fontSize: font.xs, color: color.mut2, marginTop: 2 }
  if (!hayAnterior) return <div style={gris}>sin período anterior</div>
  // `cpa` en `null` es «no hubo compras», no «costó cero»: no se compara contra un número que no existe.
  if (actual == null || anterior == null) return <div style={gris}>{actual == null ? 'no hubo compras' : 'antes no hubo compras'}</div>
  if (!anterior) return <div style={gris}>antes fue 0</div>

  const v = variacion(actual, anterior)
  if (v === null) return <div style={gris}>antes fue 0</div>
  // Menos de medio punto redondea a «+0,0%», que es una variación dibujada donde no la hubo.
  if (Math.abs(v) < 0.005) return <div style={gris}>igual que antes · {formato(anterior)}</div>

  const bien = sentido === 'neutro' ? null : (v > 0) === (sentido === 'sube-bien')
  const tinta = bien === null ? color.mut : bien ? color.successInk : color.dangerInk
  return (
    <div style={{ fontSize: font.xs, color: tinta, fontWeight: weight.semibold, marginTop: 2 }}>
      {v > 0 ? '▲' : '▼'} {pctFirmado(v)}{' '}
      <span style={{ color: color.mut2, fontWeight: weight.normal }}>· antes {formato(anterior)}</span>
    </div>
  )
}

/** El mismo corte, marca por marca: dos líneas pueden moverse al revés y el total taparlo. */
function PorMarca({ porLinea, hayAnterior }: { porLinea: Partial<Record<LineaPauta, Par>>; hayAnterior: boolean }) {
  const lineas = LINEAS.filter((l) => porLinea[l])
  if (!lineas.length) return null

  return (
    <TableWrap>
      <THead>
        <Tr>
          <Th>Marca</Th>
          <Th align="right">Gasto</Th>
          <Th align="right">Compras</Th>
          <Th align="right">Ingresos</Th>
          <Th align="right">ROAS</Th>
          <Th align="right">CPA</Th>
        </Tr>
      </THead>
      <TBody>
        {lineas.map((l) => {
          const p = porLinea[l] as Par
          return (
            <Tr key={l}>
              <Td strong>{ETIQUETA_LINEA[l]}</Td>
              <Celda par={p} campo="gasto" formato={plata} sentido="neutro" hayAnterior={hayAnterior} />
              <Celda par={p} campo="compras" formato={entero} sentido="sube-bien" hayAnterior={hayAnterior} />
              <Celda par={p} campo="revenue" formato={plata} sentido="sube-bien" hayAnterior={hayAnterior} />
              <Celda par={p} campo="roas" formato={roasTxt} sentido="sube-bien" hayAnterior={hayAnterior} />
              <Celda par={p} campo="cpa" formato={plata} sentido="sube-mal" hayAnterior={hayAnterior} />
            </Tr>
          )
        })}
      </TBody>
    </TableWrap>
  )
}

function Celda({ par, campo, formato, sentido, hayAnterior }: {
  par: Par
  campo: keyof TotalTendencia
  formato: (v: number) => string
  sentido: Sentido
  hayAnterior: boolean
}) {
  const a = par.actual[campo] as number | null
  const b = par.anterior ? (par.anterior[campo] as number | null) : null
  const v = hayAnterior ? variacion(a, b) : null
  const bien = v === null || sentido === 'neutro' ? null : (v > 0) === (sentido === 'sube-bien')
  const tinta = bien === null ? color.mut2 : bien ? color.successInk : color.dangerInk

  return (
    <Td align="right">
      <div>{a == null ? '—' : formato(a)}</div>
      {v !== null && Math.abs(v) >= 0.005 && (
        <div style={{ fontSize: font.xs, color: tinta, fontWeight: weight.medium }}>
          {v > 0 ? '▲' : '▼'} {pctFirmado(v)}
        </div>
      )}
    </Td>
  )
}

/**
 * Lo que la comparación deja afuera, dicho en vez de escondido.
 *
 * Dos cosas: la plata de campañas sin marca —que no entra en ningún total y ya tiene su renglón
 * arriba— y si el cron dejó de correr, porque una comparación vieja sigue siendo verdadera pero
 * contesta sobre otro momento.
 */
function Notas({ ventanas, sinLinea, ultimaFoto, total }: {
  ventanas: Ventanas
  sinLinea: { actual: number; anterior: number | null }
  ultimaFoto: string | null
  total: Par
}) {
  const notas: string[] = []
  if (sinLinea.actual > 0) {
    notas.push(`Quedan afuera ${plata(sinLinea.actual)} de campañas sin marca asignada: no entran en ningún total.`)
  }
  // La foto de ayer es la última que puede haber, porque las ventanas no incluyen hoy.
  if (ultimaFoto && ultimaFoto < ventanas.actual.hasta) {
    notas.push(`⚠️ La última foto es del ${diaCorto(ultimaFoto)} y la ventana termina el ${diaCorto(ventanas.actual.hasta)}: el cron de las 06:30 no corrió.`)
  }
  if (total.actual.diasConGasto < ventanas.dias) {
    notas.push(`De los ${ventanas.dias} días de la ventana, entregó ${total.actual.diasConGasto}.`)
  }
  if (!notas.length) return null

  return (
    <div style={{ fontSize: font.xs, color: color.mut2, lineHeight: 1.5 }}>
      {notas.map((n) => <div key={n}>{n}</div>)}
    </div>
  )
}
