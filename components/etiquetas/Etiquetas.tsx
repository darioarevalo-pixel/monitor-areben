'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { useDatosMonitor } from '@/components/fundas/useDatosMonitor'
import { BotonActualizarInventario } from '@/components/productos/BotonActualizarInventario'
import { BotonRecargar } from '@/components/productos/BotonRecargar'
import { useEtiquetasTn } from './useEtiquetasTn'
import { pidsDe, useColaReetiquetado, type EstadoCola, type PrecioImpreso } from './useColaReetiquetado'
import { etiquetasDesactualizadas, preciosDesalineados, type PrecioDesalineado } from '@/lib/etiquetas/cola'
import {
  agruparCantidades,
  conStock,
  construirPrecios,
  filtrarVariantes,
  hermanasDe,
  nombrarSinPrecio,
  partirPorPrecio,
  resolverScan,
  secuenciaLabels,
  totalEtiquetas,
  variantesAListar,
  variantesEtiquetables,
  variantesSinCodigo,
} from '@/lib/etiquetas/core'
import { buildEtiquetasPdf, buildLibrePdf, buildSkuGrandePdf, imprimirPdf, SKU_POR_BOLSA, type BolsaSku, type CtxEtiqueta } from '@/lib/etiquetas/pdf'
import {
  CONFIG_SKU_DEFAULT,
  ETIQUETA,
  MODO_DE,
  PESTANIAS,
  rotuloPestania,
  type Cantidades,
  type ConfigSku,
  type LineaEtiqueta,
  type ModoEtiqueta,
  type Pestania,
  type Slot,
  type VarianteEti,
} from '@/lib/etiquetas/tipos'
import type { Marca } from '@/lib/nav.datos'
import { fmtHace } from '@/lib/resumen'
import { HeaderAcciones } from '@/components/layout/acciones'
import { Badge, Button, Card, Notice, Select, Tabs, color, space, useConfirmar } from '@/components/ui'

const CAP = 500


const FP_DEFAULT: LineaEtiqueta[] = [
  { texto: 'FORMAS DE PAGO', tam: 'titulo', bold: true },
  { texto: '3 cuotas sin interés', tam: 'normal', bold: false },
  { texto: '10% OFF Transferencia', tam: 'normal', bold: false },
  { texto: '15% OFF Efectivo', tam: 'normal', bold: false },
]

// ── localStorage (mismas claves que el legacy → el flip preserva lo guardado) ──
const keyCant = (slot: string, marca: Marca) => `monitor_etiquetas_${slot}_${marca}`
const keyAutoClear = (marca: Marca) => `monitor_eti_autoclear_${marca}`
const keyFP = (marca: Marca) => `monitor_eti_fp_v3_${marca}`
const keyCfgSku = (marca: Marca) => `monitor_eti_sku_cfg_${marca}`
function lsGet<T>(key: string, fallback: T): T {
  try {
    const r = localStorage.getItem(key)
    return r ? (JSON.parse(r) as T) : fallback
  } catch {
    return fallback
  }
}
function lsSet(key: string, val: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(val))
  } catch {
    /* cuota llena: se ignora, como el legacy tras liberar caché */
  }
}

