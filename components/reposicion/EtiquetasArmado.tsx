'use client'

/**
 * Imprimir en la Zebra desde el armado con el lector (tanda 4, Darío 12-oct-2026): la Zebra está
 * en la MISMA compu donde Lorena escanea.
 *
 * - **«Para exhibir»**: un botón imprime las etiquetas que le tocan a la prenda según su estado
 *   (`etiquetaDeExhibir`): la de la campaña elegida en Configurar, o precio + formas de pago.
 * - **Impresión rápida**: buscar una prenda por nombre y reimprimir su etiqueta de información de
 *   producto (código de barras), para corregir una mal etiquetada.
 *
 * Los dibujos, los precios y la impresión son los de Etiquetas (ver `docs/secciones/etiquetas.md`):
 * precio de Tienda Nube con caché de 30 min, formas de pago de ESTA compu, y la campaña con el
 * diseño que se le cargó en Liquidación.
 *
 * 🔴 **Con una campaña elegida, si sus precios no se pudieron leer ⛔ no se imprime nada**: una
 * prenda de la campaña saldría con el precio regular, y eso no se ve hasta que está colgada.
 */

import { useCallback, useMemo, useState } from 'react'
import { construirPrecios } from '@/lib/etiquetas/core'
import { buildEtiquetasPdf, buildLibrePdf, imprimirPdf, type CtxEtiqueta } from '@/lib/etiquetas/pdf'
import { claveFormasDePago, FP_DEFAULT, type LineaEtiqueta, type VarianteEti } from '@/lib/etiquetas/tipos'
import { buscarParaImprimir, etiquetaDeExhibir, rotuloEtiqueta, type EtiquetaExhibir } from '@/lib/reposicion/etiquetasExhibir'
import { useEtiquetasTn } from '@/components/etiquetas/useEtiquetasTn'
import { dibujoDeCampania, useEtiquetasCampania } from '@/components/etiquetas/useEtiquetasCampania'
import type { Producto } from '@/lib/etl/tipos'
import { Button, color, font, Modal, space, useToast } from '@/components/ui'

function leerFormasDePago(): LineaEtiqueta[] {
  try {
    const raw = localStorage.getItem(claveFormasDePago('zattia'))
    const l = raw ? (JSON.parse(raw) as LineaEtiqueta[]) : null
    return Array.isArray(l) && l.length ? l : FP_DEFAULT
  } catch {
    return FP_DEFAULT
  }
}

export type EtiquetasArmado = {
  /** Qué etiqueta le toca, o `null` mientras se leen los precios (o si fallaron). */
  decidir: (pid: string) => EtiquetaExhibir | null
  /** Por qué todavía no se puede imprimir (cargando o error), o `null`. */
  bloqueo: string | null
  imprimirExhibir: (v: VarianteEti) => Promise<void>
  imprimirInfo: (v: VarianteEti) => Promise<void>
}

