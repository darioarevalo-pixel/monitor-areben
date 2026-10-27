'use client'

/**
 * ERP › Stock › Conciliación (paso 7), con el molde de REGISTRO (diseño §3–§4; tablero 3 del v8, «Comparación con TN y ML»):
 * el ERP contra Tienda Nube, GN y Mercado Libre (sólo BDI), un día. Arriba, cuánto coincide; abajo, UNA lista con lo que ⛔
 * coincide, con una vista por clase (con su número) y qué mirar. Sólo lectura: una prenda abre su ficha AL COSTADO
 * (`FichaPrenda`, la de Stock); un pedido, Tienda Nube (↗).
 *
 * Se calcula una vez por día, a las 13:40 (el cruce del motor, `bin/tn.mjs conciliar`); el stock de Tienda Nube se lee
 * en ese momento. Hasta el corte GN sirve y el ERP es la prueba: acá se mira, ⛔ se arregla. ⛔ cambia qué se calcula
 * (`lib/erp/conciliacion.core.js` y el servidor siguen iguales): la pantalla sólo aplana los grupos en filas.
 */

import { useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { Button, EmptyState, MenuAcciones, Notice, Select, color, font, space, type AccionMenu } from '@/components/ui'
import { ListaTrabajo } from '@/components/ui/ListaTrabajo'
import { BuscadorLista, ChipEstado, TileResumen, VistasLista, cuandoCorto } from '@/components/ui/PiezasLista'
import { leerConciliacion, type ConciliacionDelDia, type FilaConciliacion, type MarcaErp, type TiendaErp } from '@/lib/erp/cliente'
import { normal } from '@/lib/erp/stock-lista.core.js'
import { FichaPrenda, type PrendaAbierta } from './stock/FichaPrenda'
import type { PrendaAAjustar } from './stock/StockErp'

const ANCHO_SELECT: React.CSSProperties = { cursor: 'pointer', width: 'auto', flex: '0 0 auto' }
/** Contra qué se compara cada fila (el `tipo` del motor). */
const CONTRA: Record<string, string> = { stock_tn: 'Tienda Nube', stock_ml: 'Mercado Libre', pedido_erp: 'Pedido Tienda Nube · ERP', pedido_gn: 'Pedido Tienda Nube · Gestión Nube', pedido_ml: 'Venta Mercado Libre · Gestión Nube' }
const dia = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`
const pesos = (n: number | null) => (n == null ? '—' : `$ ${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`)
const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : '—')

type Fila = FilaConciliacion & { id: string; grupo: string; grupoNombre: string; mirar: string }

const COLUMNAS = [
  { key: 'que', titulo: 'Producto o pedido', ancho: 'minmax(220px, 2fr)' },
  { key: 'contra', titulo: 'Contra', ancho: '128px' },
  { key: 'ellos', titulo: 'Ellos', ancho: '92px', derecha: true },
  { key: 'erp', titulo: 'ERP', ancho: '92px', derecha: true },
  { key: 'gn', titulo: 'Gestión Nube', ancho: '64px', derecha: true },
  { key: 'dias', titulo: 'Días', ancho: '56px', derecha: true },
  { key: 'paso', titulo: 'Qué pasó', ancho: 'minmax(220px, 1.6fr)' },
]

export function ConciliacionDia({ ajustar }: { ajustar: (p: PrendaAAjustar) => void }) {
  const { marca: delShell } = useSesion()
  const marca: MarcaErp = delShell === 'bdi' ? 'bdi' : 'zattia'
  // En la base de Zattia hay dos tiendas: Zattia y Stunned (su Tienda Nube es propia).
  const [deZattia, setDeZattia] = useState<TiendaErp>('zattia')
  const tienda: TiendaErp = marca === 'bdi' ? 'bdi' : deZattia
  const [fecha, setFecha] = useState<string | null>(null)
  const [datos, setDatos] = useState<ConciliacionDelDia | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vuelta, setVuelta] = useState(0)
  const pedido = `${tienda}|${fecha ?? ''}|${vuelta}`
  const [leido, setLeido] = useState<string | null>(null)
  const cargando = leido !== pedido
  const [vista, setVista] = useState('todas')
  const [q, setQ] = useState('')
  const [ficha, setFicha] = useState<PrendaAbierta | null>(null)

  useEffect(() => {
    let vivo = true
    leerConciliacion(tienda, fecha)
      .then((d) => { if (vivo) { setDatos(d); setError(null) } })
      .catch((e) => vivo && setError(e instanceof Error ? e.message : 'No se pudo leer la conciliación del día.'))
      .finally(() => vivo && setLeido(pedido))
    return () => { vivo = false }
  }, [tienda, fecha, pedido])

  const todas: Fila[] = useMemo(() => (datos?.grupos ?? []).flatMap((g) => g.filas.map((f) => ({ ...f, id: `${g.tipo}/${f.clave}`, grupo: `${g.tipo}/${g.clase}`, grupoNombre: g.nombre, mirar: g.mirar }))), [datos])
  const vistas = useMemo(() => [['todas', 'No coinciden'] as const, ...(datos?.grupos ?? []).map((g) => [`${g.tipo}/${g.clase}`, g.nombre] as const)], [datos])
  const prendaDe = (f: FilaConciliacion) => (f.nombre ? `${f.nombre}${f.talleNombre ? ` · ${f.talleNombre}` : ''}` : f.sku ?? f.clave)
  const buscadas = useMemo(() => {
    const t = normal(q)
    return !t ? todas : todas.filter((f) => normal(`${prendaDe(f)} ${f.sku ?? ''} ${f.numero ?? ''}`).includes(t))
  }, [todas, q])
  const conteo = useMemo(() => Object.fromEntries(vistas.map(([k]) => [k, k === 'todas' ? buscadas.length : buscadas.filter((f) => f.grupo === k).length])), [vistas, buscadas])
  // Una vista que ya ⛔ está (otro día, otra tienda) ⇒ todas.
  const enVista = vistas.some(([k]) => k === vista) ? vista : 'todas'
  const filas = enVista === 'todas' ? buscadas : buscadas.filter((f) => f.grupo === enVista)

  const esStock = (f: Fila) => f.tipo.startsWith('stock_')
  const abrir = (f: Fila) => { if (f.producto && f.talle) setFicha({ producto: f.producto, talle: f.talle, fila: null }) }

  const celda = (f: Fila, k: string): React.ReactNode => {
    if (k === 'que') return esStock(f)
      ? <span title={f.sku ?? undefined}><b style={{ color: color.ink }}>{prendaDe(f)}</b>{f.sku && f.nombre && <span style={{ color: color.mut }}> · {f.sku}</span>}</span>
      : <span title={[f.estado, f.medio].filter(Boolean).join(' · ')}><b style={{ color: color.ink }}>#{f.numero}</b><span style={{ color: color.mut }}> · {[f.estado, f.medio].filter(Boolean).join(' · ') || '—'}</span></span>
    if (k === 'contra') return <span style={{ color: color.ink2 }}>{CONTRA[f.tipo] ?? f.tipo}</span>
    if (k === 'ellos') return <span style={{ fontWeight: 600 }}>{esStock(f) ? f.tn ?? '—' : pesos(f.total)}</span>
    if (k === 'erp') return esStock(f)
      ? <span title={f.reservado ? `${f.reservado} reservado por pedidos sin pagar` : undefined}>{f.erp ?? '—'}{f.reservado ? <span style={{ color: color.mut }}> ({f.reservado} res.)</span> : null}</span>
      : <span>{pesos(f.totalErp)}</span>
    if (k === 'gn') return <span style={{ color: color.mut }}>{esStock(f) ? f.gn ?? '—' : '—'}</span>
    if (k === 'dias') return <span style={{ color: f.dias > 1 ? 'var(--mo-warning-ink)' : color.mut }} title={f.dias > 1 ? 'Viene de días anteriores' : undefined}>{f.dias}</span>
    if (k === 'paso') return <span title={`${f.grupoNombre}: ${f.mirar}${f.motivo ? ` · ${f.motivo}` : ''}`}><ChipEstado mapa={{ x: ['warning', f.grupoNombre] }} k="x" /></span>
    return null
  }

  const acciones = (f: Fila) => {
    const menu: AccionMenu[] = [
      ...(f.producto && f.talle ? [{ key: 'ficha', label: 'Abrir el producto', icono: 'abrir' as const, onClick: () => abrir(f) }] : []),
      ...(f.link ? [{ key: 'tn', label: 'Ver en Tienda Nube ↗', icono: 'abrir' as const, onClick: () => window.open(f.link!, '_blank', 'noopener') }] : []),
    ]
    return menu.length ? <MenuAcciones acciones={menu} etiqueta={`Más acciones de ${esStock(f) ? prendaDe(f) : `#${f.numero}`}`} vertical alinear="izquierda" /> : null
  }

  const calculado = !!datos?.tarjetas.some((t) => t.calculado)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <p style={{ margin: 0, color: color.mut }}>El ERP contra Tienda Nube, Gestión Nube y Mercado Libre: cuánto coincide y lo que no, con qué mirar. Se calcula una vez por día, a las 13:40.</p>
      <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center' }}>
        {marca === 'zattia' && (
          <Select aria-label="Tienda" style={ANCHO_SELECT} value={deZattia} onChange={(e) => { setDeZattia(e.target.value as TiendaErp); setFecha(null); setFicha(null) }}>
            <option value="zattia">Zattia</option><option value="stunned">Stunned</option>
          </Select>
        )}
        {datos && datos.dias.length > 0 && (
          <Select aria-label="Día" style={ANCHO_SELECT} value={datos.fecha ?? ''} onChange={(e) => setFecha(e.target.value)} disabled={cargando}>
            {datos.dias.map((d) => <option key={d} value={d}>{dia(d)}</option>)}
          </Select>
        )}
        {datos?.calculadoEn && <span style={{ color: color.mut }}>Calculado {cuandoCorto(datos.calculadoEn)}</span>}
        <Button variant="outline" disabled={cargando} onClick={() => setVuelta((n) => n + 1)}>{cargando ? 'Leyendo…' : 'Volver a leer'}</Button>
      </div>

      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      {cargando && !datos && <EmptyState title="Leyendo la conciliación…" />}
      {datos?.sinTablas && <Notice tone="warning">La conciliación todavía no está instalada en esta base.</Notice>}
      {datos && !datos.sinTablas && !datos.fecha && <EmptyState title="Todavía no se calculó ningún día." />}

      {datos && datos.fecha && (
        <>
          <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
            <TileResumen oscuro titulo="No coinciden" valor={!calculado ? '—' : datos.noCierran.toLocaleString('es-AR')} nota={!calculado ? 'Ese día no se calculó' : datos.noCierran ? `del ${dia(datos.fecha)}` : 'Todo coincide'} />
            {datos.tarjetas.map((t) => (
              <TileResumen
                key={t.tipo} titulo={t.nombre}
                valor={!t.calculado ? '—' : t.tipo.startsWith('stock_') ? pct(t.cierran ?? 0, t.total ?? 0) : (t.noCierran ?? 0).toLocaleString('es-AR')}
                nota={!t.calculado ? 'No se calculó ese día.'
                  : t.tipo.startsWith('stock_') ? `Coinciden ${t.cierran} de ${t.total} ${t.unidad}${t.aparte ? ` · ${t.aparte} ${t.tipo === 'stock_ml' ? 'publicaciones' : 'de la tienda'} sin producto en el ERP` : ''}`
                    : t.noCierran ? `${t.noCierran} de ${t.total} ${t.unidad} no coinciden (7 días)` : `Coinciden los ${t.total} ${t.unidad} (7 días)`}
              />
            ))}
            <TileResumen titulo="Stock por depósito: Gestión Nube y el ERP" valor={!datos.gn.calculado ? '—' : (datos.gn.sinExplicar ?? 0).toLocaleString('es-AR')}
              nota={!datos.gn.calculado ? 'No se calculó ese día.' : datos.gn.sinExplicar ? 'sin explicar: verlas en Diferencias con Gestión Nube' : 'Todo explicado (Diferencias con Gestión Nube)'} />
          </div>
          {datos.enVuelo > 0 && <Notice tone="neutral">Recién pagados, todavía en camino: {datos.enVuelo}.</Notice>}
          {datos.desconocidas > 0 && <Notice tone="warning">{datos.desconocidas} con una clase que esta pantalla todavía no conoce.</Notice>}

          <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: 14, overflow: 'hidden' }}>
            <VistasLista todasRojas vistas={vistas} valor={enVista} conteo={conteo} onCambio={setVista} />
            <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center', padding: 12 }}>
              <BuscadorLista valor={q} onCambio={setQ} etiqueta="Buscar en la conciliación" placeholder="Producto, código o número de pedido" />
            </div>
            {enVista !== 'todas' && <div style={{ padding: '0 16px 10px', fontSize: font.sm, color: color.mut }}>Qué mirar: {datos.grupos.find((g) => `${g.tipo}/${g.clase}` === enVista)?.mirar}{(() => { const g = datos.grupos.find((x) => `${x.tipo}/${x.clase}` === enVista); return g?.deAntes ? ` (${g.deAntes} vienen de días anteriores)` : '' })()}</div>}
            <ListaTrabajo
              columnas={COLUMNAS} filas={filas} claveDe={(f) => f.id} celda={celda} acciones={acciones} anchoAcciones={40}
              activa={ficha ? filas.find((f) => f.producto === ficha.producto && f.talle === ficha.talle)?.id ?? null : null}
              onAbrir={(f) => (f.producto && f.talle ? abrir(f) : f.link ? window.open(f.link, '_blank', 'noopener') : undefined)}
              etiquetaFila={(f) => (esStock(f) ? `el producto ${prendaDe(f)}` : `el pedido #${f.numero}`)}
              vacio={!cargando ? <div style={{ padding: space[6] }}><EmptyState title={q ? 'Nada con ese producto o pedido.' : calculado ? 'Todo coincide.' : 'Ese día no se calculó.'} /></div> : null}
            />
            <div style={{ padding: '8px 16px', fontSize: font.sm, color: color.mut, borderTop: `1px solid ${color.bg2}` }}>
              {filas.length.toLocaleString('es-AR')} que no coinciden · el arreglo se hace en el monitor o en Gestión Nube, no en el ERP
            </div>
          </div>
        </>
      )}

      {ficha && <FichaPrenda key={`${marca}/${ficha.producto}/${ficha.talle}`} marca={marca} prenda={ficha} onCerrar={() => setFicha(null)} ajustar={ajustar} />}
    </div>
  )
}
