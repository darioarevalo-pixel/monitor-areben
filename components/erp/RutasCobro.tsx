'use client'

/**
 * ERP › Configuración › Cuentas de cobro, con el molde de REGISTRO (🎨 Diseño 7; tablero 6 del v8). Las RUTAS de gerencia:
 * qué cuenta REAL (las del dashboard) recibe la plata de cada medio de pago, por línea × canal, desde un momento. Arriba la
 * tira cuenta · medio · ruta · regla; abajo UNA lista (una fila por canal × medio) con vistas por canal, «Sin ruta» y
 * «Cambios» (el historial); «⋯» o clic ⇒ la ventana «Cambiar la ruta». Diseño: `~/Documents/erp-monitor/cuentas-cobro.md`.
 *
 * 🔑 Bruno (17 y 18-oct): la cajera ve sólo el MEDIO, ⛔ la cuenta; el descuento va en el medio (Reglas) y la ruta, detrás,
 * dice adónde va la plata —y con eso, si se factura—. Un cambio vale desde ese momento: ⛔ se edita ni va para atrás (lo
 * frena el motor). Cambiar a una cuenta que FACTURA un medio con descuento AVISA («¿revisás la regla?»), ⛔ cambia la regla.
 * EN SOMBRA hasta activar el ERP: la ruta sólo anota la cuenta real de cada cobro del motor; la Caja cobra igual que hoy.
 */

