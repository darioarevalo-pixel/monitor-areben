'use client'

/**
 * ERP › Stock › Ingresos de mercadería › Actualizar Ingresos: lo que el ERP ya tiene está «Listo», lo que falta está «Pendiente»; se elige y se importa.
 *
 * 🔑 Bruno, 3-nov: a pedido, ⛔ automático. «OC confirmada, se trae»: lo habitual, para Admin y Administración. El botón excepcional, sólo Admin (lo exige el servidor): lo tocado en Ingresos desde el
 * corte, sin OC, que entra con stock 0. Lo de antes del corte se trae antes de cortar (`PRODUCTO_INGRESOS_PRUEBA`).
 */

import { useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { Button, EmptyState, Notice, color, font, space } from '@/components/ui'
import { BuscadorLista, VistasLista } from '@/components/ui/PiezasLista'
import { importarProductosDeIngresos, leerProductosDeIngresos, type ListaDeIngresos, type MarcaErp, type ModoDeIngresos, type ProductoDeIngresos } from '@/lib/erp/cliente'
import { useTiendaErp } from '@/lib/erp/linea-erp'
import { usePuedeErp } from '@/lib/erp/usePuedeErp'

const ESTADO: Record<string, string> = { visible: 'Publicado', hidden: 'Sin publicar' }
const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit' }) : '—')
const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString('es-AR')} ${n === 1 ? uno : varios}`

function Fila({ p, nota, elegido, onCambio }: { p: ProductoDeIngresos; nota: string; elegido: boolean; onCambio: (si: boolean) => void }) {
  return (
    <label style={{ display: 'flex', gap: space[3], alignItems: 'flex-start', padding: '10px 16px', borderTop: `1px solid ${color.bg2}`, cursor: 'pointer' }}>
      <input type="checkbox" checked={elegido} onChange={(e) => onCambio(e.target.checked)} aria-label={`elegir ${p.nombre ?? p.ingresos_id}`} style={{ marginTop: 3 }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <b style={{ color: color.ink }}>{p.nombre ?? `Producto ${p.ingresos_id}`}</b>
        <span style={{ display: 'block', color: color.mut, fontSize: font.sm }}>{nota} · {p.variantes.map((v) => `${v.talle} (${v.sku})`).join(', ')}</span>
        {p.ocs.length > 0 && <span style={{ display: 'block', color: color.ink2, fontSize: font.sm }}>Con mercadería sin sumar: {p.ocs.join(', ')}</span>}
      </span>
      <span style={{ color: color.mut, fontSize: font.sm, whiteSpace: 'nowrap' }}>{ESTADO[p.status ?? ''] ?? p.status ?? '—'} · {fecha(p.updated_at)}</span>
    </label>
  )
}

const VISTAS = [['pendiente', 'Pendiente'] as const, ['listo', 'Listo'] as const]
const DE_A = 200
const normal = (x: string | null) => String(x ?? '').toLowerCase()

export function ActualizarIngresos() {
  const { marca: delShell } = useSesion()
  const marca: MarcaErp = delShell === 'bdi' ? 'bdi' : 'zattia'
  const linea = useTiendaErp()
  const puede = usePuedeErp(marca)
  const [modo, setModo] = useState<ModoDeIngresos>('habitual')
  const [datos, setDatos] = useState<ListaDeIngresos | null>(null)
  const [elegidos, setElegidos] = useState<Set<number>>(new Set())
  const [leyendo, setLeyendo] = useState(false)
  const [importando, setImportando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)
  const [vista, setVista] = useState<'pendiente' | 'listo'>('pendiente')
  const [q, setQ] = useState('')

  async function actualizar(conModo: ModoDeIngresos = 'habitual') {
    setLeyendo(true); setError(null); setHecho(null); setModo(conModo)
    try {
      setDatos(await leerProductosDeIngresos(marca, conModo))
      setElegidos(new Set())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer Ingresos.')
    } finally {
      setLeyendo(false)
    }
  }

  async function importar() {
    setImportando(true); setError(null); setHecho(null)
    try {
      const r = await importarProductosDeIngresos(marca, [...elegidos], modo)
      if (!r.manda) throw new Error('Esta marca todavía no pasó al ERP: no se importó nada.')
      const salteados = r.no_disponibles?.length ?? 0
      const unidades = r.stock?.unidades ?? 0
      const stock = r.stock?.corrio && r.stock.libro === false ? ' Las unidades de su orden de compra pueden tardar hasta una hora.' : unidades > 0 ? ` Entraron ${plural(unidades, 'unidad', 'unidades')} al stock.` : ''
      setHecho(`Importado: ${plural(r.productos_nuevos ?? 0, 'producto nuevo', 'productos nuevos')} y ${plural(r.variantes_nuevas ?? 0, 'variante', 'variantes')}.${salteados ? ` ${plural(salteados, 'quedó afuera porque cambió', 'quedaron afuera porque cambiaron')} en Ingresos: actualizá la lista.` : ''}${stock}`)
      setDatos(await leerProductosDeIngresos(marca, modo))
      setElegidos(new Set())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo importar.')
    } finally {
      setImportando(false)
    }
  }

  if (!puede('importar-ingresos')) return null
  if (linea === 'stunned') return <Notice tone="neutral">Stunned no opera en Ingresos: sus productos se cargan a mano.</Notice>

  const lista = datos?.manda ? [...(datos.crear ?? []), ...(datos.agregar ?? [])] : []
  const cambiar = (id: number, si: boolean) => setElegidos((x) => { const n = new Set(x); if (si) n.add(id); else n.delete(id); return n })
  const todos = lista.length > 0 && lista.every((p) => elegidos.has(p.ingresos_id))
  const t = normal(q.trim())
  const coincide = (p: ProductoDeIngresos) => !t || normal(`${p.nombre} ${p.variantes.map((v) => v.sku).join(' ')}`).includes(t)
  const listos = datos?.manda ? datos.listos ?? [] : []
  const listosFiltrados = t ? listos.filter((p) => normal(p.nombre).includes(t)) : listos
  const listosVistos = listosFiltrados.slice(0, DE_A)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <div style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, color: color.mut, flex: '1 1 320px' }}>Los productos de Ingresos: lo que el ERP ya tiene está Listo, y lo que llegó en una orden de compra confirmada y falta queda Pendiente. Al importarlo, sus unidades entran al stock.</p>
        <Button variant="outline" onClick={() => actualizar('habitual')} disabled={leyendo || importando}>{leyendo && modo === 'habitual' ? 'Leyendo…' : 'Actualizar Ingresos'}</Button>
        {puede('configurar') && <Button variant="ghost" onClick={() => actualizar('excepcional')} disabled={leyendo || importando}>{leyendo && modo === 'excepcional' ? 'Leyendo…' : 'Traer sin orden de compra'}</Button>}
      </div>
      {error && <Notice tone="danger" onClose={() => setError(null)}>{error}</Notice>}
      {hecho && <Notice tone="success" onClose={() => setHecho(null)}>{hecho}</Notice>}
      {!datos && !error && !leyendo && <EmptyState title="Tocá «Actualizar Ingresos» para ver qué hay." />}
      {datos && !datos.manda && (
        <Notice tone="neutral">
          {datos.motivo === 'frenada'
            ? 'El envío al ERP de esta marca está frenado: no se puede importar.'
            : 'Todavía no corresponde: esta marca no pasó al ERP. Hasta el corte, los productos llegan desde Gestión Nube.'}
        </Notice>
      )}
      {datos?.manda && (
        <>
          {datos.prueba && <Notice tone="warning">Antes del corte: se ve todo lo que falta. Importá lo que se va a vender después del corte; su stock entra por sus órdenes de compra.</Notice>}
          {!datos.prueba && modo === 'excepcional' && <Notice tone="neutral">Productos tocados en Ingresos desde el corte, sin orden de compra: entran con stock 0.</Notice>}
          {datos.oc_error && <Notice tone="warning">{datos.oc_error}</Notice>}
          {(datos.oc_sin_producto?.length ?? 0) > 0 && (
            <Notice tone="warning">Hay mercadería que no se puede importar porque Ingresos ya no tiene el producto: {datos.oc_sin_producto!.map((x) => `${x.sku}${x.oc ? ` (${x.oc})` : ''}`).join(', ')}.</Notice>
          )}
          {(datos.a_vincular?.length ?? 0) > 0 && (
            <Notice tone="warning">No se pueden importar porque ya hay algo parecido en el ERP, hay que resolverlos en Vincular: {datos.a_vincular!.map((x) => x.nombre ?? `Producto ${x.ingresos_id}`).join(', ')}.</Notice>
          )}
          <div style={{ background: color.surface, border: `1px solid ${color.line}`, borderRadius: 14, overflow: 'hidden' }}>
            <VistasLista vistas={VISTAS} valor={vista} conteo={{ pendiente: lista.length, listo: listos.length }} onCambio={(v) => setVista(v as 'pendiente' | 'listo')} />
            <div style={{ display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap', padding: '10px 16px' }}>
              {vista === 'pendiente' && lista.length > 0 && (
                <label style={{ display: 'flex', gap: space[2], alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={todos} aria-label="elegir todos" onChange={(e) => setElegidos(new Set(e.target.checked ? lista.map((p) => p.ingresos_id) : []))} />
                  Todos
                </label>
              )}
              <div style={{ flex: 1 }}><BuscadorLista valor={q} onCambio={setQ} etiqueta="Buscar en lo leído" placeholder="Producto o código" /></div>
              {vista === 'pendiente' && <Button onClick={importar} disabled={importando || !elegidos.size}>{importando ? 'Importando…' : `Importar ${elegidos.size || ''}`.trim()}</Button>}
            </div>
            {vista === 'pendiente' && (lista.length === 0
              ? <div style={{ padding: space[6] }}><EmptyState title="No hay nada pendiente." /></div>
              : (
                <>
                  {(datos.crear ?? []).filter(coincide).map((p) => <Fila key={p.ingresos_id} p={p} nota="Producto nuevo" elegido={elegidos.has(p.ingresos_id)} onCambio={(si) => cambiar(p.ingresos_id, si)} />)}
                  {(datos.agregar ?? []).filter(coincide).map((p) => <Fila key={p.ingresos_id} p={p} nota="Suma variantes a uno que ya está" elegido={elegidos.has(p.ingresos_id)} onCambio={(si) => cambiar(p.ingresos_id, si)} />)}
                </>
              ))}
            {vista === 'listo' && listosVistos.map((p) => (
              <div key={p.ingresos_id} style={{ display: 'flex', gap: space[3], padding: '10px 16px', borderTop: `1px solid ${color.bg2}` }}>
                <b style={{ color: color.ink, flex: 1 }}>{p.nombre ?? `Producto ${p.ingresos_id}`}</b>
                <span style={{ color: color.mut, fontSize: font.sm, whiteSpace: 'nowrap' }}>{ESTADO[p.status ?? ''] ?? p.status ?? '—'} · Listo</span>
              </div>
            ))}
            {vista === 'listo' && listosFiltrados.length > DE_A && <div style={{ padding: '8px 16px', fontSize: font.sm, color: color.mut, borderTop: `1px solid ${color.bg2}` }}>Se ven {DE_A} de {listosFiltrados.length.toLocaleString('es-AR')}: buscá para encontrar uno.</div>}
          </div>
        </>
      )}
    </div>
  )
}
