'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { dispararSyncStock } from '@/lib/sync-gn'
import { cargarUbicaciones, guardarObservacion } from '@/lib/ubicaciones/cliente'
import { cambiosPendientes, esNNN, filtrar, ubiValido, valorMostrado } from '@/lib/ubicaciones/core'
import type { UbiProducto } from '@/lib/ubicaciones/tipos'
import { HeaderAcciones } from '@/components/layout/acciones'
import {
  Badge,
  BuscarInput,
  Button,
  Chips,
  ConfirmDetalle,
  ContadorFiltro,
  EmptyState,
  Esqueleto,
  FilterBar,
  Notice,
  ProgressInline,
  TBody,
  THead,
  TableWrap,
  Td,
  Th,
  Tr,
  color,
  font,
  space,
  useConfirmar,
  useFiltroUrl,
  useToast,
} from '@/components/ui'

const pendKey = (marca: string) => 'monitor_ubi_pend_' + marca
const espera = (ms: number) => new Promise((res) => setTimeout(res, ms))

type Filtro = 'todos' | 'sin' | 'reparar'

/**
 * Ubicaciones (Depósito Minorista, BDI). Carga la ubicación física (NN-N) de cada
 * producto; se guarda en la observación de GN de TODAS sus variantes. Lo tipeado se
 * persiste en localStorage (no se pierde si se refresca antes de Guardar). "Reparar"
 * empareja los productos con variantes desparejas pero con un NN-N dominante.
 *
 * ── Rediseño jul-2026 (el rediseño funcional de la pasada) ──
 * Era la sección con el flujo más confuso. Lo que cambió, y por qué:
 *
 * 1. **Jerarquía de acciones.** Había cuatro botones del mismo tamaño con colores
 *    inventados —#378ADD traer de GN, #B45309 reparar, #0F766E guardar— así que el que
 *    PISA todas las variantes en GN se veía igual que el que refresca la lista. Y la
 *    acción principal, Guardar, estaba última. Ahora Guardar es la primaria del header y
 *    dice cuántas ubicaciones va a escribir; Reparar es una acción de riesgo aparte.
 * 2. **El trabajo pendiente se ve.** Que había 12 tipeados sin guardar solo se deducía
 *    del borde verde de los inputs. Ahora hay una barra fija abajo con el contador,
 *    Guardar y Descartar.
 * 3. **Un solo span verde** anunciaba éxito, progreso Y errores (un error salía en verde).
 *    Ahora: Toast con el tono del resultado y una barra de progreso real para el 3/40.
 * 4. **Los confirm/alert nativos** pasan a diálogos del kit, con el detalle de lo que se
 *    va a escribir en GN a la vista.
 * 5. **Los filtros dicen cuántos son.** Eran dos checkboxes que no contestaban la
 *    pregunta que uno tiene ("¿cuántos me faltan?").
 * 6. **Se puede recorrer el depósito en orden.** La lista venía en orden de GN; ahora se
 *    puede agrupar por estante (11-*, 12-*), que es como se camina el depósito.
 *
 * La lógica (`lib/ubicaciones/core.ts` y `cliente.ts`) no se tocó.
 */
