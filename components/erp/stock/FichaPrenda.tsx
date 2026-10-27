'use client'

/**
 * La ficha de una prenda, AL COSTADO de la lista de Stock (diseño §5 y tablero 3 del v8): el disponible en grande, lo que
 * hay en cada depósito (el ERP al lado de GN mientras convivimos) y el HISTORIAL con lo que quedó después de cada
 * movimiento. Lee `vista=stock&producto=…` (el libro de esa prenda, fila por fila).
 *
 * 🔑 Botones (diseño §4): «Ajustar» vive en el ERP (abre «Nuevo ajuste» con la prenda cargada); transferir y etiquetas se
 * hacen en el monitor ⇒ «↗». Sólo lectura: la ficha ⛔ escribe nada.
 */

import { lineaDe } from '@/lib/lineas'
import { useEffect, useState } from 'react'
import { Button, MenuAcciones, Notice, color, font, space, weight, type AccionMenu } from '@/components/ui'
import { DatoFicha, DatosFicha, FichaCostado, Historial, type HechoHistorial } from '@/components/ui/FichaCostado'
import { ChipEstado, cuandoCorto } from '@/components/ui/PiezasLista'
import { leerStockDePrenda, type FilaStock, type MarcaErp, type StockDePrenda } from '@/lib/erp/cliente'
import { NOMBRE_DEPOSITO, NOMBRE_ORIGEN, NOMBRE_TIPO } from '@/lib/erp/stock.core.js'
import type { NombreIcono } from '@/components/ui/Icono'
import type { Tone } from '@/components/ui/tokens'

const nombreDe = (mapa: Record<string, string>, k: string) => mapa[k] ?? k
const conSigno = (n: number) => (n > 0 ? `+${n}` : String(n))
const LINEA: Record<string, string> = { bdi: 'BDI', zattia: 'Zattia', stunned: 'Stunned' }

/** El ícono y el tono de cada movimiento en el historial. */
const HECHO: Record<string, [NombreIcono, Tone]> = {
  apertura: ['historial', 'neutral'], venta: ['pesos', 'success'], anulacion: ['anular', 'danger'], correccion: ['lapiz', 'warning'],
  transferencia: ['transferencia', 'action'], ingreso: ['recepciones', 'brand'], ajuste_conteo: ['conteo', 'warning'], reapertura: ['historial', 'neutral'], ajuste: ['conteo', 'warning'],
}

/** La prenda que se abre: con la fila de la lista, o sólo con su id (cuando viene de Diferencias o Conciliación). */
export type PrendaAbierta = { producto: string; talle: string; fila: FilaStock | null }

