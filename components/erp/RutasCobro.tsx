'use client'

/**
 * ERP › Cuentas de cobro. Las RUTAS de gerencia: qué cuenta REAL (las del dashboard) recibe la plata de cada medio de pago,
 * por línea × canal, desde un momento. Diseño: `~/Documents/erp-monitor/cuentas-cobro.md`.
 *
 * 🔑 Bruno (17 y 18-oct): la cajera ve sólo el MEDIO, ⛔ la cuenta; el descuento va en el medio (Reglas) y la ruta, detrás,
 * dice adónde va la plata —y con eso, si se factura—. Un cambio vale desde ese momento: ⛔ se edita ni va para atrás (lo
 * frena el motor). Cambiar a una cuenta que FACTURA un medio con descuento AVISA («¿revisás la regla?»), ⛔ cambia la regla.
 * EN SOMBRA hasta activar el ERP: la ruta sólo anota la cuenta real de cada cobro del motor; la Caja cobra igual que hoy.
 */

import { useEffect, useRef, useState } from 'react'
import { Badge, Button, Field, Input, Notice, SectionCard, Select, TableWrap, TBody, Td, Th, THead, Tr, space, useConfirmar } from '@/components/ui'
import { leerRutas, ponerRuta, type CanalRuta, type CuentaReal, type FilaDeRuta, type MarcaErp, type MedioRuta, type RutasDeMarca } from '@/lib/erp/cliente'
import { avisoDeRuta, nombreDeCuenta, CANALES_DE_RUTA, NOMBRE_MEDIO, NOMBRE_TITULAR } from '@/lib/erp/rutas.core.js'
import { NOMBRE_CANAL, NOMBRE_MARCA } from '@/lib/erp/venta.core.js'

const MARCAS: Array<{ key: MarcaErp; label: string }> = [{ key: 'zattia', label: 'Zattia' }, { key: 'bdi', label: 'BDI' }]
const SE_ELIGE = ''

/** El día argentino de hoy y de una fecha guardada (UTC−3, sin horario de verano). */
const diaAR = (ms: number) => new Date(ms - 3 * 3600_000).toISOString().slice(0, 10)
const hoyAR = () => diaAR(Date.now())
const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
const nombreLinea = (l: string) => (NOMBRE_MARCA as Record<string, string>)[l] ?? l
const nombreCanal = (c: string) => (NOMBRE_CANAL as Record<string, string>)[c] ?? c

type Editando = { canal: CanalRuta; medio: MedioRuta; cuenta: string; tasa: string; dias: string; dia: string }

