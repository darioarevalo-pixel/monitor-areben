'use client'

/**
 * ERP › Stock › Diferencias con GN (`pantallas.md` #9), con el molde de REGISTRO (diseño §3–§4; tablero 3 del v8): lo que el
 * libro de stock ⛔ pudo explicar al comparar su día con el de GN, y la SOBREVENTA (las prendas que el libro deja en negativo:
 * la última unidad vendida por dos lados). Arriba, los números; abajo, UNA lista con una vista por clase (con su número) y
 * qué mirar. Sólo lectura: cada fila abre la ficha de la prenda AL COSTADO (`FichaPrenda`, la de Stock).
 *
 * El libro se calcula una vez por día (la corrida de las 13:00) con las fotos de GN de las 06:40. Pestaña de TRANSICIÓN: se
 * va el día del corte. ⛔ cambia qué se calcula (`lib/erp/diferencias.core.js` y el servidor siguen iguales).
 */

import { useEffect, useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { Button, EmptyState, MenuAcciones, Notice, Select, color, font, space, type AccionMenu } from '@/components/ui'
import { ListaTrabajo, type ColumnaLista } from '@/components/ui/ListaTrabajo'
import { BuscadorLista, ChipEstado, TileResumen, VistasLista, cuandoCorto } from '@/components/ui/PiezasLista'
import { leerDiferencias, type DiferenciasDelDia, type MarcaErp } from '@/lib/erp/cliente'
import { NOMBRE_DEPOSITO } from '@/lib/erp/stock.core.js'
import { normal } from '@/lib/erp/stock-lista.core.js'
import { FichaPrenda, type PrendaAbierta } from './stock/FichaPrenda'
import type { PrendaAAjustar } from './stock/StockErp'
import type { Tone } from '@/components/ui/tokens'
import { useTiendaErp } from '@/lib/erp/linea-erp'

const ANCHO_SELECT: React.CSSProperties = { cursor: 'pointer', width: 'auto', flex: '0 0 auto' }
const NOMBRE_LINEA: Record<string, string> = { bdi: 'BDI', zattia: 'Zattia', stunned: 'Stunned' }
const conSigno = (n: number | null) => (n == null ? '—' : n > 0 ? `+${n}` : String(n))
const dia = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`
const SOBRE = 'sobreventa'

/** Una fila de la lista: una diferencia sin explicar o una prenda en negativo (sobreventa). */
type Fila = {
  id: string; vista: string; clase: string; tono: Tone; mirar: string; explicacion: string | null
  producto: string; talle: string; nombre: string | null; talleNombre: string | null; linea: string; deposito: string
  deltaGN: number | null; deltaLibro: number | null; nivelGN: number | null; nivelLibro: number
}

const COLUMNAS: ColumnaLista[] = [
  { key: 'p', titulo: 'Producto', ancho: 'minmax(220px, 2fr)', movil: 'titulo' },
  { key: 'dep', titulo: 'Dónde', ancho: '104px', movil: 'chico' },
  { key: 'libro', titulo: 'ERP', ancho: '76px', derecha: true, movil: 'dato' },
  { key: 'gn', titulo: 'Gestión Nube', ancho: '64px', derecha: true, movil: 'chico' },
  { key: 'dgn', titulo: 'Gestión Nube movió', ancho: '84px', derecha: true, movil: 'oculta' },
  { key: 'dlibro', titulo: 'ERP movió', ancho: '84px', derecha: true, movil: 'oculta' },
  { key: 'paso', titulo: 'Qué pasó', ancho: 'minmax(220px, 1.6fr)', movil: 'chico' },
]

export function DiferenciasDia({ ajustar }: { ajustar: (p: PrendaAAjustar) => void }) {
  const { marca: delShell } = useSesion()
  const marca: MarcaErp = delShell === 'bdi' ? 'bdi' : 'zattia'
  const tienda = useTiendaErp()
  const [fecha, setFecha] = useState<string | null>(null)
  const [datos, setDatos] = useState<DiferenciasDelDia | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vuelta, setVuelta] = useState(0)
  // Qué se pidió y qué llegó: «cargando» es que todavía ⛔ llegó lo pedido (sin setState dentro del effect).
  const pedido = `${marca}|${fecha ?? ''}|${vuelta}`
  const [leido, setLeido] = useState<string | null>(null)
  const cargando = leido !== pedido
  const [vista, setVista] = useState('todas')
  const [q, setQ] = useState('')
  const [ficha, setFicha] = useState<PrendaAbierta | null>(null)

  useEffect(() => {
    let vivo = true
    leerDiferencias(marca, fecha)
      .then((d) => { if (vivo) { setDatos(d); setError(null) } })
      .catch((e) => vivo && setError(e instanceof Error ? e.message : 'No se pudieron leer las diferencias del día.'))
      .finally(() => vivo && setLeido(pedido))
    return () => { vivo = false }
  }, [marca, fecha, pedido])

  const todas: Fila[] = useMemo(() => [
    ...(datos?.grupos ?? []).flatMap((g) => g.filas.map((f): Fila => ({
      id: `${g.clase}/${f.producto}/${f.talle}/${f.deposito}`, vista: g.clase, clase: g.nombre, tono: 'warning', mirar: g.mirar, explicacion: f.explicacion,
      producto: f.producto, talle: f.talle, nombre: f.nombre, talleNombre: f.talleNombre, linea: f.linea, deposito: f.deposito,
      deltaGN: f.deltaGN, deltaLibro: f.deltaLibro, nivelGN: f.nivelGN, nivelLibro: f.nivelLibro,
    }))),
    ...(datos?.sobreventa ?? []).map((f): Fila => ({
      id: `${SOBRE}/${f.producto}/${f.talle}/${f.deposito}`, vista: SOBRE, clase: 'Sobreventa', tono: 'danger', mirar: 'La última unidad se vendió por dos lados, o falta un ingreso. Es el estado de hoy, no del día elegido.', explicacion: null,
      producto: f.producto, talle: f.talle, nombre: f.nombre, talleNombre: f.talleNombre, linea: f.linea, deposito: f.deposito,
      deltaGN: null, deltaLibro: null, nivelGN: null, nivelLibro: f.nivelLibro,
    })),
  ], [datos])
  const sinExplicar = todas.filter((f) => f.vista !== SOBRE).length
  const vistas = useMemo(() => [['todas', 'Sin explicar'] as const, ...(datos?.grupos ?? []).map((g) => [g.clase, g.nombre] as const), [SOBRE, 'Sobreventa'] as const], [datos])
  const prendaDe = (f: Fila) => `${f.nombre ?? `Producto ${f.producto}`} · ${f.talleNombre ?? f.talle}`
  const buscadas = useMemo(() => {
    const t = normal(q)
    return !t ? todas : todas.filter((f) => normal(prendaDe(f)).includes(t))
  }, [todas, q])
  const conteo = useMemo(() => Object.fromEntries(vistas.map(([k]) => [k, buscadas.filter((f) => (k === 'todas' ? f.vista !== SOBRE : f.vista === k)).length])), [vistas, buscadas])
  const enVista = vistas.some(([k]) => k === vista) ? vista : 'todas'
  const filas = buscadas.filter((f) => (enVista === 'todas' ? f.vista !== SOBRE : f.vista === enVista))

  const abrir = (f: Fila) => setFicha({ producto: f.producto, talle: f.talle, fila: null })
  const numero = (n: number | null, alerta = false) => <span style={{ fontWeight: 600, color: n == null ? color.mut2 : alerta || n < 0 ? 'var(--mo-danger-ink)' : color.ink }}>{n ?? '—'}</span>

  const celda = (f: Fila, k: string): React.ReactNode => {
    if (k === 'p') return <span title={prendaDe(f)}><b style={{ color: color.ink }}>{prendaDe(f)}</b>{f.linea !== marca && <span style={{ color: color.mut }}> · {NOMBRE_LINEA[f.linea] ?? f.linea}</span>}</span>
    if (k === 'dep') return <span style={{ color: color.ink2 }}>{NOMBRE_DEPOSITO[f.deposito as keyof typeof NOMBRE_DEPOSITO] ?? f.deposito}</span>
    if (k === 'libro') return numero(f.nivelLibro)
    if (k === 'gn') return <span style={{ color: f.nivelGN != null && f.nivelGN !== f.nivelLibro ? 'var(--mo-warning-ink)' : color.mut }}>{f.nivelGN ?? '—'}</span>
    if (k === 'dgn') return <span style={{ color: color.mut }}>{conSigno(f.deltaGN)}</span>
    if (k === 'dlibro') return <span style={{ color: color.mut }}>{conSigno(f.deltaLibro)}</span>
    if (k === 'paso') return <span title={`${f.clase}: ${f.explicacion ?? f.mirar}`}><ChipEstado mapa={{ x: [f.tono, f.clase] }} k="x" />{f.explicacion && <span style={{ color: color.mut }}> {f.explicacion}</span>}</span>
    return null
  }
  const acciones = (f: Fila) => {
    const menu: AccionMenu[] = [{ key: 'ficha', label: 'Abrir el producto', icono: 'abrir', onClick: () => abrir(f) }]
    return <MenuAcciones acciones={menu} etiqueta={`Más acciones de ${prendaDe(f)}`} vertical alinear="izquierda" />
  }

  const explicadas = (datos?.explicadas ?? []).reduce((a, e) => a + e.variantes, 0)
  const grupo = datos?.grupos.find((g) => g.clase === enVista)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <p style={{ margin: 0, color: color.mut }}>{tienda === 'stunned'
        ? 'Stunned ya vive en el ERP: lo que quedó de cuando se comparaba con Gestión Nube, y los productos en negativo.'
        : 'Sólo mientras convivimos con Gestión Nube: lo que el stock del ERP no pudo explicar al compararse con Gestión Nube, y los productos que quedaron en negativo. Se va el día del corte.'}</p>
      <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center' }}>
        {datos && datos.dias.length > 0 && (
          <Select aria-label="Día" style={ANCHO_SELECT} value={datos.fecha ?? ''} onChange={(e) => setFecha(e.target.value)} disabled={cargando}>
            {datos.dias.map((d) => <option key={d} value={d}>{dia(d)}</option>)}
          </Select>
        )}
        {datos?.fotoHasta && <span style={{ color: color.mut }}>Fotos de Gestión Nube de {cuandoCorto(datos.fotoDesde)} a {cuandoCorto(datos.fotoHasta)}</span>}
        <Button variant="outline" disabled={cargando} onClick={() => setVuelta((n) => n + 1)}>{cargando ? 'Leyendo…' : 'Volver a leer'}</Button>
      </div>

      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      {cargando && !datos && <EmptyState title="Leyendo el ERP…" />}
      {datos && !datos.fecha && <EmptyState title="El ERP todavía no calculó ningún día." />}

      {datos && (
        <>
          {datos.fecha && (
            <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap' }}>
              <TileResumen oscuro titulo="Sin explicar" valor={datos.inexplicadas.toLocaleString('es-AR')} nota={datos.inexplicadas ? `stock del ERP ≠ Gestión Nube, el ${dia(datos.fecha)}` : `todo explicado el ${dia(datos.fecha)}`} />
              <TileResumen titulo="Sobreventa" valor={datos.sobreventaSinConexion || datos.sobreventaError ? '—' : datos.sobreventa.length.toLocaleString('es-AR')} nota={datos.sobreventaSinConexion ? 'falta la conexión al ERP' : datos.sobreventaError ? 'no se pudo sumar el ERP' : 'quedaron en negativo (hoy)'} />
              <TileResumen titulo="Explicadas solas" valor={explicadas.toLocaleString('es-AR')} nota={datos.explicadas.length ? datos.explicadas.map((e) => `${e.nombre} ${e.variantes}`).join(' · ') : 'ninguna'} />
            </div>
          )}
          {datos.desconocidas > 0 && <Notice tone="warning">{datos.desconocidas} con una clase que esta pantalla todavía no conoce.</Notice>}
          {datos.sobreventaSinConexion && <Notice tone="warning">Falta la conexión al ERP en este servidor: la sobreventa se ve en producción.</Notice>}
          {datos.sobreventaError && <Notice tone="danger">No se pudo sumar el ERP: {datos.sobreventaError}</Notice>}

          <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: 14, overflow: 'hidden' }}>
            <VistasLista todasRojas vistas={vistas} valor={enVista} conteo={conteo} onCambio={setVista} />
            <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center', padding: 12 }}>
              <BuscadorLista valor={q} onCambio={setQ} etiqueta="Buscar en las diferencias" placeholder="Producto o variante" />
            </div>
            {(grupo || enVista === SOBRE) && (
              <div style={{ padding: '0 16px 10px', fontSize: font.sm, color: color.mut }}>
                Qué mirar: {grupo ? `${grupo.mirar} (${grupo.unidades} u)` : 'la última unidad se vendió por dos lados (el local y la tienda online), o falta un ingreso. Es el estado de hoy, no del día elegido.'}
              </div>
            )}
            <ListaTrabajo
              columnas={COLUMNAS} filas={filas} claveDe={(f) => f.id} celda={celda} acciones={acciones} anchoAcciones={40}
              activa={ficha ? filas.find((f) => f.producto === ficha.producto && f.talle === ficha.talle)?.id ?? null : null}
              onAbrir={abrir} etiquetaFila={(f) => `el producto ${prendaDe(f)}`}
              vacio={!cargando ? <div style={{ padding: space[6] }}><EmptyState title={q ? 'Nada con ese producto.' : enVista === SOBRE ? 'Ningún producto en negativo.' : 'Todo explicado.'} /></div> : null}
            />
            <div style={{ padding: '8px 16px', fontSize: font.sm, color: color.mut, borderTop: `1px solid ${color.bg2}` }}>
              {sinExplicar.toLocaleString('es-AR')} sin explicar · {(datos.sobreventa ?? []).length.toLocaleString('es-AR')} en negativo · pestaña de transición: se va cuando se apague Gestión Nube
            </div>
          </div>
        </>
      )}

      {ficha && <FichaPrenda key={`${marca}/${ficha.producto}/${ficha.talle}`} marca={marca} prenda={ficha} onCerrar={() => setFicha(null)} ajustar={ajustar} />}
    </div>
  )
}
