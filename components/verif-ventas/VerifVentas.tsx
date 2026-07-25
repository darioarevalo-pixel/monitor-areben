'use client'

import { useState } from 'react'
import { useSesion } from '@/components/SesionProvider'
import { guardarResueltas, leerResueltas } from '@/lib/kv/cliente'
import { mesDe, particionar, rango } from '@/lib/verif-ventas/core'
import { verificarVentas } from '@/lib/verif-ventas/cliente'
import type { Discrepancia, ResueltaEntry, Resueltas, VvtaData } from '@/lib/verif-ventas/tipos'
import { HeaderAcciones } from '@/components/layout/acciones'
import {
  Button,
  EmptyState,
  Esqueleto,
  KpiCard,
  Notice,
  TBody,
  THead,
  TableWrap,
  Td,
  Th,
  Tr,
  color,
  font,
  space,
  useToast,
} from '@/components/ui'

const hoyISO = () => new Date().toISOString().slice(0, 10)
const money = (n?: number) => (n == null ? '—' : '$' + Math.round(+n).toLocaleString('es-AR'))

/**
 * Verificación de ventas: pedidos cancelados en TiendaNube que siguen activos en Gestión
 * Nube. GN no deja anular por API, así que la sección es un checklist: se anula a mano en
 * GN y se tilda acá (el tilde vive en el KV de la marca).
 *
 * Rediseño jul-2026 (patrón Listado): el mes y Verificar van al header; los tres números
 * del resumen eran cajitas de texto y pasan a KpiCard con tono (el "a revisar" en rojo
 * solo si hay algo que revisar); los `alert()` de error al guardar el tilde pasan a Toast
 * —eran los únicos avisos de que el checklist no se estaba guardando—; y la espera larga
 * (consulta a dos APIs) muestra el esqueleto de la tabla en vez de un texto gris.
 */
