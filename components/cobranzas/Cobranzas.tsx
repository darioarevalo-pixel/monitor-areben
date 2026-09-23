'use client'

/**
 * Cobranzas (key `cobranzas`, área Administración).
 *
 * Las compras de Tienda Nube con pago MANUAL —transferencia a la cuenta de la empresa, efectivo al
 * retirar— que Pago Nube no concilia solo. Se registra el cobro acá; el «pagado» de TN lo aprieta
 * una persona en el admin, porque TN ⛔ deja hacerlo por API. El estado de cada fila lo decide el
 * servidor (`lib/cobranzas/core.core.js`) cruzando las dos cosas.
 *
 * Pestañas: Pendientes (falta cobrar) · Falta marcar en TN (cobrada acá, TN todavía `pending`) ·
 * Revisar (cobrada y la orden se canceló: hay plata de una compra que ya no existe) · Cerradas.
 */

import { useMemo, useRef, useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { puedeSub } from '@/lib/permisos'
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  Notice,
  SectionCard,
  Select,
  TableWrap,
  Tabs,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  formatMoney,
  space,
  useConfirmar,
  useToast,
} from '@/components/ui'
import { anularCobro, cobrar, linkAdminTn, reintentarNota } from '@/lib/cobranzas/cliente'
import { diasDesde, type EstadoCobro, type FilaCobranza, type Medio, type NotaTn } from '@/lib/cobranzas/tipos'
import { useCobranzas } from './useCobranzas'

const PESTANAS: { key: EstadoCobro; label: string; vacio: string }[] = [
  { key: 'pendiente', label: 'Pendientes', vacio: 'No hay compras con pago manual esperando el cobro.' },
  { key: 'falta-tn', label: 'Falta marcar en TN', vacio: 'No hay compras cobradas esperando que las marquen pagadas en Tienda Nube.' },
  { key: 'revisar', label: 'Revisar', vacio: 'No hay compras canceladas con un cobro registrado.' },
  { key: 'cerrado', label: 'Cerradas', vacio: 'No hay compras con pago manual cerradas en este período.' },
]

const TEXTO_NOTA: Record<NotaTn, string | null> = {
  ok: null,
  pendiente: 'Nota en TN sin escribir',
  'sin-verificar': 'Nota en TN sin verificar',
  'sin-permiso': 'La app de TN no puede escribir la nota',
  error: 'No se pudo escribir la nota en TN',
}

function fechaCorta(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(iso))
}

