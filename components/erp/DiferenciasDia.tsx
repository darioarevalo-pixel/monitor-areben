'use client'

/**
 * ERP › Diferencias del día (`pantallas.md` #9). Lo que el libro de stock ⛔ pudo explicar al comparar su día
 * con el de GN, agrupado por qué pasó y qué mirar, para resolverlo; y la SOBREVENTA: las prendas que el libro
 * deja en negativo (la última unidad vendida por dos lados). Hoy esto sale por consola. Sólo lectura: cada fila
 * abre el stock y el historial de la prenda.
 *
 * El libro se calcula una vez por día (la corrida de las 13:00) con las fotos de GN de las 06:40.
 */

import { useEffect, useState } from 'react'
import { Badge, Button, EmptyState, Field, Notice, SectionCard, Select, TableWrap, TBody, Td, Th, THead, Tr, Tabs, space } from '@/components/ui'
import { leerDiferencias, type DiferenciasDelDia, type MarcaErp } from '@/lib/erp/cliente'
import { NOMBRE_DEPOSITO } from '@/lib/erp/stock.core.js'
import type { PrendaPedida } from './StockPrenda'

const MARCAS: Array<{ key: MarcaErp; label: string }> = [{ key: 'zattia', label: 'Zattia' }, { key: 'bdi', label: 'BDI' }]
const NOMBRE_LINEA: Record<string, string> = { bdi: 'BDI', zattia: 'Zattia', stunned: 'Stunned' }
const conSigno = (n: number) => (n > 0 ? `+${n}` : String(n))
const dia = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`
const hora = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString().slice(11, 16) : '—')

export function DiferenciasDia({ abrirPrenda }: { abrirPrenda: (p: PrendaPedida) => void }) {
  const [marca, setMarca] = useState<MarcaErp>('zattia')
  const [fecha, setFecha] = useState<string | null>(null)
  const [datos, setDatos] = useState<DiferenciasDelDia | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vuelta, setVuelta] = useState(0)
  // Qué se pidió y qué llegó: «cargando» es que todavía ⛔ llegó lo pedido (sin setState dentro del effect).
  const pedido = `${marca}|${fecha ?? ''}|${vuelta}`
  const [leido, setLeido] = useState<string | null>(null)
  const cargando = leido !== pedido

  useEffect(() => {
    let vivo = true
    leerDiferencias(marca, fecha)
      .then((d) => { if (vivo) { setDatos(d); setError(null) } })
      .catch((e) => vivo && setError(e instanceof Error ? e.message : 'No se pudieron leer las diferencias del día.'))
      .finally(() => vivo && setLeido(pedido))
    return () => { vivo = false }
  }, [marca, fecha, pedido])

  const abrir = (p: { producto: string; talle: string }) => abrirPrenda({ marca, producto: p.producto, talle: p.talle })
  const prendaDe = (f: { nombre: string | null; producto: string; talleNombre: string | null; talle: string }) => `${f.nombre ?? `Producto ${f.producto}`} · ${f.talleNombre ?? f.talle}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <SectionCard title="Diferencias del día" subtitle="Lo que el libro de stock no pudo explicar comparado con GN, y las prendas que quedaron en negativo. Tocá una fila para ver su historial.">
        <Tabs items={MARCAS} value={marca} onChange={(k) => { setMarca(k as MarcaErp); setFecha(null); setDatos(null) }} />
        {datos && datos.dias.length > 0 && (
          <div style={{ display: 'flex', gap: space[3], marginTop: space[3], alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <Field label="Día">
              <Select value={datos.fecha ?? ''} onChange={(e) => setFecha(e.target.value)} disabled={cargando}>
                {datos.dias.map((d) => <option key={d} value={d}>{dia(d)}</option>)}
              </Select>
            </Field>
            <span>Fotos de GN de {hora(datos.fotoDesde)} del día anterior a {hora(datos.fotoHasta)}.</span>
          </div>
        )}
      </SectionCard>

      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      {cargando && !datos && <EmptyState title="Leyendo el libro…" />}

      {datos && !datos.fecha && <EmptyState title="El libro todavía no calculó ningún día." />}

      {datos && datos.fecha && (
        <>
          <SectionCard title={datos.inexplicadas ? `${datos.inexplicadas} sin explicar` : 'Todo explicado'}>
            {!datos.inexplicadas && <Notice tone="success">El libro explicó todas las diferencias del {dia(datos.fecha)}.</Notice>}
            {datos.explicadas.length > 0 && (
              <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
                <span>Explicadas solas:</span>
                {datos.explicadas.map((e) => <Badge key={e.clase} tone="neutral">{e.nombre}: {e.variantes}</Badge>)}
              </div>
            )}
            {datos.desconocidas > 0 && <Notice tone="warning">{datos.desconocidas} con una clase que esta pantalla todavía no conoce.</Notice>}
          </SectionCard>

          {datos.grupos.map((g) => (
            <SectionCard key={g.clase} title={`${g.nombre} · ${g.filas.length}`} subtitle={`${g.mirar} (${g.unidades} u)`}>
              <TableWrap>
                <>
                  <THead>
                    <Tr>
                      <Th>Prenda</Th><Th>Depósito</Th>
                      <Th style={{ textAlign: 'right' }}>GN movió</Th><Th style={{ textAlign: 'right' }}>Libro movió</Th>
                      <Th style={{ textAlign: 'right' }}>Hay en GN</Th><Th style={{ textAlign: 'right' }}>Según libro</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {g.filas.map((f) => (
                      <Tr key={`${f.producto}/${f.talle}/${f.deposito}`} onClick={() => abrir(f)} style={{ cursor: 'pointer' }}>
                        <Td>{prendaDe(f)}{f.linea !== marca && <> <Badge tone="neutral">{NOMBRE_LINEA[f.linea] ?? f.linea}</Badge></>}{f.explicacion && <div style={{ fontSize: 12 }}>{f.explicacion}</div>}</Td>
                        <Td>{NOMBRE_DEPOSITO[f.deposito as keyof typeof NOMBRE_DEPOSITO] ?? f.deposito}</Td>
                        <Td style={{ textAlign: 'right' }}>{conSigno(f.deltaGN)}</Td>
                        <Td style={{ textAlign: 'right' }}>{conSigno(f.deltaLibro)}</Td>
                        <Td style={{ textAlign: 'right' }}>{f.nivelGN}</Td>
                        <Td style={{ textAlign: 'right' }}>{f.nivelLibro}</Td>
                      </Tr>
                    ))}
                  </TBody>
                </>
              </TableWrap>
            </SectionCard>
          ))}
        </>
      )}

      {datos && (
        <SectionCard title="Sobreventa: el libro en negativo" subtitle="La última unidad se vendió por dos lados (el local y la tienda online), o falta un ingreso. Es el estado de hoy, no del día elegido.">
          {datos.sobreventaSinConexion ? <Notice tone="warning">Falta la conexión al libro en este servidor: la sobreventa se ve en producción.</Notice>
            : datos.sobreventaError ? <Notice tone="danger">No se pudo sumar el libro: {datos.sobreventaError}</Notice>
              : !datos.sobreventa.length ? <EmptyState title="Ninguna prenda en negativo." /> : (
                <TableWrap>
                  <>
                    <THead><Tr><Th>Prenda</Th><Th>Depósito</Th><Th style={{ textAlign: 'right' }}>Según libro</Th></Tr></THead>
                    <TBody>
                      {datos.sobreventa.map((f) => (
                        <Tr key={`${f.producto}/${f.talle}/${f.deposito}`} onClick={() => abrir(f)} style={{ cursor: 'pointer' }}>
                          <Td>{prendaDe(f)}{f.linea !== marca && <> <Badge tone="neutral">{NOMBRE_LINEA[f.linea] ?? f.linea}</Badge></>}</Td>
                          <Td>{NOMBRE_DEPOSITO[f.deposito as keyof typeof NOMBRE_DEPOSITO] ?? f.deposito}</Td>
                          <Td style={{ textAlign: 'right' }}>{f.nivelLibro}</Td>
                        </Tr>
                      ))}
                    </TBody>
                  </>
                </TableWrap>
              )}
        </SectionCard>
      )}

      {datos && <div><Button variant="outline" disabled={cargando} onClick={() => setVuelta((n) => n + 1)}>Volver a leer</Button></div>}
    </div>
  )
}
