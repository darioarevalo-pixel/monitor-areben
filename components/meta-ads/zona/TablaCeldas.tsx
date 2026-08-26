'use client'

/**
 * La tabla de CELDAS: una fila por conjunto, con su veredicto y sus botones al lado.
 *
 * # Por qué la unidad es la celda y no la pieza
 *
 * Es donde vive el presupuesto, donde vive el aprendizaje y donde se ejerce la decisión. La pieza es
 * el otro eje —y el que explica el desgaste— pero no se puede pausar una pieza: se pausa la caja.
 * Abriendo la fila están sus avisos.
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
import type { Acciones } from '@/components/meta-ads/acciones/tipos'
import type { Celda, ClaseVeredicto } from '@/lib/meta-ads/rendimiento'
import { entero, plata } from '@/lib/meta-ads/formato'
import type { LineaPauta } from '@/lib/meta-ads/tipos'
import {
  Badge, StatusPill, TBody, TableWrap, Td, Th, THead, Tr, color, font, space, weight, type Tone,
} from '@/components/ui'

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

export function TablaCeldas({ celdas, moneda, acciones }: {
  celdas: Celda[]
  moneda: string | null
  acciones: Acciones
}) {
  const [abierta, setAbierta] = useState<string | null>(null)
  return (
    <TableWrap>
      <THead>
        <Tr>
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
          return (
            <>
              <Tr key={c.id}>
                <Td strong>
                  <button
                    type="button"
                    onClick={() => setAbierta(esta ? null : c.id)}
                    style={{
                      background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left',
                      font: 'inherit', color: 'inherit',
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
                  {d.firma === 'pieza' && (
                    <div style={{ marginTop: 4 }}><Badge tone="warning">se gasta la pieza</Badge></div>
                  )}
                  {d.firma === 'subasta' && (
                    <div style={{ marginTop: 4 }}><Badge tone="neutral">se encareció la subasta</Badge></div>
                  )}
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
              {/* 🔑 El «por qué» va SIEMPRE visible, no dentro del plegable: un renglón que dice
                  «apagar» sin decir contra qué se lo comparó es un renglón que nadie aprieta. */}
              <Tr key={`${c.id}-por`}>
                <Td colSpan={10} style={{ paddingTop: 0 }}>
                  <ul style={{ margin: 0, paddingLeft: space[4], color: color.mut, fontSize: font.sm, lineHeight: 1.5 }}>
                    {v.porque.map((p) => <li key={p}>{p}</li>)}
                  </ul>
                  {esta && <Detalle celda={c} />}
                </Td>
              </Tr>
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
function Detalle({ celda }: { celda: Celda }) {
  const pasos: [string, number | null, number][] = [
    ['clics', celda.clicks, celda.clicks],
    ['visitas al sitio', celda.lpv, celda.lpv ?? 0],
    ['carritos', celda.carritos, celda.carritos ?? 0],
    ['checkouts', celda.checkouts, celda.checkouts ?? 0],
    ['compras', celda.compras, celda.compras],
  ]
  return (
    <div style={{ marginTop: space[2], display: 'flex', flexDirection: 'column', gap: space[2] }}>
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
