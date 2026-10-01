'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { MarcaClavado } from '@/components/clavados/MarcaClavado'
import { useClavados } from '@/components/clavados/useClavados'
import { HeaderAcciones } from '@/components/layout/acciones'
import { Prendas } from '@/components/mapa-local/Prendas'
import { useMapaLocalDatos } from '@/components/mapa-local/useMapaLocalDatos'
import { Button, KpiCard, Notice, Plegable, SectionCard, Select, TableWrap, TBody, THead, Td, Th, Tr, color, font, space, useToast } from '@/components/ui'
import { conTemporadas, cuelga, despierta, temporadaDe, temporadasDe, temporadasDeHoy, ubicar, type CambioTemporadas } from '@/lib/mapa-local/core'
import { guardarMapa, leerMapa } from '@/lib/mapa-local/cliente'
import { MAPA_INICIAL } from '@/lib/mapa-local/inicial'
import type { Prenda, RangoTemporada, Temporada, Temporadas } from '@/lib/mapa-local/tipos'

/**
 * «Qué se cuelga» (vista del Mapa del local, `/mapa-local/que-se-cuelga`): la decisión de qué va al
 * salón cuando no entra todo. La pidió Bruno el 1-oct-2026, aparte de los percheros para no cargar
 * la vista principal.
 *
 * 🔑 **Mira el mapa GUARDADO, en cómodo**: la misma ubicación que imprime la hoja de cada módulo y que
 * controla el lector. Sin mapa guardado muestra el armado propuesto y ⛔ no deja guardar temporadas
 * (guardar acá lo volvería «el mapa del local» sin que nadie lo haya revisado).
 */

const NOMBRE_TEMPORADA: Record<Temporada, string> = { todo: 'Todo el año', verano: 'Verano', invierno: 'Invierno' }
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DIAS_DEL_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** `09-15` → «15 de septiembre». */
const textoDia = (md: string) => `${Number(md.slice(3, 5))} de ${MESES[Number(md.slice(0, 2)) - 1]}`

