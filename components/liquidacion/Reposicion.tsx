'use client'

/**
 * Reposición durante la campaña: qué talle bajar del depósito al local, en el día.
 *
 * Lo pidió Bruno el 14-sep-2026, el día que abrió la Feria de Zattia: *«me da miedo que se venda
 * mucho… ventas en real time con reposición en real time, principalmente de artículos que quedan
 * disponibles en depósito»*. La cuenta vive en `lib/liquidacion/reposicion.ts`.
 *
 * # Las decisiones de esta pantalla
 *
 *  1. **Se refresca sola cada 5 minutos**, sólo con la pestaña visible: trae las ventas de hoy de
 *     Gestión Nube (el mismo `sincronizar-ventas` de Resultado, ~1 s) y recalcula. Leer el stock de
 *     GN en cada vuelta tardaría 20-60 s y gastaría el cupo que comparten los otros sistemas.
 *  2. 🔑 **«Releer stock de Gestión Nube» es para DESPUÉS DE REPONER.** El espejo no ve lo que se
 *     bajó del depósito; leer GN en vivo sí, y la base nueva lleva adentro las ventas que ya conoce
 *     ⇒ lo repuesto sale de la lista sin descontar dos veces lo vendido.
 *  3. **Lo que no tiene depósito va aparte y plegado**: se agota en el local y ahí termina.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import type { Liquidacion as Campania, LiquidacionItem } from '@/lib/liquidacion'
import {
  agotadosSinDeposito, aReponer, nuncaEnLocal, stockAhora, ventasDelDia,
  type FilaStock, type LineaReposicion, type ParaReponer,
} from '@/lib/liquidacion/reposicion'
import { leerReposicionCampania } from '@/lib/liquidacion/ventas'
import { sincronizarVentas } from '@/lib/liquidacion/persistencia'
import { leerInventarioVivo } from '@/lib/inventario-vivo/cliente'
import {
  Button, Card, EmptyState, Esqueleto, FilterBar, KpiCard, Lightbox, Notice, Select,
  TBody, THead, TableWrap, Td, Th, Tr, formatMoney, color, font, space, useToast, weight,
} from '@/components/ui'

const CADA_MS = 5 * 60 * 1000

type Base = { filas: FilaStock[]; incluidas: Set<string>; fuente: 'espejo' | 'vivo'; leidoEn: string | null }

/** Hoy en Argentina, sin `toISOString` (que se corre de día a la noche). */
function hoyAR(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}

function horaAR(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit' })
}