import { useEffect, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { usePuedeErp } from '@/lib/erp/usePuedeErp'
import { Button, EmptyState, Field, Input, MenuAcciones, Modal, Notice, Select, color, font, space, useConfirmar, type AccionMenu } from '@/components/ui'
import { ListaTrabajo } from '@/components/ui/ListaTrabajo'
import { BuscadorLista, ChipEstado, VistasLista, cuandoCorto } from '@/components/ui/PiezasLista'
import { leerRutas, ponerRuta, type CanalRuta, type CuentaReal, type FilaDeRuta, type MarcaErp, type RutaCobro, type RutasDeMarca } from '@/lib/erp/cliente'
import { avisoDeRuta, nombreDeCuenta, CANALES_DE_RUTA, NOMBRE_MEDIO, NOMBRE_TITULAR } from '@/lib/erp/rutas.core.js'
import { NOMBRE_CANAL, NOMBRE_MARCA } from '@/lib/erp/venta.core.js'
import { normal } from '@/lib/erp/stock-lista.core.js'
import { TiraConfiguracion, type PiezaConfiguracion } from './TiraConfiguracion'

const SE_ELIGE = ''
const ANCHO_SELECT: React.CSSProperties = { cursor: 'pointer', width: 'auto', flex: '0 0 auto' }

/** El día argentino de hoy (UTC−3, sin horario de verano). */
const hoyAR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
const nombreLinea = (l: string) => (NOMBRE_MARCA as Record<string, string>)[l] ?? l
const nombreCanal = (c: string) => (NOMBRE_CANAL as Record<string, string>)[c] ?? c
const CAMBIOS = 'cambios'
const SIN_RUTA = 'sin'

type Editando = { fila: FilaDeRuta; cuenta: string; tasa: string; dias: string; dia: string }

const COLUMNAS = [
  { key: 'canal', titulo: 'Canal', ancho: '120px' },
  { key: 'medio', titulo: 'Medio', ancho: '130px' },
  { key: 'cuenta', titulo: 'Va a la cuenta', ancho: 'minmax(230px, 1.6fr)' },
  { key: 'factura', titulo: 'Se factura', ancho: '96px' },
  { key: 'tasa', titulo: 'Comisión', ancho: '90px', derecha: true },
  { key: 'dias', titulo: 'Acredita', ancho: '96px' },
  { key: 'desde', titulo: 'Desde', ancho: 'minmax(150px, 1fr)' },
]
const COLUMNAS_CAMBIOS = [
  { key: 'puesta', titulo: 'Cuándo', ancho: '104px' },
  { key: 'por', titulo: 'Quién', ancho: '130px' },
  { key: 'canal', titulo: 'Canal', ancho: '120px' },
  { key: 'medio', titulo: 'Medio', ancho: '130px' },
  { key: 'cuenta', titulo: 'Va a la cuenta', ancho: 'minmax(230px, 1.6fr)' },
  { key: 'vale', titulo: 'Vale desde', ancho: '104px' },
]

export function RutasCobro({ ir }: { ir?: (p: PiezaConfiguracion) => void }) {
  const { marca: delShell } = useSesion()
  const marca: MarcaErp = delShell === 'bdi' ? 'bdi' : 'zattia'
  const configura = usePuedeErp(marca)('configurar')
  const [linea, setLinea] = useState<string>(marca)
  const [datos, setDatos] = useState<RutasDeMarca | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [editando, setEditando] = useState<Editando | null>(null)
  const [vista, setVista] = useState('todas')
  const [q, setQ] = useState('')
  const { confirmar } = useConfirmar()

  useEffect(() => {
    let vivo = true
    leerRutas(marca).then((r) => { if (vivo) setDatos(r) })
      .catch((e) => vivo && setError(e instanceof Error ? e.message : 'No se pudieron leer las cuentas de cobro.'))
    return () => { vivo = false }
  }, [marca])

  const cuentaPorId = (id: string): CuentaReal | null => datos?.cuentas.find((c) => c.id === id) ?? null
  const lineas = datos?.lineas.map((l) => l.linea) ?? [marca]
  const deLinea = lineas.includes(linea) ? linea : lineas[0]
  const todas = datos?.lineas.find((l) => l.linea === deLinea)?.filas ?? []
  const historial = (datos?.historial ?? []).filter((h) => h.marca === deLinea)

  const t = normal(q)
  const textoDe = (f: FilaDeRuta) => normal([nombreCanal(f.canal), NOMBRE_MEDIO[f.medio], f.vigente ? nombreDeCuenta(f.cuenta) : 'sin ruta'].join(' '))
  const textoCambio = (h: RutaCobro) => normal([nombreCanal(h.canal), NOMBRE_MEDIO[h.medio], h.puesta_por, h.cuenta_nombre, h.cuenta_banco].filter(Boolean).join(' '))
  const buscadas = t ? todas.filter((f) => textoDe(f).includes(t)) : todas
  const cambios = t ? historial.filter((h) => textoCambio(h).includes(t)) : historial
  const VISTAS = [['todas', 'Todas'] as const, ...CANALES_DE_RUTA.map((c) => [c, nombreCanal(c)] as const), [SIN_RUTA, 'Sin ruta'] as const, [CAMBIOS, 'Cambios'] as const]
  const conteo: Record<string, number> = {
    todas: buscadas.length, [SIN_RUTA]: buscadas.filter((f) => !f.vigente).length, [CAMBIOS]: cambios.length,
    ...Object.fromEntries(CANALES_DE_RUTA.map((c) => [c, buscadas.filter((f) => f.canal === c).length])),
  }
  const filas = vista === 'todas' ? buscadas : vista === SIN_RUTA ? buscadas.filter((f) => !f.vigente) : buscadas.filter((f) => f.canal === vista)

  function empezar(f: FilaDeRuta) {
    const v = f.vigente
    setEditando({ fila: f, cuenta: v?.cuenta_real_id ?? SE_ELIGE, tasa: v?.tasa != null ? String(v.tasa) : '', dias: v?.dias_acreditacion != null ? String(v.dias_acreditacion) : '', dia: hoyAR() })
    setHecho(null)
    setAviso(null)
  }

  // El aviso ANTES de guardar, con el mismo núcleo que el servidor.
  const avisoPrevio = editando && datos
    ? avisoDeRuta({ linea: deLinea, canal: editando.fila.canal, medio: editando.fila.medio, cuenta: editando.cuenta ? cuentaPorId(editando.cuenta) : null, reglas: datos.reglas })
    : null

  async function guardar() {
    if (!editando) return
    const e = editando
    const { canal, medio } = e.fila
    const hoy = hoyAR()
    if (e.dia < hoy) { setError('Una ruta vale desde ahora en adelante: el pasado no se cambia.'); return }
    const cuenta = e.cuenta ? cuentaPorId(e.cuenta) : null
    const cuando = e.dia === hoy ? 'desde ahora' : `desde el ${e.dia.slice(8, 10)}/${e.dia.slice(5, 7)}`
    const ok = await confirmar({
      titulo: `${NOMBRE_MEDIO[medio]} de ${nombreLinea(deLinea)} en ${nombreCanal(canal).toLowerCase()}`,
      mensaje: (
        <div>
          <p>Va a <b>{nombreDeCuenta(cuenta)}</b> {cuando}. Lo cobrado antes queda con la cuenta que tenía.</p>
          {avisoPrevio && <p style={{ color: 'var(--warning-text, #92400e)' }}>{avisoPrevio}</p>}
        </div>
      ),
      ok: 'Cambiar la ruta',
      tono: avisoPrevio ? 'warning' : undefined,
    })
    if (!ok) return
    setTrabajando(true)
    try {
      const r = await ponerRuta(marca, {
        linea: deLinea, canal: canal as CanalRuta, medio, cuenta_real_id: e.cuenta || null, tasa: e.tasa, dias_acreditacion: e.dias,
        ...(e.dia === hoy ? {} : { desde: `${e.dia}T03:00:00.000Z` }),
      })
      setHecho(`${NOMBRE_MEDIO[medio]} de ${nombreLinea(deLinea)} en ${nombreCanal(canal).toLowerCase()} va a ${nombreDeCuenta(cuenta)} ${cuando}.`)
      setAviso(r.aviso)
      setEditando(null)
      setDatos(await leerRutas(marca))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar la ruta.')
    } finally {
      setTrabajando(false)
    }
  }

  const celda = (f: FilaDeRuta, k: string): React.ReactNode => {
    const v = f.vigente
    if (k === 'canal') return <span style={{ color: color.ink2 }}>{nombreCanal(f.canal)}</span>
    if (k === 'medio') return <b style={{ color: color.ink }}>{NOMBRE_MEDIO[f.medio]}</b>
    if (k === 'cuenta') {
      const detalle = f.aviso ?? (f.proxima ? `Desde ${cuandoCorto(f.proxima.desde)}: ${f.proxima.cuenta_real_id ? nombreDeCuenta(cuentaPorId(f.proxima.cuenta_real_id)) : 'se elige en cada cobro'}` : null)
      const principal = v ? (v.cuenta_real_id ? nombreDeCuenta(f.cuenta) : 'Se elige en cada cobro') : null
      return (
        <span title={[principal, detalle].filter(Boolean).join(' · ')}>
          {principal ? <span style={{ color: color.ink, fontStyle: v?.cuenta_real_id ? undefined : 'italic' }}>{principal}</span> : <ChipEstado mapa={{ x: ['warning', 'Sin ruta'] }} k="x" />}
          {detalle && <span style={{ color: f.aviso ? 'var(--mo-warning-ink)' : color.mut }}> · {detalle}</span>}
        </span>
      )
    }
    if (k === 'factura') return f.factura == null ? <span style={{ color: color.mut2 }}>—</span> : <ChipEstado mapa={{ x: f.factura ? ['brand', 'Sí'] : ['neutral', 'No'] }} k="x" />
    if (k === 'tasa') return <span style={{ color: v?.tasa != null ? color.ink2 : color.mut2 }}>{v?.tasa != null ? `${v.tasa} %` : '—'}</span>
    if (k === 'dias') return <span style={{ color: color.ink2 }}>{v?.dias_acreditacion != null ? (v.dias_acreditacion === 0 ? 'En el día' : `${v.dias_acreditacion} días`) : '—'}</span>
    if (k === 'desde') return v ? <span style={{ color: color.mut }}>{cuandoCorto(v.desde)} · {v.puesta_por}</span> : <span style={{ color: color.mut2 }}>—</span>
    return null
  }
  const celdaCambio = (h: RutaCobro, k: string): React.ReactNode => {
    if (k === 'puesta') return <span style={{ color: color.ink2 }}>{cuandoCorto(h.puesta_en)}</span>
    if (k === 'por') return <span style={{ color: color.ink2 }}>{h.puesta_por}</span>
    if (k === 'canal') return <span style={{ color: color.ink2 }}>{nombreCanal(h.canal)}</span>
    if (k === 'medio') return <b style={{ color: color.ink }}>{NOMBRE_MEDIO[h.medio]}</b>
    if (k === 'cuenta') return <span>{h.cuenta_real_id ? nombreDeCuenta({ titular: h.cuenta_titular, nombre: h.cuenta_nombre, banco: h.cuenta_banco }) : 'Se elige en cada cobro'}</span>
    if (k === 'vale') return <span style={{ color: color.mut }}>{cuandoCorto(h.desde)}</span>
    return null
  }
  const acciones = (f: FilaDeRuta) => {
    if (!configura) return null
    const menu: AccionMenu[] = [{ key: 'cambiar', label: f.vigente ? 'Cambiar la ruta' : 'Poner la ruta', icono: 'lapiz', onClick: () => empezar(f), disabled: trabajando }]
    return <MenuAcciones acciones={menu} etiqueta={`Más acciones de ${NOMBRE_MEDIO[f.medio]} en ${nombreCanal(f.canal)}`} vertical alinear="izquierda" />
  }

  const titulares = ['areben', 'bruno', 'dario', 'tercero'] as const
  const enCambios = vista === CAMBIOS
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <TiraConfiguracion activa="rutas" ir={ir} />
      <p style={{ margin: 0, color: color.mut }}>
        A qué cuenta va la plata de cada medio de pago. En el local se elige sólo el medio; el descuento sale de las reglas de ese medio.
        Un cambio vale desde ese momento: lo cobrado antes no se toca.
      </p>
      <Notice tone="neutral">
        Por ahora se anota en las ventas del ERP: la Caja sigue cobrando como hoy hasta que se active el ERP.
        {datos?.cuentasCopiadasEn ? ` Las cuentas son las del dashboard (copiadas el ${cuandoCorto(datos.cuentasCopiadasEn)}).` : ''}
      </Notice>
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      {hecho && <Notice tone="success" onClose={() => setHecho(null)}>{hecho}</Notice>}
      {aviso && <Notice tone="warning" onClose={() => setAviso(null)}>{aviso}</Notice>}

      {!datos && !error && <EmptyState title="Leyendo las rutas…" />}
      {datos && (
        <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: 14, overflow: 'hidden' }}>
          <VistasLista vistas={VISTAS} valor={vista} conteo={conteo} onCambio={setVista} />
          <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center', padding: 12 }}>
            {lineas.length > 1 && (
              <Select aria-label="Línea" style={ANCHO_SELECT} value={deLinea} onChange={(e) => { setLinea(e.target.value); setEditando(null) }}>
                {lineas.map((l) => <option key={l} value={l}>{nombreLinea(l)}</option>)}
              </Select>
            )}
            <BuscadorLista valor={q} onCambio={setQ} etiqueta="Buscar en las rutas" placeholder="Canal, medio o cuenta" />
          </div>
          {enCambios
            ? <ListaTrabajo columnas={COLUMNAS_CAMBIOS} filas={cambios} claveDe={(h) => h.id} celda={celdaCambio} etiquetaFila={(h) => `el cambio de ${NOMBRE_MEDIO[h.medio]} en ${nombreCanal(h.canal)}`} vacio={<div style={{ padding: space[6] }}><EmptyState title="Ningún cambio todavía." /></div>} />
            : <ListaTrabajo
                columnas={COLUMNAS} filas={filas} claveDe={(f) => `${f.canal}/${f.medio}`} celda={celda} acciones={acciones} anchoAcciones={40}
                activa={editando ? `${editando.fila.canal}/${editando.fila.medio}` : null}
                onAbrir={configura ? empezar : undefined} etiquetaFila={(f) => `${NOMBRE_MEDIO[f.medio]} en ${nombreCanal(f.canal)}`}
                vacio={<div style={{ padding: space[6] }}><EmptyState title={q ? 'Nada con esa búsqueda.' : 'Todos los medios tienen ruta.'} /></div>}
              />}
          <div style={{ padding: '8px 16px', fontSize: font.sm, color: color.mut, borderTop: `1px solid ${color.bg2}` }}>
            {nombreLinea(deLinea)} · {todas.filter((f) => f.vigente).length} de {todas.length} con ruta · cada cambio queda con quién, cuándo y desde cuándo vale
          </div>
        </div>
      )}

      {editando && datos && (
        <Modal
          abierto onCerrar={() => setEditando(null)} titulo="Cambiar la ruta"
          pie={(
            <div style={{ display: 'flex', gap: space[2], justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={() => setEditando(null)} disabled={trabajando}>Cancelar</Button>
              <Button onClick={guardar} disabled={trabajando}>Cambiar la ruta</Button>
            </div>
          )}
        >
          <p style={{ margin: `0 0 ${space[3]}`, color: color.mut }}>{nombreLinea(deLinea)} · {nombreCanal(editando.fila.canal)} · {NOMBRE_MEDIO[editando.fila.medio]}{editando.fila.vigente ? ` · hoy va a ${nombreDeCuenta(editando.fila.cuenta)}` : ' · hoy sin ruta'}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: space[3] }}>
            <Field label="Desde ahora va a" required hint={editando.cuenta === SE_ELIGE ? 'Para la transferencia mayorista: la cuenta se elige al cobrar.' : undefined}>
              <Select value={editando.cuenta} onChange={(e) => setEditando({ ...editando, cuenta: e.target.value })}>
                <option value={SE_ELIGE}>Se elige en cada cobro</option>
                {titulares.map((ti) => {
                  const cs = datos.cuentas.filter((c) => c.titular === ti)
                  return cs.length ? <optgroup key={ti} label={NOMBRE_TITULAR[ti]}>{cs.map((c) => <option key={c.id} value={c.id}>{c.banco ? `${c.banco} · ` : ''}{c.nombre}</option>)}</optgroup> : null
                })}
              </Select>
            </Field>
            <Field label="Desde" hint="Hoy: desde ahora. Otro día: desde las 0 h">
              <Input type="date" min={hoyAR()} value={editando.dia} onChange={(e) => setEditando({ ...editando, dia: e.target.value })} />
            </Field>
            <Field label="Comisión %" hint="Lo que se queda Mercado Pago, Payway o Mercado Libre (opcional)">
              <Input inputMode="decimal" value={editando.tasa} onChange={(e) => setEditando({ ...editando, tasa: e.target.value })} placeholder="0" />
            </Field>
            <Field label="Días hasta que acredita" hint="Vacío: al momento">
              <Input inputMode="numeric" value={editando.dias} onChange={(e) => setEditando({ ...editando, dias: e.target.value })} placeholder="0" />
            </Field>
          </div>
          {avisoPrevio && <Notice tone="warning" style={{ marginTop: space[3] }}>{avisoPrevio}</Notice>}
        </Modal>
      )}
    </div>
  )
}