export function Etiquetas() {
  const { confirmar, avisar } = useConfirmar()
  const { marca } = useSesion()
  const { datos } = useDatosMonitor()
  const tn = useEtiquetasTn(marca)

  // Las huérfanas (stock en `inventario`, producto todavía no en `productos`) vienen aparte del
  // ETL a propósito y hay que sumarlas acá: si no, un producto recién cargado en GN no se puede
  // etiquetar aunque su código de barras ya esté. Con `?? []` para los cachés viejos de IndexedDB.
  const allVariantes = useMemo<VarianteEti[]>(
    () => [
      ...((datos?.allVariantes ?? []) as VarianteEti[]),
      ...((datos?.allVariantesHuerfanas ?? []) as VarianteEti[]).map((v) => ({ ...v, sinProducto: true })),
    ],
    [datos],
  )
  const nuevosSinCatalogo = useMemo(() => new Set((datos?.allVariantesHuerfanas ?? []).map((v) => v.pid)).size, [datos])
  const vars = useMemo(() => variantesEtiquetables(allVariantes), [allVariantes])
  /**
   * De dónde salen las hermanas de la pestaña de SKU.
   *
   * 🔑 **NO es `vars`.** Ésa filtra por código de barras, que es lo que hace falta para *escanear*;
   * la etiqueta de SKU no dibuja barras, así que un color sin código —que existe como bolsa en el
   * depósito igual— tiene que entrar. Filtrarlo acá le escondería una bolsa al que la está armando.
   */
  const varsSku = useMemo(() => allVariantes.filter((v) => (v.sku || '').trim()), [allVariantes])
  const varsById = useMemo(() => Object.fromEntries(vars.map((v) => [v.id, v])) as Record<string, VarianteEti>, [vars])
  const sinCodigo = useMemo(() => variantesSinCodigo(allVariantes), [allVariantes])
  const { precios, promos, fueraDeTn } = useMemo(() => construirPrecios(datos?.allProductos ?? [], tn.tnIdx), [datos, tn.tnIdx])
  const precioDe = useCallback((v: VarianteEti) => precios[v.pid] || 0, [precios])
  const promoDe = useCallback((v: VarianteEti) => promos[v.pid] || null, [promos])
  const sinPrecioDeTn = useCallback((v: VarianteEti) => fueraDeTn.has(v.pid), [fueraDeTn])

  const [sub, setSub] = useState<Pestania>('dep')
  const cola = useColaReetiquetado(marca)
  const [filtroCampania, setFiltroCampania] = useState('')

  /**
   * Las etiquetas que **dicen otro número del que se paga hoy**.
   *
   * 🔑 Se calcula acá y no en el servidor porque el precio de hoy vive acá: es el mismo que la
   * pantalla imprime, sacado de Tienda Nube. El servidor no lo tiene y traerlo sería una consulta
   * externa por request.
   *
   * 🔴 Es lo que caza un precio de LISTA cambiado a mano en Gestión Nube, que no pasa por el Monitor
   * y por eso la comparación por fechas contra la bitácora no lo ve.
   */
  const precioHoyPorPid = useMemo(() => {
    const m: Record<string, { aCobrar: number | null; lista: number | null }> = {}
    for (const pid of Object.keys(cola.sellos)) {
      const pr = promos[pid]
      const p = precios[pid] || 0
      m[pid] = { aCobrar: p > 0 ? p : null, lista: pr ? pr.normal : p > 0 ? p : null }
    }
    return m
  }, [cola.sellos, precios, promos])

  const viejasPorNumero = useMemo(
    () => etiquetasDesactualizadas(cola.sellos, precioHoyPorPid, cola.stock),
    [cola.sellos, precioHoyPorPid, cola.stock],
  )

  /**
   * Los que **Gestión Nube y la tienda** no cuentan igual.
   *
   * 🔑 **Lo pidió Bruno: «comparalo también contra el espejo de GN».** La cola compara contra Tienda
   * Nube porque es lo que el cliente paga, así que un precio cargado en GN que todavía no propagó no
   * la despierta. Esto lo muestra.
   *
   * 🔴 **Va como aviso y ⛔ NO como filas para imprimir**: la etiqueta se dibuja con el precio de la
   * tienda, así que mientras los dos lados digan distinto, imprimir cuelga el número de la tienda y
   * la prenda vuelve a acusar mañana. Se arregla emparejando el precio, no etiquetando.
   */
  const listaPorPid = useMemo(() => {
    const m: Record<string, { gn: number | null; tienda: number | null }> = {}
    for (const p of (datos?.allProductos ?? []) as { id: string; retailer_price?: number }[]) {
      const pid = String(p.id)
      const pr = promos[pid]
      const tienda = pr ? pr.normal : precios[pid] || 0
      const gn = Number(p.retailer_price || 0)
      m[pid] = { gn: gn > 0 ? gn : null, tienda: tienda > 0 ? tienda : null }
    }
    return m
  }, [datos, precios, promos])
  const desalineados = useMemo(() => preciosDesalineados(listaPorPid, cola.stock), [listaPorPid, cola.stock])
  const nombrePorPid = useMemo(() => {
    const m: Record<string, string> = {}
    for (const v of vars) if (v.name && !m[v.pid]) m[v.pid] = v.name
    return m
  }, [vars])

  /** Cuántas prendas hay para reetiquetar, por las dos puertas. Lo usan la pestaña y el encabezado. */
  const nCola = cola.pendientes.length + viejasPorNumero.length

  // La campaña dejó de ser la que decide qué etiquetar y quedó como filtro. Viaja en cada fila, así
  // que filtrar no cuesta una consulta más.
  const pendientesFiltradas = useMemo(
    () => (filtroCampania ? cola.pendientes.filter((p) => p.liqNombre === filtroCampania) : cola.pendientes),
    [cola.pendientes, filtroCampania],
  )
  // Las dos puertas de la cola, sin repetir: la de fechas (cambió después de etiquetarla) y la del
  // número (la etiqueta dice otra cosa). Un producto puede entrar por las dos.
  const pidsCola = useMemo(() => {
    const s = pidsDe(pendientesFiltradas)
    // El filtro de campaña no aplica a las viejas por número: ésas no vienen de ninguna campaña.
    if (!filtroCampania) for (const v of viejasPorNumero) s.add(v.pid)
    return s
  }, [pendientesFiltradas, viejasPorNumero, filtroCampania])
  // 🔑 Qué etiqueta le toca a cada una: la cola mezcla las que entran a una oferta con las que
  // vuelven a precio de lista, y una etiqueta con un «antes» que no existe es un cartel mentiroso.
  const modoDeCola = useCallback((v: VarianteEti) => (promoDe(v) ? 'promo' : 'loc') as ModoEtiqueta, [promoDe])

  // Estado persistido (recargado al cambiar de marca).
  const [cant, setCant] = useState<Record<Slot, Cantidades>>({ dep: {}, loc: {}, promo: {}, sku: {}, cola: {} })
  const [autoClear, setAutoClear] = useState(true)
  const [fpLines, setFpLines] = useState<LineaEtiqueta[]>(FP_DEFAULT)
  const [cfgSku, setCfgSku] = useState<ConfigSku>(CONFIG_SKU_DEFAULT)
  // Carga en un IIFE async (no setState sincrónico en el effect: dispararía cascada
  // y lo marca el CI) y sin leer localStorage en el SSR (evita el mismatch de
  // hidratación). Mismas claves del legacy → el flip preserva lo guardado.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const c: Record<Slot, Cantidades> = {
        dep: lsGet(keyCant('dep', marca), {}),
        loc: lsGet(keyCant('loc', marca), {}),
        promo: lsGet(keyCant('promo', marca), {}),
        sku: lsGet(keyCant('sku', marca), {}),
        cola: lsGet(keyCant('cola', marca), {}),
      }
      // El autoclear es un string CRUDO ('1'/'0') en el legacy, no JSON.
      const ac = localStorage.getItem(keyAutoClear(marca)) !== '0'
      const fp = lsGet<LineaEtiqueta[]>(keyFP(marca), FP_DEFAULT)
      // Con `...DEFAULT` delante para que un guardado viejo al que le falte una tilde no la deje
      // `undefined` y convierta el checkbox en no controlado a mitad de camino.
      const cs = { ...CONFIG_SKU_DEFAULT, ...lsGet<Partial<ConfigSku>>(keyCfgSku(marca), {}) }
      if (!vivo) return
      setCant(c)
      setAutoClear(ac)
      setFpLines(fp)
      setCfgSku(cs)
    })()
    return () => {
      vivo = false
    }
  }, [marca])

  const setCantModo = (slot: Slot, id: string, val: string) => {
    setCant((prev) => {
      const next = { ...prev[slot] }
      const n = parseInt(val, 10)
      if (n > 0) next[id] = n
      else delete next[id]
      lsSet(keyCant(slot, marca), next)
      return { ...prev, [slot]: next }
    })
  }
  const limpiar = async (slot: Slot) => {
    if (!Object.keys(cant[slot]).length) return
    const ok = await confirmar({
      titulo: 'Eliminar las cantidades',
      tono: 'danger',
      ok: 'Eliminar',
      mensaje: 'Se eliminan todas las cantidades cargadas en esta pestaña. No afecta a las otras.',
    })
    if (!ok) return
    setCant((prev) => {
      lsSet(keyCant(slot, marca), {})
      return { ...prev, [slot]: {} }
    })
  }
  const onAutoClear = (on: boolean) => {
    setAutoClear(on)
    try {
      localStorage.setItem(keyAutoClear(marca), on ? '1' : '0') // string crudo, como el legacy
    } catch {
      /* cuota llena */
    }
  }
  const guardarFP = (lines: LineaEtiqueta[]) => {
    setFpLines(lines)
    lsSet(keyFP(marca), lines)
  }
  const guardarCfgSku = (campo: keyof ConfigSku, on: boolean) => {
    setCfgSku((prev) => {
      const next = { ...prev, [campo]: on }
      lsSet(keyCfgSku(marca), next)
      return next
    })
  }

  // 🔴 Memoizados los DOS: la vista previa los tiene como dependencia de un efecto, y un objeto
  // nuevo en cada render la dejaría redibujando el PDF para siempre.
  const ctx: CtxEtiqueta = useMemo(() => ({ precioDe, promoDe, fpLines }), [precioDe, promoDe, fpLines])
  // En la cola el dibujo se elige prenda por prenda; en las otras pestañas manda el de la pestaña.
  const ctxCola: CtxEtiqueta = useMemo(() => ({ ...ctx, modoDe: modoDeCola }), [ctx, modoDeCola])
  const ctxDe = (slot: Slot): CtxEtiqueta => (slot === 'cola' ? ctxCola : ctx)

  /**
   * Da por hecha la etiqueta de estos productos.
   *
   * 🔑 **Nunca frena la impresión.** Si esto falla, la etiqueta ya salió de la impresora: cortar
   * acá dejaría a alguien con la prenda etiquetada en la mano y un cartel de error. Lo peor que
   * pasa es que el producto siga en la cola y se imprima dos veces, que es gratis a propósito.
   */
  const anotarEtiquetado = (grupos: { v: VarianteEti }[], modo: 'impresa' | 'ya_estaba' = 'impresa') => {
    // Qué NÚMERO decía cada etiqueta. Es lo que después caza un precio de lista cambiado a mano en
    // Gestión Nube, que no pasa por el Monitor y no deja rastro en la bitácora.
    const precios: Record<string, PrecioImpreso> = {}
    for (const g of grupos) {
      const pr = promoDe(g.v)
      precios[g.v.pid] = { precio: precioDe(g.v) || null, precioLista: pr ? pr.normal : null }
    }
    void cola.marcar(grupos.map((g) => g.v.pid), modo, precios).catch(() => {})
  }

  const imprimir = async (slot: Slot, opts: { sep: boolean; conFP: boolean }) => {
    const modo = MODO_DE[slot]
    const grupos = agruparCantidades(cant[slot], varsById, modo)
    if (!grupos.length) {
      await avisar(modo === 'sku' ? 'No hay variantes con SKU entre las cantidades cargadas.' : 'Cargá al menos una cantidad.')
      return
    }
    // En la cola el freno por precio se evalúa contra la etiqueta que le toca a cada prenda, no
    // contra la de la pestaña: las que vuelven a lista llevan la de precio y ahí el cero sí frena.
    const modoParaFreno = slot === 'cola' ? 'loc' : modo
    // Sin precio no sale la etiqueta de precio: salía la de información, bien impresa y sin avisar.
    const { imprimibles, sinPrecio } = partirPorPrecio(grupos, modoParaFreno, precioDe)
    if (sinPrecio.length) {
      await avisar(
        `${sinPrecio.length === 1 ? 'Esta prenda no tiene' : `Estas ${sinPrecio.length} prendas no tienen`} precio y ${sinPrecio.length === 1 ? 'no se va' : 'no se van'} a imprimir: ${nombrarSinPrecio(sinPrecio)}. ` +
          'Probá «🔄 Actualizar precios»; si sigue sin aparecer, es que el producto todavía no cruza con Tienda Nube.',
      )
    }
    if (!imprimibles.length) return
    const pdf =
      modo === 'sku' && cfgSku.grande
        ? // Una bolsa por etiqueta: la cantidad de la fila son **copias de la misma bolsa**. Juntar
          // los colores de un producto en una sola es cosa del escáner, que es donde hay una prenda
          // en la mano y un producto claro; acá cada fila es una variante y su número.
          await buildSkuGrandePdf(imprimibles.flatMap((g) => Array.from({ length: g.cant }, (): BolsaSku => ({ producto: g.v.name || '', variantes: [g.v] }))))
        : await buildEtiquetasPdf(secuenciaLabels(imprimibles, opts), modo, ctxDe(slot))
    if (pdf) imprimirPdf(pdf)
    if (slot === 'cola') anotarEtiquetado(imprimibles)
    setTimeout(() => {
      void (async () => {
        const hacer =
          autoClear ||
          (await confirmar({
            titulo: 'Etiquetas enviadas a imprimir',
            ok: 'Eliminar cantidades',
            cancelar: 'Dejarlas',
            mensaje: '¿Elimino las cantidades cargadas? Si la impresión salió mal, dejalas para reintentar.',
          }))
        if (hacer) {
          setCant((prev) => {
            lsSet(keyCant(slot, marca), {})
            return { ...prev, [slot]: {} }
          })
        }
      })()
    }, 600)
  }

  /**
   * La etiqueta de SKU de una bolsa del depósito: una sola de 10 × 15 con todos los SKU adentro, o
   * una de 5 × 2,5 por cada color. Quiénes son «todos» lo decidió el escáner (ver `hermanasDe`).
   */
  const imprimirSku = async (lista: VarianteEti[]) => {
    if (!lista.length) return
    const pdf = cfgSku.grande
      ? await buildSkuGrandePdf([{ producto: lista[0].name || '', variantes: lista }])
      : await buildEtiquetasPdf(lista, 'sku', ctx)
    if (pdf) imprimirPdf(pdf)
    anotarEtiquetado(lista.map((v) => ({ v })))
  }

  const imprimirUno = async (slot: Slot, v: VarianteEti, conFP: boolean) => {
    imprimirPdf(await buildEtiquetasPdf(conFP ? [v, { __fp: true }] : [v], MODO_DE[slot], ctxDe(slot)))
    // Escanear y que salga la etiqueta ES haberla hecho. Y desde cualquier pestaña: si alguien la
    // reimprime desde Local o Promo, la prenda quedó al día igual — la cola no es dueña de eso.
    anotarEtiquetado([{ v }])
  }

  return (
    <div>
      <HeaderAcciones>
        <BotonRecargar />
        <BotonActualizarInventario />
      </HeaderAcciones>

      {/* Antes estas variantes no se listaban en ningún lado: el producto nuevo simplemente no
          existía para Etiquetas. Ahora se etiquetan igual y el cartel explica qué les falta. */}
      {nuevosSinCatalogo > 0 && (
        <Notice tone="warning" icon="✨">
          <b>
            {nuevosSinCatalogo} {nuevosSinCatalogo === 1 ? 'producto nuevo todavía no está' : 'productos nuevos todavía no están'} en el catálogo sincronizado.
          </b>{' '}
          {nuevosSinCatalogo === 1 ? 'Se puede etiquetar' : 'Se pueden etiquetar'} igual (el código de barras y el stock ya están); lo que falta es el precio,
          así que en Local y Promo {nuevosSinCatalogo === 1 ? 'sale' : 'salen'} en $0 hasta que sincronice.
        </Notice>
      )}

      <Tabs
        items={PESTANIAS.map((p) => {
          const { emoji, nombre } = rotuloPestania(p)
          // El único rótulo que lleva algo más que su nombre: cuántas prendas están esperando.
          // 🔑 **El mismo número que el encabezado.** La cola tiene dos puertas —cambió el precio
          // después de etiquetarla, y la etiqueta dice otro número del que se cobra— y contar sólo
          // la primera dejaba la pestaña sin número justo cuando todas entraron por la segunda.
          const cuantas = p === 'cola' && nCola ? ` (${nCola})` : ''
          return { key: p, label: `${emoji} ${nombre}${cuantas}` }
        })}
        value={sub}
        onChange={(k) => setSub(k as Pestania)}
        style={{ marginBottom: space[4] }}
      />

      {sub === 'cola' && <CabeceraCola cola={cola} filtro={filtroCampania} setFiltro={setFiltroCampania} porNumero={viejasPorNumero.length} />}
      {sub === 'cola' && desalineados.length > 0 && <AvisoDesalineados filas={desalineados} nombreDe={nombrePorPid} />}

      {sub === 'libre' ? (
        <LibreEditor />
      ) : (
        <ModoPanel
          key={sub === 'cola' ? `cola:${filtroCampania}` : sub}
          modo={MODO_DE[sub]}
          campania={sub === 'cola' ? { nombre: 'Para reetiquetar', pids: pidsCola } : undefined}
          vars={vars}
          sinCodigo={sinCodigo}
          cant={cant[sub]}
          setCant={(id, val) => setCantModo(sub, id, val)}
          limpiar={() => void limpiar(sub)}
          autoClear={autoClear}
          setAutoClear={onAutoClear}
          precioDe={precioDe}
          promoDe={promoDe}
          sinPrecioDeTn={sinPrecioDeTn}
          preciosLeidosEn={tn.leidoEn}
          catalogoListo={!tn.cargando}
          onRefrescarPrecios={tn.refrescar}
          onImprimir={(opts) => imprimir(sub, opts)}
          onImprimirUno={(v, conFP) => imprimirUno(sub, v, conFP)}
          varsSku={varsSku}
          cfgSku={cfgSku}
          setCfgSku={guardarCfgSku}
          onImprimirSku={(lista) => void imprimirSku(lista)}
          ctx={ctxDe(sub)}
          fpLines={fpLines}
          guardarFP={guardarFP}
        />
      )}
    </div>
  )
}

