'use client'

/**
 * Reposición de Zattia **según ventas**: dos listas, una por persona.
 *
 * - **Llevar al local** — la arma Lorena en el depósito (hoja A4).
 * - **Devolver al depósito** — la arma Camila en el local y la lleva en el carro (rollo de 80 mm).
 *
 * Arriba, el selector **Zattia / Stunned**: cada línea tiene sus propias condiciones (`ventas` y
 * `ventasStunned` en la config) y sus propios papeles, porque Stunned tiene su sector en el depósito.
 *
 * El cálculo vive en `lib/reposicion/porVentas.ts` (reglas y porqué, ahí). BDI no pasa por acá.
 * **Armar con el lector** (12-oct-2026): Lorena escanea en la compu contra la lista y el Monitor hace
 * la transferencia depósito → local en Gestión Nube (`ArmadoLector.tsx`, `api/_repo-armado.js`).
 * Devolución (12-oct-2026): Camila escanea en la compu del local y el Monitor transfiere local →
 * depósito; la limpieza grande es la misma pantalla con «Ver todo» y «Transferir y continuar».
 */

import { Fragment, useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { useTnPromo } from '@/components/productos/useTnImages'
import { useRecargarDatos } from '@/components/productos/BotonRecargar'
import { puedeEliminarTn } from '@/components/caducados/eliminarTn'
import { HeaderAcciones } from '@/components/layout/acciones'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { dispararSyncStock } from '@/lib/sync-gn'
import { indexarTn } from '@/lib/tn'
import { construirInv } from '@/lib/reposicion/inventario'
import { aplicarCats } from '@/lib/reposicion/core'
import { CAMPO_LINEA, cfgVentas, decidirTodo, hoyAR, listaDevolver, listaLlevar, type CfgVentas, type FilaVentas, type LineaZ, type MarcaModo, type Modo } from '@/lib/reposicion/porVentas'
import { esStunned, ETIQUETA_LINEA } from '@/lib/lineas'
import { reposicionPDFFilas } from '@/lib/reposicion/pdf'
import { imprimirDevolucion } from '@/lib/reposicion/rollo'
import type { Producto } from '@/lib/etl/tipos'
import { useReposicion } from './useReposicion'
import { ArmadoLector } from './ArmadoLector'
import { HistorialArmados } from './HistorialArmados'
import { abrirArmado, leerArmadoHoy, pedidoDesde, resolverArmado, resumenArmado, talle, type Armado, type Sentido } from '@/lib/reposicion/armado'
import { Badge, Button, EmptyState, Esqueleto, Modal, Notice, Select, SelectorLinea, Tabs, TBody, THead, TableWrap, Td, Th, Tr, color, font, space, useConfirmar, useToast } from '@/components/ui'

type Pestana = 'llevar' | 'devolver' | 'historial'

export function ReposicionZattia({ allProductos }: { allProductos: Producto[] }) {
  const { marca, perfil } = useSesion()
  const toast = useToast()
  const { confirmar } = useConfirmar()
  const rep = useReposicion(marca)
  const { cfg } = rep
  const { recargar, cargando: recargando } = useRecargarDatos()
  // La misma regla que Caducados: marcar modos lo pueden Darío y Bruno.
  const puedeMarcar = puedeEliminarTn(perfil)

  const [linea, setLinea] = useState<LineaZ>('zattia')
  // Las categorías salen de la Tienda Nube DE LA LÍNEA: Stunned tiene la suya (`docs/lineas.md`).
  const tnIdx = useTnPromo(linea)
  const prodById = useMemo(() => Object.fromEntries(allProductos.map((p) => [String(p.id), p])) as Record<string, Producto>, [allProductos])
  const hoy = hoyAR()
  const cv = cfgVentas(cfg, linea)
  const vv = rep.vvPorDias[cv.ventanaDias]
  // Sólo las variantes de la línea elegida: la única marca de Stunned es el prefijo del SKU.
  const inv = useMemo(
    () =>
      aplicarCats(construirInv(rep.rawInv, prodById, tnIdx ?? indexarTn([]), rep.s7, vv ?? {}), cfg.catsOff).filter(
        (it) => esStunned(it.sku) === (linea === 'stunned'),
      ),
    [rep.rawInv, prodById, tnIdx, rep.s7, vv, cfg.catsOff, linea],
  )
  const filas = useMemo(() => decidirTodo(inv, cfg, hoy, linea), [inv, cfg, hoy, linea])
  const llevar = useMemo(() => listaLlevar(filas), [filas])
  const [verTodo, setVerTodo] = useState(false)
  const devolver = useMemo(() => listaDevolver(filas, verTodo ? null : cv.topeDevolucion), [filas, verTodo, cv.topeDevolucion])
  const exhibidos = useMemo(() => filas.filter((f) => f.d.modo.modo === 'exhibido'), [filas])

  const [tab, setTab] = useState<Pestana>('llevar')
  const [manual, setManual] = useState<Record<string, number>>({})
  const [configOpen, setConfigOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncLabel, setSyncLabel] = useState('')

  const cantLlevar = (f: FilaVentas) => manual[f.it.vid] ?? f.d.llevar
  const totalLlevar = llevar.reduce((s, f) => s + cantLlevar(f), 0)
  const paraExhibir = llevar.filter((f) => f.d.exhibir && cantLlevar(f) > 0).length
  const totalDevolverHoy = devolver.filas.reduce((s, f) => s + f.devolverHoy, 0)

  const onActualizar = async () => {
    if (syncing) return
    setSyncing(true)
    try {
      // Ver el porqué de mirar el `done` en `Reposicion.tsx` (el 4-sep el local bajó con stock de ayer).
      const done = await dispararSyncStock(marca, setSyncLabel)
      setSyncLabel('↻ Recargando…')
      await Promise.all([rep.traer({ forzar: true }), recargar()])
      setManual({})
      if (done) toast.ok('Stock actualizado')
      else toast.aviso('La actualización está tardando más de lo normal. Lo que ves es lo último guardado: esperá un minuto y tocá «Recargar».')
    } catch (e) {
      toast.error('No se pudo actualizar: ' + (e as Error).message)
    } finally {
      setSyncing(false)
      setSyncLabel('')
    }
  }

  // ── El armado con el lector: Reposición (Lorena) y Devolución (Camila) ───────────────────────
  const [armados, setArmados] = useState<Record<Sentido, Armado | null>>({ llevar: null, devolver: null })
  const [armando, setArmando] = useState<Sentido | null>(null)
  const [abriendo, setAbriendo] = useState(false)
  const traerArmados = async (l: LineaZ = linea) => {
    const [a, b] = await Promise.all([leerArmadoHoy(l, 'llevar').catch(() => null), leerArmadoHoy(l, 'devolver').catch(() => null)])
    setArmados({ llevar: a, devolver: b })
  }
  useEffect(() => {
    void (async () => {
      await traerArmados(linea)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linea])
  const abierto = (s: Sentido) => (armados[s]?.estado === 'en_curso' ? armados[s] : null)
  // 🔴 Recién transferido (cualquiera de los dos), las listas siguen iguales hasta que se actualiza el
  // stock: armarlas de nuevo pediría dos veces lo mismo. Hasta que el stock sea posterior, no se arma.
  const transferidoDespues = (a: Armado | null) => a?.estado === 'transferido' && !!a.cerrado_en && (!rep.lastUpdate || rep.lastUpdate.getTime() < new Date(a.cerrado_en).getTime())
  const esperandoStock = transferidoDespues(armados.llevar) || transferidoDespues(armados.devolver)

  const onArmar = async (sentido: Sentido) => {
    if (abierto(sentido)) return setArmando(sentido)
    const pedido = sentido === 'llevar' ? pedidoDesde(llevar, cantLlevar) : pedidoDesde(devolver.filas, (f) => (f as FilaVentas & { devolverHoy: number }).devolverHoy)
    if (!pedido.length) return toast.aviso(sentido === 'llevar' ? 'No hay prendas para reponer.' : 'No hay prendas para devolver.')
    // Una lista armada con stock viejo pide lo que ya se movió ayer.
    if (edadMin != null && edadMin >= 360) {
      const ok = await confirmar({
        titulo: 'Stock desactualizado (' + antiguedad + ')',
        tono: 'warning',
        ok: 'Iniciar igual',
        mensaje: 'Conviene actualizar el stock antes de iniciar el armado.',
      })
      if (!ok) return
    }
    setAbriendo(true)
    try {
      const d = await abrirArmado(linea, sentido, pedido)
      setArmados((x) => ({ ...x, [sentido]: d.armado }))
      if (d.yaHabia) toast.aviso('Ya había un armado en curso: se continúa ese.')
      setArmando(sentido)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setAbriendo(false)
    }
  }

  const onResolver = async (a: Armado, hecha: boolean) => {
    try {
      await resolverArmado(a.id, hecha)
      await traerArmados()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  /** El botón del armado de cada pestaña: Iniciar / Continuar (o nada si quedó sin confirmar). */
  const botonArmado = (sentido: Sentido, hayLista: boolean) =>
    armados[sentido]?.estado === 'revisar' ? null : (
      <Button
        variant="solid"
        tone="brand"
        onClick={() => void onArmar(sentido)}
        loading={abriendo}
        disabled={!abierto(sentido) && (!hayLista || esperandoStock)}
        title={esperandoStock && !abierto(sentido) ? 'Actualizá el stock: la lista todavía no descuenta lo transferido' : undefined}
      >
        {abierto(sentido) ? 'Continuar armado' : 'Iniciar armado'}
      </Button>
    )

  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])
  const edadMin = rep.lastUpdate ? Math.max(0, Math.round((ahora - rep.lastUpdate.getTime()) / 60000)) : null
  const antiguedad = edadMin == null ? '' : edadMin < 60 ? `hace ${edadMin} min` : edadMin < 1440 ? `hace ${Math.floor(edadMin / 60)} h` : `hace ${Math.floor(edadMin / 1440)} d`

  const onImprimirLlevar = async () => {
    const ok = await reposicionPDFFilas(
      // El papel de Lorena lleva sólo lo que tiene que hacer: producto, talle y cuánto (Darío,
      // 11-oct). Ni stock ni ventas — eso lo ven el dueño y el socio en pantalla—, y tampoco «para
      // exhibir»: ese aviso lo da el Monitor al escanear (parte 3).
      llevar.map((f) => ({ ubic: f.it.ubic, name: f.it.name, size: f.it.size, mover: cantLlevar(f) })),
      linea,
      rep.lastUpdate,
    )
    if (!ok) toast.aviso('No hay prendas para llevar: están todas en 0.')
  }
  const onImprimirDevolver = async () => {
    if (!devolver.filas.length) return
    await imprimirDevolucion(devolver.filas, ETIQUETA_LINEA[linea])
  }

  if (rep.cargando && !rep.rawInv.length) return <Esqueleto forma="tabla" filas={8} />
  if (rep.error)
    return (
      <Notice tone="danger" icon="⚠">
        No pude cargar la reposición: {rep.error}{' '}
        <Button size="sm" variant="outline" tone="danger" onClick={() => void rep.traer({ forzar: true })}>
          Reintentar
        </Button>
      </Notice>
    )

  const enArmado = armando ? abierto(armando) : null
  if (enArmado)
    return (
      <ArmadoLector
        armado={enArmado}
        inv={inv}
        onSalir={() => {
          setArmando(null)
          void traerArmados()
        }}
        onTerminado={(transferido) => {
          setArmando(null)
          void traerArmados()
          // La transferencia ya está en GN; el espejo se pone al día solo con esto.
          if (transferido) void onActualizar()
        }}
      />
    )

  return (
    <>
      <HeaderAcciones>
        <InfoPopover titulo="Reposición">
          <b>Stock ideal</b>: {cv.minimoBajo} por variante (1 exhibida + reserva); {cv.minimo} si vende {cv.umbralSemana} o más por semana. Lo que vende mucho
          suma reserva para {cv.coberturaDias} días.
          <br />
          <br />
          <b>Reposición</b>: lo que falta para llegar al stock ideal. Si el local está en 0, la primera va <b>para exhibir</b> (alarma y etiquetas).
          <br />
          <b>Devolución</b>: lo que supera el stock ideal, hasta {cv.topeDevolucion} prendas por día, primero lo que no se vende.
          <br />
          <br />
          Ventas del local y de Tienda Nube: últimos {cv.ventanaDias} días y última semana.
        </InfoPopover>
        <Button variant="ghost" onClick={() => setConfigOpen(true)}>
          Configurar
        </Button>
        <Button variant="ghost" onClick={() => void Promise.all([rep.traer({ forzar: true }), recargar()])} loading={recargando} title="Vuelve a leer los datos ya sincronizados, sin ir a Gestión Nube">
          Recargar
        </Button>
        <Button variant="outline" onClick={() => void onActualizar()} loading={syncing} title="Carga el stock de Gestión Nube (unos 2 minutos)">
          {syncing ? syncLabel || 'Actualizando…' : 'Actualizar stock'}
        </Button>
      </HeaderAcciones>

      <SelectorLinea
        linea={linea}
        lineas={['zattia', 'stunned']}
        onChange={(l) => {
          setLinea(l as LineaZ)
          setManual({})
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap', margin: `${space[3]}px 0` }}>
        <Tabs
          value={tab}
          onChange={(k) => setTab(k as Pestana)}
          items={[
            { key: 'llevar', label: 'Reposición', badge: totalLlevar || undefined },
            { key: 'devolver', label: 'Devolución', badge: devolver.total || undefined },
            { key: 'historial', label: 'Historial' },
          ]}
        />
        <span style={{ marginLeft: 'auto', fontSize: font.sm, color: edadMin != null && edadMin >= 360 ? color.warningInk : color.mut2 }}>
          {rep.lastUpdate
            ? `Stock ${antiguedad} · ${rep.lastUpdate.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
            : 'Stock sin fecha de actualización'}
        </span>
      </div>

      {tab === 'historial' ? (
        <HistorialArmados linea={linea} />
      ) : tab === 'llevar' ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap', marginBottom: space[3] }}>
            <span style={{ fontSize: font.md, color: color.ink2 }}>
              <b>{totalLlevar}</b> prendas · {llevar.length} variantes
            </span>
            {paraExhibir > 0 && (
              <span title="La primera va con alarma, etiqueta de precio y etiqueta de formas de pago">
                <Badge tone="warning">{paraExhibir} para exhibir</Badge>
              </span>
            )}
            {Object.keys(manual).length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setManual({})}>
                ↺ Restablecer cantidades
              </Button>
            )}
            <Button variant="outline" style={{ marginLeft: 'auto' }} onClick={() => void onImprimirLlevar()} disabled={!llevar.length}>
              Imprimir A4
            </Button>
            {botonArmado('llevar', llevar.length > 0)}
          </div>
          <EstadoArmado armado={armados.llevar} onResolver={(a, h) => void onResolver(a, h)} />
          {!llevar.length ? (
            <EmptyState icon="🎉" title="No hay prendas para reponer" hint="El local tiene su stock ideal, o lo que falta no está en el depósito." dashed />
          ) : (
            <TablaVentas
              filas={llevar}
              cantidad={cantLlevar}
              titulo="Reponer"
              editar={(f, v) =>
                setManual((m) => {
                  const n = { ...m }
                  if (v === '') delete n[f.it.vid]
                  else n[f.it.vid] = Math.max(0, Math.min(f.it.deposito, parseInt(v, 10) || 0))
                  return n
                })
              }
            />
          )}
        </>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap', marginBottom: space[3] }}>
            <span style={{ fontSize: font.md, color: color.ink2 }}>
              {verTodo ? (
                <>
                  <b>{devolver.total}</b> prendas en total
                </>
              ) : (
                <>
                  <b>{totalDevolverHoy}</b> prendas hoy
                  {devolver.pendiente > 0 && <> · {devolver.pendiente} pendientes</>}
                </>
              )}
            </span>
            <label
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: font.sm, color: color.mut, cursor: 'pointer' }}
              title="La limpieza grande: la lista entera, sin el tope diario. Se puede armar en varias tandas del carro"
            >
              <input type="checkbox" checked={verTodo} onChange={(e) => setVerTodo(e.target.checked)} style={{ accentColor: 'var(--mo-brand-solid)' }} />
              Ver todo
            </label>
            <Button variant="outline" style={{ marginLeft: 'auto' }} onClick={() => void onImprimirDevolver()} disabled={!devolver.filas.length}>
              Imprimir ticket
            </Button>
            {botonArmado('devolver', devolver.filas.length > 0)}
          </div>
          <EstadoArmado armado={armados.devolver} onResolver={(a, h) => void onResolver(a, h)} />
          {!devolver.filas.length ? (
            <EmptyState icon="🎉" title="No hay prendas para devolver" hint="Ninguna variante supera su stock ideal." dashed />
          ) : (
            <TablaVentas filas={devolver.filas} cantidad={(f) => (f as FilaVentas & { devolverHoy: number }).devolverHoy} titulo="Devolver" />
          )}
        </>
      )}

      {tab !== 'historial' && exhibidos.length > 0 && (
        <p style={{ marginTop: space[4], fontSize: font.sm, color: color.mut }}>
          Todo exhibido, fuera de las listas: {new Set(exhibidos.map((f) => f.it.pid)).size} productos · {[...new Set(exhibidos.map((f) => f.d.modo.motivo))].join(' · ')}
        </p>
      )}

      <ConfigZattia
        abierto={configOpen}
        onClose={() => setConfigOpen(false)}
        titulo={`Configurar reposición de ${ETIQUETA_LINEA[linea]}`}
        filas={filas}
        cfgVentas={cv}
        puede={puedeMarcar}
        shareStatus={rep.shareStatus}
        guardar={(v) => rep.guardarCfg({ ...cfg, [CAMPO_LINEA[linea]]: v })}
      />
    </>
  )
}

/**
 * UNA tabla para toda la lista, con el producto como separador (Darío, 12-oct: «muy repetitivo»:
 * antes era una tabla por producto con los encabezados repetidos). La cantidad es editable sólo en
 * «Reponer».
 */
function TablaVentas({ filas, cantidad, titulo, editar }: { filas: FilaVentas[]; cantidad: (f: FilaVentas) => number; titulo: string; editar?: (f: FilaVentas, v: string) => void }) {
  const grupos = useMemo(() => {
    const g: { pid: string; name: string; filas: FilaVentas[] }[] = []
    for (const f of filas) {
      const ult = g[g.length - 1]
      if (ult && ult.pid === f.it.pid) ult.filas.push(f)
      else g.push({ pid: f.it.pid, name: f.it.name, filas: [f] })
    }
    return g
  }, [filas])
  return (
    <TableWrap>
      <THead>
        <Tr>
          <Th>Variante</Th>
          <Th width={150}>SKU</Th>
          <Th align="center" width={70}>Local</Th>
          <Th align="center" width={80}>Depósito</Th>
          <Th align="center" width={90}>Venta semanal</Th>
          <Th align="center" width={80}>Stock ideal</Th>
          <Th align="center" width={84}>{titulo}</Th>
          <Th>Motivo</Th>
        </Tr>
      </THead>
      <TBody>
        {grupos.map((g, i) => (
          // Por SKU, un mismo producto puede quedar en dos grupos separados: la clave lleva la posición.
          <Fragment key={`${g.pid}-${i}`}>
            <Tr>
              <Td colSpan={8} style={{ background: color.bg2, paddingTop: space[2], paddingBottom: space[2] }}>
                <b style={{ color: color.ink }}>{g.name}</b>
                <span style={{ color: color.mut2, fontSize: font.sm }}> · {g.filas[0].it.cat}</span>
                {g.filas[0].d.nuevo && (
                  <span style={{ marginLeft: 6 }}>
                    <Badge tone="brand">nuevo</Badge>
                  </span>
                )}
              </Td>
            </Tr>
            {g.filas.map((f) => {
              const n = cantidad(f)
              return (
                <Tr key={f.it.vid}>
                  <Td wrap>
                    {talle(f.it.size) || 'Única'}
                    {f.d.exhibir && titulo === 'Reponer' && (
                      <span title="Local en 0: la primera va con alarma, etiqueta de precio y etiqueta de formas de pago" style={{ marginLeft: 6 }}>
                        <Badge tone="warning">para exhibir</Badge>
                      </span>
                    )}
                  </Td>
                  <Td style={{ fontSize: font.sm, color: color.mut }}>{f.it.sku || '—'}</Td>
                  <Td align="center" style={{ color: f.it.local <= 1 ? color.danger : color.ink2, fontWeight: 600 }}>{f.it.local}</Td>
                  <Td align="center">{f.it.deposito}</Td>
                  <Td align="center" style={{ color: f.d.vendidas ? color.success : color.mut2, fontWeight: 600 }}>{f.d.porSemana.toLocaleString('es-AR')}</Td>
                  <Td align="center" style={{ color: color.mut2 }}>{f.d.objetivo ?? '—'}</Td>
                  <Td align="center" tall>
                    {editar ? (
                      <input
                        className="mo-input mo-input--num"
                        type="number"
                        min={0}
                        max={f.it.deposito}
                        inputMode="numeric"
                        value={n}
                        onChange={(e) => editar(f, e.target.value)}
                        aria-label={`Prendas a reponer de ${f.it.name} ${f.it.size}`}
                        style={{ width: 64, textAlign: 'center', padding: '0 6px', fontWeight: 700 }}
                      />
                    ) : (
                      <b>{n}</b>
                    )}
                  </Td>
                  <Td wrap style={{ fontSize: font.sm, color: color.mut }}>{f.d.porque}</Td>
                </Tr>
              )
            })}
          </Fragment>
        ))}
      </TBody>
    </TableWrap>
  )
}

const MODOS: { v: Modo; label: string }[] = [
  { v: 'ventas', label: 'Según ventas' },
  { v: 'exhibido', label: 'Todo exhibido' },
  { v: 'fija', label: 'Cantidad fija' },
]

/** Parámetros y marcas (por categoría y por producto). Editan sólo Darío y Bruno; el resto lo ve. */
function ConfigZattia({ abierto, onClose, titulo, filas, cfgVentas: cv, puede, shareStatus, guardar }: {
  abierto: boolean
  onClose: () => void
  titulo: string
  filas: FilaVentas[]
  cfgVentas: CfgVentas
  puede: boolean
  shareStatus: { txt: string; color: string }
  guardar: (v: CfgVentas) => void
}) {
  const [buscar, setBuscar] = useState('')
  const productos = useMemo(() => {
    const m = new Map<string, string>()
    filas.forEach((f) => m.set(f.it.pid, f.it.name))
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'))
  }, [filas])
  const encontrados = buscar.trim().length >= 2 ? productos.filter(([, n]) => n.toLowerCase().includes(buscar.toLowerCase())).slice(0, 20) : []

  const setParam = (k: keyof Pick<CfgVentas, 'minimo' | 'minimoBajo' | 'umbralSemana' | 'coberturaDias' | 'ventanaDias' | 'loteMin' | 'topeDevolucion' | 'diasNuevo'>, v: string) => {
    const n = parseInt(v, 10)
    if (!Number.isFinite(n) || n < 0) return
    guardar({ ...cv, [k]: n })
  }
  const setModo = (tipo: 'modosCat' | 'modosProd', clave: string, m: MarcaModo | null) => {
    const next = { ...cv[tipo] }
    if (m) next[clave] = m
    else delete next[clave]
    guardar({ ...cv, [tipo]: next })
  }

  const filaModo = (tipo: 'modosCat' | 'modosProd', clave: string, nombre: string) => {
    const m = cv[tipo][clave]
    return (
      <div key={clave} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, padding: '5px 8px', border: `1px solid ${color.bg2}`, borderRadius: 6, marginBottom: 4 }}>
        <span style={{ flex: '1 1 180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombre}</span>
        <Select
          value={m?.modo ?? 'ventas'}
          disabled={!puede}
          onChange={(e) => {
            const modo = e.target.value as Modo
            setModo(tipo, clave, modo === 'ventas' && tipo === 'modosCat' ? null : { ...(m || {}), modo, n: modo === 'fija' ? m?.n ?? cv.minimo : undefined })
          }}
          style={{ width: 150 }}
          aria-label={`Modo de ${nombre}`}
        >
          {MODOS.map((o) => (
            <option key={o.v} value={o.v}>{o.label}</option>
          ))}
        </Select>
        {m?.modo === 'fija' && (
          <input type="number" min={0} defaultValue={m.n ?? cv.minimo} disabled={!puede} onChange={(e) => setModo(tipo, clave, { ...m, n: Math.max(0, parseInt(e.target.value, 10) || 0) })} aria-label="Cantidad" style={{ width: 56, padding: '3px 6px', border: `1px solid ${color.line2}`, borderRadius: 6, textAlign: 'center' }} />
        )}
        {m && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: color.mut }}>
            hasta
            <input type="date" defaultValue={m.hasta ?? ''} disabled={!puede} onChange={(e) => setModo(tipo, clave, { ...m, hasta: e.target.value || undefined })} style={{ padding: '2px 4px', border: `1px solid ${color.line2}`, borderRadius: 6 }} />
          </label>
        )}
        {m && puede && (
          <Button size="sm" variant="ghost" onClick={() => setModo(tipo, clave, null)}>
            Sacar
          </Button>
        )}
      </div>
    )
  }

  const param = (k: Parameters<typeof setParam>[0], label: string) => (
    <label style={{ fontSize: 12, color: color.ink2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, border: `1px solid ${color.bg2}`, borderRadius: 7, padding: '5px 8px' }}>
      <span>{label}</span>
      <input type="number" min={0} defaultValue={cv[k]} disabled={!puede} onChange={(e) => setParam(k, e.target.value)} style={{ width: 60, padding: '4px 6px', border: `1px solid ${color.line2}`, borderRadius: 6, textAlign: 'center' }} />
    </label>
  )

  return (
    <Modal abierto={abierto} onCerrar={onClose} titulo={titulo} ancho="ancho" pie={<Button variant="solid" tone="brand" onClick={onClose}>Listo</Button>}>
      <div style={{ fontSize: 12, color: color.mut, marginBottom: 10 }}>
        {puede ? 'Los cambios se aplican para todo el equipo.' : 'Solo Darío y Bruno pueden editar.'} <span style={{ color: shareStatus.color }}>{shareStatus.txt}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: 8, marginBottom: 14 }}>
        {param('minimoBajo', 'Mínimo, baja venta')}
        {param('minimo', 'Mínimo, con venta')}
        {param('umbralSemana', 'Con venta desde (por semana)')}
        {param('coberturaDias', 'Días de reserva')}
        {param('ventanaDias', 'Días de ventas analizados')}
        {param('loteMin', 'Reposición mínima')}
        {param('topeDevolucion', 'Devolución diaria máxima')}
        {param('diasNuevo', 'Días como producto nuevo')}
      </div>

      {/* «Por categoría» se sacó el 11-oct-2026 (Darío): nada la usaba —las excepciones van por
          producto— y las categorías de Tienda Nube mezclan «BEST SELLERS» y «(sin categoría)». El
          cálculo todavía la entiende (`modosCat`), por si vuelve. */}
      <div style={{ fontSize: 13, fontWeight: 700, margin: '6px 0' }}>Excepciones por producto</div>
      <div style={{ fontSize: 11.5, color: color.mut2, marginBottom: 8 }}>OUTLET y ACCESORIO ya van como «Todo exhibido».</div>
      {Object.keys(cv.modosProd).map((pid) => filaModo('modosProd', pid, productos.find(([p]) => p === pid)?.[1] ?? `Producto ${pid}`))}
      {puede && (
        <>
          <input className="mo-input" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar producto…" style={{ margin: '6px 0' }} />
          {encontrados
            .filter(([pid]) => !cv.modosProd[pid])
            .map(([pid, n]) => (
              <div key={pid} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '3px 8px' }}>
                <span style={{ flex: 1 }}>{n}</span>
                <Button size="sm" variant="ghost" onClick={() => { setModo('modosProd', pid, { modo: 'exhibido' }); setBuscar('') }}>
                  Agregar
                </Button>
              </div>
            ))}
        </>
      )}
    </Modal>
  )
}

const hhmm = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '')

/** Cómo quedó el armado de hoy: en curso, transferido, o sin confirmar en Gestión Nube. */
function EstadoArmado({ armado, onResolver }: { armado: Armado | null; onResolver: (a: Armado, hecha: boolean) => void }) {
  if (!armado) return null
  const r = resumenArmado(armado.pedido, armado.escaneos || {})
  const quien = armado.persona ? ` · ${armado.persona}` : ''
  const devolucion = armado.sentido === 'devolver'
  const ya = armado.transfer?.unidades ?? 0
  const box = { marginBottom: space[3] }
  if (armado.estado === 'en_curso')
    return (
      <div style={box}>
        <Notice tone="brand" icon="📦">
          Armado en curso{quien} · {r.escaneadas} de {r.pedidas} prendas escaneadas{ya > 0 ? ` · ${ya} ya transferidas` : ''}
        </Notice>
      </div>
    )
  if (armado.estado === 'transferido')
    return (
      <div style={box}>
        <Notice tone="success" icon="✓">
          {devolucion ? 'Devolución transferida' : 'Reposición transferida'} a las {hhmm(armado.cerrado_en)}{quien} · {ya || r.escaneadas} prendas
          {armado.transfer?.transfer_id ? ` · Transferencia ${(armado.transfer.tandas?.length ?? 0) > 1 ? armado.transfer.tandas!.map((t) => t.transfer_id).join(', ') : armado.transfer.transfer_id}` : ''}. Actualizá el stock para ver la lista nueva.
        </Notice>
      </div>
    )
  if (armado.estado === 'revisar' || armado.estado === 'transfiriendo')
    return (
      <div style={box}>
        <Notice tone="danger" icon="⚠">
          <div>
            <b>Transferencia sin confirmar{quien}.</b> Verificá en Gestión Nube si figura la transferencia de hoy {devolucion ? 'del local al depósito' : 'del depósito al local'}.
          </div>
          {armado.estado === 'revisar' && (
            <div style={{ display: 'flex', gap: space[2], marginTop: space[2], flexWrap: 'wrap' }}>
              <Button size="sm" variant="solid" tone="brand" onClick={() => onResolver(armado, true)}>
                Figura en Gestión Nube
              </Button>
              <Button size="sm" variant="outline" onClick={() => onResolver(armado, false)}>
                No figura: reintentar
              </Button>
            </div>
          )}
        </Notice>
      </div>
    )
  return null
}