export function Ubicaciones() {
  const { marca } = useSesion()
  const { confirmar } = useConfirmar()
  const toast = useToast()

  const [data, setData] = useState<UbiProducto[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cambios, setCambios] = useState<Record<string, string>>({})
  const [q, setQ] = useFiltroUrl<string>('q', '')
  const [filtro, setFiltro] = useFiltroUrl<Filtro>('f', 'todos')
  const [porEstante, setPorEstante] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [reparando, setReparando] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)
  const [progreso, setProgreso] = useState<{ hechos: number; total: number } | null>(null)
  const [syncLabel, setSyncLabel] = useState('')
  const [tick, setTick] = useState(0)

  const marcaRef = useRef(marca)
  useEffect(() => {
    marcaRef.current = marca
  }, [marca])

  const persistirCambios = useCallback((c: Record<string, string>) => {
    try {
      localStorage.setItem(pendKey(marcaRef.current), JSON.stringify(c))
    } catch {
      /* localStorage lleno / bloqueado: no crítico */
    }
  }, [])

  const recargar = () => setTick((t) => t + 1)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      setData(null)
      setError(null)
      // Restaurar lo tipeado y no guardado (red de seguridad si se cerró la pestaña).
      let pend: Record<string, string> = {}
      try {
        pend = JSON.parse(localStorage.getItem(pendKey(marca)) || '{}') || {}
      } catch {
        pend = {}
      }
      setCambios(pend)
      try {
        const d = await cargarUbicaciones(marca)
        if (vivo) setData(d)
      } catch (e) {
        if (vivo) {
          setData([])
          setError(e instanceof Error ? e.message : String(e))
        }
      }
    })()
    return () => {
      vivo = false
    }
  }, [marca, tick])

  const setUbi = (pid: number | string, val: string) => {
    setCambios((prev) => {
      const next = { ...prev, [String(pid)]: val }
      persistirCambios(next)
      return next
    })
  }

  const ocupado = guardando || reparando || sincronizando
  const pendientes = data ? cambiosPendientes(data, cambios) : { validos: [], invalidos: [] }
  const nPend = pendientes.validos.length + pendientes.invalidos.length

  // Contadores de los chips: la pregunta real de esta pantalla es "cuántos me faltan".
  const cuentas = useMemo(() => {
    if (!data) return { todos: 0, sin: 0, reparar: 0 }
    return {
      todos: data.length,
      sin: data.filter((p) => !esNNN(valorMostrado(p, cambios))).length,
      reparar: data.filter((p) => p.reparable).length,
    }
  }, [data, cambios])

  const lista = useMemo(() => (data ? filtrar(data, q, filtro === 'sin', filtro === 'reparar', cambios) : []), [data, q, filtro, cambios])
  const grupos = useMemo(() => (porEstante ? agruparPorEstante(lista, cambios) : null), [porEstante, lista, cambios])

  const guardar = async () => {
    if (!data) return
    const { validos, invalidos } = cambiosPendientes(data, cambios)
    if (!validos.length) {
      await confirmar({
        titulo: 'No hay nada para guardar',
        mensaje: invalidos.length
          ? `Los ${invalidos.length} cambios que hay tienen el formato mal. Tiene que ser número-guión-número, como 11-1.`
          : 'No tocaste ninguna ubicación todavía.',
        ok: 'Entendido',
      })
      return
    }
    const ok = await confirmar({
      titulo: 'Guardar ubicaciones en Gestión Nube',
      tono: 'brand',
      ok: `Guardar ${validos.length}`,
      mensaje: (
        <>
          <p>
            Se escribe la ubicación en la observación de <b>todas las variantes</b> de cada producto, en Depósito Minorista.
          </p>
          <div style={{ marginTop: space[3] }}>
            <ConfirmDetalle label="Productos a escribir" valor={validos.length} />
            {invalidos.length > 0 && <ConfirmDetalle label="Se omiten por formato inválido" valor={invalidos.length} />}
          </div>
        </>
      ),
    })
    if (!ok) return

    setGuardando(true)
    let hechos = 0
    let err = 0
    let primerError = ''
    const exitosos: { pid: string; valor: string }[] = []
    for (let i = 0; i < validos.length; i++) {
      const p = validos[i]
      setProgreso({ hechos: i, total: validos.length })
      const valor = (cambios[String(p.product_id)] || '').trim()
      const r = await guardarObservacion(p.product_id, cambios[String(p.product_id)])
      if (r.ok) {
        hechos++
        exitosos.push({ pid: String(p.product_id), valor: valor.slice(0, 20) })
      } else {
        err++
        if (!primerError) primerError = r.error || 'desconocido'
      }
      await espera(250) // pausa entre productos (no saturar GN)
    }
    // Aplicar los éxitos: actual = valor guardado, y sacar de cambios (+ persistir).
    const okPids = new Set(exitosos.map((e) => e.pid))
    const valorPorPid = new Map(exitosos.map((e) => [e.pid, e.valor]))
    setData((prev) => (prev ? prev.map((p) => (okPids.has(String(p.product_id)) ? { ...p, actual: valorPorPid.get(String(p.product_id))! } : p)) : prev))
    setCambios((prev) => {
      const next = { ...prev }
      okPids.forEach((pid) => delete next[pid])
      persistirCambios(next)
      return next
    })
    setGuardando(false)
    setProgreso(null)

    if (err) {
      toast.error(
        `Se guardaron ${hechos} y ${err} ${err === 1 ? 'dio' : 'dieron'} error (${primerError}). Los que fallaron siguen cargados acá: volvé a tocar Guardar para reintentar solo esos.`,
      )
    } else {
      toast.ok(`${hechos} ${hechos === 1 ? 'ubicación guardada' : 'ubicaciones guardadas'}`)
    }
  }

  const descartar = async () => {
    const ok = await confirmar({
      titulo: 'Descartar lo tipeado',
      tono: 'danger',
      ok: `Descartar ${nPend}`,
      mensaje: `Se borran ${nPend} ${nPend === 1 ? 'ubicación cargada' : 'ubicaciones cargadas'} que todavía no se ${nPend === 1 ? 'guardó' : 'guardaron'} en GN. Lo ya guardado no se toca.`,
    })
    if (!ok) return
    setCambios({})
    persistirCambios({})
    toast.info('Listo, quedó como estaba')
  }

  const reparar = async () => {
    if (!data) return
    const aReparar = data.filter((p) => p.reparable)
    const soloViejo = data.filter((p) => p.malFormato && !p.reparable)
    if (!aReparar.length) {
      await confirmar({
        titulo: 'No hay nada que reparar',
        ok: 'Entendido',
        mensaje: soloViejo.length
          ? `No hay productos auto-reparables. Hay ${soloViejo.length} con formato viejo (sin NN-N): esos hay que cargarlos a mano, con el filtro "A reparar".`
          : 'No hay variantes desparejas 🎉',
      })
      return
    }
    const ok = await confirmar({
      titulo: 'Emparejar variantes desparejas',
      tono: 'warning',
      ok: `Reparar ${aReparar.length}`,
      mensaje: (
        <>
          <p>
            Se pisa la observación de <b>todas las variantes</b> con la ubicación dominante de cada producto. No se puede deshacer.
          </p>
          <div style={{ marginTop: space[3] }}>
            <ConfirmDetalle label="Productos a reparar" valor={aReparar.length} />
            {soloViejo.length > 0 && <ConfirmDetalle label="Con formato viejo (no se tocan)" valor={soloViejo.length} />}
          </div>
        </>
      ),
    })
    if (!ok) return

    setReparando(true)
    let hechos = 0
    let err = 0
    let primerError = ''
    for (let i = 0; i < aReparar.length; i++) {
      const p = aReparar[i]
      setProgreso({ hechos: i, total: aReparar.length })
      const r = await guardarObservacion(p.product_id, p.actual)
      if (r.ok) hechos++
      else {
        err++
        if (!primerError) primerError = r.error || 'desconocido'
      }
      await espera(300)
    }
    setReparando(false)
    setProgreso(null)
    recargar() // recargar para reflejar el estado real
    if (err) toast.error(`Se repararon ${hechos} y ${err} ${err === 1 ? 'dio' : 'dieron'} error (${primerError}). Volvé a tocar Reparar para reintentar.`)
    else toast.ok(`${hechos} ${hechos === 1 ? 'producto reparado' : 'productos reparados'}`)
  }

  const traerGN = async () => {
    if (sincronizando) return
    setSincronizando(true)
    try {
      const done = await dispararSyncStock(marca, setSyncLabel)
      recargar()
      if (!done) toast.aviso('La sincronización con GN tardó más de lo normal. Te muestro lo último disponible.')
      else toast.ok('Lista actualizada con lo último de GN')
    } catch (e) {
      toast.error('No se pudo sincronizar: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSincronizando(false)
      setSyncLabel('')
    }
  }

  return (
    <>
      <HeaderAcciones>
        {progreso && <ProgressInline hechos={progreso.hechos} total={progreso.total} label={reparando ? 'reparando' : 'guardando'} />}
        {syncLabel && <span style={{ fontSize: font.sm, color: color.mut }}>{syncLabel}</span>}
        <Button variant="ghost" onClick={recargar} disabled={ocupado} title="Volver a leer la lista">↻</Button>
          <Button variant="outline" onClick={traerGN} loading={sincronizando} disabled={ocupado} title="Trae productos y stock nuevos de GN, y recarga la lista">Traer de GN
        </Button>
        <Button
          variant="outline"
          tone="warning"
          onClick={() => void reparar()}
 loading={reparando}
 disabled={ocupado || !cuentas.reparar}
 title="Pisa TODAS las variantes con la ubicación dominante, en los productos con variantes desparejas"
 >
 Reparar{cuentas.reparar ? ` (${cuentas.reparar})` : ''}</Button>
        <Button variant="solid" tone="brand" onClick={() => void guardar()} loading={guardando} disabled={ocupado || !pendientes.validos.length}>
          {pendientes.validos.length ? `Guardar ${pendientes.validos.length}` : 'Guardar'}
        </Button>
      </HeaderAcciones>

      {error && (
        <Notice tone="danger" icon="⚠" style={{ marginBottom: space[3] }}>
          No se pudo leer la lista: {error}
        </Notice>
      )}

      <FilterBar>
        <BuscarInput value={q} onChange={setQ} placeholder="Buscar producto o SKU…" />
        <Chips<Filtro>
          value={filtro}
          onChange={setFiltro}
          opciones={[
            { key: 'todos', label: 'Todos', n: cuentas.todos },
            { key: 'sin', label: 'Sin ubicación', n: cuentas.sin, title: 'Sin un NN-N válido: casillero vacío o formato viejo. Hay que cargarlos a mano.' },
            { key: 'reparar', label: 'A reparar', n: cuentas.reparar, title: 'Variantes desparejas que se arreglan solas con Reparar' },
          ]}
        />
        <Button size="sm" variant={porEstante ? 'soft' : 'ghost'} tone={porEstante ? 'brand' : 'neutral'} onClick={() => setPorEstante((v) => !v)} title="Agrupa por el número de estante, que es el orden en que se camina el depósito">
          {porEstante ? '✓ Por estante' : 'Agrupar por estante'}
        </Button>
        <ContadorFiltro n={lista.length} singular="producto" plural="productos" />
      </FilterBar>

      {!data ? (
        <Esqueleto forma="tabla" filas={10} />
      ) : lista.length === 0 ? (
        <EmptyState
          icon={filtro === 'sin' ? '✅' : '🔍'}
          title={filtro === 'sin' ? 'No queda ningún producto sin ubicación' : filtro === 'reparar' ? 'No hay variantes desparejas' : 'Sin productos'}
          hint={q ? `Nada coincide con "${q}".` : undefined}
          dashed
        />
      ) : grupos ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
          {grupos.map(([estante, items]) => (
            <section key={estante}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2], marginBottom: space[2] }}>
                <h2 style={{ fontSize: font.md, fontWeight: 700, color: color.ink }}>{estante === '' ? 'Sin estante' : `Estante ${estante}`}</h2>
                <span style={{ fontSize: font.sm, color: color.mut }}>
                  {items.length} {items.length === 1 ? 'producto' : 'productos'}
                </span>
              </div>
              <Tabla items={items} cambios={cambios} setUbi={setUbi} />
            </section>
          ))}
        </div>
      ) : (
        <Tabla items={lista} cambios={cambios} setUbi={setUbi} />
      )}

      {/* Barra de pendientes: el trabajo sin guardar tiene que verse siempre, incluso con
          la tabla scrolleada 300 filas abajo. */}
      {nPend > 0 && (
        <div style={BARRA}>
          <span style={{ fontSize: font.base, color: color.ink2 }}>
            <b>{nPend}</b> sin guardar
            {pendientes.invalidos.length > 0 && (
              <span style={{ color: color.danger }}>
                {' '}
                · {pendientes.invalidos.length} con formato inválido
              </span>
            )}
          </span>
          <Button size="sm" variant="ghost" tone="danger" onClick={() => void descartar()} disabled={ocupado}>
            Descartar
          </Button>
          <Button size="sm" variant="solid" tone="brand" onClick={() => void guardar()} loading={guardando} disabled={ocupado || !pendientes.validos.length}>
            Guardar {pendientes.validos.length}
          </Button>
        </div>
      )}
    </>
  )
}

