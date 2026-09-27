'use client'

import { useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useSesion } from '@/components/SesionProvider'
import { esAdmin, puedeSub } from '@/lib/permisos'
import { leerInventarioVivo, leerVivoProductos } from '@/lib/inventario-vivo/cliente'
import { realMap } from '@/lib/inventario-vivo/core'
import { ANCHOS_AJUSTE, aoaAjuste } from '@/lib/conteo-deposito/core'
import { descargarXlsx } from '@/lib/excel'
import { guardarConteo, leerHistorial } from '@/lib/conteo-deposito/cliente'
import type { ConteoHistorial } from '@/lib/conteo-deposito/tipos'
import {
  abrir,
  calcularAjuste,
  cargarDeposito,
  escanear,
  estadoDe,
  normBc,
  planTerminarGrupo,
  resolverScan,
  sistemaDe,
  totalEscaneados,
  setDeposito,
  setExhibido,
  terminar,
  terminarVarios,
  ultimoMs,
  volverSinTerminar,
} from '@/lib/conteo-estandar/core'
import type { CePreview, CeProducto, CeState, Linea } from '@/lib/conteo-estandar/tipos'
import { ordenarModelo } from '@/lib/conteo-deposito/core'
import { useConteoEstandar } from './useConteoEstandar'
import { avisar as avisarSonido, prepararSonido } from '@/lib/sonido'
import { enPalabras } from '@/lib/exhib/aviso'
import { DepositoLocal } from './DepositoLocal'
import { ReporteColgar } from './ReporteColgar'
import { HeaderAcciones } from '@/components/layout/acciones'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { ChipEstado, HistorialConteos, InstructivoConteo, ResumenConteo, fechaLabel, stockLabel } from '@/components/conteos/comunes'
import {
  Badge,
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

type Vista = 'lista' | 'foco' | 'preview' | 'historial' | 'deposito' | 'colgar'
type Filtro = 'todos' | 'sin_previo' | 'contados' | 'en_progreso' | 'terminado'
type Feedback = { tipo: 'ok' | 'error' | 'warn'; texto: string; size?: string; count?: number; total?: number }

// Fuera del componente: el lint de pureza marca `Date.now()` adentro de un handler que se pasa por props.
const ahora = () => Date.now()

const lineaLabel = (l: Linea) => (l === 'stunned' ? '👕 Stunned' : 'Zattia')

/**
 * Conteo estándar del Local (Zattia / Stunned).
 *
 * Flujo: escanear lo exhibido con el lector + cargar el depósito local a mano, terminar
 * producto por producto, y al final aplicar el ajuste (relee el stock vivo del Local y
 * genera el Excel para GN → "Importar y Ajustar"). La lógica vive en
 * `lib/conteo-estandar/core.ts` y no se toca.
 *
 * ── Rediseño jul-2026 (patrón Flujo operativo, mobile-first) ──
 * Es la pantalla que más se usa con el teléfono o la tablet en la mano, y la que más
 * riesgo tiene: si alguien sale sin terminar, el conteo no se guarda. Cambios:
 *
 * - Las acciones de cada vista van al header, siempre en el mismo lugar (antes cada
 *   sub-vista se armaba su propia fila de botones donde le tocaba).
 * - Los ocho `confirm/alert` nativos pasan a diálogos del kit, con el detalle de lo que
 *   se va a hacer a la vista. Dos de ellos —"quedan N talles sin tocar, se toman como 0"
 *   y "el Excel es del Local de X, subilo SOLO al GN de X"— son advertencias serias que
 *   en un `confirm()` del navegador se leen como spam y se aceptan sin mirar.
 * - En el teléfono: el campo de escaneo ocupa el ancho, los inputs de cantidad tienen
 *   tamaño de dedo y teclado numérico, y la tabla del foco entra en una mano.
 */
export function ConteoEstandar() {
  const params = useParams()
  const seg = Array.isArray(params.seccion) ? params.seccion[0] : params.seccion
  const linea: Linea = seg === 'conteo-estandar-stunned' ? 'stunned' : 'zattia'

  const { marca, perfil } = useSesion()
  const { confirmar, avisar } = useConfirmar()
  const toast = useToast()
  const usuario = perfil?.name || ''
  const puedeAplicar = esAdmin(perfil) || puedeSub(perfil, marca, `conteo-estandar-${linea}`, 'aplicar')
  const ce = useConteoEstandar(marca, linea)
  const { products, byBc, state, inicio, stockTime, lastCount } = ce

  const [vista, setVista] = useState<Vista>('lista')
  const [focusPid, setFocusPid] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [orderAsc, setOrderAsc] = useState(true)
  const [preview, setPreview] = useState<CePreview | null>(null)
  const [aplicando, setAplicando] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [hist, setHist] = useState<{ cargando: boolean; conteos: ConteoHistorial[]; error: string | null }>({ cargando: false, conteos: [], error: null })
  const scanRef = useRef<HTMLInputElement>(null)

  const prodDe = (pid: string) => products.find((p) => String(p.pid) === String(pid)) || null
  const solViendo = focusPid ? prodDe(focusPid) : null

  const onScan = (raw: string) => {
    const bc = normBc(raw)
    if (!bc) return
    const vid = resolverScan(byBc, raw)
    if (!vid) {
      setFeedback({ tipo: 'error', texto: 'Código desconocido: ' + bc + ' — pasala de nuevo' })
      avisarSonido('no', 'de nuevo')
      return
    }
    const pid = vid.split('_')[0]
    const prod = prodDe(pid)
    if (!prod) return
    if (prod.linea !== linea) {
      setFeedback({ tipo: 'warn', texto: `${prod.name} es de la línea ${lineaLabel(prod.linea)}, no de ${lineaLabel(linea)}.` })
      avisarSonido('mira', 'otra línea')
      return
    }
    const next = escanear(state, prod, vid)
    ce.aplicar(next)
    if (!inicio) ce.setInicio(Date.now())
    const v = prod.variants.find((x) => x.vid === vid)
    const count = next[pid].exhibido[vid]
    const total = totalEscaneados(next, products, linea)
    setFeedback({ tipo: 'ok', texto: prod.name, size: v?.size, count, total })
    // La misma regla que el Chequeo de exhibición (`lib/exhib/aviso.ts`): entró = pitido corto + el
    // TOTAL del recorrido, que sube siempre (también en el repetido: es una prenda más que pasó por
    // el lector). ⛔ No se canta cuántas van del talle: con 400 prendas eran 400 «uno».
    avisarSonido('ok', enPalabras(total))
    scanRef.current?.focus()
  }

  const onOpen = (pid: string, desde: 'lista' | 'deposito' = 'lista') => {
    const prod = prodDe(pid)
    if (!prod) return
    setVolverA(desde)
    ce.aplicar(abrir(state, prod))
    if (!inicio) ce.setInicio(ahora())
    setFocusPid(pid)
    setVista('foco')
  }
  // Desde el foco se vuelve a la vista de donde se abrió (la lista o el depósito del local).
  const [volverA, setVolverA] = useState<'lista' | 'deposito'>('lista')
  const onBack = (pid: string) => {
    ce.aplicar(volverSinTerminar(state, pid))
    setFocusPid(null)
    setVista(volverA)
  }
  const onDepLocal = (prod: CeProducto, vid: string, val: string) => {
    ce.aplicar(cargarDeposito(state, prod, vid, val))
    if (!inicio) ce.setInicio(Date.now())
  }
  const onTerminarGrupo = async (productos: CeProducto[], grupo: string) => {
    const plan = planTerminarGrupo(state, productos)
    const faltan = plan.sinCargarConStock
    if (!plan.aTerminar.length && !faltan.length) {
      await avisar(`En ${grupo} no hay productos para terminar.`)
      return
    }
    if (plan.aTerminar.length) {
      const ok = await confirmar({
        titulo: `Terminar ${grupo}`,
        tono: plan.blancosConStock.length ? 'warning' : undefined,
        ok: `Terminar ${plan.aTerminar.length}`,
        mensaje: (
          <>
            <p>
              Se terminan <b>{plan.aTerminar.length}</b> {plan.aTerminar.length === 1 ? 'producto' : 'productos'} con algo cargado.
            </p>
            {plan.blancosConStock.length > 0 && (
              <>
                <p style={{ marginTop: space[2] }}>
                  ⚠️ {plan.blancosConStock.length === 1 ? 'Este talle quedó' : 'Estos talles quedaron'} en blanco y el sistema dice que hay: <b>van a quedar en 0</b>.
                </p>
                <ul style={{ marginTop: space[1], paddingLeft: 18, fontSize: font.sm }}>
                  {plan.blancosConStock.slice(0, 25).map((x, i) => (
                    <li key={i}>
                      {x.producto} · <b>{x.talle}</b> — el sistema dice {x.sistema}
                    </li>
                  ))}
                  {plan.blancosConStock.length > 25 && <li>y {plan.blancosConStock.length - 25} más</li>}
                </ul>
              </>
            )}
          </>
        ),
      })
      if (!ok) return
    }
    // 🔑 Lo que el sistema dice que hay y nadie cargó: contando el local entero, casi siempre es que
    // no está (Bruno, 27-sep-2026). Ponerlo en 0 es una DECISIÓN aparte y explícita: cerrar el
    // cartel lo deja como está, así nada se pone en 0 sin que alguien lo haya elegido.
    let enCero: CeProducto[] = []
    if (faltan.length) {
      const unidades = faltan.reduce((n, p) => n + p.variants.reduce((m, v) => m + Math.max(0, v.esperado), 0), 0)
      const negativos = faltan.filter((p) => p.variants.some((v) => v.esperado < 0)).length
      const cero = await confirmar({
        titulo: `${faltan.length} ${faltan.length === 1 ? 'producto' : 'productos'} de ${grupo} sin cargar`,
        tono: 'warning',
        ok: 'Ponerlos en 0',
        cancelar: 'Dejarlos como están',
        mensaje: (
          <>
            <p>
              El sistema dice que {faltan.length === 1 ? 'tiene' : 'tienen'} stock (<b>{unidades}</b> {unidades === 1 ? 'unidad' : 'unidades'} en total
              {negativos ? <>, y <b>{negativos}</b> con stock negativo</> : null}) y no se les cargó nada, ni en el salón ni en el depósito.
            </p>
            <p style={{ marginTop: space[2] }}>
              Si los buscaste y no están, <b>ponelos en 0</b>: se terminan como faltantes y el ajuste los descuenta. Si no los buscaste todavía, dejalos como están.
            </p>
            <p style={{ marginTop: space[2], fontSize: font.sm, color: color.mut }}>
              {faltan.slice(0, 12).map((p) => p.name).join(' · ')}
              {faltan.length > 12 ? ` y ${faltan.length - 12} más` : ''}
            </p>
          </>
        ),
      })
      if (cero) enCero = faltan
    }
    const cerrar = [...plan.aTerminar, ...enCero]
    if (!cerrar.length) return
    ce.aplicar(terminarVarios(state, cerrar, Date.now()))
    toast.ok(
      `${grupo}: ${cerrar.length} ${cerrar.length === 1 ? 'producto terminado' : 'productos terminados'}` +
        (enCero.length ? ` (${enCero.length} en 0)` : ''),
    )
  }
  const onFinish = async (prod: CeProducto) => {
    const st = state[prod.pid]
    // Sólo avisa por los blancos con stock en el sistema: un blanco con sistema 0 no cambia nada.
    const blancos = prod.variants.filter((v) => !(st && ((st.exhibido[v.vid] || 0) > 0 || st.deposito[v.vid] != null)) && sistemaDe(st, v) !== 0)
    if (blancos.length) {
      const ok = await confirmar({
        titulo: 'Hay talles en blanco con stock',
        tono: 'warning',
        ok: 'Terminar igual',
        mensaje: `Van a quedar en 0: ${blancos.map((v) => `${v.size} (el sistema dice ${sistemaDe(st, v)})`).join(', ')}.`,
      })
      if (!ok) return
    }
    ce.aplicar(terminar(state, prod, Date.now()))
    setFocusPid(null)
    setVista(volverA)
  }
  const onReset = async () => {
    const ok = await confirmar({
      titulo: 'Reiniciar el conteo del Local',
      tono: 'danger',
      ok: 'Eliminar todo',
      mensaje: 'Se elimina todo lo cargado, de Zattia y de Stunned. Los ajustes ya aplicados quedan en el Historial.',
    })
    if (!ok) return
    ce.reset()
    setFocusPid(null)
    setVista('lista')
  }
  const onActualizarGN = async () => {
    const hay = Object.values(state).some((s) => Object.keys(s.exhibido).length || Object.keys(s.deposito).length)
    if (hay) {
      const ok = await confirmar({
        titulo: 'Cargar el stock más nuevo del Local',
        ok: 'Cargar',
        mensaje: 'Lo que ya contaste se mantiene: la diferencia contra el sistema queda congelada con el stock de ahora.',
      })
      if (!ok) return
    }
    await ce.traerStock(true)
    setVista('lista')
  }
  const onAplicar = async () => {
    const terminados = products.filter((p) => p.linea === linea && estadoDe(state, p.pid) === 'terminado')
    if (!terminados.length) {
      await avisar('No hay productos terminados de esta línea para aplicar.')
      return
    }
    setAplicando(true)
    try {
      const d = await leerInventarioVivo(marca, 'local')
      const vivo = realMap(d.rows || [])
      // Lo que la lectura completa no confirmó (vino del espejo, sin inventory_id) se pide producto
      // por producto, que es la consulta de GN que sí contesta bien.
      const faltan = new Set<string>()
      terminados.forEach((p) =>
        p.variants.forEach((v) => {
          const dif = state[String(p.pid)]?.dif?.[v.vid]
          const live = vivo[v.vid]
          if (dif && (!live || live.inventory_id == null)) faltan.add(String(p.pid))
        }),
      )
      if (faltan.size) {
        const extra = await leerVivoProductos(marca, 'local', [...faltan])
        extra.forEach((r) => {
          if (r.inventory_id != null) vivo[r.product_id + '_' + r.size_id] = r
        })
      }
      const pv = calcularAjuste(terminados, state, vivo, d.store_name || 'Local', d.store || marca, stockTime, linea)
      setPreview(pv)
      setVista('preview')
    } catch (e) {
      toast.error('No pude leer el stock vivo del Local: ' + (e as Error).message)
    } finally {
      setAplicando(false)
    }
  }

  const limpiarTerminados = () => {
    const next: CeState = { ...state }
    products
      .filter((p) => p.linea === linea)
      .forEach((p) => {
        if (estadoDe(state, p.pid) === 'terminado') delete next[p.pid]
      })
    ce.aplicar(next)
    if (!Object.values(next).some((s) => Object.keys(s.exhibido).length || Object.keys(s.deposito).length)) ce.setInicio(null)
  }

  const onConfirmar = async () => {
    if (!preview || !preview.rows.length) return
    const marcaU = (preview.store || marca).toUpperCase()
    const ok = await confirmar({
      titulo: 'Generar el Excel del ajuste',
      tono: 'warning',
      ok: 'Generar Excel',
      mensaje: (
        <>
          <p>
            Este ajuste es del <b>Local de {marcaU}</b> ({lineaLabel(linea)}). Subilo <b>solo</b> al Gestión Nube de {marcaU}: en el de la otra
            marca descuadra el stock.
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
        archivo: `ajuste_local_${preview.store || marca}_${linea}_${fecha}.xlsx`,
        hoja: 'Worksheet',
        anchos: ANCHOS_AJUSTE,
      })
      // 🔴 El Excel ya salió; si el historial falla, antes se tragaba el error en silencio y el
      // reporte «Para colgar» quedaba con el guardado anterior sin que nadie lo supiera (conteo de
      // jeans, 27-sep-2026). Ahora se avisa y se puede reintentar, y no se ofrece limpiar: limpiar
      // sin haber guardado es perder el conteo.
      let guardado = false
      for (;;) {
        try {
          await guardarConteo({ store: preview.store || marca, ubicacion: preview.ubicacion, usuario, fecha_inicio: inicio ? new Date(inicio).toISOString() : null, resumen: preview.resumen, detalle: preview.registro })
          guardado = true
          break
        } catch (e) {
          const otra = await confirmar({
            titulo: 'El conteo NO quedó guardado',
            tono: 'danger',
            ok: 'Reintentar',
            cancelar: 'Seguir sin guardar',
            mensaje: `El Excel se generó bien, pero no se pudo guardar en el historial (${(e as Error).message}). Sin guardar, el reporte «Para colgar» y el historial no lo van a tener.`,
          })
          if (!otra) break
        }
      }
      if (!guardado) {
        toast.error('Excel generado, pero el conteo no quedó guardado en el historial.')
        return
      }
      await ce.refrescarUltimos()
      toast.ok(`Excel generado (${preview.rows.length} ${preview.rows.length === 1 ? 'línea' : 'líneas'}) y conteo guardado. Subilo a GN → "Importar y Ajustar".`)
      const limpiar = await confirmar({
        titulo: 'Conteo guardado',
        ok: 'Limpiar terminados',
        cancelar: 'Dejarlos',
        mensaje: `¿Limpiamos los productos terminados de ${lineaLabel(linea)} para dejar la lista lista para el próximo conteo?`,
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
    const ok = await confirmar({
      titulo: 'Guardar el conteo sin ajuste',
      ok: `Guardar ${productos.length}`,
      mensaje: `Se registra el conteo de ${productos.length} ${productos.length === 1 ? 'producto' : 'productos'} de ${lineaLabel(linea)}. No hay diferencias, así que no se genera Excel.`,
    })
    if (!ok) return
    try {
      await guardarConteo({ store: preview.store || marca, ubicacion: preview.ubicacion, usuario, fecha_inicio: inicio ? new Date(inicio).toISOString() : null, resumen: preview.resumen, detalle: preview.registro })
      await ce.refrescarUltimos()
      toast.ok('Conteo guardado en el historial (sin ajuste)')
      const limpiar = await confirmar({
        titulo: 'Conteo guardado',
        ok: 'Limpiar terminados',
        cancelar: 'Dejarlos',
        mensaje: '¿Limpiamos los productos terminados de esta línea?',
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
      const conteos = (await leerHistorial(marca)).filter((c) => {
        const rr = (c.resumen || {}) as { modo?: string; linea?: string }
        return rr.modo === 'estandar' && rr.linea === linea
      })
      setHist({ cargando: false, conteos, error: null })
    } catch (e) {
      setHist({ cargando: false, conteos: [], error: (e as Error).message })
    }
  }

  return (
    <>
      <HeaderAcciones>
        <InfoPopover titulo={`Conteo del local — ${lineaLabel(linea)}`}>
          Conteo físico del <b>local</b>, por producto y talle, de la línea <b>{lineaLabel(linea)}</b>: los
          productos de la otra línea no entran en este conteo aunque los escanees.
          <br /><br />
          Lo <b>exhibido</b> se escanea (cada lectura suma 1) y el <b>depósito del local</b> se carga a mano;
          el total de los dos es lo que se compara contra el stock del Local. El ajuste se calcula con el
          stock <b>vivo</b> de Gestión Nube más la diferencia, así las ventas del rato no lo ensucian.
          <br /><br />
          ⚠️ <b>El conteo en curso se guarda en este dispositivo</b>, y el Excel que sale va{' '}
          <b>solo al Gestión Nube de esta marca</b>.
        </InfoPopover>
        {vista === 'lista' && (
          <>
            <Button variant="ghost" tone="danger" onClick={() => void onReset()}>
              Reiniciar
            </Button>
            <Button variant="outline" onClick={() => void onHistorial()}>
              Historial
            </Button>
            <Button variant="outline" onClick={() => setVista('deposito')}>
              ✍️ Depósito del local
            </Button>
            <Button variant="outline" onClick={() => setVista('colgar')}>
              🧥 Para colgar
            </Button>
            <Button variant="outline" onClick={() => void onActualizarGN()} loading={ce.cargando}>
              Cargar stock de GN
            </Button>
          </>
        )}
        {vista === 'foco' && solViendo && (
          <>
            <Button variant="outline" onClick={() => setOrderAsc((v) => !v)}>
              {orderAsc ? 'Talle ↓' : 'Talle ↑'}
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
        {(vista === 'deposito' || vista === 'colgar') && (
          <Button variant="outline" onClick={() => setVista('lista')}>
            ← Volver a la lista
          </Button>
        )}
        {vista === 'historial' && (
          <Button variant="outline" onClick={() => setVista('lista')}>
            ← Volver al conteo
          </Button>
        )}
      </HeaderAcciones>

      {ce.cargando && !products.length ? (
        <>
          <Notice tone="neutral" icon="⏳" style={{ marginBottom: space[3] }}>
            Cargando el Local en vivo desde Gestión Nube…
          </Notice>
          <Esqueleto forma="tabla" filas={8} />
        </>
      ) : ce.error ? (
        <Notice tone="danger" icon="⚠">
          <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
            <span>No pude cargar el Local en vivo: {ce.error}</span>
            <Button size="sm" variant="outline" tone="danger" onClick={() => void ce.traerStock()}>
              Reintentar
            </Button>
          </div>
        </Notice>
      ) : vista === 'historial' ? (
        <HistorialConteos hist={hist} titulo={`Historial · ${lineaLabel(linea)}`} unidad="Talle" />
      ) : vista === 'colgar' ? (
        <ReporteColgar marca={marca} linea={linea} feed={products} lineaLabel={lineaLabel(linea)} />
      ) : vista === 'deposito' ? (
        <DepositoLocal
          products={products.filter((p) => p.linea === linea)}
          state={state}
          onDep={onDepLocal}
          onTerminarGrupo={(ps, g) => void onTerminarGrupo(ps, g)}
          onAbrir={(pid) => onOpen(pid, 'deposito')}
        />
      ) : vista === 'preview' && preview ? (
        <PreviewView preview={preview} linea={linea} />
      ) : vista === 'foco' && solViendo ? (
        <>
          <ScanBox scanRef={scanRef} feedback={feedback} onScan={onScan} />
          <Foco
            prod={solViendo}
            st={state[solViendo.pid]}
            orderAsc={orderAsc}
            onExhib={(pid, vid, val) => ce.aplicar(setExhibido(state, pid, vid, val))}
            onDep={(pid, vid, val) => ce.aplicar(setDeposito(state, pid, vid, val))}
          />
        </>
      ) : (
        <>
          <ScanBox scanRef={scanRef} feedback={feedback} onScan={onScan} />
          <Lista
            products={products}
            state={state}
            lastCount={lastCount}
            linea={linea}
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
        </>
      )}
    </>
  )
}

/**
 * La caja de escaneo. Es lo único que se mira mientras se cuenta, así que el resultado
 * del último escaneo se lee de lejos y con el color del tono; el pitido y la vibración
 * los sigue haciendo el handler.
 */
function ScanBox({ scanRef, feedback, onScan }: { scanRef: React.RefObject<HTMLInputElement | null>; feedback: Feedback | null; onScan: (v: string) => void }) {
  const t =
    feedback?.tipo === 'ok'
      ? { bg: color.successBg, fg: color.successInk, bd: color.successBorder }
      : feedback?.tipo === 'error'
        ? { bg: color.dangerBg, fg: color.dangerInk, bd: color.dangerBorder }
        : feedback?.tipo === 'warn'
          ? { bg: color.warningBg, fg: color.warningInk, bd: color.warningBorder }
          : { bg: color.bg, fg: color.mut2, bd: color.line }
  return (
    <div style={{ marginBottom: space[3] }}>
      <input
        ref={scanRef}
        onFocus={() => prepararSonido()}
        onClick={() => prepararSonido()}
        className="mo-input"
        type="text"
        autoComplete="off"
        placeholder="Escaneá lo EXHIBIDO (suma 1)…"
        aria-label="Código de barras a escanear"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            const v = e.currentTarget.value
            e.currentTarget.value = ''
            onScan(v)
          }
        }}
        style={{ height: 48, fontSize: 16, borderWidth: 2, borderColor: color.brandSolid }}
      />
      <div
        style={{
          marginTop: space[2],
          padding: space[4],
          border: `1px solid ${t.bd}`,
          borderRadius: 'var(--mo-r-xl)',
          fontSize: font.md,
          textAlign: 'center',
          background: t.bg,
          color: t.fg,
        }}
        role="status"
      >
        {!feedback ? (
          'Escaneá un producto para empezar…'
        ) : feedback.tipo === 'ok' ? (
          <>
            ✓ <b style={{ fontSize: 20 }}>{feedback.texto}</b>
            {feedback.size ? (
              <>
                {' · '}
                <b>{feedback.size}</b>
              </>
            ) : null}
            <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.1, marginTop: 4 }}>{feedback.total}</div>
            <div style={{ fontSize: font.sm }}>escaneadas en total{feedback.count && feedback.count > 1 ? ` · de este talle van ${feedback.count}` : ''}</div>
          </>
        ) : (
          (feedback.tipo === 'error' ? '❓ ' : '⚠️ ') + feedback.texto
        )}
      </div>
    </div>
  )
}

function Lista({
  products,
  state,
  lastCount,
  linea,
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
  products: CeProducto[]
  state: CeState
  lastCount: Record<string, number>
  linea: Linea
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
  const dela = products.filter((p) => p.linea === linea)
  const term = dela.filter((p) => estadoDe(state, p.pid) === 'terminado').length
  const prog = dela.filter((p) => estadoDe(state, p.pid) === 'en_progreso').length
  const sinPrev = dela.filter((p) => ultimoMs(state, lastCount, p.pid) === 0).length

  const pasa = (p: CeProducto) => {
    if (filtro === 'sin_previo') return ultimoMs(state, lastCount, p.pid) === 0
    if (filtro === 'contados') return ultimoMs(state, lastCount, p.pid) > 0
    if (filtro === 'en_progreso') return estadoDe(state, p.pid) === 'en_progreso'
    if (filtro === 'terminado') return estadoDe(state, p.pid) === 'terminado'
    return true
  }
  const q = search.trim().toLowerCase()
  const lista = useMemo(() => dela.filter((p) => (!q || p.name.toLowerCase().includes(q)) && pasa(p)), [dela, q, filtro, state, lastCount]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!products.length) {
    return <EmptyState icon="📦" title="Sin productos en el Local" hint='Tocá "Cargar stock de GN" para bajar el stock del Local.' dashed />
  }

  return (
    <div>
      <p style={{ fontSize: font.sm, color: color.mut, marginBottom: space[3] }}>
        Línea: <b style={{ color: color.ink2 }}>{lineaLabel(linea)}</b>. El escaneo solo suma dentro de esta línea; el depósito del local se carga a mano en <b>✍️ Depósito del local</b>, en el orden del estante.
      </p>

      <InstructivoConteo
        pasoCarga={
          <>
            Por cada producto: escaneá lo <b>exhibido</b> y cargá el <b>depósito</b> a mano.
          </>
        }
        queAplica="relee el stock vivo del Local y arma el Excel"
      />

      {stockTime && (
        <Notice tone="warning" icon="📸" style={{ marginBottom: space[3] }}>
          <b>Stock del Local traído: {stockLabel(stockTime)}</b> — arrancá con los pedidos al día. Si volvés a &quot;Cargar stock de GN&quot;, esta hora se actualiza.
        </Notice>
      )}

      <ResumenConteo total={dela.length} terminados={term} enProgreso={prog} />

      {puedeAplicar && term > 0 && (
        <Notice tone="success" icon="✔" style={{ marginBottom: space[3] }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
            <span>
              Tenés <b>{term}</b> {term === 1 ? 'producto terminado' : 'productos terminados'} de {lineaLabel(linea)}. Generar el ajuste relee el stock vivo del Local y arma el Excel.
            </span>
            <Button size="sm" variant="solid" tone="success" onClick={onAplicar} loading={aplicando}>{aplicando ? 'Leyendo stock vivo…' : 'Generar el ajuste'}</Button>
          </div>
        </Notice>
      )}

      <FilterBar>
        <BuscarInput value={search} onChange={setSearch} placeholder="Buscá un producto…" />
        <Chips<Filtro>
          value={filtro}
          onChange={setFiltro}
          opciones={[
            { key: 'todos', label: 'Todos', n: dela.length },
            { key: 'sin_previo', label: 'Sin conteo previo', n: sinPrev },
            { key: 'contados', label: 'Ya contados', n: dela.length - sinPrev },
            { key: 'en_progreso', label: 'En progreso', n: prog },
            { key: 'terminado', label: 'Terminados', n: term },
          ]}
        />
      </FilterBar>

      {!lista.length ? (
        <EmptyState icon="🔍" title="No hay productos que coincidan" dashed />
      ) : (
        <>
          <TableWrap maxHeight={620}>
            <THead>
              <Tr>
                <Th>Producto</Th>
                <Th align="center" width={80}>
                  Talles
                </Th>
                <Th align="center" width={150}>
                  Estado
                </Th>
                <Th width={110} />
              </Tr>
            </THead>
            <TBody>
              {lista.slice(0, 500).map((p) => {
                const e = estadoDe(state, p.pid)
                const ult = ultimoMs(state, lastCount, p.pid)
                return (
                  <Tr key={p.pid}>
                    <Td wrap strong>
                      {p.name}
                    </Td>
                    <Td align="center" style={{ color: color.mut2 }}>
                      {p.variants.length}
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
          {lista.length > 500 && (
            <p style={{ fontSize: font.sm, color: color.mut, marginTop: space[2] }}>
              Mostrando 500 de {lista.length}. Afiná la búsqueda.
            </p>
          )}
        </>
      )}
    </div>
  )
}


function Foco({
  prod,
  st,
  orderAsc,
  onExhib,
  onDep,
}: {
  prod: CeProducto
  st: CeState[string] | undefined
  orderAsc: boolean
  onExhib: (pid: string, vid: string, val: string) => void
  onDep: (pid: string, vid: string, val: string) => void
}) {
  const vars = useMemo(() => {
    const v = prod.variants.slice().sort((a, b) => ordenarModelo(a.size, b.size))
    return orderAsc ? v : v.reverse()
  }, [prod, orderAsc])
  const exhibido = st?.exhibido || {}
  const deposito = st?.deposito || {}
  const snap = st?.snap || {}
  const sinCargar = vars.filter((v) => !((exhibido[v.vid] || 0) > 0 || deposito[v.vid] != null)).length

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2], flexWrap: 'wrap', marginBottom: space[2] }}>
        <h2 style={{ fontSize: font.lg, fontWeight: 700, color: color.ink }}>{prod.name}</h2>
        <Badge tone="neutral" subtle>
          {lineaLabel(prod.linea)}
        </Badge>
      </div>

      <p style={{ fontSize: font.sm, color: color.mut, marginBottom: space[3] }}>
        Total = <b>Exhibido</b> (escaneado, editable) + <b>Depósito local</b> (a mano). Lo que dejes sin tocar cuenta como <b>0</b> al terminar.
        {sinCargar ? (
          <b style={{ color: color.warningInk }}>
            {' '}
            {sinCargar} sin tocar.
          </b>
        ) : null}
      </p>

      <TableWrap>
        <THead>
          <Tr>
            <Th>Talle</Th>
            <Th align="center" width={70}>
              Sistema
            </Th>
            <Th align="center" width={90}>
              🔫 Exhib.
            </Th>
            <Th align="center" width={96}>
              ✍️ Depósito
            </Th>
            <Th align="center" width={62}>
              Total
            </Th>
            <Th align="center" width={62}>
              Dif
            </Th>
          </Tr>
        </THead>
        <TBody>
          {vars.map((v) => {
            const sis = snap[v.vid] != null ? snap[v.vid] : v.esperado
            const ex = exhibido[v.vid] || 0
            const dep = deposito[v.vid] != null ? deposito[v.vid] : null
            const tocada = ex > 0 || dep != null
            const tot = ex + (dep || 0)
            const dif = !tocada ? null : tot - sis
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
                    value={ex || ''}
                    placeholder="0"
                    aria-label={`Exhibido del talle ${v.size}`}
                    onChange={(e) => onExhib(prod.pid, v.vid, e.target.value)}
                    style={{ width: 64, textAlign: 'center', padding: '0 6px' }}
                  />
                </Td>
                <Td align="center" tall>
                  <input
                    className="mo-input mo-input--num"
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={dep != null ? dep : ''}
                    placeholder="—"
                    aria-label={`Depósito del talle ${v.size}`}
                    onChange={(e) => onDep(prod.pid, v.vid, e.target.value)}
                    style={{ width: 72, textAlign: 'center', padding: '0 6px', fontWeight: 700 }}
                  />
                </Td>
                <Td align="center" strong>
                  {tocada ? tot : '—'}
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

function PreviewView({ preview, linea }: { preview: CePreview; linea: Linea }) {
  const { rows, resumen, missing } = preview
  const marcaU = (preview.store || '').toUpperCase()
  return (
    <div>
      <h2 style={{ fontSize: font.lg, fontWeight: 700, color: color.ink, marginBottom: space[3] }}>Revisión del ajuste · {lineaLabel(linea)}</h2>

      <Notice tone="brand" icon="🏷️" style={{ marginBottom: space[3] }}>
        Ajuste del <b>Local de {marcaU}</b> · ubicación <b>{preview.ubicacion || '—'}</b>. El Excel se sube <b>solo</b> al GN de {marcaU}.
      </Notice>

      <p style={{ fontSize: font.base, color: color.ink2, marginBottom: space[3] }}>
        Se ajustan <b>{resumen.lineas}</b> {resumen.lineas === 1 ? 'talle' : 'talles'}: <b style={{ color: color.warningInk }}>{resumen.mas}</b> con sobrante (+) y{' '}
        <b style={{ color: color.dangerInk }}>{resumen.menos}</b> con faltante (−) · <b>{resumen.unidades_ajustadas}</b> u. El resto no se toca.
      </p>

      {missing.length > 0 && (
        <Notice tone="danger" icon="⚠" style={{ marginBottom: space[3] }}>
          {missing.length} {missing.length === 1 ? 'talle' : 'talles'} con diferencia <b>NO se ajustan</b>: no se pudo confirmar su stock en vivo. <b>Revisalos a mano.</b>
        </Notice>
      )}

      {!rows.length ? (
        <Notice tone="success" icon="🎉">
          No hay diferencias: lo contado coincide con el sistema. Podés guardar el conteo igual, así queda registrado con fecha.
        </Notice>
      ) : (
        <>
          <TableWrap maxHeight="52vh">
            <THead>
              <Tr>
                <Th>Producto · Talle</Th>
                <Th align="center">Sist.</Th>
                <Th align="center">Total</Th>
                <Th align="center">Dif</Th>
                <Th align="center">Vivo</Th>
                <Th align="center">Nuevo</Th>
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