/**
 * El encabezado de «Para reetiquetar»: cuántas hay, de cuándo es la lectura y el filtro de campaña.
 *
 * 🔑 **La fecha de lectura va SIEMPRE.** Una cola vacía porque está todo hecho se ve exactamente
 * igual que una cola vacía porque la consulta se rompió, y de las dos la pantalla diría «no hay
 * nada que etiquetar».
 *
 * 🔑 **El filtro de campaña sólo se dibuja si hay dos o más.** Con una sola, elegir entre una cosa
 * es ruido. Y es un **filtro**, no la fuente: la lista sale de los cambios de precio, no de que
 * exista una campaña.
 */
function CabeceraCola({ cola, filtro, setFiltro, porNumero }: { cola: EstadoCola; filtro: string; setFiltro: (v: string) => void; porNumero: number }) {
  if (cola.error) {
    return (
      <Notice tone="danger" icon="✗">
        {cola.error}
      </Notice>
    )
  }
  const n = cola.pendientes.length + porNumero
  const leido = cola.leidoEn ? new Date(cola.leidoEn).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>
          🔁 {cola.cargando ? 'Buscando qué cambió de precio…' : n ? `${n} ${n === 1 ? 'prenda' : 'prendas'} para reetiquetar` : 'No hay nada para reetiquetar'}
        </div>
        {cola.campanias.length > 1 && (
          <Select value={filtro} onChange={(e) => setFiltro(e.target.value)} style={{ width: 260, maxWidth: '100%' }}>
            <option value="">Todas las campañas</option>
            {cola.campanias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        )}
        <button className="btn-sm" onClick={() => void cola.recargar()} style={{ background: '#fff', border: `1px solid ${color.line2}` }}>
          🔄 Revisar de nuevo
        </button>
        {leido && <span style={{ fontSize: 12, color: color.mut }}>Leído el {leido}</span>}
      </div>
      <div style={{ fontSize: 12, color: color.mut, marginTop: 8 }}>
        Entra sola cualquier prenda a la que le haya cambiado el precio desde el Monitor —se puso una
        oferta, se sacó, se ajustó— y sale al imprimirla. Reimprimir es libre y no avisa nada.
        {porNumero > 0 && ` ${porNumero} ${porNumero === 1 ? 'entró' : 'entraron'} porque la etiqueta dice otro número del que se cobra hoy — eso incluye los precios de lista cambiados a mano en Gestión Nube.`}
        {cola.sinStock.length > 0 && ` ${cola.sinStock.length} quedaron afuera por no tener stock.`}
      </div>
    </Card>
  )
}

