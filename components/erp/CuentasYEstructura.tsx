'use client'

/**
 * ERP › Configuración › Cuentas y › Marcas, depósitos y puntos de venta (v8 `Configuracion.dc.html`, tabs `cuentas` y
 * `estructura`): SÓLO LECTURA. Cuentas = dónde cae la plata, la copia de las del dashboard, con qué rutas vigentes de la
 * marca caen en cada una (el saldo y el alta ⇒ «Abrir en el dashboard»). Estructura = una fila por línea con sus
 * depósitos, punto de venta y razón social. Núcleo puro: `lib/erp/estructura.core.js`; servidor: `api/_erp-estructura.js`.
 */

import { useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import type { AlContar } from './ListasJuntas'
import { Button, EmptyState, Notice, Select, color, font, space, weight } from '@/components/ui'
import { ListaTrabajo, type ColumnaLista } from '@/components/ui/ListaTrabajo'
import { BuscadorLista, ChipEstado, VistasLista, cuandoCorto } from '@/components/ui/PiezasLista'
import { activarDeposito, leerDepositos, leerEstructura, type DepositoErp, type EstructuraDeMarca, type MarcaErp, type QuedaEnDeposito } from '@/lib/erp/cliente'
import {
  NOMBRE_TIPO, VISTAS_CUENTAS, armarCuentas, armarEstructura, contarVistasCuentas, cuitConGuiones, filtrarCuentas,
} from '@/lib/erp/estructura.core.js'
import { NOMBRE_TITULAR } from '@/lib/erp/rutas.core.js'
import { TiraConfiguracion, type PiezaConfiguracion } from './TiraConfiguracion'

const DASHBOARD = 'https://dashboard.arebensrl.com/finanzas/saldos'
const ANCHO_SELECT: React.CSSProperties = { cursor: 'pointer', width: 'auto', flex: '0 0 auto' }
const TIPO = NOMBRE_TIPO as Record<string, string>
const TITULAR = NOMBRE_TITULAR as Record<string, string>
const ESTADO = { si: ['success', 'Recibe plata'], no: ['neutral', 'Sin ruta'], baja: ['neutral', 'Dada de baja'] } as const

/** Las dos pestañas leen lo mismo (una consulta chica): cada una lo pide al montarse. */
function useEstructura(marca: MarcaErp) {
  const [datos, setDatos] = useState<(EstructuraDeMarca & { marca: MarcaErp }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    leerEstructura(marca)
      .then((d) => { if (vivo) { setDatos({ ...d, marca }); setError(null) } })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo leer la configuración.') })
    return () => { vivo = false }
  }, [marca])
  return { datos: datos?.marca === marca ? datos : null, error, setError }
}

