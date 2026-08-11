'use client'

/**
 * El mostrador de los canjes: **las creadoras que pasan por el local a buscar lo suyo.**
 *
 * Marketing autoriza una cantidad ("3 fundas") sin decir cuáles; ella elige acá, enfrente, y el
 * local carga lo que se lleva y lo entrega. Al tocar Entregado se crea la venta a $0 en Gestión
 * Nube —descuenta el stock del local— y el canje pasa a `en_curso` con los plazos corriendo.
 *
 * Vive dentro de la sección Cupones y no en Canjes (que es de Marketing) porque quien lo usa es la
 * chica del mostrador: `puedeAtenderRetiroLocal` le abre exactamente esto. Por eso también la lista
 * la filtra el SERVIDOR (`?vista=local`) y llega sin plata, sin balance y sin las otras marcas: acá
 * no hay nada que ocultar en la UI, porque no viajó.
 *
 * 🔴 **Entregar es irreversible.** La venta de GN no se puede anular por API: si algo sale mal hay
 * que entrar a GN a mano. Por eso el botón confirma diciendo cuántas unidades salen del stock, y
 * por eso se bloquea mientras guarda.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BuscarArticuloGN, type ArticuloGN } from '@/components/ui/BuscarArticuloGN'
import {
  Badge, Button, Card, EmptyState, Notice, SectionCard, TBody, THead, TableWrap, Td, Th, Tr,
  color, font, space, weight, useConfirmar, useToast,
} from '@/components/ui'
import { agregarItem, entregarEnLocal, leerCanjesDelLocal, quitarItem, type CanjeEnElLocal } from '@/lib/canjes/cliente'
import { itemsVivos, listoParaEntregar } from '@/lib/canjes/tipos'
import { credencialConPrompt } from '@/lib/sesion'

export function CanjesLocal() {
  const toast = useToast()
  const { confirmar } = useConfirmar()

  const [canjes, setCanjes] = useState<CanjeEnElLocal[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** El id del canje que está guardando algo. Bloquea SUS botones, no los de los demás. */
  const [ocupado, setOcupado] = useState<number | null>(null)

  const recargar = useCallback(async () => {
    try {
      setCanjes(await leerCanjesDelLocal())
      setError(null)
    } catch (e) {
      setError(String((e as Error)?.message || e))
    } finally {
      setCargando(false)
    }
  }, [])

  // La carga inicial va con su propio efecto y el guard de `vivo`, igual que `FichaCanje`: llamar a
  // `recargar` desde acá deja el `setState` colgando de un efecto sincrónico y el lint lo frena.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const datos = await leerCanjesDelLocal()
        if (vivo) { setCanjes(datos); setError(null) }
      } catch (e) {
        if (vivo) setError(String((e as Error)?.message || e))
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => { vivo = false }
  }, [])

  if (cargando) return <Card>Buscando los canjes para entregar…</Card>
  if (error) return <Notice tone="danger">{error}</Notice>
  if (!canjes.length) {
    return (
      <EmptyState
        icon="🤝"
        title="No hay nada para entregar"
        hint="Acá aparecen las creadoras que pasan por el local a buscar lo suyo. Los arma Marketing desde Canjes."
        dashed
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <Notice tone="neutral">
        Cuando pase a buscarlo: cargá <b>lo que se lleva</b> con el buscador y tocá <b>Entregado</b>.
        Eso descuenta el stock del local y deja la venta hecha en Gestión Nube — no hay que cargar
        nada más.
      </Notice>
      {canjes.map((c) => (
        <FilaCanje
          key={c.id}
          canje={c}
          ocupado={ocupado === c.id}
          onOcupado={setOcupado}
          onCambio={recargar}
          toast={toast}
          confirmar={confirmar}
        />
      ))}
    </div>
  )
}