function ModoPanel({
  modo,
  campania,
  vars,
  sinCodigo,
  cant,
  setCant,
  limpiar,
  autoClear,
  setAutoClear,
  precioDe,
  promoDe,
  sinPrecioDeTn,
  preciosLeidosEn,
  catalogoListo,
  onRefrescarPrecios,
  onImprimir,
  onImprimirUno,
  varsSku,
  cfgSku,
  setCfgSku,
  onImprimirSku,
  ctx,
  fpLines,
  guardarFP,
}: {
  modo: ModoEtiqueta
  /** Puesta, la lista se acota a los productos de esa liquidación (pestaña Liquidaciones). */
  campania?: { nombre: string; pids: Set<string> }
  vars: VarianteEti[]
  sinCodigo: VarianteEti[]
  cant: Cantidades
  setCant: (id: string, val: string) => void
  limpiar: () => void
  autoClear: boolean
  setAutoClear: (on: boolean) => void
  precioDe: (v: VarianteEti) => number
  promoDe: (v: VarianteEti) => { normal: number; promo: number } | null
  /** Su precio NO salió de Tienda Nube: es el del espejo, que se refresca una vez por día. */
  sinPrecioDeTn: (v: VarianteEti) => boolean
  /** Cuándo se leyeron los precios de Tienda Nube (epoch ms), o `null` si no entró ninguno. */
  preciosLeidosEn: number | null
  catalogoListo: boolean
  onRefrescarPrecios: () => Promise<void>
  onImprimir: (opts: { sep: boolean; conFP: boolean }) => void
  onImprimirUno: (v: VarianteEti, conFP: boolean) => void
  /** Todas las variantes con SKU (⛔ no filtradas por código de barras): de acá salen las hermanas. */
  varsSku: VarianteEti[]
  cfgSku: ConfigSku
  setCfgSku: (campo: keyof ConfigSku, on: boolean) => void
  onImprimirSku: (lista: VarianteEti[]) => void
  /** El mismo contexto con el que se imprime, para que la vista previa no pueda mostrar otra cosa. */
  ctx: CtxEtiqueta
  fpLines: LineaEtiqueta[]
  guardarFP: (l: LineaEtiqueta[]) => void
}) {
  const [q, setQ] = useState('')
  const [sep, setSep] = useState(false)
  const [conFP, setConFP] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; html: string } | null>(null)
  const [refrescando, setRefrescando] = useState(false)
  /**
   * La última bolsa escaneada en la pestaña de SKU: qué colores tiene el producto y cuáles están
   * tildados. **Queda en pantalla después de imprimir**, y ésa es la gracia: si hacía falta otro
   * color se cambia el tilde y se reimprime, sin volver a buscar la prenda para escanearla.
   */
  const [bolsa, setBolsa] = useState<Bolsa | null>(null)
  const scanRef = useRef<HTMLInputElement>(null)

  // La antigüedad de los precios se recalcula sola cada minuto. `Date.now()` en el render lo prohíbe
  // el lint (resultado inestable entre renders), y además un cartel que dice "hace 1 min" durante
  // media hora miente igual que no ponerlo.
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  const conPrecio = modo === 'loc'
  // 🔑 **La cola se dibuja con el modo `promo` pero NO es la pestaña de promo.** Mezcla las que
  // entran a una oferta con las que volvieron a precio de lista, así que ni el filtro de la lista ni
  // el freno del escaneo pueden pedir «que tenga promo»: `soloPromo` separa las dos cosas.
  const enCola = !!campania
  const soloPromo = modo === 'promo' && !enCola
  const conAntesAhora = soloPromo || enCola
  // La campaña acota *cuáles*; el precio lo sigue poniendo Tienda Nube.
  const listaBase = variantesAListar(vars, modo, campania ?? null, (v) => !!promoDe(v))
  const lista = filtrarVariantes(listaBase, q)
  // 🔑 **La lista de una liquidación NO se corta.** El tope de 500 protege al catálogo entero, que
  // son miles de variantes; una campaña ya viene acotada (las de agosto son 260 productos / 675
  // variantes). Cortarla es peor que en cualquier otra pestaña: acá la lista *es* la respuesta a
  // "¿qué etiqueto?", y "refiná la búsqueda para ver el resto" le esconde 74 prendas a quien está
  // recorriendo la tienda con el lector.
  const tope = campania ? Infinity : CAP
  const shown = lista.slice(0, tope)
  // La previa acompaña lo que se está por imprimir: el primero de la lista de abajo, no un ejemplo
  // inventado. Y en la cola el dibujo se elige por prenda, así que se le pregunta al mismo `ctx`.
  const muestra = shown[0] ?? null
  const muestraModo = muestra && ctx.modoDe ? ctx.modoDe(muestra) : modo
  const total = totalEtiquetas(cant)

  const onScan = async () => {
    const inp = scanRef.current
    if (!inp) return
    const code = inp.value.trim()
    inp.value = ''
    if (!code) return
    const v = resolverScan(vars, code)
    if (!v) {
      setFeedback({ ok: false, html: `✗ No se encontró ningún producto con el código «${code}».` })
      inp.focus()
      return
    }
    // 🔑 **La etiqueta que le toca a ESTA prenda, no la de la pestaña.** En la cola una prenda que
    // volvió a precio de lista lleva la de precio: preguntarle por la promo la rechazaba, y era
    // justo la prenda que el local vino a reetiquetar.
    const modoV = ctx.modoDe ? ctx.modoDe(v) : modo
    if (modoV === 'sku' && !v.sku) {
      setFeedback({ ok: false, html: `✗ ${v.name || ''} no tiene SKU cargado.` })
      inp.focus()
      return
    }
    // 🔑 **La pestaña de SKU imprime la BOLSA, no la prenda.** Un producto de cuatro colores son
    // cuatro bolsas en el depósito, y hasta ahora había que escanear las cuatro. Lo que se imprime
    // lo deciden las opciones de arriba; lo que quedó tildado se ve abajo y se puede reimprimir.
    if (modoV === 'sku') {
      const hermanas = cfgSku.grupo ? hermanasDe(varsSku, v) : [v]
      const elegidas = conStock(hermanas, v)
      setBolsa({ escaneada: v, hermanas, elegidas: new Set(elegidas.map((x) => x.id)) })
      if (cfgSku.elegir) {
        setFeedback({ ok: true, html: `${v.name || ''}: elegí los SKU acá abajo y después imprimí.` })
        inp.focus()
        return
      }
      onImprimirSku(elegidas)
      setFeedback({ ok: true, html: `✓ Imprimiendo ${textoBolsa(elegidas.length, cfgSku.grande)} · ${v.name || ''}` })
      inp.focus()
      return
    }
    // Sin esto la etiqueta salía igual, pero sin el precio: el dibujo se cae a la de información
    // cuando el precio es cero, y la prenda termina colgada sin número.
    if (modoV === 'loc' && !(precioDe(v) > 0)) {
      setFeedback({ ok: false, html: `✗ ${v.name || ''} no tiene precio: la etiqueta saldría sin número. Probá «🔄 Actualizar precios».` })
      inp.focus()
      return
    }
    // La campaña se pregunta ANTES que la promo: si la prenda no entra al sale, eso es lo que hay
    // que decir, y no que "no está en promoción" —que suena a un problema de precios—.
    if (campania && !campania.pids.has(v.pid)) {
      setFeedback({ ok: false, html: `✗ ${v.name || ''} no está en «${campania.nombre}»: no lleva etiqueta de este sale.` })
      inp.focus()
      return
    }
    if (modoV === 'promo' && !promoDe(v)) {
      setFeedback({
        ok: false,
        html: campania
          ? `✗ ${v.name || ''} está en el sale, pero su precio todavía no figura en la tienda. No se imprime para no colgar un precio equivocado.`
          : `✗ ${v.name || ''} no está en promoción en TiendaNube.`,
      })
      inp.focus()
      return
    }
    onImprimirUno(v, modoV === 'loc' && conFP)
    const p = precioDe(v)
    const pr = modoV === 'promo' ? promoDe(v) : null
    // ⚠️ La rama de `sku` ya volvió arriba, con su propio cartel: acá quedan las tres con precio.
    const extra = pr
      ? ` · $${Math.round(pr.normal).toLocaleString('es-AR')} → $${Math.round(pr.promo).toLocaleString('es-AR')}`
      : modoV === 'loc' && p
        ? ` · $${Math.round(p).toLocaleString('es-AR')}`
        : ''
    setFeedback({ ok: true, html: `✓ Imprimiendo: ${v.name || ''} · ${v.size || ''}${extra}` })
    inp.focus()
  }

  const scanBorder = soloPromo ? color.brand : color.brandSolid
  const cardScanStyle: CSSProperties = soloPromo
    ? { border: `1px solid ${color.brandBorder}`, background: color.brandBg }
    : { border: `1px solid ${color.brandBorder}`, background: color.brandBg }

  return (
    <div>
      <Card style={cardScanStyle}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>⚡ Impresión rápida (escáner)</div>
        <div style={{ fontSize: 12, color: color.mut, marginBottom: 10 }}>
          {modo === 'sku' ? (
            cfgSku.elegir ? (
              <>Escaneá el código de barras de una prenda: abre la lista de SKU del producto para que elijas cuáles imprimir.</>
            ) : (
              <>
                Escaneá el código de barras de una prenda: imprime{' '}
                <b>{cfgSku.grupo ? 'la etiqueta de SKU de todos los colores del producto' : 'su etiqueta de SKU'}</b> al instante.
              </>
            )
          ) : (
            <>
              Escaneá el código de barras de un producto: imprime su etiqueta de{' '}
              <b>{campania ? 'la que le corresponda por su precio de hoy' : ETIQUETA[modo].alEscanear}</b> al instante.
              {campania && ' Imprime siempre, esté o no en la lista: reimprimir es gratis.'}
            </>
          )}
        </div>
        <input
          ref={scanRef}
          type="text"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void onScan()
            }
          }}
          placeholder="Escaneá acá el código de barras…"
          style={{ width: 320, maxWidth: '100%', fontSize: 15, padding: '9px 12px', border: `2px solid ${scanBorder}`, borderRadius: 8, boxSizing: 'border-box' }}
        />
        {feedback && <div style={{ fontSize: 13, marginTop: 8, color: feedback.ok ? color.success : color.danger }}>{feedback.html}</div>}
        {modo === 'sku' && <OpcionesSku cfg={cfgSku} set={setCfgSku} />}
      </Card>

      {modo === 'sku' && bolsa && (
        <BolsaPanel
          bolsa={bolsa}
          grande={cfgSku.grande}
          agrupa={cfgSku.grupo}
          tildar={(id, on) =>
            setBolsa((b) => {
              if (!b) return b
              const elegidas = new Set(b.elegidas)
              if (on) elegidas.add(id)
              else elegidas.delete(id)
              return { ...b, elegidas }
            })
          }
          imprimir={() => {
            const lista = bolsa.hermanas.filter((h) => bolsa.elegidas.has(h.id))
            if (!lista.length) return
            onImprimirSku(lista)
            setFeedback({ ok: true, html: `✓ Imprimiendo ${textoBolsa(lista.length, cfgSku.grande)} · ${bolsa.escaneada.name || ''}` })
          }}
          cerrar={() => setBolsa(null)}
        />
      )}

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ flex: '1 1 320px' }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{campania ? 'Productos a etiquetar' : titulo(modo)}</div>
            <div style={{ fontSize: 12, color: color.mut2, marginTop: 2 }}>
              {campania
                ? 'Cada prenda lleva la etiqueta que le corresponde por su precio de hoy: con el tachado si está en oferta, y un número solo si volvió a precio de lista.'
                : subtitulo(modo)}
            </div>
          </div>
          {/* La etiqueta se entiende mirándola. Va con el primero de la lista de abajo, así que
              acompaña lo que se está por imprimir en vez de mostrar un ejemplo inventado. */}
          <VistaPrevia
            modo={muestraModo}
            muestra={muestra}
            ctx={ctx}
            grande={modo === 'sku' && cfgSku.grande}
            agrupar={modo === 'sku' && cfgSku.grupo}
            varsSku={varsSku}
          />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto, SKU o código…" className="mo-input" style={{ width: 240, maxWidth: '100%' }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
          <Button variant="solid" tone="brand" disabled={!total} onClick={() => onImprimir({ sep: modo === 'dep' && sep, conFP: modo === 'loc' && conFP })}>
            Imprimir {total} {total === 1 ? 'etiqueta' : 'etiquetas'}
          </Button>
          {(conPrecio || conAntesAhora) && (
            <>
              <button
                className="btn-sm"
                disabled={refrescando}
                onClick={async () => {
                  setRefrescando(true)
                  await onRefrescarPrecios()
                  setRefrescando(false)
                }}
                style={{ background: '#fff', border: `1px solid ${color.line2}` }}
              >
                {refrescando ? '⏳ Actualizando precios…' : '🔄 Actualizar precios'}
              </button>
              {/* 🔑 **Va SIEMPRE, tenga la edad que tenga.** Sin esta línea un caché viejo se ve
                  idéntico a uno recién bajado, y lo que se imprime es plata. */}
              <span style={{ fontSize: 12, color: color.mut }} title="El catálogo de Tienda Nube tiene además su propio caché de 1 hora. «Actualizar precios» saltea los dos.">
                {preciosLeidosEn
                  ? `Precios leídos ${fmtHace(ahora - preciosLeidosEn)}`
                  : 'Precios sin leer todavía'}
              </span>
            </>
          )}
          <Button variant="ghost" tone="danger" onClick={limpiar}>Limpiar cantidades</Button>
          <label style={{ fontSize: 12, color: color.mut, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" style={{ accentColor: "var(--mo-brand-solid)" }} checked={autoClear} onChange={(e) => setAutoClear(e.target.checked)} /> Eliminar cantidades al imprimir
          </label>
          <span style={{ fontSize: 12, color: color.mut }}>{total ? `${total} etiquetas en ${Object.keys(cant).length} variantes` : 'Cargá cantidades para imprimir'}</span>
        </div>

        {modo === 'dep' && (
          <label style={{ fontSize: 12, color: color.mut, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, cursor: 'pointer' }}>
            <input type="checkbox" style={{ accentColor: "var(--mo-brand-solid)" }} checked={sep} onChange={(e) => setSep(e.target.checked)} /> Dejar una etiqueta en blanco al cambiar de variante (para separar más fácil)
          </label>
        )}
        {modo === 'loc' && (
          <label style={{ fontSize: 12, color: color.mut, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, cursor: 'pointer' }}>
            <input type="checkbox" style={{ accentColor: "var(--mo-brand-solid)" }} checked={conFP} onChange={(e) => setConFP(e.target.checked)} /> Imprimir también la etiqueta de <b>&nbsp;formas de pago</b>&nbsp; (1 después de cada precio)
          </label>
        )}

        <div style={{ overflowX: 'auto', maxHeight: 560, overflowY: 'auto' }}>
          {sinCodigo.length > 0 && <AvisoSinCodigo lista={sinCodigo} />}
          {shown.length ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {th('Producto')}
                  {th('Variante')}
                  {th('SKU')}
                  {th('Código')}
                  {conPrecio && th('Precio', 'right')}
                  {conAntesAhora && th('Antes', 'right')}
                  {conAntesAhora && th('Ahora', 'right')}
                  {th('Stock', 'center')}
                  {th('Etiquetas', 'center')}
                </tr>
              </thead>
              <tbody>
                {shown.map((v) => {
                  const pr = conAntesAhora ? promoDe(v) : null
                  return (
                    <tr key={v.id} style={{ borderTop: `1px solid ${color.line}` }}>
                      <td style={tdC}>
                        {v.name || '—'}
                        {v.sinProducto && (
                          <span title="Tiene stock y código de barras, pero su producto todavía no está en el catálogo sincronizado: el precio aparece después de la próxima sincronización.">
                            {' '}
                            <Badge tone="warning">✨ recién cargado</Badge>
                          </span>
                        )}
                      </td>
                      <td style={tdC}>{v.size || '—'}</td>
                      <td style={{ ...tdC, color: color.mut }}>{v.sku || '—'}</td>
                      <td style={{ ...tdC, color: color.mut, fontFamily: 'monospace', fontSize: 12 }}>{v.barcode}</td>
                      {conPrecio && (
                        <td style={{ ...tdC, textAlign: 'right', fontWeight: 600 }}>
                          {precioDe(v) ? '$' + Math.round(precioDe(v)).toLocaleString('es-AR') : '—'}
                          {precioDe(v) > 0 && sinPrecioDeTn(v) && (
                            <span title="Este producto no cruza con Tienda Nube: el precio sale del espejo de Gestión Nube, que se actualiza una vez por día. Puede no ser el que la tienda cobra hoy.">
                              {' '}
                              <Badge tone="warning">no es de TN</Badge>
                            </span>
                          )}
                        </td>
                      )}
                      {conAntesAhora && <td style={{ ...tdC, textAlign: 'right', color: color.mut2, textDecoration: 'line-through' }}>{pr ? '$' + Math.round(pr.normal).toLocaleString('es-AR') : '—'}</td>}
                      {/* 🔑 Sin promo, «ahora» es el precio de hoy —el de lista—, que es el número
                          que va a salir impreso. Dejarlo en «—» convertía la fila de la prenda que
                          volvió a lista en dos guiones. */}
                      {conAntesAhora && <td style={{ ...tdC, textAlign: 'right', fontWeight: 700, color: color.brand }}>{pr || precioDe(v) ? '$' + Math.round(pr ? pr.promo : precioDe(v)).toLocaleString('es-AR') : '—'}</td>}
                      <td style={{ ...tdC, textAlign: 'center', color: color.mut2 }}>{v.stock || 0}</td>
                      <td style={{ ...tdC, textAlign: 'center' }}>
                        <input type="number" min={0} value={cant[v.id] || ''} onChange={(e) => setCant(v.id, e.target.value)} className="mo-input mo-input--num" inputMode="numeric" style={{ width: 68, textAlign: 'center', padding: '0 6px', height: 32 }} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <div style={{ color: color.mut2, padding: 24, textAlign: 'center' }}>
              {campania
                ? 'No hay prendas para reetiquetar (con código de barras) que coincidan.'
                : soloPromo
                  ? 'No hay productos en promoción (con código de barras) que coincidan.'
                  : 'No hay variantes con código de barras que coincidan.'}
            </div>
          )}
          {lista.length > tope && <div style={{ fontSize: 11, color: color.mut2, padding: 8 }}>Mostrando {tope} de {lista.length}. Refiná la búsqueda para ver el resto.</div>}
        </div>
      </Card>

      {modo === 'loc' && <FPEditor fpLines={fpLines} guardarFP={guardarFP} catalogoListo={catalogoListo} />}
    </div>
  )
}

/**
 * Los precios que **Gestión Nube y la tienda** no cuentan igual.
 *
 * 🔑 **No dice «reetiquetá»: dice «emparejá el precio».** Con los dos lados en desacuerdo, la
 * etiqueta que salga va a decir el número de la tienda y el desacuerdo va a seguir ahí. Por eso va
 * arriba, separado de la lista de imprimir, y nombra los dos números.
 *
 * ⚠️ **El espejo de GN se refresca una vez por día**, así que un cambio de hoy en cualquiera de los
 * dos lados puede tardar en verse o en dejar de verse acá.
 */
function AvisoDesalineados({ filas, nombreDe }: { filas: PrecioDesalineado[]; nombreDe: Record<string, string> }) {
  const items = filas.slice(0, 30)
  const pesos = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')
  return (
    <div style={{ background: color.warningBg, border: `1px solid ${color.warningBorder}`, borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 12, color: color.warningInk }}>
      ⚠️ <b>{filas.length === 1 ? 'Un producto tiene' : `${filas.length} productos tienen`} en Gestión Nube un precio de lista distinto del de la tienda.</b>{' '}
      {filas.length === 1 ? 'No entra' : 'No entran'} a la lista de abajo a propósito: la etiqueta sale con el precio de la tienda, así que
      esto se arregla emparejando el precio en uno de los dos lados —y recién después se etiqueta—.
      <details style={{ marginTop: 4 }}>
        <summary style={{ cursor: 'pointer' }}>Ver cuáles</summary>
        {items.map((f) => (
          <div key={f.pid} style={{ marginTop: 2 }}>
            • {nombreDe[f.pid] || `Producto ${f.pid}`} — Gestión Nube {pesos(f.gn)} · tienda {pesos(f.tienda)}
          </div>
        ))}
        {filas.length > 30 && <div style={{ marginTop: 2, color: color.mut2 }}>…y {filas.length - 30} más</div>}
      </details>
    </div>
  )
}

function AvisoSinCodigo({ lista }: { lista: VarianteEti[] }) {
  const items = lista.slice(0, 80)
  return (
    <div style={{ background: color.warningBg, border: `1px solid ${color.warningBorder}`, borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 12, color: color.warningInk }}>
      ⚠️ <b>{lista.length} {lista.length === 1 ? 'producto con stock SIN código de barras' : 'productos con stock SIN código de barras'}.</b>{' '}
      {lista.length === 1 ? 'No se puede etiquetar' : 'No se pueden etiquetar'} hasta tener el código (cargalo en GN; a veces GN tarda en sincronizarlo).
      <details style={{ marginTop: 4 }}>
        <summary style={{ cursor: 'pointer' }}>Ver cuáles</summary>
        {items.map((v, i) => (
          <div key={i} style={{ marginTop: 2 }}>
            • {v.name || '—'}{v.size && v.size !== '—' ? ' · ' + v.size : ''}{v.sku ? ' · ' + v.sku : ''} <span style={{ color: color.warningInk }}>(stock {v.stock || 0})</span>
          </div>
        ))}
        {lista.length > 80 && <div style={{ marginTop: 2, color: color.mut2 }}>…y {lista.length - 80} más</div>}
      </details>
    </div>
  )
}

// ── Editor de formas de pago ──
const FP_TAM: [LineaEtiqueta['tam'], string][] = [['titulo', 'Título'], ['subtitulo', 'Subtítulo'], ['normal', 'Normal'], ['chico', 'Chico']]
function FPEditor({ fpLines, guardarFP, catalogoListo }: { fpLines: LineaEtiqueta[]; guardarFP: (l: LineaEtiqueta[]) => void; catalogoListo: boolean }) {
  const { avisar, pedirTexto } = useConfirmar()
  const setLinea = (i: number, campo: keyof LineaEtiqueta, val: string | boolean) => guardarFP(fpLines.map((l, idx) => (idx === i ? { ...l, [campo]: val } : l)))
  const add = () => guardarFP([...fpLines, { texto: '', tam: 'normal', bold: false }])
  const del = (i: number) => {
    const next = fpLines.filter((_, idx) => idx !== i)
    guardarFP(next.length ? next : [{ texto: '', tam: 'normal', bold: false }])
  }
  /**
   * 🔑 **La previa arma la etiqueta con el MISMO llamado que la impresión** (`__fp`), así que no
   * hay forma de que muestre otra cosa que lo que sale de la impresora. Sin líneas con texto
   * devuelve `null`: `drawFP` no dibujaría nada y una hoja en blanco no dice «está vacía».
   */
  const construirFP = useCallback(
    () => (fpLines.some((l) => l.texto.trim()) ? buildEtiquetasPdf([{ __fp: true }], 'loc', { precioDe: () => 0, promoDe: () => null, fpLines }) : null),
    [fpLines],
  )
  const imprimirSolo = async () => {
    if (!fpLines.filter((l) => l.texto.trim()).length) {
      await avisar('La etiqueta de formas de pago está vacía.')
      return
    }
    const raw = await pedirTexto('¿Cuántas etiquetas de formas de pago querés imprimir?', '10', { titulo: 'Imprimir formas de pago', ok: 'Imprimir' })
    if (raw === null) return
    const n = parseInt(raw, 10)
    if (!n || n < 1) return
    const labels = Array.from({ length: n }, () => ({ __fp: true as const }))
    imprimirPdf(await buildEtiquetasPdf(labels, 'loc', { precioDe: () => 0, promoDe: () => null, fpLines }))
  }

  return (
    <Card>
      <div style={{ fontSize: 14, fontWeight: 700 }}>💳 Etiqueta de formas de pago</div>
      <div style={{ fontSize: 12, color: color.mut2, margin: '2px 0 12px' }}>Diseñala una vez (queda guardada). Se imprime junto a las etiquetas de precio cuando tildás la opción de arriba. Tamaño 5 × 2,5 cm.</div>
      {fpLines.map((l, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
          <input value={l.texto} placeholder="Texto" onChange={(e) => setLinea(i, 'texto', e.target.value)} className="mo-input" style={{ flex: 1, minWidth: 160 }} />
          <select value={l.tam} onChange={(e) => setLinea(i, 'tam', e.target.value)} className="mo-select" style={{ width: 110 }}>
            {FP_TAM.map(([val, t]) => <option key={val} value={val}>{t}</option>)}
          </select>
          <label style={{ fontSize: 12, color: color.mut, display: 'flex', alignItems: 'center', gap: 3 }}>
            <input type="checkbox" style={{ accentColor: "var(--mo-brand-solid)" }} checked={l.bold} onChange={(e) => setLinea(i, 'bold', e.target.checked)} /> Negrita
          </label>
          <button onClick={() => del(i)} title="Eliminar la línea" style={{ background: 'none', border: 'none', color: color.mut2, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={add} style={{ marginTop: 4 }}>+ Agregar línea</Button>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginTop: 14 }}>
        <div style={{ fontSize: 12, color: '#888' }}>Así sale:</div>
        <PreviaPdf construir={construirFP} alt="Vista previa de la etiqueta de formas de pago" espera={400} vacio="(vacía)" />
        <Button size="sm" variant="outline" disabled={!catalogoListo} onClick={imprimirSolo}>Imprimir solo formas de pago…</Button>
      </div>
    </Card>
  )
}

// ── Editor de etiqueta libre ──
function LibreEditor() {
  const { avisar } = useConfirmar()
  const [lineas, setLineas] = useState<LineaEtiqueta[]>([{ texto: '', tam: 'titulo', bold: true }])
  const [grande, setGrande] = useState(false)
  const [copias, setCopias] = useState('1')
  const [barcode, setBarcode] = useState('')
  const [precio, setPrecio] = useState('')

  const setLinea = (i: number, campo: keyof LineaEtiqueta, val: string | boolean) => setLineas((prev) => prev.map((l, idx) => (idx === i ? { ...l, [campo]: val } : l)))
  const add = () => setLineas((prev) => [...prev, { texto: '', tam: 'normal', bold: false }])
  const del = (i: number) => setLineas((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : [{ texto: '', tam: 'normal', bold: false }]))

  const build = async () => {
    const pdf = await buildLibrePdf({
      grande,
      copias: Math.max(1, parseInt(copias, 10) || 1),
      barcode: barcode.trim(),
      precio: precio !== '' ? Math.round(parseFloat(precio)) : null,
      lineas,
    })
    if (!pdf) {
      await avisar('Cargá al menos una línea de texto, un código de barras o un precio.')
      return null
    }
    return pdf
  }
  const imprimir = async () => {
    const pdf = await build()
    if (pdf) imprimirPdf(pdf)
  }
  const preview = async () => {
    const pdf = await build()
    if (!pdf) return
    const url = pdf.output('bloburl')
    if (!window.open(url, 'etiquetas_print')) pdf.save('etiqueta.pdf')
  }

  return (
    <Card>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>✏️ Etiqueta libre (editor)</div>
      <div style={{ fontSize: 12, color: color.mut2, marginBottom: 14 }}>Armá una etiqueta a medida con texto, código de barras y/o precio. Ideal para cajas, bolsas y rótulos de envío.</div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
        <label style={{ fontSize: 12, color: color.mut }}>Tamaño<br />
          <select value={grande ? 'grande' : 'chica'} onChange={(e) => setGrande(e.target.value === 'grande')} className="mo-select" style={{ minWidth: 150 }}>
            <option value="chica">5 × 2,5 cm (chica)</option>
            <option value="grande">10 × 15 cm (caja / rótulo)</option>
          </select>
        </label>
        <label style={{ fontSize: 12, color: color.mut }}>Copias<br />
          <input type="number" value={copias} min={1} onChange={(e) => setCopias(e.target.value)} className="mo-input mo-input--num" inputMode="numeric" style={{ width: 90 }} />
        </label>
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#888', letterSpacing: 0, marginBottom: 6 }}>Líneas de texto</div>
      {lineas.map((l, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
          <input value={l.texto} placeholder={`Texto de la línea ${i + 1}`} onChange={(e) => setLinea(i, 'texto', e.target.value)} className="mo-input" style={{ flex: 1, minWidth: 160 }} />
          <select value={l.tam} onChange={(e) => setLinea(i, 'tam', e.target.value)} className="mo-select" style={{ width: 110 }}>
            {FP_TAM.map(([val, t]) => <option key={val} value={val}>{t}</option>)}
          </select>
          <label style={{ fontSize: 12, color: color.mut, display: 'flex', alignItems: 'center', gap: 3 }}>
            <input type="checkbox" style={{ accentColor: "var(--mo-brand-solid)" }} checked={l.bold} onChange={(e) => setLinea(i, 'bold', e.target.checked)} /> Negrita
          </label>
          <button onClick={() => del(i)} title="Eliminar la línea" style={{ background: 'none', border: 'none', color: color.mut2, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={add} style={{ marginTop: 4 }}>+ Agregar línea</Button>
      <div style={{ borderTop: `1px solid ${color.line}`, margin: '16px 0 12px' }} />
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ fontSize: 12, color: color.mut }}>Código de barras (opcional)<br />
          <input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="número o texto a codificar" className="mo-input" style={{ width: 240 }} />
        </label>
        <label style={{ fontSize: 12, color: color.mut }}>Precio (opcional)<br />
          <input type="number" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="ej. 12990" className="mo-input mo-input--num" inputMode="numeric" style={{ width: 140 }} />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
        <Button variant="outline" onClick={preview}>Vista previa</Button>
          <Button variant="solid" tone="brand" onClick={imprimir}>Imprimir
        </Button>
      </div>
    </Card>
  )
}

function titulo(modo: ModoEtiqueta): string {
  return `${ETIQUETA[modo].emoji} Etiqueta de ${ETIQUETA[modo].nombre.toLowerCase()}`
}
function subtitulo(modo: ModoEtiqueta): string {
  return ETIQUETA[modo].dice
}

/**
 * El PDF de una etiqueta, dibujado en pantalla.
 *
 * 🔑 **Es el PDF real, no un dibujo parecido.** `buildEtiquetasPdf` ya devuelve el objeto sin
 * imprimir —`imprimirPdf` es un paso aparte—, así que mostrarlo cuesta un `bloburl` en un iframe.
 * La vista previa que había en formas de pago era HTML con tamaños en px contra un PDF en pt: se
 * veía parecida y mentía. Por eso las dos pasan por acá y no hay una segunda forma de previsualizar.
 *
 * ⚠️ **`construir` se re-ejecuta cuando cambia su identidad**, así que el llamador la memoiza con
 * las dependencias que de verdad cambian el dibujo. Formas de pago escribe letra por letra: ahí va
 * con espera, para no armar un PDF por tecla.
 */
function PreviaPdf({ construir, alt, espera = 0, vacio, retrato = false }: { construir: () => ReturnType<typeof buildEtiquetasPdf> | null; alt: string; espera?: number; vacio?: string; retrato?: boolean }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    let anterior: string | null = null
    const timer = setTimeout(() => {
      void (async () => {
        const pendiente = construir()
        if (!pendiente) {
          if (vivo) setUrl(null)
          return
        }
        const pdf = await pendiente
        // La etiqueta grande devuelve `null` cuando ninguna variante tiene SKU: sin esto la previa
        // se cae con un TypeError y se lleva la pantalla entera.
        if (!vivo || !pdf) return
        anterior = pdf.output('bloburl') as string
        setUrl(anterior)
      })()
    }, espera)
    return () => {
      vivo = false
      clearTimeout(timer)
      // El blob queda vivo hasta que se lo suelta: sin esto, cambiar de pestaña veinte veces deja
      // veinte PDF en memoria.
      if (anterior) URL.revokeObjectURL(anterior)
    }
  }, [construir, espera])

  // La caja acompaña la forma de la etiqueta: la de 10 × 15 es vertical y en un recuadro apaisado
  // queda del tamaño de una uña.
  const caja = retrato ? { width: 124, height: 186 } : { width: 200, height: 100 }
  return url ? (
    <iframe src={url} title={alt} style={{ ...caja, border: `1px solid ${color.line2}`, borderRadius: 6, background: '#fff' }} />
  ) : (
    <div style={{ ...caja, border: `1px dashed ${color.line2}`, borderRadius: 6, display: 'grid', placeItems: 'center', fontSize: 12, color: color.mut2, textAlign: 'center', padding: 6 }}>
      {vacio ?? 'Dibujando…'}
    </div>
  )
}

/**
 * La etiqueta de la pestaña, con un producto de ejemplo.
 *
 * Lo pidió Bruno: entender la etiqueta mirándola, en vez de leer un párrafo que la describa.
 */
function VistaPrevia({
  modo,
  muestra,
  ctx,
  grande,
  agrupar,
  varsSku,
}: {
  modo: ModoEtiqueta
  muestra: VarianteEti | null
  ctx: CtxEtiqueta
  /** La de 10 × 15 de la pestaña de SKU. */
  grande: boolean
  /** La previa junta los colores del producto, como haría el escaneo. Sólo en la pestaña de SKU. */
  agrupar: boolean
  varsSku: VarianteEti[]
}) {
  // 🔑 **La previa muestra lo que un escaneo de ESA prenda produciría**, colores incluidos: con las
  // opciones de la bolsa prendidas, la etiqueta de una variante sola ya no es lo que se imprime.
  const bolsa = useMemo(
    () => (agrupar && muestra ? conStock(hermanasDe(varsSku, muestra), muestra) : []),
    [agrupar, muestra, varsSku],
  )
  const construir = useCallback(() => {
    const lista = bolsa.length ? bolsa : muestra ? [muestra] : []
    if (!lista.length) return null
    return grande ? buildSkuGrandePdf([{ producto: lista[0].name || '', variantes: lista }]) : buildEtiquetasPdf(lista, modo, ctx)
  }, [modo, muestra, ctx, grande, bolsa])

  return (
    <div style={{ minWidth: grande ? 134 : 210 }}>
      <div style={{ fontSize: 12, color: color.mut, marginBottom: 6 }}>Así sale:</div>
      <PreviaPdf
        construir={construir}
        retrato={grande}
        alt={`Vista previa de la etiqueta de ${ETIQUETA[modo].nombre.toLowerCase()}`}
        vacio={muestra ? 'Dibujando…' : 'Sin productos para mostrar'}
      />
      {muestra && (
        <div style={{ fontSize: 11, color: color.mut2, marginTop: 4 }}>
          Ejemplo: {muestra.name || '—'}
          {bolsa.length > 1 && ` · ${bolsa.length} colores`}
        </div>
      )}
    </div>
  )
}

// ── La pestaña de SKU: las opciones de la bolsa y lo que dejó el último escaneo ──

/** Lo que dejó el último escaneo en la pestaña de SKU. */
type Bolsa = { escaneada: VarianteEti; hermanas: VarianteEti[]; elegidas: Set<string> }

/**
 * Cómo se nombra lo que se está por imprimir.
 *
 * 🔑 **Dice el TAMAÑO y cuántos SKU, no «4 etiquetas».** Con la grande, cuatro colores son **una
 * sola** etiqueta con cuatro SKU adentro: decir «4» al lado de una impresora que escupe una hoja
 * hace pensar que salieron mal.
 */
function textoBolsa(n: number, grande: boolean): string {
  if (!grande) return `${n} ${n === 1 ? 'etiqueta' : 'etiquetas'} de 5 × 2,5`
  const hojas = Math.max(1, Math.ceil(n / SKU_POR_BOLSA))
  return `${hojas} ${hojas === 1 ? 'etiqueta' : 'etiquetas'} de 10 × 15 con ${n} SKU`
}

function Tilde({ on, set, children }: { on: boolean; set: (on: boolean) => void; children: ReactNode }) {
  return (
    <label style={{ fontSize: 12, color: color.mut, display: 'flex', alignItems: 'flex-start', gap: 6, cursor: 'pointer' }}>
      <input type="checkbox" style={{ accentColor: 'var(--mo-brand-solid)', marginTop: 2 }} checked={on} onChange={(e) => set(e.target.checked)} />
      <span>{children}</span>
    </label>
  )
}

/**
 * Las tres opciones de la etiqueta de bolsa.
 *
 * 🔑 **Van adentro del recuadro del escáner y no abajo con las otras tildes**, porque cambian **lo
 * que hace el escaneo**: quien lo prende está mirando el campo donde va a escanear.
 */
function OpcionesSku({ cfg, set }: { cfg: ConfigSku; set: (campo: keyof ConfigSku, on: boolean) => void }) {
  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${color.brandBorder}`, display: 'grid', gap: 7 }}>
      <Tilde on={cfg.grupo} set={(x) => set('grupo', x)}>
        Imprimir también <b>los otros colores del mismo producto</b> — una etiqueta por bolsa, sin escanear color por color
      </Tilde>
      <Tilde on={cfg.grande} set={(x) => set('grande', x)}>
        Usar la etiqueta <b>grande de 10 × 15 cm</b> — todos los SKU juntos en una sola, en vez de una de 5 × 2,5 por color
      </Tilde>
      <Tilde on={cfg.elegir} set={(x) => set('elegir', x)}>
        Elegir los colores <b>antes de imprimir</b> — el escaneo abre la lista y no imprime hasta que se lo pida
      </Tilde>
      <div style={{ fontSize: 11, color: color.mut2 }}>
        Quedan guardadas en esta computadora. Las cantidades de la tabla de abajo no juntan colores: cada renglón imprime el suyo.
      </div>
    </div>
  )
}

/**
 * Lo que dejó el último escaneo: los colores del producto, cuáles se imprimieron y el botón para
 * reimprimir con otros.
 *
 * 🔑 **Queda en pantalla DESPUÉS de imprimir.** Es lo que reemplaza al «elegí antes» sin costarle
 * un paso a los días normales: se escanea, sale, y si hacía falta otro color está acá, sin ir a
 * buscar la prenda de nuevo.
 *
 * 🔑 **Los de stock cero se listan destildados, no se esconden.** Una bolsa puede existir con el
 * espejo en cero (llegó hoy, todavía no se cargó); esconderla obliga a buscar el SKU a mano.
 */
function BolsaPanel({ bolsa, grande, agrupa, tildar, imprimir, cerrar }: { bolsa: Bolsa; grande: boolean; agrupa: boolean; tildar: (id: string, on: boolean) => void; imprimir: () => void; cerrar: () => void }) {
  const elegidas = bolsa.hermanas.filter((h) => bolsa.elegidas.has(h.id)).length
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>🛍️ {bolsa.escaneada.name || '—'}</div>
        <button className="btn-sm" onClick={cerrar} style={{ background: '#fff', border: `1px solid ${color.line2}` }}>
          Cerrar
        </button>
      </div>
      {/* 🔴 **Con una sola variante hay que decir POR QUÉ, y son dos motivos distintos.** El cartel
          decía «este producto tiene un solo color», que con la tilde apagada es directamente falso:
          ni se buscaron las otras. Los dos casos se ven igual en pantalla —una fila sola— y quien
          esperaba cuatro etiquetas no tiene con qué distinguirlos. */}
      <div style={{ fontSize: 12, color: color.mut, marginBottom: 10 }}>
        {bolsa.hermanas.length > 1 ? (
          `Las ${bolsa.hermanas.length} variantes del producto. Vienen tildadas las que tienen stock; cambiá los tildes y reimprimí si hace falta otra.`
        ) : agrupa ? (
          <>
            Busqué las otras variantes de este producto y <b>no hay ninguna más con SKU</b>. Si en el local tiene más colores, en Gestión
            Nube están cargados como <b>productos separados</b> y no como variantes del mismo producto: por ahí no los puedo juntar.
          </>
        ) : (
          <>
            Está imprimiendo de a una. Para que salgan también las otras variantes del producto, prendé arriba{' '}
            <b>«Imprimir también los otros colores del mismo producto»</b>.
          </>
        )}
      </div>
      <div style={{ display: 'grid', gap: 4, marginBottom: 12 }}>
        {bolsa.hermanas.map((h) => (
          <Tilde key={h.id} on={bolsa.elegidas.has(h.id)} set={(on) => tildar(h.id, on)}>
            <b style={{ fontSize: 13, color: color.ink }}>{h.sku}</b>
            {h.size ? ` · ${h.size}` : ''}
            <span style={{ color: color.mut2 }}> · stock {h.stock || 0}</span>
            {h.id === bolsa.escaneada.id && <span style={{ color: color.mut2 }}> · escaneada</span>}
          </Tilde>
        ))}
      </div>
      <Button variant="solid" tone="brand" disabled={!elegidas} onClick={imprimir}>
        Imprimir {textoBolsa(elegidas, grande)}
      </Button>
    </Card>
  )
}

const thStyle: CSSProperties = { padding: '6px 10px', position: 'sticky', top: 0, background: color.bg2 }
function th(t: string, align: 'left' | 'right' | 'center' = 'left') {
  return <th style={{ ...thStyle, textAlign: align }}>{t}</th>
}
const tdC: CSSProperties = { padding: '5px 10px' }
