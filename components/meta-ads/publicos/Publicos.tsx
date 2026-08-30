'use client'

/**
 * **FRÍA vs REMARKETING: a quién le está comprando la plata de esta marca.**
 *
 * # Por qué existe
 *
 * Lo pidió Bruno el 30-ago-2026, y nació de una objeción suya al Embudo: *«contesta qué etapa está
 * vacía, y esa pregunta ⛔ no tiene una acción del otro lado»* — llenar la etapa de arriba es
 * producir piezas, que pasa en MAKETA y tarda semanas, así que una pantalla cuya respuesta ⛔ no
 * cabe en un gesto se abre una vez. **Ésta contesta la de al lado, que sí decide algo la misma
 * tarde**: dónde poner los pesos que se liberan.
 *
 * # 🔴 Las tres cosas que esta pantalla ⛔ NO puede afirmar, y por eso las dice
 *
 * 1. **«Público abierto» ⛔ no es «gente nueva».** Con público abierto Meta elige y le habla a los
 *    dos. Contarlo como frío sería exactamente la respuesta que la pantalla vino a evitar ⇒ es un
 *    balde propio, y si se lleva la mayoría de la plata **el veredicto es que la pregunta ⛔ no se
 *    puede contestar con la cuenta armada así** — con la mano concreta al lado.
 * 2. **El costo por compra de cada público sale de la atribución de META, y está sesgado a favor
 *    del remarketing**: se le muestra el aviso al que ya venía decidido y Meta le imputa la compra.
 *    ⇒ se dibuja con el sesgo escrito arriba y ⛔ nunca como un ranking. Lo que este módulo mide
 *    bien es **el reparto del gasto**, que es un hecho.
 * 3. **Lo que gastó un conjunto que Meta ya ⛔ no lista** (pausado y archivado, o borrado) ⛔ no
 *    tiene público que leer: va a «sin clasificar», ⛔ nunca repartido entre los otros tres.
 *
 * # ⚠️ Es el único recurso de LECTURA que necesita el token
 *
 * El público vive en el `targeting` de cada conjunto y la foto ⛔ no lo guarda. Con Graph caído la
 * pantalla ⛔ no se rompe ni se calla: muestra el gasto de la ventana —que es un hecho de la foto—
 * y **dice por qué ⛔ no se pudo partir**.
 */

import { useEffect, useState } from 'react'
import { useMeta } from '@/components/meta-ads/ContextoMeta'
import { SelectorMeta } from '@/components/meta-ads/SelectorMeta'
import { traerPublicos } from '@/lib/meta-ads/cliente'
import { entero, plata, pctUno } from '@/lib/meta-ads/formato'
import { ETIQUETA_LINEA } from '@/lib/meta-ads/lineas'
import { AYUDA_PUBLICO, ETIQUETA_PUBLICO, type PartePublico, type RespuestaPublicos } from '@/lib/meta-ads/publicos'
import type { LineaPauta } from '@/lib/meta-ads/tipos'
import {
  Button, Card, EmptyState, KpiCard, Notice, SectionCard, TBody, TableWrap, Td, Th, THead, Tr,
  color, font, radius, space, weight,
} from '@/components/ui'

/** Las ventanas que ofrece. Son las de la foto: acá ⛔ no hay modo vivo — el público ⛔ no cambia por hora. */
const VENTANAS = [7, 14, 30]

type Estado =
  | { fase: 'sin-linea' }
  | { fase: 'cargando' }
  | { fase: 'error'; motivo: string }
  | { fase: 'ok'; data: RespuestaPublicos }

