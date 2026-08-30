'use client'

/**
 * La tabla de CELDAS: una fila por conjunto, con su veredicto y sus botones al lado.
 *
 * # Por qué la unidad es la celda y no la pieza
 *
 * Es donde vive el presupuesto, donde vive el aprendizaje y donde se ejerce la decisión. La pieza es
 * el otro eje —y el que explica el desgaste— pero no se puede pausar una pieza: se pausa la caja.
 * **Abriendo la fila están sus avisos, con su cara y con qué parte de la caja se lleva cada uno.**
 * ⚠️ Hasta el 26-ago-2026 esa frase era MENTIRA: el detalle mostraba el embudo y el día a día y ni
 * un aviso. Se arregló haciendo cierto el comentario, ⛔ no borrándolo.
 *
 * # 🔴 La cara va en la FILA, no adentro del plegable (30-ago-2026)
 *
 * *«¿Dónde están los anuncios con sus miniaturas? Sería esencial verlo para saber qué anuncio está
 * activo sin hacer movimientos de más.»* Estaban — adentro de la fila abierta, que es exactamente
 * donde ⛔ no sirven: la pregunta «¿cuál es cuál?» se hace **mientras se recorre la tabla**, y un
 * nombre como `AD02 - GIRLHOOD COLLECTION` ⛔ no la contesta.
 *
 * 🔑 Va la del aviso que **más gastó** de la caja, con un `+N` si hay más. ⛔ No las N: una fila con
 * cuatro miniaturas vuelve a ser el problema que se acaba de arreglar con los botones.
 *
 * # 🔑 Las dos columnas que nadie pide y son las que deciden
 *
 *  - **`%diario`** al lado del gasto. Separa las dos cosas que se confunden todo el tiempo: una
 *    celda que no gasta **porque no le alcanza la caja** y una que **no la usa**. Las dos se ven
 *    igual —gasto bajo— y la acción es la contraria. Está medido que subirle el techo a una que
 *    gasta el 74% ⛔ no le manda un peso.
 *  - **`CTRΔ` y `CPMΔ` juntas**. Es la firma del desgaste: el CTR que cae con el CPM quieto es la
 *    pieza; con el CPM arriba es la subasta. Separadas no dicen nada, y sin ellas un costo que sube
 *    se explica con «está caro Meta», que es la conclusión cómoda y la equivocada.
 */

import { useState } from 'react'
import { BotonesAccion } from '@/components/meta-ads/acciones'
import { Insistencia, useAccionarHallazgo } from '@/components/meta-ads/reglas/HallazgosPanel'
import type { Hallazgo } from '@/lib/meta-ads/reglas'
import type { Acciones } from '@/components/meta-ads/acciones/tipos'
import type { AvisoDeCelda, Celda, ClaseVeredicto } from '@/lib/meta-ads/rendimiento'
import type { PiezaAviso } from '@/lib/meta-ads/biblioteca'
import { entero, plata } from '@/lib/meta-ads/formato'
import type { LineaPauta } from '@/lib/meta-ads/tipos'
import {
  Badge, Button, StatusPill, TBody, TableWrap, Td, Th, THead, Tr, color, font, space, weight, type Tone,
} from '@/components/ui'
import { AvisosDeCelda } from '@/components/meta-ads/zona/AvisosDeCelda'
import { Cara } from '@/components/meta-ads/zona/Cara'
import { usePiezas } from '@/components/meta-ads/zona/usePiezas'

/** El tono de cada veredicto. `alto` y `rota` son los dos que cuestan plata todos los días. */
const TONO: Record<ClaseVeredicto, Tone> = {
  apagada: 'neutral',
  rota: 'danger',
  alto: 'danger',
  escalar: 'brand',
  ok: 'success',
  midiendo: 'neutral',
  quieta: 'neutral',
  'sin-techo': 'warning',
}

/** Un delta con signo. `null` se dibuja «—», ⛔ nunca 0%: no medir no es no haber cambiado. */
function Delta({ v, invertido = false }: { v: number | null; invertido?: boolean }) {
  if (v == null) return <span style={{ color: color.mut2 }}>—</span>
  const malo = invertido ? v > 0 : v < 0
  return (
    <span style={{ color: Math.abs(v) < 5 ? color.mut : malo ? color.dangerInk : color.successInk, fontWeight: weight.medium }}>
      {v >= 0 ? '+' : ''}{Math.round(v)}%
    </span>
  )
}