export function Reposicion({
  campania,
  items,
  puedeSincronizar,
}: {
  campania: Campania
  items: LiquidacionItem[]
  /** Traer las ventas de hoy escribe en el espejo: es de admin, como en Resultado. */
  puedeSincronizar: boolean
}) {
  const { marca } = useSesion()
  const toast = useToast()
  const [base, setBase] = useState<Base | null>(null)
  const [lineas, setLineas] = useState<LineaReposicion[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [trayendo, setTrayendo] = useState(false)
  const [releyendo, setReleyendo] = useState(false)
  const [umbral, setUmbral] = useState(1)
  const [actualizado, setActualizado] = useState<string | null>(null)
  const [verAgotados, setVerAgotados] = useState(false)
  const [verNunca, setVerNunca] = useState(false)
  const [foto, setFoto] = useState<string | null>(null)

  const pids = useMemo(() => items.filter((i) => i.estado !== 'descartado').map((i) => i.pid), [items])
  const pidsSet = useMemo(() => new Set(pids), [pids])
  // La base en vivo no se pisa con la del espejo en cada vuelta: sin esto, a los 5 minutos lo
  // repuesto volvería a la lista.
  const fuenteRef = useRef<'espejo' | 'vivo'>('espejo')

  const leer = useCallback(async () => {
    const r = await leerReposicionCampania(marca, pids)
    setLineas(r.lineas)
    if (fuenteRef.current === 'espejo') {
      setBase({ filas: r.filas, incluidas: new Set(), fuente: 'espejo', leidoEn: r.leidoEn })
    }
    setActualizado(new Date().toISOString())
    return r
  }, [marca, pids])

  /** Traer las ventas de hoy al espejo (si se puede) y recalcular. Callado si se saltea. */
  const traer = useCallback(async (avisar: boolean) => {
    setTrayendo(true)
    setError(null)
    try {
      if (puedeSincronizar) {
        try {
          await sincronizarVentas(marca, campania.id)
        } catch (e) {
          if (avisar) toast.error(e instanceof Error ? e.message : 'No se pudieron traer las ventas de hoy.')
        }
      }
      await leer()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el stock para reponer.')
    } finally {
      setTrayendo(false)
    }
  }, [puedeSincronizar, marca, campania.id, leer, toast])

  // El lint prohíbe setState sincrónico en un efecto: la carga va adentro de un async suelto.
  useEffect(() => {
    void (async () => { await traer(false) })()
  }, [traer])

  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void traer(false)
    }, CADA_MS)
    return () => clearInterval(t)
  }, [traer])

  /**
   * Leer el stock de GN en vivo y usarlo de base.
   *
   * 🔑 **El orden importa**: primero se traen las ventas y se anotan sus `sale_id` —esas ya están
   * descontadas en lo que va a contestar GN—, después se lee el stock. Una venta que entra justo
   * mientras se lee (20-60 s) se puede descontar dos veces: el precio de no gastar cupo en cada vuelta.
   */
  const releer = useCallback(async () => {
    setReleyendo(true)
    try {
      if (puedeSincronizar) await sincronizarVentas(marca, campania.id).catch(() => null)
      const r = await leerReposicionCampania(marca, pids)
      const incluidas = new Set(r.lineas.map((l) => l.saleId))
      // De a una: las dos juntas duplican la carga contra el tope de GN.
      const local = await leerInventarioVivo(marca, 'local')
      const deposito = await leerInventarioVivo(marca)
      const filas = [...local.rows, ...deposito.rows].filter((f) => pidsSet.has(String(f.product_id)))
      fuenteRef.current = 'vivo'
      setLineas(r.lineas)
      setBase({ filas, incluidas, fuente: 'vivo', leidoEn: new Date().toISOString() })
      setActualizado(new Date().toISOString())
      toast.ok('Listo: el stock es el de Gestión Nube de recién.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo leer el stock de Gestión Nube.')
    } finally {
      setReleyendo(false)
    }
  }, [puedeSincronizar, marca, campania.id, pids, pidsSet, toast])

  const hoy = hoyAR()
  const calculo = useMemo(() => {
    if (!base || !lineas) return null
    const vs = [...stockAhora(base.filas, base.incluidas, lineas, pidsSet).values()]
    return {
      reponer: aReponer(vs, items, umbral),
      agotados: agotadosSinDeposito(vs, items),
      nunca: nuncaEnLocal(vs, items),
      hoy: ventasDelDia(lineas, hoy),
    }
  }, [base, lineas, pidsSet, items, umbral, hoy])

  if (!calculo) {
    return error ? <Notice tone="danger">{error}</Notice> : <Esqueleto forma="tabla" />
  }

  // ⚠️ Si el sync del espejo corrió con el local abierto, lo vendido antes de esa hora ya está
  // descontado y se resta otra vez: la venta del espejo no tiene hora. Se dice, no se esconde.
  const baseTarde = base?.fuente === 'espejo' && base.leidoEn
    && new Date(base.leidoEn).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }) === hoy
    && Number(new Date(base.leidoEn).toLocaleTimeString('en-GB', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit' })) >= 10
  const baseVieja = base?.fuente === 'espejo' && base.leidoEn
    && new Date(base.leidoEn).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }) < hoy

  const unidadesABajar = calculo.reponer.reduce((a, r) => a + r.sugerido, 0)

  return (
    <>
      {error && <Notice tone="danger" style={{ marginBottom: space[4] }}>{error}</Notice>}
      {baseVieja && (
        <Notice tone="warning" style={{ marginBottom: space[4] }}>
          El stock de base es de <b>otro día</b>: el inventario no se sincronizó hoy. Apretá «Releer stock de Gestión Nube».
        </Notice>
      )}
      {baseTarde && (
        <Notice tone="warning" style={{ marginBottom: space[4] }}>
          El stock de base se sincronizó a las <b>{horaAR(base!.leidoEn)}</b>, con el local abierto: lo vendido antes
          de esa hora puede estar restado dos veces. Apretá «Releer stock de Gestión Nube».
        </Notice>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap', color: color.mut, fontSize: font.sm, marginBottom: space[3] }}>
        <span>
          Stock de base: <b>{base?.fuente === 'vivo' ? 'Gestión Nube' : 'espejo'}</b> de las {horaAR(base?.leidoEn ?? null)} ·
          ventas actualizadas a las {horaAR(actualizado)} · se refresca sola cada 5 min
        </span>
        <Button size="sm" onClick={() => void traer(true)} loading={trayendo}>Traer ventas ahora</Button>
        <Button size="sm" variant="soft" onClick={() => void releer()} loading={releyendo}>
          Releer stock de Gestión Nube
        </Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: space[3], marginBottom: space[4] }}>
        <KpiCard label="Vendido hoy" value={String(calculo.hoy.unidades)} sub={`${calculo.hoy.productos} productos · local y online`} />
        <KpiCard label="Facturado hoy" value={formatMoney(calculo.hoy.plata)} sub="sin mayorista ni ventas técnicas" />
        <KpiCard label="Para bajar del depósito" value={String(calculo.reponer.length)} sub={`talles · ${unidadesABajar} prendas sugeridas`} />
      </div>

      <FilterBar>
        <Select value={String(umbral)} onChange={(e) => setUmbral(Number(e.target.value))} style={{ width: 260 }} aria-label="Cuándo reponer">
          <option value="0">Reponer cuando el local queda en 0</option>
          <option value="1">Reponer cuando queda 1 o menos</option>
          <option value="2">Reponer cuando quedan 2 o menos</option>
        </Select>
      </FilterBar>

      {!calculo.reponer.length ? (
        <EmptyState title="Nada para bajar del depósito" hint="Ningún talle está en el umbral con unidades en el depósito." />
      ) : (
        <TableWrap>
          <THead>
            <Tr>
              <Th>Producto</Th>
              <Th>Talle / color</Th>
              <Th align="right">Local</Th>
              <Th align="right">Depósito</Th>
              <Th align="right">Vendidas</Th>
              <Th align="right">Bajar</Th>
            </Tr>
          </THead>
          <TBody>
            {conCategorias(calculo.reponer).map((f) =>
              'categoria' in f && !('pid' in f) ? (
                <Tr key={`c-${f.categoria}`}>
                  <Td colSpan={6} style={{ background: color.bg2, fontWeight: weight.medium, fontSize: font.sm }}>
                    {f.categoria} · {f.cuantos}
                  </Td>
                </Tr>
              ) : (
                <FilaReponer key={`${(f as ParaReponer).pid}_${(f as ParaReponer).sid}`} fila={f as ParaReponer} onFoto={setFoto} />
              ),
            )}
          </TBody>
        </TableWrap>
      )}

      {calculo.agotados.length > 0 && (
        <Card style={{ marginTop: space[5], background: color.bg2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[3], fontSize: font.sm }}>
            <span>
              <b>{calculo.agotados.length}</b> {calculo.agotados.length === 1 ? 'talle se agotó' : 'talles se agotaron'} en
              el local y no hay en el depósito: no hay nada que bajar.
            </span>
            <Button size="sm" variant="ghost" onClick={() => setVerAgotados((v) => !v)}>
              {verAgotados ? 'Ocultar' : 'Ver cuáles'}
            </Button>
          </div>
          {verAgotados && (
            <div style={{ marginTop: space[3], fontSize: font.sm, lineHeight: 1.7 }}>
              {calculo.agotados.map((a) => (
                <div key={`${a.pid}_${a.sid}`}>{a.nombre} · {a.talle} <span style={{ color: color.mut }}>({a.vendidas} vendidas)</span></div>
              ))}
            </div>
          )}
        </Card>
      )}

      {calculo.nunca.length > 0 && (
        <Card style={{ marginTop: space[4], background: color.bg2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[3], fontSize: font.sm }}>
            <span>
              <b>{calculo.nunca.length}</b> {calculo.nunca.length === 1 ? 'producto está entero' : 'productos están enteros'} en
              el depósito, con <b>{calculo.nunca.reduce((a, n) => a + n.deposito, 0)}</b> prendas y nada en el local.{' '}
              <span style={{ color: color.mut }}>No es reposición —no se acaba nada en la mesa—: bajarlos es otra decisión.</span>
            </span>
            <Button size="sm" variant="ghost" onClick={() => setVerNunca((v) => !v)}>
              {verNunca ? 'Ocultar' : 'Ver cuáles'}
            </Button>
          </div>
          {verNunca && (
            <div style={{ marginTop: space[3], fontSize: font.sm, lineHeight: 1.7 }}>
              {calculo.nunca.map((n) => (
                <div key={n.pid}>{n.nombre} <span style={{ color: color.mut }}>({n.deposito} en el depósito)</span></div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Lightbox src={foto} onCerrar={() => setFoto(null)} />
    </>
  )
}

/** Intercala un renglón de categoría antes de cada grupo: el depósito camina por perchero. */
function conCategorias(filas: ParaReponer[]): (ParaReponer | { categoria: string; cuantos: number })[] {
  const cuenta = new Map<string, number>()
  for (const f of filas) cuenta.set(f.categoria, (cuenta.get(f.categoria) || 0) + 1)
  const out: (ParaReponer | { categoria: string; cuantos: number })[] = []
  let ultima: string | null = null
  for (const f of filas) {
    if (f.categoria !== ultima) {
      out.push({ categoria: f.categoria, cuantos: cuenta.get(f.categoria) || 0 })
      ultima = f.categoria
    }
    out.push(f)
  }
  return out
}

function FilaReponer({ fila, onFoto }: { fila: ParaReponer; onFoto: (src: string) => void }) {
  return (
    <Tr>
      <Td>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
          {fila.imagen ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onFoto(fila.imagen!) }}
              style={{ height: 'auto', padding: 0, border: 0, background: 'none', cursor: 'zoom-in' }}
              aria-label={`Ver la foto de ${fila.nombre}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fila.imagen} alt="" width={40} height={40} style={{ objectFit: 'cover', borderRadius: 4, display: 'block' }} />
            </button>
          ) : (
            <div style={{ width: 40, height: 40 }} />
          )}
          <span style={{ fontWeight: weight.medium }}>{fila.nombre}</span>
        </div>
      </Td>
      <Td>{fila.talle}</Td>
      <Td align="right">{fila.local}</Td>
      <Td align="right">{fila.deposito}</Td>
      <Td align="right">{fila.vendidas}</Td>
      <Td align="right" strong>{fila.sugerido}</Td>
    </Tr>
  )
}
