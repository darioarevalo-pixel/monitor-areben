'use client'

import { useMemo, useState } from 'react'
import { useCRM } from './useCRM'
import { BancoMensajes } from './BancoMensajes'
import { Leads } from './Leads'
import { ClienteModal } from './ClienteModal'
import { contarKpis, filtrarOrdenar, normalizeArgPhone, segmentoCliente } from '@/lib/crm/core'
import {
  aplicarSugerencias,
  parsearTelefonos,
  planSugerirCadencias,
  setDescartado,
  setMayorista,
  setPagina,
} from '@/lib/crm/seguimiento'
import type { ClienteCRM, MapaSeguimiento, Seguimiento } from '@/lib/crm/tipos'
import type { ModoCanal } from '@/lib/crm/datos'

/**
 * El CRM en Next. Port de la vista Clientes (index.html:1703-1801 + renderCRM/
 * renderCRMTabla) y de la ficha del cliente (abrirClienteModal).
 *
 * **Escribe `crm:seg` — el dato sin backup** (305 clientes, 274 ★, 39 notas). Cada
 * edición corre una transformación PURA de `lib/crm/seguimiento.ts` y persiste el
 * mapa entero con el flag `cargado`: si el KV no se pudo leer, ningún guardado
 * sale (evita el borrado en masa). Verificación en prod: el diff contra el dump
 * es exactamente el cliente tocado.
 */

const SEGMENTOS = [
  { v: 'todos', t: 'Todos' },
  { v: 'contactar', t: '📞 Para contactar' },
  { v: 'top', t: '⭐ Top clientes' },
  { v: 'activos', t: '🔥 Activos recurrentes' },
  { v: 'riesgo', t: '⚠️ En riesgo' },
  { v: 'dormidos', t: '🥶 Dormidos (90+ días)' },
  { v: 'nuevos', t: '🆕 Nuevos' },
  { v: 'sin-tel', t: '📵 Sin teléfono (cargar)' },
]

const SEG_LABEL: Record<string, string> = { activos: '🔥 Activo', riesgo: '⚠️ Riesgo', dormidos: '🥶 Dormido', nuevos: '🆕 Nuevo', otros: '·' }
const SEG_COLOR: Record<string, string> = { activos: '#16A34A', riesgo: '#D97706', dormidos: '#DC2626', nuevos: '#0EA5E9', otros: '#9CA3AF' }

const fmtMonto = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')
function fmtFecha(d: string | null): string {
  if (!d) return '—'
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'
}

function CeldaProximo({ c }: { c: ClienteCRM }) {
  if (c.seg_estado === 'none') return <span style={{ color: '#9CA3AF' }}>—</span>
  const cfg = {
    pendiente: { txt: 'A contactar', col: '#DC2626', bg: '#FEE2E2', dot: '🔴' },
    vencido: { txt: 'Vencido', col: '#DC2626', bg: '#FEE2E2', dot: '🔴' },
    semana: { txt: 'Esta semana', col: '#B45309', bg: '#FEF3C7', dot: '🟡' },
    aldia: { txt: 'Al día', col: '#15803D', bg: '#DCFCE7', dot: '🟢' },
  }[c.seg_estado]
  let sub: string
  if (c.seg_estado === 'pendiente') sub = 'Sin primer contacto'
  else {
    const d = c.dias_proximo as number
    sub = `${fmtFecha(c.proximo_contacto)} · ${d === 0 ? 'hoy' : d < 0 ? `hace ${-d}d` : `en ${d}d`}`
  }
  return (
    <>
      <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 600, color: cfg.col, background: cfg.bg, padding: '1px 7px', borderRadius: 999 }}>
        {cfg.dot} {cfg.txt}
      </span>
      <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{sub}</div>
    </>
  )
}

type FilaProps = {
  c: ClienteCRM
  seg: Seguimiento
  verDescartados: boolean
  onAbrir: (id: number) => void
  onMayorista: (id: number, val: boolean) => void
  onDescartado: (id: number, val: boolean) => void
  onPagina: (id: number, val: string) => void
}

