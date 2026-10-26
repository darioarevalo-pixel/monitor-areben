'use client'

/**
 * ERP › Configuración › Redondeo, con el molde de REGISTRO (el de Cuentas de cobro). A cuánto se redondea el precio de cada
 * canal: una fila por canal con lo que vale hoy y, si ya está puesto, lo que viene; vista «Cambios» con el historial; «⋯» o
 * clic ⇒ la ventana «Cambiar el redondeo», que muestra un ejemplo antes de guardar.
 *
 * 🔑 Bruno (20-oct): el redondeo es CONFIGURACIÓN, no código. Un cambio vale desde ese momento: ⛔ se edita ni va para atrás
 * (lo frena el motor). Sin redondeo puesto, ⛔ se redondea. Hoy lo lee el pedido mayorista; la Caja sigue con el suyo.
 */

import { useEffect, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { Button, EmptyState, Field, Input, MenuAcciones, Modal, Notice, Select, color, font, space, useConfirmar, type AccionMenu } from '@/components/ui'
import { ListaTrabajo } from '@/components/ui/ListaTrabajo'
import { BuscadorLista, VistasLista, cuandoCorto } from '@/components/ui/PiezasLista'
import { leerRedondeo, ponerRedondeo, type CambioDeRedondeo, type CanalRuta, type FilaDeRedondeo, type MarcaErp, type ModoRedondeo, type RedondeoDeMarca } from '@/lib/erp/cliente'
import { ejemploDeRedondeo, NOMBRE_MODO, PASOS, textoDeRedondeo } from '@/lib/erp/redondeo.core.js'
import { NOMBRE_CANAL, NOMBRE_MARCA } from '@/lib/erp/venta.core.js'
import { normal } from '@/lib/erp/stock-lista.core.js'

const ANCHO_SELECT: React.CSSProperties = { cursor: 'pointer', width: 'auto', flex: '0 0 auto' }
const CAMBIOS = 'cambios'
const EJEMPLO = 12345.67

/** El día argentino de hoy (UTC−3, sin horario de verano). */
const hoyAR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
const nombreLinea = (l: string) => (NOMBRE_MARCA as Record<string, string>)[l] ?? l
const nombreCanal = (c: string) => (NOMBRE_CANAL as Record<string, string>)[c] ?? c
const plata = (n: number) => `$${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

type Editando = { fila: FilaDeRedondeo; paso: string; modo: ModoRedondeo; dia: string }

const COLUMNAS = [
  { key: 'canal', titulo: 'Canal', ancho: '140px' },
  { key: 'vale', titulo: 'Redondea', ancho: 'minmax(220px, 1.4fr)' },
  { key: 'ejemplo', titulo: `Ejemplo (${plata(EJEMPLO)})`, ancho: '170px' },
  { key: 'desde', titulo: 'Desde', ancho: 'minmax(160px, 1fr)' },
  { key: 'viene', titulo: 'Lo que viene', ancho: 'minmax(200px, 1fr)' },
]
const COLUMNAS_CAMBIOS = [
  { key: 'puesta', titulo: 'Cuándo', ancho: '104px' },
  { key: 'por', titulo: 'Quién', ancho: '130px' },
  { key: 'canal', titulo: 'Canal', ancho: '140px' },
  { key: 'vale', titulo: 'Redondea', ancho: 'minmax(220px, 1.4fr)' },
  { key: 'desdeCambio', titulo: 'Vale desde', ancho: '104px' },
]

export function Redondeo() {
  const { marca: delShell } = useSesion()
  const marca: MarcaErp = delShell === 'bdi' ? 'bdi' : 'zattia'
  const [linea, setLinea] = useState<string>(marca)
  const [datos, setDatos] = useState<RedondeoDeMarca | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [editando, setEditando] = useState<Editando | null>(null)
  const [vista, setVista] = useState('canales')
  const [q, setQ] = useState('')
  const { confirmar } = useConfirmar()

  useEffect(() => {
    let vivo = true
    leerRedondeo(marca).then((r) => { if (vivo) setDatos(r) })
      .catch((e) => vivo && setError(e instanceof Error ? e.message : 'No se pudo leer el redondeo.'))
    return () => { vivo = false }
  }, [marca])

  const lineas = datos?.lineas.map((l) => l.linea) ?? [marca]
  const deLinea = lineas.includes(linea) ? linea : lineas[0]
  const todas = datos?.lineas.find((l) => l.linea === deLinea)?.filas ?? []
  const historial = (datos?.historial ?? []).filter((h) => h.marca === deLinea)

  const t = normal(q)
  const buscadas = t ? todas.filter((f) => normal(`${nombreCanal(f.canal)} ${textoDeRedondeo(f.vigente)}`).includes(t)) : todas
  const cambios = t ? historial.filter((h) => normal(`${nombreCanal(h.canal)} ${textoDeRedondeo(h)} ${h.puesto_por}`).includes(t)) : historial
  const VISTAS = [['canales', 'Canales'] as const, [CAMBIOS, 'Cambios'] as const]
  const conteo: Record<string, number> = { canales: buscadas.length, [CAMBIOS]: cambios.length }

  function empezar(f: FilaDeRedondeo) {
    const v = f.vigente
    setEditando({ fila: f, paso: String(v?.paso ?? 100), modo: v?.modo ?? 'cercano', dia: hoyAR() })
    setHecho(null)
  }

  async function guardar() {
    if (!editando) return
    const e = editando
    const hoy = hoyAR()
    if (e.dia < hoy) { setError('Un redondeo vale desde ahora en adelante: el pasado no se cambia.'); return }
    const nuevo = { paso: Number(e.paso), modo: e.modo }
    const cuando = e.dia === hoy ? 'desde ahora' : `desde el ${e.dia.slice(8, 10)}/${e.dia.slice(5, 7)}`
    const ok = await confirmar({
      titulo: `Redondeo de ${nombreLinea(deLinea)} en ${nombreCanal(e.fila.canal).toLowerCase()}`,
      mensaje: <p>Pasa a <b>{textoDeRedondeo(nuevo).toLowerCase()}</b> {cuando}. Lo vendido antes no se toca.</p>,
      ok: 'Cambiar el redondeo',
    })
    if (!ok) return
    setTrabajando(true)
    try {
      await ponerRedondeo(marca, {
        linea: deLinea, canal: e.fila.canal as CanalRuta, paso: nuevo.paso, modo: e.modo,
        ...(e.dia === hoy ? {} : { desde: `${e.dia}T03:00:00.000Z` }),
      })
      setHecho(`El redondeo de ${nombreLinea(deLinea)} en ${nombreCanal(e.fila.canal).toLowerCase()} pasa a ${textoDeRedondeo(nuevo).toLowerCase()} ${cuando}.`)
      setEditando(null)
      setDatos(await leerRedondeo(marca))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el redondeo.')
    } finally {
      setTrabajando(false)
    }
  }

  const celda = (f: FilaDeRedondeo, k: string): React.ReactNode => {
    const v = f.vigente
    if (k === 'canal') return <b style={{ color: color.ink }}>{nombreCanal(f.canal)}</b>
    if (k === 'vale') return <span style={{ color: v ? color.ink : color.mut2 }}>{textoDeRedondeo(v)}</span>
    if (k === 'ejemplo') return <span style={{ color: color.ink2 }}>{plata(ejemploDeRedondeo(EJEMPLO, v))}</span>
    if (k === 'desde') return v ? <span style={{ color: color.mut }}>{cuandoCorto(v.desde)}</span> : <span style={{ color: color.mut2 }}>—</span>
    if (k === 'viene') return f.proximo ? <span style={{ color: color.mut }}>{textoDeRedondeo(f.proximo)} desde {cuandoCorto(f.proximo.desde)}</span> : <span style={{ color: color.mut2 }}>—</span>
    return null
  }
  const celdaCambio = (h: CambioDeRedondeo, k: string): React.ReactNode => {
    if (k === 'puesta') return <span style={{ color: color.ink2 }}>{cuandoCorto(h.puesto_en)}</span>
    if (k === 'por') return <span style={{ color: color.ink2 }}>{h.puesto_por}</span>
    if (k === 'canal') return <b style={{ color: color.ink }}>{nombreCanal(h.canal)}</b>
    if (k === 'vale') return <span>{textoDeRedondeo(h)}</span>
    if (k === 'desdeCambio') return <span style={{ color: color.mut }}>{cuandoCorto(h.desde)}</span>
    return null
  }
  const acciones = (f: FilaDeRedondeo) => {
    const menu: AccionMenu[] = [{ key: 'cambiar', label: f.vigente ? 'Cambiar el redondeo' : 'Poner el redondeo', icono: 'lapiz', onClick: () => empezar(f), disabled: trabajando }]
    return <MenuAcciones acciones={menu} etiqueta={`Más acciones del redondeo en ${nombreCanal(f.canal)}`} vertical alinear="izquierda" />
  }

  const enCambios = vista === CAMBIOS
  const previo = editando ? ejemploDeRedondeo(EJEMPLO, { paso: Number(editando.paso), modo: editando.modo }) : null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <p style={{ margin: 0, color: color.mut }}>
        A cuánto se redondea el precio de cada canal. Un cambio vale desde ese momento: lo vendido antes no se toca.
        Un canal sin redondeo deja el monto como está.
      </p>
      <Notice tone="neutral">Hoy lo usa el pedido mayorista; la Caja sigue redondeando como hasta ahora.</Notice>
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      {hecho && <Notice tone="success" onClose={() => setHecho(null)}>{hecho}</Notice>}

      {!datos && !error && <EmptyState title="Leyendo el redondeo…" />}
      {datos && (
        <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: 14, overflow: 'hidden' }}>
          <VistasLista vistas={VISTAS} valor={vista} conteo={conteo} onCambio={setVista} />
          <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center', padding: 12 }}>
            {lineas.length > 1 && (
              <Select aria-label="Línea" style={ANCHO_SELECT} value={deLinea} onChange={(e) => { setLinea(e.target.value); setEditando(null) }}>
                {lineas.map((l) => <option key={l} value={l}>{nombreLinea(l)}</option>)}
              </Select>
            )}
            <BuscadorLista valor={q} onCambio={setQ} etiqueta="Buscar en el redondeo" placeholder="Canal o quién lo puso" />
          </div>
          {enCambios
            ? <ListaTrabajo columnas={COLUMNAS_CAMBIOS} filas={cambios} claveDe={(h) => h.id} celda={celdaCambio} etiquetaFila={(h) => `el cambio de redondeo en ${nombreCanal(h.canal)}`} vacio={<div style={{ padding: space[6] }}><EmptyState title="Ningún cambio todavía." /></div>} />
            : <ListaTrabajo
                columnas={COLUMNAS} filas={buscadas} claveDe={(f) => f.canal} celda={celda} acciones={acciones} anchoAcciones={40}
                activa={editando ? editando.fila.canal : null}
                onAbrir={empezar} etiquetaFila={(f) => `el redondeo en ${nombreCanal(f.canal)}`}
                vacio={<div style={{ padding: space[6] }}><EmptyState title="Nada con esa búsqueda." /></div>}
              />}
          <div style={{ padding: '8px 16px', fontSize: font.sm, color: color.mut, borderTop: `1px solid ${color.bg2}` }}>
            {nombreLinea(deLinea)} · {todas.filter((f) => f.vigente).length} de {todas.length} canales con redondeo · cada cambio queda con quién, cuándo y desde cuándo vale
          </div>
        </div>
      )}

      {editando && (
        <Modal
          abierto onCerrar={() => setEditando(null)} titulo="Cambiar el redondeo"
          pie={(
            <div style={{ display: 'flex', gap: space[2], justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={() => setEditando(null)} disabled={trabajando}>Cancelar</Button>
              <Button onClick={guardar} disabled={trabajando}>Cambiar el redondeo</Button>
            </div>
          )}
        >
          <p style={{ margin: `0 0 ${space[3]}`, color: color.mut }}>{nombreLinea(deLinea)} · {nombreCanal(editando.fila.canal)} · hoy {textoDeRedondeo(editando.fila.vigente).toLowerCase()}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: space[3] }}>
            <Field label="Redondea a" required>
              <Select value={editando.paso} onChange={(e) => setEditando({ ...editando, paso: e.target.value })}>
                {PASOS.map((p: number) => <option key={p} value={p}>${p.toLocaleString('es-AR')}</option>)}
              </Select>
            </Field>
            <Field label="Cómo" required>
              <Select value={editando.modo} onChange={(e) => setEditando({ ...editando, modo: e.target.value as ModoRedondeo })}>
                {(Object.keys(NOMBRE_MODO) as ModoRedondeo[]).map((m) => <option key={m} value={m}>{NOMBRE_MODO[m]}</option>)}
              </Select>
            </Field>
            <Field label="Desde" hint="Hoy: desde ahora. Otro día: desde las 0 h">
              <Input type="date" min={hoyAR()} value={editando.dia} onChange={(e) => setEditando({ ...editando, dia: e.target.value })} />
            </Field>
          </div>
          {previo != null && <Notice tone="neutral" style={{ marginTop: space[3] }}>Ejemplo: {plata(EJEMPLO)} queda en <b>{plata(previo)}</b>.</Notice>}
        </Modal>
      )}
    </div>
  )
}
