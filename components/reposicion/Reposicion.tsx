'use client'

import { talle } from '@/lib/reposicion/armado'
import { Fragment, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { useTnPromo } from '@/components/productos/useTnImages'
import { useRecargarDatos } from '@/components/productos/BotonRecargar'
import { dispararSyncStock } from '@/lib/sync-gn'
import { indexarTn } from '@/lib/tn'
import { construirInv } from '@/lib/reposicion/inventario'
import { aplicarCats, catsDisponibles, minimo, moverFinal, objetivo, reporte, sugerido, ubicCmp } from '@/lib/reposicion/core'
import { ordenarModelo } from '@/lib/reposicion/grupos'
import { reposicionPDF } from '@/lib/reposicion/pdf'
import type { RepoCfg, RepoItem } from '@/lib/reposicion/tipos'
import type { Producto } from '@/lib/etl/tipos'
import { useReposicion } from './useReposicion'
import { ReposicionZattia } from './ReposicionZattia'
import { HeaderAcciones } from '@/components/layout/acciones'
import { InfoPopover } from '@/components/ui/InfoPopover'
import {
  Badge,
  Button,
  EmptyState,
  Esqueleto,
  Modal,
  Notice,
  Select,
  TBody,
  THead,
  TableWrap,
  Td,
  Th,
  Tr,
  color,
  font,
  space,
  useToast,
} from '@/components/ui'

export function Reposicion() {
  const { marca } = useSesion()
  const { datos } = useDatosMonitor()
  if (!datos) return <Esqueleto forma="tabla" filas={8} />
  // Zattia repone según ventas, con dos listas (`ReposicionZattia`); BDI sigue con los mínimos.
  if (marca === 'zattia') return <ReposicionZattia key={marca} allProductos={datos.allProductos ?? []} />
  return <Contenido key={marca} allProductos={datos.allProductos ?? []} />
}

function Contenido({ allProductos }: { allProductos: Producto[] }) {
  const { marca } = useSesion()
  const toast = useToast()
  const esBdi = marca === 'bdi'
  const tnIdx = useTnPromo(marca)
  const rep = useReposicion(marca)
  const { cfg } = rep

  const prodById = useMemo(() => Object.fromEntries(allProductos.map((p) => [String(p.id), p])) as Record<string, Producto>, [allProductos])
  const inv = useMemo(
    () => aplicarCats(construirInv(rep.rawInv, prodById, tnIdx ?? indexarTn([]), rep.s7), cfg.catsOff),
    [rep.rawInv, prodById, tnIdx, rep.s7, cfg.catsOff],
  )

  const [manual, setManual] = useState<Record<string, number>>({})
  const [verVentas, setVerVentas] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [syncLabel, setSyncLabel] = useState('🔄 Cargar de Gestión Nube')
  const [syncing, setSyncing] = useState(false)
  const { recargar, cargando: recargando } = useRecargarDatos()

  const report = useMemo(() => reporte(inv, cfg, esBdi), [inv, cfg, esBdi])

  const setMover = (vid: string, val: string) => {
    if (val === '' || val == null) {
      setManual((m) => {
        const n = { ...m }
        delete n[vid]
        return n
      })
      return
    }
    const it = inv.find((x) => x.vid === vid)
    const maxDep = it ? it.deposito : Infinity
    setManual((m) => ({ ...m, [vid]: Math.max(0, Math.min(maxDep, parseInt(val, 10) || 0)) }))
  }

  const onActualizar = async () => {
    if (syncing) return
    setSyncing(true)
    try {
      // 🔑 **El `done` no se puede tirar.** `dispararSyncStock` devuelve `false` cuando se le
      // acaban los 7 minutos de espera, y acá el resultado se descartaba: la pantalla recargaba
      // el espejo VIEJO, sellaba «Actualizado: <ahora>» y apagaba el botón como si todo hubiera
      // salido bien. Las otras cuatro secciones que usan esta misma función —Exhibición,
      // Ubicaciones, Caducados y «Actualizar inventario»— sí lo miran y avisan; Reposición era la
      // única que no. El 4-sep-2026 `npm ci` tardó 7 minutos en el workflow y el sync entero se
      // pasó del techo: el local vio «actualizado» con el stock del día anterior, apretó de nuevo,
      // y el segundo intento quedó 7:40 haciendo cola detrás del primero.
      const done = await dispararSyncStock(marca, setSyncLabel)
      setSyncLabel('↻ Recargando…')
      // `rep.traer()` refresca SOLO inventario + ventas 7d + config. El catálogo (`allProductos`,
      // que es contra lo que se cruza el inventario) vive en el caché de IndexedDB y sin este
      // `recargar()` quedaba viejo: se sincronizaba y el producto nuevo seguía sin aparecer.
      await Promise.all([rep.traer(), recargar()])
      setManual({})
      if (done) toast.ok('Stock actualizado')
      else
        toast.aviso('La actualización está tardando más de lo normal: lo que ves puede no tener los movimientos de hoy. Tocá «Recargar» en un minuto.')
    } catch (e) {
      toast.error('No se pudo actualizar: ' + (e as Error).message)
    } finally {
      setSyncing(false)
      setSyncLabel('')
    }
  }

  // Antigüedad del espejo, en texto corto.
  //
  // 🔑 **El reloj corre porque el caso que importa es la pestaña que quedó abierta.** Leer
  // `Date.now()` en el render, además de impuro, congela la cuenta en el momento en que la pantalla
  // se armó: una pestaña abierta a las 9 de la mañana seguiría diciendo «hace 5 min» a las 18. Que
  // es —con otra forma— la misma mentira que estamos sacando. Un minuto de resolución alcanza para
  // un cartel que se mide en horas.
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])
  const edadMin = rep.lastUpdate ? Math.max(0, Math.round((ahora - rep.lastUpdate.getTime()) / 60000)) : null
  const sincroVieja = edadMin != null && edadMin >= 360
  const antiguedad =
    edadMin == null
      ? ''
      : edadMin < 60
        ? `hace ${edadMin} min`
        : edadMin < 1440
          ? `hace ${Math.floor(edadMin / 60)} h`
          : `hace ${Math.floor(edadMin / 1440)} d`

  const onPDF = async () => {
    const ok = await reposicionPDF(inv, cfg, marca, manual, rep.lastUpdate)
    if (!ok) toast.aviso('No hay unidades para reponer.')
  }

  // Reporte agrupado por producto, ordenado por ubicación física.
  const porProd = useMemo(() => {
    const g: Record<string, { name: string; cat: string; ubic: string; sinProducto: boolean; items: RepoItem[] }> = {}
    report.forEach((it) => {
      if (!g[it.pid]) g[it.pid] = { name: it.name, cat: it.cat, ubic: it.ubic || '', sinProducto: it.sinProducto, items: [] }
      g[it.pid].items.push(it)
    })
    return g
  }, [report])
  const prodKeys = useMemo(() => Object.keys(porProd).sort((a, b) => ubicCmp(porProd[a].ubic, porProd[b].ubic) || porProd[a].name.localeCompare(porProd[b].name, 'es')), [porProd])
  const totalMover = report.reduce((s, it) => s + moverFinal(it, cfg, esBdi, manual), 0)
  // Se cuenta sobre `inv` (todo el inventario) y no sobre `report`: un producto nuevo cuyo stock
  // no llega a disparar reposición igual hay que avisarlo, porque el que falta es el catálogo.
  const nuevosSinCatalogo = useMemo(() => new Set(inv.filter((it) => it.sinProducto).map((it) => it.pid)).size, [inv])
  const hayEdit = Object.keys(manual).length > 0

  return (
    <>
      <HeaderAcciones>
        <InfoPopover titulo="Reposición">
          Variantes por debajo del mínimo con stock en el depósito. Los mínimos se editan en «Configurar».
          <br /><br />
          La transferencia se carga en Gestión Nube.
        </InfoPopover>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: font.sm, color: color.mut, cursor: 'pointer' }}>
          <input type="checkbox" checked={verVentas} onChange={(e) => setVerVentas(e.target.checked)} style={{ accentColor: 'var(--mo-brand-solid)' }} />
          Ver ventas 7 días
        </label>
        <Button variant="ghost" onClick={() => setConfigOpen(true)}>
          Configurar
        </Button>
        <Button
          variant="ghost"
          onClick={() => void Promise.all([rep.traer(), recargar()])}
          loading={recargando}
          title="Vuelve a leer los datos guardados (unos segundos)"
        >
          Recargar
        </Button>
        <Button variant="outline" onClick={() => void onActualizar()} loading={syncing} title="Carga el stock de Gestión Nube (unos 2 minutos)">
          {syncing ? syncLabel || 'Actualizando…' : 'Actualizar stock'}
        </Button>
        <Button variant="solid" tone="brand" onClick={() => void onPDF()} disabled={!report.length} title="Las cantidades en 0 no se imprimen">
          Imprimir A4
        </Button>
      </HeaderAcciones>

      {rep.cargando && !rep.rawInv.length ? (
        <Esqueleto forma="tabla" filas={8} />
      ) : rep.error ? (
        <Notice tone="danger" icon="⚠">
          <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
            <span>No se pudo cargar la reposición: {rep.error}</span>
            <Button size="sm" variant="outline" tone="danger" onClick={() => void rep.traer()}>
              Reintentar
            </Button>
          </div>
        </Notice>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap', marginBottom: space[3] }}>
            <span style={{ fontSize: font.md, color: color.ink2 }}>
              <b>{totalMover}</b> unidades · {report.length} {report.length === 1 ? 'variante' : 'variantes'}
            </span>
            {hayEdit && (
              <Button size="sm" variant="ghost" onClick={() => setManual({})}>
                ↺ Restablecer cantidades
              </Button>
            )}
            {/* 🔑 **Decir CUÁNTO hace, no sólo cuándo.** Una fecha sola no se lee: «04/09 10:30» a
                las 18:00 parece de recién si no la mirás dos veces. Lo que el local necesita saber
                antes de bajar al depósito es si esto tiene los movimientos de hoy, y eso es la
                antigüedad. Ámbar a partir de las 6 h, que es cuando ya pasó media jornada de ventas. */}
            <span style={{ marginLeft: 'auto', fontSize: font.sm, color: sincroVieja ? color.warningInk : color.mut2 }}>
              {rep.lastUpdate
                ? `Stock ${antiguedad} · ${rep.lastUpdate.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
                : 'Stock sin fecha de actualización'}
            </span>
          </div>

          {/* Antes estas variantes se descartaban en silencio y el stock desaparecía del reporte.
              El cartel es la mitad importante del arreglo: aunque el catálogo se atrase, se ve. */}
          {nuevosSinCatalogo > 0 && (
            <Notice tone="warning" icon="✨">
              <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
                <span>
                  <b>{nuevosSinCatalogo}</b> {nuevosSinCatalogo === 1 ? 'producto nuevo sin categoría: usa' : 'productos nuevos sin categoría: usan'} el mínimo general.
                </span>
                <Button size="sm" variant="outline" onClick={() => void onActualizar()} loading={syncing}>
                  Actualizar stock
                </Button>
              </div>
            </Notice>
          )}

          {!report.length && <EmptyState icon="🎉" title="No hay variantes para reponer" hint="Todas están en su mínimo, o no hay stock en el depósito." dashed />}

          {/* UNA tabla, con el producto como separador (12-oct-2026: antes una tabla por producto, con
              los encabezados repetidos). La ubicación va primero: el reporte se recorre caminando el
              depósito, y el orden de la lista es el orden físico. */}
          {report.length > 0 && (
            <TableWrap>
              <THead>
                <Tr>
                  <Th>Variante</Th>
                  <Th width={150}>SKU</Th>
                  <Th align="center" width={70}>Local</Th>
                  <Th align="center" width={80}>Depósito</Th>
                  {verVentas && (
                    <Th align="center" width={90}>
                      Ventas 7 días
                    </Th>
                  )}
                  <Th align="center" width={70}>
                    Mínimo
                  </Th>
                  <Th align="center" width={84}>
                    Reponer
                  </Th>
                </Tr>
              </THead>
              <TBody>
                {prodKeys.map((pid) => {
                  const g = porProd[pid]
                  const items = g.items.slice().sort((a, b) => (a.size || '').localeCompare(b.size || '', 'es', { numeric: true }))
                  return (
                    <Fragment key={pid}>
                      <Tr>
                        <Td colSpan={verVentas ? 7 : 6} style={{ background: color.bg2, paddingTop: space[2], paddingBottom: space[2] }}>
                          {g.ubic && (
                            <span style={{ background: color.brandBg, border: `1px solid ${color.brandBorder}`, color: color.brand, fontWeight: 700, borderRadius: 6, padding: '1px 7px', fontSize: font.sm, marginRight: 8 }}>
                              📍 {g.ubic}
                            </span>
                          )}
                          <b style={{ color: color.ink }}>{g.name}</b>
                          <span style={{ color: color.mut2, fontSize: font.sm }}> · {g.cat}</span>
                          {g.sinProducto && (
                            <span title="Producto nuevo: la categoría aparece con la próxima actualización" style={{ marginLeft: 6 }}>
                              <Badge tone="warning">nuevo</Badge>
                            </span>
                          )}
                        </Td>
                      </Tr>
                      {items.map((it) => {
                        const obj = objetivo(it, cfg)
                        const topeado = cfg.topes[String(it.pid)] != null && cfg.topes[String(it.pid)] < minimo(it, cfg)
                        const sug = sugerido(it, cfg, esBdi)
                        const mover = moverFinal(it, cfg, esBdi, manual)
                        const editado = manual[it.vid] !== undefined && manual[it.vid] !== sug
                        return (
                          <Tr key={it.vid}>
                            <Td wrap>{talle(it.size || '') || 'Única'}</Td>
                            <Td style={{ fontSize: font.sm, color: color.mut }}>{it.sku || '—'}</Td>
                            <Td align="center" style={{ color: it.local <= 1 ? color.danger : color.ink2, fontWeight: 600 }}>
                              {it.local}
                            </Td>
                            <Td align="center">{it.deposito}</Td>
                            {verVentas && (
                              <Td align="center" style={{ color: color.success, fontWeight: 600 }}>
                                {it.s7}
                              </Td>
                            )}
                            <Td align="center" style={{ color: topeado ? color.brand : color.mut2, fontWeight: topeado ? 700 : undefined }} title={topeado ? 'Con tope por producto' : 'Mínimo del modelo o la categoría'}>
                              {obj}
                            </Td>
                            <Td align="center" tall>
                              <input
                                className="mo-input mo-input--num"
                                type="number"
                                min={0}
                                max={it.deposito}
                                inputMode="numeric"
                                value={mover}
                                onChange={(e) => setMover(it.vid, e.target.value)}
                                title={`Sugerido: ${sug} · Máximo en el depósito: ${it.deposito}`}
                                aria-label={`Unidades a reponer de ${it.size || it.sku || 'la variante'}`}
                                style={{
                                  width: 64,
                                  textAlign: 'center',
                                  padding: '0 6px',
                                  fontWeight: 700,
                                  color: mover === 0 ? color.mut2 : color.ink,
                                  ...(editado ? { borderColor: color.brandSolid, background: color.brandBg } : null),
                                }}
                              />
                            </Td>
                          </Tr>
                        )
                      })}
                    </Fragment>
                  )
                })}
              </TBody>
            </TableWrap>
          )}
          {cfg.apagados.length > 0 && (
            <p style={{ marginTop: space[4], fontSize: font.sm, color: color.mut }}>
              🔌 {cfg.apagados.length} {cfg.apagados.length === 1 ? 'producto apagado' : 'productos apagados'} (se editan en «Configurar»).
            </p>
          )}
        </div>
      )}

      <ConfigModal abierto={configOpen} inv={inv} cfg={cfg} esBdi={esBdi} shareStatus={rep.shareStatus} guardarCfg={rep.guardarCfg} onClose={() => setConfigOpen(false)} />
    </>
  )
}

// ── Modal de configuración ──
function ConfigModal({ abierto, inv, cfg, esBdi, shareStatus, guardarCfg, onClose }: {
  abierto: boolean
  inv: RepoItem[]; cfg: RepoCfg; esBdi: boolean; shareStatus: { txt: string; color: string }
  guardarCfg: (c: RepoCfg) => void; onClose: () => void
}) {
  const [fundasOpen, setFundasOpen] = useState(false)
  const [topeSearch, setTopeSearch] = useState('')
  const [topeCat, setTopeCat] = useState('')
  const [topeEstado, setTopeEstado] = useState<'' | 'sin' | 'con' | 'apagados'>('')
  const [topeDeposito, setTopeDeposito] = useState<'con' | '' | 'sin'>('con')

  const minKeys = useMemo(() => {
    const keys = [...new Set(inv.map((it) => it.subcat || it.modelo || it.cat || '(sin categoría)'))]
    return {
      modelos: keys.filter((k) => /^iphone/i.test(k)).sort(ordenarModelo),
      cats: keys.filter((k) => !/^iphone/i.test(k)).sort((a, b) => a.localeCompare(b, 'es')),
    }
  }, [inv])
  const catsDisp = useMemo(() => catsDisponibles(inv), [inv])
  const offSet = new Set((cfg.catsOff || []).map((s) => s.toLowerCase()))

  const setDefault = (v: string) => guardarCfg({ ...cfg, defaultMin: parseInt(v, 10) || 0 })
  const setMin = (cat: string, v: string) => {
    const mins = { ...cfg.mins }
    if (v === '') delete mins[cat]
    else mins[cat] = parseInt(v, 10) || 0
    guardarCfg({ ...cfg, mins })
  }
  const setReserva = (v: string) => guardarCfg({ ...cfg, reservaDeposito: Math.max(0, parseInt(v, 10) || 0) })
  const setReservaTodos = (on: boolean) => guardarCfg({ ...cfg, reservaTodos: on })
  const toggleCatOff = (cat: string) => {
    const l = cat.toLowerCase()
    const catsOff = offSet.has(l) ? cfg.catsOff.filter((x) => x.toLowerCase() !== l) : [...cfg.catsOff, cat]
    guardarCfg({ ...cfg, catsOff })
  }
  const setTope = (pid: string, v: string) => {
    const topes = { ...cfg.topes }
    if (v === '') delete topes[pid]
    else topes[pid] = Math.max(0, parseInt(v, 10) || 0)
    guardarCfg({ ...cfg, topes })
  }
  const toggleApagar = (pid: string) => {
    const apagados = cfg.apagados.includes(pid) ? cfg.apagados.filter((x) => x !== pid) : [...cfg.apagados, pid]
    guardarCfg({ ...cfg, apagados })
  }

  // Topes: agregado por producto (con stock) + filtros.
  const topeCats = useMemo(() => {
    const byPid: Record<string, { cat: string; stock: number }> = {}
    inv.forEach((it) => { if (!byPid[it.pid]) byPid[it.pid] = { cat: it.cat, stock: 0 }; byPid[it.pid].stock += it.local + it.deposito })
    return [...new Set(Object.values(byPid).filter((p) => p.stock > 0 && p.cat).map((p) => p.cat))].sort((a, b) => a.localeCompare(b, 'es'))
  }, [inv])
  const topesList = useMemo(() => {
    const byPid: Record<string, { pid: string; name: string; cat: string; local: number; dep: number }> = {}
    inv.forEach((it) => { if (!byPid[it.pid]) byPid[it.pid] = { pid: it.pid, name: it.name, cat: it.cat, local: 0, dep: 0 }; byPid[it.pid].local += it.local; byPid[it.pid].dep += it.deposito })
    let arr = Object.values(byPid).filter((p) => p.local + p.dep > 0)
    const verApagados = topeEstado === 'apagados'
    if (!verApagados) {
      if (topeDeposito === 'con') arr = arr.filter((p) => p.dep > 0)
      else if (topeDeposito === 'sin') arr = arr.filter((p) => p.dep <= 0)
    }
    if (topeCat) arr = arr.filter((p) => String(p.cat || '') === topeCat)
    if (verApagados) arr = arr.filter((p) => cfg.apagados.includes(String(p.pid)))
    else if (topeEstado === 'sin') arr = arr.filter((p) => cfg.topes[String(p.pid)] == null)
    else if (topeEstado === 'con') arr = arr.filter((p) => cfg.topes[String(p.pid)] != null)
    const q = topeSearch.toLowerCase().trim()
    if (q) arr = arr.filter((p) => p.name.toLowerCase().includes(q) || String(p.cat || '').toLowerCase().includes(q))
    arr.sort((a, b) => a.name.localeCompare(b.name, 'es'))
    return arr
  }, [inv, cfg.apagados, cfg.topes, topeEstado, topeDeposito, topeCat, topeSearch])
  const topesShown = topesList.slice(0, 250)

  const minInput = (c: string, small = false) => (
    <label key={c} style={{ fontSize: 12, color: color.ink2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, background: '#fff', border: `1px solid ${color.bg2}`, borderRadius: small ? 6 : 7, padding: small ? '3px 8px' : '5px 8px', marginBottom: small ? 5 : 0, breakInside: 'avoid' }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c}</span>
      <input type="number" min={0} defaultValue={cfg.mins[c] ?? ''} placeholder={String(cfg.defaultMin)} onChange={(e) => setMin(c, e.target.value)} onFocus={(e) => e.target.select()} style={{ width: small ? 54 : 60, padding: '4px 6px', border: `1px solid ${color.line2}`, borderRadius: 6, textAlign: 'center', flex: 'none' }} />
    </label>
  )

  return (
    <Modal
      abierto={abierto}
      onCerrar={onClose}
      titulo="⚙️ Configurar mínimos"
      ancho="ancho"
      pie={
        <Button variant="solid" tone="brand" onClick={onClose}>Listo</Button>
      }
    >
      <div>
        <div style={{ fontSize: 12, color: color.mut, marginBottom: 10 }}>
          Definí cuántas unidades mantener en Local por categoría/modelo. El &quot;tope local&quot; (por producto) puede bajar este número para un producto puntual. <span style={{ fontSize: 11, marginLeft: 6, color: shareStatus.color }}>{shareStatus.txt}</span>
        </div>
        <label style={{ fontSize: 12, color: color.mut, display: 'inline-block', marginBottom: 10 }}>Mínimo general: <input type="number" min={0} defaultValue={cfg.defaultMin} onChange={(e) => setDefault(e.target.value)} style={{ width: 70, padding: '5px 7px', border: `1px solid ${color.line2}`, borderRadius: 7 }} /></label>

        <div style={{ background: color.brandBg, border: `1px solid ${color.brandBorder}`, borderRadius: 8, padding: '9px 11px', marginBottom: 12, fontSize: 12, color: color.brand }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>🛡️ <b>Reserva para venta online:</b> <input type="number" min={0} defaultValue={cfg.reservaDeposito ?? 1} onChange={(e) => setReserva(e.target.value)} style={{ width: 56, padding: '4px 6px', border: `1px solid ${color.brandBorder}`, borderRadius: 6, textAlign: 'center' }} /> unidades en el depósito</div>
          <div style={{ color: color.mut2, marginTop: 4 }}>No se repone si el depósito queda debajo de esta reserva.</div>
          {esBdi && <label style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 7, color: color.ink2, cursor: 'pointer', fontWeight: 600 }}><input type="checkbox" checked={cfg.reservaTodos} onChange={(e) => setReservaTodos(e.target.checked)} /> Incluir <u>todos los productos</u> (no solo fundas)</label>}
        </div>

        {minKeys.cats.length > 0 && <>
          <div style={secTitle}>Categorías</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 8 }}>{minKeys.cats.map((c) => minInput(c))}</div>
        </>}
        {minKeys.modelos.length > 0 && <>
          <div onClick={() => setFundasOpen((v) => !v)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginTop: 12, background: '#fff', border: `1px solid ${color.line}`, borderRadius: 8, padding: '9px 12px', fontWeight: 600, fontSize: 13 }}>
            <span>🛡️ Fundas: mínimo por modelo <span style={{ color: color.mut2, fontWeight: 400 }}>({minKeys.modelos.length} modelos)</span></span>
            <span style={{ color: color.mut2 }}>{fundasOpen ? '▴ ocultar' : '▾ definir'}</span>
          </div>
          {fundasOpen && <div style={{ columnWidth: 215, columnGap: 14, marginTop: 8 }}>{minKeys.modelos.map((c) => minInput(c, true))}</div>}
        </>}

        {catsDisp.length > 0 && (
          <div style={{ marginTop: 16, borderTop: `1px solid ${color.line}`, paddingTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Categorías a ignorar al agrupar</div>
            <div style={{ fontSize: 11.5, color: color.mut2, marginBottom: 8 }}>Para productos con varias categorías en Tienda Nube. Las de promoción ya se ignoran.</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {catsDisp.map((c) => {
                const off = offSet.has(c.toLowerCase())
                return <button key={c} onClick={() => toggleCatOff(c)} style={{ fontSize: 12, border: `1px solid ${off ? color.dangerBorder : color.successBorder}`, background: off ? color.dangerBg : color.successBg, color: off ? color.dangerInk : color.successInk, borderRadius: 14, padding: '3px 10px', cursor: 'pointer', textDecoration: off ? 'line-through' : 'none' }}>{c}</button>
              })}
            </div>
          </div>
        )}

        <div style={{ marginTop: 16, borderTop: `1px solid ${color.line}`, paddingTop: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Topes por producto <span style={{ fontWeight: 400, color: color.mut2, fontSize: 12 }}>(tope = máximo en el local · 🔌 = no reponer)</span></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <Select value={topeCat} onChange={(e) => setTopeCat(e.target.value)} style={{ flex: 1, minWidth: 160 }} aria-label="Categoría"><option value="">Todas las categorías</option>{topeCats.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
            <Select value={topeDeposito} onChange={(e) => setTopeDeposito(e.target.value as typeof topeDeposito)} style={{ width: 190 }} aria-label="Stock en depósito"><option value="con">Con stock en depósito</option><option value="">Depósito: todos</option><option value="sin">Sin stock en depósito</option></Select>
            <Select value={topeEstado} onChange={(e) => setTopeEstado(e.target.value as typeof topeEstado)} style={{ width: 170 }} aria-label="Estado del tope"><option value="">Todos</option><option value="sin">Sin tope asignado</option><option value="con">Con tope</option><option value="apagados">🔌 Apagados</option></Select>
          </div>
          <input className="mo-input" value={topeSearch} onChange={(e) => setTopeSearch(e.target.value)} placeholder="Buscar producto o categoría…" style={{ marginBottom: 8 }} />
          <div style={{ maxHeight: 340, overflow: 'auto' }}>
            <div style={{ fontSize: 11, color: color.mut2, margin: '0 0 6px' }}>{topesList.length} {topesList.length === 1 ? 'producto' : 'productos'}{topesList.length > 250 ? ' · se muestran 250' : ''}</div>
            {topesShown.map((p) => {
              const t = cfg.topes[String(p.pid)]
              const off = cfg.apagados.includes(String(p.pid))
              return (
                <div key={p.pid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 12, padding: '4px 8px', border: `1px solid ${color.bg2}`, borderRadius: 6, marginBottom: 4, background: '#fff', opacity: off ? 0.6 : 1 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: off ? 'line-through' : 'none' }}>{p.name} <span style={{ color: color.mut2 }}>· {p.cat} · Local {p.local} · <b style={{ color: color.mut }}>Dep {p.dep}</b></span></span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
                    <input type="number" min={0} defaultValue={t ?? ''} placeholder="—" disabled={off} onChange={(e) => setTope(String(p.pid), e.target.value)} onFocus={(e) => e.target.select()} title="Tope: máximo en Local por variante" style={{ width: 46, padding: '2px 4px', border: `1px solid ${t != null ? color.brandSolid : color.line}`, background: t != null ? color.brandBg : undefined, fontWeight: t != null ? 700 : undefined, borderRadius: 5, textAlign: 'center' }} />
                    <button onClick={() => toggleApagar(String(p.pid))} title={off ? 'Reactivar' : 'Apagar (no reponer)'} style={{ border: `1px solid ${off ? color.danger : color.line}`, background: off ? color.dangerBg : '#fff', color: off ? color.danger : color.mut2, borderRadius: 6, padding: '2px 7px', fontSize: 12, cursor: 'pointer' }}>🔌</button>
                  </span>
                </div>
              )
            })}
            {!topesShown.length && <div style={{ color: color.mut2, fontSize: 12, padding: 8 }}>Sin resultados.</div>}
          </div>
        </div>
      </div>
    </Modal>
  )
}

const secTitle: CSSProperties = { fontSize: 11, fontWeight: 700, color: color.mut2, letterSpacing: 0, margin: '4px 0 6px' }