function Fila({ c, seg, verDescartados, onAbrir, onMayorista, onDescartado, onPagina }: FilaProps) {
  const segm = segmentoCliente(c)
  const esMayorista = !!seg.es_mayorista
  const waPhone = normalizeArgPhone(c.phone)
  const ciudad = [c.city, c.province].filter(Boolean).join(', ')
  const ult = c.dias_ultimo === null ? '—' : c.dias_ultimo === 0 ? 'hoy' : `hace ${c.dias_ultimo}d`
  const notas = Array.isArray(c.notas) ? c.notas : []
  const ultNota = notas.length ? notas.slice().sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))[0] : null

  return (
    <tr style={{ cursor: 'pointer' }} onClick={() => onAbrir(c.id)}>
      <td>
        <div style={{ fontWeight: 600 }}>
          {c.name}
          {esMayorista && (
            <span style={{ fontSize: 9, fontWeight: 700, color: '#7C3AED', background: '#F3E8FF', padding: '1px 6px', borderRadius: 10, verticalAlign: 'middle', marginLeft: 4 }}>MAYORISTA</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: '#9CA3AF' }}>#{c.id}</div>
      </td>
      <td onClick={(e) => e.stopPropagation()}>
        {c.email && <div style={{ fontSize: 12 }}>{c.email}</div>}
        {c.phone && <div style={{ fontSize: 11, color: '#6B7280' }}>{c.phone}</div>}
        {!waPhone && <div style={{ fontSize: 10, color: '#DC2626', fontWeight: 600, marginTop: 2 }}>📵 Sin teléfono</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
          <span style={{ fontSize: 12, lineHeight: 1 }}>📷</span>
          <input
            type="text"
            defaultValue={seg.pagina || ''}
            placeholder="@instagram"
            onBlur={(e) => { if (e.target.value.trim() !== (seg.pagina || '')) onPagina(c.id, e.target.value) }}
            style={{ fontSize: 11, width: 120, padding: '2px 6px' }}
          />
        </div>
      </td>
      <td>{ciudad || <span style={{ color: '#9CA3AF' }}>—</span>}</td>
      <td style={{ textAlign: 'right' }}>{c.total_sales}</td>
      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtMonto(c.total_amount)}</td>
      <td style={{ textAlign: 'right' }}>{fmtMonto(c.avg_ticket)}</td>
      <td style={{ textAlign: 'right' }}>
        <div>{ult}</div>
        <div style={{ fontSize: 11, color: '#9CA3AF' }}>{fmtFecha(c.last_sale)}</div>
      </td>
      <td><CeldaProximo c={c} /></td>
      <td style={{ maxWidth: 240 }}>
        {ultNota ? (
          <>
            <div style={{ fontSize: 11, color: '#9CA3AF' }}>{fmtFecha(ultNota.fecha)}</div>
            <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ultNota.texto}</div>
          </>
        ) : (
          <span style={{ color: '#9CA3AF' }}>—</span>
        )}
      </td>
      <td>
        <span style={{ fontSize: 11, fontWeight: 600, color: SEG_COLOR[segm] }}>{SEG_LABEL[segm]}</span>
      </td>
      <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
        <button onClick={() => onMayorista(c.id, !esMayorista)} title={esMayorista ? 'Quitar de mayoristas' : 'Marcar como cliente mayorista'} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 17, lineHeight: 1, verticalAlign: 'middle', color: esMayorista ? '#F59E0B' : '#D1D5DB' }}>★</button>
        {waPhone && (
          <a href={`https://web.whatsapp.com/send?phone=${waPhone}`} target="_blank" rel="noopener" className="btn-sm" title="Abrir WhatsApp" style={{ textDecoration: 'none', color: '#16A34A' }}>💬</a>
        )}
        {verDescartados ? (
          <button onClick={() => onDescartado(c.id, false)} title="Reactivar — vuelve al CRM" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, lineHeight: 1, verticalAlign: 'middle' }}>↩️</button>
        ) : (
          <button onClick={() => onDescartado(c.id, true)} title="Ya no se dedica — sacar del CRM (reversible)" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, lineHeight: 1, verticalAlign: 'middle', color: '#D1D5DB' }}>🚫</button>
        )}
      </td>
    </tr>
  )
}