export function useEtiquetasArmado(allProductos: Producto[], campaniaId: string | null): EtiquetasArmado {
  const toast = useToast()
  const tn = useEtiquetasTn('zattia')
  const camp = useEtiquetasCampania('zattia', campaniaId || '', !!campaniaId)
  const { precios, promos } = useMemo(() => construirPrecios(allProductos, tn.tnIdx), [allProductos, tn.tnIdx])
  const ctx: CtxEtiqueta = useMemo(
    () => ({ precioDe: (v) => precios[v.pid] || 0, promoDe: (v) => promos[v.pid] || null, fpLines: leerFormasDePago() }),
    [precios, promos],
  )

  const bloqueo = tn.cargando
    ? 'Cargando los precios de Tienda Nube…'
    : campaniaId && camp.error
      ? `No se pudieron leer los precios de la campaña elegida en Configurar (${camp.error}). No se imprime hasta resolverlo.`
      : campaniaId && (camp.cargando || !camp.rotulo)
        ? 'Cargando los precios de la campaña…'
        : null

  const decidir = useCallback(
    (pid: string) => (bloqueo ? null : etiquetaDeExhibir(pid, campaniaId ? camp.porPid : null, precios[pid] || 0, promos[pid] || null)),
    [bloqueo, campaniaId, camp.porPid, precios, promos],
  )

  const imprimirExhibir = useCallback(
    async (v: VarianteEti) => {
      const e = decidir(v.pid)
      if (!e) return toast.aviso(bloqueo || 'Todavía no están los precios.')
      if (e.tipo === 'sin-precio') return toast.error(`${v.name}: no tiene precio en Tienda Nube. No se imprime.`)
      if (e.tipo === 'campania-provisoria') return toast.error(`${v.name}: el precio de la campaña no está confirmado. Consultá antes de etiquetar.`)
      try {
        const pdf =
          e.tipo === 'campania'
            ? await buildLibrePdf(dibujoDeCampania(camp.rotulo, e.precio, 1, ''))
            : await buildEtiquetasPdf([v, { __fp: true }], e.tipo === 'rebajado' ? 'promo' : 'loc', { ...ctx, fpLines: leerFormasDePago() })
        if (pdf) imprimirPdf(pdf)
      } catch (err) {
        toast.error('No se pudo armar la etiqueta: ' + (err as Error).message)
      }
    },
    [decidir, bloqueo, camp.rotulo, ctx, toast],
  )

  const imprimirInfo = useCallback(
    async (v: VarianteEti) => {
      try {
        imprimirPdf(await buildEtiquetasPdf([v], 'dep', ctx))
      } catch (err) {
        toast.error('No se pudo armar la etiqueta: ' + (err as Error).message)
      }
    },
    [ctx, toast],
  )

  return { decidir, bloqueo, imprimirExhibir, imprimirInfo }
}

/** El botón de una prenda «para exhibir»: dice qué va a salir y lo imprime. */
export function BotonEtiquetasExhibir({ v, et, size = 'md' }: { v: VarianteEti; et: EtiquetasArmado; size?: 'sm' | 'md' }) {
  const e = et.decidir(v.pid)
  const noSale = !e || e.tipo === 'sin-precio' || e.tipo === 'campania-provisoria'
  return (
    <Button
      size={size}
      variant={size === 'sm' ? 'outline' : 'solid'}
      tone="brand"
      // ⛔ Sin robarle el foco al campo del lector: el próximo escaneo tiene que entrar igual.
      onMouseDown={(ev) => ev.preventDefault()}
      onClick={() => void et.imprimirExhibir(v)}
      disabled={noSale}
      title={e ? rotuloEtiqueta(e) : et.bloqueo || undefined}
    >
      {size === 'sm' ? 'Etiquetas' : e ? `Imprimir: ${rotuloEtiqueta(e)}` : et.bloqueo || 'Cargando precios…'}
    </Button>
  )
}

/** Buscar una prenda por nombre y reimprimir su etiqueta de código de barras. */
export function ImpresionRapida({ vars, et, onCerrar }: { vars: VarianteEti[]; et: EtiquetasArmado; onCerrar: () => void }) {
  const [q, setQ] = useState('')
  const encontradas = useMemo(() => buscarParaImprimir(vars, q), [vars, q])
  // Ventana aparte con la X arriba a la derecha (Darío, 12-oct-2026): abierta en la hoja tapaba la lista.
  return (
    <Modal abierto onCerrar={onCerrar} titulo="Impresión rápida" variante="pos">
      <div style={{ fontSize: font.sm, color: color.mut, marginBottom: space[2] }}>Etiqueta con código de barras, para una prenda mal etiquetada.</div>
      <input
        className="mo-input"
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por nombre, talle o SKU…"
        aria-label="Buscar prenda para imprimir"
        autoComplete="off"
        data-1p-ignore=""
        data-lpignore="true"
      />
      {q.trim().length >= 2 && !encontradas.length && <div style={{ fontSize: font.sm, color: color.mut, marginTop: space[2] }}>Sin resultados.</div>}
      {encontradas.map((v) => (
        <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: space[2], padding: `${space[2]}px 0`, borderBottom: `1px solid ${color.bg2}`, fontSize: font.md }}>
          <span style={{ width: 130, fontSize: font.sm, color: color.mut }}>{v.sku || '—'}</span>
          <span style={{ flex: 1 }}>
            {v.name} <span style={{ color: color.mut }}>· {v.size}</span>
          </span>
          <Button size="sm" variant="outline" onClick={() => void et.imprimirInfo(v)}>
            Imprimir
          </Button>
        </div>
      ))}
    </Modal>
  )
}
