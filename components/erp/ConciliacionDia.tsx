'use client'

/**
 * ERP › Conciliación (paso 7). El ERP contra Tienda Nube, GN y Mercado Libre (sólo BDI), un día: cuánto cierra y la lista de lo que
 * ⛔ cierra, agrupado por qué pasó y qué mirar. Sólo lectura: una prenda abre su stock e historial; un pedido, Tienda Nube.
 *
 * Se calcula una vez por día, a las 13:40 (el cruce del motor, `bin/tn.mjs conciliar`); el stock de Tienda Nube se lee
 * en ese momento. Hasta el corte GN sirve y el ERP es la prueba: acá se mira, ⛔ se arregla.
 */

import { useEffect, useState } from 'react'
import { Badge, Button, EmptyState, Field, Notice, SectionCard, Select, TableWrap, TBody, Td, Th, THead, Tr, Tabs, space } from '@/components/ui'
import { leerConciliacion, type ConciliacionDelDia, type FilaConciliacion, type TiendaErp } from '@/lib/erp/cliente'
import type { PrendaPedida } from './stock/StockErp'

const TIENDAS: Array<{ key: TiendaErp; label: string }> = [{ key: 'zattia', label: 'Zattia' }, { key: 'stunned', label: 'Stunned' }, { key: 'bdi', label: 'BDI' }]
const dia = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`
const hora = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString().slice(11, 16) : '—')
const pesos = (n: number | null) => (n == null ? '—' : `$ ${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`)
const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : '—')

export function ConciliacionDia({ abrirPrenda }: { abrirPrenda: (p: PrendaPedida) => void }) {
  const [tienda, setTienda] = useState<TiendaErp>('zattia')
  const [fecha, setFecha] = useState<string | null>(null)
  const [datos, setDatos] = useState<ConciliacionDelDia | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vuelta, setVuelta] = useState(0)
  const pedido = `${tienda}|${fecha ?? ''}|${vuelta}`
  const [leido, setLeido] = useState<string | null>(null)
  const cargando = leido !== pedido

  useEffect(() => {
    let vivo = true
    leerConciliacion(tienda, fecha)
      .then((d) => { if (vivo) { setDatos(d); setError(null) } })
      .catch((e) => vivo && setError(e instanceof Error ? e.message : 'No se pudo leer la conciliación del día.'))
      .finally(() => vivo && setLeido(pedido))
    return () => { vivo = false }
  }, [tienda, fecha, pedido])

  const marca = tienda === 'bdi' ? 'bdi' : 'zattia'
  const abrir = (f: FilaConciliacion) => f.producto && f.talle && abrirPrenda({ marca, producto: f.producto, talle: f.talle })
  const prendaDe = (f: FilaConciliacion) => (f.nombre ? `${f.nombre}${f.talleNombre ? ` · ${f.talleNombre}` : ''}` : f.sku ?? f.clave)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <SectionCard title="Conciliación" subtitle="El ERP contra Tienda Nube, GN y Mercado Libre: cuánto coincide y lo que no, con qué mirar. Se calcula una vez por día, a las 13:40.">
        <Tabs items={TIENDAS} value={tienda} onChange={(k) => { setTienda(k as TiendaErp); setFecha(null); setDatos(null) }} />
        {datos && datos.dias.length > 0 && (
          <div style={{ display: 'flex', gap: space[3], marginTop: space[3], alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <Field label="Día">
              <Select value={datos.fecha ?? ''} onChange={(e) => setFecha(e.target.value)} disabled={cargando}>
                {datos.dias.map((d) => <option key={d} value={d}>{dia(d)}</option>)}
              </Select>
            </Field>
            <span>Calculado a las {hora(datos.calculadoEn)}.</span>
          </div>
        )}
      </SectionCard>

      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      {cargando && !datos && <EmptyState title="Leyendo la conciliación…" />}
      {datos?.sinTablas && <Notice tone="warning">La conciliación todavía no está instalada en esta base.</Notice>}
      {datos && !datos.sinTablas && !datos.fecha && <EmptyState title="Todavía no se calculó ningún día." />}

      {datos && datos.fecha && (
        <>
          <SectionCard title={!datos.tarjetas.some((t) => t.calculado) ? 'Ese día no se calculó' : datos.noCierran ? `${datos.noCierran} no coinciden` : 'Todo coincide'}>
            <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
              {datos.tarjetas.map((t) => (
                <div key={t.tipo} style={{ minWidth: 220 }}>
                  <strong>{t.nombre}</strong>
                  {!t.calculado ? <div>No se calculó ese día.</div>
                    : t.tipo.startsWith('stock_') ? <div>Coinciden {t.cierran} de {t.total} {t.unidad} ({pct(t.cierran ?? 0, t.total ?? 0)}){t.aparte ? <> · {t.aparte} {t.tipo === 'stock_ml' ? 'publicaciones' : 'de la tienda'} sin producto en el ERP</> : null}</div>
                      : <div>{t.noCierran ? `${t.noCierran} de ${t.total} ${t.unidad} no coinciden` : `Coinciden los ${t.total} ${t.unidad}`} (últimos 7 días)</div>}
                </div>
              ))}
              <div style={{ minWidth: 220 }}>
                <strong>Stock por depósito: GN y el ERP</strong>
                <div>{!datos.gn.calculado ? 'No se calculó ese día.' : datos.gn.sinExplicar ? `${datos.gn.sinExplicar} sin explicar: verlas en Diferencias del día` : 'Todo explicado (Diferencias del día)'}</div>
              </div>
            </div>
            {datos.enVuelo > 0 && <div style={{ marginTop: space[2] }}><Badge tone="neutral">Recién pagados, todavía en camino: {datos.enVuelo}</Badge></div>}
            {datos.desconocidas > 0 && <Notice tone="warning">{datos.desconocidas} con una clase que esta pantalla todavía no conoce.</Notice>}
          </SectionCard>

          {datos.grupos.map((g) => (
            <SectionCard key={`${g.tipo}/${g.clase}`} title={`${g.nombre} · ${g.filas.length}`} subtitle={`${g.mirar}${g.deAntes ? ` (${g.deAntes} vienen de días anteriores)` : ''}`}>
              <TableWrap>
                {g.tipo.startsWith('stock_') ? (
                  <>
                    <THead>
                      <Tr>
                        <Th>Prenda</Th><Th>SKU</Th>
                        <Th style={{ textAlign: 'right' }}>{g.tipo === 'stock_ml' ? 'Mercado Libre' : 'Tienda Nube'}</Th><Th style={{ textAlign: 'right' }}>ERP</Th><Th style={{ textAlign: 'right' }}>GN</Th>
                        <Th style={{ textAlign: 'right' }}>Días</Th>
                      </Tr>
                    </THead>
                    <TBody>
                      {g.filas.map((f) => (
                        <Tr key={f.clave} onClick={f.producto ? () => abrir(f) : undefined} style={f.producto ? { cursor: 'pointer' } : undefined}>
                          <Td>{prendaDe(f)}</Td>
                          <Td>{f.sku ?? '—'}</Td>
                          <Td style={{ textAlign: 'right' }}>{f.tn ?? '—'}</Td>
                          <Td style={{ textAlign: 'right' }}>{f.erp ?? '—'}{f.reservado ? <div style={{ fontSize: 12 }}>{f.reservado} reservado</div> : null}</Td>
                          <Td style={{ textAlign: 'right' }}>{f.gn ?? '—'}</Td>
                          <Td style={{ textAlign: 'right' }}>{f.dias}</Td>
                        </Tr>
                      ))}
                    </TBody>
                  </>
                ) : (
                  <>
                    <THead>
                      <Tr><Th>{g.tipo === 'pedido_ml' ? 'Venta' : 'Pedido'}</Th><Th>{g.tipo === 'pedido_ml' ? 'Estado en Mercado Libre' : 'Estado en Tienda Nube'}</Th><Th>Medio</Th><Th style={{ textAlign: 'right' }}>Total</Th><Th style={{ textAlign: 'right' }}>Días</Th></Tr>
                    </THead>
                    <TBody>
                      {g.filas.map((f) => (
                        <Tr key={f.clave}>
                          <Td>
                            {f.link ? <a href={f.link} target="_blank" rel="noreferrer">#{f.numero}</a> : `#${f.numero}`}
                            {f.motivo && <div style={{ fontSize: 12 }}>{f.motivo}</div>}
                            {f.totalErp != null && <div style={{ fontSize: 12 }}>En el ERP: {pesos(f.totalErp)}</div>}
                          </Td>
                          <Td>{f.estado ?? '—'}</Td>
                          <Td>{f.medio ?? '—'}</Td>
                          <Td style={{ textAlign: 'right' }}>{pesos(f.total)}</Td>
                          <Td style={{ textAlign: 'right' }}>{f.dias}</Td>
                        </Tr>
                      ))}
                    </TBody>
                  </>
                )}
              </TableWrap>
            </SectionCard>
          ))}
        </>
      )}

      {datos && <div><Button variant="outline" disabled={cargando} onClick={() => setVuelta((n) => n + 1)}>Volver a leer</Button></div>}
    </div>
  )
}