export function TablaCeldas({ celdas, moneda, acciones, cuenta, hallazgosDe, quitarHallazgo }: {
  celdas: Celda[]
  moneda: string | null
  acciones: Acciones
  /** La cuenta publicitaria, para traerle las caras a los avisos. `null` ⇒ se listan sin foto. */
  cuenta: string | null
  /** Lo que las automatizaciones encontraron sobre ESTA celda —o sobre un aviso de adentro—. */
  hallazgosDe: (celdaId: string) => Hallazgo[] | null
  quitarHallazgo: (id: number) => void
}) {
  const [abierta, setAbierta] = useState<string | null>(null)
  // 🔴 Se enciende AL MONTAR y ⛔ no al abrir una fila: la cara de cada celda vive en la fila. El
  // porqué —y el cupo medido, `call_count` en 2 sobre 100— está en el docblock de `usePiezas`.
  const piezas = usePiezas(cuenta, true)
  return (
    <TableWrap>
      <THead>
        <Tr>
          {/* Sin rótulo: la columna es la cara, y «Pieza» arriba de una imagen es ruido. */}
          <Th> </Th>
          <Th>Celda</Th>
          <Th align="right">Gasto</Th>
          <Th align="right">Compras</Th>
          <Th align="right">Costo</Th>
          <Th align="right">% techo</Th>
          <Th align="right">% diario</Th>
          <Th align="right">CTR</Th>
          <Th align="right">CPM</Th>
          <Th>Veredicto</Th>
          <Th>Acciones</Th>
        </Tr>
      </THead>
      <TBody>
        {celdas.map((c) => {
          const v = c.veredicto
          const d = c.desgaste
          const esta = abierta === c.id
          const suyos = hallazgosDe(c.id)
          return (
            <>
              <Tr key={c.id}>
                <Td>
                  <CaraDeCelda celda={c} piezaDe={piezas.piezaDe} cargando={piezas.cargando} />
                </Td>
                <Td strong>
                  <button
                    type="button"
                    onClick={() => setAbierta(esta ? null : c.id)}
                    style={{
                      background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left',
                      // `height: auto`: es un botón-TEXTO y el bloque legacy le fija la altura de un
                      // control a todo `<button>` crudo. Ver `tests/boton-crudo-altura.test.ts`.
                      height: 'auto', font: 'inherit', color: 'inherit',
                    }}
                  >
                    {esta ? '▾ ' : '▸ '}{c.nombre}
                  </button>
                  <div style={{ fontSize: font.xs, color: color.mut2, marginTop: 2 }}>
                    {c.diasConGasto} {c.diasConGasto === 1 ? 'día' : 'días'} con entrega
                    {c.diario != null && ` · diario ${plata(c.diario)}`}
                  </div>
                </Td>
                <Td align="right">{plata(c.spend)}</Td>
                <Td align="right">{entero(c.compras)}</Td>
                {/* ⛔ Un costo sin denominador se dibuja vacío, NUNCA 0: un 0 en una columna de
                    costos se lee como «esas compras salieron gratis». */}
                <Td align="right">{c.compras ? plata(c.costo) : <span style={{ color: color.mut2 }}>—</span>}</Td>
                <Td align="right">
                  {v.pctTecho == null ? <span style={{ color: color.mut2 }}>—</span> : (
                    <span style={{ color: v.pctTecho > 100 ? color.dangerInk : color.ink, fontWeight: weight.medium }}>
                      {Math.round(v.pctTecho)}%
                    </span>
                  )}
                </Td>
                <Td align="right">{v.pctDiario == null ? <span style={{ color: color.mut2 }}>—</span> : `${Math.round(v.pctDiario)}%`}</Td>
                <Td align="right"><Delta v={d.ctrDelta} /></Td>
                <Td align="right"><Delta v={d.cpmDelta} invertido /></Td>
                <Td wrap>
                  <StatusPill tone={TONO[v.clase]} label={v.titulo} />
                  {/* 🔑 La razón que lleva el NÚMERO, no la prosa entera. Un veredicto sin el número
                      contra el que se lo comparó es un renglón que nadie aprieta. */}
                  {v.porque[0] && (
                    <div style={{ marginTop: 2, fontSize: font.xs, color: color.mut, lineHeight: 1.4, maxWidth: 320 }}>
                      {v.porque[0]}
                    </div>
                  )}
                  {d.firma === 'pieza' && (
                    <div style={{ marginTop: 4 }}><Badge tone="warning">se gasta la pieza</Badge></div>
                  )}
                  {d.firma === 'subasta' && (
                    <div style={{ marginTop: 4 }}><Badge tone="neutral">se encareció la subasta</Badge></div>
                  )}
                  {/* 🔴 El hallazgo va ACÁ y ⛔ no en un bloque arriba: el motor decía «pausá
                      GIRLHOOD FRIO» en un lugar y el botón de pausar GIRLHOOD FRIO estaba en otro.
                      Medido el 30-ago-2026, 21 hallazgos y ninguno accionado en cuatro días. */}
                  {suyos?.map((h) => (
                    <MarcaDeHallazgo key={h.id} h={h} quitar={quitarHallazgo} />
                  ))}
                </Td>
                <Td>
                  <BotonesAccion
                    objeto={{
                      nivel: 'conjunto',
                      id: c.id,
                      nombre: c.nombre,
                      linea: (c.linea === 'sin-linea' ? null : c.linea) as LineaPauta | null,
                      moneda: moneda || c.moneda || 'ARS',
                      campania: c.campaignId || undefined,
                    }}
                    estado={c.estado}
                    diarioCrudo={c.diario == null ? 0 : Math.round(c.diario * 100)}
                    sinPresupuesto={c.diario == null}
                    acciones={acciones}
                  />
                </Td>
              </Tr>
              {/* 🔴 **El «por qué» se COMPACTA, ⛔ no se esconde.** Seguía siendo una fila entera con
                  una lista de frases debajo de cada celda: es lo que hacía que cada renglón midiera
                  dos o tres alturas —*«texto lineal que realmente no tiene mucha explicación»*—.
                  🔑 Pero un veredicto sin el número que lo sostiene es un renglón que nadie aprieta,
                  así que la PRIMERA razón —la que lleva el número— se queda a la vista, al pie del
                  pill. Las demás bajan al detalle, y sólo se avisa cuántas son. */}
              {(v.porque.length > 1 || esta) && (
                <Tr key={`${c.id}-por`}>
                  <Td colSpan={11} style={{ paddingTop: 0 }}>
                    {v.porque.length > 1 && !esta && (
                      <div style={{ color: color.mut2, fontSize: font.xs, paddingLeft: space[2] }}>
                        y {v.porque.length - 1} {v.porque.length === 2 ? 'razón más' : 'razones más'} — abrí la fila
                      </div>
                    )}
                    {esta && (
                      <>
                        {v.porque.length > 1 && (
                          <ul style={{ margin: 0, paddingLeft: space[4], color: color.mut, fontSize: font.sm, lineHeight: 1.5 }}>
                            {v.porque.slice(1).map((p) => <li key={p}>{p}</li>)}
                          </ul>
                        )}
                        <Detalle celda={c} piezas={piezas} />
                      </>
                    )}
                  </Td>
                </Tr>
              )}
            </>
          )
        })}
      </TBody>
    </TableWrap>
  )
}

