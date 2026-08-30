'use client'

import { useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { esAdmin, puedeSub } from '@/lib/permisos'
import { leerInventarioVivo } from '@/lib/inventario-vivo/cliente'
import { realMap } from '@/lib/inventario-vivo/core'
import { descargarXlsx } from '@/lib/excel'
import {
  abrirProducto,
  ANCHOS_AJUSTE,
  aoaAjuste,
  calcularAjuste,
  estadoDe,
  ordenarModelo,
  setCount,
  stockSistema,
  terminarProducto,
  ultimoMs,
  volverSinTerminar,
} from '@/lib/conteo-deposito/core'
import { guardarConteo, leerHistorial } from '@/lib/conteo-deposito/cliente'
import type { CdepProducto, CdepState, ConteoHistorial, Preview } from '@/lib/conteo-deposito/tipos'
import { useConteoDeposito } from './useConteoDeposito'
import { HeaderAcciones } from '@/components/layout/acciones'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { ChipEstado, HistorialConteos, InstructivoConteo, ResumenConteo, fechaLabel, stockLabel } from '@/components/conteos/comunes'
import {
  BuscarInput,
  Button,
  Chips,
  ConfirmDetalle,
  EmptyState,
  Esqueleto,
  FilterBar,
  Notice,
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
  useToast,
} from '@/components/ui'

type Vista = 'lista' | 'foco' | 'preview' | 'historial'
type Filtro = 'todos' | 'sin_previo' | 'sin_previo_stock' | 'contados' | 'en_progreso' | 'terminado'

/**
 * Conteo del Depósito Minorista.
 *
 * Se abre cada producto y se carga la cantidad física por variante; al aplicar, relee el
 * stock vivo de GN y genera el Excel de ajuste. La lógica vive en
 * `lib/conteo-deposito/core.ts` y no se toca.
 *
 * Rediseño jul-2026 (patrón Flujo operativo, mobile-first): las acciones de cada vista
 * van al header, los siete `confirm/alert` nativos pasan a diálogos del kit —incluido el
 * más importante, el que avisa que el Excel es de UNA marca y subirlo a la otra hace que
 * GN rechace los IDs—, y el chip de estado, el instructivo y el historial ahora son los
 * compartidos con los otros dos conteos (`components/conteos/comunes.tsx`), que estaban
 * copiados casi textual en los tres archivos.
 */
export function ConteoDeposito() {
  const { marca, perfil } = useSesion()
  const { confirmar, avisar } = useConfirmar()
  const toast = useToast()
  const usuario = perfil?.name || ''
  const puedeAplicar = esAdmin(perfil) || puedeSub(perfil, marca, 'conteo-deposito', 'aplicar')
  const cd = useConteoDeposito(marca)
  const { products, state, inicio, stockTime, lastCount } = cd

  const [vista, setVista] = useState<Vista>('lista')
  const [focusPid, setFocusPid] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [orderAsc, setOrderAsc] = useState(true)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [aplicando, setAplicando] = useState(false)
  const [hist, setHist] = useState<{ cargando: boolean; conteos: ConteoHistorial[]; error: string | null }>({ cargando: false, conteos: [], error: null })

  const prodDe = (pid: string) => products.find((p) => String(p.pid) === String(pid)) || null

  // ── Acciones ──
  const onOpen = (pid: string) => {
    const prod = prodDe(pid)
    if (!prod) return
    cd.aplicar(abrirProducto(state, prod))
    if (!inicio) cd.setInicio(Date.now())
    setFocusPid(pid)
    setVista('foco')
  }
  const onBack = (pid: string) => {
    cd.aplicar(volverSinTerminar(state, pid))
    setFocusPid(null)
    setVista('lista')
  }
  const onSet = (pid: string, vid: string, val: string) => cd.aplicar(setCount(state, pid, vid, val))
  const onFinish = async (prod: CdepProducto) => {
    const st = state[prod.pid]
    const sinCargar = prod.variants.filter((v) => (st?.contado[v.vid] ?? null) == null).length
    if (sinCargar) {
      const ok = await confirmar({
        titulo: 'Hay variantes sin cargar',
        tono: 'warning',
        ok: 'Terminar igual',
        mensaje: `Quedan ${sinCargar} ${sinCargar === 1 ? 'variante' : 'variantes'} sin cargar. Al terminar se toman como 0, o sea faltante total contra el sistema.`,
      })
      if (!ok) return
    }
    cd.aplicar(terminarProducto(state, prod, Date.now()))
    setFocusPid(null)
    setVista('lista')
  }
  const onReset = async () => {
    const ok = await confirmar({
      titulo: 'Reiniciar el conteo',
      tono: 'danger',
      ok: 'Eliminar todo',
      mensaje: 'Se elimina todo lo cargado. Los ajustes ya aplicados quedan en el Historial.',
    })
    if (!ok) return
    cd.reset()
    setFocusPid(null)
    setVista('lista')
  }
  const onActualizarGN = async () => {
    const hayContado = Object.values(state).some((s) => Object.keys(s.contado).length)
    if (hayContado) {
      const ok = await confirmar({
        titulo: 'Cargar el stock más nuevo de GN',
        ok: 'Cargar',
        mensaje: 'Lo que ya contaste se mantiene: la diferencia de cada producto queda congelada con el stock de ahora.',
      })
      if (!ok) return
    }
    await cd.traerStock(true)
    setVista('lista')
  }
  const onAplicar = async () => {
    const terminados = products.filter((p) => estadoDe(state, p.pid) === 'terminado')
    if (!terminados.length) {
      await avisar('No hay productos terminados para aplicar.')
      return
    }
    setAplicando(true)
    try {
      const d = await leerInventarioVivo(marca)
      const pv = calcularAjuste(terminados, state, realMap(d.rows || []), d.store_name || 'Deposito Minorista', d.store || marca, stockTime)
      setPreview(pv)
      setVista('preview')
    } catch (e) {
      toast.error('No pude leer el stock vivo de GN: ' + (e as Error).message)
    } finally {
      setAplicando(false)
    }
  }

  const limpiarTerminados = () => {
    const next: CdepState = { ...state }
    products.forEach((p) => {
      if (estadoDe(state, p.pid) === 'terminado') delete next[p.pid]
    })
    cd.aplicar(next)
    if (!Object.values(next).some((s) => Object.keys(s.contado).length)) cd.setInicio(null)
  }

  const onConfirmar = async () => {
    if (!preview || !preview.rows.length) return
    const marcaU = (preview.store || marca).toUpperCase()
    const ok = await confirmar({
      titulo: 'Generar el Excel del ajuste',
      tono: 'warning',
      ok: `Generar el de ${marcaU}`,
      mensaje: (
        <>
          <p>
            Este Excel es de <b>{marcaU}</b>. Subilo <b>solo</b> al Gestión Nube de {marcaU}: si lo subís a la otra marca, GN rechaza los IDs
            (&quot;Inventario no encontrado&quot;).
          </p>
          <div style={{ marginTop: space[3] }}>
            <ConfirmDetalle label="Líneas a ajustar" valor={preview.rows.length} />
            <ConfirmDetalle label="Ubicación" valor={preview.ubicacion || '—'} />
          </div>
        </>
      ),
    })
    if (!ok) return
    try {
      const fecha = new Date().toISOString().slice(0, 10)
      await descargarXlsx(aoaAjuste(preview.rows), {
        archivo: `ajuste_deposito_${preview.store || marca}_${fecha}.xlsx`,
        hoja: 'Worksheet',
        anchos: ANCHOS_AJUSTE,
      })
      try {
        await guardarConteo({ store: preview.store || marca, ubicacion: preview.ubicacion, usuario, fecha_inicio: inicio ? new Date(inicio).toISOString() : null, resumen: preview.resumen, detalle: preview.registro })
        await cd.refrescarUltimos()
      } catch {
        /* si falla el historial, el Excel ya se generó igual */
      }
      toast.ok(`Excel generado (${preview.rows.length} ${preview.rows.length === 1 ? 'línea' : 'líneas'}) y conteo guardado. Subilo a GN → "Importar y Ajustar".`)
      const limpiar = await confirmar({
        titulo: 'Conteo guardado',
        ok: 'Limpiar terminados',
        cancelar: 'Dejarlos',
        mensaje: '¿Limpiamos los productos terminados que se ajustaron, para dejar la lista lista para el próximo conteo?',
      })
      if (limpiar) limpiarTerminados()
      setPreview(null)
      setVista('lista')
    } catch (e) {
      toast.error('Error al generar el Excel: ' + (e as Error).message)
    }
  }

  const onGuardarSinDif = async () => {
    if (!preview) return
    const productos = preview.resumen.productos || []
    if (!productos.length) {
      await avisar('No hay productos para guardar.')
      return
    }
    const marcaU = (preview.store || marca).toUpperCase()
    const ok = await confirmar({
      titulo: 'Guardar el conteo sin ajuste',
      ok: `Guardar ${productos.length}`,
      mensaje: `Se registra el conteo de ${productos.length} ${productos.length === 1 ? 'producto' : 'productos'} de ${marcaU}. Coincidieron con el sistema, así que no se genera Excel.`,
    })
    if (!ok) return
    try {
      await guardarConteo({ store: preview.store || marca, ubicacion: preview.ubicacion, usuario, fecha_inicio: inicio ? new Date(inicio).toISOString() : null, resumen: preview.resumen, detalle: preview.registro })
      await cd.refrescarUltimos()
      toast.ok('Conteo guardado en el historial (sin ajuste)')
      const limpiar = await confirmar({
        titulo: 'Conteo guardado',
        ok: 'Limpiar terminados',
        cancelar: 'Dejarlos',
        mensaje: '¿Limpiamos los productos terminados que se registraron?',
      })
      if (limpiar) limpiarTerminados()
      setPreview(null)
      setVista('lista')
    } catch (e) {
      toast.error('No pude guardar el conteo: ' + (e as Error).message)
    }
  }

  const onHistorial = async () => {
    setVista('historial')
    setHist({ cargando: true, conteos: [], error: null })
    try {
      // Solo conteos de depósito: se filtran los de otras secciones (estándar del Local,
      // fundas de BDI) que comparten la tabla por `store` con su propio `modo`.
      const conteos = (await leerHistorial(marca)).filter((c) => {
        const modo = ((c.resumen || {}) as { modo?: string }).modo
        return !modo || modo === 'deposito'
      })
      setHist({ cargando: false, conteos, error: null })
    } catch (e) {
      setHist({ cargando: false, conteos: [], error: (e as Error).message })
    }
  }

  const solViendo = focusPid ? prodDe(focusPid) : null

  return (
    <>
      <HeaderAcciones>
        <InfoPopover titulo="Conteo de depósito">
          Conteo físico del depósito <b>producto por producto</b>: buscás el producto, cargás a mano cuánto
          hay de cada variante y lo terminás. No es por escaneo.
          <br /><br />
          Al aplicar, el ajuste se calcula con el stock <b>vivo</b> de Gestión Nube más la diferencia que
          contaste, así que las ventas que pasaron durante el conteo no lo ensucian. Queda el historial de
          cada conteo aplicado.
          <br /><br />
          ⚠️ <b>El conteo en curso se guarda en este dispositivo.</b> El que aplique tiene que hacerlo en la
          misma compu o celular donde se contó.
        </InfoPopover>
        {vista === 'lista' && (
          <>
            <Button variant="ghost" tone="danger" onClick={() => void onReset()}>
              Reiniciar
            </Button>
            <Button variant="outline" onClick={() => void onHistorial()}>
              Historial
            </Button>
            <Button variant="outline" onClick={() => void onActualizarGN()} loading={cd.cargando}>
              Cargar stock de GN
            </Button>
          </>
        )}
        {vista === 'foco' && solViendo && (
          <>
            <Button variant="outline" onClick={() => setOrderAsc((v) => !v)} title="Ordenar los modelos">
              {orderAsc ? 'Modelo ↓' : 'Modelo ↑'}
            </Button>
            <Button variant="outline" onClick={() => onBack(solViendo.pid)}>
              ← Volver
            </Button>
            <Button variant="solid" tone="brand" onClick={() => void onFinish(solViendo)}>
              ✓ Terminar producto
            </Button>
          </>
        )}
        {vista === 'preview' && preview && (
          <>
            <Button
              variant="outline"
              onClick={() => {
 setPreview(null)
 setVista('lista')
 }}
 >
 ← Volver</Button>
            {preview.rows.length ? (
              <Button variant="solid" tone="brand" onClick={() => void onConfirmar()}>
                Generar Excel y guardar
              </Button>
            ) : (
              <Button variant="solid" tone="brand" onClick={() => void onGuardarSinDif()}>
                Guardar el conteo igual
              </Button>
            )}
          </>
        )}
        {vista === 'historial' && (
          <Button variant="outline" onClick={() => setVista('lista')}>
            ← Volver al conteo
          </Button>
        )}
      </HeaderAcciones>

      {cd.cargando && !products.length ? (
        <>
          <Notice tone="neutral" icon="⏳" style={{ marginBottom: space[3] }}>
            Cargando el depósito en vivo desde Gestión Nube…
          </Notice>
          <Esqueleto forma="tabla" filas={8} />
        </>
      ) : cd.error ? (
        <Notice tone="danger" icon="⚠">
          <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
            <span>No pude cargar el stock en vivo: {cd.error}</span>
            <Button size="sm" variant="outline" tone="danger" onClick={() => void cd.traerStock()}>
              Reintentar
            </Button>
          </div>
        </Notice>
      ) : vista === 'historial' ? (
        <HistorialConteos hist={hist} titulo="Historial de conteos" conVivo />
      ) : vista === 'preview' && preview ? (
        <PreviewView preview={preview} />
      ) : vista === 'foco' && solViendo ? (
        <Foco prod={solViendo} st={state[solViendo.pid]} orderAsc={orderAsc} onSet={onSet} />
      ) : (
        <Lista
          products={products}
          state={state}
          lastCount={lastCount}
          stockTime={stockTime}
          search={search}
          setSearch={setSearch}
          filtro={filtro}
          setFiltro={setFiltro}
          puedeAplicar={puedeAplicar}
          aplicando={aplicando}
          onOpen={onOpen}
          onAplicar={onAplicar}
        />
      )}
    </>
  )
}

// ── Vista LISTA ──
function Lista({
  products,
  state,
  lastCount,
  stockTime,
  search,
  setSearch,
  filtro,
  setFiltro,
  puedeAplicar,
  aplicando,
  onOpen,
  onAplicar,
}: {
  products: CdepProducto[]
  state: CdepState
  lastCount: Record<string, number>
  stockTime: number | null
  search: string
  setSearch: (v: string) => void
  filtro: Filtro
  setFiltro: (f: Filtro) => void
  puedeAplicar: boolean
  aplicando: boolean
  onOpen: (pid: string) => void
  onAplicar: () => void
}) {
  const [ordenarStock, setOrdenarStock] = useState(false)
  const term = products.filter((p) => estadoDe(state, p.pid) === 'terminado').length
  const prog = products.filter((p) => estadoDe(state, p.pid) === 'en_progreso').length
  const sinPrev = products.filter((p) => ultimoMs(state, lastCount, p.pid) === 0).length
  const sinPrevStock = products.filter((p) => ultimoMs(state, lastCount, p.pid) === 0 && stockSistema(p, state[p.pid]) > 0).length
  const conteados = products.length - sinPrev

  const pasa = (p: CdepProducto) => {
    if (filtro === 'sin_previo') return ultimoMs(state, lastCount, p.pid) === 0
    if (filtro === 'sin_previo_stock') return ultimoMs(state, lastCount, p.pid) === 0 && stockSistema(p, state[p.pid]) > 0
    if (filtro === 'contados') return ultimoMs(state, lastCount, p.pid) > 0
    if (filtro === 'en_progreso') return estadoDe(state, p.pid) === 'en_progreso'
    if (filtro === 'terminado') return estadoDe(state, p.pid) === 'terminado'
    return true
  }
  const q = search.trim().toLowerCase()
  const lista = useMemo(() => {
    const arr = products.filter((p) => (!q || p.name.toLowerCase().includes(q)) && pasa(p))
    if (ordenarStock) arr.sort((a, b) => stockSistema(a, state[a.pid]) - stockSistema(b, state[b.pid]))
    return arr
  }, [products, q, filtro, state, lastCount, ordenarStock]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!products.length) {
    return <EmptyState icon="📦" title="Sin productos en el depósito" hint='Tocá "Cargar stock de GN" para bajar el stock.' dashed />
  }

  return (
    <div>
      <InstructivoConteo
        pasoCarga={
          <>
            Abrí cada producto y cargá <b>lo contado</b> por variante.
          </>
        }
        queAplica="relee el stock vivo de GN y arma el Excel"
      />

      {stockTime && (
        <Notice tone="warning" icon="📸" style={{ marginBottom: space[3] }}>
          <b>Stock de GN traído: {stockLabel(stockTime)}</b> — <b>desde esa hora no despaches nada</b> hasta terminar el conteo. Si volvés a &quot;Cargar stock de GN&quot;, esta hora se actualiza.
        </Notice>
      )}

      <ResumenConteo total={products.length} terminados={term} enProgreso={prog} />

      {puedeAplicar && term > 0 && (
        <Notice tone="success" icon="✔" style={{ marginBottom: space[3] }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
            <span>
              Tenés <b>{term}</b> {term === 1 ? 'producto terminado' : 'productos terminados'}. Generar el ajuste relee el stock vivo de GN y arma el Excel.
            </span>
            <Button size="sm" variant="solid" tone="success" onClick={onAplicar} loading={aplicando}>{aplicando ? 'Leyendo stock vivo…' : 'Generar el ajuste'}</Button>
          </div>
        </Notice>
      )}

      <FilterBar>
        <BuscarInput value={search} onChange={setSearch} placeholder="Buscá un producto (ej: Cover Case)…" />
        <Chips<Filtro>
          value={filtro}
          onChange={setFiltro}
          opciones={[
            { key: 'todos', label: 'Todos', n: products.length },
            { key: 'sin_previo', label: 'Sin conteo previo', n: sinPrev },
            { key: 'sin_previo_stock', label: 'Falta contar (con stock)', n: sinPrevStock, title: 'Los que nunca se contaron y además tienen stock en el sistema' },
            { key: 'contados', label: 'Ya contados', n: conteados },
            { key: 'en_progreso', label: 'En progreso', n: prog },
            { key: 'terminado', label: 'Terminados', n: term },
          ]}
        />
        <Button
          size="sm"
          variant={ordenarStock ? 'soft' : 'ghost'}
          tone={ordenarStock ? 'brand' : 'neutral'}
          onClick={() => setOrdenarStock((v) => !v)}
 title="Ordena por stock del sistema, de menor a mayor: los de poco stock son rápidos de contar"
 >
 {ordenarStock ? '✓ Poco stock primero' : 'Ordenar por stock'}</Button>
      </FilterBar>

      {!lista.length ? (
        <EmptyState icon="🔍" title="No hay productos que coincidan" dashed />
      ) : (
        <>
          <TableWrap maxHeight={620}>
            <THead>
              <Tr>
                <Th>Producto</Th>
                <Th align="center" width={84}>
                  Variantes
                </Th>
                <Th align="center" width={84}>
                  Stock sist.
                </Th>
                <Th align="center" width={150}>
                  Estado
                </Th>
                <Th width={110} />
              </Tr>
            </THead>
            <TBody>
              {lista.slice(0, 400).map((p) => {
                const e = estadoDe(state, p.pid)
                const ult = ultimoMs(state, lastCount, p.pid)
                const stk = stockSistema(p, state[p.pid])
                return (
                  <Tr key={p.pid}>
                    <Td wrap strong>
                      {p.name}
                    </Td>
                    <Td align="center" style={{ color: color.mut2 }}>
                      {p.variants.length}
                    </Td>
                    <Td align="center" style={{ fontWeight: 700, color: stk > 0 ? color.ink : color.mut2 }}>
                      {stk}
                    </Td>
                    <Td align="center" tall>
                      <ChipEstado e={e} />
                      <div style={{ fontSize: font.xs, color: ult ? color.mut : color.mut2, marginTop: 3 }}>{ult ? `Último: ${fechaLabel(ult)}` : 'Sin conteo previo'}</div>
                    </Td>
                    <Td align="right">
                      <Button size="sm" variant={e === 'sin_iniciar' ? 'solid' : 'outline'} tone="brand" onClick={() => onOpen(p.pid)}>
                        {e === 'terminado' ? 'Ver / editar' : e === 'en_progreso' ? 'Seguir' : 'Contar'}
                      </Button>
                    </Td>
                  </Tr>
                )
              })}
            </TBody>
          </TableWrap>
          {lista.length > 400 && (
            <p style={{ fontSize: font.sm, color: color.mut, marginTop: space[2] }}>
              Mostrando 400 de {lista.length}. Afiná la búsqueda.
            </p>
          )}
        </>
      )}
    </div>
  )
}

// ── Vista FOCO ──
function Foco({ prod, st, orderAsc, onSet }: { prod: CdepProducto; st: CdepState[string] | undefined; orderAsc: boolean; onSet: (pid: string, vid: string, val: string) => void }) {
  const vars = useMemo(() => {
    const v = prod.variants.slice().sort((a, b) => ordenarModelo(a.size, b.size))
    return orderAsc ? v : v.reverse()
  }, [prod, orderAsc])
  const contado = st?.contado || {}
  const snap = st?.snap || {}
  const sinCargar = vars.filter((v) => contado[v.vid] == null).length

  return (
    <div>
      <h2 style={{ fontSize: font.lg, fontWeight: 700, color: color.ink, marginBottom: space[2] }}>{prod.name}</h2>
      <p style={{ fontSize: font.sm, color: color.mut, marginBottom: space[3] }}>
        Cargá la cantidad física de cada variante. Las que dejes en blanco cuentan como <b>0</b> al terminar.
        {sinCargar ? <b style={{ color: color.warningInk }}> {sinCargar} sin cargar.</b> : null}
      </p>

      <TableWrap>
        <THead>
          <Tr>
            <Th>Variante</Th>
            <Th align="center" width={80}>
              Sistema
            </Th>
            <Th align="center" width={96}>
              Físico
            </Th>
            <Th align="center" width={64}>
              Dif
            </Th>
          </Tr>
        </THead>
        <TBody>
          {vars.map((v) => {
            const sis = snap[v.vid] != null ? snap[v.vid] : v.esperado
            const con = contado[v.vid]
            const dif = con == null ? null : con - sis
            const difCol = dif == null ? color.mut2 : dif === 0 ? color.successInk : dif < 0 ? color.dangerInk : color.warningInk
            return (
              <Tr key={v.vid}>
                <Td strong>{v.size}</Td>
                <Td align="center" style={{ color: color.mut2 }}>
                  {sis}
                </Td>
                <Td align="center" tall>
                  <input
                    className="mo-input mo-input--num"
                    type="number"
                    min={0}
                    inputMode="numeric"
                    defaultValue={con != null ? con : ''}
                    placeholder="—"
                    aria-label={`Contado de ${v.size}`}
                    onChange={(e) => onSet(prod.pid, v.vid, e.target.value)}
                    style={{ width: 72, textAlign: 'center', padding: '0 6px', fontWeight: 700 }}
                  />
                </Td>
                <Td align="center" style={{ fontWeight: 700, color: difCol }}>
                  {dif == null ? '—' : (dif > 0 ? '+' : '') + dif}
                </Td>
              </Tr>
            )
          })}
        </TBody>
      </TableWrap>
    </div>
  )
}

// ── Vista PREVIEW ──
function PreviewView({ preview }: { preview: Preview }) {
  const { rows, resumen, missing } = preview
  const marcaU = (preview.store || '').toUpperCase()
  return (
    <div>
      <h2 style={{ fontSize: font.lg, fontWeight: 700, color: color.ink, marginBottom: space[3] }}>Revisión del ajuste</h2>

      <Notice tone="brand" icon="🏷️" style={{ marginBottom: space[3] }}>
        Ajuste de <b>{marcaU}</b> · ubicación <b>{preview.ubicacion || '—'}</b>. El Excel se sube <b>solo</b> al GN de {marcaU}: no mezclar marcas.
      </Notice>

      <p style={{ fontSize: font.base, color: color.ink2, marginBottom: space[3] }}>
        Se ajustan <b>{resumen.lineas}</b> {resumen.lineas === 1 ? 'variante' : 'variantes'}: <b style={{ color: color.warningInk }}>{resumen.mas}</b> con sobrante (+) y{' '}
        <b style={{ color: color.dangerInk }}>{resumen.menos}</b> con faltante (−) · <b>{resumen.unidades_ajustadas}</b> u. de diferencia. El resto no se toca.
      </p>

      {missing.length > 0 && (
        <Notice tone="danger" icon="⚠" style={{ marginBottom: space[3] }}>
          {missing.length} {missing.length === 1 ? 'variante' : 'variantes'} con diferencia <b>NO se ajustan</b>: no se pudo confirmar su stock en vivo. <b>Revisalas a mano.</b> Son:{' '}
          {missing.slice(0, 5).map((m) => m.prod + ' · ' + m.size).join(' / ')}
          {missing.length > 5 ? '…' : ''}
        </Notice>
      )}

      {!rows.length ? (
        <Notice tone="success" icon="🎉">
          No hay diferencias para ajustar: lo contado coincide con el sistema. Guardalo igual, así queda registrada la fecha del conteo.
        </Notice>
      ) : (
        <>
          <TableWrap maxHeight="52vh">
            <THead>
              <Tr>
                <Th>Producto · Variante</Th>
                <Th align="center">Sistema</Th>
                <Th align="center">Contado</Th>
                <Th align="center">Dif</Th>
                <Th align="center">Vivo GN</Th>
                <Th align="center">→ Nuevo</Th>
              </Tr>
            </THead>
            <TBody>
              {rows.map((r, i) => (
                <Tr key={i}>
                  <Td wrap>
                    {r.producto} · {r.variante}
                  </Td>
                  <Td align="center" style={{ color: color.mut2 }}>
                    {r.sistema != null ? r.sistema : '—'}
                  </Td>
                  <Td align="center">{r.contado != null ? r.contado : '—'}</Td>
                  <Td align="center" style={{ fontWeight: 700, color: r.dif < 0 ? color.dangerInk : color.warningInk }}>
                    {r.dif > 0 ? '+' : ''}
                    {r.dif}
                  </Td>
                  <Td align="center" style={{ color: color.mut }}>
                    {r.vivo}
                  </Td>
                  <Td align="center" style={{ fontWeight: 700, color: color.brand }}>
                    {r.nuevo}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </TableWrap>
          <p style={{ fontSize: font.sm, color: color.mut, marginTop: space[2] }}>Después subí el Excel a GN → &quot;Importar y Ajustar&quot;.</p>
        </>
      )}
    </div>
  )
}
