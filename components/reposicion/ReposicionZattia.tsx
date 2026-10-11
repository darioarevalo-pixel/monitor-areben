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
 * Devolver al depósito todavía no mueve stock: Camila lo sigue cargando a mano (tanda 2).
 */

import { useEffect, useMemo, useState } from 'react'
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
import { abrirArmado, leerArmadoHoy, pedidoDesde, resolverArmado, resumenArmado, type Armado } from '@/lib/reposicion/armado'
import { Badge, Button, EmptyState, Esqueleto, Modal, Notice, Select, SelectorLinea, Tabs, TBody, THead, TableWrap, Td, Th, Tr, color, font, space, useConfirmar, useToast } from '@/components/ui'

type Pestana = 'llevar' | 'devolver'

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
      await Promise.all([rep.traer(), recargar()])
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

  // ── El armado con el lector (sólo «Llevar al local») ─────────────────────────────────────────
  const [armado, setArmado] = useState<Armado | null>(null)
  const [armando, setArmando] = useState(false)
  const [abriendo, setAbriendo] = useState(false)
  const traerArmado = async (l: LineaZ = linea) => {
    try {
      setArmado(await leerArmadoHoy(l, 'llevar'))
    } catch {
      setArmado(null)
    }
  }
  useEffect(() => {
    void (async () => {
      await traerArmado(linea)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linea])
  const armadoAbierto = armado && armado.estado === 'en_curso' ? armado : null
  // 🔴 Recién transferido, la lista sigue igual hasta que se actualiza el stock: armarla de nuevo
  // pediría dos veces lo mismo. Hasta que el stock sea posterior a la transferencia, no se arma.
  const esperandoStock = armado?.estado === 'transferido' && !!armado.cerrado_en && (!rep.lastUpdate || rep.lastUpdate.getTime() < new Date(armado.cerrado_en).getTime())

  const onArmar = async () => {
    if (armadoAbierto) return setArmando(true)
    const pedido = pedidoDesde(llevar, cantLlevar)
    if (!pedido.length) return toast.aviso('No hay prendas para llevar.')
    // Una lista armada con stock viejo pide lo que ya se llevó ayer.
    if (edadMin != null && edadMin >= 360) {
      const ok = await confirmar({
        titulo: 'El stock es de ' + antiguedad,
        tono: 'warning',
        ok: 'Empezar igual',
        mensaje: 'Conviene tocar «Cargar de Gestión Nube» antes de empezar, así la lista sale con el stock de ahora.',
      })
      if (!ok) return
    }
    setAbriendo(true)
    try {
      const d = await abrirArmado(linea, 'llevar', pedido)
      setArmado(d.armado)
      if (d.yaHabia) toast.aviso('Ya había un armado en curso: seguís con ése.')
      setArmando(true)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setAbriendo(false)
    }
  }

  const onResolver = async (hecha: boolean) => {
    if (!armado) return
    try {
      await resolverArmado(armado.id, hecha)
      await traerArmado()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

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
        <Button size="sm" variant="outline" tone="danger" onClick={() => void rep.traer()}>
          Reintentar
        </Button>
      </Notice>
    )

  if (armando && armadoAbierto)
    return (
      <ArmadoLector
        armado={armadoAbierto}
        inv={inv}
        onSalir={() => {
          setArmando(false)
          void traerArmado()
        }}
        onTerminado={(transferido) => {
          setArmando(false)
          void traerArmado()
          // La transferencia ya está en GN; el espejo se pone al día solo con esto.
          if (transferido) void onActualizar()
        }}
      />
    )

  return (
    <>
      <HeaderAcciones>
        <InfoPopover titulo="Reposición">
          Las cantidades salen de lo que se vendió en el local y en Tienda Nube: manda lo más alto entre los últimos 7 días y los
          últimos {cv.ventanaDias}, así lo que se dispara recibe más enseguida y una semana floja no lo devuelve.
          <br />
          <br />
          De cada variante tiene que haber como mínimo {cv.minimoBajo} en el local si vende menos de {cv.umbralSemana} por semana, y{' '}
          {cv.minimo} si vende más. Lo que vende mucho tiene reserva para {cv.coberturaDias} días.
          <br />
          <br />
          <b>Llevar al local</b>: {cv.loteMin > 1 ? `se pide cuando faltan al menos ${cv.loteMin}, o cuando quedó sólo la exhibida` : 'se repone lo que se vendió'}.
          Lo que llega a un local en 0 sale marcado <b>para exhibir</b>: la primera va con alarma y las dos etiquetas.
          <br />
          <b>Devolver al depósito</b>: lo que está de más, hasta {cv.topeDevolucion} prendas por día, primero lo que no se vendió.
          <br />
          <br />
          <b>Armar con el lector</b>: se escanea cada prenda contra la lista y, al terminar, el Monitor hace la transferencia del depósito al local en
          Gestión Nube con lo escaneado. Devolver al depósito todavía se carga a mano en Gestión Nube.
        </InfoPopover>
        <Button variant="ghost" onClick={() => setConfigOpen(true)}>
          Configurar
        </Button>
        <Button variant="ghost" onClick={() => void Promise.all([rep.traer(), recargar()])} loading={recargando} title="Vuelve a leer los datos ya sincronizados, sin ir a Gestión Nube">
          Recargar
        </Button>
        <Button variant="outline" onClick={() => void onActualizar()} loading={syncing} title="Le pide el stock y el catálogo a Gestión Nube (~2 min)">
          {syncing ? syncLabel || 'Actualizando…' : 'Cargar de Gestión Nube'}
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
            { key: 'llevar', label: 'Llevar al local', badge: totalLlevar || undefined },
            { key: 'devolver', label: 'Devolver al depósito', badge: devolver.total || undefined },
          ]}
        />
        <span style={{ marginLeft: 'auto', fontSize: font.sm, color: edadMin != null && edadMin >= 360 ? color.warningInk : color.mut2 }}>
          {rep.lastUpdate
            ? `Stock de Gestión Nube: ${rep.lastUpdate.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} (${antiguedad})`
            : 'Stock de Gestión Nube: sin datos de cuándo se sincronizó'}
        </span>
      </div>

      {tab === 'llevar' ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap', marginBottom: space[3] }}>
            <span style={{ fontSize: font.md, color: color.ink2 }}>
              <b>{totalLlevar}</b> prendas para llevar · <b>{llevar.length}</b> variantes de <b>{new Set(llevar.map((f) => f.it.pid)).size}</b> productos
            </span>
            {paraExhibir > 0 && (
              <Badge tone="warning">
                {paraExhibir} para dejar listas para exhibir: alarma + etiqueta de precio + etiqueta de formas de pago
              </Badge>
            )}
            {Object.keys(manual).length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setManual({})}>
                ↺ Volver a lo calculado
              </Button>
            )}
            <Button variant="outline" style={{ marginLeft: 'auto' }} onClick={() => void onImprimirLlevar()} disabled={!llevar.length}>
              Imprimir lista (A4)
            </Button>
            {armado?.estado !== 'revisar' && (
              <Button
                variant="solid"
                tone="brand"
                onClick={() => void onArmar()}
                loading={abriendo}
                disabled={!armadoAbierto && (!llevar.length || esperandoStock)}
                title={esperandoStock ? 'Primero tocá «Cargar de Gestión Nube»: la lista todavía no tiene en cuenta lo que se acaba de pasar al local' : undefined}
              >
                {armadoAbierto ? 'Seguir armando' : 'Armar con el lector'}
              </Button>
            )}
          </div>
          <EstadoArmado armado={armado} onResolver={(h) => void onResolver(h)} />
          {!llevar.length ? (
            <EmptyState icon="🎉" title="No hay prendas para llevar al local" hint="Todo está en su cantidad, o lo que falta no está en el depósito." dashed />
          ) : (
            <TablaVentas
              filas={llevar}
              cantidad={cantLlevar}
              titulo="Llevar"
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
                  Lista entera: <b>{devolver.total}</b> prendas de más en el local
                </>
              ) : (
                <>
                  Hoy: <b>{totalDevolverHoy}</b> prendas (tope {cv.topeDevolucion})
                  {devolver.pendiente > 0 && <> · quedan {devolver.pendiente} para los próximos días</>}
                </>
              )}
            </span>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: font.sm, color: color.mut, cursor: 'pointer' }}>
              <input type="checkbox" checked={verTodo} onChange={(e) => setVerTodo(e.target.checked)} style={{ accentColor: 'var(--mo-brand-solid)' }} />
              Ver la lista entera (para la limpieza grande)
            </label>
            <Button variant="solid" tone="brand" style={{ marginLeft: 'auto' }} onClick={() => void onImprimirDevolver()} disabled={!devolver.filas.length}>
              Imprimir (80 mm)
            </Button>
          </div>
          {!devolver.filas.length ? (
            <EmptyState icon="🎉" title="No hay prendas para devolver al depósito" hint="Nada está por encima de lo que se vende." dashed />
          ) : (
            <TablaVentas filas={devolver.filas} cantidad={(f) => (f as FilaVentas & { devolverHoy: number }).devolverHoy} titulo="Devolver" />
          )}
        </>
      )}

      {exhibidos.length > 0 && (
        <p style={{ marginTop: space[4], fontSize: font.sm, color: color.mut }}>
          {new Set(exhibidos.map((f) => f.it.pid)).size} productos van todos exhibidos y no entran en las listas (
          {[...new Set(exhibidos.map((f) => f.d.modo.motivo))].join(', ')}).
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

/** Tabla agrupada por producto. La cantidad es editable sólo en «Llevar». */
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
    <>
      {grupos.map((g) => (
        <div key={g.pid} style={{ marginBottom: space[4] }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap', margin: `${space[3]}px 0 ${space[2]}px` }}>
            <b style={{ fontSize: font.md, color: color.ink }}>{g.name}</b>
            <span style={{ color: color.mut2, fontSize: font.sm }}>· {g.filas[0].it.cat}</span>
            {g.filas[0].d.nuevo && <Badge tone="brand">nuevo</Badge>}
          </div>
          <TableWrap>
            <THead>
              <Tr>
                <Th>Variante</Th>
                <Th width={130}>SKU</Th>
                <Th align="center" width={60}>Local</Th>
                <Th align="center" width={70}>Depósito</Th>
                <Th align="center" width={84}>Vende x sem.</Th>
                <Th align="center" width={70}>Tiene que haber</Th>
                <Th align="center" width={84}>{titulo}</Th>
                <Th>Por qué</Th>
              </Tr>
            </THead>
            <TBody>
              {g.filas.map((f) => {
                const n = cantidad(f)
                return (
                  <Tr key={f.it.vid}>
                    <Td wrap>
                      {f.it.size || '—'}
                      {f.d.exhibir && titulo === 'Llevar' && (
                        <span title="El local está en 0: la primera va con alarma, etiqueta de precio y de formas de pago" style={{ marginLeft: 6 }}>
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
                          aria-label={`Prendas a llevar de ${f.it.name} ${f.it.size}`}
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
            </TBody>
          </TableWrap>
        </div>
      ))}
    </>
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
        {puede ? 'Los cambios los ven todos.' : 'Esto lo pueden cambiar Darío y Bruno.'} <span style={{ color: shareStatus.color }}>{shareStatus.txt}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: 8, marginBottom: 14 }}>
        {param('minimoBajo', 'Mínimo de lo que vende poco (con la exhibida)')}
        {param('minimo', 'Mínimo de lo que vende (con la exhibida)')}
        {param('umbralSemana', '«Vende» desde (unidades por semana)')}
        {param('coberturaDias', 'Días de venta que cubre la reserva')}
        {param('ventanaDias', 'Días de ventas que se miran (además de los últimos 7)')}
        {param('loteMin', 'Traer como mínimo (salvo la última)')}
        {param('topeDevolucion', 'Prendas por día para devolver')}
        {param('diasNuevo', 'Días para dejar de ser nuevo')}
      </div>

      {/* «Por categoría» se sacó el 11-oct-2026 (Darío): nada la usaba —las excepciones van por
          producto— y las categorías de Tienda Nube mezclan «BEST SELLERS» y «(sin categoría)». El
          cálculo todavía la entiende (`modosCat`), por si vuelve. */}
      <div style={{ fontSize: 13, fontWeight: 700, margin: '6px 0' }}>Por producto</div>
      <div style={{ fontSize: 11.5, color: color.mut2, marginBottom: 8 }}>
        Lo que diga «SIN CAMBIO» (OUTLET) o empiece con ACCESORIO ya va todo exhibido por el nombre. Una marca acá le gana a eso.
      </div>
      {Object.keys(cv.modosProd).map((pid) => filaModo('modosProd', pid, productos.find(([p]) => p === pid)?.[1] ?? `Producto ${pid}`))}
      {puede && (
        <>
          <input className="mo-input" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar un producto para marcarlo…" style={{ margin: '6px 0' }} />
          {encontrados
            .filter(([pid]) => !cv.modosProd[pid])
            .map(([pid, n]) => (
              <div key={pid} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '3px 8px' }}>
                <span style={{ flex: 1 }}>{n}</span>
                <Button size="sm" variant="ghost" onClick={() => { setModo('modosProd', pid, { modo: 'exhibido' }); setBuscar('') }}>
                  Marcar
                </Button>
              </div>
            ))}
        </>
      )}
    </Modal>
  )
}

const hhmm = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '')

/** Cómo quedó el armado de hoy: en curso, hecho, o para revisar en Gestión Nube. */
function EstadoArmado({ armado, onResolver }: { armado: Armado | null; onResolver: (hecha: boolean) => void }) {
  if (!armado) return null
  const r = resumenArmado(armado.pedido, armado.escaneos || {})
  const quien = armado.persona ? ` (${armado.persona})` : ''
  const box = { marginBottom: space[3] }
  if (armado.estado === 'en_curso')
    return (
      <div style={box}>
        <Notice tone="brand" icon="📦">
          Hay un armado en curso{quien}, empezado a las {hhmm(armado.creado_en)}: {r.escaneadas} de {r.pedidas} prendas escaneadas. Tocá «Seguir armando» para continuarlo.
        </Notice>
      </div>
    )
  if (armado.estado === 'transferido')
    return (
      <div style={box}>
        <Notice tone="success" icon="✓">
          Hoy ya se armó{quien}: {armado.transfer?.unidades ?? r.escaneadas} prendas pasaron al local a las {hhmm(armado.cerrado_en)}
          {armado.transfer?.transfer_id ? ` (transferencia ${armado.transfer.transfer_id} en Gestión Nube)` : ''}. {' '}
          La lista de abajo se pone al día cuando se actualiza el stock («Cargar de Gestión Nube»).
        </Notice>
      </div>
    )
  if (armado.estado === 'revisar' || armado.estado === 'transfiriendo')
    return (
      <div style={box}>
        <Notice tone="danger" icon="⚠">
          <div>
            <b>No se sabe si la transferencia del armado{quien} se hizo.</b> {armado.error || 'Gestión Nube no contestó.'} Antes de seguir, fijate en Gestión Nube si
            aparece una transferencia de hoy del depósito al local con {r.escaneadas} prendas.
          </div>
          {armado.estado === 'revisar' && (
            <div style={{ display: 'flex', gap: space[2], marginTop: space[2], flexWrap: 'wrap' }}>
              <Button size="sm" variant="solid" tone="brand" onClick={() => onResolver(true)}>
                Sí, está en Gestión Nube
              </Button>
              <Button size="sm" variant="outline" onClick={() => onResolver(false)}>
                No está: volver a intentar
              </Button>
            </div>
          )}
        </Notice>
      </div>
    )
  return null
}