export function Publicos() {
  const { linea, visibles } = useMeta()
  const [dias, setDias] = useState(7)
  // La zona es de UNA línea: el reparto de la plata de dos marcas que comparten cuenta publicitaria
  // no es de ninguna. Con una sola visible se elige sola.
  const laLinea: LineaPauta | null = linea !== 'todas' ? linea : visibles.length === 1 ? visibles[0] : null
  const [resp, setResp] = useState<{ key: string; e: Estado } | null>(null)
  const key = laLinea ? `${laLinea}|${dias}` : ''

  useEffect(() => {
    if (!laLinea) return
    let vivo = true
    traerPublicos(laLinea, dias).then((r) => {
      if (!vivo) return
      setResp({ key: `${laLinea}|${dias}`, e: r.ok ? { fase: 'ok', data: r.dato } : { fase: 'error', motivo: r.motivo } })
    })
    return () => { vivo = false }
  }, [laLinea, dias])

  // El estado va keyeado y ⛔ no se limpia con un efecto: al cambiar de línea o de ventana, la
  // respuesta vieja deja de coincidir y la fase vuelve a «cargando» sola. Un efecto que arregla el
  // estado después de pintar deja un cuadro con los números de la línea anterior — y un número
  // dibujado ⛔ no se lee como provisorio.
  const estado: Estado = !laLinea
    ? { fase: 'sin-linea' }
    : !resp || resp.key !== key ? { fase: 'cargando' } : resp.e

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
        <SelectorMeta />
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
          <span style={{ fontSize: font.xs, fontWeight: weight.semibold, color: color.mut }}>MIRANDO LOS ÚLTIMOS</span>
          {VENTANAS.map((n) => (
            <Button key={n} size="sm" variant={n === dias ? 'solid' : 'ghost'} onClick={() => setDias(n)}>
              {n} días
            </Button>
          ))}
          {/* ⚠️ Sólo días CERRADOS, y se dice: la foto se corta ~08:00 y ~20:00, así que el día en
              curso o no está o está a medias. Acá ⛔ no hay modo vivo porque el público de un
              conjunto ⛔ no cambia entre la mañana y la tarde: lo que cambiaría es sólo la plata. */}
          <span style={{ fontSize: font.xs, color: color.mut2 }}>· sólo días cerrados</span>
        </div>
      </div>

      {estado.fase === 'sin-linea' && (
        <EmptyState
          title="Elegí una marca"
          hint="El reparto por público es de una sola línea: la plata de dos marcas que comparten la misma cuenta publicitaria no se puede sumar. El selector está acá arriba."
          dashed
        />
      )}
      {estado.fase === 'cargando' && <Card style={{ color: color.mut2 }}>Leyendo el público de cada conjunto…</Card>}
      {estado.fase === 'error' && <Notice tone="danger">No se pudo leer el reparto por público: {estado.motivo}</Notice>}
      {estado.fase === 'ok' && <Contenido d={estado.data} marca={ETIQUETA_LINEA[laLinea!] || laLinea!} />}
    </div>
  )
}

