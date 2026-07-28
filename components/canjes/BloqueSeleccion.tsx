'use client'

/**
 * Los productos que se le mandan.
 *
 * **Los carga el operador, no ella.** No hay pantalla en el portal para elegir productos porque
 * qué se le puede ofrecer depende de si ya está lanzado en la tienda, y eso no se puede modelar:
 * ella los pasa por mensaje y acá se cargan.
 *
 * El control del tope se muestra acá pero **lo hace el servidor** con la lista real. Si dos
 * operadores cargan a la vez, el que se pase recibe el error del handler — el de esta pantalla es
 * para que no llegue hasta ahí.
 */

import { useState } from 'react'
import { BuscarArticuloGN, type ArticuloGN } from '@/components/ui/BuscarArticuloGN'
import {
  Badge, Button, EmptyState, Notice, SectionCard, TableWrap, THead, TBody, Tr, Th, Td,
  color, font, space, weight, useConfirmar, useToast,
} from '@/components/ui'
import { agregarItem, quitarItem } from '@/lib/canjes/cliente'
import {
  MOTIVOS_QUITAR_ITEM, baseDeCostos, controlDelTope, itemsVivos,
  type CanjeItem, type CanjeRow,
} from '@/lib/canjes/tipos'

export function BloqueSeleccion({
  canje, items, onCambio, editable,
}: {
  canje: CanjeRow
  items: CanjeItem[]
  onCambio: () => void
  editable: boolean
}) {
  const toast = useToast()
  const { pedirTexto } = useConfirmar()
  const [guardando, setGuardando] = useState(false)

  const control = controlDelTope(canje, items)
  const vivos = itemsVivos(items)
  const quitados = items.filter((i) => i.estado === 'quitado' || i.estado === 'sin_stock')
  // Stunned lee los costos de Zattia: es una línea de esa tienda, no una tienda propia.
  const marcaGN = baseDeCostos(canje.store)

  async function sumar(a: ArticuloGN) {
    setGuardando(true)
    try {
      await agregarItem(canje.store, canje.id, {
        sku: a.sku,
        product_id: String(a.product_id),
        size_id: String(a.size_id),
        nombre: a.product_name,
        variante: a.size_name,
        cantidad: 1,
        // Congelados al cargarlos: el balance necesita el costo de HOY, no el de dentro de un año.
        costo_unit: a.unit_cost,
        pvp_unit: a.retailer_price,
      })
      onCambio()
    } catch (e) {
      // El servidor devuelve el motivo en criollo cuando se pasa del tope: se muestra tal cual.
      toast.error(String((e as Error)?.message || e))
    } finally {
      setGuardando(false)
    }
  }

  async function quitar(item: CanjeItem) {
    const motivo = await pedirTexto(
      'Queda registrado por qué se cayó: al mes siguiente es lo que explica por qué el canje salió distinto de lo acordado.',
      '',
      {
        titulo: `Quitar ${item.nombre || item.sku || 'este producto'}`,
        placeholder: MOTIVOS_QUITAR_ITEM.join(' · '),
        ok: 'Quitar',
      },
    )
    if (!motivo) return
    try {
      await quitarItem(canje.store, canje.id, item.id, motivo, /Sin stock/i.test(motivo))
      onCambio()
    } catch (e) {
      toast.error(String((e as Error)?.message || e))
    }
  }

  return (
    <SectionCard
      title="Qué se le manda"
      subtitle="Los pasa por mensaje y los cargás vos: qué se le puede ofrecer depende de si ya está lanzado en la tienda."
    >
      {/* Lo acordado, al lado de lo que se está cargando. En modo unidades el control del detalle
          es a ojo del operador: la categoría de GN no es lo bastante prolija para bloquear por
          ella, y una validación que se equivoca la mitad de las veces se termina apagando. */}
      {canje.tope_tipo === 'unidades' && (canje.tope_unidades || []).length > 0 && (
        <div style={{ marginBottom: space[3], display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ color: color.mut, fontSize: font.sm }}>Se acordó:</span>
          {(canje.tope_unidades || []).map((u, i) => (
            <Badge key={i} tone="neutral" subtle>{u.cantidad} {u.descripcion}</Badge>
          ))}
        </div>
      )}

      <div style={{ marginBottom: space[3] }}>
        <Notice tone={control.ok ? 'neutral' : 'danger'}>{control.mensaje}</Notice>
      </div>

      {editable && (
        <div style={{ marginBottom: space[3], opacity: guardando ? 0.6 : 1 }}>
          <BuscarArticuloGN marca={marcaGN} onSelect={(a) => void sumar(a)} />
        </div>
      )}

      {!vivos.length ? (
        <EmptyState dashed title="Todavía no hay productos cargados" hint="Buscalos arriba por SKU o por nombre." />
      ) : (
        <TableWrap>
          <THead>
            <Tr>
              <Th>Producto</Th>
              <Th>SKU</Th>
              <Th align="right">Cantidad</Th>
              <Th align="right">PVP</Th>
              <Th align="right">Costo</Th>
              {editable && <Th />}
            </Tr>
          </THead>
          <TBody>
            {vivos.map((i) => (
              <Tr key={i.id}>
                <Td strong>
                  {i.nombre || '—'}
                  {i.variante ? <span style={{ color: color.mut }}> ({i.variante})</span> : null}
                </Td>
                <Td mono>{i.sku || '—'}</Td>
                <Td align="right">{i.cantidad}</Td>
                <Td align="right">{i.pvp_unit != null ? `$${Number(i.pvp_unit).toLocaleString('es-AR')}` : '—'}</Td>
                <Td align="right">{i.costo_unit != null ? `$${Number(i.costo_unit).toLocaleString('es-AR')}` : '—'}</Td>
                {editable && (
                  <Td>
                    <Button variant="ghost" tone="danger" size="sm" onClick={() => void quitar(i)}>Quitar</Button>
                  </Td>
                )}
              </Tr>
            ))}
          </TBody>
        </TableWrap>
      )}

      {/* Los quitados NO se borran: que algo se haya caído por falta de stock es información. */}
      {quitados.length > 0 && (
        <div style={{ marginTop: space[3] }}>
          <div style={{ color: color.mut, fontSize: font.sm, fontWeight: weight.medium, marginBottom: 4 }}>
            Se cayeron del pedido
          </div>
          {quitados.map((i) => (
            <div key={i.id} style={{ color: color.mut2, fontSize: font.sm }}>
              {i.nombre || i.sku} — {i.estado === 'sin_stock' ? 'sin stock' : 'quitado'}
              {i.motivo ? `: ${i.motivo}` : ''}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}
