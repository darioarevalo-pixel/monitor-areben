'use client'

/**
 * ERP › Stock › Ajustes (diseño §7, Bruno 19-oct; rediseño con las reglas de Transferencias, Darío 19-nov). Dos cosas:
 * **cargar un ajuste a mano** (Ingreso · Salida con motivo: Con falla · Canje · Regalo · Otro con el porqué) y **la lista de
 * los ajustes hechos**, con el detalle en VENTANA (como Transferencias y Movimientos).
 *
 * 🔑 Bruno, 19-oct: ⛔ se cuenta en el ERP. El ERP se IGUALÓ a GN (los «Igualado a GN» de la lista) y lo que se cuenta en el
 * módulo de Conteo del monitor entra solo (se ve en el historial de la prenda) ⇒ ⛔ lista «A contar», ⛔ motivo «Conteo» a mano.
 * La aprobación está APAGADA («somos pocos, burocracia») ⇒ «Guardar» = `crearAjuste` + `aprobarAjuste` en un gesto
 * (el contrato de B ⛔ cambia). Si el 2º paso falla, el ajuste queda «Pendiente» y se aplica desde su ventana.
 * Hasta el corte mueve SÓLO el stock del ERP (⛔ GN ni Tienda Nube). Nada se borra: un ajuste equivocado se arregla con otro.
 *
 * Reglas de Darío (Transferencias, 18-nov): botón principal índigo, anular/descartar rojo a la izquierda; el buscador es el
 * MISMO de Transferencias (código al instante, nombre como tabla con la cantidad); en una salida sólo se ofrece lo que hay en
 * el depósito; tabla mínima y el número en rojo SÓLO si es problema; sin subtítulos que explican lo obvio.
 *
 * 📱 En el celular (Bruno, 29-oct) el nuevo ajuste ocupa la pantalla: cada producto en una tarjeta con la cantidad grande
 * (+ y −) y el antes → después, y «Guardar ajuste» fijo al pie.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  Button, EmptyState, Field, Input, Modal, Notice, PasoCantidad, SectionCard, Select, TableWrap, TBody, Td, Th, THead, Tr, space, weight,
} from '@/components/ui'
import { usePantallaAngosta } from '@/lib/movil'
import { IconoFila, ListaTrabajo, type ColumnaLista } from '@/components/ui/ListaTrabajo'
import { Icono } from '@/components/ui/Icono'
import { BOTON_PIE, PieFijo } from '@/components/ui/FichaCostado'
import { BuscadorLista, ChipEstado, VistasLista, cuandoCorto as cuando } from '@/components/ui/PiezasLista'
import { color, font, toneTokens } from '@/components/ui/tokens'
import {
  aprobarAjuste, crearAjuste, descartarAjuste, eliminarAjuste, leerAjustes, leerListaDeStock, leerStockDePrenda,
  type AjusteStock, type AjustesDeLinea, type AvisoAjuste, type LineaErp, type MarcaErp, type PrendaEncontrada,
} from '@/lib/erp/cliente'
import { MOTIVOS, baseDe } from '@/lib/erp/ajuste.core.js'
import { NOMBRE_DEPOSITO } from '@/lib/erp/stock.core.js'
import type { PrendaAAjustar } from './stock/StockErp'
import { Escaneo } from './stock/MoverYRecibir'
import { deLaTienda, useTiendaErp } from '@/lib/erp/linea-erp'
import { usePuedeErp } from '@/lib/erp/usePuedeErp'
import { useConfirmar } from '@/components/ui/Confirm'
import type { AlContar } from './ListasJuntas'

// Depósito mayorista APAGADO (Darío 18-nov): viene del sistema viejo, nunca se usó en el ERP y elegirlo por error «perdía» mercadería.
const DEPOSITOS: Record<MarcaErp, string[]> = { bdi: ['local', 'deposito_minorista'], zattia: ['local', 'deposito'] }
/** Los motivos que se cargan a mano: el conteo entra solo desde el monitor (⛔ va en el menú). */
export const MOTIVOS_A_MANO = MOTIVOS.filter((m) => m.key !== 'conteo')
/** El mismo porqué que da el servidor (`api/_erp-ajustes.js`), antes de guardar. */
export const QUEDA_NEGATIVO = 'No hay stock suficiente. Si el producto está, contalo primero.'
// «Para aprobar» ⛔ (la aprobación está apagada): es un ajuste guardado que todavía no cambió el stock.
// «Eliminado» (Bruno 18-nov): el aplicado que Admin volvió atrás; queda en la lista y el stock vuelve a como estaba.
const ESTADO = { para_aprobar: ['warning', 'Pendiente'], aplicado: ['success', 'Aplicado'], rechazado: ['neutral', 'Descartado'], eliminado: ['neutral', 'Eliminado'] } as const
const VISTAS = [['todos', 'Todos'], ['sinaplicar', 'Pendientes']] as const
const COLUMNAS: ColumnaLista[] = [
  { key: 'n', titulo: 'Nº', ancho: '70px', movil: 'oculta' },
  { key: 'h', titulo: 'Fecha', ancho: '110px', movil: 'chico' },
  { key: 'motivo', titulo: 'Motivo', ancho: 'minmax(200px, 1.6fr)', movil: 'titulo' },
  { key: 'dep', titulo: 'Ubicación', ancho: '150px', movil: 'chico' },
  { key: 'quien', titulo: 'Responsable', ancho: '120px', movil: 'oculta' },
  { key: 'estado', titulo: 'Estado', ancho: '120px', movil: 'chico' },
  { key: 'prendas', titulo: 'Productos', ancho: '90px', derecha: true, movil: 'oculta' },
  { key: 'neto', titulo: 'Unidades', ancho: '90px', derecha: true, movil: 'dato' },
]
const deposito = (d: string) => (NOMBRE_DEPOSITO as Record<string, string>)[d] ?? d
const conSigno = (n: number) => (n > 0 ? `+${n}` : String(n))
const productos = (n: number) => `${n} ${n === 1 ? 'producto' : 'productos'}`
const prendaDe = (p: { nombre: string | null; talleNombre: string | null; sku: string | null }) =>
  p.nombre ? `${p.nombre}${p.talleNombre ? ` · ${p.talleNombre}` : ''}` : p.sku ?? 'Producto sin nombre'
