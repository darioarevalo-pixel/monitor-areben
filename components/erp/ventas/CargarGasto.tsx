'use client'

/**
 * ERP › Ventas › Cargar un gasto (Bruno 30-oct, `~/Documents/erp-monitor/erp-stunned.md` §7).
 * - La CAJA CHICA del local: sale del efectivo de la caja abierta ⇒ es una SALIDA de esa caja con su categoría y resta sola del
 *   cierre. La carga quien tiene `cargar-gasto` (Local y Administración) y puede mover la caja (A8: quien la abrió o un admin).
 * - La OFICINA (tanda 2, `gasto-oficina`: Administración): un gasto que ⛔ sale de la caja.
 * 🔑 TODO gasto queda PARA REVISAR: Bruno o Darío (admin) lo aprueban acá abajo y recién ahí el servidor lo escribe en el dashboard.
 * «Mis gastos» trae SÓLO lo que cargó esta cuenta: lo corta el SERVIDOR (`api/_caja.js`, `mis-gastos`). Núcleo: `lib/caja/gasto.core.js`.
 * Un gasto de caja ⛔ se edita: se anula desde la Caja mientras está abierta (queda tachado), como cualquier salida.
 */

import { useEffect, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { Button, EmptyState, Field, Input, Notice, Select, StatusPill, Tabs, color, font, space, type Tone } from '@/components/ui'
import {
  cargarGastoCaja, cargarGastoOficina, leerCajaAbiertaLiviana, leerMisGastos, leerPermisos, revisarGasto,
  type EstadoGasto, type GastoCaja, type MarcaErp, type NegocioGasto,
} from '@/lib/erp/cliente'
import { CATEGORIAS_GASTO, CATEGORIAS_OFICINA, NEGOCIOS_DASHBOARD, categoriaDelDashboard, nombreDeCategoria } from '@/lib/caja/gasto.core.js'
import { diaArgentino } from '@/lib/envios/portal.core.js'
import { aNumero } from '@/lib/caja/textos'
import { plata } from '@/lib/caja/ticket'
import { puedeMoverEfectivo } from '@/lib/caja/cierre.core.js'
import { esAdmin } from '@/lib/permisos'

type Caja = { id: string; abierto_por: string | null; abierto_por_usuario?: string | null } | null
type Origen = GastoCaja['origen']
const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const ESTADO: Record<EstadoGasto, { label: string; tone: Tone }> = {
  revisar: { label: 'Para revisar', tone: 'warning' },
  aprobado: { label: 'En el dashboard', tone: 'success' },
  rechazado: { label: 'Rechazado', tone: 'danger' },
  anulado: { label: 'Anulado', tone: 'neutral' },
}
const NOMBRE_NEGOCIO: Record<NegocioGasto, string> = { BDI: 'BDI', ZATTIA: 'Zattia', STUNNED: 'Stunned', GENERAL: 'General' }

export function CargarGasto({ marca }: { marca: MarcaErp }) {
  const { perfil } = useSesion()
  const admin = !!perfil && esAdmin(perfil)
  const [caja, setCaja] = useState<Caja | undefined>(undefined)
  const [gastos, setGastos] = useState<GastoCaja[] | null>(null)
  const [dias, setDias] = useState(31)
  const [deOficina, setDeOficina] = useState(false)
  const [errorLectura, setErrorLectura] = useState<string | null>(null)
  const [origen, setOrigen] = useState<Origen>('caja')
  const [monto, setMonto] = useState('')
  const [categoria, setCategoria] = useState('')
  const [detalle, setDetalle] = useState('')
  const [hoy] = useState(() => diaArgentino(Date.now()))
  const [fecha, setFecha] = useState(hoy)
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState<string | null>(null)

  // `vuelta`: se relee después de cargar o revisar.
  const [vuelta, setVuelta] = useState(0)
  useEffect(() => {
    let vivo = true
    Promise.all([leerCajaAbiertaLiviana(marca), leerMisGastos(marca)])
      .then(([c, g]) => { if (vivo) { setCaja(c.turno); setGastos(g.gastos); setDias(g.dias); setErrorLectura(null) } })
      .catch((e) => { if (vivo) setErrorLectura(e instanceof Error ? e.message : 'No se pudieron leer tus gastos.') })
    return () => { vivo = false }
  }, [marca, vuelta])
  // La oficina (`gasto-oficina`): la MISMA regla que el servidor, que da 403 igual; esto sólo esconde la pestaña.
  useEffect(() => {
    let vivo = true
    leerPermisos().then((p) => { if (vivo) setDeOficina(!!p.permisos[marca]?.['gasto-oficina']) }).catch(() => {})
    return () => { vivo = false }
  }, [marca])

  const enOficina = origen === 'oficina' && deOficina
  const montoN = aNumero(monto)
  // A8: la carga la cuenta que abrió la caja (o un admin): la MISMA regla que el servidor; esto sólo lo dice antes.
  const deOtro = !enOficina && !!caja && !puedeMoverEfectivo(caja, perfil, admin)
  const completo = montoN != null && montoN > 0 && !!categoria && !!detalle.trim()
  const puedeCargar = completo && (enOficina ? !!fecha : !!caja && !deOtro)
  const categorias = enOficina ? CATEGORIAS_OFICINA : CATEGORIAS_GASTO

  function cambiarOrigen(o: string) {
    setOrigen(o as Origen)
    // Las de la oficina (Servicios…) ⛔ existen en la caja chica.
    if (o === 'caja' && categoria && !CATEGORIAS_GASTO.some((c) => c.clave === categoria)) setCategoria('')
    setError(null)
    setListo(null)
  }

  async function cargar() {
    setTrabajando(true)
    setError(null)
    setListo(null)
    try {
      if (enOficina) await cargarGastoOficina(marca, { monto: montoN as number, categoria, detalle: detalle.trim(), fecha })
      else await cargarGastoCaja(marca, { monto: montoN as number, categoria, detalle: detalle.trim() })
      setListo(`Gasto cargado: ${plata(montoN as number)} · ${nombreDeCategoria(categoria)}. ${enOficina ? '' : 'Ya resta del efectivo de la caja. '}Queda para revisar.`)
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

  const paraRevisar = admin ? (gastos ?? []).filter((g) => g.estado === 'revisar') : []
  const mios = admin ? (gastos ?? []).filter((g) => g.estado !== 'revisar') : (gastos ?? [])

  return (
    <div style={{ display: 'grid', gap: space[4], maxWidth: 640 }}>
      <div style={{ display: 'grid', gap: space[3], padding: space[4], border: `1px solid ${color.line}`, borderRadius: 12 }}>
        {deOficina && (
          <Tabs value={enOficina ? 'oficina' : 'caja'} onChange={cambiarOrigen}
            items={[{ key: 'caja', label: 'De la caja del local' }, { key: 'oficina', label: 'De la oficina' }]} />
        )}
        <span style={{ color: color.mut, fontSize: font.sm }}>
          {enOficina
            ? 'Un gasto que no sale de la caja del local. Queda para revisar: Bruno o Darío lo aprueban y recién ahí pasa al dashboard.'
            : 'El gasto se paga con el efectivo de la caja abierta: resta del cierre. Queda para revisar antes de pasar al dashboard.'}
        </span>
        {!enOficina && caja === undefined && !errorLectura && <span style={{ color: color.mut }}>Mirando la caja…</span>}
        {!enOficina && caja === null && <Notice tone="warning">No hay una caja abierta. Abrila en la Caja para cargar un gasto.</Notice>}
        {deOtro && <Notice tone="warning">La caja la abrió {caja?.abierto_por || 'otra cuenta'}: el gasto lo carga esa cuenta o un admin.</Notice>}
        <Field label="Monto">
          <Input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="$" data-foco />
        </Field>
        <Field label="Qué es">
          <Select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Elegir…</option>
            {categorias.map((c) => <option key={c.clave} value={c.clave}>{c.nombre}</option>)}
          </Select>
        </Field>
        <Field label="Detalle">
          <Input value={detalle} onChange={(e) => setDetalle(e.target.value)} autoComplete="off" placeholder={enOficina ? 'Internet de la oficina, tóner…' : 'Lavandina y trapos, cinta de embalar…'} maxLength={160} />
        </Field>
        {enOficina && (
          <Field label="Día del gasto">
            <Input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} />
          </Field>
        )}
        {error && <Notice tone="danger">{error}</Notice>}
        {listo && <Notice tone="success">{listo}</Notice>}
        <div>
          <Button variant="solid" tone="brand" loading={trabajando} disabled={!puedeCargar} onClick={cargar}>
            Cargar gasto
          </Button>
        </div>
      </div>

      {errorLectura && <Notice tone="danger">{errorLectura}</Notice>}
      {admin && gastos && (
        <div style={{ display: 'grid', gap: space[2] }}>
          <b>Para revisar · {paraRevisar.length}</b>
          {!paraRevisar.length && <EmptyState title="No hay gastos para revisar." />}
          {paraRevisar.map((g) => <ParaRevisar key={`${g.origen}:${g.id}`} marca={marca} gasto={g} alTerminar={() => setVuelta((v) => v + 1)} />)}
        </div>
      )}

      <div style={{ display: 'grid', gap: space[2] }}>
        <b>{admin ? 'Revisados' : 'Mis gastos'} · últimos {dias} días</b>
        {gastos && !mios.length && <EmptyState title={admin ? 'Todavía no hay gastos revisados.' : 'Todavía no cargaste gastos.'} />}
        {mios.map((g) => <FilaGasto key={`${g.origen}:${g.id}`} gasto={g} />)}
      </div>
    </div>
  )
}

function FilaGasto({ gasto: g }: { gasto: GastoCaja }) {
  const texto = `${fechaHora(g.creado_en)} · ${plata(g.monto)} · ${nombreDeCategoria(g.categoria)}: ${g.detalle}${g.origen === 'oficina' ? ' (oficina)' : ''}`
  return (
    <div style={{ display: 'grid', gap: space[0.5], color: g.estado === 'anulado' ? color.mut : undefined }}>
      <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
        {g.estado === 'anulado' ? <s>{texto}</s> : <span>{texto}</span>}
        <StatusPill tone={ESTADO[g.estado].tone} label={ESTADO[g.estado].label} />
      </div>
      {g.estado === 'anulado' && <span style={{ color: color.mut, fontSize: font.sm }}>Anulado por {g.anulado_por ?? '—'}: «{g.anulado_motivo}»</span>}
      {g.estado === 'rechazado' && <span style={{ color: color.mut, fontSize: font.sm }}>Rechazado por {g.revisado_por ?? '—'}: «{g.revision_motivo}»</span>}
    </div>
  )
}

/** Un gasto para revisar (sólo admin): categoría y marca del dashboard, y Aprobar o Rechazar. */
function ParaRevisar({ marca, gasto: g, alTerminar }: { marca: MarcaErp; gasto: GastoCaja; alTerminar: () => void }) {
  const [categoria, setCategoria] = useState(g.categoria)
  const [negocio, setNegocio] = useState<NegocioGasto>(g.negocio)
  const [rechazando, setRechazando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const categorias = g.origen === 'oficina' ? CATEGORIAS_OFICINA : CATEGORIAS_GASTO

  async function decidir(decision: 'aprobar' | 'rechazar') {
    setTrabajando(true)
    setError(null)
    try {
      await revisarGasto(marca, decision === 'aprobar' ? { origen: g.origen, id: g.id, decision, categoria, negocio } : { origen: g.origen, id: g.id, decision, motivo: motivo.trim() })
      alTerminar()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: space[2], padding: space[3], border: `1px solid ${color.line}`, borderRadius: 12 }}>
      <span>
        <b>{plata(g.monto)}</b> · {g.detalle}
      </span>
      <span style={{ color: color.mut, fontSize: font.sm }}>
        {g.origen === 'caja' ? 'Caja chica del local' : `Oficina · día ${g.fecha ?? '—'}`} · cargó {g.usuario ?? g.usuario_cuenta ?? '—'} el {fechaHora(g.creado_en)}
      </span>
      <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
        <Field label="Qué es">
          <Select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {categorias.map((c) => <option key={c.clave} value={c.clave}>{c.nombre}</option>)}
          </Select>
        </Field>
        <Field label="Marca">
          <Select value={negocio} onChange={(e) => setNegocio(e.target.value as NegocioGasto)}>
            {(NEGOCIOS_DASHBOARD as NegocioGasto[]).map((n) => <option key={n} value={n}>{NOMBRE_NEGOCIO[n]}</option>)}
          </Select>
        </Field>
      </div>
      <span style={{ color: color.mut, fontSize: font.sm }}>
        En el dashboard entra como «{categoriaDelDashboard(categoria)}», {g.origen === 'caja' ? 'pagado en efectivo' : 'pendiente de pago'}.
      </span>
      {rechazando && (
        <Field label="Por qué se rechaza">
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} autoComplete="off" maxLength={160} />
        </Field>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
        {!rechazando && <Button variant="solid" tone="brand" loading={trabajando} onClick={() => decidir('aprobar')}>Aprobar</Button>}
        {!rechazando && <Button variant="soft" tone="danger" disabled={trabajando} onClick={() => setRechazando(true)}>Rechazar</Button>}
        {rechazando && <Button variant="solid" tone="danger" loading={trabajando} disabled={!motivo.trim()} onClick={() => decidir('rechazar')}>Rechazar gasto</Button>}
        {rechazando && <Button variant="ghost" disabled={trabajando} onClick={() => setRechazando(false)}>Volver</Button>}
      </div>
    </div>
  )
}