/**
 * Lo que se ve al abrir una celda: su embudo y su serie.
 *
 * 🔴 **El embudo dice cuántos días lo midieron.** Las tres columnas nacieron el 23-ago-2026 y las
 * filas anteriores están en `null` a propósito: un `0` afirmaría «no hubo ni un carrito». Dibujar el
 * total sin decir sobre cuántos días se sumó deja comparar dos celdas medidas sobre ventanas
 * distintas.
 */
function Detalle({ celda, piezas }: { celda: Celda; piezas: ReturnType<typeof usePiezas> }) {
  const pasos: [string, number | null, number][] = [
    ['clics', celda.clicks, celda.clicks],
    ['visitas al sitio', celda.lpv, celda.lpv ?? 0],
    ['carritos', celda.carritos, celda.carritos ?? 0],
    ['checkouts', celda.checkouts, celda.checkouts ?? 0],
    ['compras', celda.compras, celda.compras],
  ]
  return (
    <div style={{ marginTop: space[2], display: 'flex', flexDirection: 'column', gap: space[3] }}>
      {/* Primero los avisos: la pregunta que trae a alguien a abrir una fila es «¿qué hay adentro y
          quién se lleva la plata?», ⛔ no el embudo. */}
      <AvisosDeCelda
        avisos={celda.avisos}
        piezaDe={piezas.piezaDe}
        motivo={piezas.motivo}
        cargando={piezas.cargando}
        gastoDeLaCelda={celda.spend}
      />
      <div>
        <div style={{ fontSize: font.xs, fontWeight: weight.semibold, color: color.mut, marginBottom: 4 }}>
          DEL CLIC A LA COMPRA
        </div>
        <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', fontSize: font.sm }}>
          {pasos.map(([rot, val, n]) => (
            <div key={rot}>
              <span style={{ color: color.mut }}>{rot}: </span>
              {val == null ? (
                <span style={{ color: color.mut2 }} title="Ninguna fila de la ventana lo medía. No es cero.">sin medir</span>
              ) : (
                <>
                  <strong>{entero(n)}</strong>
                  {n > 0 && <span style={{ color: color.mut2 }}> · {plata(celda.spend / n)} c/u</span>}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
      <div>
        <div style={{ fontSize: font.xs, fontWeight: weight.semibold, color: color.mut, marginBottom: 4 }}>
          DÍA A DÍA
        </div>
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', fontSize: font.xs, color: color.mut }}>
          {celda.serie.slice(-14).map((d) => (
            <span key={d.fecha} title={`${d.fecha}: ${plata(d.spend)} · ${entero(d.compras)} compras`}>
              {d.fecha.slice(5)} <strong style={{ color: color.ink }}>{entero(d.compras)}</strong>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * La cara de la celda en la fila: **la del aviso que más gastó**, con un `+N` si hay más.
 *
 * 🔑 **La del que más gasta y ⛔ no la primera.** Una caja con tres avisos casi siempre tiene uno que
 * se lleva el 80%: ésa es la pieza de la que se está hablando cuando se mira la fila. Poner la
 * primera del arreglo sería mostrar la que quedó adelante en la consulta.
 *
 * ⚠️ En la ventana viva una celda que arrancó hoy ⛔ no tiene avisos —la foto no la vio— y el marco
 * queda vacío. Es correcto: no hay pieza que mostrar, y un marco vacío ⛔ no afirma nada.
 */
function CaraDeCelda({ celda, piezaDe, cargando }: {
  celda: Celda
  piezaDe: (adId: string) => PiezaAviso | null
  cargando: boolean
}) {
  const mayor = celda.avisos.reduce<AvisoDeCelda | null>((a, x) => (!a || x.spend > a.spend ? x : a), null)
  const otros = Math.max(0, celda.avisos.length - 1)
  return (
    <div style={{ position: 'relative', width: 44 }}>
      <Cara p={mayor ? piezaDe(mayor.id) : null} lado={44} cargando={cargando} />
      {otros > 0 && (
        <span
          // Cuántas piezas más hay en la caja. Es la mitad de la respuesta a «¿de qué es esta fila?»:
          // una celda con cuatro avisos ⛔ no se explica con una sola cara.
          title={`${celda.avisos.length} avisos en esta celda`}
          style={{
            position: 'absolute', top: -4, right: -6, fontSize: 10, lineHeight: 1, padding: '2px 4px',
            borderRadius: 999, background: color.bg2, border: `1px solid ${color.line}`, color: color.mut,
          }}
        >
          +{otros}
        </span>
      )}
    </div>
  )
}

/**
 * **Lo que el motor encontró sobre esta celda, pegado a su fila y accionable ahí.**
 *
 * 🔑 Comparte `useAccionarHallazgo` con el bloque de arriba: el orden de las dos llamadas —accionar
 * primero, marcar después— es una decisión, y escrita dos veces la segunda copia la invierte.
 *
 * ⚠️ **El rótulo nombra el OBJETO de la sugerencia**, que puede ⛔ no ser la celda: un hallazgo de
 * aviso vive adentro de esta caja pero pausa el aviso. Sin el nombre, el botón parecería apagar la
 * celda entera — que es la misma plata mal apagada, con un click.
 *
 * ⛔ **Sin sugerencia ⛔ no hay botón, y el motivo igual se lee.** Hay reglas que sólo avisan (el
 * radar, la fatiga): un botón inventado ahí sería ofrecer una acción que nadie decidió.
 */
function MarcaDeHallazgo({ h, quitar }: { h: Hallazgo; quitar: (id: number) => void }) {
  const { accionar, ocupado, rotulo } = useAccionarHallazgo(h, quitar)
  const mismoObjeto = h.sugerencia && h.sugerencia.objetoId === h.objetoId && h.nivel === 'conjunto'
  return (
    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 320 }}>
      <div style={{ display: 'flex', gap: space[1], alignItems: 'center', flexWrap: 'wrap' }}>
        <Badge tone="warning">lo detectó una regla</Badge>
        <Insistencia h={h} />
      </div>
      <div style={{ fontSize: font.xs, color: color.mut, lineHeight: 1.4 }}>{h.motivo}</div>
      {rotulo && (
        <Button size="sm" variant="solid" tone="brand" disabled={ocupado} onClick={() => void accionar()}>
          {ocupado ? 'Un segundo…' : mismoObjeto ? rotulo : `${rotulo} «${h.objetoNombre || h.objetoId}»`}
        </Button>
      )}
    </div>
  )
}
