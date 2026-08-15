'use client'

/**
 * La bitácora de una campaña: cada precio que se escribió en Gestión Nube y cada uno que se sacó.
 *
 * # Por qué existe
 *
 * El ítem contesta "¿qué precio tiene puesto **ahora**?" y esa es toda su memoria: cuando se saca
 * la oferta, `aplicadoEn` y `precioEscrito` vuelven a `null` (`api/_liquidacion.js`), que es correcto
 * —`aplicado` quiere decir que está puesto en este momento— pero borra la única huella de que ese
 * precio existió. Con el WINTER SALE eso son 260 productos: al levantarlo, la campaña más grande del
 * año se quedaba sin registro de haber pasado.
 *
 * Acá va la **ida y la vuelta**, y nada más. Las decisiones —quién definió un precio, quién lo
 * revisó, quién objetó— ya viven en el ítem con su nombre y su fecha. Esto es lo que el cliente
 * llegó a ver en la góndola.
 *
 * # Las decisiones de esta pantalla
 *
 *  1. **Se agrupa en tandas.** Aplicar el sale de agosto fueron 260 renglones escritos en 5,6
 *     minutos; sacarlo van a ser otros 260. Una lista plana de 520 filas no se lee. La tanda dice
 *     "el 13 de agosto se pusieron 260 ofertas" y el detalle está adentro, para cuando se lo busca.
 *  2. **El estado se cuenta por el ÚLTIMO movimiento de cada producto**, no sumando los `poner`: uno
 *     que entró y salió aparecería dos veces y la campaña diría que tiene el doble de ofertas
 *     puestas que las que hay.
 *  3. **Un producto que ya no está en la campaña sigue apareciendo.** Se le escribió un precio en la
 *     tienda de verdad; que después lo hayan sacado de la lista no lo deshace. Por eso el evento
 *     lleva copiado el nombre del producto y no se lo busca en los ítems.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  agruparEnTandas, estadoSegunBitacora, pctDeEvento,
  type EventoBitacora, type LiquidacionItem, type ModoBitacora,
} from '@/lib/liquidacion'
import { leerBitacora } from '@/lib/liquidacion/persistencia'
import type { Marca } from '@/lib/nav'
import {
  BuscarInput, Card, EmptyState, Esqueleto, FilterBar, KpiCard, Notice, Plegable, Select,
  TBody, THead, TableWrap, Td, Th, Tr, formatMoney, color, font, space,
} from '@/components/ui'

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** "13-ago 18:04". La hora importa: una tanda se reconoce por el minuto en que arrancó. */
function cuandoCorto(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getDate()}-${MESES[d.getMonth()]} ${hh}:${mm}`
}

/** El precio, o el cartel que dice **sin oferta** — que no es lo mismo que no saberlo. */
function Precio({ v }: { v: number | null }) {
  if (v == null) return <span style={{ color: color.mut2 }}>sin oferta</span>
  return <>{formatMoney(v)}</>
}

export function Bitacora({ liqId, marca, items }: { liqId: string; marca: Marca; items: LiquidacionItem[] }) {
  const [eventos, setEventos] = useState<EventoBitacora[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [modo, setModo] = useState<'' | ModoBitacora>('')
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set())

  // ⚠️ El lint prohíbe `setState` sincrónico adentro de un efecto, así que el reseteo va también
  // dentro del `async`: cambiar de campaña tiene que volver al esqueleto, y no hacerlo mostraría los
  // eventos de la campaña anterior mientras baja la nueva.
  useEffect(() => {
    let vivo = true
    void (async () => {
      setEventos(null)
      setError(null)
      try {
        const e = await leerBitacora(marca, liqId)
        if (vivo) setEventos(e)
      } catch (err) {
        if (vivo) setError(err instanceof Error ? err.message : 'No se pudo leer la bitácora.')
      }
    })()
    return () => { vivo = false }
  }, [marca, liqId])

  // El estado se calcula sobre TODOS los eventos, no sobre los filtrados: "cuántas ofertas hay
  // puestas" no puede depender de lo que alguien haya tipeado en el buscador.
  const estado = useMemo(() => estadoSegunBitacora(eventos || []), [eventos])

  const tandas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const filtrados = (eventos || []).filter((e) => {
      if (modo && e.modo !== modo) return false
      if (!q) return true
      return e.producto.toLowerCase().includes(q) || (e.sku || '').toLowerCase().includes(q) || e.pid.includes(q)
    })
    return agruparEnTandas(filtrados)
  }, [eventos, busca, modo])

  // Los aplicados de la campaña que la bitácora no conoce. Con el backfill corrido esto da cero;
  // sin correr, avisa en vez de mostrar una pantalla vacía que parece decir "nunca pasó nada".
  const aplicadosSinRegistro = useMemo(() => {
    if (!eventos) return 0
    const conocidos = new Set(eventos.map((e) => e.pid))
    return items.filter((i) => i.estado === 'aplicado' && !conocidos.has(i.pid)).length
  }, [eventos, items])

  if (error) return <Notice tone="danger">{error}</Notice>
  if (eventos === null) return <Esqueleto forma="tabla" />

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: space[3], marginBottom: space[4] }}>
        <KpiCard label="Con la oferta puesta" value={String(estado.puestos)} sub="según el último movimiento de cada uno" />
        <KpiCard label="Ya se sacaron" value={String(estado.sacados)} sub="volvieron a lista o a su oferta previa" />
        <KpiCard
          label="Última escritura"
          value={estado.ultima ? cuandoCorto(estado.ultima) : '—'}
          sub={`${eventos.length} ${eventos.length === 1 ? 'movimiento' : 'movimientos'} en total`}
        />
      </div>

      {aplicadosSinRegistro > 0 && (
        <Notice tone="warning" style={{ marginBottom: space[4] }}>
          <b>{aplicadosSinRegistro}</b> {aplicadosSinRegistro === 1 ? 'producto tiene' : 'productos tienen'} el precio
          puesto en Gestión Nube pero {aplicadosSinRegistro === 1 ? 'no aparece' : 'no aparecen'} acá: se aplicaron antes
          de que existiera la bitácora. Se reconstruyen corriendo <code>scripts/backfill-liquidacion-bitacora.mjs</code>.
        </Notice>
      )}

      <FilterBar>
        <BuscarInput value={busca} onChange={setBusca} placeholder="Producto, SKU o id…" />
        <Select
          value={modo}
          onChange={(e) => setModo(e.target.value as '' | ModoBitacora)}
          style={{ width: 210 }}
          aria-label="Qué movimiento"
        >
          <option value="">Todo</option>
          <option value="poner">Se puso la oferta ({eventos.filter((e) => e.modo === 'poner').length})</option>
          <option value="sacar">Se sacó la oferta ({eventos.filter((e) => e.modo === 'sacar').length})</option>
        </Select>
      </FilterBar>

      {tandas.length === 0 ? (
        <EmptyState
          title={eventos.length ? 'Nada para mostrar con ese filtro' : 'Todavía no se escribió ningún precio'}
          hint={
            eventos.length
              ? 'Probá con otro texto o limpiá el filtro.'
              : 'Acá queda cada precio de sale que se escriba en Gestión Nube y cada uno que se saque, con quién lo hizo y cuándo.'
          }
        />
      ) : (
        <Card>
          {tandas.map((t) => {
            const n = t.eventos.length
            const punta = cuandoCorto(t.desde)
            const otra = cuandoCorto(t.hasta)
            return (
              <Plegable
                key={t.id}
                abierto={abiertas.has(t.id)}
                onToggle={() => setAbiertas((s) => {
                  const n2 = new Set(s)
                  if (n2.has(t.id)) n2.delete(t.id)
                  else n2.add(t.id)
                  return n2
                })}
                titulo={`${t.modo === 'poner' ? 'Se pusieron' : 'Se sacaron'} ${n} ${n === 1 ? 'oferta' : 'ofertas'}`}
                // Cerrado, el renglón tiene que alcanzar para saber si vale la pena abrirlo: cuándo
                // fue y quién lo hizo. Las dos puntas sólo si la tanda duró más de un minuto — es lo
                // que distingue una corrida larga de un toque suelto.
                ayuda={`${punta}${punta === otra ? '' : ` → ${otra}`} · ${t.porQuien || 'sin nombre'}`}
              >
                <TableWrap>
                  <THead>
                    <Tr>
                      <Th>Producto</Th>
                      <Th>SKU</Th>
                      <Th align="right">Antes</Th>
                      <Th align="right">Quedó</Th>
                      <Th align="right">Desc.</Th>
                      <Th align="right">Hora</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {t.eventos.map((e) => {
                      const p = pctDeEvento(e)
                      return (
                        <Tr key={e.id}>
                          <Td>{e.producto || <span style={{ color: color.mut2 }}>(sin nombre)</span>}</Td>
                          <Td mono style={{ color: color.mut, fontSize: font.sm }}>{e.sku || '—'}</Td>
                          <Td align="right"><Precio v={e.precioDe} /></Td>
                          <Td align="right" strong><Precio v={e.precioA} /></Td>
                          <Td align="right">{p == null ? '—' : `${p}%`}</Td>
                          <Td align="right" style={{ color: color.mut, fontSize: font.sm }}>{cuandoCorto(e.cuando)}</Td>
                        </Tr>
                      )
                    })}
                  </TBody>
                </TableWrap>
              </Plegable>
            )
          })}
        </Card>
      )}
    </>
  )
}
