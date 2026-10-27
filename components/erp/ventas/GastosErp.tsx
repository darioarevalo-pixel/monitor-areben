'use client'

/**
 * ERP › Ventas › Gastos, con el molde del diseño (v8 `VentasMas.dc.html`, pestaña «Gastos»; sólo administradores): los gastos
 * COMERCIALES —comisiones de plataformas, impuestos y lo demás que cuesta vender— del período, para sacar el resultado antes
 * de los gastos operativos. Arriba los números; abajo la lista (Todos · Automáticos · A mano) y «Nuevo gasto».
 * 🔑 La comisión sale sola de cada cobro: se muestra SUMADA en una fila. Si hay cobros cuya ruta no tiene tasa, se dice: esa
 *    comisión NO está en el total. 🔑 Un gasto no se edita ni se borra: corregir uno de más es cargar otro en negativo.
 * 🔑 Hasta el corte todo lo del ERP es DE PRUEBA ⇒ abre en «De prueba», como Cobros. Núcleo: `lib/erp/gastos.core.js`.
 */

import { useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { Button, EmptyState, Field, Input, Modal, MoneyText, Notice, Select, color, font, space, useConfirmar } from '@/components/ui'
import { ListaTrabajo } from '@/components/ui/ListaTrabajo'
import { ChipEstado, TileResumen, VistasLista } from '@/components/ui/PiezasLista'
import { leerGastos, registrarGastoErp, type GastosDelPeriodo, type MarcaErp, type TipoGasto } from '@/lib/erp/cliente'
import {
  PERIODOS_GASTO, TIPOS_A_MANO, TIPO_GASTO, VISTAS_GASTO, armarFilasGastos, contarVistasGasto, filtrarGasto, rangoGasto, resumenGastos, validarGasto,
} from '@/lib/erp/gastos.core.js'
import { diaArgentino } from '@/lib/envios/portal.core.js'

type FilaGasto = ReturnType<typeof armarFilasGastos>[number]

const ANCHO_SELECT: React.CSSProperties = { cursor: 'pointer', width: 'auto', flex: '0 0 auto' }
const COLUMNAS = [
  { key: 'fecha', titulo: 'Fecha', ancho: '84px' },
  { key: 'tipo', titulo: 'Tipo', ancho: '190px' },
  { key: 'detalle', titulo: 'Detalle', ancho: 'minmax(260px, 1.6fr)' },
  { key: 'cuenta', titulo: 'Cuenta', ancho: '140px' },
  { key: 'carga', titulo: 'Carga', ancho: '150px' },
  { key: 'monto', titulo: 'Monto', ancho: '120px', derecha: true },
]
const TONO_TIPO = { comision: ['action', 'Comisión de plataforma'], impuesto: ['warning', 'Impuesto'], otro: ['neutral', 'Otro gasto'] } as const
const pesos = (n: number) => `${n < 0 ? '− ' : ''}$ ${Math.abs(n).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
const dia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

function bajarCsv(filas: FilaGasto[], marca: MarcaErp, desde: string, hasta: string) {
  const c = (x: unknown) => `"${String(x ?? '').replace(/"/g, '""')}"`
  const renglones = [['Fecha', 'Tipo', 'Detalle', 'Cuenta', 'Carga', 'Quién', 'Monto'].map(c).join(';')]
  for (const f of filas) renglones.push([f.fecha, TIPO_GASTO[f.tipo], f.detalle, f.cuenta, f.carga === 'automatica' ? 'Automática' : 'A mano', f.quien, String(f.monto).replace('.', ',')].map(c).join(';'))
  const url = URL.createObjectURL(new Blob(['﻿' + renglones.join('\r\n')], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `gastos-${marca}-${desde}-${hasta}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function GastosErp() {
  const { marca: delShell } = useSesion()
  const marca: MarcaErp = delShell === 'bdi' ? 'bdi' : 'zattia'
  const { confirmar } = useConfirmar()
  const [prueba, setPrueba] = useState(true)
  const [periodo, setPeriodo] = useState('mes')
  const [vista, setVista] = useState('todos')
  const [datos, setDatos] = useState<(GastosDelPeriodo & { clave: string }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vuelta, setVuelta] = useState(0)
  const [nuevo, setNuevo] = useState(false)
  const [cargado, setCargado] = useState<string | null>(null)

  const clave = `${marca}|${periodo}|${prueba}|${vuelta}`
  useEffect(() => {
    let vivo = true
    // El día se toma al leer (⛔ en el render): «Este mes» es el de cuando se apretó.
    const { desde, hasta } = rangoGasto(periodo, diaArgentino(Date.now()))
    leerGastos(marca, desde, hasta, prueba)
      .then((d) => { if (vivo) { setDatos({ ...d, clave }); setError(null) } })
      .catch((e) => { if (vivo) { setError(e instanceof Error ? e.message : 'No se pudieron leer los gastos.'); setDatos((x) => (x ? { ...x, clave } : x)) } })
    return () => { vivo = false }
  }, [marca, prueba, periodo, clave])
  const cargando = datos?.clave !== clave

  const todas = useMemo(() => (datos ? armarFilasGastos(datos) : []), [datos])
  const conteo = useMemo(() => contarVistasGasto(todas), [todas])
  const res = useMemo(() => (datos ? resumenGastos(datos) : null), [datos])
  const filas = useMemo(() => filtrarGasto(todas, vista), [todas, vista])
  const nombrePeriodo = PERIODOS_GASTO.find(([k]) => k === periodo)?.[1] ?? ''
  const libro = prueba ? 'de prueba' : 'reales'

  const celda = (f: FilaGasto, k: string): React.ReactNode => {
    if (k === 'fecha') return <span style={{ color: color.mut }}>{f.id === 'comisiones-automaticas' ? 'Período' : dia(f.fecha)}</span>
    if (k === 'tipo') return <ChipEstado mapa={TONO_TIPO} k={f.tipo} />
    if (k === 'detalle') return <span title={f.detalle}>{f.detalle}</span>
    if (k === 'cuenta') return <span style={{ color: f.cuenta ? color.ink2 : color.mut2 }}>{f.cuenta ?? '—'}</span>
    if (k === 'carga') return <span style={{ color: color.mut }}>{f.carga === 'automatica' ? 'Automática' : `A mano · ${f.quien ?? 'sin dato'}`}</span>
    if (k === 'monto') return <MoneyText value={f.monto} />
    return null
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <div style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, color: color.mut, flex: '1 1 320px' }}>Los gastos de vender: comisiones de las plataformas, impuestos y lo demás que cuesta cada venta. Los de estructura y los socios van aparte. Nada se borra.</p>
        <div style={{ display: 'flex', gap: space[1] }}>
          <Button variant={prueba ? 'outline' : 'solid'} aria-pressed={!prueba} onClick={() => setPrueba(false)}>Reales</Button>
          <Button variant={prueba ? 'solid' : 'outline'} aria-pressed={prueba} onClick={() => setPrueba(true)}>De prueba</Button>
        </div>
        <Button disabled={!filas.length || !datos} onClick={() => datos && bajarCsv(filas, marca, datos.desde, datos.hasta)}>Exportar</Button>
        <Button onClick={() => { setCargado(null); setNuevo(true) }}>Nuevo gasto</Button>
      </div>
      {prueba && <Notice tone="warning">Estás mirando los gastos <b>de prueba</b>: salen de las ventas que el ERP registra en paralelo con Gestión Nube hasta el corte. Lo que cargues acá queda anotado <b>de prueba</b>.</Notice>}
      {res && res.sinComision > 0 && (
        <Notice tone="warning">
          <b>{res.sinComision.toLocaleString('es-AR')} {res.sinComision === 1 ? 'cobro con tarjeta o Mercado Pago' : 'cobros con tarjeta o Mercado Pago'} no {res.sinComision === 1 ? 'tiene' : 'tienen'} comisión</b>: la ruta de cobro no tiene la tasa cargada. Esas comisiones <b>no están en el total</b>. La tasa se carga en Configuración › Rutas.
        </Notice>
      )}
      {cargado && <Notice tone="success" onClose={() => setCargado(null)}>{cargado}</Notice>}
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}

      <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
        <TileResumen titulo="Gastos comerciales" valor={res ? pesos(res.total) : '…'} oscuro nota={`${nombrePeriodo.toLowerCase()} · ${libro} · restan en el resultado de Inicio`} />
        <TileResumen titulo="Comisiones de plataformas" valor={res ? pesos(res.comision) : '…'} nota={res ? `${pesos(res.comisionAutomatica)} salen solas de los cobros${res.comisionAMano ? ` · ${pesos(res.comisionAMano)} a mano` : ''}` : undefined} />
        <TileResumen titulo="Impuestos" valor={res ? pesos(res.impuesto) : '…'} nota="a mano: todavía no se calculan solos" />
        <TileResumen titulo="Otros gastos" valor={res ? pesos(res.otro) : '…'} nota="logística y lo demás, a mano" />
      </div>

      <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: 14, overflow: 'hidden' }}>
        <VistasLista vistas={VISTAS_GASTO} valor={vista} conteo={conteo} onCambio={setVista} />
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center', padding: 12 }}>
          <Select aria-label="Período" style={ANCHO_SELECT} value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
            {PERIODOS_GASTO.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </Select>
          <Button variant="outline" disabled={cargando} onClick={() => setVuelta((n) => n + 1)}>{cargando ? 'Leyendo…' : 'Actualizar'}</Button>
        </div>
        <ListaTrabajo
          columnas={COLUMNAS} filas={filas} claveDe={(f) => f.id} celda={celda} orden={null} onOrden={() => {}}
          etiquetaFila={(f) => `el gasto «${f.detalle}»`}
          vacio={!cargando && datos ? <div style={{ padding: space[6] }}><EmptyState title={vista === 'a_mano' ? 'Ningún gasto cargado a mano en el período.' : 'No hay gastos en el período.'} /></div> : null}
        />
        <div style={{ padding: '8px 16px', fontSize: font.sm, color: color.mut, borderTop: `1px solid ${color.bg2}` }}>
          {cargando && !datos ? 'Leyendo los gastos…' : `${nombrePeriodo}: ${res ? pesos(res.total) : '—'} en gastos comerciales`} · para corregir uno cargado de más, cargá otro con el monto en negativo
        </div>
      </div>

      {nuevo && (
        <NuevoGasto
          marca={marca} prueba={prueba} onCerrar={() => setNuevo(false)}
          onGuardar={async (g) => {
            const ok = await confirmar({
              titulo: 'Cargar el gasto',
              mensaje: <p>Vas a cargar <b>{pesos(g.monto)}</b> de «{g.detalle}» como gasto <b>{prueba ? 'de prueba' : 'real'}</b>. Un gasto <b>no se edita ni se borra</b>: si te equivocás, se corrige cargando otro con el monto en negativo.</p>,
              ok: 'Cargar',
            })
            if (!ok) return null
            try {
              await registrarGastoErp(marca, { ...g, tipo: g.tipo as TipoGasto, prueba })
              setNuevo(false)
              setCargado(`Quedó anotado: ${pesos(g.monto)} · ${g.detalle}.`)
              setVuelta((n) => n + 1)
              return null
            } catch (e) { return e instanceof Error ? e.message : 'No se pudo cargar el gasto.' }
          }}
        />
      )}
    </div>
  )
}

function NuevoGasto({ marca, prueba, onCerrar, onGuardar }: {
  marca: MarcaErp; prueba: boolean; onCerrar: () => void
  onGuardar: (g: { linea?: string; fecha: string; tipo: string; monto: number; detalle: string; cuenta?: string }) => Promise<string | null>
}) {
  const [f, setF] = useState(() => ({ fecha: diaArgentino(Date.now()), tipo: 'otro', monto: '', detalle: '', cuenta: '', linea: marca }))
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const poner = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }))
  async function guardar() {
    const v = validarGasto(f)
    if (!v.gasto) { setError(v.error ?? 'Revisá los datos.'); return }
    setGuardando(true)
    const e = await onGuardar(v.gasto)
    setGuardando(false)
    if (e) setError(e)
  }
  return (
    <Modal abierto onCerrar={onCerrar} titulo="Nuevo gasto"
      pie={<><Button variant="outline" onClick={onCerrar}>Cancelar</Button><Button disabled={guardando} onClick={() => void guardar()}>{guardando ? 'Cargando…' : 'Cargar gasto'}</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <Notice tone={prueba ? 'warning' : 'neutral'}>Se anota como gasto <b>{prueba ? 'de prueba' : 'real'}</b>. Las comisiones de las plataformas salen solas de los cobros: acá van los impuestos y lo que no se calcula solo.</Notice>
        {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
        <Field label="Tipo"><Select value={f.tipo} onChange={(e) => poner('tipo', e.target.value)}>{TIPOS_A_MANO.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</Select></Field>
        <Field label="Fecha"><Input type="date" value={f.fecha} onChange={(e) => poner('fecha', e.target.value)} /></Field>
        <Field label="Monto" hint="Con signo menos corrige uno cargado de más. Ej.: 21.000 o -21.000"><Input inputMode="decimal" value={f.monto} onChange={(e) => poner('monto', e.target.value)} placeholder="$ 0" /></Field>
        <Field label="Detalle" hint="De qué es el gasto"><Input value={f.detalle} onChange={(e) => poner('detalle', e.target.value)} placeholder="Cadete · 6 envíos" /></Field>
        <Field label="Cuenta (opcional)" hint="De dónde salió la plata"><Input value={f.cuenta} onChange={(e) => poner('cuenta', e.target.value)} placeholder="Caja de efectivo" /></Field>
        {marca === 'zattia' && (
          <Field label="Marca"><Select value={f.linea} onChange={(e) => poner('linea', e.target.value)}><option value="zattia">Zattia</option><option value="stunned">Stunned</option></Select></Field>
        )}
      </div>
    </Modal>
  )
}