function FilaCanje({
  canje, ocupado, onOcupado, onCambio, toast, confirmar,
}: {
  canje: CanjeEnElLocal
  ocupado: boolean
  onOcupado: (id: number | null) => void
  onCambio: () => Promise<void>
  toast: ReturnType<typeof useToast>
  confirmar: ReturnType<typeof useConfirmar>['confirmar']
}) {
  const vivos = useMemo(() => itemsVivos(canje.items), [canje.items])
  const llevados = vivos.reduce((a, i) => a + (Number(i.cantidad) || 0), 0)
  const autorizadas = (canje.tope_unidades || []).reduce((a, u) => a + (Number(u.cantidad) || 0), 0)
  const listo = listoParaEntregar({ ...canje, retiro_local: true, entregado_at: null, tope_pvp: null }, canje.items)

  const quien = [canje.persona?.nombre, canje.persona?.apellido].filter(Boolean).join(' ').trim()

  async function sumar(a: ArticuloGN) {
    onOcupado(canje.id)
    try {
      await agregarItem(canje.store, canje.id, {
        sku: a.sku,
        product_id: String(a.product_id),
        size_id: String(a.size_id),
        nombre: a.product_name,
        variante: a.size_name,
        cantidad: 1,
        // Congelados al cargarlos, igual que del lado de Marketing: el balance necesita el costo y
        // el precio de HOY, no el de dentro de un año.
        costo_unit: a.unit_cost,
        pvp_unit: a.retailer_price,
      })
      await onCambio()
    } catch (e) {
      // El servidor devuelve el motivo en criollo cuando se pasa del acuerdo: se muestra tal cual.
      toast.error(String((e as Error)?.message || e))
    } finally {
      onOcupado(null)
    }
  }

  async function sacar(itemId: number, nombre: string) {
    onOcupado(canje.id)
    try {
      await quitarItem(canje.store, canje.id, itemId, `lo sacó el local: ${nombre}`)
      await onCambio()
    } catch (e) {
      toast.error(String((e as Error)?.message || e))
    } finally {
      onOcupado(null)
    }
  }

  async function entregar() {
    const ok = await confirmar({
      titulo: `Entregarle a ${quien || 'esta persona'}`,
      mensaje:
        `Salen ${llevados} ${llevados === 1 ? 'unidad' : 'unidades'} del stock del local y queda la ` +
        `venta hecha en Gestión Nube a $0. Esto no se puede deshacer desde el monitor.`,
      ok: 'Entregado',
    })
    if (!ok) return

    // Se pide recién acá: si cancela la confirmación, no tiene sentido haberle pedido la contraseña.
    const cred = await credencialConPrompt('del Monitor')
    if (!cred) return void toast.error('Sin tu contraseña no se puede crear la venta en Gestión Nube.')

    onOcupado(canje.id)
    try {
      const { gn_venta_number } = await entregarEnLocal(canje, vivos, canje.persona || {}, cred)
      toast.ok(`Entregado${gn_venta_number ? ` — venta ${gn_venta_number} en Gestión Nube` : ''}.`)
      await onCambio()
    } catch (e) {
      toast.error(String((e as Error)?.message || e))
    } finally {
      onOcupado(null)
    }
  }

  return (
    // `title` es un string (SectionCard hereda los atributos del div), así que el @ y el número van
    // en el subtítulo. El nombre y apellido es lo que se lee primero, que es lo que la chica del
    // mostrador compara contra lo que le dice la persona.
    <SectionCard
      title={quien || 'Sin nombre cargado'}
      subtitle={
        <span style={{ display: 'inline-flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
          {canje.persona?.instagram && <span>@{canje.persona.instagram}</span>}
          <Badge tone="neutral">{canje.numero}</Badge>
        </span>
      }
    >
      <div style={{ display: 'flex', gap: space[5], flexWrap: 'wrap', marginBottom: space[3] }}>
        <div>
          <div style={{ color: color.mut, fontSize: font.sm }}>Tiene autorizadas</div>
          <div style={{ fontWeight: weight.semibold }}>
            {autorizadas ? `${autorizadas} ${canje.unidad}` : <span style={{ color: color.mut2 }}>—</span>}
          </div>
        </div>
        <div>
          <div style={{ color: color.mut, fontSize: font.sm }}>Se lleva</div>
          <div style={{ fontWeight: weight.semibold }}>{llevados}</div>
        </div>
        {canje.titulo && (
          <div>
            <div style={{ color: color.mut, fontSize: font.sm }}>De qué es</div>
            <div>{canje.titulo}</div>
          </div>
        )}
        {canje.persona?.telefono && (
          <div>
            <div style={{ color: color.mut, fontSize: font.sm }}>Teléfono</div>
            <div>{canje.persona.telefono}</div>
          </div>
        )}
      </div>

      {vivos.length > 0 && (
        <TableWrap>
          <THead>
            <Tr><Th>Qué se lleva</Th><Th>Variante</Th><Th>SKU</Th><Th /></Tr>
          </THead>
          <TBody>
            {vivos.map((i) => (
              <Tr key={i.id}>
                <Td strong>{i.cantidad > 1 ? `${i.cantidad}× ` : ''}{i.nombre || '—'}</Td>
                <Td style={{ color: color.mut }}>{i.variante || '—'}</Td>
                <Td style={{ color: color.mut2, fontSize: font.xs }}>{i.sku || '—'}</Td>
                <Td align="right">
                  <Button
                    variant="ghost"
                    tone="danger"
                    size="sm"
                    disabled={ocupado}
                    onClick={() => void sacar(i.id, i.nombre || i.sku || 'ese producto')}
                  >
                    Sacar
                  </Button>
                </Td>
              </Tr>
            ))}
          </TBody>
        </TableWrap>
      )}

      <div style={{ marginTop: space[3] }}>
        <BuscarArticuloGN marca="bdi" onSelect={(a) => void sumar(a)} mostrarCosto={false} />
      </div>

      <div style={{ marginTop: space[4], display: 'flex', gap: space[3], alignItems: 'center', flexWrap: 'wrap' }}>
        <Button variant="solid" tone="brand" disabled={ocupado || !listo.ok} onClick={() => void entregar()}>
          {ocupado ? 'Guardando…' : 'Entregado'}
        </Button>
        {/* El motivo, siempre a la vista: el que lee esto está con la persona enfrente y "no se
            puede" sin decir por qué lo deja llamando por teléfono. */}
        {!listo.ok && <span style={{ color: color.mut, fontSize: font.sm }}>{listo.motivo}</span>}
      </div>
    </SectionCard>
  )
}