const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Un renglón del ajuste que se está armando: el stock por depósito se lee al agregar la prenda. */
type Renglon = {
  producto: string; talle: string; sku: string | null; barcode: string | null; nombre: string | null; talleNombre: string | null
  porDeposito: Record<string, { libro: number; gn: number | null }> | null; valor: string
}
type Sentido = 'ingreso' | 'salida'
type Borrador = { deposito: string; sentido: Sentido | null; motivo: string; detalle: string; renglones: Renglon[] }

type PrendaDeAjuste = { producto: string; talle: string; sku: string | null; barcode?: string | null; nombre: string | null; talleNombre: string | null }
const renglonDe = (p: PrendaDeAjuste, porDeposito: Renglon['porDeposito'] = null, valor = ''): Renglon => ({ producto: p.producto, talle: p.talle, sku: p.sku, barcode: p.barcode ?? null, nombre: p.nombre, talleNombre: p.talleNombre, porDeposito, valor })
const mismo = (a: { producto: string; talle: string }, b: { producto: string; talle: string }) => a.producto === b.producto && a.talle === b.talle

export function AjustesStock({ pedida = null, alContar, enErp: _enErp = false }: { pedida?: PrendaAAjustar | null; alContar?: AlContar; /** La línea ya cortó (queda por compatibilidad: el aviso de GN se fue con el rediseño). */ enErp?: boolean } = {}) {
  // La del selector del menú (⛔ pestañas de otra marca: Bruno, 28-oct). Cambiarla remonta la pantalla (`key` en `Erp`).
  const linea: LineaErp = useTiendaErp()
  const base = baseDe(linea) as MarcaErp
  // 10-nov: cargar un ajuste es `ajustar` (Depósito): el rol que ⛔ puede ⛔ ve «Nuevo ajuste».
  const puede = usePuedeErp(base)
  const ajusta = puede('ajustar')
  // «Eliminar» un aplicado: sólo Admin (`configurar`; el servidor frena igual).
  const admin = puede('configurar')
  const [datos, setDatos] = useState<AjustesDeLinea | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<{ texto: string; avisos: AvisoAjuste[] } | null>(null)
  const [vuelta, setVuelta] = useState(0)
  const [trabajando, setTrabajando] = useState(false)
  // Desde la lista de Stock («Ajustar»): arranca con el ajuste abierto y la prenda cargada.
  const [borrador, setBorrador] = useState<Borrador | null>(() => (pedida ? { deposito: DEPOSITOS[baseDe(pedida.linea) as MarcaErp][0], sentido: null, motivo: '', detalle: '', renglones: [renglonDe(pedida)] } : null))
  const [descartando, setDescartando] = useState<{ id: string; motivo: string } | null>(null)
  const [ficha, setFicha] = useState<string | null>(null)
  const [vista, setVista] = useState<string>('todos')
  const [q, setQ] = useState('')
  // El stock por depósito de toda la línea y código → producto (la misma lista que Transferencias): el escaneo es instantáneo.
  const [stockDeps, setStockDeps] = useState<Record<string, Record<string, number>> | null>(null)
  const [porCodigo, setPorCodigo] = useState<Map<string, PrendaEncontrada>>(() => new Map())
  // 📱 En el celular el nuevo ajuste ocupa la pantalla: la lista vuelve al guardar o cancelar.
  const angosta = usePantallaAngosta()
  const enTarea = angosta && !!borrador
  const { confirmar } = useConfirmar()

  useEffect(() => {
    let vivo = true
    leerAjustes(linea)
      // ⛔ borra el error: el «quedó sin aplicar» de `guardar` se muestra JUSTO después de releer (lo borra cambiar de línea).
      .then((d) => { if (vivo) setDatos(d) })
      .catch((e) => vivo && setError(e instanceof Error ? e.message : 'No se pudieron leer los ajustes.'))
    return () => { vivo = false }
  }, [linea, vuelta])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const l = await leerListaDeStock(base)
        if (!vivo || !Array.isArray(l?.filas)) return
        const m = new Map<string, PrendaEncontrada>()
        for (const f of l.filas) {
          if (deLaTienda([f], linea).length === 0) continue
          const p: PrendaEncontrada = { producto: String(f.producto), talle: String(f.talle), nombre: f.nombre ?? null, talleNombre: f.talleNombre ?? null, sku: f.sku ?? null, barcode: f.barcode ?? null, gn: 0 }
          if (f.barcode) m.set(String(f.barcode).toLowerCase(), p)
          if (f.sku) m.set(String(f.sku).toLowerCase(), p)
        }
        setPorCodigo(m)
        if (l.filas.some((f) => f.deps)) setStockDeps(Object.fromEntries(l.filas.filter((f) => f.deps).map((f) => [`${f.producto}:${f.talle}`, f.deps as Record<string, number>])))
      } catch { /* el código va al servidor y el stock se lee producto por producto */ }
    })()
    return () => { vivo = false }
  }, [base, linea, vuelta])

  // Pantalla junta (`ListasJuntas`): el número de su opción es el de la vista con la que abre.
  useEffect(() => { alContar?.(datos ? datos.ajustes.length : null) }, [alContar, datos])

  const motivo = MOTIVOS_A_MANO.find((m) => m.key === borrador?.motivo) ?? MOTIVOS_A_MANO[0]
  const deLaLista = (p: { producto: string; talle: string }): Renglon['porDeposito'] => {
    const d = stockDeps?.[`${p.producto}:${p.talle}`]
    return d ? Object.fromEntries(Object.entries(d).map(([k, n]) => [k, { libro: n, gn: null }])) : null
  }

  /** Fija la cantidad de un producto (lo agrega si no está). Con 0 desde la tabla del buscador, lo saca. */
  function fijar(p: PrendaDeAjuste, n: number, sacarEnCero = false) {
    const nuevo = !borrador?.renglones.some((r) => mismo(r, p))
    setBorrador((b) => {
      if (!b) return b
      if (!b.renglones.some((r) => mismo(r, p))) return n > 0 ? { ...b, renglones: [...b.renglones, renglonDe(p, deLaLista(p), String(n))] } : b
      if (sacarEnCero && n <= 0) return { ...b, renglones: b.renglones.filter((r) => !mismo(r, p)) }
      return { ...b, renglones: b.renglones.map((r) => (mismo(r, p) ? { ...r, valor: String(n) } : r)) }
    })
    if (nuevo && n > 0) void leerRenglon(p)
  }
  /** Un escaneo suma 1 sobre lo ÚLTIMO guardado (como `sumarEscaneo` en Transferencias): dos lecturas seguidas del mismo código
   *  antes de redibujar contaban 1 (se medía con 10 escaneos de pistola: llegaban 9). */
  function sumarUno(p: PrendaDeAjuste) {
    const nuevo = !borrador?.renglones.some((r) => mismo(r, p))
    setBorrador((b) => {
      if (!b) return b
      const ya = b.renglones.find((r) => mismo(r, p))
      if (!ya) return { ...b, renglones: [...b.renglones, renglonDe(p, deLaLista(p), '1')] }
      return { ...b, renglones: b.renglones.map((r) => (r === ya ? { ...r, valor: String(Math.abs(Number(r.valor) || 0) + 1) } : r)) }
    })
    if (nuevo) void leerRenglon(p)
  }
  const cantidadDe = (p: { producto: string; talle: string }) => Math.abs(Number(borrador?.renglones.find((r) => mismo(r, p))?.valor) || 0)

  /** Lo que dice el ERP de la prenda en cada depósito, recién leído: el «antes» del renglón. */
  async function leerRenglon(p: { producto: string; talle: string }) {
    try {
      const s = await leerStockDePrenda(base, p.producto, p.talle)
      const porDeposito = Object.fromEntries(s.depositos.map((d) => [d.deposito, { libro: d.libro, gn: d.gn }]))
      setBorrador((b) => b && { ...b, renglones: b.renglones.map((r) => (mismo(r, p) ? { ...r, porDeposito, barcode: r.barcode ?? s.prenda.barcode ?? null } : r)) })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el stock del producto.')
    }
  }

  useEffect(() => {
    if (pedida) void leerRenglon(pedida)
    // Una sola vez: `Erp` monta la pestaña de nuevo (key) para cada prenda pedida.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Guardar = crear + aplicar (la aprobación está apagada). */
  async function guardar() {
    if (!borrador) return
    // Antes de tocar el stock, el resumen producto por producto (Darío, 19-nov).
    const ok = await confirmar({
      titulo: `¿${textoGuardar} ${borrador.sentido === 'ingreso' ? 'en' : 'de'} ${deposito(borrador.deposito)}?`,
      mensaje: <ResumenAjuste motivo={borrador.sentido === 'ingreso' ? 'Ingreso' : motivo.label} detalle={borrador.detalle.trim()}
        filas={borrador.renglones.map((x) => ({ nombre: prendaDe(x), sku: x.sku, antes: libroEn(x), cambio: salen(x) ?? 0 }))} />,
      ok: textoGuardar, cancelar: 'Volver',
    })
    if (!ok) return
    setTrabajando(true)
    let creado: { numero: number; id: string; avisos: AvisoAjuste[] } | null = null
    try {
      creado = await crearAjuste({
        linea, deposito: borrador.deposito, motivo: borrador.motivo, detalle: borrador.detalle, fuente: 'mano',
        // Fallado/Canje/Regalo: lo que sale, en positivo (contrato de B); Otro: con signo, según Ingreso o Salida.
        renglones: borrador.renglones.map((x) => ({ producto: x.producto, talle: x.talle, sku: x.sku, barcode: x.barcode, cantidad: motivo.pide === 'sale' ? Math.abs(Number(x.valor)) : salen(x) ?? 0 })),
      })
      const r = await aprobarAjuste(linea, creado.id)
      setHecho({ texto: `Ajuste A-${r.numero} aplicado · ${productos(r.movimientos)}.`, avisos: [...creado.avisos, ...r.avisos] })
      setBorrador(null)
      setError(null)
    } catch (e) {
      const m = e instanceof Error ? e.message : 'No se pudo guardar el ajuste.'
      // Se creó pero ⛔ se aplicó: queda «Pendiente» y el borrador se suelta para ⛔ crearlo dos veces.
      if (creado) { setBorrador(null); setVista('sinaplicar'); console.error(m); setError(`A-${creado.numero} quedó pendiente: confirmalo en Pendientes.`) }
      else setError(m)
    } finally {
      setTrabajando(false)
      setVuelta((n) => n + 1)
    }
  }

  /** «Eliminar» un aplicado (Bruno 18-nov): el stock vuelve a como estaba y el ajuste queda «Eliminado» en la lista. */
  async function eliminar(a: AjusteStock) {
    const ok = await confirmar({
      titulo: `¿Eliminar el ajuste A-${a.numero}?`,
      mensaje: <ResumenAjuste motivo={`${a.motivoNombre} · vuelve a como estaba`} detalle="" filas={a.renglones.map((r) => ({ nombre: prendaDe(r), sku: r.sku, antes: null, cambio: -r.diferencia }))} />,
      ok: `Eliminar A-${a.numero}`, cancelar: 'Volver', tono: 'danger',
    })
    if (!ok) return
    setTrabajando(true)
    try {
      const r = await eliminarAjuste(linea, a.id)
      setHecho({ texto: `Ajuste A-${r.numero} eliminado.`, avisos: [] })
      setFicha(null)
      setError(null)
      setVuelta((n) => n + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar el ajuste.')
    } finally {
      setTrabajando(false)
    }
  }

  async function resolver(a: AjusteStock, aplicar: boolean) {
    setTrabajando(true)
    try {
      if (aplicar) {
        const r = await aprobarAjuste(linea, a.id)
        setHecho({ texto: `Ajuste A-${r.numero} aplicado · ${productos(r.movimientos)}.`, avisos: r.avisos })
      } else {
        const r = await descartarAjuste(linea, a.id, descartando?.motivo ?? '')
        setHecho({ texto: `Ajuste A-${r.numero} descartado.`, avisos: [] })
        setDescartando(null)
      }
      setFicha(null)
      setError(null)
      setVuelta((n) => n + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo resolver el ajuste.')
    } finally {
      setTrabajando(false)
    }
  }

  const todos = useMemo(() => datos?.ajustes ?? [], [datos])
  const conteo = useMemo(() => ({ todos: todos.length, sinaplicar: todos.filter((a) => a.estado === 'para_aprobar').length }), [todos])
  const filas = useMemo(() => {
    const t = sinTildes(q.trim())
    return todos.filter((a) => (vista !== 'sinaplicar' || a.estado === 'para_aprobar') && (!t || sinTildes([
      `a-${a.numero}`, String(a.numero), a.motivoNombre, a.detalle ?? '', a.creadoPor, deposito(a.deposito), ...a.renglones.map((r) => `${prendaDe(r)} ${r.sku ?? ''}`),
    ].join(' ')).includes(t)))
  }, [todos, vista, q])
  const abierta = todos.find((a) => a.id === ficha) ?? null
  const salen = (r: Renglon) => {
    if (r.valor.trim() === '' || !Number.isInteger(Number(r.valor)) || Number(r.valor) === 0) return null
    const n = Math.abs(Number(r.valor))
    return borrador?.sentido === 'ingreso' ? n : -n
  }
  const libroEn = (r: Renglon) => r.porDeposito ? r.porDeposito[borrador?.deposito ?? '']?.libro ?? 0 : null
  /** Una salida que deja el depósito en negativo: el motor la rechaza (`QUEDA_NEGATIVO`) ⇒ se marca en rojo y ⛔ se guarda. */
  const quedaNegativo = (r: Renglon) => {
    const d = salen(r)
    const libro = libroEn(r)
    return d != null && d < 0 && libro != null && libro + d < 0
  }
  const sePasan = borrador?.renglones.some((r) => quedaNegativo(r)) ?? false
  const faltante = !borrador ? null
    : !borrador.sentido ? 'Elegí si es un ingreso o una salida'
      : !borrador.motivo ? 'Elegí el motivo'
        : borrador.motivo === 'otro' && !borrador.detalle.trim() ? 'Escribí el porqué'
          : !borrador.renglones.length ? 'Agregá un producto'
            : borrador.renglones.some((r) => salen(r) == null) ? 'Escribí la cantidad'
              : sePasan ? `No hay stock suficiente en ${deposito(borrador.deposito)}. Bajá lo marcado en rojo.`
                : null
  const listo = !!borrador && !faltante
  const unidadesNuevas = borrador?.renglones.reduce((s, r) => s + Math.abs(Number(r.valor) || 0), 0) ?? 0
  const textoGuardar = !borrador?.sentido || !unidadesNuevas ? 'Guardar ajuste'
    : `${borrador.sentido === 'ingreso' ? 'Ingresar' : 'Sacar'} ${unidadesNuevas} ${unidadesNuevas === 1 ? 'unidad' : 'unidades'}`

  const cancelarNuevo = () => setBorrador(null)
  const elegirSentido = (t: Sentido) => borrador && setBorrador({ ...borrador, sentido: t, motivo: t === 'ingreso' ? 'otro' : '', renglones: borrador.renglones.map((r) => ({ ...r, valor: '' })) })

  const celda = (a: AjusteStock, k: string): React.ReactNode => {
    if (k === 'n') return <b style={{ color: color.ink }}>A-{a.numero}</b>
    if (k === 'h') return <span style={{ color: color.mut }}>{cuando(a.creadoEn)}</span>
    if (k === 'motivo') return <span title={a.detalle ? `${a.motivoNombre} · ${a.detalle}` : a.motivoNombre}><span style={{ fontWeight: weight.semibold, color: color.ink }}>{a.motivoNombre}</span>{a.detalle ? <span style={{ color: color.mut, marginLeft: 6 }}>{a.detalle}</span> : null}</span>
    if (k === 'dep') return deposito(a.deposito)
    if (k === 'prendas') return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{a.renglones.length}</span>
    if (k === 'neto') return <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: weight.semibold, color: color.ink }}>{conSigno(a.neto)}</span>
    if (k === 'estado') return <ChipEstado mapa={ESTADO} k={a.estado} />
    if (k === 'quien') return <span style={{ color: color.ink2 }}>{a.creadoPor}</span>
    return null
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      {!borrador && ajusta && datos && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="solid" tone="brand" onClick={() => { setBorrador({ deposito: DEPOSITOS[base][0], sentido: null, motivo: '', detalle: '', renglones: [] }); setHecho(null); setError(null) }}>Nuevo ajuste</Button>
        </div>
      )}

      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      {hecho && (
        <Notice tone="success" onClose={() => setHecho(null)}>
          {hecho.texto}
          {hecho.avisos.map((a, i) => <div key={i} style={{ marginTop: 4 }}>⚠️ {a.texto}</div>)}
        </Notice>
      )}

      {borrador && (
        <SectionCard title="Nuevo ajuste">
          <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Field label="Tipo">
              <div role="group" aria-label="Ingreso o salida" style={{ display: 'flex', gap: space[1] }}>
                {(['ingreso', 'salida'] as const).map((t) => (
                  <Button key={t} variant={borrador.sentido === t ? 'solid' : 'outline'} tone={borrador.sentido === t ? 'brand' : undefined} aria-pressed={borrador.sentido === t} onClick={() => elegirSentido(t)}>
                    {t === 'ingreso' ? 'Ingreso' : 'Salida'}
                  </Button>
                ))}
              </div>
            </Field>
            {borrador.sentido === 'salida' && (
              <Field label="Motivo">
                <Select value={borrador.motivo} onChange={(e) => setBorrador({ ...borrador, motivo: e.target.value })}>
                  <option value="">Elegir…</option>
                  {MOTIVOS_A_MANO.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Ubicación">
              <Select value={borrador.deposito} onChange={(e) => setBorrador({ ...borrador, deposito: e.target.value })}>
                {DEPOSITOS[base].map((d) => <option key={d} value={d}>{deposito(d)}</option>)}
              </Select>
            </Field>
            <div style={{ flex: '1 1 220px' }}>
              <Field label="Detalle">
                <Input value={borrador.detalle} maxLength={200} onChange={(e) => setBorrador({ ...borrador, detalle: e.target.value })} placeholder={borrador.motivo === 'otro' ? 'Obligatorio · ej.: apareció en el depósito' : borrador.motivo === 'fallado' ? 'Opcional · ej.: costura abierta' : 'Opcional'} />
              </Field>
            </div>
          </div>

          {/* El MISMO buscador de Transferencias. Hasta elegir Ingreso o Salida ⛔ se ofrece: en una salida sólo va lo que hay. */}
          {borrador.sentido && (
            <div style={{ marginTop: space[3] }}>
              <Escaneo autoFocus={!angosta && !pedida} linea={linea} local={(c) => porCodigo.get(c.trim().toLowerCase()) ?? null}
                rotuloCantidad="Cantidad" conTodo={false} cantidadDe={cantidadDe}
                {...(borrador.sentido === 'salida'
                  ? { origen: deposito(borrador.deposito), hayDe: (p: { producto: string; talle: string }) => (stockDeps ? Math.max(0, stockDeps[`${p.producto}:${p.talle}`]?.[borrador.deposito] ?? 0) - cantidadDe(p) : null) }
                  : { destino: deposito(borrador.deposito), destinoDe: (p: PrendaEncontrada) => (stockDeps ? Math.max(0, stockDeps[`${p.producto}:${p.talle}`]?.[borrador.deposito] ?? 0) : null) })}
                onCantidad={(p, n) => fijar(p, n, true)} onPrenda={sumarUno} />
            </div>
          )}

          {borrador.renglones.length > 0 && angosta ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: space[2], marginTop: space[3] }}>
              {borrador.renglones.map((r) => (
                <TarjetaDeAjuste key={`${r.producto}:${r.talle}`} r={r} deposito={borrador.deposito} pide={borrador.sentido === 'ingreso' ? 'ingreso' : 'sale'} cambio={salen(r)}
                  onValor={(valor) => setBorrador({ ...borrador, renglones: borrador.renglones.map((x) => (x === r ? { ...x, valor } : x)) })}
                  onSacar={() => setBorrador({ ...borrador, renglones: borrador.renglones.filter((x) => x !== r) })} />
              ))}
            </div>
          ) : borrador.renglones.length > 0 ? (
            <TableWrap style={{ marginTop: space[3] }}>
              <THead>
                <Tr>
                  <Th>Producto ({borrador.renglones.length})</Th>
                  <Th style={{ textAlign: 'right' }}>Stock en {deposito(borrador.deposito)}</Th>
                  <Th style={{ textAlign: 'right' }}>Cantidad</Th>
                  <Th style={{ textAlign: 'right' }}>Queda</Th><Th />
                </Tr>
              </THead>
              <TBody>
                {borrador.renglones.map((r) => {
                  const libro = libroEn(r)
                  const d = salen(r)
                  const rojo = quedaNegativo(r)
                  return (
                    <Tr key={`${r.producto}:${r.talle}`}>
                      <Td><b style={{ fontWeight: weight.semibold, color: color.ink }}>{prendaDe(r)}</b>{r.sku && <span style={{ marginLeft: 8, fontSize: font.sm, color: color.mut }}>{r.sku}</span>}</Td>
                      <Td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: rojo ? 'var(--mo-danger-ink)' : color.ink2 }}>{libro ?? '…'}</Td>
                      <Td style={{ textAlign: 'right' }}>
                        <Input value={r.valor} type="number" min={0} inputMode="numeric" placeholder="0" aria-label={`Cantidad de ${prendaDe(r)}`} style={{ width: 80, textAlign: 'right' }} disabled={!borrador.sentido}
                          onChange={(e) => setBorrador({ ...borrador, renglones: borrador.renglones.map((x) => (x === r ? { ...x, valor: e.target.value } : x)) })} />
                      </Td>
                      <Td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{d == null || libro == null ? '—' : rojo ? <span data-negativo style={{ color: 'var(--mo-danger-ink)', fontWeight: weight.semibold }}>{libro + d}</span> : <b style={{ color: color.ink }}>{libro + d}</b>}</Td>
                      <Td style={{ width: 44 }}><IconoFila label={`Sacar ${prendaDe(r)}`} onClick={() => setBorrador({ ...borrador, renglones: borrador.renglones.filter((x) => x !== r) })}><Icono nombre="cruz" size={16} /></IconoFila></Td>
                    </Tr>
                  )
                })}
              </TBody>
            </TableWrap>
          ) : null}

          {/* 📱 El pie fijo ⛔ tiene lugar para el porqué: sin esto «Guardar» quedaba gris sin explicar. */}
          {faltante && <div data-falta style={{ marginTop: space[3], fontSize: font.sm, color: sePasan ? 'var(--mo-danger-ink)' : color.mut }}>{faltante}</div>}

          {!angosta && (
            <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', marginTop: space[4], paddingTop: space[3], borderTop: `1px solid ${color.line}` }}>
              <Button variant="outline" disabled={trabajando} onClick={cancelarNuevo}>Cancelar</Button>
              <span style={{ flex: 1 }} />
              <Button variant="solid" tone="brand" disabled={trabajando || !listo} onClick={guardar}>{textoGuardar}</Button>
            </div>
          )}
        </SectionCard>
      )}

      {enTarea && (
        <PieFijo etiqueta="Acciones · nuevo ajuste" data-pie-tarea>
          <Button variant="outline" disabled={trabajando} onClick={cancelarNuevo} style={{ ...BOTON_PIE, flex: '0 0 auto' }}>Cancelar</Button>
          <Button variant="solid" tone="brand" disabled={trabajando || !listo} onClick={guardar} style={BOTON_PIE}>{textoGuardar}</Button>
        </PieFijo>
      )}

      {!enTarea && !borrador && <>
        {!datos && !error && <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: 14, padding: space[6] }}><EmptyState title="Leyendo…" /></div>}
        {datos && (
          <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: 14, overflow: 'hidden' }}>
            <VistasLista vistas={VISTAS} valor={vista} conteo={conteo} onCambio={setVista} />
            <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center', padding: 12 }}>
              <BuscadorLista valor={q} onCambio={setQ} etiqueta="Buscar en los ajustes" placeholder="Nº, producto, motivo o responsable" />
              <Button variant="outline" onClick={() => setVuelta((n) => n + 1)}>Actualizar</Button>
            </div>
            <ListaTrabajo
              columnas={COLUMNAS} filas={filas} claveDe={(a) => a.id} celda={celda} activa={ficha}
              onAbrir={(a) => { setFicha(a.id); setDescartando(null) }} etiquetaFila={(a) => `el ajuste A-${a.numero}`}
              vacio={<div style={{ padding: space[6] }}><EmptyState title={q ? `Ningún ajuste coincide con «${q}».` : vista === 'sinaplicar' ? 'No hay ajustes pendientes.' : 'No hay ajustes.'} /></div>}
            />
            <div style={{ padding: '8px 16px', fontSize: font.sm, color: color.mut, borderTop: `1px solid ${color.bg2}` }}>{filas.length.toLocaleString('es-AR')} de {todos.length.toLocaleString('es-AR')}</div>
          </div>
        )}
      </>}

      {abierta && <VentanaAjuste a={abierta} trabajando={trabajando} puede={ajusta} onEliminar={admin && abierta.eliminable ? () => eliminar(abierta) : null} descartando={descartando?.id === abierta.id ? descartando.motivo : null}
        onCerrar={() => { setFicha(null); setDescartando(null) }} onAplicar={() => resolver(abierta, true)}
        onDescartar={(m) => (m == null ? setDescartando({ id: abierta.id, motivo: '' }) : setDescartando({ id: abierta.id, motivo: m }))} onConfirmarDescarte={() => resolver(abierta, false)} />}
    </div>
  )
}

