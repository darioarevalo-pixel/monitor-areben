'use client'

/**
 * Revisión — la segunda mirada sobre los precios ya decididos.
 *
 * # Por qué es una tabla y no el modal
 *
 * Definir un precio es decidir de a uno: hace falta la matriz de márgenes, el breakeven, el piso, y
 * por eso `DefinirPrecio` es un diálogo que se pasa con las flechas. **Revisar es lo contrario**:
 * es barrer cuarenta filas buscando las tres que están mal. Con un diálogo por producto, la revisión
 * cuesta cuarenta aperturas y no se hace — y una revisión que no se hace es peor que ninguna,
 * porque la campaña igual queda marcada como revisada.
 *
 * # Las decisiones de esta pantalla
 *
 *  1. **El revisor puede cambiar el precio acá mismo** (decisión de Bruno). El ida y vuelta por un
 *     precio que está corrido diez pesos no paga. Cuando lo cambia se guarda `precioAnterior`, así
 *     que quien lo había puesto ve exactamente qué le movieron y contra qué.
 *  2. **Objetar pide un motivo, y es obligatorio.** Sin motivo, el producto le vuelve al otro sin
 *     que sepa qué mirar; el silencio de una devolución sin razón se parece demasiado al silencio
 *     de "todavía no lo vi".
 *  3. **Confirmar y objetar sólo los ve un admin.** El resto entra igual a la pestaña —tiene que
 *     poder ver qué está objetado y qué falta— pero en modo lectura.
 *  4. **El margen que se muestra es el bruto**, el mismo que guarda `decidirItem`. El neto por forma
 *     de pago × canal son doce números y vive en el modal: acá se revisa el precio, no se simula.
 */