export function CuentasErp({ ir, alContar }: { ir?: (p: PiezaConfiguracion) => void; alContar?: AlContar }) {
  const { marca: delShell } = useSesion()
  const marca: MarcaErp = delShell === 'bdi' ? 'bdi' : 'zattia'
  const { datos, error, setError } = useEstructura(marca)
  const [vista, setVista] = useState('activas')
  const [q, setQ] = useState('')
  const [titular, setTitular] = useState('')
  const [tipo, setTipo] = useState('')

  const todas = useMemo(() => (datos ? armarCuentas(datos) : []), [datos])
  const base = useMemo(() => filtrarCuentas(todas, { vista: '', q, titular, tipo }), [todas, q, titular, tipo])
  const conteo = useMemo(() => contarVistasCuentas(base), [base])
  // Pantalla junta (`ListasJuntas`): el número de su opción es el de la vista con la que abre.
  useEffect(() => { alContar?.(datos ? conteo.activas : null) }, [alContar, datos, conteo])
  const filas = useMemo(() => filtrarCuentas(base, { vista }), [base, vista])
  const titulares = [...new Set(todas.map((f) => f.titularClave))].filter(Boolean).sort()
  const tipos = [...new Set(todas.map((f) => f.tipoClave))].filter(Boolean).sort()

  const columnas: ColumnaLista[] = [
    { key: 'cuenta', titulo: 'Cuenta', ancho: 'minmax(200px, 1.4fr)', movil: 'titulo' },
    { key: 'titular', titulo: 'Titular', ancho: '96px', movil: 'chico' },
    { key: 'tipo', titulo: 'Tipo', ancho: '110px', movil: 'chico' },
    { key: 'estado', titulo: 'Estado', ancho: '130px', movil: 'chico' },
    { key: 'recibe', titulo: 'Recibe', ancho: 'minmax(220px, 2fr)', movil: 'oculta' },
  ]
  type Fila = ReturnType<typeof armarCuentas>[number]
  const celda = (f: Fila, k: string): React.ReactNode => {
    if (k === 'cuenta') return <b style={{ color: color.ink, fontWeight: weight.semibold }} title={f.nombre}>{f.nombre}</b>
    if (k === 'titular') return <span style={{ color: color.mut }}>{f.titular}</span>
    if (k === 'tipo') return <span style={{ color: color.ink2 }}>{f.tipo}</span>
    if (k === 'estado') return <ChipEstado mapa={ESTADO} k={!f.activa ? 'baja' : f.recibe.length ? 'si' : 'no'} />
    if (k === 'recibe') return f.recibe.length ? <span style={{ color: color.ink2 }} title={f.recibe.join('\n')}>{f.recibe.join(' · ')}</span> : <span style={{ color: color.mut2 }}>—</span>
    return null
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <TiraConfiguracion activa="cuentas" ir={ir} />
      <div style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, color: color.mut, flex: '1 1 320px' }}>Dónde cae la plata. La lista sale del dashboard: el ERP no arma otra. Una cuenta no lleva descuento.</p>
        <a href={DASHBOARD} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}><Button variant="outline">Abrir en el dashboard ↗</Button></a>
      </div>
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: 14, overflow: 'hidden' }}>
        <VistasLista vistas={VISTAS_CUENTAS} valor={vista} conteo={conteo} onCambio={setVista} />
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center', padding: 12 }}>
          <BuscadorLista valor={q} onCambio={setQ} etiqueta="Buscar una cuenta" placeholder="Cuenta, banco o lo que recibe" />
          <Select aria-label="Titular" style={ANCHO_SELECT} value={titular} onChange={(e) => setTitular(e.target.value)}>
            <option value="">Todos los titulares</option>
            {titulares.map((t) => <option key={t} value={t}>{TITULAR[t] ?? t}</option>)}
          </Select>
          <Select aria-label="Tipo" style={ANCHO_SELECT} value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Todos los tipos</option>
            {tipos.map((t) => <option key={t} value={t}>{TIPO[t] ?? t}</option>)}
          </Select>
        </div>
        <ListaTrabajo
          columnas={columnas} filas={filas} claveDe={(f) => f.id} celda={celda} etiquetaFila={(f) => `la cuenta ${f.nombre}`}
          vacio={datos ? <div style={{ padding: space[6] }}><EmptyState title={q || titular || tipo ? 'No hay cuentas con eso.' : 'No hay cuentas en esta vista.'} /></div> : null}
        />
        <div style={{ padding: '8px 16px', fontSize: font.sm, color: color.mut, borderTop: `1px solid ${color.bg2}` }}>
          {datos ? `${filas.length} de ${todas.length} cuentas` : 'Leyendo las cuentas…'}
          {datos?.cuentasCopiadasEn ? ` · copiadas del dashboard el ${cuandoCorto(datos.cuentasCopiadasEn)}` : ''}
          {' · '}«Recibe» son las rutas vigentes de esta marca; el saldo de cada cuenta está en el dashboard.
          {ir && <> <Button variant="outline" onClick={() => ir('cuentas')}>Ver las rutas</Button></>}
        </div>
      </div>
    </div>
  )
}

/**
 * El DEPÓSITO EVENTO de Stunned (motor sql/058, Bruno 29-oct): se activa para una feria o un evento —aparece en Mover y
 * recibir y en la Caja como «caja del evento»— y se desactiva SÓLO con el stock en 0. Si quedó algo, el ERP lo lista.
 */
function DepositoEvento() {
  const [ev, setEv] = useState<DepositoErp | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [quedan, setQuedan] = useState<QuedaEnDeposito[]>([])
  const [enCurso, setEnCurso] = useState(false)
  const tomar = (ds: DepositoErp[]) => setEv(ds.find((d) => d.id === 'evento') ?? null)
  useEffect(() => { leerDepositos('stunned').then((r) => tomar(r.depositos)).catch((e) => setError(e.message)) }, [])
  const cambiar = async () => {
    if (!ev) return
    setEnCurso(true); setError(null); setQuedan([])
    try { tomar((await activarDeposito('stunned', 'evento', !ev.activo)).depositos) }
    catch (e) {
      const x = e as Error & { datos?: { quedan?: QuedaEnDeposito[] } }
      setError(x.message); setQuedan(x.datos?.quedan ?? [])
    } finally { setEnCurso(false) }
  }
  if (!ev && !error) return null
  return (
    <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: space[2] }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[3], flexWrap: 'wrap' }}>
        <div>
          <b style={{ color: color.ink }}>Depósito Evento · Stunned</b>
          <div style={{ color: color.mut, fontSize: font.sm }}>
            {!ev ? 'No se pudo leer.' : ev.activo ? `Activo · ${ev.unidades} ${ev.unidades === 1 ? 'prenda' : 'prendas'} adentro` : 'Desactivado'}
            {' · '}Para una feria o un evento: se le mueve mercadería, se vende con la caja del evento y se desactiva cuando quedó en 0.
          </div>
        </div>
        {ev && <Button size="sm" variant={ev.activo ? 'outline' : 'solid'} disabled={enCurso} onClick={cambiar}>{ev.activo ? 'Desactivar' : 'Activar'}</Button>}
      </div>
      {error && <Notice tone="danger" onClose={() => { setError(null); setQuedan([]) }}>
        {error}
        {quedan.length > 0 && <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{quedan.map((q) => <li key={`${q.product_id}:${q.size_id}`}>{q.sku ?? `${q.product_id}/${q.size_id}`} · {q.cantidad}</li>)}</ul>}
      </Notice>}
    </div>
  )
}

