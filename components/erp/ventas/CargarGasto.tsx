'use client'

/**
 * ERP › Ventas › Cargar un gasto (Bruno 30-oct, `~/Documents/erp-monitor/erp-stunned.md` §7): la CAJA CHICA del local. El gasto
 * sale del efectivo de la caja abierta ⇒ es una SALIDA de esa caja con su categoría y resta sola del cierre.
 * Lo carga quien tiene `cargar-gasto` (Local y Administración) y puede mover la caja (A8: la cuenta que la abrió o un admin).
 * 🔑 «Mis gastos» trae SÓLO lo que cargó esta cuenta: lo corta el SERVIDOR (`api/_caja.js`, `mis-gastos`). Núcleo: `lib/caja/gasto.core.js`.
 * Un gasto ⛔ se edita: se anula desde la Caja mientras está abierta (queda tachado), como cualquier salida.
 */

import { useEffect, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { Button, EmptyState, Field, Input, Notice, Select, color, font, space } from '@/components/ui'
import { cargarGastoCaja, leerCajaAbiertaLiviana, leerMisGastos, type GastoCaja, type MarcaErp } from '@/lib/erp/cliente'
import { CATEGORIAS_GASTO, nombreDeCategoria } from '@/lib/caja/gasto.core.js'
import { aNumero } from '@/lib/caja/textos'
import { plata } from '@/lib/caja/ticket'
import { puedeMoverEfectivo } from '@/lib/caja/cierre.core.js'
import { esAdmin } from '@/lib/permisos'

type Caja = { id: string; abierto_por: string | null; abierto_por_usuario?: string | null } | null
const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export function CargarGasto({ marca }: { marca: MarcaErp }) {
  const { perfil } = useSesion()
  const [caja, setCaja] = useState<Caja | undefined>(undefined)
  const [gastos, setGastos] = useState<GastoCaja[] | null>(null)
  const [dias, setDias] = useState(31)
  const [errorLectura, setErrorLectura] = useState<string | null>(null)
  const [monto, setMonto] = useState('')
  const [categoria, setCategoria] = useState('')
  const [detalle, setDetalle] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState<string | null>(null)

  // `vuelta`: se relee después de cargar (el gasto nuevo aparece en «Mis gastos»).
  const [vuelta, setVuelta] = useState(0)
  useEffect(() => {
    let vivo = true
    Promise.all([leerCajaAbiertaLiviana(marca), leerMisGastos(marca)])
      .then(([c, g]) => { if (vivo) { setCaja(c.turno); setGastos(g.gastos); setDias(g.dias); setErrorLectura(null) } })
      .catch((e) => { if (vivo) setErrorLectura(e instanceof Error ? e.message : 'No se pudieron leer tus gastos.') })
    return () => { vivo = false }
  }, [marca, vuelta])

  const montoN = aNumero(monto)
  // A8: la carga la cuenta que abrió la caja (o un admin): la MISMA regla que el servidor, que da 403 igual; esto sólo lo dice antes.
  const deOtro = !!caja && !puedeMoverEfectivo(caja, perfil, !!perfil && esAdmin(perfil))
  const puedeCargar = !!caja && montoN != null && montoN > 0 && !!categoria && !!detalle.trim()

  async function cargar() {
    setTrabajando(true)
    setError(null)
    setListo(null)
    try {
      await cargarGastoCaja(marca, { monto: montoN as number, categoria, detalle: detalle.trim() })
      setListo(`Gasto cargado: ${plata(montoN as number)} · ${nombreDeCategoria(categoria)}. Ya resta del efectivo de la caja.`)
      setMonto('')
      setCategoria('')
      setDetalle('')
      setVuelta((v) => v + 1)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: space[4], maxWidth: 560 }}>
      <div style={{ display: 'grid', gap: space[3], padding: space[4], border: `1px solid ${color.line}`, borderRadius: 12 }}>
        <span style={{ color: color.mut, fontSize: font.sm }}>
          El gasto se paga con el efectivo de la caja abierta: resta del cierre.
        </span>
        {caja === undefined && !errorLectura && <span style={{ color: color.mut }}>Mirando la caja…</span>}
        {caja === null && <Notice tone="warning">No hay una caja abierta. Abrila en la Caja para cargar un gasto.</Notice>}
        {deOtro && <Notice tone="warning">La caja la abrió {caja?.abierto_por || 'otra cuenta'}: el gasto lo carga esa cuenta o un admin.</Notice>}
        <Field label="Monto">
          <Input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="$" data-foco />
        </Field>
        <Field label="Qué es">
          <Select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Elegir…</option>
            {CATEGORIAS_GASTO.map((c) => <option key={c.clave} value={c.clave}>{c.nombre}</option>)}
          </Select>
        </Field>
        <Field label="Detalle">
          <Input value={detalle} onChange={(e) => setDetalle(e.target.value)} autoComplete="off" placeholder="Lavandina y trapos, cinta de embalar…" maxLength={160} />
        </Field>
        {error && <Notice tone="danger">{error}</Notice>}
        {listo && <Notice tone="success">{listo}</Notice>}
        <div>
          <Button variant="solid" tone="brand" loading={trabajando} disabled={!puedeCargar || deOtro} onClick={cargar}>
            Cargar gasto
          </Button>
        </div>
      </div>

      <div style={{ display: 'grid', gap: space[2] }}>
        <b>Mis gastos · últimos {dias} días</b>
        {errorLectura && <Notice tone="danger">{errorLectura}</Notice>}
        {gastos && !gastos.length && <EmptyState title="Todavía no cargaste gastos." />}
        {gastos?.map((g) => {
          const texto = `${fechaHora(g.creado_en)} · ${plata(g.monto)} · ${g.motivo}`
          return (
            <div key={g.id} style={{ display: 'grid', gap: space[0.5], color: g.anulado_en ? color.mut : undefined }}>
              {g.anulado_en ? <s>{texto}</s> : <span>{texto}</span>}
              {g.anulado_en && <span style={{ color: color.mut, fontSize: font.sm }}>Anulado por {g.anulado_por ?? '—'}: «{g.anulado_motivo}»</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