export function RutasCobro() {
  const [marca, setMarca] = useState<MarcaErp>('zattia')
  const [linea, setLinea] = useState('zattia')
  const [canal, setCanal] = useState<CanalRuta>('local')
  const [datos, setDatos] = useState<RutasDeMarca | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [editando, setEditando] = useState<Editando | null>(null)
  const marcaActual = useRef<MarcaErp>('zattia')
  const { confirmar } = useConfirmar()

  async function correr(fn: () => Promise<void>, fallo: string) {
    setTrabajando(true)
    try {
      await fn()
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : fallo)
    } finally {
      setTrabajando(false)
    }
  }

  const recargar = (de: MarcaErp) => correr(async () => {
    const r = await leerRutas(de)
    if (marcaActual.current === de) setDatos(r)
  }, 'No se pudieron leer las cuentas de cobro.')

  useEffect(() => {
    let vivo = true
    leerRutas('zattia').then((r) => { if (vivo && marcaActual.current === 'zattia') setDatos(r) })
      .catch((e) => vivo && setError(e instanceof Error ? e.message : 'No se pudieron leer las cuentas de cobro.'))
    return () => { vivo = false }
  }, [])

  function elegirMarca(m: MarcaErp) {
    if (m === marca) return
    marcaActual.current = m
    setMarca(m)
    setLinea(m)
    setDatos(null)
    setEditando(null)
    setHecho(null)
    setAviso(null)
    void recargar(m)
  }

  const cuentaPorId = (id: string): CuentaReal | null => datos?.cuentas.find((c) => c.id === id) ?? null
  const grilla = datos?.lineas.find((l) => l.linea === linea)?.filas.filter((f) => f.canal === canal) ?? []

  function empezar(f: FilaDeRuta) {
    const v = f.vigente
    setEditando({
      canal: f.canal, medio: f.medio, cuenta: v?.cuenta_real_id ?? SE_ELIGE,
      tasa: v?.tasa != null ? String(v.tasa) : '', dias: v?.dias_acreditacion != null ? String(v.dias_acreditacion) : '', dia: hoyAR(),
    })
    setHecho(null)
    setAviso(null)
  }

  // El aviso ANTES de guardar, con el mismo núcleo que el servidor.
  const avisoPrevio = editando && datos
    ? avisoDeRuta({ linea, canal: editando.canal, medio: editando.medio, cuenta: editando.cuenta ? cuentaPorId(editando.cuenta) : null, reglas: datos.reglas })
    : null

  async function guardar() {
    if (!editando) return
    const e = editando
    const hoy = hoyAR()
    if (e.dia < hoy) { setError('Una ruta vale desde ahora en adelante: el pasado no se cambia.'); return }
    const cuenta = e.cuenta ? cuentaPorId(e.cuenta) : null
    const cuando = e.dia === hoy ? 'desde ahora' : `desde el ${e.dia.slice(8, 10)}/${e.dia.slice(5, 7)}`
    const ok = await confirmar({
      titulo: `${NOMBRE_MEDIO[e.medio]} de ${nombreLinea(linea)} en ${nombreCanal(e.canal).toLowerCase()}`,
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
    await correr(async () => {
      const r = await ponerRuta(marca, {
        linea, canal: e.canal, medio: e.medio, cuenta_real_id: e.cuenta || null, tasa: e.tasa, dias_acreditacion: e.dias,
        ...(e.dia === hoy ? {} : { desde: `${e.dia}T03:00:00.000Z` }),
      })
      setHecho(`${NOMBRE_MEDIO[e.medio]} de ${nombreLinea(linea)} en ${nombreCanal(e.canal).toLowerCase()} va a ${nombreDeCuenta(cuenta)} ${cuando}.`)
      setAviso(r.aviso)
      setEditando(null)
      await recargar(marca)
    }, 'No se pudo cambiar la ruta.')
  }

  const lineas = datos?.lineas.map((l) => l.linea) ?? [marca]
  const titulares = ['areben', 'bruno', 'dario', 'tercero'] as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <SectionCard
        title="Cuentas de cobro"
        subtitle="A qué cuenta va la plata de cada medio de pago. En el local se elige sólo el medio; el descuento sale de las reglas de ese medio. Un cambio vale desde ese momento: lo cobrado antes no se toca."
        actions={(
          <div style={{ display: 'flex', gap: space[2] }}>
            {MARCAS.map((m) => <Button key={m.key} size="sm" variant={m.key === marca ? 'solid' : 'outline'} onClick={() => elegirMarca(m.key)}>{m.label}</Button>)}
          </div>
        )}
      >
        <Notice tone="neutral">
          Por ahora se anota en las ventas del ERP: la Caja sigue cobrando como hoy hasta que se active el ERP.
          {datos?.cuentasCopiadasEn ? ` Las cuentas son las del dashboard (copiadas el ${fechaHora(datos.cuentasCopiadasEn)}).` : ''}
        </Notice>
        {error && <Notice tone="danger" onClose={() => setError(null)} style={{ marginTop: space[3] }}>{error}</Notice>}
        {hecho && <Notice tone="success" onClose={() => setHecho(null)} style={{ marginTop: space[3] }}>{hecho}</Notice>}
        {aviso && <Notice tone="warning" onClose={() => setAviso(null)} style={{ marginTop: space[3] }}>{aviso}</Notice>}
      </SectionCard>

      <SectionCard
        title={`Rutas de ${nombreLinea(linea)}`}
        actions={(
          <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
            {lineas.length > 1 && lineas.map((l) => <Button key={l} size="sm" variant={l === linea ? 'solid' : 'outline'} onClick={() => { setLinea(l); setEditando(null) }}>{nombreLinea(l)}</Button>)}
            <span style={{ width: space[2] }} />
            {CANALES_DE_RUTA.map((c) => <Button key={c} size="sm" variant={c === canal ? 'solid' : 'outline'} onClick={() => { setCanal(c as CanalRuta); setEditando(null) }}>{nombreCanal(c)}</Button>)}
          </div>
        )}
      >
        {!datos && !error && <p>Leyendo…</p>}
        {datos && (
          <TableWrap>
              <THead><Tr><Th>Medio</Th><Th>Va a</Th><Th>Factura</Th><Th>Comisión</Th><Th>Acredita</Th><Th>Desde</Th><Th /></Tr></THead>
              <TBody>
                {grilla.map((f) => (
                  <Tr key={f.medio}>
                    <Td>{NOMBRE_MEDIO[f.medio]}</Td>
                    <Td>
                      {f.vigente ? nombreDeCuenta(f.cuenta) : <span style={{ color: 'var(--text-muted)' }}>Sin ruta</span>}
                      {f.proxima && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Desde {fechaHora(f.proxima.desde)}: {f.proxima.cuenta_real_id ? nombreDeCuenta(cuentaPorId(f.proxima.cuenta_real_id)) : 'se elige en cada cobro'}</div>}
                      {f.aviso && <div style={{ fontSize: 12, color: 'var(--warning-text, #92400e)' }}>{f.aviso}</div>}
                    </Td>
                    <Td>{f.factura == null ? '—' : f.factura ? <Badge tone="brand" subtle>Sí</Badge> : <Badge tone="neutral" subtle>No</Badge>}</Td>
                    <Td>{f.vigente?.tasa != null ? `${f.vigente.tasa} %` : '—'}</Td>
                    <Td>{f.vigente?.dias_acreditacion != null ? (f.vigente.dias_acreditacion === 0 ? 'En el día' : `${f.vigente.dias_acreditacion} días`) : '—'}</Td>
                    <Td>{f.vigente ? `${fechaHora(f.vigente.desde)} · ${f.vigente.puesta_por}` : '—'}</Td>
                    <Td><Button size="sm" variant="outline" onClick={() => empezar(f)} disabled={trabajando}>{f.vigente ? 'Cambiar' : 'Poner'}</Button></Td>
                  </Tr>
                ))}
              </TBody>
          </TableWrap>
        )}
      </SectionCard>

      {editando && datos && (
        <SectionCard title={`${NOMBRE_MEDIO[editando.medio]} de ${nombreLinea(linea)} en ${nombreCanal(editando.canal).toLowerCase()}`}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: space[3] }}>
            <Field label="Va a" required hint={editando.cuenta === SE_ELIGE ? 'Para la transferencia mayorista: la cuenta se elige al cobrar.' : undefined}>
              <Select value={editando.cuenta} onChange={(e) => setEditando({ ...editando, cuenta: e.target.value })}>
                <option value={SE_ELIGE}>Se elige en cada cobro</option>
                {titulares.map((t) => {
                  const cs = datos.cuentas.filter((c) => c.titular === t)
                  return cs.length ? <optgroup key={t} label={NOMBRE_TITULAR[t]}>{cs.map((c) => <option key={c.id} value={c.id}>{c.banco ? `${c.banco} · ` : ''}{c.nombre}</option>)}</optgroup> : null
                })}
              </Select>
            </Field>
            <Field label="Comisión %" hint="Lo que se queda Mercado Pago, Payway o Mercado Libre (opcional)">
              <Input inputMode="decimal" value={editando.tasa} onChange={(e) => setEditando({ ...editando, tasa: e.target.value })} placeholder="0" />
            </Field>
            <Field label="Días hasta que acredita" hint="Vacío: al momento">
              <Input inputMode="numeric" value={editando.dias} onChange={(e) => setEditando({ ...editando, dias: e.target.value })} placeholder="0" />
            </Field>
            <Field label="Desde" hint="Hoy: desde ahora. Otro día: desde las 0 h">
              <Input type="date" min={hoyAR()} value={editando.dia} onChange={(e) => setEditando({ ...editando, dia: e.target.value })} />
            </Field>
          </div>
          {avisoPrevio && <Notice tone="warning" style={{ marginTop: space[3] }}>{avisoPrevio}</Notice>}
          <div style={{ display: 'flex', gap: space[2], marginTop: space[3] }}>
            <Button onClick={guardar} disabled={trabajando}>Cambiar la ruta</Button>
            <Button variant="outline" onClick={() => setEditando(null)} disabled={trabajando}>Cancelar</Button>
          </div>
        </SectionCard>
      )}

      {datos && datos.historial.length > 0 && (
        <SectionCard title="Cambios de rutas" subtitle="Cada cambio queda: quién lo puso, cuándo y desde cuándo vale.">
          <TableWrap>
              <THead><Tr><Th>Puesta</Th><Th>Por</Th><Th>Línea</Th><Th>Canal</Th><Th>Medio</Th><Th>Va a</Th><Th>Desde</Th></Tr></THead>
              <TBody>
                {datos.historial.map((h) => (
                  <Tr key={h.id}>
                    <Td>{fechaHora(h.puesta_en)}</Td>
                    <Td>{h.puesta_por}</Td>
                    <Td>{nombreLinea(h.marca)}</Td>
                    <Td>{nombreCanal(h.canal)}</Td>
                    <Td>{NOMBRE_MEDIO[h.medio]}</Td>
                    <Td>{h.cuenta_real_id ? nombreDeCuenta({ titular: h.cuenta_titular, nombre: h.cuenta_nombre, banco: h.cuenta_banco }) : 'Se elige en cada cobro'}</Td>
                    <Td>{fechaHora(h.desde)}</Td>
                  </Tr>
                ))}
              </TBody>
          </TableWrap>
        </SectionCard>
      )}
    </div>
  )
}