export function EstructuraErp() {
  const { marca: delShell } = useSesion()
  const marca: MarcaErp = delShell === 'bdi' ? 'bdi' : 'zattia'
  const { datos, error, setError } = useEstructura(marca)
  const [q, setQ] = useState('')
  const todas = useMemo(() => (datos ? armarEstructura(datos) : []), [datos])
  const t = q.trim().toLowerCase()
  const filas = todas.filter((f) => !t || [f.nombre, ...f.depositos.map((d) => d.nombre)].join(' ').toLowerCase().includes(t))
  const cuits = new Set(todas.map((f) => f.cuit).filter(Boolean))

  const columnas: ColumnaLista[] = [
    { key: 'marca', titulo: 'Marca', ancho: '150px', movil: 'titulo' },
    { key: 'depositos', titulo: 'Depósitos', ancho: 'minmax(200px, 1.3fr)', movil: 'oculta' },
    { key: 'pv', titulo: 'Punto de venta', ancho: 'minmax(200px, 1.3fr)', movil: 'chico' },
    { key: 'factura', titulo: 'Factura', ancho: 'minmax(200px, 1.2fr)', movil: 'oculta' },
  ]
  type Fila = ReturnType<typeof armarEstructura>[number]
  const dos = (a: React.ReactNode, b: React.ReactNode) => (
    <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <span style={{ color: color.ink2, overflow: 'hidden', textOverflow: 'ellipsis' }}>{a}</span>
      {b && <span style={{ color: color.mut, fontSize: font.sm, overflow: 'hidden', textOverflow: 'ellipsis' }}>{b}</span>}
    </span>
  )
  const celda = (f: Fila, k: string): React.ReactNode => {
    if (k === 'marca') return dos(<b style={{ color: color.ink }}>{f.nombre}</b>, f.linea ?? f.tienda)
    if (k === 'depositos') return dos(f.depositos.map((d) => d.nombre).join(' · ') || '—', f.depositos.some((d) => !d.vende) ? `no venden: ${f.depositos.filter((d) => !d.vende).map((d) => d.nombre).join(', ')}` : null)
    if (k === 'pv') return dos(f.puntoVenta != null ? `PV ${f.puntoVenta}${f.nombreFiscal ? ` · ${f.nombreFiscal}` : ''}` : 'Sin punto de venta', f.domicilio)
    if (k === 'factura') return dos(f.razonSocial ?? '—', f.cuit ? `CUIT ${cuitConGuiones(f.cuit)}${f.condicionIva ? ` · ${f.condicionIva}` : ''}` : null)
    return null
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <p style={{ margin: 0, color: color.mut }}>Qué marcas hay, dónde se guarda la mercadería y con qué punto de venta factura cada una.</p>
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      {marca === 'zattia' && <DepositoEvento />}
      <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center', padding: 12 }}>
          <BuscadorLista valor={q} onCambio={setQ} etiqueta="Buscar marca o depósito" placeholder="Marca o depósito" />
        </div>
        <ListaTrabajo
          columnas={columnas} filas={filas} claveDe={(f) => f.id} celda={celda} etiquetaFila={(f) => `la marca ${f.nombre}`}
          vacio={datos ? <div style={{ padding: space[6] }}><EmptyState title="No hay marcas ni depósitos con eso." /></div> : null}
        />
        <div style={{ padding: '8px 16px', fontSize: font.sm, color: color.mut, borderTop: `1px solid ${color.bg2}` }}>
          {datos ? `${cuits.size === 1 ? 'Un CUIT' : `${cuits.size} CUIT`}, ${todas.length === 1 ? 'una marca' : `${todas.length} marcas`} en esta base` : 'Leyendo…'}
          {marca === 'zattia' ? ' · Stunned es una línea de Zattia: comparte depósitos y punto de venta.' : ''}
          {' · '}Esto no se cambia desde acá: un depósito o un punto de venta tocan el stock y la facturación.
        </div>
      </div>
    </div>
  )
}
