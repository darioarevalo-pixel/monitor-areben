'use client'

/**
 * ERP › Configuración › Cuentas y › Marcas, depósitos y puntos de venta (v8 `Configuracion.dc.html`, tabs `cuentas` y
 * `estructura`): SÓLO LECTURA. Cuentas = dónde cae la plata, la copia de las del dashboard, con qué rutas vigentes de la
 * marca caen en cada una (el saldo y el alta ⇒ «Abrir en el dashboard»). Estructura = una fila por línea con sus
 * depósitos, punto de venta y razón social. Núcleo puro: `lib/erp/estructura.core.js`; servidor: `api/_erp-estructura.js`.
 */

import { useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { Button, EmptyState, Notice, Select, color, font, space, weight } from '@/components/ui'
import { ListaTrabajo } from '@/components/ui/ListaTrabajo'
import { BuscadorLista, ChipEstado, VistasLista, cuandoCorto } from '@/components/ui/PiezasLista'
import { leerEstructura, type EstructuraDeMarca, type MarcaErp } from '@/lib/erp/cliente'
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

export function CuentasErp({ ir }: { ir?: (p: PiezaConfiguracion) => void }) {
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
  const filas = useMemo(() => filtrarCuentas(base, { vista }), [base, vista])
  const titulares = [...new Set(todas.map((f) => f.titularClave))].filter(Boolean).sort()
  const tipos = [...new Set(todas.map((f) => f.tipoClave))].filter(Boolean).sort()

  const columnas = [
    { key: 'cuenta', titulo: 'Cuenta', ancho: 'minmax(200px, 1.4fr)' },
    { key: 'titular', titulo: 'Titular', ancho: '96px' },
    { key: 'tipo', titulo: 'Tipo', ancho: '110px' },
    { key: 'estado', titulo: 'Estado', ancho: '130px' },
    { key: 'recibe', titulo: 'Recibe', ancho: 'minmax(220px, 2fr)' },
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
      <TiraConfiguracion activa="cuentas-reales" ir={ir} />
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

export function EstructuraErp() {
  const { marca: delShell } = useSesion()
  const marca: MarcaErp = delShell === 'bdi' ? 'bdi' : 'zattia'
  const { datos, error, setError } = useEstructura(marca)
  const [q, setQ] = useState('')
  const todas = useMemo(() => (datos ? armarEstructura(datos) : []), [datos])
  const t = q.trim().toLowerCase()
  const filas = todas.filter((f) => !t || [f.nombre, ...f.depositos.map((d) => d.nombre)].join(' ').toLowerCase().includes(t))
  const cuits = new Set(todas.map((f) => f.cuit).filter(Boolean))

  const columnas = [
    { key: 'marca', titulo: 'Marca', ancho: '150px' },
    { key: 'depositos', titulo: 'Depósitos', ancho: 'minmax(200px, 1.3fr)' },
    { key: 'pv', titulo: 'Punto de venta', ancho: 'minmax(200px, 1.3fr)' },
    { key: 'factura', titulo: 'Factura', ancho: 'minmax(200px, 1.2fr)' },
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
      <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center', padding: 12 }}>
          <BuscadorLista valor={q} onCambio={setQ} etiqueta="Buscar marca o depósito" placeholder="Marca o depósito" />
        </div>
        <ListaTrabajo
          columnas={columnas} filas={filas} claveDe={(f) => f.id} celda={celda} densidad="comoda" etiquetaFila={(f) => `la marca ${f.nombre}`}
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