export function VerifVentas() {
  const { marca, perfil } = useSesion()
  const toast = useToast()
  const [mes, setMes] = useState(() => mesDe(new Date()))
  const [data, setData] = useState<VvtaData | null>(null)
  const [resueltas, setResueltas] = useState<Resueltas>({})
  const [cargado, setCargado] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [verResueltas, setVerResueltas] = useState(false)

  const verificar = async () => {
    setCargando(true)
    setData(null)
    const { from, to } = rango(mes)
    const [rv, rk] = await Promise.all([verificarVentas(marca, from, to), leerResueltas<ResueltaEntry>(marca)])
    setData(rv || { error: 'Sin respuesta' })
    if (rk.ok) {
      setResueltas(rk.dato)
      setCargado(true)
    } else {
      setResueltas({})
      setCargado(false)
    }
    setCargando(false)
  }

  const marcar = async (tnOrder: string, checked: boolean) => {
    const next: Resueltas = { ...resueltas }
    if (checked) next[tnOrder] = { resuelto: true, por: perfil?.name || '', fecha: hoyISO(), mes }
    else delete next[tnOrder]
    setResueltas(next)
    if (!cargado) {
      toast.error('No se pudo leer el checklist, así que el tilde no se guarda (guardar ahora lo borraría). Verificá de nuevo.')
      return
    }
    const r = await guardarResueltas({ store: marca, resueltas: next, cargado: true })
    if (!r.ok) toast.error('No se pudo guardar el tilde: ' + r.motivo)
  }

  const r = data?.resumen || {}
  const disc = data?.discrepancias || []
  const { pend, res } = particionar(disc, resueltas)
  const scope403 = data?.tn_debug?.status === 403

  return (
    <>
      <HeaderAcciones>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: font.sm, color: color.mut }}>
          Mes
          <input className="mo-input" type="month" value={mes} onChange={(e) => setMes(e.target.value)} style={{ width: 150 }} />
        </label>
        <Button variant="solid" tone="brand" onClick={() => void verificar()} loading={cargando}>
          {cargando ? 'Verificando…' : 'Verificar'}
        </Button>
      </HeaderAcciones>

      {cargando ? (
        <>
          <Notice tone="neutral" icon="⏳" style={{ marginBottom: space[3] }}>
            Consultando TiendaNube y Gestión Nube… puede tardar unos segundos.
          </Notice>
          <Esqueleto forma="tabla" filas={6} />
        </>
      ) : !data ? (
        <EmptyState icon="🔍" title="Elegí el mes y tocá Verificar" hint="Se comparan los pedidos cancelados en TiendaNube contra las ventas activas en Gestión Nube." dashed />
      ) : scope403 ? (
        <Notice tone="warning" icon="⚠">
          TiendaNube todavía no nos deja leer los pedidos: falta habilitar el permiso <b>read_orders</b> en la app de TiendaNube (y regenerar el token). Cuando esté, esto funciona solo.
        </Notice>
      ) : data.error ? (
        <Notice tone="danger" icon="⚠">
          {data.error}
        </Notice>
      ) : (
        <>
          <div className="mo-kpis">
            <KpiCard label="Cancelados en TN" value={r.tn_cancelados ?? 0} />
            <KpiCard
              label="A revisar (activas en GN)"
              value={pend.length}
              tone={pend.length ? 'danger' : 'success'}
              sub={pend.length ? 'Hay que anularlas a mano en GN' : 'No queda ninguna'}
            />
            {res.length > 0 && <KpiCard label="Resueltas" value={res.length} />}
          </div>

          {!disc.length ? (
            <EmptyState icon="✅" title="No hay nada que revisar en este mes" hint="Ninguna venta activa en GN está cancelada en TiendaNube." dashed />
          ) : (
            <>
              <Notice tone="warning" icon="!" style={{ marginBottom: space[3] }}>
                GN no permite anular por API: anulá la venta en <b>Gestión Nube</b> a mano y después tildala acá.
              </Notice>

              {pend.length ? (
                <Tabla filas={pend} resueltas={resueltas} onMarcar={marcar} />
              ) : (
                <EmptyState icon="✅" title="Todas las de este mes ya están resueltas" dashed />
              )}

              {res.length > 0 && (
                <div style={{ marginTop: space[4] }}>
                  <Button size="sm" variant="outline" onClick={() => setVerResueltas((v) => !v)}>
                    {verResueltas ? 'Ocultar' : 'Ver'} resueltas ({res.length})
                  </Button>
                  {verResueltas && (
                    <div style={{ marginTop: space[2] }}>
                      <Tabla filas={res} resueltas={resueltas} onMarcar={marcar} />
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </>
  )
}

function Tabla({ filas, resueltas, onMarcar }: { filas: Discrepancia[]; resueltas: Resueltas; onMarcar: (id: string, v: boolean) => void }) {
  return (
    <TableWrap maxHeight={560}>
      <THead>
        <Tr>
          <Th width={44}>✔</Th>
          <Th>Pedido TN</Th>
          <Th>Venta GN</Th>
          <Th>Fecha</Th>
          <Th>Cliente</Th>
          <Th align="right">Monto</Th>
        </Tr>
      </THead>
      <TBody>
        {filas.map((d) => {
          const ok = !!resueltas[String(d.tn_order)]
          return (
            <Tr key={String(d.tn_order)} style={ok ? { opacity: 0.55 } : undefined}>
              <Td>
                <input
                  type="checkbox"
                  checked={ok}
                  onChange={(e) => void onMarcar(String(d.tn_order), e.target.checked)}
                  title="Marcar como ya anulada en GN"
                  aria-label={`Marcar el pedido ${d.tn_order} como anulado en GN`}
                  style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--mo-brand-solid)' }}
                />
              </Td>
              <Td strong>#{String(d.tn_order)}</Td>
              <Td>{String(d.gn_number || d.gn_id || '—')}</Td>
              <Td>{d.date_sale || '—'}</Td>
              <Td wrap>{d.client_name || '—'}</Td>
              <Td align="right">{money(d.total_price)}</Td>
            </Tr>
          )
        })}
      </TBody>
    </TableWrap>
  )
}