export function FichaPrenda({ marca, prenda, onCerrar, ajustar }: {
  marca: MarcaErp
  prenda: PrendaAbierta
  onCerrar: () => void
  ajustar: (p: { linea: string; producto: string; talle: string; sku: string | null; barcode: string | null; nombre: string | null; talleNombre: string | null }) => void
}) {
  const [s, setS] = useState<StockDePrenda | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    leerStockDePrenda(marca, prenda.producto, prenda.talle)
      .then((x) => { if (vivo) { setS(x); setError(null) } })
      .catch((e) => vivo && setError(e instanceof Error ? e.message : 'No se pudo leer el stock del producto.'))
    return () => { vivo = false }
  }, [marca, prenda.producto, prenda.talle])

  const f = prenda.fila
  const nombre = f?.nombre ?? s?.prenda.nombre ?? 'Producto'
  const talle = f?.talleNombre ?? s?.prenda.talleNombre ?? ''
  const sku = f?.sku ?? s?.prenda.sku ?? null
  const barcode = f?.barcode ?? s?.prenda.barcode ?? null
  // El libro de la ficha es el de recién (la lista puede ser de hace un rato): manda para la estantería.
  const estanteria = s ? s.depositos.reduce((a, d) => a + d.libro, 0) : f?.estanteria ?? null
  const enPedidos = f?.enPedidos ?? 0
  const disponible = estanteria == null ? null : estanteria - enPedidos
  // Sin fila (abierta desde la búsqueda global) la línea sale del SKU: en Zattia ⛔ alcanza con la marca (Zattia o Stunned) y «Ajustar» quedaba apagado.
  const linea = f?.linea ?? (s ? lineaDe(marca, sku) : null)
  const local = s?.depositos.find((d) => d.deposito === 'local')?.libro ?? f?.deps.local ?? 0
  const negativo = (disponible ?? 0) < 0 || !!s?.depositos.some((d) => d.libro < 0)

  const hechos: HechoHistorial[] = (s?.historial ?? []).map((m) => {
    const [icono, tono] = HECHO[m.tipo] ?? ['historial', 'neutral']
    return {
      cuando: m.ocurrido_en, icono, tono,
      titulo: `${nombreDe(NOMBRE_TIPO, m.tipo)} · ${conSigno(m.cantidad)}`,
      // La referencia es la clave técnica del libro («uuid:producto:talle:depósito»): ⛔ se muestra.
      detalle: `${nombreDe(NOMBRE_DEPOSITO, m.deposito)} · quedan ${m.saldo} · ${nombreDe(NOMBRE_ORIGEN, m.origen)}`,
    }
  })

  const menu: AccionMenu[] = [
    { key: 'repo', label: 'Transferir en el monitor ↗', icono: 'abrir', onClick: () => window.open('/reposicion', '_blank', 'noopener'), hint: 'Las transferencias se arman y se reciben escaneando en Reposición.' },
    { key: 'etiq', label: 'Etiquetas en el monitor ↗', icono: 'abrir', onClick: () => window.open('/etiquetas', '_blank', 'noopener') },
  ]
  const h3: React.CSSProperties = { margin: 0, fontSize: font.lg, fontWeight: weight.bold }

  return (
    <FichaCostado abierta onCerrar={onCerrar} titulo={sku ? `Producto · ${sku}` : 'Producto'} etiqueta={`Ficha del producto ${nombre} ${talle}`}>
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: space[3], alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: weight.bold, overflowWrap: 'anywhere' }}>{nombre}</h2>
          <div style={{ color: color.mut }}>Variante {talle}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {negativo && <ChipEstado mapa={{ n: ['danger', 'Negativo'] }} k="n" />}
            {!negativo && local <= 0 && (estanteria ?? 0) > 0 && <ChipEstado mapa={{ l: ['warning', 'Sin stock en el Local'] }} k="l" />}
            {enPedidos > 0 && <ChipEstado mapa={{ p: ['action', `${enPedidos} reservado`] }} k="p" />}
          </div>
        </div>
        <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
          <div style={{ fontSize: font.sm, color: color.mut }}>Disponible</div>
          <div style={{ fontSize: 26, fontWeight: weight.bold, fontVariantNumeric: 'tabular-nums', color: negativo ? 'var(--mo-danger-ink)' : color.ink }}>{disponible ?? '…'}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center' }}>
        <Button variant="soft" tone="brand" disabled={!linea} onClick={() => linea && ajustar({ linea, producto: prenda.producto, talle: prenda.talle, sku, barcode, nombre, talleNombre: talle })}>Ajustar</Button>
        <MenuAcciones acciones={menu} etiqueta={`Más acciones del producto ${nombre} ${talle}`} vertical />
      </div>

      <DatosFicha>
        <DatoFicha titulo="Físico">{estanteria ?? '…'}</DatoFicha>
        <DatoFicha titulo="Reservado">{enPedidos ? `${enPedidos} sin pagar` : '—'}</DatoFicha>
        <DatoFicha titulo="código">{sku ?? '—'}</DatoFicha>
        <DatoFicha titulo="Código">{barcode ?? '—'}</DatoFicha>
        {linea && <DatoFicha titulo="Línea">{LINEA[linea] ?? linea}</DatoFicha>}
      </DatosFicha>

      <section style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
        <h3 style={h3}>Por depósito</h3>
        {!s ? <span style={{ color: color.mut }}>Leyendo…</span> : (
          <div role="table" aria-label="Stock por depósito" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 64px 64px 92px', columnGap: 10, fontVariantNumeric: 'tabular-nums' }}>
            {['Depósito', 'ERP', 'Gestión Nube', ''].map((t, i) => <span key={i} role="columnheader" style={{ fontSize: font.sm, color: color.mut, textAlign: i ? 'right' : 'left', paddingBottom: 6, borderBottom: `1px solid ${color.line}` }}>{t}</span>)}
            {s.depositos.map((d) => (
              <div key={d.deposito} role="row" style={{ display: 'contents' }}>
                <span role="cell" style={{ padding: '8px 0', borderBottom: `1px solid ${color.bg2}` }}>{nombreDe(NOMBRE_DEPOSITO, d.deposito)}</span>
                <span role="cell" style={{ padding: '8px 0', borderBottom: `1px solid ${color.bg2}`, textAlign: 'right', fontWeight: weight.semibold, color: d.libro < 0 ? 'var(--mo-danger-ink)' : color.ink }}>{d.libro}</span>
                <span role="cell" style={{ padding: '8px 0', borderBottom: `1px solid ${color.bg2}`, textAlign: 'right', color: color.mut }}>{d.gn ?? '—'}</span>
                <span role="cell" style={{ padding: '8px 0', borderBottom: `1px solid ${color.bg2}`, textAlign: 'right', fontSize: font.sm, color: d.diferencia ? 'var(--mo-warning-ink)' : color.mut2 }}>{d.diferencia == null ? '' : d.diferencia === 0 ? 'igual a Gestión Nube' : `Gestión Nube ${conSigno(d.diferencia)}`}</span>
              </div>
            ))}
          </div>
        )}
        {!!s?.sinDeposito.length && <Notice tone="warning">Gestión Nube tiene stock en depósitos que el ERP no conoce: {s.sinDeposito.join(', ')}.</Notice>}
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
        <div>
          <h3 style={h3}>Historial</h3>
          <div style={{ fontSize: font.sm, color: color.mut }}>cada movimiento, con lo que quedó · nada se borra: una corrección es otro movimiento</div>
        </div>
        {!s ? <span style={{ color: color.mut }}>Leyendo…</span> : !hechos.length ? <span style={{ color: color.mut }}>El ERP todavía no tiene movimientos de este producto.</span> : <Historial hechos={hechos} cuandoTexto={cuandoCorto} />}
      </section>
    </FichaCostado>
  )
}