function Contenido({ d, marca }: { d: RespuestaPublicos; marca: string }) {
  // 🔴 Sin el público leído ⛔ no se dibuja un reparto vacío, que se vería igual que «toda la plata
  // es de un solo público». Se muestra lo que SÍ se sabe —el gasto de la ventana— y el motivo.
  if (!d.clasificado || !d.partes) {
    return (
      <Notice tone="warning" icon="📌">
        <b>⛔ No se pudo leer a quién le habla cada conjunto.</b> {d.motivo}
        {typeof d.total === 'number' && (
          <div style={{ fontSize: font.sm, marginTop: space[1] }}>
            Lo que sí se sabe de la foto: en la ventana se gastaron <b>{plata(d.total)}</b>. Lo que
            falta es el corte por público, que vive en Meta —el <code>targeting</code> de cada
            conjunto— y la foto ⛔ no lo guarda.
          </div>
        )}
      </Notice>
    )
  }

  const v = d.veredicto
  const partes = d.partes.filter((p) => p.spend > 0 || p.publico !== 'sin-clasificar')
  const cob = d.cobertura

  return (
    <>
      {v && (
        <Notice tone={v.clase === 'repartido' ? 'success' : v.clase === 'sin-base' ? 'neutral' : 'warning'}>
          <b>{v.titulo}</b>
          <div style={{ fontSize: font.sm, marginTop: space[1] }}>{v.detalle}</div>
          {/* 🔑 La mano va SEPARADA del diagnóstico y con su propio rótulo. Es toda la diferencia
              con el Embudo, que decía qué faltaba y dejaba a quien lo leía sin nada que apretar. */}
          {v.mano && (
            <div style={{ marginTop: space[2], padding: space[2], background: color.surface, borderRadius: radius.md }}>
              <span style={{ fontSize: font.xs, fontWeight: weight.semibold, color: color.mut }}>QUÉ SE HACE</span>
              <div style={{ fontSize: font.sm, marginTop: 2 }}>{v.mano}</div>
            </div>
          )}
        </Notice>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: space[2] }}>
        <KpiCard label="Gasto de la ventana" value={plata(d.total || 0)} sub={`${d.desde} → ${d.hasta}`} />
        {partes.map((p) => (
          <KpiCard
            key={p.publico}
            label={ETIQUETA_PUBLICO[p.publico]}
            value={pctUno(p.parte)}
            sub={`${plata(p.spend)} · ${p.conjuntos} conjunto${p.conjuntos === 1 ? '' : 's'}`}
            tone={p.publico === 'abierta' && p.parte >= 0.5 ? 'warning' : p.publico === 'sin-clasificar' && p.parte >= 0.1 ? 'warning' : 'neutral'}
          />
        ))}
      </div>

      {/* 🔴 EL CARTEL MÁS IMPORTANTE DE LA PANTALLA, y va ARRIBA de la tabla de costos y ⛔ no al
          pie. Sin esto la columna «costo por compra» se lee como un ranking y la plata se mueve por
          ella — que es justo lo que ⛔ no se puede hacer con esta medición. */}
      {d.sesgo && (
        <Notice tone="warning" icon="⚠️">
          <b>El costo de acá abajo sale de la atribución de Meta, y le regala la compra al
          remarketing.</b> Le muestra el aviso a alguien que ya venía decidido y Meta le imputa esa
          venta: por eso sale <b>{d.sesgo.veces.toFixed(1)}× más barato</b> ({plata(d.sesgo.costoRemarketing)}{' '}
          contra {plata(d.sesgo.costoResto)}). ⛔ <b>No es un ranking y la plata ⛔ no se mueve por
          él.</b> Lo que esta pantalla mide bien es el <b>reparto del gasto</b>, que es un hecho.
        </Notice>
      )}

      <SectionCard
        title={`A quién le compra la plata de ${marca}`}
        subtitle="Una fila por público. El público sale del targeting de cada conjunto, leído de Meta; la plata y las compras salen de la foto diaria."
      >
        <TableWrap>
          <THead>
            <Tr>
              <Th>Público</Th>
              <Th align="right">Gasto</Th>
              <Th align="right">Parte</Th>
              <Th align="right">Conjuntos</Th>
              <Th align="right">Compras · Meta</Th>
              <Th align="right">Costo · Meta</Th>
            </Tr>
          </THead>
          <TBody>
            {partes.map((p) => <FilaPublico key={p.publico} p={p} />)}
          </TBody>
        </TableWrap>
      </SectionCard>

      {/* 🔴 La cobertura cambia cómo se lee todo lo de arriba: «el 12% sin clasificar» ⛔ no es lo
          mismo que un reparto completo, y un reparto que ⛔ no dice su cobertura afirma más de lo
          que midió. */}
      {cob && (
        <div style={{ fontSize: font.sm, color: color.mut2 }}>
          Se leyó el público de <b>{entero(cob.conjuntosEnMeta)}</b> conjuntos de Meta.{' '}
          {cob.sinPublicoLeido > 0
            ? `${entero(cob.sinPublicoLeido)} de los que gastaron en la ventana ya ⛔ no están en Meta —pausados y archivados, o borrados—, así que su plata queda en «sin clasificar» y ⛔ no se reparte entre los otros.`
            : 'Todos los que gastaron en la ventana siguen en Meta, así que el reparto está completo.'}
          {cob.sinTargeting > 0 && ` Y a ${entero(cob.sinTargeting)} ⛔ no se les pudo leer el público: quedaron afuera del reparto en vez de entrar como «abierto».`}
        </div>
      )}
    </>
  )
}

function FilaPublico({ p }: { p: PartePublico }) {
  return (
    <Tr>
      <Td>
        <div style={{ fontWeight: weight.semibold }}>{ETIQUETA_PUBLICO[p.publico]}</div>
        {/* La ayuda va en la fila y ⛔ no en un popover: es la que evita que «abierto» se lea como
            «gente nueva», y un dato que hay que ir a buscar no corrige a nadie. */}
        <div style={{ fontSize: font.xs, color: color.mut2, maxWidth: 460 }}>{AYUDA_PUBLICO[p.publico]}</div>
      </Td>
      <Td align="right">{plata(p.spend)}</Td>
      <Td align="right">{pctUno(p.parte)}</Td>
      <Td align="right">{entero(p.conjuntos)}</Td>
      <Td align="right">{entero(p.compras)}</Td>
      {/* ⛔ Sin compras ⛔ NO se dibuja un 0: el costo por compra de un público que no compró ⛔ no
          existe, y un cero acá se lee como «gratis». */}
      <Td align="right">{p.compras ? plata(p.costoMeta) : '—'}</Td>
    </Tr>
  )
}