function nuevoIdem(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export function Cobranzas() {
  const { marca, perfil } = useSesion()
  const { r, cargando, recargando, error, recargar } = useCobranzas(marca)
  const [pestana, setPestana] = useState<EstadoCobro>('pendiente')
  const [cobrando, setCobrando] = useState<FilaCobranza | null>(null)
  const { confirmar } = useConfirmar()
  const toast = useToast()
  // El servidor lo dice en la respuesta; mientras tanto se usa el perfil para no mostrar un botón
  // que después rebota. El servidor igual lo vuelve a chequear.
  const puedeCobrar = r ? r.puedeCobrar : puedeSub(perfil, marca, 'cobranzas', 'cobrar')

  const filas = useMemo(() => (r ? r.filas.filter((f) => f.estado === pestana) : []), [r, pestana])
  const pest = PESTANAS.find((p) => p.key === pestana)!

  async function anular(f: FilaCobranza) {
    if (!f.cobro) return
    const ok = await confirmar({
      titulo: `¿Anular el cobro del pedido #${f.orden.number}?`,
      mensaje: `El pedido vuelve a Pendientes. El cobro queda registrado como anulado, con quién y cuándo.`,
      ok: 'Anular el cobro',
      tono: 'danger',
    })
    if (!ok) return
    try {
      await anularCobro(marca, f.cobro.id)
      toast.ok(`Cobro del pedido #${f.orden.number} anulado.`)
      recargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo anular el cobro.')
    }
  }

  async function reintentar(f: FilaCobranza) {
    if (!f.cobro) return
    try {
      const nota = await reintentarNota(marca, f.cobro.id)
      if (nota === 'ok') toast.ok('Nota escrita en Tienda Nube.')
      else toast.error(TEXTO_NOTA[nota] || 'No se pudo escribir la nota.')
      recargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo escribir la nota.')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <SectionCard
        title="Cobranzas"
        subtitle={r ? `Compras con pago manual en Tienda Nube desde el ${r.desde.split('-').reverse().join('/')}.` : 'Compras con pago manual en Tienda Nube.'}
        actions={
          <Button size="sm" variant="outline" onClick={recargar} loading={recargando}>
            Actualizar
          </Button>
        }
      >
        <Tabs
          value={pestana}
          onChange={(k) => setPestana(k as EstadoCobro)}
          items={PESTANAS.map((p) => ({ key: p.key, label: p.label, badge: r ? r.cuenta[p.key] : undefined }))}
        />
      </SectionCard>

      {error && <Notice tone="danger">{error}</Notice>}
      {pestana === 'falta-tn' && filas.length > 0 && (
        <Notice tone="warning">
          Tienda Nube no deja marcar «pagado» desde el Monitor. Abrí cada pedido y apretá «Marcar como pagado» allá: al
          actualizar, pasa solo a Cerradas.
        </Notice>
      )}
      {pestana === 'revisar' && filas.length > 0 && (
        <Notice tone="danger">
          Estos pedidos se cancelaron en Tienda Nube y tienen un cobro registrado: hay que devolver la plata o reabrir el
          pedido, y después anular el cobro.
        </Notice>
      )}

      {cargando ? (
        <EmptyState title="Buscando las compras con pago manual…" />
      ) : !r ? null : filas.length === 0 ? (
        <EmptyState title={pest.vacio} dashed />
      ) : (
        <TableWrap>
          <THead>
            <Tr>
              <Th>Pedido</Th>
              <Th>Fecha</Th>
              <Th>Clienta</Th>
              <Th align="right">Total</Th>
              <Th>Cobro</Th>
              <Th align="right"> </Th>
            </Tr>
          </THead>
          <TBody>
            {filas.map((f) => {
              const dias = diasDesde(f.orden.fecha)
              const link = linkAdminTn(marca, f.orden.id)
              const aviso = f.cobro ? TEXTO_NOTA[f.cobro.nota_tn] : null
              return (
                <Tr key={f.orden.id}>
                  <Td mono strong>
                    {link ? (
                      <a href={link} target="_blank" rel="noreferrer">
                        #{f.orden.number}
                      </a>
                    ) : (
                      `#${f.orden.number}`
                    )}
                  </Td>
                  <Td>
                    {fechaCorta(f.orden.fecha)}
                    {f.estado === 'pendiente' && dias != null && dias >= 2 && (
                      <Badge tone={dias >= 5 ? 'danger' : 'warning'} style={{ marginLeft: space[2] }}>
                        hace {dias} días
                      </Badge>
                    )}
                  </Td>
                  <Td wrap>{f.orden.cliente || '—'}</Td>
                  <Td align="right" mono>
                    {formatMoney(Number(f.orden.total) || 0)}
                  </Td>
                  <Td wrap>
                    {f.cobro ? (
                      <>
                        {f.cobro.medio} {formatMoney(Number(f.cobro.monto))} · {f.cobro.quien || '?'} · {fechaCorta(f.cobro.cuando)}
                        {f.cobro.operacion ? ` · op ${f.cobro.operacion}` : ''}
                        {aviso && (
                          <div>
                            <Badge tone="warning">{aviso}</Badge>
                          </div>
                        )}
                      </>
                    ) : f.sinCobro ? (
                      <Badge tone="neutral">Marcada pagada en TN, sin cobro en el Monitor</Badge>
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td align="right">
                    <div style={{ display: 'flex', gap: space[2], justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      {puedeCobrar && f.estado === 'pendiente' && (
                        <Button size="sm" onClick={() => setCobrando(f)}>
                          Registrar cobro
                        </Button>
                      )}
                      {f.estado === 'falta-tn' && link && (
                        <Button size="sm" variant="outline" onClick={() => window.open(link, '_blank', 'noreferrer')}>
                          Abrir en TN
                        </Button>
                      )}
                      {puedeCobrar && f.cobro && aviso && f.cobro.nota_tn !== 'sin-permiso' && (
                        <Button size="sm" variant="ghost" onClick={() => void reintentar(f)}>
                          Reintentar nota
                        </Button>
                      )}
                      {puedeCobrar && f.cobro && f.estado !== 'cerrado' && (
                        <Button size="sm" variant="ghost" tone="danger" onClick={() => void anular(f)}>
                          Anular
                        </Button>
                      )}
                    </div>
                  </Td>
                </Tr>
              )
            })}
          </TBody>
        </TableWrap>
      )}

      {cobrando && (
        <ModalCobro
          fila={cobrando}
          onCerrar={() => setCobrando(null)}
          onCobrado={(numero) => {
            setCobrando(null)
            toast.ok(`Cobro del pedido #${numero} registrado. Falta marcarlo pagado en Tienda Nube.`)
            recargar()
          }}
        />
      )}
    </div>
  )
}

function ModalCobro({
  fila,
  onCerrar,
  onCobrado,
}: {
  fila: FilaCobranza
  onCerrar: () => void
  onCobrado: (numero: number) => void
}) {
  const { marca } = useSesion()
  const toast = useToast()
  const [medio, setMedio] = useState<Medio>('transferencia')
  const [monto, setMonto] = useState(String(Math.round(Number(fila.orden.total) || 0)))
  const [operacion, setOperacion] = useState('')
  const [guardando, setGuardando] = useState(false)
  // 🔑 Uno por apertura del formulario: el doble click manda el MISMO y el servidor devuelve el primero.
  const idem = useRef(nuevoIdem()).current
  const montoNum = Number(monto)
  const valido = Number.isFinite(montoNum) && montoNum > 0

  async function guardar() {
    if (!valido || guardando) return
    setGuardando(true)
    try {
      await cobrar(marca, fila.orden, { medio, monto: montoNum, operacion }, idem)
      onCobrado(fila.orden.number)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo registrar el cobro.')
      setGuardando(false)
    }
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`Registrar cobro · pedido #${fila.orden.number}`}
      pie={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={() => void guardar()} loading={guardando} disabled={!valido}>
            Registrar cobro
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
        <div>
          {fila.orden.cliente || 'Sin nombre'} · total del pedido {formatMoney(Number(fila.orden.total) || 0)}
        </div>
        <Field label="Cómo pagó">
          <Select value={medio} onChange={(e) => setMedio(e.target.value as Medio)}>
            <option value="transferencia">Transferencia a la cuenta de la empresa</option>
            <option value="efectivo">Efectivo</option>
          </Select>
        </Field>
        <Field label="Monto cobrado" error={valido ? undefined : 'Tiene que ser mayor a cero.'}>
          <Input type="number" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} />
        </Field>
        <Field label="N.º de operación o comprobante" hint="Opcional. Queda en la nota del pedido en Tienda Nube.">
          <Input value={operacion} maxLength={80} onChange={(e) => setOperacion(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