export function QueSeCuelga() {
  const toast = useToast()
  const { marca, hoy, prendas, sinEtl, sinCruzarTn, guardado, setGuardado, editar, sinTabla, cargando, error } = useMapaLocalDatos(MAPA_INICIAL)
  const clavados = useClavados(marca === 'zattia' ? 'zattia' : null)
  const [cambio, setCambio] = useState<CambioTemporadas>({})
  const [guardando, setGuardando] = useState(false)
  const [abierto, setAbierto] = useState<Record<string, boolean>>({ sinRotacion: true })

  const mapa = useMemo(() => conTemporadas(guardado?.mapa ?? MAPA_INICIAL, cambio), [guardado, cambio])
  const u = useMemo(() => ubicar(prendas, mapa, 'comodo', hoy), [prendas, mapa, hoy])
  const colgadas = useMemo(() => Object.values(u.porBarra).flat(), [u])
  const sinRotacionAfuera = useMemo(() => u.noEntran.filter((p) => p.tramo === 'sin-rotacion'), [u])
  const sinBarraLibre = useMemo(() => u.noEntran.filter((p) => p.tramo !== 'sin-rotacion'), [u])
  const sinRotacionColgadas = useMemo(() => colgadas.filter((p) => p.tramo === 'sin-rotacion'), [colgadas])
  const deHoy = temporadasDeHoy(mapa, hoy)
  const temporadas = temporadasDe(mapa)

  // Los tipos que van colgados: los del mapa y los que tienen stock, con cuántas prendas hay de cada uno.
  const tipos = useMemo(() => {
    const n = new Map<string, number>()
    for (const p of prendas) n.set(p.tipo, (n.get(p.tipo) || 0) + 1)
    const todos = new Set([...mapa.tipos.map((t) => t.tipo), ...n.keys()])
    return [...todos]
      .filter((t) => cuelga(mapa, t))
      .map((t) => ({ tipo: t, prendas: n.get(t) || 0, temporada: temporadaDe(mapa, t), despierto: despierta(mapa, t, hoy) }))
      .sort((a, b) => b.prendas - a.prendas || a.tipo.localeCompare(b.tipo))
  }, [prendas, mapa, hoy])
  const dormidos = tipos.filter((t) => !t.despierto && t.prendas > 0).map((t) => t.tipo)

  const hayCambio = !!cambio.temporadas || Object.keys(cambio.porTipo ?? {}).length > 0
  const puedeGuardar = editar && !sinTabla && !!guardado?.en

  async function guardar() {
    setGuardando(true)
    try {
      // Se relee el mapa y se le aplica SÓLO el cambio de temporadas: un cambio de barras guardado
      // desde «Percheros» mientras esta pantalla estaba abierta ⛔ no se pisa.
      const ahora = await leerMapa()
      if (!ahora.mapa) throw new Error('Nadie guardó el mapa todavía: guardalo primero en «Percheros».')
      const nuevo = conTemporadas(ahora.mapa, cambio)
      const r = await guardarMapa(nuevo, ahora.actualizadoEn)
      setGuardado({ mapa: nuevo, en: r.actualizadoEn, por: r.actualizadoPor })
      setCambio({})
      toast.ok('Temporadas guardadas.')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  if (marca !== 'zattia') return <Notice tone="warning">El mapa del local es de Zattia. Cambiá de marca arriba para verlo.</Notice>
  if (error) return <Notice tone="danger">{error}</Notice>

  const toggle = (k: string) => setAbierto((a) => ({ ...a, [k]: !a[k] }))
  const cambiarRango = (k: keyof Temporadas, r: RangoTemporada) => setCambio((c) => ({ ...c, temporadas: { ...temporadas, ...c.temporadas, [k]: r } }))
  const cambiarTipo = (tipo: string, t: Temporada) => setCambio((c) => ({ ...c, porTipo: { ...c.porTipo, [tipo]: t } }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[5] }}>
      {editar && (
        <HeaderAcciones>
          {hayCambio && (
            <Button variant="outline" onClick={() => setCambio({})}>
              Descartar los cambios
            </Button>
          )}
          <Button variant="solid" tone="brand" onClick={() => void guardar()} loading={guardando} disabled={!hayCambio || !puedeGuardar}>
            Guardar las temporadas
          </Button>
        </HeaderAcciones>
      )}

      {cargando ? (
        <Notice>Cargando el mapa, el stock del Local y las ventas…</Notice>
      ) : (
        <>
          {!guardado?.en && (
            <Notice tone="brand">
              Nadie guardó el mapa todavía: esto se calcula sobre el armado propuesto. Para guardar las temporadas, guardá primero el mapa en <Link href="/mapa-local">Percheros</Link>.
            </Notice>
          )}
          {sinEtl && <Notice tone="warning">Todavía se están cargando las ventas: hasta que terminen, ninguna prenda es nueva ni figura sin rotación.</Notice>}
          {sinCruzarTn && <Notice tone="warning">Todavía se está cargando el catálogo: hasta que termine, ninguna prenda sabe si está en sale.</Notice>}

          <SectionCard title={deHoy.verano && deHoy.invierno ? 'Hoy: cambio de temporada' : deHoy.verano ? 'Hoy: verano' : deHoy.invierno ? 'Hoy: invierno' : 'Hoy: ninguna temporada'} subtitle={dormidos.length ? `Duermen: ${dormidos.join(', ')}. No piden percha hasta que empiece su temporada.` : 'No duerme ningún tipo con stock en el Local: compiten todos por la percha.'}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: space[4] }}>
              {(['verano', 'invierno'] as const).map((k) => (
                <div key={k}>
                  <div style={{ fontSize: font.sm, fontWeight: 600, marginBottom: space[2] }}>
                    {NOMBRE_TEMPORADA[k]}
                    <span style={{ fontWeight: 400, color: color.mut }}> · {deHoy[k] ? 'corre hoy' : 'duerme hoy'}</span>
                  </div>
                  {editar ? (
                    <EditorRango rango={temporadas[k]} onCambiar={(r) => cambiarRango(k, r)} />
                  ) : (
                    <div style={{ fontSize: font.sm }}>
                      del {textoDia(temporadas[k].desde)} al {textoDia(temporadas[k].hasta)}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ fontSize: font.xs, color: color.mut, marginTop: space[3] }}>
              Cuando las fechas se pisan es el cambio de temporada: están despiertas las dos y compiten por la percha con las mismas reglas.
            </div>
          </SectionCard>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: space[3] }}>
            <KpiCard label="Colgadas" value={colgadas.length} sub="a percha cómoda, con el stock de hoy" />
            <KpiCard label="Durmiendo" value={u.durmiendo.length} sub="fuera de temporada: no piden percha" />
            <KpiCard label="No entran" value={u.noEntran.length} tone={u.noEntran.length ? 'danger' : 'success'} sub="tienen barra, pero está llena" />
            <KpiCard label="Sin rotación afuera" value={sinRotacionAfuera.length} tone={sinRotacionAfuera.length ? 'warning' : 'success'} sub="no entran y no vendieron en 30 días" />
          </div>

          <div style={{ fontSize: font.sm, color: color.ink2 }}>
            Cuando no entra todo, <b>lo que entró hace 7 días o menos</b> tiene lugar asegurado. El resto compite por <b>lo que vende por día</b> desde que está a la venta: algo nuevo que ya vende rápido le gana a algo viejo, y algo viejo que vende mucho le gana a algo nuevo que todavía no vendió. Al final queda <b>lo que no vendió nada en 30 días</b>. El outlet compite igual que lo demás, sin trato aparte.
          </div>

          <Plegable abierto={!!abierto.sinRotacion} onToggle={() => toggle('sinRotacion')} titulo={`No entran y no vendieron en 30 días (${sinRotacionAfuera.length})`} ayuda="Son las primeras que quedan afuera. Para decidir: sale, liquidación o marcarlas como clavado.">
            <TablaSinRotacion prendas={sinRotacionAfuera} clavados={clavados} vacio="No hay prendas sin rotación afuera del salón." />
          </Plegable>
          <Plegable abierto={!!abierto.colgadasSinRotacion} onToggle={() => toggle('colgadasSinRotacion')} titulo={`Colgadas que no vendieron en 30 días (${sinRotacionColgadas.length})`} ayuda="Ocupan percha porque a su tipo le sobra lugar. Si entra algo nuevo de su tipo, son las primeras en salir.">
            <TablaSinRotacion prendas={sinRotacionColgadas} clavados={clavados} vacio="Todo lo colgado vendió en los últimos 30 días." />
          </Plegable>
          <Plegable abierto={!!abierto.sinBarra} onToggle={() => toggle('sinBarra')} titulo={`Venden, pero no tienen percha libre (${sinBarraLibre.length})`} ayuda="Tienen barra de su tipo y línea, pero está llena con lo que vende más. Si sobran muchas, a su tipo le falta una barra (se cambia en «Percheros»).">
            <Prendas prendas={sinBarraLibre} conVentas vacio="Todo lo que vende tiene percha." />
          </Plegable>
          <Plegable abierto={!!abierto.durmiendo} onToggle={() => toggle('durmiendo')} titulo={`Durmiendo por temporada (${u.durmiendo.length})`} ayuda="Se guardan a propósito y vuelven solas cuando empieza su temporada. No cuentan como «no entran».">
            <Prendas prendas={u.durmiendo} conVentas vacio="No duerme ninguna prenda con stock en el Local." />
          </Plegable>

          <SectionCard title="Temporada de cada tipo" subtitle="Fuera de su temporada, el tipo duerme: no pide percha.">
            <TableWrap>
              <THead>
                <Tr>
                  <Th>Tipo</Th>
                  <Th align="right">Prendas en el Local</Th>
                  <Th>Temporada</Th>
                  <Th>Hoy</Th>
                </Tr>
              </THead>
              <TBody>
                {tipos.map((t) => (
                  <Tr key={t.tipo}>
                    <Td>
                      <b>{t.tipo}</b>
                    </Td>
                    <Td align="right">{t.prendas}</Td>
                    <Td>
                      {editar ? (
                        <Select value={t.temporada} onChange={(e) => cambiarTipo(t.tipo, e.target.value as Temporada)}>
                          {(['todo', 'verano', 'invierno'] as const).map((k) => (
                            <option key={k} value={k}>
                              {NOMBRE_TEMPORADA[k]}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        NOMBRE_TEMPORADA[t.temporada]
                      )}
                    </Td>
                    <Td style={{ color: t.despierto ? undefined : color.mut }}>{t.despierto ? 'Va al salón' : 'Duerme'}</Td>
                  </Tr>
                ))}
              </TBody>
            </TableWrap>
          </SectionCard>

          <div style={{ fontSize: font.xs, color: color.mut }}>
            Las ventas son las de los últimos 30 días, sumando el local y la tienda online. El stock es el del espejo de Gestión Nube.
          </div>
        </>
      )}
    </div>
  )
}

/** Día y mes de un tramo de temporada, con dos desplegables por punta (sin año: vale todos los años). */
function EditorRango({ rango, onCambiar }: { rango: RangoTemporada; onCambiar: (r: RangoTemporada) => void }) {
  const punta = (k: 'desde' | 'hasta') => {
    const mes = Number(rango[k].slice(0, 2))
    const dia = Number(rango[k].slice(3, 5))
    const poner = (m: number, d: number) => onCambiar({ ...rango, [k]: `${String(m).padStart(2, '0')}-${String(Math.min(d, DIAS_DEL_MES[m - 1])).padStart(2, '0')}` })
    return (
      <span style={{ display: 'inline-flex', gap: space[1], alignItems: 'center' }}>
        <Select value={dia} onChange={(e) => poner(mes, Number(e.target.value))} aria-label={`Día (${k})`} style={{ width: 70 }}>
          {Array.from({ length: DIAS_DEL_MES[mes - 1] }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
        <Select value={mes} onChange={(e) => poner(Number(e.target.value), dia)} aria-label={`Mes (${k})`} style={{ width: 130 }}>
          {MESES.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </Select>
      </span>
    )
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space[2], fontSize: font.sm }}>
      del {punta('desde')} al {punta('hasta')}
    </div>
  )
}

/** Las prendas sin rotación en tabla: para decidir una por una, con la marca de clavado al lado. */
function TablaSinRotacion({ prendas, clavados, vacio }: { prendas: Prenda[]; clavados: ReturnType<typeof useClavados>; vacio: string }) {
  if (!prendas.length) return <div style={{ fontSize: font.sm, color: color.mut }}>{vacio}</div>
  return (
    <TableWrap>
      <THead>
        <Tr>
          <Th>Prenda</Th>
          <Th>Línea</Th>
          <Th align="right">En el Local</Th>
          <Th>Última venta</Th>
          <Th>Clavado</Th>
        </Tr>
      </THead>
      <TBody>
        {prendas.map((p) => (
          <Tr key={p.clave}>
            <Td>
              <b>{p.nombre}</b>
              {p.color && <span style={{ color: color.mut }}> · {p.color}</span>}
            </Td>
            <Td>{p.linea === 'sale' ? 'Sale' : p.linea === 'nc' ? 'Colección' : '—'}</Td>
            <Td align="right">{p.unidades} u</Td>
            <Td>{p.ultimaVenta ? new Date(p.ultimaVenta.slice(0, 10) + 'T00:00:00').toLocaleDateString('es-AR') : 'sin ventas registradas'}</Td>
            <Td>
              <MarcaClavado p={{ id: p.productId, name: p.nombre }} clavados={clavados} />
            </Td>
          </Tr>
        ))}
      </TBody>
    </TableWrap>
  )
}