export function CRM() {
  const [modo, setModo] = useState<ModoCanal>('10')
  const [q, setQ] = useState('')
  const [seg, setSeg] = useState('todos')
  const [verDescartados, setVerDescartados] = useState(false)
  const [sort, setSort] = useState({ col: 'total_amount', dir: -1 })
  const [banco, setBanco] = useState(false)
  const [vista, setVista] = useState<'clientes' | 'leads'>('clientes')
  const [modalId, setModalId] = useState<number | null>(null)
  const { cargando, error, agregado, crmSeg, crmTelOverride, cargado, recargar, guardarSeg, guardarTel } = useCRM(modo)

  const kpis = useMemo(() => contarKpis(agregado.activos), [agregado])
  const lista = useMemo(
    () => filtrarOrdenar(verDescartados ? agregado.descartados : agregado.activos, { q: q.trim().toLowerCase(), seg: verDescartados ? 'todos' : seg, sort }),
    [agregado, q, seg, sort, verDescartados],
  )

  const ordenarPor = (col: string) => setSort((s) => (s.col === col ? { col, dir: -s.dir } : { col, dir: -1 }))

  // Cada edición: transformación pura → persiste el mapa entero (gateado por cargado).
  const mutar = (fn: (s: MapaSeguimiento) => MapaSeguimiento) => guardarSeg(fn(crmSeg))
  const onMayorista = async (id: number, val: boolean) => {
    await guardarSeg(setMayorista(crmSeg, id, val))
    // En vista Mayorista, marcar/desmarcar cambia qué ventas hay que tener: refetch.
    if (modo === '10') recargar()
  }
  const onDescartado = (id: number, val: boolean) => mutar((s) => setDescartado(s, id, val))
  const onPagina = (id: number, val: string) => mutar((s) => setPagina(s, id, val))

  const sugerirCadencias = async () => {
    const { plan, omitidos, nSem, nMen } = planSugerirCadencias(agregado.activos, crmSeg)
    if (!plan.length) { alert('No había clientes nuevos para sugerir (ya tienen un recontacto programado).'); return }
    if (!confirm(`Se va a programar el recontacto de ${plan.length} clientes:\n• ${nSem} mejores por monto → cada semana\n• ${nMen} activos recurrentes → cada mes\n\nNo se tocan los ${omitidos} que ya tenían uno. ¿Confirmás?`)) return
    if (await guardarSeg(aplicarSugerencias(crmSeg, plan))) {
      alert(`✅ Listo. Recontacto programado para ${plan.length} clientes. Ajustá los que quieras desde la ficha de cada cliente.`)
    }
  }

  const cargarTelefonos = async (file: File | undefined) => {
    if (!file) return
    if (!agregado.activos.length) { alert('Primero esperá a que cargue la lista de clientes.'); return }
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as unknown[][]
      const idsCRM = new Set(agregado.activos.map((c) => String(c.id)))
      const res = parsearTelefonos(aoa, idsCRM, normalizeArgPhone)
      if (!res.ok) { alert(res.motivo); return }
      // El merge acumula sobre lo ya cargado (crmTelOverride es el único mapa sin
      // otra copia); guardarTel exige `cargado`, así un GET fallido no lo vacía.
      if (await guardarTel({ ...crmTelOverride, ...res.map })) {
        alert(`✅ Listo. Se vincularon ${res.vinculados} teléfonos a clientes del CRM (match por ID). Los botones de WhatsApp ya funcionan.`)
      }
    } catch (err) {
      alert('No pude leer el Excel: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const tarjetas = [
    { key: 'contactar', label: '📞 Para contactar', n: kpis.contactar },
    { key: 'top', label: '⭐ Top clientes', n: kpis.top },
    { key: 'activos', label: '🔥 Activos', n: kpis.activos },
    { key: 'riesgo', label: '⚠️ En riesgo', n: kpis.riesgo },
    { key: 'dormidos', label: '🥶 Dormidos', n: kpis.dormidos },
    { key: 'nuevos', label: '🆕 Nuevos', n: kpis.nuevos },
    { key: 'sin-tel', label: '📵 Sin teléfono', n: kpis.sinTel },
  ]

  const clienteModal = modalId != null ? [...agregado.activos, ...agregado.descartados].find((c) => c.id === modalId) : null

  return (
    <div className="section visible">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12, color: '#6B7280' }}>Canal:</label>
            <select value={modo} onChange={(e) => setModo(e.target.value as ModoCanal)}>
              <option value="10">Mayorista</option>
              <option value="all">Todos los canales</option>
            </select>
            <button className="btn-sm" onClick={recargar}>Recalcular</button>
            <label className="btn-sm" style={{ cursor: cargado ? 'pointer' : 'not-allowed', opacity: cargado ? 1 : 0.5 }} title={cargado ? 'Importar teléfonos del export de clientes de GN' : 'El KV no se pudo leer: guardado bloqueado'}>
              📱 Cargar teléfonos
              <input type="file" accept=".xlsx,.xls,.csv" disabled={!cargado} onChange={(e) => { cargarTelefonos(e.target.files?.[0]); e.target.value = '' }} style={{ display: 'none' }} />
            </label>
            <button className="btn-sm" onClick={sugerirCadencias} disabled={!cargado} title={cargado ? 'Asigna cadencia automática por segmento' : 'El KV no se pudo leer: guardado bloqueado'}>🗓️ Sugerir cadencias</button>
            <button className="btn-sm" onClick={() => setBanco(true)}>💬 Banco de mensajes</button>
          </div>
        </div>

        <div style={{ background: '#EFF6FF', border: '1px solid #BAE6FD', borderRadius: 8, padding: '7px 11px', marginBottom: 14, fontSize: 12, color: '#075985' }}>
          👀 Versión nueva. Los números tienen que dar igual que en la de siempre. Tocá un cliente para abrir su ficha y editar el seguimiento.
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #E5E7EB' }}>
          {(['clientes', 'leads'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              style={{ padding: '9px 16px', background: 'none', border: 'none', borderBottom: vista === v ? '2px solid #2563EB' : '2px solid transparent', color: vista === v ? '#111827' : '#6B7280', fontWeight: vista === v ? 700 : 500 }}
            >
              {v === 'clientes' ? 'Clientes' : 'Leads'}
            </button>
          ))}
        </div>

        {vista === 'leads' ? (
          <Leads />
        ) : (
          <>
            {error && (
              <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 8, padding: '7px 11px', marginBottom: 14, fontSize: 12, color: '#991B1B' }}>⚠️ {error}</div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginBottom: 16 }}>
              {tarjetas.map((t) => (
                <div className="stat" key={t.key} style={{ cursor: 'pointer' }} onClick={() => { setVerDescartados(false); setSeg(t.key) }}>
                  <div className="stat-label">{t.label}</div>
                  <div className="stat-value">{t.n}</div>
                </div>
              ))}
            </div>

            <div className="toolbar">
              <input type="text" placeholder="Buscar nombre, email o teléfono..." value={q} onChange={(e) => setQ(e.target.value)} />
              <select value={seg} onChange={(e) => setSeg(e.target.value)} disabled={verDescartados}>
                {SEGMENTOS.map((s) => (
                  <option value={s.v} key={s.v}>{s.t}</option>
                ))}
              </select>
              <label style={{ fontSize: 12, color: '#6B7280', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={verDescartados} onChange={(e) => setVerDescartados(e.target.checked)} />
                Ver descartados
              </label>
              <span style={{ fontSize: 12, color: '#9CA3AF', marginLeft: 'auto' }}>{lista.length} cliente{lista.length === 1 ? '' : 's'}</span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th onClick={() => ordenarPor('name')}>Cliente ↕</th>
                    <th onClick={() => ordenarPor('contact')}>Contacto</th>
                    <th onClick={() => ordenarPor('city')}>Ciudad</th>
                    <th onClick={() => ordenarPor('total_sales')} style={{ textAlign: 'right' }}>Pedidos ↕</th>
                    <th onClick={() => ordenarPor('total_amount')} style={{ textAlign: 'right' }}>Total comprado ↕</th>
                    <th onClick={() => ordenarPor('avg_ticket')} style={{ textAlign: 'right' }}>Ticket prom. ↕</th>
                    <th onClick={() => ordenarPor('last_sale')} style={{ textAlign: 'right' }}>Último pedido ↕</th>
                    <th onClick={() => ordenarPor('proximo')}>Próximo contacto ↕</th>
                    <th>Última nota</th>
                    <th>Segmento</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {cargando ? (
                    <tr><td colSpan={11} style={{ textAlign: 'center', padding: 24, color: '#9CA3AF' }}>Cargando…</td></tr>
                  ) : !lista.length ? (
                    <tr><td colSpan={11} style={{ textAlign: 'center', padding: 24, color: '#9CA3AF' }}>Sin clientes para este filtro</td></tr>
                  ) : (
                    lista.map((c) => (
                      <Fila key={c.id} c={c} seg={crmSeg[String(c.id)] || {}} verDescartados={verDescartados} onAbrir={setModalId} onMayorista={onMayorista} onDescartado={onDescartado} onPagina={onPagina} />
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {!cargado && !cargando && (
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 8 }}>El KV no se pudo leer: los guardados están bloqueados.</div>
            )}
          </>
        )}
      </div>

      {clienteModal && <ClienteModal key={clienteModal.id} cliente={clienteModal} crmSeg={crmSeg} mutar={mutar} onCerrar={() => setModalId(null)} />}
      {banco && <BancoMensajes onCerrar={() => setBanco(false)} />}
    </div>
  )
}