/**
 * El detalle de un ajuste en VENTANA (como Transferencias): arriba qué es, dónde y cuántas unidades; la tabla con lo que cambió
 * cada producto; abajo, si quedó pendiente, Descartar (rojo, a la izquierda) y Confirmar (índigo, a la derecha).
 */
function VentanaAjuste({ a, trabajando, puede, onEliminar, descartando, onCerrar, onAplicar, onDescartar, onConfirmarDescarte }: {
  a: AjusteStock; trabajando: boolean; puede: boolean; onEliminar: (() => void) | null; descartando: string | null
  onCerrar: () => void; onAplicar: () => void; onDescartar: (motivo: string | null) => void; onConfirmarDescarte: () => void
}) {
  const th: React.CSSProperties = { textAlign: 'right', padding: '10px 12px', fontWeight: weight.semibold, color: color.mut, fontSize: font.sm, whiteSpace: 'nowrap', background: color.bg2 }
  const td: React.CSSProperties = { textAlign: 'right', padding: '10px 12px', fontVariantNumeric: 'tabular-nums', borderTop: `1px solid ${color.line}` }
  const pendiente = a.estado === 'para_aprobar'
  const titulo = (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: space[4], flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 240px', minWidth: 0 }}>
        <div style={{ fontSize: font.sm, fontWeight: weight.semibold, letterSpacing: '0.06em', textTransform: 'uppercase', color: color.mut }}>Ajuste A-{a.numero} · {deposito(a.deposito)}</div>
        <div style={{ fontSize: 22, fontWeight: weight.bold, color: color.ink, marginTop: 2 }}>{a.motivoNombre}</div>
        <div style={{ marginTop: 6 }}><ChipEstado mapa={ESTADO} k={a.estado} /></div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: font.sm, color: color.mut }}>Unidades</div>
        <div style={{ fontSize: 30, fontWeight: weight.bold, color: color.ink, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{conSigno(a.neto)}</div>
      </div>
    </div>
  )
  const pie = pendiente && puede ? (
    <div style={{ display: 'flex', gap: space[2], width: '100%', flexWrap: 'wrap', alignItems: 'flex-end' }}>
      {descartando == null ? (
        <Button variant="outline" tone="danger" disabled={trabajando} onClick={() => onDescartar(null)}>Descartar ajuste</Button>
      ) : (
        <>
          <div style={{ flex: '1 1 220px' }}><Field label="Motivo del descarte">
            <Input autoFocus value={descartando} onChange={(e) => onDescartar(e.target.value)} placeholder="Ej.: se cargó otro modelo" />
          </Field></div>
          <Button variant="solid" tone="danger" disabled={trabajando || descartando.trim().length < 3} onClick={onConfirmarDescarte}>Descartar A-{a.numero}</Button>
        </>
      )}
      <span style={{ flex: 1 }} />
      {descartando == null && <Button variant="solid" tone="brand" disabled={trabajando} onClick={onAplicar}>Confirmar ajuste</Button>}
    </div>
  ) : a.estado === 'aplicado' && onEliminar ? (
    <div style={{ display: 'flex', width: '100%' }}>
      <Button variant="outline" tone="danger" disabled={trabajando} onClick={onEliminar}>Eliminar ajuste</Button>
    </div>
  ) : undefined
  return (
    <Modal abierto onCerrar={onCerrar} variante="pos" ancho="xl" titulo={titulo} pie={pie}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
        <div style={{ display: 'flex', gap: space[6], flexWrap: 'wrap', fontSize: font.base }}>
          <Dato titulo="Creado por">{a.creadoPor} · {cuando(a.creadoEn)}</Dato>
          {a.resueltoPor && a.resueltoEn && <Dato titulo={a.estado === 'rechazado' ? 'Descartado por' : 'Aplicado por'}>{a.resueltoPor} · {cuando(a.resueltoEn)}</Dato>}
          {a.eliminadoPor && a.eliminadoEn && <Dato titulo="Eliminado por">{a.eliminadoPor} · {cuando(a.eliminadoEn)}</Dato>}
          {a.detalle && <Dato titulo="Nota">{a.detalle}</Dato>}
          {a.rechazo && <Dato titulo="Motivo del descarte">{a.rechazo}</Dato>}
        </div>
        <div className="erp-tabla-desliza" style={{ border: `1px solid ${color.line}`, borderRadius: 12, overflow: 'hidden' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: font.base }}>
          <thead>
            <tr><th style={{ ...th, textAlign: 'left' }}>Producto ({a.renglones.length})</th><th style={th}>Stock</th><th style={th}>Cantidad</th></tr>
          </thead>
          <tbody>
            {a.renglones.map((r) => (
              <tr key={r.n}>
                <td style={{ ...td, textAlign: 'left' }}><b style={{ color: color.ink }}>{prendaDe(r)}</b>{r.sku && <span style={{ marginLeft: 8, fontSize: font.sm, color: color.mut }}>{r.sku}</span>}</td>
                <td style={{ ...td, color: color.mut }}>{r.antes} → {r.despues}</td>
                <td style={td}><b style={{ color: color.ink }}>{conSigno(r.diferencia)}</b></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </Modal>
  )
}

/** Lo que muestra la confirmación antes de guardar: el motivo y cada producto con su stock antes → después. */
function ResumenAjuste({ motivo, detalle, filas }: { motivo: string; detalle: string; filas: { nombre: string; sku: string | null; antes: number | null; cambio: number }[] }) {
  const td: React.CSSProperties = { padding: '8px 0', borderTop: `1px solid ${color.line}`, fontVariantNumeric: 'tabular-nums', textAlign: 'right', whiteSpace: 'nowrap' }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[3], whiteSpace: 'normal' }}>
      <Dato titulo="Motivo">{motivo}{detalle ? <span style={{ color: color.mut, fontWeight: weight.normal }}> · {detalle}</span> : null}</Dato>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: font.base }}>
        <tbody>
          {filas.map((f) => (
            <tr key={`${f.nombre}:${f.sku}`}>
              <td style={{ ...td, textAlign: 'left', whiteSpace: 'normal', paddingRight: 12 }}><b style={{ color: color.ink, fontWeight: weight.semibold }}>{f.nombre}</b></td>
              <td style={{ ...td, color: color.mut, paddingRight: 16 }}>{f.antes == null ? '' : `${f.antes} → ${f.antes + f.cambio}`}</td>
              <td style={td}><b style={{ color: color.ink }}>{conSigno(f.cambio)}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Dato({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: font.sm, color: color.mut }}>{titulo}</div>
      <div style={{ color: color.ink, fontWeight: weight.medium }}>{children}</div>
    </div>
  )
}

/**
 * 📱 Un producto del nuevo ajuste, en el celular: el stock en ese depósito, la cantidad grande (+ y −) y el antes → después.
 * Fallado, canje y regalo cuentan lo que SALE (0 para arriba); «Otro» va con signo (+ entra, − sale).
 */
export function TarjetaDeAjuste({ r, deposito: dep, cambio, onValor, onSacar }: {
  r: Renglon; deposito: string; pide: string; cambio: number | null; onValor: (valor: string) => void; onSacar: () => void
}) {
  const libro = r.porDeposito ? r.porDeposito[dep]?.libro ?? 0 : null
  const n = Number(r.valor) || 0
  const rojo = cambio != null && libro != null && libro + cambio < 0
  const t = cambio == null ? null : toneTokens[cambio > 0 ? 'success' : 'warning']
  const rotulo: React.CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: color.mut }
  return (
    <div data-tarjeta-ajuste style={{ display: 'flex', flexDirection: 'column', gap: space[2], padding: 12, borderRadius: 12, border: `1px solid ${color.line}`, background: color.surface }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: space[2] }}>
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: color.ink }}>{prendaDe(r)}</div>
          <div style={{ fontSize: font.sm, color: color.mut }}>{r.sku ?? '—'} · Stock en {deposito(dep)}: <b style={{ color: color.ink }}>{libro ?? '…'}</b></div>
        </div>
        <IconoFila label={`Sacar ${prendaDe(r)}`} onClick={onSacar}><Icono nombre="cruz" size={16} /></IconoFila>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[2] }}>
        <span style={rotulo}>Cantidad</span>
        <PasoCantidad grande valor={n} min={0} onCambio={(v) => onValor(String(v))} etiqueta={prendaDe(r)} />
      </div>
      {libro != null && (
        <div data-antes-despues style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap', fontSize: font.base, color: color.mut }}>
          <span>Antes <b style={{ color: color.ink }}>{libro}</b></span><span aria-hidden>→</span>
          <span>Después <b data-negativo={rojo || undefined} style={{ color: rojo ? 'var(--mo-danger-ink)' : color.ink }}>{cambio == null ? '—' : libro + cambio}</b></span>
          {cambio != null && t && <span style={{ padding: '2px 8px', borderRadius: 999, background: t.bg, color: t.fg, fontWeight: 600 }}>{conSigno(cambio)}</span>}
        </div>
      )}
    </div>
  )
}