function Tabla({ items, cambios, setUbi }: { items: UbiProducto[]; cambios: Record<string, string>; setUbi: (pid: number | string, v: string) => void }) {
  return (
    <TableWrap>
      <THead>
        <Tr>
          <Th>Producto</Th>
          <Th>SKU</Th>
          <Th width={170}>Ubicación</Th>
        </Tr>
      </THead>
      <TBody>
        {items.map((p) => {
          const val = valorMostrado(p, cambios)
          const c = cambios[String(p.product_id)]
          const editado = c != null && c !== p.actual
          const invalido = !ubiValido(val)
          return (
            <Tr key={String(p.product_id)}>
              <Td tall wrap>
                <div style={{ fontWeight: 600, color: color.ink }}>{p.name}</div>
                {p.reparable ? (
                  <div style={{ fontSize: font.xs, color: color.warningInk, marginTop: 2 }}>
                    Variantes desparejas ({p.valores.join(', ')}) · Reparar las deja en <b>{p.actual}</b>
                  </div>
                ) : p.malFormato ? (
                  <div style={{ fontSize: font.xs, color: color.warningInk, marginTop: 2 }}>
                    Formato viejo ({p.valores.join(', ')}) · cargá la ubicación nueva
                  </div>
                ) : null}
              </Td>
              <Td style={{ color: color.mut }}>{p.sku}</Td>
              <Td tall>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    className={`mo-input${invalido ? ' mo-input--invalid' : ''}`}
                    inputMode="numeric"
                    maxLength={20}
                    value={val}
                    onChange={(e) => setUbi(p.product_id, e.target.value)}
                    placeholder="11-1"
                    aria-label={`Ubicación de ${p.name}`}
                    style={{ width: 110, ...(editado && !invalido ? { borderColor: color.success, background: color.successBg } : null) }}
                  />
                  {/* El estado se dice, no se adivina por el color del borde. */}
                  {invalido ? (
                    <Badge tone="danger" subtle>
                      formato
                    </Badge>
                  ) : editado ? (
                    <Badge tone="success" subtle>
                      sin guardar
                    </Badge>
                  ) : null}
                </div>
              </Td>
            </Tr>
          )
        })}
      </TBody>
    </TableWrap>
  )
}

/** Agrupa por el número de estante (lo de antes del guión), en orden numérico. */
function agruparPorEstante(lista: UbiProducto[], cambios: Record<string, string>): [string, UbiProducto[]][] {
  const map = new Map<string, UbiProducto[]>()
  for (const p of lista) {
    const v = valorMostrado(p, cambios)
    const estante = esNNN(v) ? v.split('-')[0] : ''
    if (!map.has(estante)) map.set(estante, [])
    map.get(estante)!.push(p)
  }
  return [...map.entries()].sort((a, b) => {
    if (a[0] === '') return 1 // los sin estante, al final
    if (b[0] === '') return -1
    return Number(a[0]) - Number(b[0])
  })
}

const BARRA: React.CSSProperties = {
  position: 'sticky',
  bottom: 0,
  zIndex: 5,
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap',
  marginTop: 12,
  padding: '10px 14px',
  background: 'var(--mo-surface)',
  border: '1px solid var(--mo-line)',
  borderRadius: 'var(--mo-r-xl)',
  boxShadow: 'var(--mo-sh-pop)',
}