import { useMemo, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import {
  confirmarItem, objetarItem, precioDeSale, revisionDe,
  type LiquidacionItem,
} from '@/lib/liquidacion'
import {
  Button, Card, Field, Input, Modal, Notice, StatusPill,
  TBody, THead, TableWrap, Td, Th, Tr, formatMoney,
  color, font, radius, space, weight,
} from '@/components/ui'

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fechaCorta = (iso: string) => {
  const [a, m, d] = iso.split('-')
  return `${Number(d)}-${MESES[Number(m) - 1] ?? '?'}-${a.slice(2)}`
}

type Filtro = 'sin-revisar' | 'objetados' | 'confirmados' | 'todos'

export function Revision({
  items, puedeRevisar, ingresoDe, onRevisar, onConfirmarTodos,
}: {
  /** Todos los ítems de la campaña. El filtro de acá adentro decide cuáles se ven. */
  items: LiquidacionItem[]
  /** Admin. Sin esto la tabla se ve igual pero sin acciones. */
  puedeRevisar: boolean
  /** Fecha de alta del producto, del ETL. `null` si el ETL todavía no cargó. */
  ingresoDe: (pid: string) => string | null
  onRevisar: (item: LiquidacionItem) => Promise<void>
  /** El atajo: confirmar de una todos los que no pasaron por revisión. Opcional. */
  onConfirmarTodos?: (sinRevisar: LiquidacionItem[]) => Promise<void>
}) {
  const { perfil } = useSesion()
  const yo = perfil?.name || null
  const [filtro, setFiltro] = useState<Filtro>('sin-revisar')
  const [objetando, setObjetando] = useState<LiquidacionItem | null>(null)
  const [trabajando, setTrabajando] = useState<string | null>(null)
  /** El precio que el revisor está tipeando, por pid. Vacío = no lo tocó. */
  const [edicion, setEdicion] = useState<Record<string, string>>({})

  const conPrecio = useMemo(
    () => items.filter((i) => i.estado === 'definido' || i.estado === 'confirmado'),
    [items],
  )
  /** Los que nunca pasaron por revisión: ni confirmados ni devueltos con motivo. */
  const sinRevisar = useMemo(
    () => conPrecio.filter((i) => i.estado === 'definido' && !revisionDe(i).objecion),
    [conPrecio],
  )
  const cuentas = useMemo(() => ({
    sinRevisar: sinRevisar.length,
    objetados: conPrecio.filter((i) => i.estado === 'definido' && !!revisionDe(i).objecion).length,
    confirmados: conPrecio.filter((i) => i.estado === 'confirmado').length,
  }), [conPrecio, sinRevisar])

  const visibles = useMemo(() => conPrecio.filter((i) => {
    const obj = !!revisionDe(i).objecion
    if (filtro === 'sin-revisar') return i.estado === 'definido' && !obj
    if (filtro === 'objetados') return i.estado === 'definido' && obj
    if (filtro === 'confirmados') return i.estado === 'confirmado'
    return true
  }), [conPrecio, filtro])

  async function correr(pid: string, fn: () => Promise<void>) {
    setTrabajando(pid)
    try {
      await fn()
      setEdicion((e) => {
        const { [pid]: _, ...resto } = e
        return resto
      })
    } finally {
      setTrabajando(null)
    }
  }

  if (!conPrecio.length) {
    return (
      <Card>
        <div style={{ padding: space[4], color: color.mut, fontSize: font.sm }}>
          Todavía no hay ningún precio decidido. Cuando le pongas precio a un producto en la pestaña
          Productos, aparece acá para que lo mire otra persona.
        </div>
      </Card>
    )
  }

  return (
    <>
      <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center', marginBottom: space[3] }}>
        {([
          ['sin-revisar', `Sin revisar (${cuentas.sinRevisar})`],
          ['objetados', `Devueltos (${cuentas.objetados})`],
          ['confirmados', `Confirmados (${cuentas.confirmados})`],
          ['todos', `Todos (${conPrecio.length})`],
        ] as [Filtro, string][]).map(([k, label]) => (
          <Button key={k} size="sm" variant={filtro === k ? 'soft' : 'outline'} tone={filtro === k ? 'brand' : 'neutral'} onClick={() => setFiltro(k)}>
            {label}
          </Button>
        ))}
        {!puedeRevisar && (
          <span style={{ fontSize: font.xs, color: color.mut2, marginLeft: space[2] }}>
            Confirmar u objetar lo hace un admin. Vos podés mirar.
          </span>
        )}
        {/*
          🔑 **El atajo existe porque igual se toma.** El 13-ago-2026 hubo que confirmar 260 precios
          para poder aplicarlos y se hizo con un script contra la base — o sea, por afuera, sin que
          quedara registro de que fue masivo y sin que nadie viera qué se estaba salteando. Puesto
          acá, al menos dice en la cara cuántos avisos altos se están dejando pasar.

          ⚠️ Va a la derecha y en `outline`, no al lado de los filtros: el camino de a uno tiene que
          seguir siendo el que se ve primero.
        */}
        {puedeRevisar && cuentas.sinRevisar > 0 && onConfirmarTodos && (
          <Button
            size="sm"
            variant="outline"
            style={{ marginLeft: 'auto' }}
            onClick={() => void onConfirmarTodos(sinRevisar)}
          >
            Confirmar los {cuentas.sinRevisar} sin revisar
          </Button>
        )}
      </div>

      {filtro === 'sin-revisar' && cuentas.sinRevisar === 0 && (
        <Notice tone="success" style={{ marginBottom: space[3] }}>
          No queda ningún precio sin revisar.
        </Notice>
      )}

      <TableWrap>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <THead>
            <Tr>
              <Th>Producto</Th>
              <Th align="right">Costo</Th>
              <Th align="right">Lista</Th>
              <Th align="right">Precio de sale</Th>
              <Th align="right">Desc.</Th>
              <Th align="right">Markup</Th>
              <Th align="right">Margen</Th>
              <Th align="right">Stock</Th>
              <Th align="right">90 d</Th>
              <Th align="right">Ingresó</Th>
              <Th>Estado</Th>
              {puedeRevisar && <Th> </Th>}
            </Tr>
          </THead>
          <TBody>
            {visibles.map((i) => (
              <Fila
                key={i.pid}
                item={i}
                puedeRevisar={puedeRevisar}
                ingreso={ingresoDe(i.pid)}
                valor={edicion[i.pid] ?? ''}
                ocupado={trabajando === i.pid}
                onEscribir={(v) => setEdicion((e) => ({ ...e, [i.pid]: v }))}
                onConfirmar={() => {
                  const txt = (edicion[i.pid] ?? '').trim()
                  const n = txt === '' ? null : Number(txt)
                  const precio = n != null && Number.isFinite(n) && n > 0 ? { precioSale: n } : undefined
                  return correr(i.pid, () => onRevisar(confirmarItem(i, yo, precio)))
                }}
                onObjetar={() => setObjetando(i)}
              />
            ))}
            {!visibles.length && (
              <Tr>
                <Td colSpan={puedeRevisar ? 12 : 11}>
                  <span style={{ color: color.mut, fontSize: font.sm }}>Nada en este filtro.</span>
                </Td>
              </Tr>
            )}
          </TBody>
        </table>
      </TableWrap>

      {objetando && (
        <Objetar
          item={objetando}
          onCancelar={() => setObjetando(null)}
          onConfirmar={async (motivo) => {
            const it = objetando
            setObjetando(null)
            await correr(it.pid, () => onRevisar(objetarItem(it, yo, motivo)))
          }}
        />
      )}
    </>
  )
}

function Fila({
  item, puedeRevisar, ingreso, valor, ocupado, onEscribir, onConfirmar, onObjetar,
}: {
  item: LiquidacionItem
  puedeRevisar: boolean
  ingreso: string | null
  valor: string
  ocupado: boolean
  onEscribir: (v: string) => void
  onConfirmar: () => void
  onObjetar: () => void
}) {
  const { foto: f, decision: d } = item
  const rev = revisionDe(item)
  const confirmado = item.estado === 'confirmado'

  // Lo que el revisor está proponiendo mientras tipea. Se calcula con la MISMA función que guarda
  // (`precioDeSale`), o el número que ve antes de confirmar y el que queda guardado podrían diferir.
  const tipeado = valor.trim() === '' ? null : Number(valor)
  const propuesto = tipeado != null && Number.isFinite(tipeado) && tipeado > 0
    ? precioDeSale(f.precioNormal, { precioSale: tipeado })
    : null
  const cambia = propuesto != null && propuesto !== d.precioSale

  return (
    <Tr>
      <Td>
        <div style={{ fontWeight: weight.semibold }}>{f.nombre}</div>
        <div style={{ fontSize: font.xs, color: color.mut2 }}>
          {f.sku || 'sin SKU'}
          {d.porQuien && <> · lo puso {d.porQuien}</>}
        </div>
        {rev.objecion && (
          <div style={{ fontSize: font.xs, color: color.dangerInk, marginTop: 2 }}>
            Devuelto{rev.porQuien ? ` por ${rev.porQuien}` : ''}: {rev.objecion}
          </div>
        )}
        {rev.precioAnterior != null && (
          <div style={{ fontSize: font.xs, color: color.warningInk, marginTop: 2 }}>
            {rev.porQuien || 'El revisor'} lo cambió: estaba en {formatMoney(rev.precioAnterior)}
          </div>
        )}
        {d.nota && (
          <div style={{ fontSize: font.xs, color: color.mut2, marginTop: 2 }}>“{d.nota}”</div>
        )}
      </Td>
      <Td align="right">{f.sinCosto ? <span style={{ color: color.dangerInk }}>sin costo</span> : formatMoney(f.costo)}</Td>
      <Td align="right">{formatMoney(f.precioNormal)}</Td>
      <Td align="right">
        {puedeRevisar && !confirmado ? (
          <Input
            type="number"
            value={valor}
            onChange={(e) => onEscribir(e.target.value)}
            placeholder={d.precioSale != null ? String(d.precioSale) : '$'}
            style={{ width: 110, textAlign: 'right' }}
            aria-label={`Precio de sale de ${f.nombre}`}
          />
        ) : (
          <span style={{ fontWeight: weight.semibold }}>{d.precioSale != null ? formatMoney(d.precioSale) : '—'}</span>
        )}
        {cambia && (
          <div style={{ fontSize: font.xs, color: color.warningInk, marginTop: 2 }}>
            queda en {formatMoney(propuesto)}
          </div>
        )}
      </Td>
      <Td align="right">{d.pctDesc != null ? `${Math.round(d.pctDesc)}%` : '—'}</Td>
      <Td align="right">{d.markup != null ? `${Math.round(d.markup)}%` : '—'}</Td>
      <Td align="right">{d.margen != null ? `${Math.round(d.margen)}%` : '—'}</Td>
      <Td align="right">{f.stock}</Td>
      <Td align="right">{f.ventas90}</Td>
      <Td align="right">{ingreso ? fechaCorta(ingreso) : '—'}</Td>
      <Td>
        <StatusPill
          tone={confirmado ? 'success' : rev.objecion ? 'danger' : 'brand'}
          label={confirmado ? 'Confirmado' : rev.objecion ? 'Devuelto' : 'Sin revisar'}
        />
        {confirmado && rev.porQuien && (
          <div style={{ fontSize: font.xs, color: color.mut2, marginTop: 2 }}>por {rev.porQuien}</div>
        )}
      </Td>
      {puedeRevisar && (
        <Td>
          <div style={{ display: 'flex', gap: space[1], justifyContent: 'flex-end' }}>
            {confirmado ? (
              <Button size="sm" variant="ghost" tone="danger" onClick={onObjetar} loading={ocupado}>Devolver</Button>
            ) : (
              <>
                <Button size="sm" variant="ghost" onClick={onObjetar} disabled={ocupado}>Devolver</Button>
                <Button size="sm" variant="solid" tone="brand" onClick={onConfirmar} loading={ocupado}>
                  {cambia ? 'Cambiar y confirmar' : 'Confirmar'}
                </Button>
              </>
            )}
          </div>
        </Td>
      )}
    </Tr>
  )
}

/** El motivo es obligatorio: una devolución sin razón se lee igual que "no lo miré". */
function Objetar({
  item, onCancelar, onConfirmar,
}: {
  item: LiquidacionItem
  onCancelar: () => void
  onConfirmar: (motivo: string) => Promise<void>
}) {
  const [motivo, setMotivo] = useState('')
  const [mandando, setMandando] = useState(false)
  const listo = motivo.trim().length > 0

  return (
    <Modal
      abierto
      onCerrar={onCancelar}
      titulo={`Devolver ${item.foto.nombre}`}
      cerrarConFondo={false}
      pie={
        <>
          <Button variant="ghost" onClick={onCancelar}>Cancelar</Button>
          <Button
            variant="solid"
            tone="danger"
            disabled={!listo}
            loading={mandando}
            onClick={async () => {
              setMandando(true)
              try {
                await onConfirmar(motivo)
              } finally {
                setMandando(false)
              }
            }}
          >
            Devolver
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <div style={{ fontSize: font.sm, color: color.mut }}>
          El precio queda como está y el producto le vuelve a{' '}
          {item.decision.porQuien ? <b>{item.decision.porQuien}</b> : 'quien lo puso'} con tu motivo a la
          vista. Cuando le guarde un precio nuevo, vuelve acá para que lo mires.
        </div>
        <div style={{ background: color.bg2, border: `1px solid ${color.line}`, borderRadius: radius.md, padding: space[3], fontSize: font.sm }}>
          Está en <b>{item.decision.precioSale != null ? formatMoney(item.decision.precioSale) : '—'}</b>
          {' '}sobre {formatMoney(item.foto.precioNormal)} de lista
          {item.decision.pctDesc != null && <> ({Math.round(item.decision.pctDesc)}% off)</>}
          {!item.foto.sinCosto && <> · costo {formatMoney(item.foto.costo)}</>}
        </div>
        <Field label="Por qué lo devolvés" required>
          <Input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Queda abajo del costo con la comisión de Tienda Nube"
            data-foco
          />
        </Field>
      </div>
    </Modal>
  )
}
